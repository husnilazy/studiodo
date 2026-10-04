import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { admins, tenants, withdrawals } from "../db/schema.js";
import { requireAdminAuth } from "../middleware/adminAuth.js";
import { computeQrisBalance } from "../lib/qrisBalance.js";
import { logEvent } from "../lib/platformEvents.js";

// Tenant side of QRIS withdrawals (mounted at /api/withdrawals). The superadmin side — reviewing, paying and
// rejecting requests — lives in routes/superadmin.ts.
export const withdrawalsRouter = Router();
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

  const balance = await computeQrisBalance(tenantId);
  if (balance.settlement !== "platform") {
    return res.status(403).json({ error: "Akun ini menerima QRIS langsung di rekening Xendit sendiri, jadi tidak ada saldo yang perlu ditarik." });
  }
  if (amount < balance.rules.minAmount) {
    return res.status(400).json({ error: `Penarikan minimal Rp ${balance.rules.minAmount.toLocaleString("id-ID")}` });
  }
  if (amount > balance.available) {
    return res.status(400).json({ error: `Saldo tersedia hanya Rp ${balance.available.toLocaleString("id-ID")}` });
  }
  if (amount <= balance.rules.flatFee) return res.status(400).json({ error: "Nominal harus lebih besar dari biaya penarikan" });

  const [admin] = await db.select({ email: admins.email }).from(admins).where(eq(admins.id, req.adminId!));
  const fee = balance.rules.flatFee;
  const [row] = await db.insert(withdrawals).values({
    tenantId,
    amount: amount.toFixed(2),
    feeAmount: fee.toFixed(2),
    netAmount: (amount - fee).toFixed(2),
    bankName,
    accountNumber,
    accountName,
    requestNote: note,
    requestedBy: admin?.email ?? null,
  }).returning();

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
  await db.update(withdrawals).set({ status: "rejected", adminNote: "Dibatalkan oleh tenant", processedAt: new Date() }).where(eq(withdrawals.id, row.id));
  res.json({ ok: true });
});
