import { Router } from "express";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { billingOrders, paymentGateways, platformSettings, superadmins } from "../db/schema.js";
import { DEFAULT_PRIORITY, PROVIDERS, loadGateway, orderGateways, type GatewayConfig, type Provider } from "../lib/gateways.js";
import { encryptSecret, maskedTail } from "../lib/secretBox.js";
import { testMidtrans } from "../lib/midtrans.js";
import { testXendit } from "../lib/xenditBilling.js";
import { logEvent } from "../lib/platformEvents.js";

// Superadmin management of the platform's subscription-payment gateways (mounted under
// /api/superadmin/payment-gateways). Secrets are write-only: they are encrypted before storage and no
// endpoint ever returns them — only whether one is set, where it comes from, and its last 4 characters.

export const paymentGatewaysAdminRouter = Router();

const LABEL: Record<Provider, string> = { midtrans: "Midtrans", xendit: "Xendit" };
const isProvider = (v: string): v is Provider => (PROVIDERS as string[]).includes(v);

function webhookUrl(provider: Provider): string {
  const base = String(process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  return `${base || "https://<alamat-server-anda>"}/api/billing/${provider}/notification`;
}

/** Keys carry their environment in the prefix; a mismatch is the single most common setup mistake. */
function keyProblem(provider: Provider, key: string, environment: "sandbox" | "production"): string | null {
  if (provider === "midtrans") {
    const sandboxKey = key.startsWith("SB-");
    if (!/^(SB-)?Mid-server-/.test(key)) return "Itu bukan Server Key Midtrans (harus diawali \"Mid-server-\" atau \"SB-Mid-server-\"). Jangan pakai Client Key.";
    if (environment === "production" && sandboxKey) return "Ini kunci sandbox, tetapi mode yang dipilih Produksi.";
    if (environment === "sandbox" && !sandboxKey) return "Ini kunci produksi, tetapi mode yang dipilih Sandbox.";
    return null;
  }
  if (key.startsWith("xnd_public_")) return "Itu Public Key. Gunakan Secret Key Xendit (diawali \"xnd_production_\" atau \"xnd_development_\").";
  if (!/^xnd_(production|development)_/.test(key)) return "Itu bukan Secret Key Xendit (harus diawali \"xnd_production_\" atau \"xnd_development_\").";
  return null;
}

async function actorEmail(superadminId?: string) {
  if (!superadminId) return undefined;
  const [row] = await db.select({ email: superadmins.email }).from(superadmins).where(eq(superadmins.id, superadminId));
  return row?.email ?? undefined;
}

async function describe(provider: Provider, cfg: GatewayConfig, since: Date) {
  const [row] = await db.select().from(paymentGateways).where(eq(paymentGateways.provider, provider));
  const stats = await db.select({ status: billingOrders.status, n: sql<number>`count(*)::int` }).from(billingOrders)
    .where(and(eq(billingOrders.provider, provider), gte(billingOrders.createdAt, since))).groupBy(billingOrders.status);
  const count = (s: string) => stats.find((x) => x.status === s)?.n ?? 0;
  return {
    provider,
    label: LABEL[provider],
    enabled: cfg.enabled,
    priority: cfg.priority,
    environment: cfg.environment,
    hasKey: !!cfg.secretKey,
    keySource: cfg.keySource,
    keyTail: row?.secretKeyLast4 ? `••••${row.secretKeyLast4}` : null,
    hasWebhookToken: !!cfg.webhookToken,
    needsWebhookToken: provider === "xendit",
    webhookUrl: webhookUrl(provider),
    lastTest: row?.lastTestAt ? { at: row.lastTestAt, ok: !!row.lastTestOk, message: row.lastTestMessage ?? "" } : null,
    lastWebhook: row?.lastWebhookAt ? { at: row.lastWebhookAt, result: row.lastWebhookResult ?? "" } : null,
    orders30d: { paid: count("paid"), pending: count("pending"), failed: count("failed"), expired: count("expired") },
  };
}

// GET /api/superadmin/payment-gateways
paymentGatewaysAdminRouter.get("/", async (_req, res) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const cfgs = await Promise.all(PROVIDERS.map(loadGateway));
  const gateways = await Promise.all(cfgs.map((c) => describe(c.provider, c, since)));
  const [settings] = await db.select({ renewalWhatsapp: platformSettings.renewalWhatsapp }).from(platformSettings).limit(1);
  res.json({
    gateways: gateways.sort((a, b) => a.priority - b.priority || a.provider.localeCompare(b.provider)),
    // The order checkout will actually try, after dropping anything switched off or missing a key/token.
    checkoutOrder: orderGateways(cfgs).map((c) => c.provider),
    whatsappFallback: !!settings?.renewalWhatsapp,
  });
});

// PUT /api/superadmin/payment-gateways/:provider
paymentGatewaysAdminRouter.put("/:provider", async (req, res) => {
  const provider = req.params.provider;
  if (!isProvider(provider)) return res.status(404).json({ error: "Gateway tidak dikenal" });
  const b = (req.body ?? {}) as Record<string, unknown>;

  const [existing] = await db.select().from(paymentGateways).where(eq(paymentGateways.provider, provider));
  const current = await loadGateway(provider);

  const enabled = b.enabled === undefined ? current.enabled : b.enabled === true;
  let priority = current.priority;
  if (b.priority !== undefined) {
    const p = Number(b.priority);
    if (!Number.isInteger(p) || p < 1 || p > 999) return res.status(400).json({ error: "Prioritas harus angka bulat 1–999" });
    priority = p;
  }
  let environment = current.environment;
  if (b.environment !== undefined) {
    if (b.environment !== "sandbox" && b.environment !== "production") return res.status(400).json({ error: "Mode harus sandbox atau production" });
    environment = provider === "midtrans" ? b.environment : current.environment;
  }

  const patch: Partial<typeof paymentGateways.$inferInsert> = {};
  const newKey = typeof b.secretKey === "string" ? b.secretKey.trim() : "";
  if (b.secretKey !== undefined && b.secretKey !== "" && typeof b.secretKey !== "string") return res.status(400).json({ error: "Secret Key harus berupa teks" });
  if (newKey) {
    if (newKey.length < 12 || newKey.length > 300 || /\s/.test(newKey)) return res.status(400).json({ error: "Secret Key tidak valid (terlalu pendek, atau mengandung spasi)" });
    const problem = keyProblem(provider, newKey, environment);
    if (problem) return res.status(400).json({ error: problem });
    patch.secretKeyEnc = encryptSecret(newKey);
    patch.secretKeyLast4 = maskedTail(newKey).replace(/•/g, "");
    patch.lastTestAt = null; patch.lastTestOk = null; patch.lastTestMessage = null; // old verdict no longer applies
  } else if (b.clearSecretKey === true) {
    patch.secretKeyEnc = null; patch.secretKeyLast4 = null;
  } else if (provider === "midtrans" && b.environment !== undefined && current.secretKey) {
    // Switching environment with a key already stored: make sure the stored key still matches.
    const problem = keyProblem(provider, current.secretKey, environment);
    if (problem) return res.status(400).json({ error: `Mode tidak cocok dengan kunci yang tersimpan. ${problem} Masukkan Server Key yang sesuai sekaligus.` });
  }

  const newToken = typeof b.webhookToken === "string" ? b.webhookToken.trim() : "";
  if (newToken) {
    if (provider !== "xendit") return res.status(400).json({ error: "Midtrans tidak memakai webhook token (memakai signature otomatis)" });
    if (newToken.length < 8 || newToken.length > 300 || /\s/.test(newToken)) return res.status(400).json({ error: "Webhook token tidak valid" });
    patch.webhookTokenEnc = encryptSecret(newToken);
  } else if (b.clearWebhookToken === true) {
    patch.webhookTokenEnc = null;
  }

  const email = await actorEmail(req.superadminId);
  const values = { provider, enabled, priority, environment, updatedBy: email ?? null, updatedAt: new Date(), ...patch };
  if (existing) await db.update(paymentGateways).set(values).where(eq(paymentGateways.provider, provider));
  else await db.insert(paymentGateways).values(values);

  const after = await loadGateway(provider);
  if (enabled && (!after.secretKey || (provider === "xendit" && !after.webhookToken))) {
    // Saved, but tell the admin clearly that "on" is not yet "working".
    logEvent({ category: "billing", action: "gateway.incomplete", message: `${LABEL[provider]} diaktifkan tetapi konfigurasi belum lengkap`, level: "warning", actorType: "superadmin", actorLabel: email });
  }
  logEvent({ category: "billing", action: "gateway.updated", message: `Pengaturan ${LABEL[provider]} diperbarui (${enabled ? "aktif" : "nonaktif"}, prioritas ${priority}${newKey ? ", kunci diganti" : ""}${newToken ? ", token diganti" : ""})`, actorType: "superadmin", actorLabel: email });
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  res.json(await describe(provider, after, since));
});

// POST /api/superadmin/payment-gateways/:provider/test — verify the saved credentials against the gateway
paymentGatewaysAdminRouter.post("/:provider/test", async (req, res) => {
  const provider = req.params.provider;
  if (!isProvider(provider)) return res.status(404).json({ error: "Gateway tidak dikenal" });
  const cfg = await loadGateway(provider);
  if (!cfg.secretKey) return res.status(400).json({ error: "Belum ada Secret Key untuk dites" });

  const result = provider === "midtrans"
    ? await testMidtrans({ serverKey: cfg.secretKey, production: cfg.environment === "production" })
    : await testXendit({ secretKey: cfg.secretKey });

  await db.insert(paymentGateways).values({ provider, enabled: cfg.enabled, priority: cfg.priority, environment: cfg.environment, lastTestAt: new Date(), lastTestOk: result.ok, lastTestMessage: result.message })
    .onConflictDoUpdate({ target: paymentGateways.provider, set: { lastTestAt: new Date(), lastTestOk: result.ok, lastTestMessage: result.message } });
  logEvent({ category: "billing", action: "gateway.tested", message: `Tes koneksi ${LABEL[provider]}: ${result.ok ? "berhasil" : "gagal"} — ${result.message}`, level: result.ok ? "info" : "warning", actorType: "superadmin", actorLabel: await actorEmail(req.superadminId) });
  res.json({ ...result, provider, defaultPriority: DEFAULT_PRIORITY[provider] });
});
