import { Router } from "express";
import { asc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { plans } from "../db/schema.js";

export const publicPlansRouter = Router();

// GET /api/public/plans — PUBLIC, no auth. Feeds the pricing section of the
// STUDIODO marketing website (studiodo-web). Only active plans, and only the
// fields safe to show a stranger — never ids or anything internal. Mirrors the
// superadmin plan list, which stays the single place plans are managed.
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
    })
    .from(plans)
    .where(eq(plans.active, true))
    .orderBy(asc(plans.sortOrder));
  res.set("Cache-Control", "public, max-age=60");
  res.json(rows);
});
