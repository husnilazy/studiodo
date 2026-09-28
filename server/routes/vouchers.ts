import { Router } from "express";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { vouchers, voucherRedemptions } from "../db/schema.js";
import { tenantSettings } from "../db/schema.js";
import crypto from "node:crypto";
import { requireAdminAuth } from "../middleware/adminAuth.js";
import { requireKioskAuth } from "../middleware/kioskAuth.js";

export const vouchersRouter = Router();

// Shared by the single-create and bulk-create endpoints — same validation
// either way, just applied to N generated codes instead of one given code.
function validateVoucherPayload(body: Record<string, unknown>):
  | { error: string }
  | { discountType: string; discountValue: string; maxUses: number | null; active: boolean; startsAt: Date | null; expiresAt: Date | null } {
  const discountType = String(body.discountType ?? "percent");
  const discountValue = body.discountValue;
  if (!["percent", "fixed", "free"].includes(discountType) || Number(discountValue) < 0) {
    return { error: "Tipe diskon dan nilai diskon tidak valid" };
  }
  if (discountType === "percent" && Number(discountValue) > 100) {
    return { error: "Diskon persen maksimal 100" };
  }
  return {
    discountType,
    discountValue: String(Number(discountValue)),
    maxUses: body.maxUses === "" || body.maxUses == null ? null : Number(body.maxUses),
    active: body.active === undefined ? true : Boolean(body.active),
    startsAt: body.startsAt ? new Date(String(body.startsAt)) : null,
    expiresAt: body.expiresAt ? new Date(String(body.expiresAt)) : null,
  };
}

vouchersRouter.post("/cash", requireKioskAuth, async (req, res) => {
  const tenantId = req.tenantId!;
  const amount = Math.round(Number(req.body.amount) || 0);
  const customerName = String(req.body.customerName ?? "").trim().slice(0, 100) || null;
  const [config] = await db.select({ enabled: tenantSettings.cashPaymentEnabled }).from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId));
  if (!config?.enabled) return res.status(403).json({ error: "Pembayaran cash belum diaktifkan" });
  if (amount <= 0) return res.status(400).json({ error: "Nominal cash harus lebih dari nol" });
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  const code = `CASH-${suffix}`;
  const invoiceNumber = `CASH-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${suffix}`;
  const [row] = await db.insert(vouchers).values({
    tenantId,
    code,
    voucherType: "cash",
    discountType: "free",
    discountValue: "0",
    cashAmount: String(amount.toFixed(2)),
    invoiceNumber,
    customerName,
    maxUses: 1,
    active: true,
  }).returning();
  res.status(201).json(row);
});

vouchersRouter.get("/", requireAdminAuth, async (req, res) => {
  res.json(await db.select().from(vouchers).where(eq(vouchers.tenantId, req.tenantId!)).orderBy(asc(vouchers.createdAt)));
});

// GET /api/vouchers/report?voucherId=&from=&to=&limit=&offset= — usage
// reporting: redemption count, total discount given away, and total revenue
// actually collected after discount, plus the underlying redemption rows.
// Reads voucher_redemptions (an immutable event log written at redemption
// time in payment.ts) rather than the vouchers.usedCount counter, which can't
// answer "which session, when, how much" once a code is reused across many
// sessions (the normal case for a promo code).
vouchersRouter.get("/report", requireAdminAuth, async (req, res) => {
  const tenantId = req.tenantId!;
  const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const conditions = [eq(voucherRedemptions.tenantId, tenantId)];
  if (req.query.voucherId) conditions.push(eq(voucherRedemptions.voucherId, String(req.query.voucherId)));
  if (req.query.from) conditions.push(gte(voucherRedemptions.redeemedAt, new Date(String(req.query.from))));
  if (req.query.to) conditions.push(lte(voucherRedemptions.redeemedAt, new Date(String(req.query.to))));
  const whereClause = and(...conditions);

  const [[summary], items, [{ total }]] = await Promise.all([
    db.select({
      totalRedemptions: sql<number>`count(*)::int`,
      totalDiscountGiven: sql<number>`coalesce(sum(${voucherRedemptions.discountAmount}), 0)`,
      totalRevenueAfterDiscount: sql<number>`coalesce(sum(${voucherRedemptions.finalAmount}), 0)`,
    }).from(voucherRedemptions).where(whereClause),
    db.select({
      id: voucherRedemptions.id,
      voucherId: voucherRedemptions.voucherId,
      code: vouchers.code,
      sessionId: voucherRedemptions.sessionId,
      redemptionPurpose: voucherRedemptions.redemptionPurpose,
      originalAmount: voucherRedemptions.originalAmount,
      discountAmount: voucherRedemptions.discountAmount,
      finalAmount: voucherRedemptions.finalAmount,
      redeemedAt: voucherRedemptions.redeemedAt,
    }).from(voucherRedemptions)
      .innerJoin(vouchers, eq(voucherRedemptions.voucherId, vouchers.id))
      .where(whereClause)
      .orderBy(desc(voucherRedemptions.redeemedAt))
      .limit(limit).offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(voucherRedemptions).where(whereClause),
  ]);

  res.json({
    summary: {
      totalRedemptions: summary?.totalRedemptions ?? 0,
      totalDiscountGiven: Number(summary?.totalDiscountGiven ?? 0),
      totalRevenueAfterDiscount: Number(summary?.totalRevenueAfterDiscount ?? 0),
    },
    items,
    total,
    limit,
    offset,
  });
});

vouchersRouter.post("/", requireAdminAuth, async (req, res) => {
  const tenantId = req.tenantId!;
  const normalizedCode = String(req.body.code ?? "").trim().toUpperCase();
  if (!normalizedCode) return res.status(400).json({ error: "Kode, tipe diskon, dan nilai diskon tidak valid" });
  const validated = validateVoucherPayload(req.body);
  if ("error" in validated) return res.status(400).json({ error: validated.error });
  try {
    const [row] = await db.insert(vouchers).values({
      tenantId,
      code: normalizedCode,
      ...validated,
    }).returning();
    res.status(201).json(row);
  } catch (error) {
    console.error("Gagal membuat voucher", error);
    res.status(400).json({ error: "Kode voucher sudah digunakan atau data tidak valid" });
  }
});

// POST /api/vouchers/bulk — generate many codes at once from one shared
// discount/type/quota/date-range config (a real promo batch, e.g. "50 codes
// of 20% off, valid this weekend" as one action instead of 50 manual
// submissions). Retries a fresh random suffix on a unique-code collision
// (capped) so the response always contains exactly `count` real, distinct
// codes — these are meant to go out to customers (printed, shared with a
// partner), so silently returning fewer than asked for would be worse than
// a slightly slower sequential insert loop.
vouchersRouter.post("/bulk", requireAdminAuth, async (req, res) => {
  const tenantId = req.tenantId!;
  const count = Math.round(Number(req.body.count) || 0);
  if (count < 1 || count > 500) return res.status(400).json({ error: "Jumlah voucher harus antara 1 dan 500" });
  const validated = validateVoucherPayload(req.body);
  if ("error" in validated) return res.status(400).json({ error: validated.error });
  const prefix = String(req.body.codePrefix ?? "PROMO").trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || "PROMO";

  const created: (typeof vouchers.$inferSelect)[] = [];
  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
      try {
        const [row] = await db.insert(vouchers).values({
          tenantId,
          code: `${prefix}-${suffix}`,
          ...validated,
        }).returning();
        created.push(row);
        break;
      } catch (error) {
        if (attempt === 4) console.error(`Gagal generate kode voucher unik untuk item ke-${i + 1}`, error);
      }
    }
  }
  res.status(201).json({ codes: created });
});

vouchersRouter.patch("/:id", requireAdminAuth, async (req, res) => {
  const patch = { ...req.body };
  if (patch.code) patch.code = String(patch.code).trim().toUpperCase();
  if (patch.discountValue != null) patch.discountValue = String(Number(patch.discountValue));
  if (patch.maxUses === "") patch.maxUses = null;
  if (patch.startsAt !== undefined) patch.startsAt = patch.startsAt ? new Date(patch.startsAt) : null;
  if (patch.expiresAt !== undefined) patch.expiresAt = patch.expiresAt ? new Date(patch.expiresAt) : null;
  delete patch.tenantId;
  try {
    const [row] = await db.update(vouchers).set(patch).where(and(eq(vouchers.id, String(req.params.id)), eq(vouchers.tenantId, req.tenantId!))).returning();
    if (!row) return res.status(404).json({ error: "Voucher tidak ditemukan" });
    res.json(row);
  } catch (error) {
    console.error("Gagal mengubah voucher", error);
    res.status(400).json({ error: "Data voucher tidak valid" });
  }
});

vouchersRouter.delete("/:id", requireAdminAuth, async (req, res) => {
  await db.delete(vouchers).where(and(eq(vouchers.id, String(req.params.id)), eq(vouchers.tenantId, req.tenantId!)));
  res.status(204).end();
});
