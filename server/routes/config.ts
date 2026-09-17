import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { boothConfig } from "../db/schema.js";

export const configRouter = Router();

const BOOTH_ID = "default";

configRouter.get("/payment", async (_req, res) => {
  const [config] = await db
    .select({
      hasSecretKey: boothConfig.xenditSecretKey,
      hasWebhookToken: boothConfig.xenditWebhookToken,
      cashPaymentEnabled: boothConfig.cashPaymentEnabled,
    })
    .from(boothConfig)
    .where(eq(boothConfig.boothId, BOOTH_ID));

  const hasSecretKey = Boolean(config?.hasSecretKey);
  res.json({
    hasSecretKey,
    hasWebhookToken: Boolean(config?.hasWebhookToken),
    demoMode: process.env.PAYMENT_DEMO_MODE === "true" && !hasSecretKey,
    cashPaymentEnabled: Boolean(config?.cashPaymentEnabled),
  });
});

configRouter.patch("/payment", async (req, res) => {
  const { secretKey, webhookToken } = req.body as {
    secretKey?: string;
    webhookToken?: string;
  };
  const values = {
    ...(secretKey?.trim() ? { xenditSecretKey: secretKey.trim() } : {}),
    ...(webhookToken?.trim() ? { xenditWebhookToken: webhookToken.trim() } : {}),
    updatedAt: new Date(),
  };

  if (Object.keys(values).length === 1) {
    return res.status(400).json({ error: "Isi minimal satu kredensial Xendit." });
  }

  const [existing] = await db
    .select({ boothId: boothConfig.boothId })
    .from(boothConfig)
    .where(eq(boothConfig.boothId, BOOTH_ID));

  if (existing) {
    await db.update(boothConfig).set(values).where(eq(boothConfig.boothId, BOOTH_ID));
  } else {
    await db.insert(boothConfig).values({ boothId: BOOTH_ID, ...values });
  }

  res.json({ ok: true });
});

configRouter.patch("/cash-payment", async (req, res) => {
  const cashPaymentEnabled = Boolean(req.body.enabled);
  const [existing] = await db.select({ boothId: boothConfig.boothId }).from(boothConfig).where(eq(boothConfig.boothId, BOOTH_ID));
  if (existing) await db.update(boothConfig).set({ cashPaymentEnabled, updatedAt: new Date() }).where(eq(boothConfig.boothId, BOOTH_ID));
  else await db.insert(boothConfig).values({ boothId: BOOTH_ID, cashPaymentEnabled });
  res.json({ enabled: cashPaymentEnabled });
});

configRouter.get("/printing", async (_req, res) => {
  const [config] = await db.select({
    enabled: boothConfig.additionalPrintEnabled,
    label: boothConfig.additionalPrintLabel,
    price: boothConfig.additionalPrintPrice,
    max: boothConfig.additionalPrintMax,
  }).from(boothConfig).where(eq(boothConfig.boothId, BOOTH_ID));
  res.json({
    enabled: config?.enabled ?? true,
    label: config?.label ?? "Tambah print 4R",
    price: Number(config?.price ?? 15000),
    max: config?.max ?? 5,
  });
});

configRouter.patch("/printing", async (req, res) => {
  const enabled = Boolean(req.body.enabled);
  const label = String(req.body.label ?? "Tambah print 4R").trim().slice(0, 80) || "Tambah print 4R";
  const price = Math.max(0, Math.round(Number(req.body.price) || 0));
  const max = Math.max(1, Math.min(20, Math.round(Number(req.body.max) || 5)));
  const values = { additionalPrintEnabled: enabled, additionalPrintLabel: label, additionalPrintPrice: price.toFixed(2), additionalPrintMax: max, updatedAt: new Date() };
  const [existing] = await db.select({ boothId: boothConfig.boothId }).from(boothConfig).where(eq(boothConfig.boothId, BOOTH_ID));
  if (existing) await db.update(boothConfig).set(values).where(eq(boothConfig.boothId, BOOTH_ID));
  else await db.insert(boothConfig).values({ boothId: BOOTH_ID, ...values });
  res.json({ enabled, label, price, max });
});
