import { describe, expect, it } from "vitest";
import { buildClauses, buildContractSnapshot, CONTRACT_DISCLAIMER, issuerIncomplete, renderContractHtml, resolveIssuer, type BuildInput } from "./contract.js";
import { DEFAULT_WITHDRAWAL_POLICY } from "./withdrawalPolicy.js";

const issuer = { name: "PT Studiodo Contoh", address: "Jl. Contoh 1, Bandung", contact: "halo@studiodo.id" };
const plan = { slug: "pro", name: "PRO", price: "100000", billingInterval: "monthly", discountPercent: 0, yearlyDiscountPercent: 20, features: ["Galeri"], kioskLimit: null };
const base = (over: Partial<BuildInput["lead"]> = {}, rest: Partial<BuildInput> = {}): BuildInput => ({
  lead: { id: "11111111-2222-3333-4444-555555555555", businessName: "Fotosut", ownerName: "Dika", ownerEmail: "d@x.com", ownerWhatsapp: "08777737 3108", city: "Bandung", boothCount: 2, boothLocation: "Mall A", plannedStart: "Minggu kedua Desember", paymentSetup: "platform", contractMonths: 6, ...over },
  plan, tiers: [{ minBooths: 10, percent: 10 }], settings: { qrisFeePercent: 0.7, withdrawalMinAmount: 50000, withdrawalFlatFee: 2500, defaultTrialDays: 7, gracePeriodDays: 3 },
  policy: { ...DEFAULT_WITHDRAWAL_POLICY, mode: "window", days: [1, 2, 3, 4, 5], fromTime: "09:00", toTime: "16:00", holdDays: 2, approvalThreshold: 5_000_000 },
  issuer, now: new Date("2026-11-05T05:00:00Z"), ...rest,
});
const build = (input: BuildInput) => { const r = buildContractSnapshot(input); if ("error" in r) throw new Error(r.error); return r.snapshot; };

describe("contract snapshot", () => {
  it("prices booths × months from the plan and freezes the numbers", () => {
    const s = build(base());
    expect(s.perPeriodTotal).toBe(200_000);
    expect(s.periods).toBe(6);
    expect(s.contractTotal).toBe(1_200_000);
    expect(s.number).toBe("STD/KS/202611/111111");
  });
  it("applies the volume discount and bills whole years yearly when the plan has a yearly price", () => {
    const monthly = build(base({ boothCount: 10 }));
    expect(monthly.discountPercent).toBe(10);
    expect(monthly.unitFinal).toBe(90_000);
    const yearly = build(base({ contractMonths: 24 }));
    expect(yearly.plan.interval).toBe("yearly");
    expect(yearly.periods).toBe(2);
    expect(yearly.contractTotal).toBe(yearly.perPeriodTotal * 2);
  });
  it("carries the withdrawal policy and fee into the terms", () => {
    const s = build(base());
    expect(s.payout).toMatchObject({ feePercent: 0.7, minAmount: 50000, flatFee: 2500, holdDays: 2, approvalThreshold: 5_000_000 });
    expect(s.payout.schedule).toContain("09:00");
  });
  it("refuses to build without plan, booth count, or term — and over a plan's booth limit", () => {
    expect(buildContractSnapshot(base({}, { plan: null }))).toEqual({ error: "Pilih paket langganan dulu" });
    expect(buildContractSnapshot(base({ boothCount: null }))).toHaveProperty("error");
    expect(buildContractSnapshot(base({ contractMonths: null }))).toHaveProperty("error");
    expect(buildContractSnapshot(base({ boothCount: 5 }, { plan: { ...plan, kioskLimit: 3 } }))).toHaveProperty("error");
  });
  it("keeps the earlier contract number when regenerated", () => {
    expect(build(base({}, { number: "STD/KS/202610/ABCDEF" })).number).toBe("STD/KS/202610/ABCDEF");
  });
  it("warns about missing issuer data and an unchosen payment setup", () => {
    const s = build(base({ paymentSetup: null }, { issuer: resolveIssuer(null, {} as NodeJS.ProcessEnv) }));
    expect(s.warnings.join(" ")).toMatch(/Nama badan usaha/);
    expect(s.warnings.join(" ")).toMatch(/Pengaturan pembayaran/);
    expect(issuerIncomplete(s.issuer)).toBe(true);
    expect(issuerIncomplete(issuer)).toBe(false);
  });
  it("issuer: stored values win over env, env over placeholders", () => {
    const i = resolveIssuer({ name: "A" }, { CONTRACT_ISSUER_ADDRESS: "Alamat env" } as unknown as NodeJS.ProcessEnv);
    expect(i.name).toBe("A");
    expect(i.address).toBe("Alamat env");
    expect(i.contact.startsWith("[")).toBe(true);
  });
});

describe("contract clauses and page", () => {
  it("platform-settled terms spell out the fee, minimum, schedule, hold and the two-person approval", () => {
    const text = buildClauses(build(base())).flatMap((c) => c.items).join("\n");
    expect(text).toMatch(/0\.7%/);
    expect(text).toMatch(/Rp 50\.000/);
    expect(text).toMatch(/Rp 2\.500/);
    expect(text).toMatch(/ditahan 2 hari/);
    expect(text).toMatch(/persetujuan dua orang/);
  });
  it("own-gateway terms say STUDIODO does not hold the money", () => {
    const text = buildClauses(build(base({ paymentSetup: "own" }))).flatMap((c) => c.items).join("\n");
    expect(text).toMatch(/tidak menampung/);
    expect(text).not.toMatch(/buku saldo/);
  });
  it("covers usage, payment/withdrawal, cancellation, per-booth licence and privacy", () => {
    const titles = buildClauses(build(base())).map((c) => c.title).join("|");
    for (const word of ["Lisensi per booth", "penarikan saldo", "Penggunaan", "privasi", "pengakhiran"]) expect(titles.toLowerCase()).toContain(word.toLowerCase());
  });
  it("every rendered page carries the not-legal-advice draft banner", () => {
    for (const status of ["draft", "sent", "signed"] as const) expect(renderContractHtml(build(base()), { status })).toContain(CONTRACT_DISCLAIMER.slice(0, 20));
  });
  it("only a sent letter shows the approval form; signed shows who approved", () => {
    const s = build(base());
    expect(renderContractHtml(s, { status: "draft", signUrl: "/x" })).not.toContain("<form");
    expect(renderContractHtml(s, { status: "sent", signUrl: "/x/setuju" })).toContain('action="/x/setuju"');
    const signed = renderContractHtml(s, { status: "signed", signedName: "Dika <b>", signedAt: "2026-11-06T00:00:00Z" });
    expect(signed).not.toContain("<form");
    expect(signed).toContain("Dika &lt;b&gt;");
  });
  it("escapes customer-supplied text", () => {
    const s = build(base({ businessName: '<script>alert(1)</script>' }));
    const html = renderContractHtml(s, { status: "sent", signUrl: "/x" });
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain("&lt;script&gt;");
  });
});
