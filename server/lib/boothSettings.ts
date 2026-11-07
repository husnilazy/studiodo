import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { boothSettings } from "../db/schema.js";

// Per-booth settings: one tenant, several booths (kiosk keys), each may differ (a Jakarta booth priced higher than Jogja, another colour,
// a package that only one booth offers). Everything not overridden follows the tenant's main settings. Only the fields below can be
// overridden, validated here; a price is ALWAYS applied on the server (session creation), never trusted from the kiosk.

export const BOOTH_TEXT_KEYS = ["brandName", "tagline", "promoText", "idleHeadline", "idleSubheadline", "idleStartText", "packageHeadline"] as const;
export const BOOTH_COLOR_KEYS = ["accentColor", "backgroundColor", "surfaceColor", "textColor"] as const;
export const BOOTH_OVERRIDE_KEYS: readonly string[] = [...BOOTH_TEXT_KEYS, ...BOOTH_COLOR_KEYS];

export type BoothOverrides = Record<string, string>;
export type PackageOverride = { price?: number; active?: boolean };
export type PackageOverrides = Record<string, PackageOverride>;

const HEX = /^#[0-9a-fA-F]{6}$/;
const UUID = /^[0-9a-f-]{36}$/i;
export const MAX_PRICE = 100_000_000;

/** Keeps only whitelisted keys; an empty value means "follow the main setting" and is dropped. */
export function sanitizeOverrides(raw: unknown): { ok: true; value: BoothOverrides } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: {} };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Pengaturan tampilan booth tidak valid." };
  const out: BoothOverrides = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!BOOTH_OVERRIDE_KEYS.includes(key)) continue;
    if (value === null || value === "") continue;
    if (typeof value !== "string") return { ok: false, error: `Nilai "${key}" harus berupa teks.` };
    const v = value.trim().slice(0, 200);
    if (!v) continue;
    if ((BOOTH_COLOR_KEYS as readonly string[]).includes(key) && !HEX.test(v)) return { ok: false, error: `Warna "${key}" tidak valid (contoh: #1a73e8).` };
    out[key] = v;
  }
  return { ok: true, value: out };
}

/** Only packages of this tenant (validIds) may be listed; an entry that changes nothing is dropped. */
export function sanitizePackageOverrides(raw: unknown, validIds: Set<string>): { ok: true; value: PackageOverrides } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: {} };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Pengaturan paket booth tidak valid." };
  const out: PackageOverrides = {};
  for (const [id, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!UUID.test(id) || !validIds.has(id)) continue;
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const item: PackageOverride = {};
    if (e.price !== undefined && e.price !== null && e.price !== "") {
      const price = Math.round(Number(e.price));
      if (!Number.isFinite(price) || price < 0 || price > MAX_PRICE) return { ok: false, error: "Harga paket booth tidak valid (0 sampai 100.000.000)." };
      item.price = price;
    }
    if (e.active === false) item.active = false;
    if (Object.keys(item).length > 0) out[id] = item;
  }
  return { ok: true, value: out };
}

export async function loadBoothSettings(kioskKeyId: string | null | undefined): Promise<{ overrides: BoothOverrides; packageOverrides: PackageOverrides }> {
  if (!kioskKeyId) return { overrides: {}, packageOverrides: {} };
  const [row] = await db.select().from(boothSettings).where(eq(boothSettings.kioskKeyId, kioskKeyId));
  return { overrides: row?.overrides ?? {}, packageOverrides: row?.packageOverrides ?? {} };
}

type PackageLike = { id: string; price: string | number | null };

/** What this booth sells: hidden packages removed, booth prices applied. The package record in the database is never changed. */
export function applyPackageOverrides<T extends PackageLike>(rows: T[], overrides: PackageOverrides): T[] {
  return rows
    .filter((row) => overrides[row.id]?.active !== false)
    .map((row) => (overrides[row.id]?.price !== undefined ? { ...row, price: String(overrides[row.id].price) } : row));
}

/** The price this booth charges for a package, or null when the booth does not offer it. */
export function boothPackagePrice(pkg: PackageLike, overrides: PackageOverrides): number | null {
  const o = overrides[pkg.id];
  if (o?.active === false) return null;
  return o?.price !== undefined ? o.price : Number(pkg.price ?? 0);
}
