import { Router } from "express";
import { and, asc, desc, eq, ilike, ne, or, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { creators, creatorTemplates, marketplaceReports, marketplaceReviews, marketplaceTemplates, superadmins, templates, tenantSettings, tenants } from "../db/schema.js";
import { REPORT_REASONS, createReport, deleteOwnReview, hasInstalled, ratingSummaries, resolveReport, setReviewStatus, upsertReview, type ResolveAction } from "../lib/marketplaceFeedback.js";
import { requireAdminAuth } from "../middleware/adminAuth.js";
import { resolveFrameUrl } from "../lib/frameUrl.js";
import { logEvent } from "../lib/platformEvents.js";
import { deliver, deliverToCreator, reviewReceivedMail, templateHiddenMail } from "../lib/emails.js";

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
type Rated = { ratingAverage: number | null; ratingCount: number };
async function withRatings<T extends { id: string }>(items: T[]): Promise<(T & Rated)[]> {
  const sums = await ratingSummaries(items.map((i) => i.id));
  return items.map((i) => ({ ...i, ratingAverage: sums.get(i.id)?.average ?? null, ratingCount: sums.get(i.id)?.count ?? 0 }));
}

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
    createdAt: r.createdAt,
    outputPreset: r.outputPreset,
  };
}

// --- Public catalog -----------------------------------------------------------------

export const publicMarketplaceRouter = Router();

// GET /api/public/marketplace?category=&orientation=&q=&sort= — active entries.
// sort: "unggulan" (default: featured, then most installed) | "populer" | "terbaru" | "nama".
publicMarketplaceRouter.get("/marketplace", async (req, res) => {
  const category = typeof req.query.category === "string" ? req.query.category : "";
  const orientation = typeof req.query.orientation === "string" ? req.query.orientation : "";
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 60) : "";
  const sort = typeof req.query.sort === "string" ? req.query.sort : "unggulan";
  const filters = [eq(marketplaceTemplates.active, true)];
  if (CATEGORY_KEYS.includes(category)) filters.push(eq(marketplaceTemplates.category, category));
  if (orientation === "portrait" || orientation === "landscape") filters.push(eq(marketplaceTemplates.orientation, orientation));
  if (q) {
    // Escape LIKE wildcards so a search for "%" or "_" is literal.
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    filters.push(or(ilike(marketplaceTemplates.name, like), ilike(marketplaceTemplates.description, like), ilike(marketplaceTemplates.creatorName, like))!);
  }
  const order = sort === "populer" ? [desc(marketplaceTemplates.installCount), desc(marketplaceTemplates.createdAt)]
    : sort === "terbaru" ? [desc(marketplaceTemplates.createdAt)]
    : sort === "nama" ? [asc(marketplaceTemplates.name)]
    : [desc(marketplaceTemplates.featured), desc(marketplaceTemplates.installCount), desc(marketplaceTemplates.createdAt)];

  const rows = await db.select().from(marketplaceTemplates).where(and(...filters)).orderBy(...order).limit(200);
  let items = await withRatings(rows.map(toPublic));
  if (sort === "rating") items = [...items].sort((a, b) => (b.ratingAverage ?? 0) - (a.ratingAverage ?? 0) || b.ratingCount - a.ratingCount || b.installCount - a.installCount);
  res.set("Cache-Control", "public, max-age=60");
  res.json({ categories: MARKETPLACE_CATEGORIES, items });
});

// The creator behind a published entry (via the creator template that was approved into it), if any.
async function creatorOf(marketplaceId: string) {
  const [row] = await db.select({ id: creators.id, name: creators.name, bio: creators.bio, instagramHandle: creators.instagramHandle, website: creators.website })
    .from(creatorTemplates).innerJoin(creators, eq(creators.id, creatorTemplates.creatorId))
    .where(eq(creatorTemplates.marketplaceTemplateId, marketplaceId));
  return row ?? null;
}

/** The creator's email + display name for a catalog entry (null for templates STUDIODO published itself). */
async function creatorContact(marketplaceId: string) {
  const [row] = await db.select({ id: creators.id, email: creators.email, name: creators.name }).from(creatorTemplates).innerJoin(creators, eq(creators.id, creatorTemplates.creatorId)).where(eq(creatorTemplates.marketplaceTemplateId, marketplaceId));
  return row ?? null;
}

// GET /api/public/marketplace/:id — one entry with its creator and related templates (same creator first, then same category).
publicMarketplaceRouter.get("/marketplace/:id", async (req, res) => {
  const id = req.params.id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(404).json({ error: "Template tidak ditemukan" });
  const [entry] = await db.select().from(marketplaceTemplates).where(and(eq(marketplaceTemplates.id, id), eq(marketplaceTemplates.active, true)));
  if (!entry) return res.status(404).json({ error: "Template tidak ditemukan" });
  const creator = await creatorOf(entry.id);
  const related = await db.select().from(marketplaceTemplates)
    .where(and(eq(marketplaceTemplates.active, true), ne(marketplaceTemplates.id, entry.id), eq(marketplaceTemplates.category, entry.category)))
    .orderBy(desc(marketplaceTemplates.installCount)).limit(4);
  const [item] = await withRatings([toPublic(entry)]);
  const reviews = await db.select({ id: marketplaceReviews.id, rating: marketplaceReviews.rating, comment: marketplaceReviews.comment, createdAt: marketplaceReviews.updatedAt, tenantName: tenants.name })
    .from(marketplaceReviews).innerJoin(tenants, eq(tenants.id, marketplaceReviews.tenantId))
    .where(and(eq(marketplaceReviews.marketplaceTemplateId, entry.id), eq(marketplaceReviews.status, "published")))
    .orderBy(desc(marketplaceReviews.updatedAt)).limit(20);
  res.set("Cache-Control", "public, max-age=30");
  res.json({ item, creator: creator ? { id: creator.id, name: creator.name, instagramHandle: creator.instagramHandle } : null, related: await withRatings(related.map(toPublic)), reviews, reportReasons: REPORT_REASONS });
});

// GET /api/public/creators/:id — public creator profile with their published templates.
publicMarketplaceRouter.get("/creators/:id", async (req, res) => {
  const id = req.params.id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(404).json({ error: "Kreator tidak ditemukan" });
  const [c] = await db.select({ id: creators.id, name: creators.name, bio: creators.bio, instagramHandle: creators.instagramHandle, website: creators.website, createdAt: creators.createdAt })
    .from(creators).where(and(eq(creators.id, id), eq(creators.status, "active")));
  if (!c) return res.status(404).json({ error: "Kreator tidak ditemukan" });
  const rows = await db.select({ m: marketplaceTemplates }).from(creatorTemplates)
    .innerJoin(marketplaceTemplates, eq(marketplaceTemplates.id, creatorTemplates.marketplaceTemplateId))
    .where(and(eq(creatorTemplates.creatorId, id), eq(marketplaceTemplates.active, true)))
    .orderBy(desc(marketplaceTemplates.installCount));
  const items = rows.map((r) => toPublic(r.m));
  res.set("Cache-Control", "public, max-age=60");
  res.json({ creator: c, totalInstalls: items.reduce((n, i) => n + i.installCount, 0), items });
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

// GET /api/portal/marketplace/:id/feedback — can this tenant review it, and what did they already say / report?
marketplaceTenantRouter.get("/:id/feedback", async (req, res) => {
  const id = req.params.id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(404).json({ error: "Template tidak ditemukan" });
  const tenantId = req.tenantId!;
  const [[mine], [report], installed] = await Promise.all([
    db.select({ rating: marketplaceReviews.rating, comment: marketplaceReviews.comment, status: marketplaceReviews.status }).from(marketplaceReviews).where(and(eq(marketplaceReviews.marketplaceTemplateId, id), eq(marketplaceReviews.tenantId, tenantId))),
    db.select({ id: marketplaceReports.id }).from(marketplaceReports).where(and(eq(marketplaceReports.marketplaceTemplateId, id), eq(marketplaceReports.tenantId, tenantId), eq(marketplaceReports.status, "open"))),
    hasInstalled(tenantId, id),
  ]);
  res.json({ installed, myReview: mine ?? null, reportOpen: Boolean(report) });
});

const feedbackStatus = (error: string) => (error === "not_found" ? 404 : error === "duplicate" || error === "closed" ? 409 : error === "not_installed" ? 403 : 400);

marketplaceTenantRouter.put("/:id/review", async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(404).json({ error: "Template tidak ditemukan" });
  const r = await upsertReview(req.tenantId!, req.params.id, req.body?.rating, req.body?.comment);
  if (!r.ok) return res.status(feedbackStatus(r.error)).json({ error: r.message });
  // Tell the creator about a NEW review (not about edits, so changing stars can't spam their inbox).
  if (r.value.created) {
    void (async () => {
      const [creator, [t], [tenant]] = await Promise.all([creatorContact(req.params.id), db.select({ name: marketplaceTemplates.name }).from(marketplaceTemplates).where(eq(marketplaceTemplates.id, req.params.id)), db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, req.tenantId!))]);
      if (creator && t) await deliverToCreator(creator.id, reviewReceivedMail({ name: creator.name, templateName: t.name, rating: Number(req.body?.rating), comment: String(req.body?.comment ?? "").trim().slice(0, 600), tenantName: tenant?.name ?? "Seorang tenant", templateId: req.params.id }), "ulasan baru", { key: "reviews", label: "Ulasan baru" });
    })().catch(() => undefined);
  }
  res.json({ ok: true });
});

marketplaceTenantRouter.delete("/:id/review", async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(404).json({ error: "Template tidak ditemukan" });
  await deleteOwnReview(req.tenantId!, req.params.id);
  res.json({ ok: true });
});

marketplaceTenantRouter.post("/:id/report", async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(404).json({ error: "Template tidak ditemukan" });
  const r = await createReport(req.tenantId!, req.params.id, req.body?.reason, req.body?.detail);
  if (!r.ok) return res.status(feedbackStatus(r.error)).json({ error: r.message });
  const [t] = await db.select({ name: marketplaceTemplates.name }).from(marketplaceTemplates).where(eq(marketplaceTemplates.id, req.params.id));
  logEvent({ tenantId: req.tenantId!, level: "warning", category: "tenant", action: "marketplace.reported", message: `Template marketplace "${t?.name ?? ""}" dilaporkan (${req.body?.reason})`, actorType: "tenant_admin" });
  res.status(201).json({ ok: true });
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

// GET /api/superadmin/marketplace — every entry, hidden ones included, with rating and open-report count.
marketplaceAdminRouter.get("/", async (_req, res) => {
  const rows = await db.select().from(marketplaceTemplates).orderBy(desc(marketplaceTemplates.createdAt));
  const open = await db.select({ id: marketplaceReports.marketplaceTemplateId, n: sql<number>`count(*)::int` }).from(marketplaceReports).where(eq(marketplaceReports.status, "open")).groupBy(marketplaceReports.marketplaceTemplateId);
  const openBy = new Map(open.map((o) => [o.id, o.n]));
  const items = await withRatings(rows.map((r) => ({ ...toPublic(r), active: r.active })));
  res.json({ categories: MARKETPLACE_CATEGORIES, items: items.map((i) => ({ ...i, openReports: openBy.get(i.id) ?? 0 })) });
});

// GET /api/superadmin/marketplace/reports?status=open|resolved|dismissed|all — the moderation queue (oldest open first).
marketplaceAdminRouter.get("/reports", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : "open";
  const rows = await db.select({
    id: marketplaceReports.id, status: marketplaceReports.status, reason: marketplaceReports.reason, detail: marketplaceReports.detail, resolution: marketplaceReports.resolution,
    resolvedBy: marketplaceReports.resolvedBy, resolvedAt: marketplaceReports.resolvedAt, createdAt: marketplaceReports.createdAt,
    templateId: marketplaceTemplates.id, templateName: marketplaceTemplates.name, templateActive: marketplaceTemplates.active, creatorName: marketplaceTemplates.creatorName, imageUrl: marketplaceTemplates.frameImageUrl,
    tenantId: tenants.id, tenantName: tenants.name, tenantWhatsapp: tenants.ownerWhatsapp, tenantOwner: tenants.ownerName,
  }).from(marketplaceReports)
    .innerJoin(marketplaceTemplates, eq(marketplaceTemplates.id, marketplaceReports.marketplaceTemplateId))
    .innerJoin(tenants, eq(tenants.id, marketplaceReports.tenantId))
    .where(["open", "resolved", "dismissed"].includes(status) ? eq(marketplaceReports.status, status) : undefined)
    .orderBy(status === "open" ? asc(marketplaceReports.createdAt) : desc(marketplaceReports.createdAt)).limit(100);
  res.json({ reasons: REPORT_REASONS, items: rows.map((r) => ({ ...r, imageUrl: resolveFrameUrl(r.imageUrl) })) });
});

marketplaceAdminRouter.get("/reports/summary", async (_req, res) => {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(marketplaceReports).where(eq(marketplaceReports.status, "open"));
  res.json({ open: row?.n ?? 0 });
});

// POST /api/superadmin/marketplace/reports/:id/resolve — { action: "hide" | "dismiss" | "resolve", note? }
marketplaceAdminRouter.post("/reports/:id/resolve", async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(404).json({ error: "Laporan tidak ditemukan" });
  const action = req.body?.action as ResolveAction;
  if (!["hide", "dismiss", "resolve"].includes(action)) return res.status(400).json({ error: "Tindakan tidak valid" });
  const by = (await actorEmail(req.superadminId)) ?? null;
  const r = await resolveReport(req.params.id, action, typeof req.body?.note === "string" ? req.body.note : "", by);
  if (!r.ok) return res.status(feedbackStatus(r.error)).json({ error: r.message });
  logEvent({ category: "system", action: "marketplace.report_resolved", message: `Laporan template ${action === "hide" ? "ditindak: template disembunyikan" : action === "dismiss" ? "ditolak" : "ditandai selesai"} (${r.value.closed} laporan ditutup)`, actorType: "superadmin", actorLabel: by ?? undefined });
  if (action === "hide") {
    void (async () => {
      const [creator, [t]] = await Promise.all([creatorContact(r.value.templateId), db.select({ name: marketplaceTemplates.name }).from(marketplaceTemplates).where(eq(marketplaceTemplates.id, r.value.templateId))]);
      if (creator && t) await deliver(creator.email, templateHiddenMail({ name: creator.name, templateName: t.name, note: typeof req.body?.note === "string" && req.body.note.trim() ? req.body.note.trim() : "Template ini dilaporkan dan setelah ditinjau tidak memenuhi pedoman marketplace." }), { what: "template disembunyikan" });
    })().catch(() => undefined);
  }
  res.json({ ok: true, closed: r.value.closed });
});

// GET /api/superadmin/marketplace/reviews — recent reviews (hidden ones included) for moderation.
marketplaceAdminRouter.get("/reviews", async (_req, res) => {
  const rows = await db.select({
    id: marketplaceReviews.id, rating: marketplaceReviews.rating, comment: marketplaceReviews.comment, status: marketplaceReviews.status, createdAt: marketplaceReviews.updatedAt,
    templateId: marketplaceTemplates.id, templateName: marketplaceTemplates.name, tenantName: tenants.name,
  }).from(marketplaceReviews)
    .innerJoin(marketplaceTemplates, eq(marketplaceTemplates.id, marketplaceReviews.marketplaceTemplateId))
    .innerJoin(tenants, eq(tenants.id, marketplaceReviews.tenantId))
    .orderBy(desc(marketplaceReviews.updatedAt)).limit(60);
  res.json(rows);
});

marketplaceAdminRouter.post("/reviews/:id/status", async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(404).json({ error: "Ulasan tidak ditemukan" });
  const status = req.body?.status;
  if (status !== "published" && status !== "hidden") return res.status(400).json({ error: "Status tidak valid" });
  if (!(await setReviewStatus(req.params.id, status))) return res.status(404).json({ error: "Ulasan tidak ditemukan" });
  logEvent({ category: "system", action: "marketplace.review_moderated", message: `Ulasan ${status === "hidden" ? "disembunyikan" : "ditampilkan kembali"}`, actorType: "superadmin", actorLabel: await actorEmail(req.superadminId) });
  res.json({ ok: true });
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
  const changes = [meta.value.featured !== undefined ? (meta.value.featured ? "ditandai unggulan" : "unggulan dicabut") : null, meta.value.active !== undefined ? (meta.value.active ? "ditampilkan" : "disembunyikan") : null, meta.value.name !== undefined || meta.value.description !== undefined || meta.value.category !== undefined || meta.value.creatorName !== undefined ? "info kartu diubah" : null].filter(Boolean).join(", ");
  logEvent({ category: "system", action: "marketplace.updated", message: `Template "${row.name}" ${changes}`, actorType: "superadmin", actorLabel: await actorEmail(req.superadminId) });
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
