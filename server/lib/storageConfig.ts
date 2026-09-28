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

/**
 * tenant_settings is the only source of storage CREDENTIALS — unlike a
 * single-tenant install, falling back to a shared process.env credential
 * here would mean every tenant without its own R2/Drive config silently
 * writes into the same bucket/folder as every other such tenant, mixing
 * (and for Drive, effectively exposing) their customers' photos to one
 * another. Only STORAGE_DRIVER (a preference, not a secret) has an env
 * fallback; a tenant with no credentials configured for that driver just
 * gets a clear "belum lengkap" error instead of silently sharing storage.
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
  cache.set(tenantId, { settings, expiresAt: Date.now() + CACHE_TTL_MS });
  return settings;
}
