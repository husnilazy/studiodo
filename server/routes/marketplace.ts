import { Router } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { marketplaceTemplates, superadmins, templates, tenantSettings } from "../db/schema.js";
import { requireAdminAuth } from "../middleware/adminAuth.js";
import { resolveFrameUrl } from "../lib/frameUrl.js";
import { logEvent } from "../lib/platformEvents.js";

// Fixed category set for the catalog (same keys the kiosk's default frame categories use).
export const MARKETPLACE_CATEGORIES = [
  { key: "minimal", label: "Minimal" },
  { key: "wedding", label: "Wedding" },
  { key: "birthday", label: "Birthday" },
  { key: "corporate", label: "Corporate" },
  { key: "seasonal", label: "Seasonal" },
  { key: "custom", label: "Custom" },
];
const CATEGORY_KEYS = MARKETPLACE_CATEGORIES.map((c) => c.key);

type Row = typeof marketplaceTemplates.$inferSelect;

// What a stranger (or another tenant) may see — no internal columns.
function toPublic(r: Row) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    creatorName: r.creatorName,
    category: r.category,
    orientation: r.orientation,
    imageUrl: resolveFrameUrl(r.frameImageUrl),
    canvasWidth: r.canvasWidth,
    canvasHeight: r.canvasHeight,
    slotCount: r.slots.length,
    featured: r.featured,
    installCount: r.installCount,
  };
}

// --- Public catalog -----------------------------------------------------------------

export const publicMarketplaceRouter = Router();

// GET /api/public/marketplace?category=&orientation= — active entries, featured first then most installed.
publicMarketplaceRouter.get("/marketplace", async (req, res) => {
  const category = typeof req.query.category === "string" ? req.query.category : "";
  const orientation = typeof req.query.orientation === "string" ? req.query.orientation : "";
  const filters = [eq(marketplaceTemplates.active, true)];
  if (CATEGORY_KEYS.includes(category)) filters.push(eq(marketplaceTemplates.category, category));
  if (orientation === "portrait" || orientation === "landscape") filters.push(eq(marketplaceTemplates.orientation, orientation));

  const rows = await db.select().from(marketplaceTemplates).where(and(...filters))
    .orderBy(desc(marketplaceTemplates.featured), desc(marketplaceTemplates.installCount), desc(marketplaceTemplates.createdAt)).limit(200);
  res.set("Cache-Control", "public, max-age=60");
  res.json({ categories: MARKETPLACE_CATEGORIES, items: rows.map(toPublic) });
});

// --- Tenant: install from the catalog (mounted under /api/portal/marketplace) ---------

export const marketplaceTenantRouter = Router();
marketplaceTenantRouter.use(requireAdminAuth);

// GET /api/portal/marketplace/installed — catalog ids this tenant already installed.
marketplaceTenantRouter.get("/installed", async (req, res) => {
  const rows = await db.select({ id: templates.marketplaceTemplateId }).from(templates)
    .where(and(eq(templates.tenantId, req.tenantId!), sql`${templates.marketplaceTemplateId} is not null`));
  res.json(rows.map((r) => r.id));
});

// POST /api/portal/marketplace/:id/install — copy the catalog entry into this tenant's own templates.
marketplaceTenantRouter.post("/:id/install", async (req, res) => {
  const tenantId = req.tenantId!;
  const id = req.params.id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(404).json({ error: "Template tidak ditemukan" });

  const [entry] = await db.select().from(marketplaceTemplates).where(and(eq(marketplaceTemplates.id, id), eq(marketplaceTemplates.active, true)));
  if (!entry) return res.status(404).json({ error: "Template tidak ditemukan" });

  const [already] = await db.select({ id: templates.id }).from(templates)
    .where(and(eq(templates.tenantId, tenantId), eq(templates.marketplaceTemplateId, entry.id)));
  if (already) return res.status(409).json({ error: "Template ini sudah ada di akun Anda" });

  // The kiosk resolves a frame's category against the tenant's own category list — make sure it exists.
  const category = MARKETPLACE_CATEGORIES.find((c) => c.key === entry.category) ?? { key: "custom", label: "Custom" };
  const [settings] = await db.select({ frameCategories: tenantSettings.frameCategories }).from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId));
  if (!settings) {
    await db.insert(tenantSettings).values({ tenantId });
  }
  const current = settings?.frameCategories?.length ? settings.frameCategories : MARKETPLACE_CATEGORIES;
  if (!current.some((c) => c.key === category.key)) {
    await db.update(tenantSettings).set({ frameCategories: [...current, category], updatedAt: new Date() }).where(eq(tenantSettings.tenantId, tenantId));
  }

  const [row] = await db.insert(templates).values({
    tenantId,
    name: entry.name,
    frameImageUrl: entry.frameImageUrl,
    slots: entry.slots,
    canvasWidth: entry.canvasWidth,
    canvasHeight: entry.canvasHeight,
    orientation: entry.orientation,
    category: category.key,
    style: "Marketplace",
    outputPreset: entry.outputPreset,
    marketplaceTemplateId: entry.id,
  }).returning({ id: templates.id });

  await db.update(marketplaceTemplates).set({ installCount: sql`${marketplaceTemplates.installCount} + 1` }).where(eq(marketplaceTemplates.id, entry.id));
  logEvent({ tenantId, category: "tenant", action: "marketplace.installed", message: `Template marketplace "${entry.name}" dipasang`, actorType: "tenant_admin" });
  res.status(201).json({ ok: true, templateId: row.id });
});

// --- Superadmin curation (mounted under /api/superadmin/marketplace) -------------------

export const marketplaceAdminRouter = Router();

async function actorEmail(superadminId?: string) {
  if (!superadminId) return undefined;
  const [row] = await db.select({ email: superadmins.email }).from(superadmins).where(eq(superadmins.id, superadminId));
  return row?.email ?? undefined;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

// GET /api/superadmin/marketplace — every entry, hidden ones included.
marketplaceAdminRouter.get("/", async (_req, res) => {
  const rows = await db.select().from(marketplaceTemplates).orderBy(desc(marketplaceTemplates.createdAt));
  res.json({ categories: MARKETPLACE_CATEGORIES, items: rows.map((r) => ({ ...toPublic(r), active: r.active, createdAt: r.createdAt })) });
});

// GET /api/superadmin/marketplace/source-templates?tenantId= — templates a tenant has, as publish candidates.
marketplaceAdminRouter.get("/source-templates", async (req, res) => {
  const tenantId = String(req.query.tenantId ?? "");
  if (!UUID_RE.test(tenantId)) return res.status(400).json({ error: "tenantId tidak valid" });
  const rows = await db.select().from(templates).where(eq(templates.tenantId, tenantId)).orderBy(asc(templates.name));
  res.json(rows.map((t) => ({
    id: t.id, name: t.name, category: t.category, orientation: t.orientation,
    imageUrl: resolveFrameUrl(t.frameImageUrl), slotCount: t.slots.length,
    // A legacy row can still hold the raw data: URI; those can't be copied cheaply or shown in a list.
    publishable: !/^data:/i.test(t.frameImageUrl),
  })));
});

function cleanMeta(body: unknown): { ok: true; value: { name?: string; description?: string; creatorName?: string | null; category?: string; featured?: boolean; active?: boolean } } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const value: { name?: string; description?: string; creatorName?: string | null; category?: string; featured?: boolean; active?: boolean } = {};
  if (b.name !== undefined) {
    const name = String(b.name).trim();
    if (!name || name.length > 80) return { ok: false, error: "Nama wajib diisi (maks. 80 karakter)" };
    value.name = name;
  }
  if (b.description !== undefined) {
    const d = String(b.description).trim();
    if (d.length > 300) return { ok: false, error: "Deskripsi maksimal 300 karakter" };
    value.description = d;
  }
  if (b.creatorName !== undefined) {
    const c = String(b.creatorName ?? "").trim();
    if (c.length > 60) return { ok: false, error: "Nama kreator maksimal 60 karakter" };
    value.creatorName = c || null;
  }
  if (b.category !== undefined) {
    if (!CATEGORY_KEYS.includes(String(b.category))) return { ok: false, error: "Kategori tidak valid" };
    value.category = String(b.category);
  }
  if (b.featured !== undefined) value.featured = b.featured === true;
  if (b.active !== undefined) value.active = b.active === true;
  return { ok: true, value };
}

// POST /api/superadmin/marketplace — { fromTemplateId, name?, description?, creatorName?, category?, featured? }
marketplaceAdminRouter.post("/", async (req, res) => {
  const fromTemplateId = String(req.body?.fromTemplateId ?? "");
  if (!UUID_RE.test(fromTemplateId)) return res.status(400).json({ error: "Pilih template sumber" });
  const [src] = await db.select().from(templates).where(eq(templates.id, fromTemplateId));
  if (!src) return res.status(404).json({ error: "Template sumber tidak ditemukan" });
  if (/^data:/i.test(src.frameImageUrl)) return res.status(400).json({ error: "Gambar frame template ini belum tersimpan sebagai file. Simpan ulang template di aplikasi terlebih dulu." });

  const meta = cleanMeta(req.body);
  if (!meta.ok) return res.status(400).json({ error: meta.error });
  const m = meta.value;

  const [row] = await db.insert(marketplaceTemplates).values({
    name: m.name ?? src.name,
    description: m.description ?? "",
    creatorName: m.creatorName ?? null,
    category: m.category ?? (CATEGORY_KEYS.includes(src.category) ? src.category : "custom"),
    frameImageUrl: resolveFrameUrl(src.frameImageUrl),
    slots: src.slots,
    canvasWidth: src.canvasWidth,
    canvasHeight: src.canvasHeight,
    orientation: src.orientation,
    outputPreset: src.outputPreset,
    featured: m.featured ?? false,
  }).returning();
  logEvent({ category: "system", action: "marketplace.published", message: `Template "${row.name}" diterbitkan ke marketplace`, actorType: "superadmin", actorLabel: await actorEmail(req.superadminId) });
  res.status(201).json({ ...toPublic(row), active: row.active, createdAt: row.createdAt });
});

// PATCH /api/superadmin/marketplace/:id — edit the card, feature it, or hide/show it.
marketplaceAdminRouter.patch("/:id", async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: "Template tidak ditemukan" });
  const meta = cleanMeta(req.body);
  if (!meta.ok) return res.status(400).json({ error: meta.error });
  if (Object.keys(meta.value).length === 0) return res.status(400).json({ error: "Tidak ada perubahan" });
  const [row] = await db.update(marketplaceTemplates).set({ ...meta.value, updatedAt: new Date() }).where(eq(marketplaceTemplates.id, req.params.id)).returning();
  if (!row) return res.status(404).json({ error: "Template tidak ditemukan" });
  res.json({ ...toPublic(row), active: row.active, createdAt: row.createdAt });
});

// DELETE /api/superadmin/marketplace/:id — removes the catalog entry; tenants keep the copies they installed.
marketplaceAdminRouter.delete("/:id", async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: "Template tidak ditemukan" });
  const [row] = await db.delete(marketplaceTemplates).where(eq(marketplaceTemplates.id, req.params.id)).returning({ name: marketplaceTemplates.name });
  if (!row) return res.status(404).json({ error: "Template tidak ditemukan" });
  logEvent({ category: "system", action: "marketplace.removed", message: `Template "${row.name}" dihapus dari marketplace`, actorType: "superadmin", actorLabel: await actorEmail(req.superadminId) });
  res.json({ ok: true });
});
