import { Router } from "express";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { boothSettings, kioskKeys, packages } from "../db/schema.js";
import { requireAdminAuth } from "../middleware/adminAuth.js";
import { validateUuidParam } from "../middleware/validateUuidParam.js";
import { logEvent } from "../lib/platformEvents.js";
import { sanitizeOverrides, sanitizePackageOverrides } from "../lib/boothSettings.js";

// Per-booth settings for the tenant dashboard (mounted at /api/booths): every kiosk key (= one booth) can have its own package
// prices / availability and its own look. All queries are scoped to the signed-in tenant; kiosks read the result through
// GET /api/packages, POST /api/sessions and GET /api/config/tenant (see lib/boothSettings.ts).

export const boothsRouter = Router();
boothsRouter.param("id", validateUuidParam("Booth tidak ditemukan"));
boothsRouter.use(requireAdminAuth);

async function ownBooth(tenantId: string, id: string) {
  const [booth] = await db.select({ id: kioskKeys.id, label: kioskKeys.label }).from(kioskKeys)
    .where(and(eq(kioskKeys.id, id), eq(kioskKeys.tenantId, tenantId), isNull(kioskKeys.revokedAt)));
  return booth ?? null;
}

// GET /api/booths — the tenant's booths with a short summary of what is customised
boothsRouter.get("/", async (req, res) => {
  const tenantId = req.tenantId!;
  const [booths, settings] = await Promise.all([
    db.select({ id: kioskKeys.id, label: kioskKeys.label, lastUsedAt: kioskKeys.lastUsedAt, appVersion: kioskKeys.appVersion, createdAt: kioskKeys.createdAt })
      .from(kioskKeys).where(and(eq(kioskKeys.tenantId, tenantId), isNull(kioskKeys.revokedAt))).orderBy(asc(kioskKeys.createdAt)),
    db.select().from(boothSettings).where(eq(boothSettings.tenantId, tenantId)),
  ]);
  const byKey = new Map(settings.map((s) => [s.kioskKeyId, s]));
  res.json(booths.map((b) => {
    const s = byKey.get(b.id);
    return { ...b, customPrices: Object.values(s?.packageOverrides ?? {}).filter((o) => o.price !== undefined).length, hiddenPackages: Object.values(s?.packageOverrides ?? {}).filter((o) => o.active === false).length, customLook: Object.keys(s?.overrides ?? {}).length };
  }));
});

// GET /api/booths/:id — everything the "Pengaturan booth" screen needs
boothsRouter.get("/:id", async (req, res) => {
  const tenantId = req.tenantId!;
  const booth = await ownBooth(tenantId, String(req.params.id));
  if (!booth) return res.status(404).json({ error: "Booth tidak ditemukan" });
  const [[settings], pkgs] = await Promise.all([
    db.select().from(boothSettings).where(eq(boothSettings.kioskKeyId, booth.id)),
    db.select({ id: packages.id, name: packages.name, price: packages.price, active: packages.active, photoCount: packages.photoCount })
      .from(packages).where(eq(packages.tenantId, tenantId)).orderBy(asc(packages.sortOrder), asc(packages.createdAt)),
  ]);
  res.json({
    booth,
    overrides: settings?.overrides ?? {},
    packageOverrides: settings?.packageOverrides ?? {},
    packages: pkgs.map((p) => ({ id: p.id, name: p.name, price: Number(p.price), active: p.active, photoCount: p.photoCount })),
  });
});

// PUT /api/booths/:id — { label?, overrides?, packageOverrides? } replaces this booth's overrides (an empty object = follow the main settings)
boothsRouter.put("/:id", async (req, res) => {
  const tenantId = req.tenantId!;
  const booth = await ownBooth(tenantId, String(req.params.id));
  if (!booth) return res.status(404).json({ error: "Booth tidak ditemukan" });

  const pkgs = await db.select({ id: packages.id }).from(packages).where(eq(packages.tenantId, tenantId));
  const overrides = sanitizeOverrides(req.body?.overrides);
  if (!overrides.ok) return res.status(400).json({ error: overrides.error });
  const packageOverrides = sanitizePackageOverrides(req.body?.packageOverrides, new Set(pkgs.map((p) => p.id)));
  if (!packageOverrides.ok) return res.status(400).json({ error: packageOverrides.error });

  if (typeof req.body?.label === "string") {
    const label = req.body.label.trim().slice(0, 60);
    if (!label) return res.status(400).json({ error: "Nama booth tidak boleh kosong." });
    if (label !== booth.label) await db.update(kioskKeys).set({ label }).where(and(eq(kioskKeys.id, booth.id), eq(kioskKeys.tenantId, tenantId)));
  }
  await db.insert(boothSettings).values({ kioskKeyId: booth.id, tenantId, overrides: overrides.value, packageOverrides: packageOverrides.value })
    .onConflictDoUpdate({ target: boothSettings.kioskKeyId, set: { overrides: overrides.value, packageOverrides: packageOverrides.value, updatedAt: new Date() } });
  logEvent({
    tenantId, category: "kiosk", action: "booth_settings.updated",
    message: `Pengaturan booth "${booth.label ?? booth.id.slice(0, 8)}" diubah (${Object.keys(packageOverrides.value).length} paket khusus, ${Object.keys(overrides.value).length} pengaturan tampilan khusus)`,
    actorType: "tenant_admin",
  });
  res.json({ ok: true, overrides: overrides.value, packageOverrides: packageOverrides.value });
});
