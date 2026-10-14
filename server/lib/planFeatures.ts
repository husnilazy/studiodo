import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "../db/client.js";
import { kioskKeys, plans, tenants } from "../db/schema.js";
import { getKeyLock } from "./license.js";

// Which features a subscription includes. Pricing is PER BOOTH (one key = one booth = one subscription, each bought on
// its own plan), so what is allowed is decided per booth from the plan stamped on its key (kiosk_keys.license_plan_slug,
// set by checkout / superadmin), never from one tenant-wide plan: a tenant with a PRO booth and a Starter booth gets PRO
// features on the first and Starter features on the second.
//
// Two gates exist today: Screen Builder, and GIF / video / stop-motion. The kiosk is told only what ITS booth may do
// (GET /api/packages masks the media flags per booth) and the upload routes refuse what the plan excludes, so a modified
// client gains nothing. Nothing is ever deleted: a package keeps its own settings, and an upgrade brings the features back.

export interface PlanFeatures {
  planSlug: string | null;
  planName: string | null;
  kioskLimit: number | null; // legacy display field: the plan's old booth cap no longer limits anything
  screenBuilderEnabled: boolean;
  gifVideoEnabled: boolean;
}

// Fail-open on purpose: a booth with no plan on its key (a trial, or a complimentary / manually granted licence), or a
// plan slug that no longer matches any row (plan slugs are deliberately not a foreign key), gets every feature rather than
// being silently locked out over a data mismatch that isn't the customer's fault.
export const UNRESTRICTED: Omit<PlanFeatures, "planSlug" | "planName"> = {
  kioskLimit: null,
  screenBuilderEnabled: true,
  gifVideoEnabled: true,
};

type PlanRow = { slug: string; name: string; kioskLimit: number | null; screenBuilderEnabled: boolean; gifVideoEnabled: boolean };

/** Pure: the features a plan row grants (or everything, when there is no such plan). */
export function featuresOf(slug: string | null, plan: PlanRow | undefined): PlanFeatures {
  if (!plan) return { planSlug: slug, planName: null, ...UNRESTRICTED };
  return { planSlug: plan.slug, planName: plan.name, kioskLimit: plan.kioskLimit, screenBuilderEnabled: plan.screenBuilderEnabled, gifVideoEnabled: plan.gifVideoEnabled };
}

/** Pure: a tenant can USE a feature if at least one of its booths' plans includes it (what the dashboard's editors check). */
export function bestOf(list: PlanFeatures[]): PlanFeatures {
  if (list.length === 0) return { planSlug: null, planName: null, ...UNRESTRICTED };
  const withBoth = list.find((f) => f.screenBuilderEnabled && f.gifVideoEnabled);
  const label = withBoth ?? list[0];
  return {
    planSlug: label.planSlug,
    planName: label.planName,
    kioskLimit: label.kioskLimit,
    screenBuilderEnabled: list.some((f) => f.screenBuilderEnabled),
    gifVideoEnabled: list.some((f) => f.gifVideoEnabled),
  };
}

async function loadPlans(): Promise<Map<string, PlanRow>> {
  const rows = await db.select({ slug: plans.slug, name: plans.name, kioskLimit: plans.kioskLimit, screenBuilderEnabled: plans.screenBuilderEnabled, gifVideoEnabled: plans.gifVideoEnabled }).from(plans);
  return new Map(rows.map((r) => [r.slug, r]));
}

/** What ONE booth (kiosk key) may do. */
export async function getKeyPlanFeatures(keyId: string): Promise<PlanFeatures> {
  const [key] = await db.select({ slug: kioskKeys.licensePlanSlug }).from(kioskKeys).where(eq(kioskKeys.id, keyId));
  if (!key?.slug) return { planSlug: null, planName: null, ...UNRESTRICTED };
  const [plan] = await db.select({ slug: plans.slug, name: plans.name, kioskLimit: plans.kioskLimit, screenBuilderEnabled: plans.screenBuilderEnabled, gifVideoEnabled: plans.gifVideoEnabled }).from(plans).where(eq(plans.slug, key.slug));
  return featuresOf(key.slug, plan);
}

/** Per-booth features for a whole tenant (the dashboard shows which booth has what). `locked` = that booth's licence has run out. */
export async function getTenantBoothFeatures(tenantId: string): Promise<{ keyId: string; label: string | null; features: PlanFeatures; locked: boolean }[]> {
  const [keys, planMap] = await Promise.all([
    db.select({ id: kioskKeys.id, label: kioskKeys.label, slug: kioskKeys.licensePlanSlug })
      .from(kioskKeys).where(and(eq(kioskKeys.tenantId, tenantId), isNull(kioskKeys.revokedAt), ne(kioskKeys.licenseType, "unpaid"))),
    loadPlans(),
  ]);
  const locks = await Promise.all(keys.map((k) => getKeyLock(k.id)));
  return keys.map((k, i) => ({ keyId: k.id, label: k.label, locked: locks[i].locked, features: k.slug ? featuresOf(k.slug, planMap.get(k.slug)) : { planSlug: null, planName: null, ...UNRESTRICTED } }));
}

/**
 * What the tenant as a whole may configure (package editor, Screen Builder): the best of its RUNNING booths. A tenant with no
 * subscribed booth yet falls back to tenants.plan (legacy), and to everything if that matches no plan.
 */
export async function getTenantPlanFeatures(tenantId: string): Promise<PlanFeatures> {
  const booths = await getTenantBoothFeatures(tenantId);
  if (booths.length > 0) {
    // Only booths whose licence is still running count: an expired trial must not keep lifting a tenant that now pays for Starter.
    // (If every booth has run out, fall back to all of them so the dashboard still reflects what the account last had.)
    const running = booths.filter((b) => !b.locked);
    return bestOf((running.length > 0 ? running : booths).map((b) => b.features));
  }
  const [tenant] = await db.select({ plan: tenants.plan }).from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant?.plan) return { planSlug: null, planName: null, ...UNRESTRICTED };
  const [plan] = await db.select({ slug: plans.slug, name: plans.name, kioskLimit: plans.kioskLimit, screenBuilderEnabled: plans.screenBuilderEnabled, gifVideoEnabled: plans.gifVideoEnabled }).from(plans).where(eq(plans.slug, tenant.plan));
  return featuresOf(tenant.plan, plan);
}

export const MEDIA_KINDS_REQUIRING_PLAN = new Set(["gif", "video", "stopmotion"]);

/** The 403 body every plan-locked route answers with, so clients can tell "locked by plan" from other 403s. */
export const planLockedBody = (feature: "gifVideo" | "screenBuilder") => ({
  error: feature === "gifVideo" ? "GIF, video, dan stop-motion tidak termasuk paket langganan booth ini. Upgrade paket booth di dashboard." : "Screen Builder tidak termasuk paket langganan booth ini. Upgrade paket booth di dashboard.",
  code: "plan_feature_locked",
  feature,
});
