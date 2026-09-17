import { Router } from "express";
import multer from "multer";
import { db } from "../db/client.js";
import { packages, sessions } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { saveUploadedFile, getStorageDriver } from "../storage.js";
import {
  uploadSessionPhoto,
  uploadSessionStrip,
  uploadSessionMedia,
  getFolderUrl,
  getFilePreviewUrl,
} from "../lib/gdrive.js";

export const sessionsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// POST /api/sessions — mulai sesi baru (setelah pilih paket + orientasi)
sessionsRouter.post("/", async (req, res) => {
  const { packageId, orientation, boothId, selectedExtras = [] } = req.body;
  const [pkg] = packageId ? await db.select().from(packages).where(eq(packages.id, packageId)) : [];
  const configuredExtras = Array.isArray(pkg?.extraPrints) ? pkg.extraPrints : [];
  const requestedExtraIds = new Set(
    Array.isArray(selectedExtras) ? selectedExtras.map((extra: { id?: string }) => String(extra?.id ?? "")) : [],
  );
  const canonicalExtras = configuredExtras.filter((extra) => requestedExtraIds.has(extra.id));
  const totalAmount = pkg ? Number(pkg.price) + canonicalExtras.reduce((sum, extra) => sum + Number(extra.price), 0) : undefined;
  const [row] = await db
    .insert(sessions)
    .values({ packageId, orientation, boothId: boothId ?? "default", selectedExtras: canonicalExtras, totalAmount: totalAmount?.toFixed(2) })
    .returning();
  res.status(201).json(row);
});

// PATCH /api/sessions/:id — update filter, frame, layout, dll di sepanjang alur
sessionsRouter.patch("/:id", async (req, res) => {
  const [row] = await db
    .update(sessions)
    .set(req.body)
    .where(eq(sessions.id, String(req.params.id)))
    .returning();
  if (!row) return res.status(404).json({ error: "Sesi tidak ditemukan" });
  res.json(row);
});

sessionsRouter.patch("/:id/customer", async (req, res) => {
  const { whatsapp, email, publishConsent, feedback } = req.body;
  const [row] = await db.update(sessions).set({
    customerWhatsapp: whatsapp ? String(whatsapp).trim() : null,
    customerEmail: email ? String(email).trim() : null,
    publishConsent: Boolean(publishConsent),
    feedback: feedback ? String(feedback).trim() : null,
  }).where(eq(sessions.id, String(req.params.id))).returning();
  if (!row) return res.status(404).json({ error: "Sesi tidak ditemukan" });
  res.json(row);
});

// POST /api/sessions/:id/photo  (multipart) — upload 1 foto, slotIndex di body untuk retake per slot
sessionsRouter.post("/:id/photo", upload.single("photo"), async (req, res) => {
  const id = String(req.params.id);
  const slotIndex = Number(req.body.slotIndex);
  if (!req.file) return res.status(400).json({ error: "File foto wajib diupload" });

  const [session] = await db.select().from(sessions).where(eq(sessions.id, id));
  if (!session) return res.status(404).json({ error: "Sesi tidak ditemukan" });

  let url: string;
  let updatedFields: Record<string, unknown> = {};

  if (getStorageDriver() === "gdrive") {
    const result = await uploadSessionPhoto({
      sessionId: id,
      slotIndex,
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      existingFolderId: (session as any).driveFolderId ?? null,
    });
    url = result.viewUrl;
    // Simpan Drive file metadata
    const drivePhotoIds = [...((session as any).drivePhotoIds ?? [])];
    drivePhotoIds[slotIndex] = { fileId: result.fileId, viewUrl: result.viewUrl, downloadUrl: result.downloadUrl, previewUrl: result.previewUrl };
    updatedFields = { driveFolderId: result.folderId, drivePhotoIds };
  } else {
    url = await saveUploadedFile(req.file, "sessions", ".jpg");
  }

  const photoUrls = [...(session.photoUrls ?? [])];
  photoUrls[slotIndex] = url;

  const [row] = await db
    .update(sessions)
    .set({ photoUrls, ...updatedFields })
    .where(eq(sessions.id, id))
    .returning();

  res.json(row);
});

sessionsRouter.post("/:id/media", upload.single("media"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "File media wajib diupload" });
  const [session] = await db.select().from(sessions).where(eq(sessions.id, String(req.params.id)));
  if (!session) return res.status(404).json({ error: "Sesi tidak ditemukan" });

  let url: string;
  if (getStorageDriver() === "gdrive" && (session as any).driveFolderId) {
    const ext = req.body.kind === "gif" ? ".gif" : ".mp4";
    const result = await uploadSessionMedia({
      buffer: req.file.buffer,
      filename: `clip-${Date.now()}${ext}`,
      mimeType: req.file.mimetype,
      folderId: (session as any).driveFolderId,
    });
    url = result.viewUrl;
  } else {
    url = await saveUploadedFile(req.file, "sessions", ".webm");
  }

  const mediaUrls = [...(session.mediaUrls ?? []), url];
  const field = req.body.kind === "gif" ? { gifUrl: url, mediaUrls } : { videoUrl: url, mediaUrls };
  const [row] = await db.update(sessions).set(field).where(eq(sessions.id, String(req.params.id))).returning();
  res.json(row);
});

sessionsRouter.post("/:id/strip", upload.single("strip"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "File strip wajib diupload" });
  const [session] = await db.select().from(sessions).where(eq(sessions.id, String(req.params.id)));
  if (!session) return res.status(404).json({ error: "Sesi tidak ditemukan" });

  let stripUrl: string;
  let driveFields: Record<string, unknown> = {};

  if (getStorageDriver() === "gdrive" && (session as any).driveFolderId) {
    const result = await uploadSessionStrip({
      buffer: req.file.buffer,
      folderId: (session as any).driveFolderId,
    });
    stripUrl = result.downloadUrl; // use download URL so client can directly download
    driveFields = { driveStripId: result.fileId };
  } else {
    stripUrl = await saveUploadedFile(req.file, "sessions", ".jpg");
  }

  const [row] = await db
    .update(sessions)
    .set({ stripUrl, ...driveFields })
    .where(eq(sessions.id, String(req.params.id)))
    .returning();
  res.json(row);
});

// POST /api/sessions/:id/finalize — tandai selesai, generate share link + QR data
sessionsRouter.post("/:id/finalize", async (req, res) => {
  const id = String(req.params.id);
  const { stripUrl, gifUrl, videoUrl, shareUrl: requestedShareUrl } = req.body;
  const shareUrl = requestedShareUrl ?? `${process.env.PUBLIC_BASE_URL ?? "http://localhost:4000"}/#/share/${id}`;

  const [row] = await db
    .update(sessions)
    .set({ stripUrl, gifUrl, videoUrl, shareUrl, completedAt: new Date() })
    .where(eq(sessions.id, id))
    .returning();

  res.json(row);
});

sessionsRouter.get("/", async (_req, res) => {
  const rows = await db.select({
    id: sessions.id,
    customerWhatsapp: sessions.customerWhatsapp,
    customerEmail: sessions.customerEmail,
    publishConsent: sessions.publishConsent,
    feedback: sessions.feedback,
    shareUrl: sessions.shareUrl,
    createdAt: sessions.createdAt,
  }).from(sessions).orderBy(sessions.createdAt);
  res.json(rows);
});

sessionsRouter.get("/admin/overview", async (_req, res) => {
  const rows = await db.select({
    id: sessions.id,
    paymentMethod: sessions.paymentMethod,
    paymentStatus: sessions.paymentStatus,
    totalAmount: sessions.totalAmount,
    photoUrls: sessions.photoUrls,
    gifUrl: sessions.gifUrl,
    videoUrl: sessions.videoUrl,
    mediaUrls: sessions.mediaUrls,
    customerWhatsapp: sessions.customerWhatsapp,
    customerEmail: sessions.customerEmail,
    shareUrl: sessions.shareUrl,
    createdAt: sessions.createdAt,
    completedAt: sessions.completedAt,
  }).from(sessions).orderBy(sessions.createdAt);
  const successful = rows.filter((row) => row.paymentStatus === "success");
  const traffic = new Map<string, { visits: number; revenue: number }>();
  rows.forEach((row) => {
    const day = new Date(row.createdAt).toISOString().slice(0, 10);
    const current = traffic.get(day) ?? { visits: 0, revenue: 0 };
    current.visits += 1;
    if (row.paymentStatus === "success") current.revenue += Number(row.totalAmount ?? 0);
    traffic.set(day, current);
  });
  res.json({
    sessions: rows,
    metrics: {
      totalSessions: rows.length,
      paidSessions: successful.length,
      revenue: successful.reduce((sum, row) => sum + Number(row.totalAmount ?? 0), 0),
      photos: rows.reduce((sum, row) => sum + (row.photoUrls?.length ?? 0), 0),
      videos: rows.filter((row) => Boolean(row.videoUrl)).length,
      gifs: rows.filter((row) => Boolean(row.gifUrl)).length,
      customers: new Set(rows.flatMap((row) => [row.customerWhatsapp, row.customerEmail].filter(Boolean))).size,
    },
    traffic: Array.from(traffic.entries()).map(([date, value]) => ({ date, ...value })),
  });
});

// GET /api/sessions/:id
sessionsRouter.get("/:id", async (req, res) => {
  const [row] = await db.select().from(sessions).where(eq(sessions.id, String(req.params.id)));
  if (!row) return res.status(404).json({ error: "Sesi tidak ditemukan" });
  res.json(row);
});

sessionsRouter.get("/:id/public", async (req, res) => {
  const [row] = await db.select({
    id: sessions.id,
    photoUrls: sessions.photoUrls,
    stripUrl: sessions.stripUrl,
    gifUrl: sessions.gifUrl,
    videoUrl: sessions.videoUrl,
    shareUrl: sessions.shareUrl,
    driveFolderId: (sessions as any).driveFolderId,
    drivePhotoIds: (sessions as any).drivePhotoIds,
    driveStripId: (sessions as any).driveStripId,
  }).from(sessions).where(eq(sessions.id, String(req.params.id)));
  if (!row) return res.status(404).json({ error: "Hasil tidak ditemukan" });

  // Enrich with Drive URLs if applicable
  const r = row as any;
  const driveLinks = r.driveFolderId ? {
    folderUrl: getFolderUrl(r.driveFolderId),
    stripPreviewUrl: r.driveStripId ? getFilePreviewUrl(r.driveStripId) : null,
    photos: Array.isArray(r.drivePhotoIds)
      ? r.drivePhotoIds.filter(Boolean).map((p: any) => ({
          viewUrl: p.viewUrl,
          downloadUrl: p.downloadUrl,
          previewUrl: p.previewUrl,
        }))
      : [],
  } : null;

  res.json({ ...row, driveLinks });
});
