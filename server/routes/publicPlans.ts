import { Router } from "express";
import { asc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { plans } from "../db/schema.js";
import { computePlanPricing } from "../lib/planPricing.js";

export const publicPlansRouter = Router();

// GET /api/public/plans — PUBLIC, no auth. Feeds the pricing section of the
// STUDIODO marketing website (studiodo-web) and the tenant portal. Only active
// plans, and only the fields safe to show a stranger — never ids or anything
// internal. Mirrors the superadmin plan list, which stays the single place plans
// are managed.
//
// `price` stays the plain list price of the plan's own interval (older website builds read just that); `pricing`
// carries the ready-to-show numbers (promo, yearly option) computed by the same code checkout charges with.
publicPlansRouter.get("/plans", async (_req, res) => {
  const rows = await db
    .select({
      name: plans.name,
      slug: plans.slug,
      price: plans.price,
      billingInterval: plans.billingInterval,
      kioskLimit: plans.kioskLimit,
      screenBuilderEnabled: plans.screenBuilderEnabled,
      gifVideoEnabled: plans.gifVideoEnabled,
      description: plans.description,
      discountPercent: plans.discountPercent,
      discountLabel: plans.discountLabel,
      discountEndsAt: plans.discountEndsAt,
      yearlyDiscountPercent: plans.yearlyDiscountPercent,
      featured: plans.featured,
      features: plans.features,
    })
    .from(plans)
    .where(eq(plans.active, true))
    .orderBy(asc(plans.sortOrder));
  const now = new Date();
  res.set("Cache-Control", "public, max-age=60");
  res.json(rows.map((row) => {
    const pricing = computePlanPricing(row, now);
    const { discountPercent: _discountPercent, discountEndsAt: _discountEndsAt, yearlyDiscountPercent: _yearly, ...rest } = row;
    return {
      ...rest,
      discountLabel: pricing.activeDiscountPercent > 0 ? row.discountLabel : null,
      pricing,
    };
  }));
});
