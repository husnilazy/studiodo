import { Router } from "express";
import { db } from "../db/client.js";
import { packages, sessions } from "../db/schema.js";
import { and, eq } from "drizzle-orm";
import { requireAdminAuth } from "../middleware/adminAuth.js";
import { requireKioskAuth } from "../middleware/kioskAuth.js";
import { saveUploadedFile } from "../storage.js";
import { getTenantPlanFeatures } from "../lib/planFeatures.js";

export const packagesRouter = Router();

// The admin UI reads the thumbnail file into a data: URI client-side (simplest
// upload UX — no separate multipart step) and sends that string as-is. Storing
// that raw base64 straight into the packages row is what broke this: a single
// ~800KB photo turned "SELECT * FROM packages" (a query the admin panel AND
// every kiosk's package screen run constantly) into a 100+ second query —
// confirmed directly against the DB. So every write here decodes a data: URI
// and hands the bytes to the same file storage the rest of the app already
// uses (session photos, strips), storing only the resulting URL in the row.
async function resolveThumbnailUrl(tenantId: string, thumbnailUrl: unknown): Promise<string | null> {
  if (!thumbnailUrl) return null;
  const value = String(thumbnailUrl);
  const match = /^data:([^;]+);base64,(.+)$/.exec(value);
  if (!match) return value; // already a real URL (unchanged on this edit) — pass through
  const [, mimetype, base64] = match;
  const buffer = Buffer.from(base64, "base64");
  const extension = mimetype.split("/")[1] ? `.${mimetype.split("/")[1]}` : ".jpg";
  return saveUploadedFile(tenantId, { buffer, originalname: `thumbnail${extension}`, mimetype }, "packages", extension);
}

// GET /api/packages — kiosk "Pilih Paket" screen
packagesRouter.get("/", requireKioskAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(packages)
    .where(and(eq(packages.tenantId, req.tenantId!), eq(packages.active, true)))
    .orderBy(packages.sortOrder);
  res.json(rows);
});

// GET /api/packages/all — admin panel (includes inactive)
packagesRouter.get("/all", requireAdminAuth, async (req, res) => {
  const rows = await db.select().from(packages).where(eq(packages.tenantId, req.tenantId!)).orderBy(packages.sortOrder);
  res.json(rows);
});

// POST /api/packages — admin: tambah paket
packagesRouter.post("/", requireAdminAuth, async (req, res) => {
  const { name, price, photoCount, hasGif, hasVideo, extraPrints = [], sortOrder, thumbnailUrl, description } = req.body;
  const normalizedPrice = Number(price ?? 0);
  const normalizedPhotoCount = Number(photoCount ?? 1);
  const normalizedSortOrder = Number(sortOrder ?? 0);

  if (!String(name ?? "").trim() || !Number.isFinite(normalizedPrice) || normalizedPrice < 0 || !Number.isFinite(normalizedPhotoCount) || normalizedPhotoCount < 1) {
    return res.status(400).json({ error: "Nama, harga, dan jumlah foto tidak valid" });
  }
  if ((hasGif || hasVideo)) {
    const { gifVideoEnabled } = await getTenantPlanFeatures(req.tenantId!);
    if (!gifVideoEnabled) return res.status(403).json({ error: "Fitur GIF/Video tidak termasuk paket kamu saat ini." });
  }

  const [row] = await db
    .insert(packages)
    .values({
      tenantId: req.tenantId!,
      name: String(name).trim(),
      price: String(normalizedPrice),
      photoCount: normalizedPhotoCount,
      hasGif: Boolean(hasGif),
      hasVideo: Boolean(hasVideo),
      extraPrints: Array.isArray(extraPrints) ? extraPrints : [],
      sortOrder: normalizedSortOrder,
      thumbnailUrl: await resolveThumbnailUrl(req.tenantId!, thumbnailUrl),
      description: description ? String(description) : null,
      active: true,
    })
    .returning();
  res.status(201).json(row);
});

// PATCH /api/packages/:id — admin: edit paket
packagesRouter.patch("/:id", requireAdminAuth, async (req, res) => {
  const patch = { ...req.body };

  if (patch.name !== undefined) patch.name = String(patch.name).trim();
  if (patch.price !== undefined) {
    const price = Number(patch.price);
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: "Harga tidak valid" });
    patch.price = String(price);
  }
  if (patch.photoCount !== undefined) {
    const photoCount = Number(patch.photoCount);
    if (!Number.isFinite(photoCount) || photoCount < 1) return res.status(400).json({ error: "Jumlah foto tidak valid" });
    patch.photoCount = photoCount;
  }
  if (patch.sortOrder !== undefined) patch.sortOrder = Number(patch.sortOrder) || 0;
  if (patch.hasGif !== undefined) patch.hasGif = Boolean(patch.hasGif);
  if (patch.hasVideo !== undefined) patch.hasVideo = Boolean(patch.hasVideo);
  if (patch.hasGif || patch.hasVideo) {
    const { gifVideoEnabled } = await getTenantPlanFeatures(req.tenantId!);
    if (!gifVideoEnabled) return res.status(403).json({ error: "Fitur GIF/Video tidak termasuk paket kamu saat ini." });
  }
  if (patch.extraPrints !== undefined) patch.extraPrints = Array.isArray(patch.extraPrints) ? patch.extraPrints : [];
  if (patch.active !== undefined) patch.active = Boolean(patch.active);
  if (patch.thumbnailUrl !== undefined) patch.thumbnailUrl = await resolveThumbnailUrl(req.tenantId!, patch.thumbnailUrl);
  if (patch.description !== undefined) patch.description = patch.description ? String(patch.description) : null;
  delete patch.tenantId;

  const id = String(req.params.id);
  const [row] = await db
    .update(packages)
    .set(patch)
    .where(and(eq(packages.id, id), eq(packages.tenantId, req.tenantId!)))
    .returning();
  if (!row) return res.status(404).json({ error: "Paket tidak ditemukan" });
  res.json(row);
});

// DELETE /api/packages/:id — admin: hapus paket
packagesRouter.delete("/:id", requireAdminAuth, async (req, res) => {
  const id = String(req.params.id);
  const [existing] = await db
    .select({ id: packages.id, active: packages.active })
    .from(packages)
    .where(and(eq(packages.id, id), eq(packages.tenantId, req.tenantId!)));

  if (!existing) return res.status(404).json({ error: "Paket tidak ditemukan" });

  const [sessionRef] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.packageId, id))
    .limit(1);

  if (sessionRef) {
    await db.update(packages).set({ active: false }).where(eq(packages.id, id));
    return res.json({ ok: true, deleted: true, softDeleted: true, id: existing.id });
  }

  await db.delete(packages).where(eq(packages.id, id));
  return res.json({ ok: true, deleted: true, softDeleted: false, id: existing.id });
});
