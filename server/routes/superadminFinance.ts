import { ts } from "../lib/sqlDate.js";
import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { platformSettings, superadmins, tenants, walletLedger, withdrawals } from "../db/schema.js";
import { validateUuidParam } from "../middleware/validateUuidParam.js";
import { hashPassword } from "../lib/passwordHash.js";
import { logEvent } from "../lib/platformEvents.js";
import { computeQrisBalance, creditMissingPayments, findUncreditedPayments, getEffectivePolicy, getPayoutRules } from "../lib/qrisBalance.js";
import { DEFAULT_WITHDRAWAL_POLICY, describeSchedule, mergePolicy, sanitizePolicy } from "../lib/withdrawalPolicy.js";

// Money management for the platform team (mounted at /api/superadmin/finance, behind requireSuperadminAuth).
// Both roles — 'owner' and 'finance' — can use everything here except managing the finance accounts themselves.
export const superadminFinanceRouter = Router();
superadminFinanceRouter.param("id", validateUuidParam("Tenant tidak ditemukan"));

async function whoAmI(req: Request) {
  const [row] = await db.select({ email: superadmins.email, role: superadmins.role }).from(superadmins).where(eq(superadmins.id, req.superadminId!));
  return { email: row?.email ?? null, role: row?.role ?? "owner" };
}

const rp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? "" : value instanceof Date ? value.toISOString() : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const sendCsv = (res: Response, name: string, header: string[], rows: unknown[][]) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  res.send("﻿" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n"));
};

// GET /finance/overview — what the platform owes tenants right now, per tenant and in total
superadminFinanceRouter.get("/overview", async (_req, res) => {
  const now = new Date();
  const [tenantRows, ledgerRows, withdrawalRows, rules] = await Promise.all([
    db.select({ id: tenants.id, name: tenants.name, since: tenants.qrisPlatformSince, override: tenants.withdrawalPolicy }).from(tenants).where(eq(tenants.qrisSettlement, "platform")),
    db.select({
      tenantId: walletLedger.tenantId,
      gross: sql<string>`coalesce(sum(${walletLedger.grossAmount}) filter (where ${walletLedger.kind} = 'payment'), 0)`,
      fee: sql<string>`coalesce(sum(${walletLedger.feeAmount}) filter (where ${walletLedger.kind} = 'payment'), 0)`,
      paymentNet: sql<string>`coalesce(sum(${walletLedger.netAmount}) filter (where ${walletLedger.kind} = 'payment'), 0)`,
      held: sql<string>`coalesce(sum(${walletLedger.netAmount}) filter (where ${walletLedger.kind} = 'payment' and ${walletLedger.availableAt} > ${ts(now)}), 0)`,
      adjustments: sql<string>`coalesce(sum(${walletLedger.netAmount}) filter (where ${walletLedger.kind} = 'adjustment'), 0)`,
      lastPaymentAt: sql<string | null>`max(${walletLedger.createdAt}) filter (where ${walletLedger.kind} = 'payment')`,
    }).from(walletLedger).groupBy(walletLedger.tenantId),
    db.select({
      tenantId: withdrawals.tenantId,
      paid: sql<string>`coalesce(sum(${withdrawals.amount}) filter (where ${withdrawals.status} = 'paid'), 0)`,
      pending: sql<string>`coalesce(sum(${withdrawals.amount}) filter (where ${withdrawals.status} in ('pending', 'processing')), 0)`,
      openCount: sql<number>`count(*) filter (where ${withdrawals.status} in ('pending', 'processing'))::int`,
    }).from(withdrawals).groupBy(withdrawals.tenantId),
    getPayoutRules(),
  ]);
  const ledgerBy = new Map(ledgerRows.map((r) => [r.tenantId, r]));
  const wdBy = new Map(withdrawalRows.map((r) => [r.tenantId, r]));

  const items = tenantRows.map((t) => {
    const l = ledgerBy.get(t.id);
    const w = wdBy.get(t.id);
    const paymentNet = Number(l?.paymentNet ?? 0);
    const held = Number(l?.held ?? 0);
    const adjustments = Number(l?.adjustments ?? 0);
    const paid = Number(w?.paid ?? 0);
    const pending = Number(w?.pending ?? 0);
    const frozen = (t.override as { enabled?: unknown } | null)?.enabled === false;
    return {
      tenantId: t.id,
      name: t.name,
      frozen,
      hasOverride: Boolean(t.override && Object.keys(t.override).length > 0),
      gross: Number(l?.gross ?? 0),
      fee: Number(l?.fee ?? 0),
      onHold: held,
      adjustments,
      withdrawn: paid,
      pending,
      openRequests: w?.openCount ?? 0,
      available: Math.max(0, Math.floor(paymentNet - held + adjustments - paid - pending)),
      owed: Math.round((paymentNet + adjustments - paid) * 100) / 100, // everything still owed to the tenant: available + on hold + awaiting payout
      lastPaymentAt: l?.lastPaymentAt ?? null,
    };
  }).sort((a, b) => b.owed - a.owed);

  const sum = (pick: (i: (typeof items)[number]) => number) => items.reduce((acc, i) => acc + pick(i), 0);
  const uncredited = await findUncreditedPayments();
  res.json({
    rules,
    totals: {
      tenants: items.length,
      gross: sum((i) => i.gross),
      feesEarned: sum((i) => i.fee),
      owed: sum((i) => i.owed),
      available: sum((i) => i.available),
      onHold: sum((i) => i.onHold),
      awaitingPayout: sum((i) => i.pending),
      paidOut: sum((i) => i.withdrawn),
      frozenTenants: items.filter((i) => i.frozen).length,
    },
    items,
    uncredited: { count: uncredited.length, amount: uncredited.reduce((acc, r) => acc + Number(r.amount ?? 0), 0) },
  });
});

// GET /finance/policy — the platform default policy (+ the fee/minimum rules shown next to it)
superadminFinanceRouter.get("/policy", async (_req, res) => {
  const [row] = await db.select({ policy: platformSettings.withdrawalPolicy }).from(platformSettings).limit(1);
  const policy = mergePolicy(row?.policy, null);
  res.json({ policy, defaults: DEFAULT_WITHDRAWAL_POLICY, rules: await getPayoutRules(), summary: describeSchedule(policy) });
});

// PUT /finance/policy — { policy: {...partial} } replaces the platform default (unknown/invalid fields are dropped)
superadminFinanceRouter.put("/policy", async (req, res) => {
  const clean = sanitizePolicy(req.body?.policy);
  const [current] = await db.select({ id: platformSettings.id }).from(platformSettings).limit(1);
  if (!current) return res.status(404).json({ error: "Pengaturan platform belum dibuat" });
  await db.update(platformSettings).set({ withdrawalPolicy: clean, updatedAt: new Date() }).where(eq(platformSettings.id, current.id));
  const who = await whoAmI(req);
  logEvent({ category: "billing", action: "withdrawal_policy.updated", message: `Kebijakan penarikan platform diubah: ${describeSchedule(mergePolicy(clean, null))}.`, actorType: "superadmin", actorLabel: who.email, metadata: { policy: clean } });
  const policy = mergePolicy(clean, null);
  res.json({ policy, summary: describeSchedule(policy) });
});

// GET /finance/tenants/:id/policy — override + what actually applies to this tenant
superadminFinanceRouter.get("/tenants/:id/policy", async (req, res) => {
  const id = String(req.params.id);
  const [tenant] = await db.select({ name: tenants.name, override: tenants.withdrawalPolicy, settlement: tenants.qrisSettlement }).from(tenants).where(eq(tenants.id, id));
  if (!tenant) return res.status(404).json({ error: "Tenant tidak ditemukan" });
  const { policy } = await getEffectivePolicy(id);
  res.json({ name: tenant.name, settlement: tenant.settlement, override: sanitizePolicy(tenant.override), effective: policy, summary: describeSchedule(policy) });
});

// PUT /finance/tenants/:id/policy — { override: {...partial} | null }; null removes the override (follow the platform default)
superadminFinanceRouter.put("/tenants/:id/policy", async (req, res) => {
  const id = String(req.params.id);
  const [tenant] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, id));
  if (!tenant) return res.status(404).json({ error: "Tenant tidak ditemukan" });
  const override = req.body?.override === null ? null : sanitizePolicy(req.body?.override);
  const stored = override && Object.keys(override).length > 0 ? override : null;
  await db.update(tenants).set({ withdrawalPolicy: stored }).where(eq(tenants.id, id));
  const who = await whoAmI(req);
  const frozen = stored?.enabled === false;
  logEvent({
    tenantId: id, category: "billing", action: frozen ? "withdrawal_policy.frozen" : "withdrawal_policy.tenant_updated",
    message: frozen ? `Penarikan ${tenant.name} dibekukan.` : `Kebijakan penarikan khusus ${tenant.name} ${stored ? "diubah" : "dihapus (ikut default platform)"}.`,
    actorType: "superadmin", actorLabel: who.email, metadata: { override: stored },
  });
  const { policy } = await getEffectivePolicy(id);
  res.json({ override: stored ?? {}, effective: policy, summary: describeSchedule(policy) });
});

// GET /finance/tenants/:id/ledger[?format=csv] — every money movement of one tenant, newest first
superadminFinanceRouter.get("/tenants/:id/ledger", async (req, res) => {
  const id = String(req.params.id);
  const [tenant] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, id));
  if (!tenant) return res.status(404).json({ error: "Tenant tidak ditemukan" });
  const [entries, payouts, balance] = await Promise.all([
    db.select().from(walletLedger).where(eq(walletLedger.tenantId, id)).orderBy(desc(walletLedger.createdAt)).limit(1000),
    db.select().from(withdrawals).where(eq(withdrawals.tenantId, id)).orderBy(desc(withdrawals.requestedAt)).limit(500),
    computeQrisBalance(id),
  ]);
  type Row = { at: Date; type: string; description: string; amount: number; fee: number; status: string; note: string | null; actor: string | null };
  const rows: Row[] = [
    ...entries.map((e): Row => ({
      at: e.createdAt,
      type: e.kind === "payment" ? "Pembayaran QRIS" : "Penyesuaian",
      description: e.kind === "payment" ? `Sesi ${String(e.sessionId ?? "").slice(0, 8)}${e.ref?.startsWith("additional") ? " (cetak tambahan)" : ""}` : (e.note ?? ""),
      amount: Number(e.netAmount),
      fee: Number(e.feeAmount),
      status: e.kind === "payment" && e.availableAt.getTime() > Date.now() ? `Ditahan s/d ${e.availableAt.toISOString().slice(0, 10)}` : "Tersedia",
      note: e.note,
      actor: e.actor,
    })),
    ...payouts.map((w): Row => ({
      at: w.requestedAt,
      type: "Penarikan",
      description: `${w.bankName} ${w.accountNumber} a.n. ${w.accountName}`,
      amount: -Number(w.amount),
      fee: Number(w.feeAmount),
      status: w.status,
      note: w.adminNote ?? w.requestNote,
      actor: w.processedBy ?? w.requestedBy,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  if (req.query.format === "csv") {
    return sendCsv(res, `buku-besar-${tenant.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`, ["Waktu", "Jenis", "Keterangan", "Jumlah (net)", "Biaya", "Status", "Catatan", "Oleh"],
      rows.map((r) => [r.at, r.type, r.description, r.amount, r.fee, r.status, r.note, r.actor]));
  }
  res.json({ name: tenant.name, balance, rows: rows.slice(0, 500) });
});

// POST /finance/tenants/:id/adjustments — { amount (± whole rupiah), note } a manual correction, always with a reason
superadminFinanceRouter.post("/tenants/:id/adjustments", async (req, res) => {
  const id = String(req.params.id);
  const amount = Math.trunc(Number(req.body?.amount));
  const note = String(req.body?.note ?? "").trim().slice(0, 300);
  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 1_000_000_000) return res.status(400).json({ error: "Jumlah penyesuaian tidak valid" });
  if (note.length < 5) return res.status(400).json({ error: "Tulis alasan penyesuaian (minimal 5 huruf) — ini tercatat permanen." });
  const [tenant] = await db.select({ name: tenants.name, settlement: tenants.qrisSettlement }).from(tenants).where(eq(tenants.id, id));
  if (!tenant) return res.status(404).json({ error: "Tenant tidak ditemukan" });
  if (tenant.settlement !== "platform") return res.status(400).json({ error: "Tenant ini menerima QRIS langsung, tidak punya saldo di platform." });
  if (amount < 0) {
    const balance = await computeQrisBalance(id);
    if (-amount > balance.available) return res.status(400).json({ error: `Pengurangan melebihi saldo tersedia (${rp(balance.available)}).` });
  }
  const who = await whoAmI(req);
  const [row] = await db.insert(walletLedger).values({
    tenantId: id, kind: "adjustment", ref: `adj:${crypto.randomUUID()}`, netAmount: amount.toFixed(2), note, actor: who.email,
  }).returning();
  logEvent({ tenantId: id, category: "billing", action: "wallet.adjusted", message: `Saldo ${tenant.name} disesuaikan ${amount > 0 ? "+" : "−"}${rp(Math.abs(amount))}: ${note}`, actorType: "superadmin", actorLabel: who.email, metadata: { ledgerId: row.id, amount } });
  res.status(201).json({ row, balance: await computeQrisBalance(id) });
});

// GET /finance/reconcile — payments the gateway confirmed that never reached the ledger;  POST credits them
superadminFinanceRouter.get("/reconcile", async (_req, res) => {
  const missing = await findUncreditedPayments();
  res.json({ count: missing.length, amount: missing.reduce((acc, r) => acc + Number(r.amount ?? 0), 0), items: missing.slice(0, 100) });
});
superadminFinanceRouter.post("/reconcile", async (req, res) => {
  const tenantId = typeof req.body?.tenantId === "string" ? req.body.tenantId : undefined;
  const result = await creditMissingPayments(tenantId);
  const who = await whoAmI(req);
  logEvent({ category: "billing", action: "wallet.reconciled", message: `Rekonsiliasi saldo: ${result.credited} dari ${result.found} pembayaran dicatat (${rp(result.amount)}).`, actorType: "superadmin", actorLabel: who.email, metadata: result });
  res.json(result);
});

// GET /finance/withdrawals.csv?status=… — payout list for the bank transfer batch / accounting
superadminFinanceRouter.get("/withdrawals.csv", async (req, res) => {
  const status = String(req.query.status ?? "");
  const rows = await db.select({
    requestedAt: withdrawals.requestedAt, tenant: tenants.name, amount: withdrawals.amount, fee: withdrawals.feeAmount, net: withdrawals.netAmount, status: withdrawals.status,
    bank: withdrawals.bankName, account: withdrawals.accountNumber, holder: withdrawals.accountName, reference: withdrawals.transferReference, processedBy: withdrawals.processedBy, processedAt: withdrawals.processedAt,
  }).from(withdrawals).innerJoin(tenants, eq(tenants.id, withdrawals.tenantId))
    .where(["pending", "processing", "paid", "rejected"].includes(status) ? eq(withdrawals.status, status) : undefined)
    .orderBy(desc(withdrawals.requestedAt)).limit(5000);
  sendCsv(res, `penarikan-${status || "semua"}.csv`, ["Diminta", "Tenant", "Jumlah", "Biaya", "Diterima", "Status", "Bank", "No. rekening", "Atas nama", "Referensi transfer", "Diproses oleh", "Diproses"],
    rows.map((r) => [r.requestedAt, r.tenant, r.amount, r.fee, r.net, r.status, r.bank, r.account, r.holder, r.reference, r.processedBy, r.processedAt]));
});

// --- Finance accounts (owner only) ---------------------------------------------------------------------------------
superadminFinanceRouter.use("/users", async (req, res, next) => {
  if ((await whoAmI(req)).role !== "owner") return res.status(403).json({ error: "Hanya pemilik platform yang bisa mengelola akun finance." });
  next();
});
superadminFinanceRouter.get("/users", async (_req, res) => {
  res.json(await db.select({ id: superadmins.id, email: superadmins.email, role: superadmins.role, twoFactor: superadmins.totpEnabledAt, createdAt: superadmins.createdAt }).from(superadmins).orderBy(superadmins.createdAt));
});
superadminFinanceRouter.post("/users", async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Email tidak valid" });
  if (password.length < 10) return res.status(400).json({ error: "Kata sandi minimal 10 karakter" });
  const [existing] = await db.select({ id: superadmins.id }).from(superadmins).where(eq(superadmins.email, email));
  if (existing) return res.status(409).json({ error: "Email ini sudah terdaftar" });
  const [row] = await db.insert(superadmins).values({ email, passwordHash: hashPassword(password), role: "finance" }).returning({ id: superadmins.id, email: superadmins.email, role: superadmins.role });
  const who = await whoAmI(req);
  logEvent({ category: "billing", action: "finance_user.created", message: `Akun finance dibuat: ${email}.`, actorType: "superadmin", actorLabel: who.email });
  res.status(201).json(row);
});
superadminFinanceRouter.delete("/users/:id", async (req, res) => {
  const id = String(req.params.id);
  const [row] = await db.select({ email: superadmins.email, role: superadmins.role }).from(superadmins).where(eq(superadmins.id, id));
  if (!row) return res.status(404).json({ error: "Akun tidak ditemukan" });
  if (row.role !== "finance") return res.status(400).json({ error: "Hanya akun finance yang bisa dihapus dari sini." });
  await db.delete(superadmins).where(eq(superadmins.id, id));
  const who = await whoAmI(req);
  logEvent({ category: "billing", action: "finance_user.deleted", message: `Akun finance dihapus: ${row.email}.`, actorType: "superadmin", actorLabel: who.email });
  res.json({ ok: true });
});
