import { and, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { platformSettings, sessions, tenants, walletLedger, withdrawals } from "../db/schema.js";
import { checkWithdrawal, mergePolicy, startOfWibDay, windowStatus, type WindowStatus, type WithdrawalPolicy } from "./withdrawalPolicy.js";

// The QRIS wallet of a platform-settled tenant (tenants.qrisSettlement = 'platform'): STUDIODO's gateway received the money,
// so the tenant is owed what the ledger says (wallet_ledger rows) minus what was already paid out or is awaiting payout.
// The ledger is append-only and every payment is credited exactly once (idempotent `ref`), with the fee frozen at that
// moment, so changing the fee or policy later never rewrites history.

type Dbx = typeof db;

export interface PayoutRules {
  feePercent: number;
  minAmount: number;
  flatFee: number;
}

export async function getPayoutRules(dbx: Dbx = db): Promise<PayoutRules> {
  const [row] = await dbx.select().from(platformSettings).limit(1);
  return {
    feePercent: Number(row?.qrisFeePercent ?? 0.7),
    minAmount: Number(row?.withdrawalMinAmount ?? 50000),
    flatFee: Number(row?.withdrawalFlatFee ?? 0),
  };
}

/** Platform default policy + this tenant's override, merged. */
export async function getEffectivePolicy(tenantId: string, dbx: Dbx = db): Promise<{ policy: WithdrawalPolicy; rules: PayoutRules }> {
  const [[platform], [tenant], rules] = await Promise.all([
    dbx.select({ policy: platformSettings.withdrawalPolicy }).from(platformSettings).limit(1),
    dbx.select({ policy: tenants.withdrawalPolicy }).from(tenants).where(eq(tenants.id, tenantId)),
    getPayoutRules(dbx),
  ]);
  return { policy: mergePolicy(platform?.policy, tenant?.policy), rules };
}

export interface QrisBalance {
  settlement: "direct" | "platform";
  since: string | null;
  grossIncome: number; // QRIS payments received by STUDIODO on the tenant's behalf
  platformFee: number; // fees kept by STUDIODO (frozen per payment)
  netIncome: number; // payments after fee + manual adjustments
  withdrawn: number; // already paid out
  pending: number; // requested but not yet paid (pending + processing)
  onHold: number; // received but still inside the hold period
  adjustments: number; // net of manual corrections (can be negative)
  available: number; // what can be requested right now (balance rules only; the policy window/limits are separate)
  paymentCount: number;
  rules: PayoutRules;
  policy: WithdrawalPolicy;
  window: Omit<WindowStatus, "nextOpenAt"> & { nextOpenAt: string | null };
}

export async function computeQrisBalance(tenantId: string, dbx: Dbx = db): Promise<QrisBalance> {
  const now = new Date();
  const [[tenant], { policy, rules }] = await Promise.all([
    dbx.select({ qrisSettlement: tenants.qrisSettlement, qrisPlatformSince: tenants.qrisPlatformSince }).from(tenants).where(eq(tenants.id, tenantId)),
    getEffectivePolicy(tenantId, dbx),
  ]);
  const settlement = tenant?.qrisSettlement === "platform" ? "platform" : "direct";
  const since = tenant?.qrisPlatformSince ?? null;

  const [ledger] = await dbx
    .select({
      gross: sql<string>`coalesce(sum(${walletLedger.grossAmount}) filter (where ${walletLedger.kind} = 'payment'), 0)`,
      fee: sql<string>`coalesce(sum(${walletLedger.feeAmount}) filter (where ${walletLedger.kind} = 'payment'), 0)`,
      paymentNet: sql<string>`coalesce(sum(${walletLedger.netAmount}) filter (where ${walletLedger.kind} = 'payment'), 0)`,
      held: sql<string>`coalesce(sum(${walletLedger.netAmount}) filter (where ${walletLedger.kind} = 'payment' and ${walletLedger.availableAt} > ${now}), 0)`,
      adjustments: sql<string>`coalesce(sum(${walletLedger.netAmount}) filter (where ${walletLedger.kind} = 'adjustment'), 0)`,
      count: sql<number>`count(*) filter (where ${walletLedger.kind} = 'payment')::int`,
    })
    .from(walletLedger)
    .where(eq(walletLedger.tenantId, tenantId));

  const rows = await dbx
    .select({ status: withdrawals.status, total: sql<string>`coalesce(sum(${withdrawals.amount}), 0)` })
    .from(withdrawals)
    .where(and(eq(withdrawals.tenantId, tenantId), inArray(withdrawals.status, ["pending", "processing", "paid"])))
    .groupBy(withdrawals.status);
  const sumOf = (...statuses: string[]) => rows.filter((r) => statuses.includes(r.status)).reduce((acc, r) => acc + Number(r.total), 0);

  const grossIncome = Number(ledger?.gross ?? 0);
  const platformFee = Number(ledger?.fee ?? 0);
  const paymentNet = Number(ledger?.paymentNet ?? 0);
  const onHold = Number(ledger?.held ?? 0);
  const adjustments = Number(ledger?.adjustments ?? 0);
  const withdrawn = sumOf("paid");
  const pending = sumOf("pending", "processing");
  const window = windowStatus(policy, now);
  return {
    settlement,
    since: since ? since.toISOString() : null,
    grossIncome,
    platformFee,
    netIncome: paymentNet + adjustments,
    withdrawn,
    pending,
    onHold,
    adjustments,
    available: settlement === "platform" ? Math.max(0, Math.floor(paymentNet - onHold + adjustments - withdrawn - pending)) : 0,
    paymentCount: Number(ledger?.count ?? 0),
    rules,
    policy,
    window: { ...window, nextOpenAt: window.nextOpenAt ? window.nextOpenAt.toISOString() : null },
  };
}

/**
 * Credits a QRIS payment that STUDIODO's gateway received for a platform-settled tenant. Safe to call twice for the same
 * session + `ref` (a webhook delivered again): the second call does nothing. Tenants that receive QRIS on their own account are skipped.
 * Never throws: a ledger hiccup must not break the customer's payment; the reconciliation tool picks up anything missed.
 */
export async function creditPlatformPayment(tenantId: string, sessionId: string, grossAmount: number, ref: string, dbx: Dbx = db): Promise<boolean> {
  try {
    if (!Number.isFinite(grossAmount) || grossAmount <= 0) return false;
    const [tenant] = await dbx.select({ qrisSettlement: tenants.qrisSettlement }).from(tenants).where(eq(tenants.id, tenantId));
    if (tenant?.qrisSettlement !== "platform") return false;
    const { policy, rules } = await getEffectivePolicy(tenantId, dbx);
    const feePercent = policy.feePercent ?? rules.feePercent;
    const fee = Math.round(grossAmount * feePercent) / 100;
    const now = new Date();
    const inserted = await dbx.insert(walletLedger).values({
      tenantId,
      kind: "payment",
      sessionId,
      ref: `${sessionId}:${ref}`, // unique per payment of that session ("session", "additional:3" …)
      grossAmount: grossAmount.toFixed(2),
      feeAmount: fee.toFixed(2),
      netAmount: (grossAmount - fee).toFixed(2),
      availableAt: new Date(now.getTime() + policy.holdDays * 86_400_000),
    }).onConflictDoNothing().returning({ id: walletLedger.id });
    return inserted.length > 0;
  } catch (error) {
    console.error("[wallet] gagal mencatat pembayaran ke ledger", { tenantId, sessionId, ref }, error);
    return false;
  }
}

/** Successful QRIS sessions of platform-settled tenants that have no ledger credit yet (a missed webhook, an old install…). */
export async function findUncreditedPayments(tenantId?: string, dbx: Dbx = db) {
  return dbx
    .select({ id: sessions.id, tenantId: sessions.tenantId, amount: sessions.totalAmount, createdAt: sessions.createdAt })
    .from(sessions)
    .innerJoin(tenants, eq(tenants.id, sessions.tenantId))
    .where(and(
      eq(tenants.qrisSettlement, "platform"),
      inArray(sessions.paymentMethod, ["qris", "doku"]),
      eq(sessions.paymentStatus, "success"),
      sql`${sessions.totalAmount} > 0`,
      sql`(${tenants.qrisPlatformSince} is null or ${sessions.createdAt} >= ${tenants.qrisPlatformSince})`,
      tenantId ? eq(sessions.tenantId, tenantId) : undefined,
      sql`not exists (select 1 from ${walletLedger} where ${walletLedger.tenantId} = ${sessions.tenantId} and ${walletLedger.kind} = 'payment' and ${walletLedger.sessionId} = ${sessions.id})`,
    ))
    .orderBy(sessions.createdAt)
    .limit(1000);
}

export async function creditMissingPayments(tenantId?: string, dbx: Dbx = db): Promise<{ found: number; credited: number; amount: number }> {
  const missing = await findUncreditedPayments(tenantId, dbx);
  let credited = 0;
  let amount = 0;
  for (const row of missing) {
    const gross = Number(row.amount ?? 0);
    if (await creditPlatformPayment(row.tenantId, row.id, gross, "session", dbx)) { credited += 1; amount += gross; }
  }
  return { found: missing.length, credited, amount };
}

export type WithdrawalInput = { amount: number; bankName: string; accountNumber: string; accountName: string; note: string | null; requestedBy: string | null };
export type WithdrawalResult = { ok: true; row: typeof withdrawals.$inferSelect } | { ok: false; status: number; error: string; code?: string };

/**
 * Creates a withdrawal request. The balance check and the insert run in one transaction under a per-tenant advisory lock,
 * so two requests sent at the same instant (double tap, two devices) cannot both spend the same money.
 */
export async function createWithdrawal(tenantId: string, input: WithdrawalInput): Promise<WithdrawalResult> {
  return db.transaction(async (tx) => {
    const dbx = tx as unknown as Dbx;
    await dbx.execute(sql`select pg_advisory_xact_lock(hashtext(${`withdrawal:${tenantId}`}))`);
    const balance = await computeQrisBalance(tenantId, dbx);
    if (balance.settlement !== "platform") {
      return { ok: false as const, status: 403, error: "Akun ini menerima QRIS langsung di rekening Xendit sendiri, jadi tidak ada saldo yang perlu ditarik." };
    }
    const now = new Date();
    const [today] = await dbx
      .select({ count: sql<number>`count(*)::int`, amount: sql<string>`coalesce(sum(${withdrawals.amount}), 0)` })
      .from(withdrawals)
      .where(and(eq(withdrawals.tenantId, tenantId), ne(withdrawals.status, "rejected"), gte(withdrawals.requestedAt, startOfWibDay(now))));
    const [last] = await dbx
      .select({ at: withdrawals.requestedAt })
      .from(withdrawals)
      .where(and(eq(withdrawals.tenantId, tenantId), ne(withdrawals.status, "rejected")))
      .orderBy(desc(withdrawals.requestedAt))
      .limit(1);
    const flatFee = balance.policy.flatFee ?? balance.rules.flatFee;
    const check = checkWithdrawal(balance.policy, {
      now,
      amount: input.amount,
      available: balance.available,
      platformMinAmount: balance.rules.minAmount,
      flatFee,
      requestsToday: { count: today?.count ?? 0, amount: Number(today?.amount ?? 0) },
      lastRequestAt: last?.at ?? null,
    });
    if (!check.ok) return { ok: false as const, status: check.code === "frozen" || check.code === "closed" ? 403 : 400, error: check.error, code: check.code };

    // Account-takeover protection: a tenant that has been paid before but never to THIS account gets a waiting period.
    let holdUntil: Date | null = null;
    if (balance.policy.newAccountHoldHours > 0) {
      const [paidBefore] = await dbx
        .select({
          any: sql<number>`count(*)::int`,
          sameAccount: sql<number>`count(*) filter (where ${withdrawals.accountNumber} = ${input.accountNumber} and lower(${withdrawals.bankName}) = lower(${input.bankName}))::int`,
        })
        .from(withdrawals)
        .where(and(eq(withdrawals.tenantId, tenantId), eq(withdrawals.status, "paid")));
      if ((paidBefore?.any ?? 0) > 0 && (paidBefore?.sameAccount ?? 0) === 0) holdUntil = new Date(now.getTime() + balance.policy.newAccountHoldHours * 3_600_000);
    }
    const requiresApproval = balance.policy.approvalThreshold > 0 && input.amount >= balance.policy.approvalThreshold;

    const [row] = await dbx.insert(withdrawals).values({
      requiresApproval,
      holdUntil,
      tenantId,
      amount: input.amount.toFixed(2),
      feeAmount: flatFee.toFixed(2),
      netAmount: (input.amount - flatFee).toFixed(2),
      bankName: input.bankName,
      accountNumber: input.accountNumber,
      accountName: input.accountName,
      requestNote: input.note,
      requestedBy: input.requestedBy,
    }).returning();
    return { ok: true as const, row };
  });
}
