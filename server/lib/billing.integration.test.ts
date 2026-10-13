import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Integration test for the money path (settleOrder) against a REAL Postgres engine (PGlite, in memory) with the real
// migrations applied — so the SQL, the transaction and the per-booth licence rules are exercised, not mocked.
// PGlite is not a dependency of this repo: point PGLITE_MODULE at an installed copy (a file:// URL or package name) to run
// it; without that the suite skips itself.
//   PGLITE_MODULE="file:///…/node_modules/@electric-sql/pglite/dist/index.js" npx vitest run server/lib/billing.integration.test.ts

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

const DAY = 24 * 60 * 60 * 1000;
const TENANT = "00000000-0000-0000-0000-0000000000aa";
const PLAN = "00000000-0000-0000-0000-0000000000bb";
const K_PAID = "10000000-0000-0000-0000-000000000001";
const K_TRIAL = "10000000-0000-0000-0000-000000000002";
const K_UNPAID = "10000000-0000-0000-0000-000000000003";
const K_REVOKED = "10000000-0000-0000-0000-000000000004";

describe.skipIf(!PGlite)("settleOrder (per-booth licences, real SQL)", () => {
  let pg: InstanceType<NonNullable<typeof PGlite>>;
  let billing: typeof import("./billing.js");
  let schema: typeof import("../db/schema.js");
  let db: any; // eslint-disable-line @typescript-eslint/no-explicit-any

  const q = async (sql: string) => (await pg.query(sql)).rows;
  // Dates are read through drizzle (like production code does): PGlite's raw parser would read a timestamp WITHOUT time zone
  // as local time, which is not how the real driver treats it.
  const endsOf = async (id: string) => {
    const [row] = await db.select({ t: schema.kioskKeys.licenseType, e: schema.kioskKeys.licenseEndsAt }).from(schema.kioskKeys).where(eq(schema.kioskKeys.id, id));
    return { type: row.t as string, ends: row.e ? (row.e as Date).getTime() : null };
  };
  const mkOrder = async (orderId: string, items: { keyId: string | null; label: string | null }[], over: Record<string, unknown> = {}) => {
    const [order] = await db.insert(schema.billingOrders).values({
      orderId, provider: "xendit", tenantId: TENANT, planId: PLAN, planName: "Pro", amount: "300000", periodDays: 30,
      items, boothCount: items.length, discountPercent: 0, ...over,
    }).returning();
    return order;
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = "integration-test-secret";
    pg = new PGlite!();
    const dir = path.resolve(__dirname, "../db/migrations");
    const journal = JSON.parse(fs.readFileSync(path.join(dir, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
    for (const { tag } of journal.entries) {
      for (const stmt of fs.readFileSync(path.join(dir, `${tag}.sql`), "utf8").split("--> statement-breakpoint")) {
        if (stmt.trim()) await pg.exec(stmt);
      }
    }
    const { drizzle } = await import("drizzle-orm/pglite");
    schema = await import("../db/schema.js");
    db = drizzle(pg as never, { schema });
    holder.db = db;
    billing = await import("./billing.js");

    const now = Date.now();
    await pg.exec(`
      INSERT INTO tenants (id, name, slug, plan, subscription_ends_at) VALUES ('${TENANT}', 'Uji', 'uji', 'trial', now());
      INSERT INTO plans (id, name, slug, price) VALUES ('${PLAN}', 'Pro', 'pro', '150000');
      INSERT INTO kiosk_keys (id, tenant_id, key_hash, label, license_type, license_ends_at) VALUES
        ('${K_PAID}', '${TENANT}', 'h-paid', 'Paid', 'paid', '${new Date(now + 5 * DAY).toISOString()}'),
        ('${K_TRIAL}', '${TENANT}', 'h-trial', 'Trial', 'trial', '${new Date(now - 2 * DAY).toISOString()}'),
        ('${K_UNPAID}', '${TENANT}', 'h-unpaid', 'Unpaid', 'unpaid', NULL);
      INSERT INTO kiosk_keys (id, tenant_id, key_hash, label, license_type, license_ends_at, revoked_at) VALUES
        ('${K_REVOKED}', '${TENANT}', 'h-rev', 'Revoked', 'paid', '${new Date(now + 5 * DAY).toISOString()}', now());
    `);
  }, 120_000);

  afterAll(() => { holder.db = undefined; });

  it("renews every booth in the order, converts trial/unpaid to paid, creates new booths, and records the payment", async () => {
    const before = Date.now();
    const paidBefore = (await endsOf(K_PAID)).ends!;
    const order = await mkOrder("SDO-T1", [
      { keyId: K_PAID, label: null }, { keyId: K_TRIAL, label: null }, { keyId: K_UNPAID, label: null }, { keyId: null, label: "Booth Baru" },
    ], { amount: "540000", boothCount: 4, discountPercent: 10 });

    expect(await billing.settleOrder(order, "paid", "qris")).toBe("paid");

    const paid = await endsOf(K_PAID);
    expect(paid.type).toBe("paid");
    expect(paid.ends).toBe(paidBefore + 30 * DAY); // early renewal keeps the 5 remaining days

    const trial = await endsOf(K_TRIAL);
    expect(trial.type).toBe("paid"); // a payment turns a trial into a full subscription
    expect(trial.ends!).toBeGreaterThanOrEqual(before + 30 * DAY - 1000); // expired trial counts from now, not from the past

    const unpaid = await endsOf(K_UNPAID);
    expect(unpaid.type).toBe("paid");
    expect(unpaid.ends!).toBeGreaterThanOrEqual(before + 30 * DAY - 1000);

    const [created] = await db.select().from(schema.kioskKeys).where(eq(schema.kioskKeys.label, "Booth Baru"));
    expect(created.licenseType).toBe("paid");
    expect(created.licenseEndsAt.getTime()).toBeGreaterThanOrEqual(before + 30 * DAY - 1000);
    const { hashKioskKey } = await import("./license.js");
    expect(hashKioskKey(created.rawKey)).toBe(created.keyHash); // the stored key really is the one that authenticates

    expect((await endsOf(K_REVOKED)).ends!).toBeLessThan(before + 10 * DAY); // revoked booth untouched

    const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, TENANT));
    expect(tenant.plan).toBe("pro");
    expect(tenant.subscriptionEndsAt.getTime()).toBeGreaterThanOrEqual(before + 30 * DAY - 1000); // mirrors the latest booth end

    const [pay] = await q(`SELECT amount, method, note FROM tenant_payments WHERE tenant_id='${TENANT}'`);
    expect(Number(pay.amount)).toBe(540000);
    expect(String(pay.note)).toContain("4 booth");
    expect(String(pay.note)).toContain("diskon 10%");
  });

  it("a repeated notification is a no-op (no double extension)", async () => {
    const [row] = await q(`SELECT id FROM billing_orders WHERE order_id='SDO-T1'`);
    const [order] = await db.select().from(schema.billingOrders).where(eq(schema.billingOrders.id, row.id as string));
    const paidEnd = (await endsOf(K_PAID)).ends;
    expect(await billing.settleOrder(order, "paid", "qris")).toBe("duplicate");
    expect((await endsOf(K_PAID)).ends).toBe(paidEnd);
    const [{ n }] = await q(`SELECT count(*)::int AS n FROM tenant_payments WHERE tenant_id='${TENANT}'`);
    expect(n).toBe(1);
  });

  it("rolls everything back when a step fails, so the gateway can retry (never paid-but-not-activated)", async () => {
    const order = await mkOrder("SDO-T2", [{ keyId: K_PAID, label: null }]);
    const endBefore = (await endsOf(K_PAID)).ends;
    // Corrupt the in-memory copy so the payment-record insert (last step, after the extension) blows up.
    await expect(billing.settleOrder({ ...order, amount: "not-a-number" }, "paid", null)).rejects.toThrow();
    expect((await endsOf(K_PAID)).ends).toBe(endBefore);
    const [row] = await q(`SELECT status FROM billing_orders WHERE order_id='SDO-T2'`);
    expect(row.status).toBe("pending");
    // …and a clean retry then succeeds.
    expect(await billing.settleOrder(order, "paid", null)).toBe("paid");
    expect((await endsOf(K_PAID)).ends).toBe(endBefore! + 30 * DAY);
  });

  it("an order made before per-booth licences (no items) renews every active booth", async () => {
    const order = await mkOrder("SDO-T3", []);
    const before = await endsOf(K_PAID);
    expect(await billing.settleOrder(order, "paid", null)).toBe("paid");
    expect((await endsOf(K_PAID)).ends).toBe(before.ends! + 30 * DAY);
  });

  it("failed / expired notifications only close a still-pending order", async () => {
    const pending = await mkOrder("SDO-T4", [{ keyId: K_PAID, label: null }]);
    expect(await billing.settleOrder(pending, "expired", null)).toBe("closed");
    expect(await billing.settleOrder(pending, "failed", null)).toBe("ignored");
    const [row] = await q(`SELECT status FROM billing_orders WHERE order_id='SDO-T4'`);
    expect(row.status).toBe("expired");
  });

  describe("kiosk gate", () => {
    const fakeRes = () => {
      const res: { statusCode: number; body: unknown; status: (n: number) => typeof res; json: (b: unknown) => typeof res } = {
        statusCode: 200, body: undefined,
        status(n) { res.statusCode = n; return res; },
        json(b) { res.body = b; return res; },
      };
      return res;
    };
    const auth = async (rawKey: string, deviceId: string) => {
      const { requireKioskAuth, clearKioskAuthCache } = await import("../middleware/kioskAuth.js");
      clearKioskAuthCache();
      const req = { headers: { "x-kiosk-key": rawKey, "x-device-id": deviceId } } as never;
      const res = fakeRes();
      let passed = false;
      await requireKioskAuth(req, res as never, () => { passed = true; });
      return { passed, res, req: req as { tenantId?: string; kioskKeyId?: string } };
    };

    it("issues keys with the right licence, and locks them by type and date", async () => {
      const lic = await import("./license.js");
      const trial = await lic.issueKioskKey(TENANT, { label: "Trial A", kind: "trial", days: 3 });
      const unpaid = await lic.issueKioskKey(TENANT, { label: "Kosong", kind: "unpaid" });
      lic.clearLicenseCache();
      expect((await lic.getKeyLock(trial.id)).locked).toBe(false);
      expect((await lic.getKeyLock(unpaid.id)).reason).toBe("unpaid");
      await db.update(schema.kioskKeys).set({ licenseEndsAt: new Date(Date.now() - 1000) }).where(eq(schema.kioskKeys.id, trial.id));
      lic.clearLicenseCache();
      expect(await lic.getKeyLock(trial.id)).toMatchObject({ locked: true, reason: "trial_expired" });
    });

    it("blocks new transactions on a locked booth but lets a running one through", async () => {
      const lic = await import("./license.js");
      const { requireActiveSubscription } = await import("../middleware/requireActiveSubscription.js");
      const unpaid = await lic.issueKioskKey(TENANT, { label: "Gate unpaid", kind: "unpaid" });
      const running = await lic.issueKioskKey(TENANT, { label: "Gate running", kind: "paid", days: 10 });
      lic.clearLicenseCache();

      const blocked = fakeRes();
      let nextCalled = false;
      await requireActiveSubscription({ kioskKeyId: unpaid.id } as never, blocked as never, () => { nextCalled = true; });
      expect(nextCalled).toBe(false);
      expect(blocked.statusCode).toBe(403);
      expect(blocked.body).toMatchObject({ code: "subscription_locked", reason: "unpaid" });

      const ok = fakeRes();
      await requireActiveSubscription({ kioskKeyId: running.id } as never, ok as never, () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
    });

    it("one free trial per computer: a PC that ran a trial cannot start another, but can use a paid key", async () => {
      const lic = await import("./license.js");
      const t1 = await lic.issueKioskKey(TENANT, { label: "Trial PC-1", kind: "trial", days: 7 });
      const t2 = await lic.issueKioskKey(TENANT, { label: "Trial PC-1 lagi", kind: "trial", days: 7 });
      const paid = await lic.issueKioskKey(TENANT, { label: "Paid PC-1", kind: "paid", days: 30 });

      expect((await auth(t1.rawKey, "device-PC1")).passed).toBe(true);
      const second = await auth(t2.rawKey, "device-PC1");
      expect(second.passed).toBe(false);
      expect(second.res.statusCode).toBe(403);
      expect(second.res.body).toMatchObject({ code: "trial_already_used" });

      expect((await auth(paid.rawKey, "device-PC1")).passed).toBe(true); // a real subscription is welcome on the same PC
      expect((await auth(t2.rawKey, "device-PC2")).passed).toBe(true); // a different computer may take that trial
      expect((await auth(t1.rawKey, "device-PC9")).res.body).toMatchObject({ code: "kiosk_device_mismatch" }); // still 1 key = 1 device
    });
  });
});
