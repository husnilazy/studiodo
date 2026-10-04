import { and, eq, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { packages, plans, tenants } from "../db/schema.js";
import { logEvent } from "./platformEvents.js";

export interface TenantPlanFeatures {
  planSlug: string | null;
  planName: string | null;
  kioskLimit: number | null; // null = unlimited
  screenBuilderEnabled: boolean;
  gifVideoEnabled: boolean;
}

// Fail-open on purpose: a tenant with no plan assigned yet, or a plan slug
// that no longer matches any row (tenants.plan is deliberately not a FK —
// see the comment on the `plans` table), gets every feature rather than
// getting silently locked out because of a data mismatch that isn't their
// fault.
const UNRESTRICTED: Omit<TenantPlanFeatures, "planSlug" | "planName"> = {
  kioskLimit: null,
  screenBuilderEnabled: true,
  gifVideoEnabled: true,
};

export async function getTenantPlanFeatures(tenantId: string): Promise<TenantPlanFeatures> {
  const [tenant] = await db.select({ plan: tenants.plan }).from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant?.plan) return { planSlug: null, planName: null, ...UNRESTRICTED };

  const [plan] = await db
    .select({
      name: plans.name,
      slug: plans.slug,
      kioskLimit: plans.kioskLimit,
      screenBuilderEnabled: plans.screenBuilderEnabled,
      gifVideoEnabled: plans.gifVideoEnabled,
    })
    .from(plans)
    .where(eq(plans.slug, tenant.plan));

  if (!plan) return { planSlug: tenant.plan, planName: null, ...UNRESTRICTED };

  return {
    planSlug: plan.slug,
    planName: plan.name,
    kioskLimit: plan.kioskLimit,
    screenBuilderEnabled: plan.screenBuilderEnabled,
    gifVideoEnabled: plan.gifVideoEnabled,
  };
}

// Called right after a superadmin changes a tenant's plan (see
// server/routes/superadmin.ts). Actively brings the tenant's existing data
// into compliance with whatever the new plan no longer allows, rather than
// just blocking new attempts going forward:
//
// - Screen Builder needs no data change here — its GET is gated live in
//   screenLayouts.ts, so a disabled plan just makes the kiosk fall back to
//   the default (un-customized) layout without deleting the saved override;
//   it comes back automatically if the tenant is ever upgraded again.
// - GIF/Video is baked into each package's hasGif/hasVideo flags, which the
//   kiosk actually reads to decide what to capture — those need to be
//   flipped off for real, not just gated at the edge, or a package created
//   under a better plan would keep offering GIF/Video after a downgrade.
// - Kiosk count is deliberately NOT enforced retroactively here: revoking an
//   already-paired kiosk key would kill a physical device that may be mid-
//   session on-site. Only new key creation is blocked (kioskKeys.ts) — an
//   over-limit tenant keeps what they already had until a superadmin chooses
//   to revoke something explicitly.
export async function syncTenantFeaturesToPlan(tenantId: string) {
  const features = await getTenantPlanFeatures(tenantId);

  if (!features.gifVideoEnabled) {
    const affected = await db
      .update(packages)
      .set({ hasGif: false, hasVideo: false, hasStopMotion: false })
      .where(and(eq(packages.tenantId, tenantId), or(eq(packages.hasGif, true), eq(packages.hasVideo, true), eq(packages.hasStopMotion, true))))
      .returning({ id: packages.id, name: packages.name });

    if (affected.length > 0) {
      logEvent({
        tenantId,
        category: "billing",
        action: "plan.features_synced",
        message: `Plan "${features.planName ?? features.planSlug ?? "-"}" tidak termasuk GIF/Video — dimatikan otomatis di ${affected.length} paket (${affected.map((p) => p.name).join(", ")}).`,
        actorType: "system",
        metadata: { feature: "gifVideo", packageIds: affected.map((p) => p.id) },
      });
    }
  }

  return features;
}
