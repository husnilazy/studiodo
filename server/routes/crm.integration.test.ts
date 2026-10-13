import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// End-to-end test of the CRM and live-monitor endpoints: a real Express app, real JWT auth, real SQL on PGlite (in-memory
// Postgres) with the real migrations. Skips itself when PGlite is not installed (see billing.integration.test.ts).

const spec = process.env.PGLITE_MODULE ?? "@electric-sql/pglite";
let PGlite: (new () => { exec(sql: string): Promise<unknown> }) | null = null;
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

const MIN = 60 * 1000;
const T1 = "00000000-0000-0000-0000-0000000000a1";
const T2 = "00000000-0000-0000-0000-0000000000a2";
const BOOTH_A = "10000000-0000-0000-0000-00000000000a";
const BOOTH_B = "10000000-0000-0000-0000-00000000000b";
const BOOTH_C = "10000000-0000-0000-0000-00000000000c";
const PKG = "20000000-0000-0000-0000-000000000001";

describe.skipIf(!PGlite)("CRM + live monitor (real SQL, real HTTP)", () => {
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let base = "";
  let token = "";
  const get = async (p: string) => (await fetch(`${base}${p}`, { headers: { Authorization: `Bearer ${token}` } })).json() as Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  beforeAll(async () => {
    process.env.JWT_SECRET = "integration-test-secret";
    const pg = new PGlite!();
    const dir = path.resolve(__dirname, "../db/migrations");
    const journal = JSON.parse(fs.readFileSync(path.join(dir, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
    for (const { tag } of journal.entries) {
      for (const stmt of fs.readFileSync(path.join(dir, `${tag}.sql`), "utf8").split("--> statement-breakpoint")) if (stmt.trim()) await pg.exec(stmt);
    }
    const { drizzle } = await import("drizzle-orm/pglite");
    const schema = await import("../db/schema.js");
    holder.db = drizzle(pg as never, { schema });

    const ago = (m: number) => new Date(Date.now() - m * MIN).toISOString();
    await pg.exec(`
      INSERT INTO tenants (id, name, slug) VALUES ('${T1}', 'Uji', 'uji'), ('${T2}', 'Lain', 'lain');
      INSERT INTO packages (id, tenant_id, name, price, photo_count) VALUES ('${PKG}', '${T1}', 'Premium', 85000, 4);
      INSERT INTO kiosk_keys (id, tenant_id, key_hash, label, license_type, license_ends_at, last_used_at) VALUES
        ('${BOOTH_A}', '${T1}', 'ha', 'Booth Mall', 'paid', now() + interval '30 days', '${ago(1)}'),
        ('${BOOTH_B}', '${T1}', 'hb', 'Booth Kafe', 'paid', now() + interval '30 days', '${ago(1)}'),
        ('${BOOTH_C}', '${T1}', 'hc', 'Booth Lama', 'paid', now() + interval '30 days', '${ago(120)}');
      INSERT INTO sessions (tenant_id, kiosk_key_id, package_id, payment_status, total_amount, customer_whatsapp, customer_email, publish_consent, feedback, share_url, created_at, completed_at) VALUES
        ('${T1}', '${BOOTH_A}', '${PKG}', 'success', 50000, '0812-3456-7890', NULL, true, 'Seru!', 'https://s/1', '${ago(600)}', '${ago(590)}'),
        ('${T1}', '${BOOTH_A}', '${PKG}', 'success', 85000, '+62 812 3456 7890', 'A@Mail.com', false, NULL, 'https://s/2', '${ago(300)}', '${ago(290)}'),
        ('${T1}', '${BOOTH_B}', '${PKG}', 'success', 70000, NULL, 'rina@mail.com', false, NULL, NULL, '${ago(200)}', '${ago(190)}'),
        ('${T1}', '${BOOTH_B}', '${PKG}', 'success', 40000, NULL, NULL, false, NULL, NULL, '${ago(100)}', '${ago(95)}'),
        ('${T1}', '${BOOTH_B}', '${PKG}', 'pending', 85000, '0899 111 2222', NULL, false, NULL, NULL, '${ago(2)}', NULL),
        ('${T2}', NULL, NULL, 'success', 99000, '0812-3456-7890', NULL, true, NULL, NULL, '${ago(50)}', NULL);
      INSERT INTO sessions (tenant_id, kiosk_key_id, package_id, payment_status, total_amount, photo_urls, created_at) VALUES
        ('${T1}', '${BOOTH_A}', '${PKG}', 'success', 85000, '["a","b"]'::jsonb, '${ago(3)}');
    `);

    const { crmRouter } = await import("./crm.js");
    const { liveRouter } = await import("./live.js");
    const { signAdminToken } = await import("../lib/jwt.js");
    token = signAdminToken({ adminId: "admin-1", tenantId: T1 });
    const app = express();
    app.use(express.json());
    app.use("/api/crm", crmRouter);
    app.use("/api/live", liveRouter);
    await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 120_000);

  afterAll(() => { server?.close(); holder.db = undefined; });

  it("groups sessions into customers across phone formats and never mixes tenants", async () => {
    const data = await get("/api/crm/customers");
    expect(data.total).toBe(3); // 0812… (2 sessions), rina@, 0899…  — the contact-less session and the other tenant's don't count
    const wa = data.items.find((c: any) => c.whatsapp === "6281234567890"); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(wa).toMatchObject({ key: "wa:6281234567890", sessions: 2, paidSessions: 2, totalSpend: 135000, consent: true, lastFeedback: "Seru!", lastShareUrl: "https://s/2" });
    expect(data.summary).toMatchObject({ customers: 3, withWhatsapp: 2, returning: 1, consent: 1 });
  });

  it("searches by any way of typing the number, by email, and filters", async () => {
    expect((await get("/api/crm/customers?q=0812345")).items.map((c: any) => c.key)).toEqual(["wa:6281234567890"]); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect((await get("/api/crm/customers?q=rina")).total).toBe(1);
    expect((await get("/api/crm/customers?filter=returning")).total).toBe(1);
    expect((await get("/api/crm/customers?filter=consent")).total).toBe(1);
    expect((await get("/api/crm/customers?sort=spend")).items[0].key).toBe("wa:6281234567890");
    expect((await get("/api/crm/customers?q=%25")).total).toBe(0); // a literal % must not match everything
  });

  it("returns a customer's full history and saves notes, tags and the opt-out flag", async () => {
    const key = encodeURIComponent("wa:6281234567890");
    const detail = await get(`/api/crm/customer?key=${key}`);
    expect(detail.sessions).toHaveLength(2);
    expect(detail.sessions[0]).toMatchObject({ packageName: "Premium", boothLabel: "Booth Mall", paymentStatus: "success", totalAmount: 85000 });

    const put = await fetch(`${base}/api/crm/customer`, {
      method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ key: "wa:6281234567890", name: "Bu Rina", notes: "Suka frame emas", tags: ["VIP", "vip ", "EO"], marketingOptOut: true }),
    });
    expect(put.status).toBe(200);
    const after = await get(`/api/crm/customer?key=${key}`);
    expect(after.customer).toMatchObject({ name: "Bu Rina", notes: "Suka frame emas", marketingOptOut: true });
    expect([...after.customer.tags].sort()).toEqual(["EO", "VIP", "vip"]);
    expect((await get("/api/crm/customers?tag=EO")).total).toBe(1);
    expect((await get("/api/crm/customers?filter=optout")).total).toBe(1);
    expect((await get("/api/crm/customers?q=Rina")).total).toBe(2); // name match + the rina@ email customer
  });

  it("refuses bad keys and customers that do not exist, and needs a login", async () => {
    expect((await fetch(`${base}/api/crm/customer?key=bogus`, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(400);
    expect((await fetch(`${base}/api/crm/customer?key=${encodeURIComponent("wa:6200000000000")}`, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(404);
    const put = await fetch(`${base}/api/crm/customer`, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ key: "wa:6200000000000", name: "x" }) });
    expect(put.status).toBe(404);
    expect((await fetch(`${base}/api/crm/customers`)).status).toBe(401);
  });

  it("exports every customer", async () => {
    expect((await get("/api/crm/export")).items).toHaveLength(3);
  });

  it("shows each booth's state: in session, waiting for payment, offline", async () => {
    const live = await get("/api/live");
    const byLabel = Object.fromEntries(live.booths.map((b: any) => [b.label, b])); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(byLabel["Booth Mall"]).toMatchObject({ state: "capture", current: { stage: "capture", photoCount: 2, photoTarget: 4, packageName: "Premium" } });
    expect(byLabel["Booth Kafe"]).toMatchObject({ state: "payment", current: { stage: "payment" } });
    expect(byLabel["Booth Lama"].state).toBe("offline");
    expect(live.summary).toMatchObject({ booths: 3, inSession: 1, waitingPayment: 1, offline: 1 });
    // "Today" is WIB midnight-based, so only the sessions seeded a few minutes ago are asserted (older ones may fall on yesterday).
    expect(byLabel["Booth Mall"].today.sessions).toBeGreaterThanOrEqual(1);
    expect(byLabel["Booth Kafe"].today.sessions).toBeGreaterThanOrEqual(1);
    expect(live.summary.sessionsToday).toBeGreaterThanOrEqual(2);
    expect(live.recent.length).toBeGreaterThan(0);
    expect(live.recent[0]).toHaveProperty("booth");
  });
});
