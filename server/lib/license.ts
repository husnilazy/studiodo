import crypto from "node:crypto";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "../db/client.js";
import { kioskKeys, platformSettings, tenants } from "../db/schema.js";

// Per-booth licensing. ONE kiosk key = ONE booth = ONE licence, each with its own type and end date (see the comment on
// kiosk_keys.license_type). Everything that decides "is this booth allowed to run" goes through computeKeyLock, so the
// website, the superadmin console, the kiosk heartbeat and the API gate can never disagree.

const DAY_MS = 24 * 60 * 60 * 1000;

export type LicenseType = "trial" | "paid" | "unpaid";
export type LockReason = "suspended" | "unpaid" | "trial_expired" | "expired";

export interface LicenseInput {
  licenseType: string;
  licenseEndsAt: Date | null;
}

export interface KeyLock {
  locked: boolean;
  reason: LockReason | null;
  licenseType: LicenseType;
  licenseEndsAt: Date | null;
  /** The moment the booth locks (end date, plus the grace period for paid booths). Null when it never locks. */
  lockAt: Date | null;
  /** Days until licenseEndsAt (negative once past it). Null when there is no end date. */
  daysRemaining: number | null;
  /** Days of tolerance left once a PAID booth is past its end date; null before that, 0 once locked. */
  graceDaysRemaining: number | null;
}

export function normalizeLicenseType(value: string): LicenseType {
  return value === "trial" || value === "paid" ? value : "unpaid";
}

/** Pure — the only place the lock rules live. */
export function computeKeyLock(tenantStatus: string, license: LicenseInput, gracePeriodDays: number, now = Date.now()): KeyLock {
  const licenseType = normalizeLicenseType(license.licenseType);
  const endsAt = license.licenseEndsAt ? new Date(license.licenseEndsAt) : null;
  const daysRemaining = endsAt ? Math.ceil((endsAt.getTime() - now) / DAY_MS) : null;
  const base = { licenseType, licenseEndsAt: endsAt, daysRemaining };

  if (tenantStatus === "suspended") return { ...base, locked: true, reason: "suspended", lockAt: null, graceDaysRemaining: 0 };
  if (licenseType === "unpaid") return { ...base, locked: true, reason: "unpaid", lockAt: null, graceDaysRemaining: 0 };

  if (licenseType === "trial") {
    // A trial always has an end date; one without it is a data error and must not become a free forever-licence.
    const lockAt = endsAt;
    const locked = !lockAt || now > lockAt.getTime();
    return { ...base, locked, reason: locked ? "trial_expired" : null, lockAt, graceDaysRemaining: locked ? 0 : null };
  }

  // paid: no end date = complimentary / unlimited
  if (!endsAt) return { ...base, locked: false, reason: null, lockAt: null, graceDaysRemaining: null };
  const lockAt = new Date(endsAt.getTime() + gracePeriodDays * DAY_MS);
  const locked = now > lockAt.getTime();
  let graceDaysRemaining: number | null = null;
  if (locked) graceDaysRemaining = 0;
  else if (now > endsAt.getTime()) graceDaysRemaining = Math.ceil((lockAt.getTime() - now) / DAY_MS);
  return { ...base, locked, reason: locked ? "expired" : null, lockAt, graceDaysRemaining };
}

/** Human-readable (Indonesian) explanation of why a booth is locked — shown by the API gate and the kiosk lock screen. */
export function lockMessage(reason: LockReason | null): string {
  switch (reason) {
    case "suspended": return "Akun tenant ini dinonaktifkan. Hubungi admin STUDIODO.";
    case "unpaid": return "Booth ini belum berlangganan. Aktifkan langganan booth ini di dashboard STUDIODO untuk memakainya.";
    case "trial_expired": return "Masa trial booth ini sudah berakhir. Berlangganan penuh untuk melanjutkan memakai kiosk.";
    case "expired": return "Langganan booth ini sudah berakhir dan melewati masa tenggang. Perpanjang untuk mengaktifkan kembali kiosk.";
    default: return "";
  }
}

// gracePeriodDays is one global, rarely-changed platform setting — cached in-process for a minute so the per-request
// status lookup does not re-read the same row from the (remote) database every time.
const SETTINGS_CACHE_TTL_MS = 60_000;
let cachedGracePeriodDays: number | null = null;
let cachedAt = 0;

export async function getGracePeriodDays(): Promise<number> {
  if (cachedGracePeriodDays !== null && Date.now() - cachedAt < SETTINGS_CACHE_TTL_MS) return cachedGracePeriodDays;
  const [settings] = await db.select({ gracePeriodDays: platformSettings.gracePeriodDays }).from(platformSettings).limit(1);
  cachedGracePeriodDays = settings?.gracePeriodDays ?? 3;
  cachedAt = Date.now();
  return cachedGracePeriodDays;
}

/** Call after the platform grace period was changed so the new value applies immediately. */
export function resetGraceCache() {
  cachedGracePeriodDays = null;
}

// A lock/unlock only has to reach the kiosk within seconds, not instantly.
const STATUS_CACHE_TTL_MS = 15_000;
const statusCache = new Map<string, { value: KeyLock; expires: number }>();

/** Drops cached lock states. Call after anything that changes a licence, a tenant status or the grace period. */
export function clearLicenseCache(keyId?: string) {
  if (keyId) statusCache.delete(keyId);
  else statusCache.clear();
}

export async function getKeyLock(keyId: string): Promise<KeyLock> {
  const hit = statusCache.get(keyId);
  if (hit && hit.expires > Date.now()) return hit.value;
  const [[row], grace] = await Promise.all([
    db.select({ licenseType: kioskKeys.licenseType, licenseEndsAt: kioskKeys.licenseEndsAt, tenantStatus: tenants.status })
      .from(kioskKeys).innerJoin(tenants, eq(tenants.id, kioskKeys.tenantId)).where(eq(kioskKeys.id, keyId)),
    getGracePeriodDays(),
  ]);
  // A key that no longer exists is not a licence anyone can use.
  const value = row
    ? computeKeyLock(row.tenantStatus, row, grace)
    : computeKeyLock("suspended", { licenseType: "unpaid", licenseEndsAt: null }, grace);
  statusCache.set(keyId, { value, expires: Date.now() + STATUS_CACHE_TTL_MS });
  return value;
}

export interface TenantLicenseSummary {
  activeKeys: number;
  paid: number;
  trial: number;
  unpaid: number;
  locked: number;
  expiringSoon: number; // active (not locked) booths whose end date is within 7 days
  /** The soonest end date among booths that have one and are not yet locked — what the "N days left" banner counts down. */
  nearestEndsAt: Date | null;
}

type KeyForSummary = { revokedAt: Date | null; licenseType: string; licenseEndsAt: Date | null };

/** Pure aggregate of a tenant's booths. */
export function summarizeLicenses(tenantStatus: string, keys: KeyForSummary[], gracePeriodDays: number, now = Date.now()): TenantLicenseSummary {
  const summary: TenantLicenseSummary = { activeKeys: 0, paid: 0, trial: 0, unpaid: 0, locked: 0, expiringSoon: 0, nearestEndsAt: null };
  for (const key of keys) {
    if (key.revokedAt) continue;
    summary.activeKeys += 1;
    const lock = computeKeyLock(tenantStatus, key, gracePeriodDays, now);
    summary[lock.licenseType] += 1;
    if (lock.locked) { summary.locked += 1; continue; }
    if (lock.licenseEndsAt) {
      if (lock.licenseEndsAt.getTime() - now <= 7 * DAY_MS && lock.licenseEndsAt.getTime() > now) summary.expiringSoon += 1;
      if (!summary.nearestEndsAt || lock.licenseEndsAt < summary.nearestEndsAt) summary.nearestEndsAt = lock.licenseEndsAt;
    }
  }
  return summary;
}

export async function getTenantLicenseSummary(tenantId: string): Promise<TenantLicenseSummary> {
  const [[tenant], keys, grace] = await Promise.all([
    db.select({ status: tenants.status }).from(tenants).where(eq(tenants.id, tenantId)),
    db.select({ revokedAt: kioskKeys.revokedAt, licenseType: kioskKeys.licenseType, licenseEndsAt: kioskKeys.licenseEndsAt }).from(kioskKeys).where(eq(kioskKeys.tenantId, tenantId)),
    getGracePeriodDays(),
  ]);
  return summarizeLicenses(tenant?.status ?? "active", keys, grace);
}

/**
 * Mirrors the booths' latest end date onto tenants.subscription_ends_at. The tenant-level date no longer decides
 * anything (each key carries its own); it stays only as a convenient "latest paid-through" figure for lists and the
 * public booth directory.
 */
export async function syncTenantEndsAt(tenantId: string) {
  const keys = await db.select({ licenseEndsAt: kioskKeys.licenseEndsAt }).from(kioskKeys)
    .where(and(eq(kioskKeys.tenantId, tenantId), isNull(kioskKeys.revokedAt), ne(kioskKeys.licenseType, "unpaid")));
  const ends = keys.map((k) => k.licenseEndsAt).filter((d): d is Date => !!d);
  const latest = ends.length > 0 ? new Date(Math.max(...ends.map((d) => d.getTime()))) : null;
  await db.update(tenants).set({ subscriptionEndsAt: latest }).where(eq(tenants.id, tenantId));
}

type Db = Pick<typeof db, "select" | "update">;

/**
 * Pushes the given booths' end date forward by `days`, counting from whichever is later — their current end or now — so
 * renewing early never wastes days. An unpaid booth becomes paid; a trial booth keeps its type unless `convertTrial`
 * (a real payment turns a trial into a full subscription). Returns the updated key ids.
 */
export async function extendKeys(
  keyIds: string[],
  days: number,
  opts: { planSlug?: string | null; convertTrial?: boolean; tx?: Db } = {},
): Promise<string[]> {
  if (keyIds.length === 0) return [];
  const conn = opts.tx ?? db;
  const rows = await conn.select({ id: kioskKeys.id, licenseType: kioskKeys.licenseType, licenseEndsAt: kioskKeys.licenseEndsAt })
    .from(kioskKeys).where(inArray(kioskKeys.id, keyIds));
  const now = Date.now();
  const done: string[] = [];
  for (const row of rows) {
    const current = row.licenseType !== "unpaid" && row.licenseEndsAt ? new Date(row.licenseEndsAt).getTime() : now;
    const next = new Date(Math.max(current, now) + days * DAY_MS);
    const keepTrial = row.licenseType === "trial" && !opts.convertTrial;
    await conn.update(kioskKeys).set({
      licenseEndsAt: next,
      licenseType: keepTrial ? "trial" : "paid",
      ...(opts.planSlug !== undefined && !keepTrial ? { licensePlanSlug: opts.planSlug } : {}),
    }).where(eq(kioskKeys.id, row.id));
    done.push(row.id);
  }
  clearLicenseCache();
  return done;
}

export const hashKioskKey = (rawKey: string) => crypto.createHash("sha256").update(rawKey).digest("hex");

export type IssueKind = "trial" | "paid" | "unpaid";

/**
 * Creates a kiosk key together with its licence. `days` is the length of a trial / paid period counted from now
 * (ignored for unpaid). Returns the raw key — it is only ever stored hashed (plus the recoverable copy in raw_key), so
 * this is the moment to show it.
 */
export async function issueKioskKey(
  tenantId: string,
  opts: { label?: string | null; kind: IssueKind; days?: number; planSlug?: string | null },
  conn: Pick<typeof db, "insert"> = db,
) {
  const rawKey = crypto.randomBytes(32).toString("hex");
  const days = Math.max(1, Math.round(opts.days ?? 0));
  const endsAt = opts.kind === "unpaid" ? null : new Date(Date.now() + days * DAY_MS);
  const [row] = await conn.insert(kioskKeys).values({
    tenantId,
    label: opts.label?.trim().slice(0, 80) || null,
    keyHash: hashKioskKey(rawKey),
    rawKey,
    licenseType: opts.kind,
    licenseEndsAt: endsAt,
    licensePlanSlug: opts.planSlug ?? null,
    trialStartedAt: opts.kind === "trial" ? new Date() : null,
  }).returning({ id: kioskKeys.id, label: kioskKeys.label, licenseType: kioskKeys.licenseType, licenseEndsAt: kioskKeys.licenseEndsAt });
  clearLicenseCache();
  return { ...row, rawKey };
}
