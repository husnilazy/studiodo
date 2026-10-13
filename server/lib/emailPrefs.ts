import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { creators, tenants } from "../db/schema.js";
import { signEmailToken, verifyEmailToken } from "./emailTokens.js";
import { portalBaseUrl } from "./urls.js";

// Which optional emails a tenant / creator wants. Security and account mail (verify, welcome, password, lockout) is NOT
// in these lists on purpose: it cannot be switched off. Missing key = on, so a new category is opt-out by default.

export type Realm = "tenant" | "creator";

export const TENANT_CATEGORIES = [
  { key: "subscription", label: "Pengingat langganan", hint: "Booth atau trial yang hampir berakhir dan yang sudah berakhir." },
  { key: "receipts", label: "Kuitansi pembayaran", hint: "Ringkasan setiap pembayaran langganan yang berhasil." },
] as const;
export const CREATOR_CATEGORIES = [
  { key: "reviews", label: "Ulasan baru", hint: "Saat tenant memberi ulasan pada template Anda." },
  { key: "submitted", label: "Konfirmasi template diterima", hint: "Pemberitahuan bahwa template Anda masuk antrean tinjauan." },
] as const;

const keysOf = (realm: Realm): string[] => (realm === "tenant" ? TENANT_CATEGORIES : CREATOR_CATEGORIES).map((c) => c.key);
export const categoriesOf = (realm: Realm) => (realm === "tenant" ? TENANT_CATEGORIES : CREATOR_CATEGORIES);

/** Full picture with defaults filled in: every known key → true/false. */
export function resolvePrefs(realm: Realm, stored: Record<string, boolean> | null | undefined): Record<string, boolean> {
  return Object.fromEntries(keysOf(realm).map((k) => [k, stored?.[k] !== false]));
}

export const isEnabled = (realm: Realm, stored: Record<string, boolean> | null | undefined, category: string) => resolvePrefs(realm, stored)[category] !== false;

/** Validates a PATCH body: only known categories, only booleans. Returns the cleaned partial or null when nothing valid. */
export function cleanPrefsPatch(realm: Realm, body: unknown): Record<string, boolean> | null {
  if (!body || typeof body !== "object") return null;
  const out: Record<string, boolean> = {};
  for (const k of keysOf(realm)) {
    const v = (body as Record<string, unknown>)[k];
    if (typeof v === "boolean") out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

export async function getPrefs(realm: Realm, id: string): Promise<Record<string, boolean>> {
  const [row] = realm === "tenant"
    ? await db.select({ p: tenants.emailPrefs }).from(tenants).where(eq(tenants.id, id))
    : await db.select({ p: creators.emailPrefs }).from(creators).where(eq(creators.id, id));
  return resolvePrefs(realm, row?.p);
}

export async function setPrefs(realm: Realm, id: string, patch: Record<string, boolean>): Promise<Record<string, boolean>> {
  const current = await getPrefs(realm, id);
  const next = { ...current, ...patch };
  if (realm === "tenant") await db.update(tenants).set({ emailPrefs: next }).where(eq(tenants.id, id));
  else await db.update(creators).set({ emailPrefs: next }).where(eq(creators.id, id));
  return next;
}

// --- one-click unsubscribe links ----------------------------------------------------------------------------

const UNSUB_TTL_MS = 365 * 24 * 60 * 60_000;

export const unsubscribeUrl = (realm: Realm, id: string, category: string) =>
  `${portalBaseUrl()}/berhenti-langganan?token=${encodeURIComponent(signEmailToken(realm === "tenant" ? "unsub-tenant" : "unsub-creator", id, category, UNSUB_TTL_MS))}`;

export type UnsubResult = { ok: true; realm: Realm; category: string; label: string } | { ok: false; message: string };

/** What a token would switch off (used by the confirmation page) — without changing anything. */
export function describeUnsubscribe(token: string): UnsubResult {
  for (const realm of ["tenant", "creator"] as const) {
    const v = verifyEmailToken(token, realm === "tenant" ? "unsub-tenant" : "unsub-creator");
    if (v.ok) {
      const cat = categoriesOf(realm).find((c) => c.key === v.bind);
      return cat ? { ok: true, realm, category: cat.key, label: cat.label } : { ok: false, message: "Kategori email tidak dikenal." };
    }
    if (v.reason === "expired") return { ok: false, message: "Tautan sudah kedaluwarsa. Atur preferensi email dari dashboard Anda." };
  }
  return { ok: false, message: "Tautan tidak valid." };
}

export async function applyUnsubscribe(token: string): Promise<UnsubResult> {
  for (const realm of ["tenant", "creator"] as const) {
    const v = verifyEmailToken(token, realm === "tenant" ? "unsub-tenant" : "unsub-creator");
    if (!v.ok) continue;
    const cat = categoriesOf(realm).find((c) => c.key === v.bind);
    if (!cat) return { ok: false, message: "Kategori email tidak dikenal." };
    await setPrefs(realm, v.subjectId, { [cat.key]: false });
    return { ok: true, realm, category: cat.key, label: cat.label };
  }
  return describeUnsubscribe(token);
}
