import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { paymentGateways } from "../db/schema.js";
import { decryptSecret } from "./secretBox.js";

// Resolves the platform's payment-gateway configuration: values saved in Superadmin win, and a provider with
// nothing saved falls back to environment variables (so a deployment that was set up with env vars before
// the Superadmin form existed keeps working unchanged).

export type Provider = "midtrans" | "xendit";
export const PROVIDERS: Provider[] = ["midtrans", "xendit"];
export const DEFAULT_PRIORITY: Record<Provider, number> = { midtrans: 10, xendit: 20 };

export interface GatewayConfig {
  provider: Provider;
  enabled: boolean;
  priority: number;
  environment: "sandbox" | "production";
  secretKey: string | null;
  webhookToken: string | null;
  keySource: "database" | "environment" | "none";
}

type Row = typeof paymentGateways.$inferSelect | undefined;

function envFor(provider: Provider): { secretKey: string | null; webhookToken: string | null; production: boolean } {
  if (provider === "midtrans") {
    return { secretKey: process.env.MIDTRANS_SERVER_KEY || null, webhookToken: null, production: process.env.MIDTRANS_IS_PRODUCTION === "true" };
  }
  return { secretKey: process.env.XENDIT_BILLING_SECRET_KEY || null, webhookToken: process.env.XENDIT_BILLING_WEBHOOK_TOKEN || null, production: true };
}

/** Pure merge of a stored row and the environment — separated from the DB read so it can be unit-tested. */
export function mergeGatewayConfig(provider: Provider, row: Row, env = envFor(provider)): GatewayConfig {
  const dbKey = decryptSecret(row?.secretKeyEnc);
  const secretKey = dbKey ?? env.secretKey;
  const dbToken = decryptSecret(row?.webhookTokenEnc);
  const webhookToken = dbToken ?? env.webhookToken;
  return {
    provider,
    // No row at all = legacy env-only setup: usable as soon as an env key exists. With a row, the admin's switch decides.
    enabled: row ? row.enabled : !!env.secretKey,
    priority: row?.priority ?? DEFAULT_PRIORITY[provider],
    environment: row ? (row.environment === "production" ? "production" : "sandbox") : env.production ? "production" : "sandbox",
    secretKey,
    webhookToken,
    keySource: dbKey ? "database" : env.secretKey ? "environment" : "none",
  };
}

export async function loadGateway(provider: Provider): Promise<GatewayConfig> {
  const [row] = await db.select().from(paymentGateways).where(eq(paymentGateways.provider, provider));
  return mergeGatewayConfig(provider, row);
}

/** A gateway can take payments only if it is switched on, has a key, and (Xendit) has a webhook token to confirm payments. */
export function isUsable(cfg: GatewayConfig): boolean {
  if (!cfg.enabled || !cfg.secretKey) return false;
  if (cfg.provider === "xendit" && !cfg.webhookToken) return false;
  return true;
}

/** Usable gateways in the order checkout should try them (lowest priority number first, name as tie-break). */
export function orderGateways(configs: GatewayConfig[]): GatewayConfig[] {
  return configs.filter(isUsable).sort((a, b) => a.priority - b.priority || a.provider.localeCompare(b.provider));
}

export async function usableGateways(): Promise<GatewayConfig[]> {
  return orderGateways(await Promise.all(PROVIDERS.map(loadGateway)));
}

export async function noteWebhook(provider: Provider, result: string) {
  // Upsert so a webhook arriving before anyone saved settings (env-only setup) is still recorded. A newly created
  // row must keep that setup working, so it starts enabled iff an env key exists (a row with enabled=false would switch it off).
  await db.insert(paymentGateways).values({ provider, enabled: !!envFor(provider).secretKey, lastWebhookAt: new Date(), lastWebhookResult: result.slice(0, 200) })
    .onConflictDoUpdate({ target: paymentGateways.provider, set: { lastWebhookAt: new Date(), lastWebhookResult: result.slice(0, 200) } });
}
