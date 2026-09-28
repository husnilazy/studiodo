import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { platformSettings, tenants } from "../db/schema.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// Single source of truth for "is this tenant's kiosk locked" — shared by
// getSubscriptionStatus (DB fetch + this) and server/routes/superadmin.ts's
// GET /tenants (which already has the data in hand from its own query), so the
// grace-period threshold math never has to be kept in sync by hand in two places.
export function computeLocked(status: string, subscriptionEndsAt: Date | null, gracePeriodDays: number): boolean {
  if (status === "suspended") return true;
  if (!subscriptionEndsAt) return false; // never set — never lock pre-Fase-2 tenants
  const graceDeadline = subscriptionEndsAt.getTime() + gracePeriodDays * DAY_MS;
  return Date.now() > graceDeadline;
}

export interface SubscriptionStatus {
  locked: boolean;
  status: string;
  subscriptionEndsAt: Date | null;
  gracePeriodDays: number;
  // 0 once locked, null while not yet past subscriptionEndsAt at all, otherwise
  // days remaining until the grace deadline is reached.
  graceDaysRemaining: number | null;
}

// gracePeriodDays is one global, rarely-changed platform setting — every
// tenant's every session-create/payment-start request was re-fetching this
// exact same row from Neon. Cached in-process for a minute so it costs a
// round-trip only occasionally instead of on every single request; an admin
// changing it takes up to 60s to propagate, which is fine for a value that
// only matters at the scale of days.
const SETTINGS_CACHE_TTL_MS = 60_000;
let cachedGracePeriodDays: number | null = null;
let cachedAt = 0;

async function getGracePeriodDays(): Promise<number> {
  if (cachedGracePeriodDays !== null && Date.now() - cachedAt < SETTINGS_CACHE_TTL_MS) {
    return cachedGracePeriodDays;
  }
  const [settings] = await db.select({ gracePeriodDays: platformSettings.gracePeriodDays }).from(platformSettings).limit(1);
  cachedGracePeriodDays = settings?.gracePeriodDays ?? 3;
  cachedAt = Date.now();
  return cachedGracePeriodDays;
}

export async function getSubscriptionStatus(tenantId: string): Promise<SubscriptionStatus> {
  // Independent reads — run concurrently instead of paying sequential
  // round-trips. This function sits on every session-create and
  // payment-start request (via requireActiveSubscription), so the latency
  // here is felt everywhere.
  const [[tenant], gracePeriodDays] = await Promise.all([
    db.select({ status: tenants.status, subscriptionEndsAt: tenants.subscriptionEndsAt }).from(tenants).where(eq(tenants.id, tenantId)),
    getGracePeriodDays(),
  ]);

  const status = tenant?.status ?? "active";
  const subscriptionEndsAt = tenant?.subscriptionEndsAt ?? null;
  const locked = computeLocked(status, subscriptionEndsAt, gracePeriodDays);

  let graceDaysRemaining: number | null = null;
  if (locked) {
    graceDaysRemaining = 0;
  } else if (subscriptionEndsAt && Date.now() > subscriptionEndsAt.getTime()) {
    const graceDeadline = subscriptionEndsAt.getTime() + gracePeriodDays * DAY_MS;
    graceDaysRemaining = Math.ceil((graceDeadline - Date.now()) / DAY_MS);
  }

  return { locked, status, subscriptionEndsAt, gracePeriodDays, graceDaysRemaining };
}
