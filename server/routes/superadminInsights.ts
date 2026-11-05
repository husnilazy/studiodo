import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { platformSettings } from "../db/schema.js";
import { anomalies, fleet, revenueInsights, tenantHealth } from "../lib/insights.js";
import { DEFAULT_DIGEST, digestStats, digestText, loadDigestSettings, sanitizeDigest, sendDigest } from "../lib/digest.js";
import { globalSearch } from "../lib/globalSearch.js";
import { loadWaConfig } from "../lib/whatsapp.js";

// Owner insights, mounted at /api/superadmin (behind the Superadmin auth; finance accounts are refused upstream).
export const superadminInsightsRouter = Router();

superadminInsightsRouter.get("/insights/health", async (_req, res) => {
  const rows = await tenantHealth();
  res.json({ rows, summary: { healthy: rows.filter((r) => r.level === "healthy").length, watch: rows.filter((r) => r.level === "watch").length, risk: rows.filter((r) => r.level === "risk").length } });
});

superadminInsightsRouter.get("/insights/revenue", async (_req, res) => res.json(await revenueInsights()));
superadminInsightsRouter.get("/insights/fleet", async (_req, res) => res.json(await fleet()));
superadminInsightsRouter.get("/insights/anomalies", async (_req, res) => res.json({ items: await anomalies() }));

// Morning summary: the setting, a live preview of what it would say right now, and whether it can actually reach WhatsApp
superadminInsightsRouter.get("/insights/digest", async (_req, res) => {
  const [settings, stats, config, [row]] = await Promise.all([loadDigestSettings(), digestStats(), loadWaConfig(), db.select({ number: platformSettings.adminWaNumber }).from(platformSettings).limit(1)]);
  res.json({ settings, preview: digestText(stats, new Date()), gateway: Boolean(config), hasNumber: Boolean(row?.number) });
});

superadminInsightsRouter.put("/insights/digest", async (req, res) => {
  const clean = sanitizeDigest({ ...DEFAULT_DIGEST, ...(req.body ?? {}) });
  const [existing] = await db.select({ id: platformSettings.id }).from(platformSettings).limit(1);
  if (existing) await db.update(platformSettings).set({ digestSettings: clean, updatedAt: new Date() }).where(eq(platformSettings.id, existing.id));
  else await db.insert(platformSettings).values({ digestSettings: clean });
  res.json({ settings: clean });
});

superadminInsightsRouter.post("/insights/digest/send", async (_req, res) => {
  const result = await sendDigest();
  res.json(result);
});

// Ctrl+K
superadminInsightsRouter.get("/search", async (req, res) => {
  res.json({ hits: await globalSearch(String(req.query.q ?? "")) });
});
