import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Tenant help chat + superadmin alert centre against real SQL (PGlite) and real HTTP/JWT. The WhatsApp gateway is a stub
// that records what would have been sent. Skips itself when PGlite is not installed (see billing.integration.test.ts).

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

const T1 = "00000000-0000-0000-0000-0000000000b1";
const T2 = "00000000-0000-0000-0000-0000000000b2";
const A1 = "00000000-0000-0000-0000-0000000000d1";
const A2 = "00000000-0000-0000-0000-0000000000d2";
const OWNER = "00000000-0000-0000-0000-0000000000c1";

describe.skipIf(!PGlite)("support chat + alert centre (real SQL, real HTTP)", () => {
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let origin = "";
  let owner = "";
  let tenant1 = "";
  let tenant2 = "";
  let pg: InstanceType<NonNullable<typeof PGlite>>;
  const sent: { target: string; message: string }[] = [];
  const realFetch = globalThis.fetch;
  const call = async (method: string, p: string, token: string, body?: unknown) => {
    const res = await realFetch(`${origin}${p}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    try { json = JSON.parse(text); } catch { json = undefined; }
    return { status: res.status, json, text };
  };
  const adm = (method: string, p: string, body?: unknown) => call(method, `/api/superadmin${p}`, owner, body);
  const settle = () => new Promise((r) => setTimeout(r, 150)); // logEvent is fire-and-forget

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
      INSERT INTO platform_settings (default_trial_days) VALUES (7);
      INSERT INTO tenants (id, name, slug, owner_whatsapp) VALUES ('${T1}', 'Studio Satu', 'satu', '081234567890'), ('${T2}', 'Studio Dua', 'dua', NULL);
      INSERT INTO admins (id, tenant_id, email, password_hash) VALUES ('${A1}', '${T1}', 'satu@x.com', 'x'), ('${A2}', '${T2}', 'dua@x.com', 'x');
      INSERT INTO superadmins (id, email, password_hash, role) VALUES ('${OWNER}', 'owner@studiodo.id', 'x', 'owner');
    `);
    const { superadminRouter } = await import("./superadmin.js");
    const { supportTenantRouter } = await import("./supportAlerts.js");
    const { notificationsTenantRouter } = await import("./notifications.js");
    const { signSuperadminToken, signAdminToken } = await import("../lib/jwt.js");
    owner = signSuperadminToken({ superadminId: OWNER });
    tenant1 = signAdminToken({ adminId: A1, tenantId: T1 });
    tenant2 = signAdminToken({ adminId: A2, tenantId: T2 });
    const app = express();
    app.use(express.json());
    app.use("/api/superadmin", superadminRouter);
    app.use("/api/portal/support", supportTenantRouter);
    app.use("/api/portal/notifications", notificationsTenantRouter);
    server = app.listen(0);
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    // Fonnte stub: record, answer ok. Everything else (our own server) goes through.
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

  it("a tenant writes in the help chat, and only sees its own thread", async () => {
    expect((await call("POST", "/api/portal/support", tenant1, { body: "   " })).status).toBe(400);
    const post = await call("POST", "/api/portal/support", tenant1, { body: "Kamera tidak terdeteksi di PC booth" });
    expect(post.status).toBe(201);
    expect(post.json.messages).toHaveLength(1);
    expect(post.json.messages[0]).toMatchObject({ sender: "tenant" });
    expect((await call("GET", "/api/portal/support", tenant2)).json.messages).toHaveLength(0);
    expect((await call("GET", "/api/portal/support", "bukan-token")).status).toBe(401);
  });

  it("the message shows up in the superadmin inbox as needing a reply, and raises an alert", async () => {
    await settle();
    const list = (await adm("GET", "/support/threads")).json;
    expect(list.needsReply).toBe(1);
    expect(list.threads[0]).toMatchObject({ tenantName: "Studio Satu", needsReply: true, unread: 1, ownerWhatsapp: "081234567890" });
    const alerts = (await adm("GET", "/alerts")).json;
    expect(alerts.items.some((a: { kind: string; body: string }) => a.kind === "support.message" && a.body.includes("Kamera tidak terdeteksi"))).toBe(true);
    const summary = (await adm("GET", "/alerts/summary")).json;
    expect(summary.followUp.find((i: { key: string }) => i.key === "support")?.count).toBe(1);
  });

  it("replying clears 'needs reply', reaches the tenant (chat + bell) and reading resets unread", async () => {
    const id = (await adm("GET", "/support/threads")).json.threads[0].id;
    const detail = await adm("GET", `/support/threads/${id}`);
    expect(detail.json.messages).toHaveLength(1);
    expect((await adm("GET", "/support/threads")).json.threads[0].unread).toBe(0);
    expect((await adm("POST", `/support/threads/${id}/reply`, { body: "" })).status).toBe(400);
    expect((await adm("POST", `/support/threads/${id}/reply`, { body: "Coba cabut-colok kabel USB-nya ya." })).status).toBe(201);
    expect((await adm("GET", "/support/threads")).json.needsReply).toBe(0);
    const view = (await call("GET", "/api/portal/support", tenant1)).json;
    expect(view.unread).toBe(1);
    expect(view.messages.map((m: { sender: string }) => m.sender)).toEqual(["tenant", "admin"]);
    expect((await call("GET", "/api/portal/notifications", tenant1)).json.items.some((n: { title: string }) => n.title.includes("Balasan"))).toBe(true);
    await call("POST", "/api/portal/support/read", tenant1);
    expect((await call("GET", "/api/portal/support", tenant1)).json.unread).toBe(0);
    // tenant 2 got nothing
    expect((await call("GET", "/api/portal/notifications", tenant2)).json.items.some((n: { title: string }) => n.title.includes("Balasan"))).toBe(false);
  });

  it("resolving a thread, and a new tenant message reopens it", async () => {
    const id = (await adm("GET", "/support/threads")).json.threads[0].id;
    expect((await adm("PATCH", `/support/threads/${id}`, { status: "resolved" })).json.status).toBe("resolved");
    expect((await adm("PATCH", `/support/threads/${id}`, { status: "weird" })).status).toBe(400);
    await call("POST", "/api/portal/support", tenant1, { body: "Masih belum bisa" });
    expect((await adm("GET", "/support/threads")).json.threads[0]).toMatchObject({ status: "open", needsReply: true });
  });

  it("WhatsApp alerts need a gateway AND a number, then fire for important events only", async () => {
    const { logEvent } = await import("../lib/platformEvents.js");
    const { _resetAlertState } = await import("../lib/adminAlerts.js");
    _resetAlertState();
    logEvent({ category: "billing", action: "payment.received", message: 'Pembayaran Rp 150.000 untuk "Studio Satu"', tenantId: T1 });
    await settle();
    expect(sent).toHaveLength(0); // nothing configured yet: in-app only
    expect((await adm("POST", "/alerts/test")).status).toBe(400);
    expect((await adm("PUT", "/alerts/settings", { number: "bukan nomor" })).status).toBe(400);
    expect((await adm("PUT", "/alerts/settings", { number: "0877-7737-3108" })).status).toBe(200);
    expect((await adm("POST", "/alerts/test")).status).toBe(409); // no gateway token yet
    await adm("PUT", "/leads/settings/all", { whatsapp: { provider: "fonnte", token: "fonnte-token-123456" } });
    expect((await adm("POST", "/alerts/test")).status).toBe(200);
    expect(sent.at(-1)!.target).toBe("6287777373108");
    sent.length = 0;

    logEvent({ category: "billing", action: "payment.received", message: 'Pembayaran Rp 150.000 untuk "Studio Satu"', tenantId: T1 });
    logEvent({ category: "tenant", action: "application.submitted", message: 'Aplikasi tenant baru masuk: "Fotosut" (d@x.id)' });
    logEvent({ category: "system", action: "blog.updated", message: "routine" });
    logEvent({ category: "tenant", action: "lead.followup_due", message: "Follow-up jatuh tempo" }); // WhatsApp off by default
    await settle();
    expect(sent.map((s) => s.message).join("\n")).toContain("Pembayaran diterima");
    expect(sent.map((s) => s.message).join("\n")).toContain("Pendaftaran tenant baru");
    expect(sent).toHaveLength(2);
    const alerts = (await adm("GET", "/alerts?limit=100")).json.items as { kind: string; waSentAt: string | null; tenantName: string | null }[];
    expect(alerts.find((a) => a.kind === "payment.received")).toMatchObject({ tenantName: "Studio Satu" });
    expect(alerts.find((a) => a.kind === "payment.received")!.waSentAt).toBeTruthy();
    expect(alerts.find((a) => a.kind === "lead.followup_due")!.waSentAt).toBeNull();
    expect(alerts.some((a) => a.kind === "blog.updated")).toBe(false);
  });

  it("an error storm sends one WhatsApp per cooldown, but every error stays in the list", async () => {
    const { logEvent } = await import("../lib/platformEvents.js");
    sent.length = 0;
    for (let i = 0; i < 4; i++) logEvent({ category: "system", level: "error", action: "server.unhandled_error", message: `boom ${i}` });
    await settle();
    expect(sent.filter((s) => s.message.includes("Error di server"))).toHaveLength(1);
    const items = (await adm("GET", "/alerts?kind=server.unhandled_error")).json.items;
    expect(items).toHaveLength(4);
  });

  it("owner can switch a kind's WhatsApp off, and read state is tracked", async () => {
    const { logEvent } = await import("../lib/platformEvents.js");
    const settings = (await adm("GET", "/alerts/settings")).json;
    expect(settings.number).toBe("0877-7737-3108");
    expect(settings.gateway).toBe(true);
    expect(settings.kinds.find((k: { kind: string }) => k.kind === "payment.received").whatsapp).toBe(true);
    await adm("PUT", "/alerts/settings", { prefs: { "payment.received": { whatsapp: false } } });
    sent.length = 0;
    logEvent({ category: "billing", action: "payment.received", message: "Pembayaran lagi" });
    await settle();
    expect(sent).toHaveLength(0);
    const before = (await adm("GET", "/alerts")).json;
    expect(before.unread).toBeGreaterThan(0);
    expect(before.critical).toBeGreaterThan(0);
    await adm("POST", "/alerts/read", { ids: [before.items[0].id] });
    expect((await adm("GET", "/alerts")).json.unread).toBe(before.unread - 1);
    expect((await adm("POST", "/alerts/read", {})).status).toBe(400);
    expect((await adm("POST", "/alerts/read", { all: true })).json.unread).toBe(0);
    expect((await adm("GET", "/alerts?unread=1")).json.items).toHaveLength(0);
  });

  it("'lihat sebagai tenant' gives a read-only 30-minute session that is audited", async () => {
    expect((await adm("POST", "/tenants/00000000-0000-0000-0000-00000000dead/impersonate")).status).toBe(404);
    const r = await adm("POST", `/tenants/${T1}/impersonate`);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ tenantName: "Studio Satu", adminEmail: "satu@x.com", expiresInMinutes: 30 });
    const { default: jwtLib } = await import("jsonwebtoken");
    const claims = jwtLib.decode(r.json.token) as { ro: boolean; imp: string; exp: number; iat: number; tenantId: string };
    expect(claims).toMatchObject({ ro: true, imp: "owner@studiodo.id", tenantId: T1 });
    expect(claims.exp - claims.iat).toBe(1800);
    expect((await call("GET", "/api/portal/support", r.json.token)).status).toBe(200); // can look
    const write = await call("POST", "/api/portal/support", r.json.token, { body: "tidak boleh" });
    expect(write.status).toBe(403);
    expect(write.json.code).toBe("read_only_session");
    await settle();
    const events = (await adm("GET", `/events?tenantId=${T1}&limit=50`)).json; expect(JSON.stringify(events)).toContain("tenant.impersonated");
    expect((await call("POST", "/api/portal/support", tenant1, { body: "tenant sendiri tetap bisa" })).status).toBe(201); // a normal session is unaffected
  });
});
