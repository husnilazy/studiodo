import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// End-to-end test of the money-management endpoints: a real Express app, real JWT auth, real SQL on PGlite with the real
// migrations. Covers the superadmin/finance roles, the policy, adjustments, the CSV and the tenant-side withdrawal request.
// Skips itself when PGlite is not installed (see billing.integration.test.ts).

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

const T = "00000000-0000-0000-0000-0000000000b1";
const OWNER = "00000000-0000-0000-0000-0000000000c1";
const FINANCE = "00000000-0000-0000-0000-0000000000c2";
const ADMIN = "00000000-0000-0000-0000-0000000000d1";
const bank = { bankName: "BCA", accountNumber: "1234567890", accountName: "Budi" };

describe.skipIf(!PGlite)("superadmin finance + tenant withdrawals (real SQL, real HTTP)", () => {
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let base = "";
  let ownerToken = "";
  let financeToken = "";
  let tenantToken = "";
  let wallet: typeof import("../lib/qrisBalance.js");
  const call = async (method: string, p: string, token: string, body?: unknown) => {
    const res = await fetch(`${base}${p}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    try { json = JSON.parse(text); } catch { json = undefined; }
    return { status: res.status, json, text, headers: res.headers };
  };

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
    await pg.exec(`
      INSERT INTO platform_settings (default_trial_days) VALUES (14);
      INSERT INTO tenants (id, name, slug, qris_settlement) VALUES ('${T}', 'Studio Uji', 'studio-uji', 'platform');
      INSERT INTO admins (id, tenant_id, email, password_hash) VALUES ('${ADMIN}', '${T}', 'budi@x.com', 'x');
      INSERT INTO superadmins (id, email, password_hash, role) VALUES ('${OWNER}', 'owner@studiodo.id', 'x', 'owner'), ('${FINANCE}', 'finance@studiodo.id', 'x', 'finance');
      INSERT INTO sessions (id, tenant_id, payment_method, payment_status, total_amount) VALUES ('30000000-0000-0000-0000-000000000001', '${T}', 'qris', 'success', 400000);
    `);
    wallet = await import("../lib/qrisBalance.js");
    await wallet.creditPlatformPayment(T, "30000000-0000-0000-0000-000000000001", 400000, "session"); // net 397 200

    const { superadminRouter } = await import("./superadmin.js");
    const { withdrawalsRouter } = await import("./withdrawals.js");
    const { signSuperadminToken, signAdminToken } = await import("../lib/jwt.js");
    ownerToken = signSuperadminToken({ superadminId: OWNER });
    financeToken = signSuperadminToken({ superadminId: FINANCE });
    tenantToken = signAdminToken({ adminId: ADMIN, tenantId: T });
    const app = express();
    app.use(express.json());
    app.use("/api/superadmin", superadminRouter);
    app.use("/api/withdrawals", withdrawalsRouter);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  }, 120_000);

  afterAll(() => { server?.close(); holder.db = undefined; });

  it("a finance account reaches the money screens but nothing else", async () => {
    expect((await call("GET", "/superadmin/finance/overview", financeToken)).status).toBe(200);
    expect((await call("GET", "/superadmin/withdrawals", financeToken)).status).toBe(200);
    expect((await call("GET", "/superadmin/settings", financeToken)).status).toBe(403);
    expect((await call("GET", "/superadmin/tenants", financeToken)).status).toBe(403);
    expect((await call("GET", "/superadmin/settings", ownerToken)).status).toBe(200);
    expect((await call("GET", "/superadmin/me", financeToken)).json.role).toBe("finance");
  });

  it("shows what is owed to each tenant", async () => {
    const { json } = await call("GET", "/superadmin/finance/overview", ownerToken);
    expect(json.totals).toMatchObject({ tenants: 1, gross: 400000, feesEarned: 2800, owed: 397200, available: 397200 });
    expect(json.items[0]).toMatchObject({ name: "Studio Uji", available: 397200, frozen: false });
  });

  it("saves the platform policy and the tenant override, and the tenant's balance reflects it", async () => {
    expect((await call("PUT", "/superadmin/finance/policy", ownerToken, { policy: { holdDays: 0, minAmount: 100000, dailyMaxCount: 2 } })).status).toBe(200);
    const policy = (await call("GET", "/superadmin/finance/policy", ownerToken)).json;
    expect(policy.policy).toMatchObject({ minAmount: 100000, dailyMaxCount: 2, mode: "anytime" });

    const balance = (await call("GET", "/withdrawals", tenantToken)).json.balance;
    expect(balance.policy.minAmount).toBe(100000);
    expect(balance.window.open).toBe(true);

    const tenantPolicy = await call("PUT", `/superadmin/finance/tenants/${T}/policy`, financeToken, { override: { minAmount: 20000, bogus: 1 } });
    expect(tenantPolicy.json.effective.minAmount).toBe(20000);
    expect(tenantPolicy.json.override).toEqual({ minAmount: 20000 });
  });

  it("a frozen tenant cannot request a withdrawal; unfreezing allows it", async () => {
    await call("PUT", `/superadmin/finance/tenants/${T}/policy`, ownerToken, { override: { enabled: false } });
    const blocked = await call("POST", "/withdrawals", tenantToken, { amount: 100000, ...bank });
    expect(blocked.status).toBe(403);
    expect(blocked.json.code).toBe("frozen");
    expect((await call("GET", "/superadmin/finance/overview", ownerToken)).json.items[0].frozen).toBe(true);

    await call("PUT", `/superadmin/finance/tenants/${T}/policy`, ownerToken, { override: null });
    const ok = await call("POST", "/withdrawals", tenantToken, { amount: 100000, ...bank });
    expect(ok.status).toBe(201);
    expect(Number(ok.json.netAmount)).toBe(100000);
  });

  it("enforces a closed window over HTTP", async () => {
    const todayWib = new Date(Date.now() + 7 * 3_600_000).getUTCDay();
    await call("PUT", "/superadmin/finance/policy", ownerToken, { policy: { mode: "window", days: [(todayWib + 3) % 7], fromTime: "00:00", toTime: "23:59" } });
    const closed = await call("POST", "/withdrawals", tenantToken, { amount: 100000, ...bank });
    expect(closed.status).toBe(403);
    expect(closed.json.code).toBe("closed");
    expect((await call("GET", "/withdrawals", tenantToken)).json.balance.window.open).toBe(false);
    await call("PUT", "/superadmin/finance/policy", ownerToken, { policy: { mode: "anytime" } });
  });

  it("records adjustments with a reason, refuses overdrafts, and lists everything in the ledger and CSV", async () => {
    expect((await call("POST", `/superadmin/finance/tenants/${T}/adjustments`, financeToken, { amount: 5000, note: "x" })).status).toBe(400);
    expect((await call("POST", `/superadmin/finance/tenants/${T}/adjustments`, financeToken, { amount: -999999999, note: "Terlalu besar" })).status).toBe(400);
    const made = await call("POST", `/superadmin/finance/tenants/${T}/adjustments`, financeToken, { amount: 5000, note: "Koreksi bonus event" });
    expect(made.status).toBe(201);

    const ledger = (await call("GET", `/superadmin/finance/tenants/${T}/ledger`, ownerToken)).json;
    const types = ledger.rows.map((r: { type: string }) => r.type);
    expect(types).toEqual(expect.arrayContaining(["Pembayaran QRIS", "Penyesuaian", "Penarikan"]));
    expect(ledger.rows.find((r: { type: string }) => r.type === "Penyesuaian").actor).toBe("finance@studiodo.id");

    const csv = await call("GET", `/superadmin/finance/tenants/${T}/ledger?format=csv`, ownerToken);
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(csv.text).toContain("Koreksi bonus event");
    const payouts = await call("GET", "/superadmin/finance/withdrawals.csv", financeToken);
    expect(payouts.text).toContain("1234567890");
  });

  it("finds and credits missed payments through the reconcile endpoints", async () => {
    await (holder.db as any).insert((await import("../db/schema.js")).sessions).values({ id: "30000000-0000-0000-0000-000000000002", tenantId: T, paymentMethod: "qris", paymentStatus: "success", totalAmount: "60000" }); // eslint-disable-line @typescript-eslint/no-explicit-any
    const found = (await call("GET", "/superadmin/finance/reconcile", financeToken)).json;
    expect(found.count).toBe(1);
    const done = (await call("POST", "/superadmin/finance/reconcile", financeToken, {})).json;
    expect(done).toMatchObject({ found: 1, credited: 1, amount: 60000 });
    expect((await call("GET", "/superadmin/finance/reconcile", financeToken)).json.count).toBe(0);
  });

  it("only the owner manages finance accounts", async () => {
    expect((await call("GET", "/superadmin/finance/users", financeToken)).status).toBe(403);
    expect((await call("POST", "/superadmin/finance/users", ownerToken, { email: "baru@studiodo.id", password: "short" })).status).toBe(400);
    const created = await call("POST", "/superadmin/finance/users", ownerToken, { email: "baru@studiodo.id", password: "kata-sandi-panjang" });
    expect(created.status).toBe(201);
    expect(created.json.role).toBe("finance");
    expect((await call("DELETE", `/superadmin/finance/users/${OWNER}`, ownerToken)).status).toBe(400); // an owner can't be removed from here
    expect((await call("DELETE", `/superadmin/finance/users/${created.json.id}`, ownerToken)).status).toBe(200);
  });
});
