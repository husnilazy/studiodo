import { db } from "../db/client.js";
import { platformSettings } from "../db/schema.js";
import { decryptSecret } from "./secretBox.js";
import type { DokuCfg } from "./doku.js";

// STUDIODO's own DOKU account. Tenants whose QRIS is "ditampung STUDIODO" (tenants.qrisSettlement = 'platform') pay their
// kiosk customers through this account, and the tenant then withdraws the balance (wallet_ledger). Credentials live in
// platform_settings, secrets encrypted (lib/secretBox.ts) and write-only through the API.

export type PlatformDokuRow = Pick<
  typeof platformSettings.$inferSelect,
  "dokuClientId" | "dokuSecretKeyEnc" | "dokuEnvironment" | "dokuQrisMode" | "dokuMerchantId" | "dokuTerminalId" | "dokuPostalCode" | "dokuSnapPrivateKeyEnc"
>;

/** Pure: stored row -> client config. Returns null when Client ID or Secret Key is missing. SNAP mode degrades to Checkout if incomplete. */
export function buildPlatformDokuCfg(row: PlatformDokuRow | undefined): DokuCfg | null {
  if (!row) return null;
  const secretKey = decryptSecret(row.dokuSecretKeyEnc);
  if (!row.dokuClientId || !secretKey) return null;
  const cfg: DokuCfg = { clientId: row.dokuClientId, secretKey, production: row.dokuEnvironment === "production" };
  if (row.dokuQrisMode === "snap") {
    const privateKeyPem = decryptSecret(row.dokuSnapPrivateKeyEnc);
    if (row.dokuMerchantId && row.dokuTerminalId && privateKeyPem) cfg.snap = { merchantId: row.dokuMerchantId, terminalId: row.dokuTerminalId, postalCode: row.dokuPostalCode || "10110", privateKeyPem };
    else console.warn("[doku] Mode QRIS langsung platform dipilih tetapi Merchant ID / Terminal ID / kunci privat belum lengkap - memakai Checkout.");
  }
  return cfg;
}

export async function loadPlatformDokuRow(): Promise<PlatformDokuRow | undefined> {
  const [row] = await db.select({
    dokuClientId: platformSettings.dokuClientId,
    dokuSecretKeyEnc: platformSettings.dokuSecretKeyEnc,
    dokuEnvironment: platformSettings.dokuEnvironment,
    dokuQrisMode: platformSettings.dokuQrisMode,
    dokuMerchantId: platformSettings.dokuMerchantId,
    dokuTerminalId: platformSettings.dokuTerminalId,
    dokuPostalCode: platformSettings.dokuPostalCode,
    dokuSnapPrivateKeyEnc: platformSettings.dokuSnapPrivateKeyEnc,
  }).from(platformSettings).limit(1);
  return row;
}

export async function loadPlatformDoku(): Promise<DokuCfg | null> {
  return buildPlatformDokuCfg(await loadPlatformDokuRow());
}
