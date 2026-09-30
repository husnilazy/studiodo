import { Router } from "express";
import { db } from "../db/client.js";
import { templates, frameOverlays, tenantSettings } from "../db/schema.js";
import { and, eq } from "drizzle-orm";
import { requireAdminAuth } from "../middleware/adminAuth.js";
import { requireKioskAuth } from "../middleware/kioskAuth.js";
import { requireAnyAuth } from "../middleware/anyAuth.js";
import { saveUploadedFile } from "../storage.js";
import { resolveFrameUrl } from "../lib/frameUrl.js";

export const framesRouter = Router();

interface FrameCategory {
  key: string;
  label: string;
}

// Mirrors client/src/lib/frameCategoryStore.ts's DEFAULT_CATEGORIES/slugify —
// small enough not to be worth a shared module between server and client.
const DEFAULT_CATEGORIES: FrameCategory[] = [
  { key: "minimal", label: "Minimal" },
  { key: "wedding", label: "Wedding" },
  { key: "birthday", label: "Birthday" },
  { key: "corporate", label: "Corporate" },
  { key: "seasonal", label: "Seasonal" },
  { key: "custom", label: "Custom" },
];

function slugifyCategory(label: string) {
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return slug || `kategori-${Date.now().toString(36)}`;
}

async function ensureTenantSettingsRow(tenantId: string) {
  const [existing] = await db.select({ tenantId: tenantSettings.tenantId }).from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId));
  if (!existing) await db.insert(tenantSettings).values({ tenantId });
}


// Same fix as packages.ts's resolveThumbnailUrl — the WYSIWYG frame editor
// hands over the uploaded frame graphic as a data: URI (simplest upload UX),
// and storing that raw base64 straight in templates.frame_image_url is what
// made GET /api/frames (loaded on every "Pilih Frame" screen and every kiosk
// session's frame lookup) pull several MB per template: confirmed live, this
// table's frame_image_url averaged ~1MB and peaked at ~3.2MB per row. Decode
// it once here and hand the bytes to the same file storage everything else
// (session photos, strips, package thumbnails) already uses.
async function resolveFrameImageUrl(tenantId: string, frameImageUrl: unknown): Promise<string> {
  const value = String(frameImageUrl ?? "");
  const match = /^data:([^;]+);base64,(.+)$/.exec(value);
  if (!match) return value; // already a real URL — pass through unchanged
  const [, mimetype, base64] = match;
  const buffer = Buffer.from(base64, "base64");
  const extension = mimetype.split("/")[1] ? `.${mimetype.split("/")[1]}` : ".png";
  return saveUploadedFile(tenantId, { buffer, originalname: `frame${extension}`, mimetype }, "templates", extension);
}

// GET /api/frames/categories — read by both the kiosk (Pilih Frame) and admin
// (Kelola Frame), same requireAnyAuth reasoning as GET /api/config/tenant.
framesRouter.get("/categories", requireAnyAuth, async (req, res) => {
  const [row] = await db.select({ frameCategories: tenantSettings.frameCategories }).from(tenantSettings).where(eq(tenantSettings.tenantId, req.tenantId!));
  const categories = row?.frameCategories?.length ? row.frameCategories : DEFAULT_CATEGORIES;
  res.json({ categories });
});

// POST /api/frames/categories — admin: "+ Kategori baru…" in Kelola Frame.
// Appends to the tenant-wide list so every kiosk device (not just the admin's
// own browser) resolves and labels the new category correctly.
framesRouter.post("/categories", requireAdminAuth, async (req, res) => {
  const tenantId = req.tenantId!;
  const label = String(req.body?.label ?? "").trim();
  if (!label) return res.status(400).json({ error: "Nama kategori wajib diisi" });

  await ensureTenantSettingsRow(tenantId);
  const [row] = await db.select({ frameCategories: tenantSettings.frameCategories }).from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId));
  const current = row?.frameCategories?.length ? row.frameCategories : DEFAULT_CATEGORIES;

  const key = slugifyCategory(label);
  const categories = current.some((category) => category.key === key) ? current : [...current, { key, label }];
  await db.update(tenantSettings).set({ frameCategories: categories, updatedAt: new Date() }).where(eq(tenantSettings.tenantId, tenantId));
  res.json({ categories });
});

// GET /api/frames?orientation=portrait — kiosk "Pilih Frame" screen
framesRouter.get("/", requireKioskAuth, async (req, res) => {
  const tenantId = req.tenantId!;
  const orientation = (req.query.orientation as string) || "portrait";

  const [customTemplates, overlays] = await Promise.all([
    db.select().from(templates).where(and(eq(templates.tenantId, tenantId), eq(templates.active, true))),
    db.select().from(frameOverlays).where(and(eq(frameOverlays.tenantId, tenantId), eq(frameOverlays.active, true))),
  ]);

  const merged = [
    ...customTemplates
      .filter((t) => t.orientation === orientation)
      .map((t) => ({ id: t.id, kind: "template" as const, name: t.name, imageUrl: resolveFrameUrl(t.frameImageUrl), slots: t.slots, canvasWidth: t.canvasWidth, canvasHeight: t.canvasHeight, orientation: t.orientation, category: t.category, style: t.style, outputPreset: t.outputPreset })),
    ...overlays
      .filter((o) => o.orientation === orientation)
      .map((o) => ({ id: o.id, kind: "overlay" as const, name: o.name, imageUrl: resolveFrameUrl(o.imageUrl) })),
  ];

  res.json(merged);
});

// POST /api/frames — admin: persist an uploaded frame for every kiosk client
framesRouter.post("/", requireAdminAuth, async (req, res) => {
  const tenantId = req.tenantId!;
  const { id, name, frameImageUrl, slots, canvasWidth, canvasHeight, orientation, category, style, outputPreset } = req.body;
  if (!String(name ?? "").trim() || !String(frameImageUrl ?? "").startsWith("data:image/") || !Array.isArray(slots)) {
    return res.status(400).json({ error: "Data frame tidak valid" });
  }

  // `id` is client-supplied (used for "save while editing" upserts) — without
  // this check, an admin could overwrite another tenant's frame just by
  // guessing/reusing its id, since onConflictDoUpdate below only keys on the
  // primary key with no tenant filter.
  if (id) {
    const [existing] = await db.select({ tenantId: templates.tenantId }).from(templates).where(eq(templates.id, id));
    if (existing && existing.tenantId !== tenantId) {
      return res.status(403).json({ error: "Frame ini bukan milik tenant kamu" });
    }
  }

  const values = {
    ...(id ? { id } : {}),
    tenantId,
    name: String(name).trim(),
    frameImageUrl: await resolveFrameImageUrl(tenantId, frameImageUrl),
    slots,
    canvasWidth: Number(canvasWidth) || 1200,
    canvasHeight: Number(canvasHeight) || 1800,
    orientation: orientation === "landscape" ? "landscape" : "portrait",
    category: String(category ?? "custom"),
    style: String(style ?? "Custom"),
    outputPreset: String(outputPreset ?? "4r"),
  };
  // Every current caller (FrameManagement.tsx, AdminPlaceholder.tsx) just
  // `await`s this call and either re-fetches via GET /frames or already has the
  // image locally (it's the thing they just uploaded) — none of them read the
  // response body's imageUrl. Echoing frameImageUrl back here meant a multi-MB
  // round trip nobody used, on top of the multi-MB request body itself; confirmed
  // live this made "Menyimpan..." hang long enough to look stuck, same root cause
  // as the DELETE route's fix above.
  const [row] = await db.insert(templates).values(values).onConflictDoUpdate({
    target: templates.id,
    set: {
      name: values.name,
      frameImageUrl: values.frameImageUrl,
      slots: values.slots,
      canvasWidth: values.canvasWidth,
      canvasHeight: values.canvasHeight,
      orientation: values.orientation,
      category: values.category,
      style: values.style,
      outputPreset: values.outputPreset,
      // tenantId intentionally not in `set` — an update can't reassign ownership
    },
  }).returning({ id: templates.id, name: templates.name, slots: templates.slots });

  res.status(201).json({
    id: row.id,
    kind: "template",
    name: row.name,
    slots: row.slots,
  });
});

// PATCH /api/frames/:id — admin: edit metadata and slot layout
framesRouter.patch("/:id", requireAdminAuth, async (req, res) => {
  const tenantId = req.tenantId!;
  const { name, frameImageUrl, slots, canvasWidth, canvasHeight, orientation, category, style, outputPreset } = req.body;
  const values = {
    ...(name !== undefined ? { name: String(name).trim() } : {}),
    ...(frameImageUrl !== undefined ? { frameImageUrl: await resolveFrameImageUrl(tenantId, frameImageUrl) } : {}),
    ...(slots !== undefined ? { slots } : {}),
    ...(canvasWidth !== undefined ? { canvasWidth: Number(canvasWidth) || 1200 } : {}),
    ...(canvasHeight !== undefined ? { canvasHeight: Number(canvasHeight) || 1800 } : {}),
    ...(orientation !== undefined ? { orientation: orientation === "landscape" ? "landscape" : "portrait" } : {}),
    ...(category !== undefined ? { category: String(category) } : {}),
    ...(style !== undefined ? { style: String(style) } : {}),
    ...(outputPreset !== undefined ? { outputPreset: String(outputPreset) } : {}),
  };
  if ("name" in values && !values.name) return res.status(400).json({ error: "Nama frame wajib diisi" });
  // Same fix as POST above — nothing reads frameImageUrl back from this response.
  const [row] = await db.update(templates).set(values).where(and(eq(templates.id, String(req.params.id)), eq(templates.tenantId, req.tenantId!)))
    .returning({ id: templates.id, name: templates.name, slots: templates.slots, canvasWidth: templates.canvasWidth, canvasHeight: templates.canvasHeight, orientation: templates.orientation, category: templates.category, style: templates.style, outputPreset: templates.outputPreset });
  if (!row) return res.status(404).json({ error: "Frame tidak ditemukan" });
  res.json({ id: row.id, kind: "template", name: row.name, slots: row.slots, canvasWidth: row.canvasWidth, canvasHeight: row.canvasHeight, orientation: row.orientation, category: row.category, style: row.style, outputPreset: row.outputPreset });
});

// DELETE /api/frames/:id — admin: hapus frame dari server
framesRouter.delete("/:id", requireAdminAuth, async (req, res) => {
  const id = String(req.params.id);
  // `.returning({ id })` instead of the bare `.returning()` — frameImageUrl is a
  // base64 data URL that can be several MB; transferring the whole deleted row
  // back for a response that only ever reads `.id` is pure waste (confirmed live:
  // a leftover ~20MB test row made this take long enough to look like a hang).
  const [deleted] = await db.delete(templates).where(and(eq(templates.id, id), eq(templates.tenantId, req.tenantId!))).returning({ id: templates.id });
  if (!deleted) return res.status(404).json({ error: "Frame tidak ditemukan" });
  res.json({ ok: true, id: deleted.id });
});
