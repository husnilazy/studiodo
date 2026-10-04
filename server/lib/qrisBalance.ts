import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { platformSettings, sessions, tenants, withdrawals } from "../db/schema.js";

// QRIS balance of a platform-settled tenant (tenants.qrisSettlement = 'platform'): STUDIODO's Xendit account received
// the money, so the tenant is owed  qris income − STUDIODO's fee − what was already paid out or is awaiting payout.
// Derived on demand from sessions + withdrawals (no stored running balance that could drift out of sync).

export interface PayoutRules {
  feePercent: number;
  minAmount: number;
  flatFee: number;
}

export async function getPayoutRules(): Promise<PayoutRules> {
  const [row] = await db.select().from(platformSettings).limit(1);
  return {
    feePercent: Number(row?.qrisFeePercent ?? 0.7),
    minAmount: Number(row?.withdrawalMinAmount ?? 50000),
    flatFee: Number(row?.withdrawalFlatFee ?? 0),
  };
}

export interface QrisBalance {
  settlement: "direct" | "platform";
  since: string | null;
  grossIncome: number; // QRIS payments received by STUDIODO on the tenant's behalf
  platformFee: number; // feePercent of grossIncome
  netIncome: number; // grossIncome − platformFee
  withdrawn: number; // already paid out
  pending: number; // requested but not yet paid (pending + processing)
  available: number; // what can be requested right now
  paymentCount: number;
  rules: PayoutRules;
}

export async function computeQrisBalance(tenantId: string): Promise<QrisBalance> {
  const [[tenant], rules] = await Promise.all([
    db.select({ qrisSettlement: tenants.qrisSettlement, qrisPlatformSince: tenants.qrisPlatformSince }).from(tenants).where(eq(tenants.id, tenantId)),
    getPayoutRules(),
  ]);
  const settlement = tenant?.qrisSettlement === "platform" ? "platform" : "direct";
  const since = tenant?.qrisPlatformSince ?? null;

  let grossIncome = 0;
  let paymentCount = 0;
  if (settlement === "platform") {
    const [row] = await db
      .select({
        total: sql<string>`coalesce(sum(${sessions.totalAmount}), 0)`,
        count: sql<number>`count(*)::int`,
      })
      .from(sessions)
      .where(and(
        eq(sessions.tenantId, tenantId),
        eq(sessions.paymentMethod, "qris"),
        eq(sessions.paymentStatus, "success"),
        since ? gte(sessions.createdAt, since) : undefined,
      ));
    grossIncome = Number(row?.total ?? 0);
    paymentCount = row?.count ?? 0;
  }

  const rows = await db
    .select({ status: withdrawals.status, total: sql<string>`coalesce(sum(${withdrawals.amount}), 0)` })
    .from(withdrawals)
    .where(and(eq(withdrawals.tenantId, tenantId), inArray(withdrawals.status, ["pending", "processing", "paid"])))
    .groupBy(withdrawals.status);
  const sumOf = (...statuses: string[]) => rows.filter((r) => statuses.includes(r.status)).reduce((acc, r) => acc + Number(r.total), 0);

  const platformFee = Math.round(grossIncome * rules.feePercent) / 100;
  const netIncome = grossIncome - platformFee;
  const withdrawn = sumOf("paid");
  const pending = sumOf("pending", "processing");
  return {
    settlement,
    since: since ? since.toISOString() : null,
    grossIncome,
    platformFee,
    netIncome,
    withdrawn,
    pending,
    available: Math.max(0, Math.floor(netIncome - withdrawn - pending)),
    paymentCount,
    rules,
  };
}
