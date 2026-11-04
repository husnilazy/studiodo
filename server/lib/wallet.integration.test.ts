import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Integration test for the tenant wallet (ledger, hold, policy, withdrawals) against a REAL Postgres engine (PGlite, in memory)
// with every migration applied — so the SQL, the unique `ref`, the transaction and the advisory lock are exercised, not mocked.
// PGlite is not a dependency of this repo: point PGLITE_MODULE at an installed copy; without it the suite skips itself.
//   PGLITE_MODULE="file:///…/node_modules/@electric-sql/pglite/dist/index.js" npx vitest run server/lib/wallet.integration.test.ts

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

const PLATFORM = "00000000-0000-0000-0000-0000000000a1";
const DIRECT = "00000000-0000-0000-0000-0000000000a2";
const FROZEN = "00000000-0000-0000-0000-0000000000a3";
const bank = { bankName: "BCA", accountNumber: "1234567890", accountName: "Budi", note: null, requestedBy: "budi@x.com" };

describe.skipIf(!PGlite)("tenant wallet (ledger + policy + withdrawals, real SQL)", () => {
  let pg: InstanceType<NonNullable<typeof PGlite>>;
  let wallet: typeof import("./qrisBalance.js");
  let schema: typeof import("../db/schema.js");
  let db: any; // eslint-disable-line @typescript-eslint/no-explicit-any

  const setPlatformPolicy = async (policy: Record<string, unknown>, fee = "0.70", min = 50000, flat = 0) => {
    await db.update(schema.platformSettings).set({ withdrawalPolicy: policy, qrisFeePercent: fee, withdrawalMinAmount: min, withdrawalFlatFee: flat });
  };
  const resetWallet = async () => {
    await pg.exec(`DELETE FROM withdrawals; DELETE FROM wallet_ledger; DELETE FROM sessions;`);
    await db.update(schema.tenants).set({ withdrawalPolicy: null });
    await setPlatformPolicy({});
  };
  const mkSession = async (tenantId: string, amount: string, over: Record<string, unknown> = {}) => {
    const [row] = await db.insert(schema.sessions).values({ tenantId, paymentMethod: "qris", paymentStatus: "success", totalAmount: amount, ...over }).returning();
    return row.id as string;
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
    wallet = await import("./qrisBalance.js");
    await pg.exec(`
      INSERT INTO tenants (id, name, slug, plan, qris_settlement) VALUES
        ('${PLATFORM}', 'Studio Platform', 'studio-platform', 'trial', 'platform'),
        ('${DIRECT}', 'Studio Langsung', 'studio-langsung', 'trial', 'direct'),
        ('${FROZEN}', 'Studio Beku', 'studio-beku', 'trial', 'platform');
      INSERT INTO platform_settings (default_trial_days) VALUES (14);
    `);
  }, 120_000);

  afterAll(() => { holder.db = undefined; });

  it("credits a payment once, with the fee frozen at that moment", async () => {
    await resetWallet();
    const session = await mkSession(PLATFORM, "100000");
    expect(await wallet.creditPlatformPayment(PLATFORM, session, 100000, "session")).toBe(true);
    expect(await wallet.creditPlatformPayment(PLATFORM, session, 100000, "session")).toBe(false); // webhook delivered twice

    let balance = await wallet.computeQrisBalance(PLATFORM);
    expect(balance.grossIncome).toBe(100000);
    expect(balance.platformFee).toBe(700); // 0.70 %
    expect(balance.available).toBe(99300);
    expect(balance.paymentCount).toBe(1);

    await setPlatformPolicy({}, "3.00"); // a later fee change must not touch the old payment
    balance = await wallet.computeQrisBalance(PLATFORM);
    expect(balance.platformFee).toBe(700);
    const session2 = await mkSession(PLATFORM, "100000");
    await wallet.creditPlatformPayment(PLATFORM, session2, 100000, "session");
    balance = await wallet.computeQrisBalance(PLATFORM);
    expect(balance.platformFee).toBe(700 + 3000);
  });

  it("does not credit tenants that receive QRIS on their own account", async () => {
    await resetWallet();
    const session = await mkSession(DIRECT, "50000");
    expect(await wallet.creditPlatformPayment(DIRECT, session, 50000, "session")).toBe(false);
    const balance = await wallet.computeQrisBalance(DIRECT);
    expect(balance.settlement).toBe("direct");
    expect(balance.available).toBe(0);
  });

  it("keeps a payment on hold until the hold period has passed", async () => {
    await resetWallet();
    await setPlatformPolicy({ holdDays: 2 });
    const session = await mkSession(PLATFORM, "200000");
    await wallet.creditPlatformPayment(PLATFORM, session, 200000, "session");
    let balance = await wallet.computeQrisBalance(PLATFORM);
    expect(balance.onHold).toBe(198600);
    expect(balance.available).toBe(0);
    // pretend the hold period is over
    await pg.exec(`UPDATE wallet_ledger SET available_at = now() - interval '1 minute'`);
    balance = await wallet.computeQrisBalance(PLATFORM);
    expect(balance.onHold).toBe(0);
    expect(balance.available).toBe(198600);
  });

  it("creates a withdrawal and subtracts it from what is available", async () => {
    await resetWallet();
    await wallet.creditPlatformPayment(PLATFORM, await mkSession(PLATFORM, "300000"), 300000, "session");
    const result = await wallet.createWithdrawal(PLATFORM, { amount: 100000, ...bank });
    expect(result.ok).toBe(true);
    const balance = await wallet.computeQrisBalance(PLATFORM);
    expect(balance.pending).toBe(100000);
    expect(balance.available).toBe(300000 - 2100 - 100000);
  });

  it("never lets two simultaneous requests spend the same money", async () => {
    await resetWallet();
    await wallet.creditPlatformPayment(PLATFORM, await mkSession(PLATFORM, "100000"), 100000, "session"); // available 99 300
    const results = await Promise.all([
      wallet.createWithdrawal(PLATFORM, { amount: 60000, ...bank }),
      wallet.createWithdrawal(PLATFORM, { amount: 60000, ...bank }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const failed = results.find((r) => !r.ok) as { ok: false; code?: string };
    expect(failed.code).toBe("balance");
    expect((await wallet.computeQrisBalance(PLATFORM)).available).toBe(99300 - 60000);
  });

  it("applies the platform minimum, the per-request maximum and the daily limits", async () => {
    await resetWallet();
    await wallet.creditPlatformPayment(PLATFORM, await mkSession(PLATFORM, "1000000"), 1000000, "session");
    const code = async (amount: number) => { const r = await wallet.createWithdrawal(PLATFORM, { amount, ...bank }); return r.ok ? "ok" : r.code; };

    expect(await code(10000)).toBe("min");
    await setPlatformPolicy({ maxAmount: 200000 });
    expect(await code(300000)).toBe("max");
    await setPlatformPolicy({ dailyMaxCount: 1 });
    expect(await code(60000)).toBe("ok");
    expect(await code(60000)).toBe("daily_count");
    await setPlatformPolicy({ dailyMaxAmount: 100000 });
    expect(await code(60000)).toBe("daily_amount");
  });

  it("closes outside the allowed days and reopens when the platform says so", async () => {
    await resetWallet();
    await wallet.creditPlatformPayment(PLATFORM, await mkSession(PLATFORM, "500000"), 500000, "session");
    const todayWib = new Date(Date.now() + 7 * 3_600_000).getUTCDay();
    const otherDay = (todayWib + 3) % 7;
    await setPlatformPolicy({ mode: "window", days: [otherDay], fromTime: "00:00", toTime: "23:59" });
    const closed = await wallet.createWithdrawal(PLATFORM, { amount: 100000, ...bank });
    expect(closed.ok).toBe(false);
    expect((closed as { code?: string }).code).toBe("closed");
    await setPlatformPolicy({ mode: "anytime" });
    expect((await wallet.createWithdrawal(PLATFORM, { amount: 100000, ...bank })).ok).toBe(true);
  });

  it("lets a tenant override win over the platform default, and freezing blocks payouts", async () => {
    await resetWallet();
    await wallet.creditPlatformPayment(FROZEN, await mkSession(FROZEN, "500000"), 500000, "session");
    await setPlatformPolicy({ minAmount: 400000 });
    await db.update(schema.tenants).set({ withdrawalPolicy: { minAmount: 50000 } }).where(eq(schema.tenants.id, FROZEN));
    expect((await wallet.createWithdrawal(FROZEN, { amount: 60000, ...bank })).ok).toBe(true);
    await db.update(schema.tenants).set({ withdrawalPolicy: { enabled: false } }).where(eq(schema.tenants.id, FROZEN));
    const frozen = await wallet.createWithdrawal(FROZEN, { amount: 60000, ...bank });
    expect((frozen as { code?: string }).code).toBe("frozen");
  });

  it("counts manual adjustments (and a rejected withdrawal gives the money back)", async () => {
    await resetWallet();
    await wallet.creditPlatformPayment(PLATFORM, await mkSession(PLATFORM, "100000"), 100000, "session");
    await db.insert(schema.walletLedger).values({ tenantId: PLATFORM, kind: "adjustment", ref: "adj:1", netAmount: "5000.00", note: "Koreksi uji", actor: "finance@x.com" });
    await db.insert(schema.walletLedger).values({ tenantId: PLATFORM, kind: "adjustment", ref: "adj:2", netAmount: "-1000.00", note: "Koreksi uji 2", actor: "finance@x.com" });
    let balance = await wallet.computeQrisBalance(PLATFORM);
    expect(balance.adjustments).toBe(4000);
    expect(balance.available).toBe(99300 + 4000);

    const made = await wallet.createWithdrawal(PLATFORM, { amount: 60000, ...bank });
    expect(made.ok).toBe(true);
    await db.update(schema.withdrawals).set({ status: "rejected" }).where(eq(schema.withdrawals.tenantId, PLATFORM));
    balance = await wallet.computeQrisBalance(PLATFORM);
    expect(balance.pending).toBe(0);
    expect(balance.available).toBe(99300 + 4000);
  });

  it("finds payments that never reached the ledger and credits them exactly once", async () => {
    await resetWallet();
    const missed = await mkSession(PLATFORM, "75000");
    const credited = await mkSession(PLATFORM, "25000");
    await wallet.creditPlatformPayment(PLATFORM, credited, 25000, "session");
    await mkSession(DIRECT, "99999"); // a direct tenant's payment is not ours to credit
    await mkSession(PLATFORM, "30000", { paymentMethod: "voucher" }); // no money moved

    const found = await wallet.findUncreditedPayments();
    expect(found.map((r: { id: string }) => r.id)).toEqual([missed]);

    expect(await wallet.creditMissingPayments()).toMatchObject({ found: 1, credited: 1, amount: 75000 });
    expect(await wallet.creditMissingPayments()).toMatchObject({ found: 0, credited: 0 });
    expect((await wallet.computeQrisBalance(PLATFORM)).grossIncome).toBe(100000);
  });
  it("migration 0043 carries existing platform balances over into the ledger (and skips direct tenants / non-QRIS)", async () => {
    await resetWallet();
    await setPlatformPolicy({}, "0.70");
    await mkSession(PLATFORM, "100000");
    await mkSession(PLATFORM, "50000");
    await mkSession(PLATFORM, "20000", { paymentMethod: "voucher" });
    await mkSession(PLATFORM, "20000", { paymentStatus: "pending" });
    await mkSession(DIRECT, "70000");
    const sql = fs.readFileSync(path.resolve(__dirname, "../db/migrations/0043_wallet_ledger_policy.sql"), "utf8");
    const backfill = sql.split("--> statement-breakpoint").find((part) => part.includes('INSERT INTO "wallet_ledger"'))!;
    await pg.exec(backfill);
    await pg.exec(backfill); // running it twice must not double the balance
    const balance = await wallet.computeQrisBalance(PLATFORM);
    expect(balance.grossIncome).toBe(150000);
    expect(balance.platformFee).toBe(1050);
    expect(balance.available).toBe(148950);
    expect((await wallet.computeQrisBalance(DIRECT)).grossIncome).toBe(0);
    expect((await wallet.findUncreditedPayments()).length).toBe(0); // the credits the migration wrote count as credited
  });
});
