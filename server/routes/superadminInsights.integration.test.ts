import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Owner insights (health score, revenue/funnel, fleet, anomalies, search, morning summary) against real SQL (PGlite).
// Skips itself when PGlite is not installed.

const spec = process.env.PGLITE_MODULE ?? "@electric-sql/pglite";
let PGlite: (new () => { exec(sql: string): Promise<unknown>; query(sql: string): Promise<{ rows: Record<string, unknown>[] }> }) | null = null;
try {
  PGlite = ((await import(/* @vite-ignore */ spec)) as { PGlite: typeof PGlite }).PGlite;
} catch {
  PGlite = null;
}

const holder: { db?: unknown } = {};
vi.mock("../db/client.js", () => ({
  get db() { return holder.db; },
  client: { end: async () => undefined },
}));

const TA = "00000000-0000-0000-0000-0000000000a1"; // busy, one healthy paid booth + one offline trial about to end
const TB = "00000000-0000-0000-0000-0000000000a2"; // silent, expired, unanswered help message, big first payout
const OWNER = "00000000-0000-0000-0000-0000000000a9";

describe.skipIf(!PGlite)("owner insights (real SQL, real HTTP)", () => {
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let origin = "";
  let owner = "";
  let pg: InstanceType<NonNullable<typeof PGlite>>;
  const sent: { target: string; message: string }[] = [];
  const realFetch = globalThis.fetch;
  const adm = async (method: string, p: string, body?: unknown) => {
    const res = await realFetch(`${origin}/api/superadmin${p}`, { method, headers: { Authorization: `Bearer ${owner}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    try { json = JSON.parse(text); } catch { json = undefined; }
    return { status: res.status, json };
  };
  const settle = () => new Promise((r) => setTimeout(r, 150));

  beforeAll(async () => {
    process.env.JWT_SECRET = "integration-test-secret";
    pg = new PGlite!();
    const dir = path.resolve(__dirname, "../db/migrations");
    const journal = JSON.parse(fs.readFileSync(path.join(dir, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
    for (const { tag } of journal.entries) for (const stmt of fs.readFileSync(path.join(dir, `${tag}.sql`), "utf8").split("--> statement-breakpoint")) if (stmt.trim()) await pg.exec(stmt);
    const { drizzle } = await import("drizzle-orm/pglite");
    const schema = await import("../db/schema.js");
    holder.db = drizzle(pg as never, { schema });
    await pg.exec(`
      INSERT INTO platform_settings (default_trial_days, admin_wa_number) VALUES (7, '081200000000');
      INSERT INTO tenants (id, name, slug, owner_name, owner_whatsapp, city) VALUES
        ('${TA}', 'Rina Booth', 'rina', 'Rina', '081234567890', 'Bandung'),
        ('${TB}', 'Studio Sunyi', 'sunyi', 'Budi', '081111111111', 'Medan');
      INSERT INTO kiosk_keys (tenant_id, key_hash, label, license_type, license_ends_at, app_version, last_used_at, bound_device_id, last_diagnostics, trial_started_at, activated_at) VALUES
        ('${TA}', 'ka1', 'Booth Utama', 'paid', now() + interval '60 days', '0.1.30', now(), 'dev1', '{"cameraOk":true,"printerOk":true,"networkOk":true,"checkedAt":"x"}', NULL, now()),
        ('${TA}', 'ka2', 'Booth Cadangan', 'trial', now() + interval '3 days', '0.1.19', now() - interval '2 days', 'dev2', '{"cameraOk":false,"printerOk":true,"networkOk":true,"checkedAt":"x"}', now() - interval '4 days', now()),
        ('${TB}', 'kb1', 'Booth Sunyi', 'paid', now() - interval '2 days', '0.1.19', now() - interval '9 days', 'dev3', NULL, now() - interval '40 days', now());
      INSERT INTO sessions (tenant_id, kiosk_key_id, payment_status, created_at) SELECT '${TA}', (SELECT id FROM kiosk_keys WHERE key_hash = 'ka2'), 'success', now() - (g || ' hours')::interval FROM generate_series(1, 50) g;
      INSERT INTO billing_orders (order_id, tenant_id, plan_name, amount, period_days, status, paid_at) VALUES ('ord-1', '${TA}', 'Pro', 300000, 30, 'paid', now() - interval '10 days');
      INSERT INTO tenant_payments (tenant_id, amount, period_days, method) VALUES ('${TB}', 200000, 30, 'transfer');
      INSERT INTO support_threads (tenant_id, status, last_sender, last_body) VALUES ('${TB}', 'open', 'tenant', 'Kamera error');
      INSERT INTO withdrawals (tenant_id, amount, net_amount, bank_name, account_number, account_name) VALUES ('${TB}', 6000000, 5990000, 'BCA', '123', 'Budi');
      INSERT INTO tenant_applications (business_name, owner_name, owner_email, owner_whatsapp) VALUES ('Fotosut', 'Dika', 'dika@example.com', '082233445566');
      INSERT INTO superadmins (id, email, password_hash, role) VALUES ('${OWNER}', 'owner@studiodo.id', 'x', 'owner');
    `);
    const { superadminRouter } = await import("./superadmin.js");
    const { signSuperadminToken } = await import("../lib/jwt.js");
    owner = signSuperadminToken({ superadminId: OWNER });
    const app = express();
    app.use(express.json());
    app.use("/api/superadmin", superadminRouter);
    server = app.listen(0);
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    vi.stubGlobal("fetch", async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).startsWith("https://api.fonnte.com")) {
        const form = new URLSearchParams(String(init?.body));
        sent.push({ target: form.get("target")!, message: form.get("message")! });
        return new Response(JSON.stringify({ status: true, id: ["1"] }), { status: 200 });
      }
      return realFetch(url as string, init);
    });
  }, 120_000);

  afterAll(() => { vi.unstubAllGlobals(); server?.close(); holder.db = undefined; });

  it("scores every tenant, worst first, with reasons", async () => {
    const r = (await adm("GET", "/insights/health")).json;
    expect(r.rows.map((x: { name: string }) => x.name)).toEqual(["Studio Sunyi", "Rina Booth"]);
    const sunyi = r.rows[0];
    expect(sunyi).toMatchObject({ level: "risk", licence: "expired", sessions30: 0 });
    expect(sunyi.reasons.join(" ")).toMatch(/belum dibalas/);
    const rina = r.rows[1];
    expect(rina.sessions30).toBe(50);
    expect(rina.keys).toBe(2);
    expect(rina.licence).toBe("ending"); // the trial booth ends in 3 days
    expect(rina.reasons.join(" ")).toMatch(/kamera/);
    expect(r.summary.risk).toBe(1);
  });

  it("computes revenue, MRR, churn and the trial funnel", async () => {
    const r = (await adm("GET", "/insights/revenue")).json;
    expect(r.mrr).toBe(500_000); // Rina Rp 300k/30d + Sunyi Rp 200k/30d, both still covering
    expect(r.revenue30).toBeGreaterThanOrEqual(500_000);
    expect(r.payingTenants).toBe(2);
    expect(r.newPaying30).toBe(2);
    expect(r.monthly).toHaveLength(6);
    expect(r.funnel).toMatchObject({ trialsIssued: 2, activated: 2, converted: 1, expiredUnconverted: 0 });
    expect(r.funnel.used).toBe(1); // the trial booth (ka2) ran paid sessions
  });

  it("lists the fleet with outdated, offline and problem booths first", async () => {
    const r = (await adm("GET", "/insights/fleet")).json;
    expect(r.latest).toBe("0.1.30");
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toMatchObject({ label: "Booth Cadangan", issues: ["kamera"], outdated: true, online: false });
    expect(r.rows.find((x: { label: string }) => x.label === "Booth Utama")).toMatchObject({ outdated: false, online: true, issues: [] });
  });

  it("raises anomalies: a big first payout", async () => {
    const r = (await adm("GET", "/insights/anomalies")).json;
    expect(r.items.some((a: { kind: string; tenantName: string }) => a.kind === "withdrawal.large" && a.tenantName === "Studio Sunyi")).toBe(true);
  });

  it("global search finds tenants, leads and booths, tolerating phone formats and wildcards", async () => {
    const byName = (await adm("GET", "/search?q=rina")).json.hits;
    expect(byName.some((h: { type: string; title: string }) => h.type === "tenant" && h.title === "Rina Booth")).toBe(true);
    const byBooth = (await adm("GET", "/search?q=Cadangan")).json.hits;
    expect(byBooth[0]).toMatchObject({ type: "booth", subtitle: expect.stringContaining("Rina Booth") });
    const byLeadPhone = (await adm("GET", "/search?q=0822334")).json.hits;
    expect(byLeadPhone.some((h: { type: string; title: string }) => h.type === "lead" && h.title === "Fotosut")).toBe(true);
    expect((await adm("GET", "/search?q=r")).json.hits).toEqual([]); // too short
    expect((await adm("GET", "/search?q=%25")).json.hits).toEqual([]); // "%" is literal, not "match everything"
  });

  it("morning summary: preview, then 'send now' records an in-app copy and WhatsApps the owner's number", async () => {
    const preview = (await adm("GET", "/insights/digest")).json;
    expect(preview.settings.enabled).toBe(false);
    expect(preview.preview).toContain("Ringkasan pagi STUDIODO");
    expect(preview.preview).toContain("Pembayaran 24 jam: 0"); // the only paid order is 10 days old
    expect(preview.gateway).toBe(false);
    expect((await adm("POST", "/insights/digest/send")).json.whatsapp).toBe("no_gateway");

    await adm("PUT", "/leads/settings/all", { whatsapp: { provider: "fonnte", token: "fonnte-token-123456" } });
    const sentNow = (await adm("POST", "/insights/digest/send")).json;
    expect(sentNow.whatsapp).toBe("sent");
    expect(sent.at(-1)!.target).toBe("6281200000000");
    expect(sent.at(-1)!.message).toContain("Ringkasan pagi STUDIODO");
    expect((await adm("GET", "/alerts")).json.items.some((a: { kind: string }) => a.kind === "digest.daily")).toBe(true);
  });

  it("the daily job sends once per WIB day, only from the chosen hour, only when switched on", async () => {
    const { runDailyDigest } = await import("../lib/digest.js");
    const day = new Date().toISOString().slice(0, 10);
    const at = (h: number) => new Date(`${day}T${String(h).padStart(2, "0")}:00:00Z`); // UTC hour h = WIB h+7
    expect(await runDailyDigest(at(1))).toBe(false); // switched off
    expect((await adm("PUT", "/insights/digest", { enabled: true, hour: 8 })).json.settings).toEqual({ enabled: true, hour: 8 });
    const before = sent.length;
    expect(await runDailyDigest(at(23))).toBe(false); // 06:00 WIB next day — before the chosen hour... (23:00Z = 06:00 WIB)
    expect(await runDailyDigest(at(2))).toBe(true); // 09:00 WIB
    await settle();
    expect(sent).toHaveLength(before + 1);
    expect(await runDailyDigest(at(3))).toBe(false); // same WIB day: already sent
    expect(sent).toHaveLength(before + 1);
  });
});
