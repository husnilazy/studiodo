import { Router } from "express";
import { validateUuidParam } from "../middleware/validateUuidParam.js";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { admins, tenants, withdrawals } from "../db/schema.js";
import { requireAdminAuth } from "../middleware/adminAuth.js";
import { computeQrisBalance, createWithdrawal } from "../lib/qrisBalance.js";
import { logEvent } from "../lib/platformEvents.js";

// Tenant side of QRIS withdrawals (mounted at /api/withdrawals). The superadmin side — reviewing, paying and
// rejecting requests — lives in routes/superadmin.ts.
export const withdrawalsRouter = Router();
withdrawalsRouter.param("id", validateUuidParam("Permintaan tidak ditemukan"));
withdrawalsRouter.use(requireAdminAuth);

// GET /api/withdrawals — balance summary + the tenant's requests, newest first
withdrawalsRouter.get("/", async (req, res) => {
  const tenantId = req.tenantId!;
  const [balance, items] = await Promise.all([
    computeQrisBalance(tenantId),
    db.select().from(withdrawals).where(eq(withdrawals.tenantId, tenantId)).orderBy(desc(withdrawals.requestedAt)).limit(100),
  ]);
  const last = items[0];
  res.json({
    balance,
    items,
    // Prefill for the next request: people withdraw to the same account almost every time.
    lastAccount: last ? { bankName: last.bankName, accountNumber: last.accountNumber, accountName: last.accountName } : null,
  });
});

// POST /api/withdrawals — { amount, bankName, accountNumber, accountName, note? }
withdrawalsRouter.post("/", async (req, res) => {
  const tenantId = req.tenantId!;
  const amount = Math.floor(Number(req.body?.amount));
  const bankName = String(req.body?.bankName ?? "").trim().slice(0, 60);
  const accountNumber = String(req.body?.accountNumber ?? "").replace(/\s+/g, "").slice(0, 40);
  const accountName = String(req.body?.accountName ?? "").trim().slice(0, 100);
  const note = String(req.body?.note ?? "").trim().slice(0, 300) || null;

  if (!bankName || !accountNumber || !accountName) return res.status(400).json({ error: "Nama bank/e-wallet, nomor rekening, dan nama pemilik wajib diisi" });
  if (!/^[0-9]{5,}$/.test(accountNumber)) return res.status(400).json({ error: "Nomor rekening hanya boleh berisi angka" });
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "Nominal penarikan tidak valid" });
  const [admin] = await db.select({ email: admins.email }).from(admins).where(eq(admins.id, req.adminId!));
  // Balance, policy window, limits and the insert are checked together inside one locked transaction (see createWithdrawal).
  const result = await createWithdrawal(tenantId, { amount, bankName, accountNumber, accountName, note, requestedBy: admin?.email ?? null });
  if (!result.ok) return res.status(result.status).json({ error: result.error, code: result.code });
  const row = result.row;

  const [tenant] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId));
  logEvent({
    tenantId,
    category: "billing",
    action: "withdrawal.requested",
    message: `${tenant?.name ?? "Tenant"} meminta penarikan saldo QRIS Rp ${amount.toLocaleString("id-ID")} ke ${bankName} ${accountNumber}.`,
    actorType: "tenant_admin",
    actorLabel: admin?.email ?? null,
    metadata: { withdrawalId: row.id, amount },
  });
  res.status(201).json(row);
});

// DELETE /api/withdrawals/:id — the tenant withdraws a request that nobody has started processing yet
withdrawalsRouter.delete("/:id", async (req, res) => {
  const tenantId = req.tenantId!;
  const [row] = await db.select().from(withdrawals).where(eq(withdrawals.id, String(req.params.id)));
  if (!row || row.tenantId !== tenantId) return res.status(404).json({ error: "Permintaan tidak ditemukan" });
  if (row.status !== "pending") return res.status(409).json({ error: "Permintaan ini sudah diproses, tidak bisa dibatalkan." });
  // Compare-and-set: if a superadmin moved it to processing/paid between the read above and this write, nothing changes. Without the
  // status guard a payout already sent could be flipped to "rejected", which hands the money back to the balance (double spend).
  const cancelled = await db.update(withdrawals).set({ status: "rejected", adminNote: "Dibatalkan oleh tenant", processedAt: new Date() })
    .where(and(eq(withdrawals.id, row.id), eq(withdrawals.status, "pending"))).returning({ id: withdrawals.id });
  if (cancelled.length === 0) return res.status(409).json({ error: "Permintaan ini sudah diproses, tidak bisa dibatalkan." });
  res.json({ ok: true });
});
