import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// End-to-end test of the prospective-tenant CRM: a real Express app, real superadmin JWT auth, real SQL on PGlite with the
// real migrations. Covers the pipeline, tasks + reminders, WhatsApp settings/webhook, and the contract lifecycle including
// the public page a prospect opens. Skips itself when PGlite is not installed (see billing.integration.test.ts).

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

const OWNER = "00000000-0000-0000-0000-0000000000c1";
const FINANCE = "00000000-0000-0000-0000-0000000000c2";

describe.skipIf(!PGlite)("lead CRM (real SQL, real HTTP)", () => {
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let origin = "";
  let owner = "";
  let finance = "";
  let pg: InstanceType<NonNullable<typeof PGlite>>;
  const call = async (method: string, p: string, token: string | null, body?: unknown) => {
    const res = await fetch(`${origin}${p}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    try { json = JSON.parse(text); } catch { json = undefined; }
    return { status: res.status, json, text };
  };
  const api = (method: string, p: string, body?: unknown, token = owner) => call(method, `/api/superadmin/leads${p}`, token, body);
  const events = async (action: string) => (await pg.query(`SELECT * FROM platform_events WHERE action = '${action}'`)).rows;

  beforeAll(async () => {
    process.env.JWT_SECRET = "integration-test-secret";
    delete process.env.CONTRACT_ISSUER_NAME; delete process.env.CONTRACT_ISSUER_ADDRESS; delete process.env.CONTRACT_ISSUER_CONTACT;
    pg = new PGlite!();
    const dir = path.resolve(__dirname, "../db/migrations");
    const journal = JSON.parse(fs.readFileSync(path.join(dir, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
    for (const { tag } of journal.entries) {
      for (const stmt of fs.readFileSync(path.join(dir, `${tag}.sql`), "utf8").split("--> statement-breakpoint")) if (stmt.trim()) await pg.exec(stmt);
    }
    const { drizzle } = await import("drizzle-orm/pglite");
    const schema = await import("../db/schema.js");
    holder.db = drizzle(pg as never, { schema });
    await pg.exec(`
      INSERT INTO platform_settings (default_trial_days) VALUES (7);
      INSERT INTO plans (name, slug, price, billing_interval, yearly_discount_percent) VALUES ('PRO', 'pro', 100000, 'monthly', 0);
      INSERT INTO superadmins (id, email, password_hash, role) VALUES ('${OWNER}', 'owner@studiodo.id', 'x', 'owner'), ('${FINANCE}', 'finance@studiodo.id', 'x', 'finance');
    `);
    const { superadminRouter } = await import("./superadmin.js");
    const { publicLeadsRouter } = await import("./publicLeads.js");
    const { signSuperadminToken } = await import("../lib/jwt.js");
    owner = signSuperadminToken({ superadminId: OWNER });
    finance = signSuperadminToken({ superadminId: FINANCE });
    const app = express();
    app.use(express.json());
    app.use("/api/superadmin", superadminRouter);
    app.use("/api/public", publicLeadsRouter);
    server = app.listen(0);
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    process.env.PUBLIC_BASE_URL = origin;
  }, 120_000);

  afterAll(() => { server?.close(); holder.db = undefined; });

  let leadId = "";

  it("is owner-only: finance accounts and anonymous callers are refused", async () => {
    expect((await api("GET", "/", undefined, finance)).status).toBe(403);
    expect((await call("GET", "/api/superadmin/leads", null)).status).toBe(401);
  });

  it("creates a WhatsApp-only lead and never exposes the contract token or snapshot", async () => {
    const r = await api("POST", "/", { businessName: "Fotosut", ownerName: "Dika", ownerWhatsapp: "+62 877-7737-3108", city: "Bandung" });
    expect(r.status).toBe(201);
    leadId = r.json.id;
    expect(r.json.pipelineStage).toBe("new");
    expect(r.json.leadSource).toBe("whatsapp");
    expect(r.json).not.toHaveProperty("contractToken");
    expect(r.json).not.toHaveProperty("contractSnapshot");
    const list = await api("GET", "/");
    expect(list.json.leads).toHaveLength(1);
    expect((await api("GET", "/?q=bandung")).json.leads).toHaveLength(1);
    expect((await api("GET", "/?q=tidak-ada")).json.leads).toHaveLength(0);
    expect((await api("POST", "/", { businessName: "", ownerName: "x" })).status).toBe(400);
  });

  it("moves stages freely, keeps Aktif for real conversions, and syncs the review status", async () => {
    expect((await api("POST", `/${leadId}/stage`, { stage: "negotiation" })).json.pipelineStage).toBe("negotiation");
    expect((await api("POST", `/${leadId}/stage`, { stage: "active" })).status).toBe(409);
    expect((await api("POST", `/${leadId}/stage`, { stage: "nope" })).status).toBe(400);
    const lost = await api("POST", `/${leadId}/stage`, { stage: "lost", reason: "Harga" });
    expect(lost.json).toMatchObject({ pipelineStage: "lost", status: "rejected", lostReason: "Harga" });
    const back = await api("POST", `/${leadId}/stage`, { stage: "contacted" });
    expect(back.json).toMatchObject({ pipelineStage: "contacted", status: "pending", lostReason: null });
    const detail = await api("GET", `/${leadId}`);
    expect(detail.json.activities.filter((a: { kind: string }) => a.kind === "stage").length).toBeGreaterThanOrEqual(3);
  });

  it("raises exactly one reminder for an overdue task, and none for a future one", async () => {
    const future = await api("POST", `/${leadId}/tasks`, { title: "Kirim kontrak", preset: "2d" });
    const overdue = await api("POST", `/${leadId}/tasks`, { title: "Tanya akun pembayaran", dueAt: new Date(Date.now() - 3600_000).toISOString() });
    expect(future.status).toBe(201);
    expect(overdue.json.state).toBe("overdue");
    expect((await api("POST", `/${leadId}/tasks`, { title: "x", dueAt: "bukan tanggal" })).status).toBe(400);
    const s1 = await api("GET", "/summary");
    expect(s1.json.overdue).toBe(1);
    expect(s1.json.funnel.find((f: { stage: string }) => f.stage === "contacted").count).toBe(1);
    await api("GET", "/summary");
    const raised = await events("lead.followup_due");
    expect(raised).toHaveLength(1);
    expect(String(raised[0].message)).toContain("Tanya akun pembayaran");
    // completing it removes it from "overdue"
    const done = await api("PATCH", `/${leadId}/tasks/${overdue.json.id}`, { done: true });
    expect(done.json.state).toBe("done");
    expect((await api("GET", "/summary")).json.overdue).toBe(0);
  });

  it("logs a manual (wa.me) message, auto-advances a new lead, and refuses the gateway when it is not set up", async () => {
    const created = await api("POST", "/", { businessName: "Baru PT", ownerName: "Sari", ownerWhatsapp: "081234567890" });
    const id = created.json.id;
    const tpl = await api("GET", `/${id}/templates`);
    expect(tpl.json.gateway).toBe(false);
    const greeting = tpl.json.templates.find((t: { key: string }) => t.key === "greeting");
    expect(greeting.text).toContain("Halo Sari");
    expect(greeting.waLink).toMatch(/^https:\/\/wa\.me\/6281234567890\?text=/);
    expect((await api("POST", `/${id}/whatsapp`, { text: greeting.text, mode: "gateway" })).status).toBe(409);
    expect((await api("POST", `/${id}/whatsapp`, { text: greeting.text, mode: "manual" })).status).toBe(201);
    const detail = await api("GET", `/${id}`);
    expect(detail.json.lead.pipelineStage).toBe("contacted");
    expect(detail.json.activities.some((a: { kind: string }) => a.kind === "whatsapp_out")).toBe(true);
    const noPhone = await api("POST", "/", { businessName: "Tanpa WA", ownerName: "Eko" });
    expect((await api("POST", `/${noPhone.json.id}/whatsapp`, { text: "hai", mode: "manual" })).status).toBe(400);
  });

  it("keeps the WhatsApp token write-only everywhere", async () => {
    const secret = "fonnte-token-abcdef123456";
    const put = await api("PUT", "/settings/all", { whatsapp: { provider: "fonnte", token: secret } });
    expect(put.status).toBe(200);
    expect(put.json.whatsapp).toEqual({ provider: "fonnte", hasToken: true, hasWebhookKey: false, ready: true });
    const get = await api("GET", "/settings/all");
    expect(get.text).not.toContain(secret);
    expect(get.text).not.toMatch(/v1:/);
    const platform = await call("GET", "/api/superadmin/settings", owner);
    expect(platform.status).toBe(200);
    expect(platform.text).not.toContain(secret);
    expect(platform.json).not.toHaveProperty("waTokenEnc");
    const stored = (await pg.query("SELECT wa_token_enc FROM platform_settings")).rows[0].wa_token_enc as string;
    expect(stored).toMatch(/^v1:/);
    expect(stored).not.toContain(secret);
    // blank token on a later save keeps the stored one
    expect((await api("PUT", "/settings/all", { whatsapp: { provider: "fonnte", token: "" } })).json.whatsapp.hasToken).toBe(true);
  });

  it("accepts inbound WhatsApp only with the right key and only from a known lead", async () => {
    const key = (await api("POST", "/settings/webhook-key")).json;
    expect(key.url).toContain(`/api/public/wa/webhook/${key.key}`);
    expect((await call("POST", "/api/public/wa/webhook/salah-kunci", null, { sender: "6287777373108", message: "hi" })).status).toBe(404);
    const stranger = await call("POST", `/api/public/wa/webhook/${key.key}`, null, { sender: "6281999999999", message: "spam" });
    expect(stranger.json).toMatchObject({ ok: true, ignored: true });
    const ok = await call("POST", `/api/public/wa/webhook/${key.key}`, null, { sender: "6287777373108", message: "Halo ka, rencana tambah booth minggu kedua", name: "Dika" });
    expect(ok.json).toEqual({ ok: true });
    const detail = await api("GET", `/${leadId}`);
    const inbound = detail.json.activities.filter((a: { kind: string }) => a.kind === "whatsapp_in");
    expect(inbound).toHaveLength(1);
    expect(inbound[0].body).toContain("minggu kedua");
    expect((await api("GET", "/settings/all")).json.whatsapp.hasWebhookKey).toBe(true);
  });

  describe("contract", () => {
    let url = "";
    it("needs plan, booth count and term before a draft can exist", async () => {
      expect((await api("POST", `/${leadId}/contract`)).status).toBe(400);
      const patch = await api("PATCH", `/${leadId}`, { planSlug: "pro", boothCount: 2, contractMonths: 6, paymentSetup: "platform", ownerEmail: "dika@fotosut.id" });
      expect(patch.status).toBe(200);
      const draft = await api("POST", `/${leadId}/contract`);
      expect(draft.status).toBe(200);
      expect(draft.json.warnings.join(" ")).toMatch(/belum diisi/);
      expect(draft.json.html).toContain("DRAFT");
    });

    it("keeps a draft private and blocks sending until reviewed and the issuer is filled in", async () => {
      const detail = await api("GET", `/${leadId}`);
      expect(detail.json.contract.status).toBe("draft");
      expect(detail.json.contract.total).toBe(1_200_000);
      expect((await api("POST", `/${leadId}/contract/send`, {})).status).toBe(400);
      expect((await api("POST", `/${leadId}/contract/send`, { reviewed: true })).status).toBe(409); // issuer incomplete
      await api("PUT", "/settings/all", { issuer: { name: "PT Studiodo Contoh", address: "Jl. Contoh 1", contact: "halo@studiodo.id" } });
      expect((await api("POST", `/${leadId}/contract`)).json.warnings.join(" ")).not.toMatch(/badan usaha/);
      // the link exists only after "send": a draft token opens nothing
      const draftUrl = detail.json.contract.url as string;
      expect((await fetch(draftUrl)).status).toBe(404);
    });

    it("send makes the link live, moves the lead to Kontrak terkirim and builds the WhatsApp message", async () => {
      const sent = await api("POST", `/${leadId}/contract/send`, { reviewed: true });
      expect(sent.status).toBe(200);
      url = sent.json.url;
      expect(url).toMatch(/\/api\/public\/kontrak\/[\w-]{40,}$/);
      expect(sent.json.message).toContain(url);
      expect(sent.json.waLink).toMatch(/^https:\/\/wa\.me\/6287777373108\?text=/);
      expect((await api("GET", `/${leadId}`)).json.lead).toMatchObject({ pipelineStage: "contract_sent", contractStatus: "sent" });
      const page = await fetch(url);
      expect(page.status).toBe(200);
      const html = await page.text();
      expect(html).toContain("Fotosut");
      expect(html).toContain("DRAFT");
      expect(html).toContain("/setuju");
      expect(html).toContain("Rp 1.200.000");
    });

    it("rejects a malformed token, and an incomplete approval", async () => {
      expect((await fetch(`${origin}/api/public/kontrak/pendek`)).status).toBe(404);
      expect((await fetch(`${origin}/api/public/kontrak/${"x".repeat(43)}`)).status).toBe(404);
      const noAgree = await fetch(`${url}/setuju`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "name=Dika", redirect: "manual" });
      expect(noAgree.status).toBe(400);
      expect((await api("GET", `/${leadId}`)).json.lead.contractStatus).toBe("sent");
    });

    it("the prospect's approval is recorded once, on the lead, with name and time", async () => {
      const form = { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "name=Dika+Pratama&agree=1", redirect: "manual" as const };
      const res = await fetch(`${url}/setuju`, form);
      expect(res.status).toBe(303);
      await fetch(`${url}/setuju`, { ...form, body: "name=Orang+Lain&agree=1" }); // second attempt must change nothing
      const lead = (await api("GET", `/${leadId}`)).json;
      expect(lead.lead).toMatchObject({ contractStatus: "signed", contractSignedName: "Dika Pratama" });
      expect(lead.lead.contractSignedAt).toBeTruthy();
      expect(lead.contract.status).toBe("signed");
      expect(lead.activities.filter((a: { body: string }) => a.body.includes("Kontrak disetujui oleh"))).toHaveLength(1);
      expect((await events("lead.contract_signed"))).toHaveLength(1);
      const html = await (await fetch(url)).text();
      expect(html).toContain("Disetujui secara elektronik");
      expect(html).not.toContain("<form");
    });

    it("a signed contract cannot be regenerated or have its terms edited from the lead card", async () => {
      expect((await api("POST", `/${leadId}/contract`)).status).toBe(409);
      expect((await api("PATCH", `/${leadId}`, { boothCount: 5 })).status).toBe(409);
      expect((await api("PATCH", `/${leadId}`, { city: "Jakarta" })).status).toBe(200); // non-term fields stay editable
    });
  });

  it("converts to a tenant only with an email, then the lead is Aktif and no longer deletable", async () => {
    const noEmail = await api("POST", "/", { businessName: "Tanpa Email", ownerName: "Eko", ownerWhatsapp: "081111111111" });
    const refused = await call("POST", `/api/superadmin/tenant-applications/${noEmail.json.id}/convert`, owner, { slug: "tanpa-email", password: "secret123" });
    expect(refused.status).toBe(400);
    const converted = await call("POST", `/api/superadmin/tenant-applications/${leadId}/convert`, owner, { slug: "fotosut", password: "secret123" });
    expect(converted.status).toBe(201);
    // the ready-to-send WhatsApp message: login + one-time password link + trial key, never the typed password
    const msg = converted.json.whatsappMessage as string;
    expect(msg).toContain("Halo Dika");
    expect(msg).toContain("dika@fotosut.id");
    expect(msg).toContain(converted.json.kioskKey);
    expect(msg).toMatch(/7 hari/);
    expect(msg).toMatch(/\/reset|token|setup|=/); // the one-time set-password link is present
    expect(msg).not.toContain("secret123");
    expect(converted.json.whatsappLink).toMatch(/^https:\/\/wa\.me\/6287777373108\?text=/);
    // logging the send must not copy the key into the lead timeline
    await api("POST", `/${leadId}/whatsapp`, { text: msg, mode: "manual" });
    const timeline = (await api("GET", `/${leadId}`)).json.activities as { body: string }[];
    expect(JSON.stringify(timeline)).not.toContain(converted.json.kioskKey);
    expect(JSON.stringify(timeline)).toContain("key disembunyikan");
    const detail = await api("GET", `/${leadId}`);
    expect(detail.json.lead).toMatchObject({ pipelineStage: "active", status: "converted" });
    expect((await api("POST", `/${leadId}/stage`, { stage: "new" })).status).toBe(409);
    expect((await api("DELETE", `/${leadId}`)).status).toBe(409);
    expect((await api("DELETE", `/${noEmail.json.id}`)).status).toBe(200);
  });

  it("serves both guides to the team, and the onboarding guide publicly", async () => {
    const team = await api("GET", "/docs/team");
    expect(team.status).toBe(200);
    expect(team.json.markdown).toContain("Alur lead sampai aktif");
    expect((await api("GET", "/docs/rahasia")).status).toBe(404);
    const pub = await fetch(`${origin}/api/public/panduan/onboarding`);
    expect(pub.status).toBe(200);
    expect(await pub.text()).toContain("Panduan Onboarding STUDIODO");
  });
});
