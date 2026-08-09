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
    })
    .from(boothConfig)
    .where(eq(boothConfig.boothId, BOOTH_ID));

  const hasSecretKey = Boolean(config?.hasSecretKey);
  res.json({
    hasSecretKey,
    hasWebhookToken: Boolean(config?.hasWebhookToken),
    demoMode: process.env.PAYMENT_DEMO_MODE === "true" && !hasSecretKey,
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
