import { Router } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { vouchers } from "../db/schema.js";
import { boothConfig } from "../db/schema.js";
import crypto from "node:crypto";

export const vouchersRouter = Router();

vouchersRouter.post("/cash", async (req, res) => {
  const amount = Math.round(Number(req.body.amount) || 0);
  const customerName = String(req.body.customerName ?? "").trim().slice(0, 100) || null;
  const [config] = await db.select({ enabled: boothConfig.cashPaymentEnabled }).from(boothConfig).where(eq(boothConfig.boothId, "default"));
  if (!config?.enabled) return res.status(403).json({ error: "Pembayaran cash belum diaktifkan" });
  if (amount <= 0) return res.status(400).json({ error: "Nominal cash harus lebih dari nol" });
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  const code = `CASH-${suffix}`;
  const invoiceNumber = `CASH-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${suffix}`;
  const [row] = await db.insert(vouchers).values({
    code,
    voucherType: "cash",
    discountType: "free",
    discountValue: "0",
    cashAmount: amount.toFixed(2),
    invoiceNumber,
    customerName,
    maxUses: 1,
    active: true,
  }).returning();
  res.status(201).json(row);
});

vouchersRouter.get("/", async (_req, res) => {
  res.json(await db.select().from(vouchers).orderBy(asc(vouchers.createdAt)));
});

vouchersRouter.post("/", async (req, res) => {
  const { code, discountType = "percent", discountValue, maxUses, active = true, startsAt, expiresAt } = req.body;
  const normalizedCode = String(code ?? "").trim().toUpperCase();
  if (!normalizedCode || !["percent", "fixed", "free"].includes(discountType) || Number(discountValue) < 0) {
    return res.status(400).json({ error: "Kode, tipe diskon, dan nilai diskon tidak valid" });
  }
  if (discountType === "percent" && Number(discountValue) > 100) {
    return res.status(400).json({ error: "Diskon persen maksimal 100" });
  }
  try {
    const [row] = await db.insert(vouchers).values({
      code: normalizedCode,
      discountType,
      discountValue: String(discountValue),
      maxUses: maxUses === "" || maxUses == null ? null : Number(maxUses),
      active: Boolean(active),
      startsAt: startsAt ? new Date(startsAt) : null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    }).returning();
    res.status(201).json(row);
  } catch (error) {
    console.error("Gagal membuat voucher", error);
    res.status(400).json({ error: "Kode voucher sudah digunakan atau data tidak valid" });
  }
});

vouchersRouter.patch("/:id", async (req, res) => {
  const patch = { ...req.body };
  if (patch.code) patch.code = String(patch.code).trim().toUpperCase();
  if (patch.discountValue != null) patch.discountValue = String(patch.discountValue);
  if (patch.maxUses === "") patch.maxUses = null;
  if (patch.startsAt !== undefined) patch.startsAt = patch.startsAt ? new Date(patch.startsAt) : null;
  if (patch.expiresAt !== undefined) patch.expiresAt = patch.expiresAt ? new Date(patch.expiresAt) : null;
  try {
    const [row] = await db.update(vouchers).set(patch).where(eq(vouchers.id, req.params.id)).returning();
    if (!row) return res.status(404).json({ error: "Voucher tidak ditemukan" });
    res.json(row);
  } catch (error) {
    console.error("Gagal mengubah voucher", error);
    res.status(400).json({ error: "Data voucher tidak valid" });
  }
});

vouchersRouter.delete("/:id", async (req, res) => {
  await db.delete(vouchers).where(eq(vouchers.id, req.params.id));
  res.status(204).end();
});
