import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { tenantSettings } from "../db/schema.js";

export type StorageDriver = "local" | "r2" | "gdrive";

export interface StorageSettings {
  driver: StorageDriver;
  r2AccountId: string | null;
  r2Endpoint: string | null;
  r2Bucket: string | null;
  r2AccessKeyId: string | null;
  r2SecretAccessKey: string | null;
  r2PublicBaseUrl: string | null;
  r2Prefix: string | null;
  gdriveServiceAccountJson: string | null;
  gdriveFolderId: string | null;
}

const CACHE_TTL_MS = 30_000;

// One process now serves many tenants, so the cache is keyed by tenantId —
// short TTL trades a little staleness after a settings change for avoiding a
// DB round-trip on every single photo/media/strip upload during a live event.
const cache = new Map<string, { settings: StorageSettings; expiresAt: number }>();

export function resetStorageSettingsCache(tenantId: string) {
  cache.delete(tenantId);
}

function normalizeDriver(value: unknown): StorageDriver {
  if (value === "r2" || value === "gdrive") return value;
  return "local";
}

const hasOwnR2 = (s: StorageSettings) => Boolean(s.r2Bucket && s.r2AccessKeyId && s.r2SecretAccessKey && s.r2PublicBaseUrl && (s.r2Endpoint || s.r2AccountId));

function platformR2(): Pick<StorageSettings, "r2AccountId" | "r2Endpoint" | "r2Bucket" | "r2AccessKeyId" | "r2SecretAccessKey" | "r2PublicBaseUrl" | "r2Prefix"> | null {
  const e = process.env;
  if (!e.R2_BUCKET || !e.R2_ACCESS_KEY_ID || !e.R2_SECRET_ACCESS_KEY || !e.R2_PUBLIC_BASE_URL || !(e.R2_ACCOUNT_ID || e.R2_ENDPOINT)) return null;
  return {
    r2AccountId: e.R2_ACCOUNT_ID ?? null, r2Endpoint: e.R2_ENDPOINT ?? null, r2Bucket: e.R2_BUCKET, r2AccessKeyId: e.R2_ACCESS_KEY_ID,
    r2SecretAccessKey: e.R2_SECRET_ACCESS_KEY, r2PublicBaseUrl: e.R2_PUBLIC_BASE_URL, r2Prefix: e.R2_PREFIX ?? null,
  };
}

/**
 * Credentials come from tenant_settings. Only a tenant with NO R2 of its own (and driver r2) falls back to STUDIODO's shared
 * bucket from the R2_* env vars; the tenantId is part of every object key, so tenants stay apart by path. Google Drive never
 * falls back to a shared account (that would expose one tenant's photos to another), and neither does an explicit 'local'.
 * Set the R2_* vars (and STORAGE_DRIVER=r2) on every deployment that serves tenants, Vercel included.
 */
export async function getStorageSettings(tenantId: string): Promise<StorageSettings> {
  const cached = cache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) return cached.settings;

  const [row] = await db.select().from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId));

  const settings: StorageSettings = {
    driver: normalizeDriver(row?.storageDriver ?? process.env.STORAGE_DRIVER),
    r2AccountId: row?.r2AccountId ?? null,
    r2Endpoint: row?.r2Endpoint ?? null,
    r2Bucket: row?.r2Bucket ?? null,
    r2AccessKeyId: row?.r2AccessKeyId ?? null,
    r2SecretAccessKey: row?.r2SecretAccessKey ?? null,
    r2PublicBaseUrl: row?.r2PublicBaseUrl ?? null,
    r2Prefix: row?.r2Prefix ?? null,
    gdriveServiceAccountJson: row?.gdriveServiceAccountJson ?? null,
    gdriveFolderId: row?.gdriveFolderId ?? null,
  };
  // A tenant that never set up its own R2 (most new tenants: they cannot be expected to open a Cloudflare account) uses
  // STUDIODO's shared bucket from the R2_* env vars. Files stay apart by key — saveUploadedFile / createPresignedUpload always
  // put the tenantId in the path. A tenant that deliberately chose 'local' or 'gdrive' is left alone.
  if (settings.driver === "r2" && !hasOwnR2(settings)) {
    const platform = platformR2();
    if (platform) Object.assign(settings, platform);
  }
  cache.set(tenantId, { settings, expiresAt: Date.now() + CACHE_TTL_MS });
  return settings;
}
