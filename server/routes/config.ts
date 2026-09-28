import { Router } from "express";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { kioskKeys, sessions, tenantSettings } from "../db/schema.js";
import { requireAdminAuth } from "../middleware/adminAuth.js";
import { requireAnyAuth } from "../middleware/anyAuth.js";
import { resetStorageSettingsCache } from "../lib/storageConfig.js";
import { resetR2Client } from "../storage.js";
import { resetDriveClient } from "../lib/gdrive.js";
import { validateFlowOrder } from "../lib/kioskFlowRules.js";
import { getTenantPlanFeatures } from "../lib/planFeatures.js";

export const configRouter = Router();

async function ensureTenantSettingsRow(tenantId: string) {
  const [existing] = await db.select({ tenantId: tenantSettings.tenantId }).from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId));
  if (!existing) await db.insert(tenantSettings).values({ tenantId });
}

// GET /api/config/plan-features — what this tenant's current plan includes,
// so the admin dashboard/Screen Builder/package editor can show a locked
// state proactively instead of only finding out from a 403 after trying.
configRouter.get("/plan-features", requireAnyAuth, async (req, res) => {
  const tenantId = req.tenantId!;
  const [features, [{ kioskCount }]] = await Promise.all([
    getTenantPlanFeatures(tenantId),
    db.select({ kioskCount: sql<number>`count(*)::int` }).from(kioskKeys).where(and(eq(kioskKeys.tenantId, tenantId), isNull(kioskKeys.revokedAt))),
  ]);
  res.json({ ...features, kioskCount });
});

// GET /api/config/public?sessionId=... — dibuka dari halaman gallery publik (tanpa auth).
// tenantId di-resolve dari session yang sedang ditampilkan, bukan dari input client.
configRouter.get("/public", async (req, res) => {
  const baseUrl = String(process.env.PUBLIC_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");
  const sessionId = String(req.query.sessionId ?? "");
  if (!sessionId) return res.json({ baseUrl });

  const [session] = await db.select({ tenantId: sessions.tenantId }).from(sessions).where(eq(sessions.id, sessionId));
  if (!session) return res.json({ baseUrl });

  const [profile] = await db.select({
    brandName: tenantSettings.brandName,
    tagline: tenantSettings.tagline,
    logoUrl: tenantSettings.logoUrl,
    contactWhatsapp: tenantSettings.contactWhatsapp,
    socialInstagram: tenantSettings.socialInstagram,
    socialTiktok: tenantSettings.socialTiktok,
    socialFacebook: tenantSettings.socialFacebook,
    websiteUrl: tenantSettings.websiteUrl,
    address: tenantSettings.address,
    // accentColor is the only theme value stored server-side (everything
    // else — background/gradient/text colors — lives only in the kiosk
    // device's own localStorage) but it's enough for the public gallery
    // page to pick up the tenant's actual brand color instead of always
    // falling back to the default terracotta.
    accentColor: tenantSettings.accentColor,
  }).from(tenantSettings).where(eq(tenantSettings.tenantId, session.tenantId));

  res.json({ baseUrl, ...profile });
});

// GET /api/config/tenant — dipakai kiosk untuk re-sync branding lokal begitu
// paired/reconnect, supaya kalau hardware dipindah ke tenant lain, branding
// lama di localStorage tidak nyangkut. Juga dipakai admin dashboard (Fase 4
// KioskFlowSettings) buat baca kioskFlow saat ini — admin browser belum tentu
// pernah di-pairing sebagai kiosk, jadi requireAnyAuth (admin token ATAU kiosk key).
configRouter.get("/tenant", requireAnyAuth, async (req, res) => {
  const [config] = await db.select({
    brandName: tenantSettings.brandName,
    tagline: tenantSettings.tagline,
    logoUrl: tenantSettings.logoUrl,
    contactWhatsapp: tenantSettings.contactWhatsapp,
    socialInstagram: tenantSettings.socialInstagram,
    socialTiktok: tenantSettings.socialTiktok,
    socialFacebook: tenantSettings.socialFacebook,
    websiteUrl: tenantSettings.websiteUrl,
    address: tenantSettings.address,
    accentColor: tenantSettings.accentColor,
    fontFamily: tenantSettings.fontFamily,
    captureVibe: tenantSettings.captureVibe,
    countdownSeconds: tenantSettings.countdownSeconds,
    beepEnabled: tenantSettings.beepEnabled,
    sessionTimerMinutes: tenantSettings.sessionTimerMinutes,
    cameraMode: tenantSettings.cameraMode,
    tetherBridgeUrl: tenantSettings.tetherBridgeUrl,
    stripLayout: tenantSettings.stripLayout,
    stripTemplate: tenantSettings.stripTemplate,
    kioskFlow: tenantSettings.kioskFlow,
  }).from(tenantSettings).where(eq(tenantSettings.tenantId, req.tenantId!));
  res.json(config ?? {});
});

// PATCH /api/config/kiosk-flow — admin mengatur urutan & on/off step kiosk (Fase 4).
// Selalu divalidasi server-side (validateFlowOrder) sebelum disimpan — body dari
// client tidak pernah dipercaya sebagai sudah valid hanya karena UI admin juga
// memvalidasi sebelum submit.
configRouter.patch("/kiosk-flow", requireAdminAuth, async (req, res) => {
  const tenantId = req.tenantId!;
  const order = Array.isArray(req.body?.order) ? req.body.order.map(String) : [];
  const enabled = req.body?.enabled && typeof req.body.enabled === "object" ? req.body.enabled : {};

  const result = validateFlowOrder({ order, enabled });
  if (!result.ok) return res.status(400).json({ error: result.error });

  await ensureTenantSettingsRow(tenantId);
  await db.update(tenantSettings).set({ kioskFlow: { order, enabled }, updatedAt: new Date() }).where(eq(tenantSettings.tenantId, tenantId));
  res.json({ ok: true, kioskFlow: { order, enabled } });
});

configRouter.patch("/gallery-profile", requireAdminAuth, async (req, res) => {
  const tenantId = req.tenantId!;
  const values = {
    brandName: String(req.body.brandName ?? "STUDIODO").trim().slice(0, 80) || "STUDIODO",
    tagline: String(req.body.tagline ?? "").trim().slice(0, 160),
    logoUrl: String(req.body.logoUrl ?? "").trim() || null,
    contactWhatsapp: String(req.body.contactWhatsapp ?? "").trim().slice(0, 40) || null,
    socialInstagram: String(req.body.socialInstagram ?? "").trim().slice(0, 160) || null,
    socialTiktok: String(req.body.socialTiktok ?? "").trim().slice(0, 160) || null,
    socialFacebook: String(req.body.socialFacebook ?? "").trim().slice(0, 160) || null,
    websiteUrl: String(req.body.websiteUrl ?? "").trim().slice(0, 160) || null,
    address: String(req.body.address ?? "").trim().slice(0, 200) || null,
    updatedAt: new Date(),
  };
  await ensureTenantSettingsRow(tenantId);
  await db.update(tenantSettings).set(values).where(eq(tenantSettings.tenantId, tenantId));
  res.json({ ok: true, ...values });
});

configRouter.get("/payment", requireAnyAuth, async (req, res) => {
  const [config] = await db
    .select({
      hasSecretKey: tenantSettings.xenditSecretKey,
      hasWebhookToken: tenantSettings.xenditWebhookToken,
      cashPaymentEnabled: tenantSettings.cashPaymentEnabled,
    })
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, req.tenantId!));

  const hasSecretKey = Boolean(config?.hasSecretKey);
  res.json({
    hasSecretKey,
    hasWebhookToken: Boolean(config?.hasWebhookToken),
    demoMode: process.env.PAYMENT_DEMO_MODE === "true" && !hasSecretKey,
    cashPaymentEnabled: Boolean(config?.cashPaymentEnabled),
  });
});

configRouter.patch("/payment", requireAdminAuth, async (req, res) => {
  const tenantId = req.tenantId!;
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

  await ensureTenantSettingsRow(tenantId);
  await db.update(tenantSettings).set(values).where(eq(tenantSettings.tenantId, tenantId));
  res.json({ ok: true });
});

configRouter.patch("/cash-payment", requireAdminAuth, async (req, res) => {
  const tenantId = req.tenantId!;
  const cashPaymentEnabled = Boolean(req.body.enabled);
  await ensureTenantSettingsRow(tenantId);
  await db.update(tenantSettings).set({ cashPaymentEnabled, updatedAt: new Date() }).where(eq(tenantSettings.tenantId, tenantId));
  res.json({ enabled: cashPaymentEnabled });
});

configRouter.get("/printing", requireAnyAuth, async (req, res) => {
  const [config] = await db.select({
    enabled: tenantSettings.additionalPrintEnabled,
    label: tenantSettings.additionalPrintLabel,
    price: tenantSettings.additionalPrintPrice,
    max: tenantSettings.additionalPrintMax,
  }).from(tenantSettings).where(eq(tenantSettings.tenantId, req.tenantId!));
  res.json({
    enabled: config?.enabled ?? true,
    label: config?.label ?? "Tambah print 4R",
    price: Number(config?.price ?? 15000),
    max: config?.max ?? 5,
  });
});

configRouter.patch("/printing", requireAdminAuth, async (req, res) => {
  const tenantId = req.tenantId!;
  const enabled = Boolean(req.body.enabled);
  const label = String(req.body.label ?? "Tambah print 4R").trim().slice(0, 80) || "Tambah print 4R";
  const price = Math.max(0, Math.round(Number(req.body.price) || 0));
  const max = Math.max(1, Math.min(20, Math.round(Number(req.body.max) || 5)));
  const values = { additionalPrintEnabled: enabled, additionalPrintLabel: label, additionalPrintPrice: price.toFixed(2), additionalPrintMax: max, updatedAt: new Date() };
  await ensureTenantSettingsRow(tenantId);
  await db.update(tenantSettings).set(values).where(eq(tenantSettings.tenantId, tenantId));
  res.json({ enabled, label, price, max });
});

// GET /api/config/storage — admin: status kredensial penyimpanan (foto/video), tanpa membocorkan secret
configRouter.get("/storage", requireAdminAuth, async (req, res) => {
  const [config] = await db.select().from(tenantSettings).where(eq(tenantSettings.tenantId, req.tenantId!));
  res.json({
    driver: config?.storageDriver ?? "local",
    r2: {
      hasCredentials: Boolean(config?.r2AccessKeyId && config?.r2SecretAccessKey),
      accountId: config?.r2AccountId ?? "",
      endpoint: config?.r2Endpoint ?? "",
      bucket: config?.r2Bucket ?? "",
      publicBaseUrl: config?.r2PublicBaseUrl ?? "",
      prefix: config?.r2Prefix ?? "",
    },
    gdrive: {
      hasCredentials: Boolean(config?.gdriveServiceAccountJson),
      folderId: config?.gdriveFolderId ?? "",
    },
  });
});

// PATCH /api/config/storage — admin: atur driver penyimpanan + kredensial R2/Google Drive
// Field kosong/undefined dibiarkan (tidak menimpa yang sudah tersimpan), supaya admin bisa
// ganti satu field tanpa harus mengisi ulang semua kredensial setiap kali.
configRouter.patch("/storage", requireAdminAuth, async (req, res) => {
  const tenantId = req.tenantId!;
  const body = req.body as Record<string, unknown>;
  const values: Record<string, unknown> = { updatedAt: new Date() };

  if (body.driver !== undefined) {
    const driver = String(body.driver);
    if (!["local", "r2", "gdrive"].includes(driver)) return res.status(400).json({ error: "Driver storage tidak valid" });
    values.storageDriver = driver;
  }
  const stringField = (key: string, column: string) => {
    if (body[key] !== undefined) values[column] = String(body[key]).trim() || null;
  };
  stringField("r2AccountId", "r2AccountId");
  stringField("r2Endpoint", "r2Endpoint");
  stringField("r2Bucket", "r2Bucket");
  stringField("r2AccessKeyId", "r2AccessKeyId");
  stringField("r2SecretAccessKey", "r2SecretAccessKey");
  stringField("r2PublicBaseUrl", "r2PublicBaseUrl");
  stringField("r2Prefix", "r2Prefix");
  stringField("gdriveServiceAccountJson", "gdriveServiceAccountJson");
  stringField("gdriveFolderId", "gdriveFolderId");

  if (typeof values.gdriveServiceAccountJson === "string") {
    try {
      JSON.parse(values.gdriveServiceAccountJson);
    } catch {
      return res.status(400).json({ error: "Service account JSON Google Drive tidak valid" });
    }
  }

  await ensureTenantSettingsRow(tenantId);
  await db.update(tenantSettings).set(values).where(eq(tenantSettings.tenantId, tenantId));

  resetStorageSettingsCache(tenantId);
  resetR2Client(tenantId);
  resetDriveClient(tenantId);
  res.json({ ok: true });
});
