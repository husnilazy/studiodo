import { Router } from "express";
import multer from "multer";
import { db } from "../db/client.js";
import { packages, sessions } from "../db/schema.js";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { saveUploadedFile, getStorageDriver } from "../storage.js";
import {
  uploadSessionPhoto,
  uploadSessionStrip,
  uploadSessionMedia,
  getFolderUrl,
  getFilePreviewUrl,
} from "../lib/gdrive.js";
import { requireAdminAuth } from "../middleware/adminAuth.js";
import { requireKioskAuth } from "../middleware/kioskAuth.js";
import { requireActiveSubscription } from "../middleware/requireActiveSubscription.js";
import { validateUuidParam } from "../middleware/validateUuidParam.js";

export const sessionsRouter = Router();

function resolveAssetUrl(value: unknown): string {
  if (!value) return "";
  const url = String(value ?? "");
  if (!url || /^(?:data:|https?:|blob:|file:)/i.test(url)) return url;
  const baseUrl = String(process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  return baseUrl ? `${baseUrl}/${url.replace(/^\/+/, "")}` : url;
}

function resolveAssetUrls(values: unknown): string[] {
  return Array.isArray(values) ? values.filter(Boolean).map(resolveAssetUrl) : [];
}

// A stale QR code/link from before the Postgres migration (session ids used
// to be nanoid strings, e.g. "VhwE5V4J4soUDjS8jmnHz") would otherwise reach
// the DB and blow up as a raw 500 — see validateUuidParam.ts.
sessionsRouter.param("id", validateUuidParam("Sesi tidak ditemukan"));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// POST /api/sessions — mulai sesi baru (setelah pilih paket + orientasi)
sessionsRouter.post("/", requireKioskAuth, requireActiveSubscription, async (req, res) => {
  const tenantId = req.tenantId!;
  const { packageId, orientation, selectedExtras = [] } = req.body;
  const [pkg] = packageId
    ? await db.select().from(packages).where(and(eq(packages.id, packageId), eq(packages.tenantId, tenantId)))
    : [];
  const configuredExtras = Array.isArray(pkg?.extraPrints) ? pkg.extraPrints : [];
  const requestedExtraIds = new Set(
    Array.isArray(selectedExtras) ? selectedExtras.map((extra: { id?: string }) => String(extra?.id ?? "")) : [],
  );
  const canonicalExtras = configuredExtras.filter((extra) => requestedExtraIds.has(extra.id));
  const totalAmount = pkg ? Number(pkg.price) + canonicalExtras.reduce((sum, extra) => sum + Number(extra.price), 0) : undefined;
  const [row] = await db
    .insert(sessions)
    .values({
      tenantId,
      packageId,
      orientation,
      selectedExtras: canonicalExtras,
      totalAmount: totalAmount != null ? totalAmount.toFixed(2) : undefined,
    })
    .returning();
  res.status(201).json(row);
});

// PATCH /api/sessions/:id — update frame/layout choice.
// Allowlisted on purpose: the API is public now (kiosk-key auth only), so this
// must not become a way to set arbitrary columns (e.g. driveFolderId,
// xenditInvoiceId, additionalPrintsPaid) — only the fields the kiosk client
// actually sends anywhere in the app. Payment fields (paymentStatus,
// paymentMethod, totalAmount) are deliberately NOT here — a kiosk key is
// held by every paired device, so a generic setter for those would let
// anyone holding one mark any session as paid for free. The one legitimate
// case that needs it (a configured free-entry event) goes through the
// narrow, single-purpose /:id/mark-event-free route below instead.
const SESSION_PATCHABLE_FIELDS = ["frameId", "layout", "voucherCode"] as const;

sessionsRouter.patch("/:id", requireKioskAuth, async (req, res) => {
  const tenantId = req.tenantId!;
  const patch: Record<string, unknown> = {};
  for (const field of SESSION_PATCHABLE_FIELDS) {
    if (req.body[field] !== undefined) patch[field] = req.body[field];
  }
  // frameId is deliberately NOT validated against a table here — it can
  // legitimately be a `templates.id`, a `frameOverlays.id` (two separate
  // tables, merged client-side into one picker), OR a purely client-local
  // template id that was never saved to the server at all (built in the
  // WYSIWYG editor, kept only in the kiosk's local template library). None of
  // those are a privilege/data-leak concern — it's a display-only reference —
  // so rejecting whichever of the three doesn't match one specific table
  // just breaks the "pilih frame" step for two of them.
  // Only reachable when the request carried none of the allowlisted fields
  // (e.g. a bypass attempt sending only paymentStatus/totalAmount) — an empty
  // .set({}) would otherwise throw at the DB layer.
  if (Object.keys(patch).length === 0) return res.status(400).json({ error: "Tidak ada field valid untuk diupdate" });
  const [row] = await db
    .update(sessions)
    .set(patch)
    .where(and(eq(sessions.id, String(req.params.id)), eq(sessions.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Sesi tidak ditemukan" });
  res.json(row);
});

// POST /api/sessions/:id/mark-event-free — mark a session as paid via a
// currently-running free-entry event, bypassing Xendit/voucher. Deliberately
// narrow (fixed totalAmount=0, fixed paymentMethod) instead of a generic
// field setter: the event on/off toggle only lives in the kiosk's own local
// config (no server-side record of it), so this route can't verify an event
// is genuinely active — keeping the mutation itself single-purpose limits
// what a leaked kiosk key can be used for to "grant one free session" rather
// than "rewrite the payment status/amount of any session".
sessionsRouter.post("/:id/mark-event-free", requireKioskAuth, requireActiveSubscription, async (req, res) => {
  const eventName = typeof req.body?.eventName === "string" ? req.body.eventName.trim().slice(0, 80) : "";
  const [row] = await db
    .update(sessions)
    .set({ paymentStatus: "success", paymentMethod: "event", totalAmount: "0.00", voucherCode: eventName || "EVENT" })
    .where(and(eq(sessions.id, String(req.params.id)), eq(sessions.tenantId, req.tenantId!)))
    .returning();
  if (!row) return res.status(404).json({ error: "Sesi tidak ditemukan" });
  res.json(row);
});

sessionsRouter.patch("/:id/customer", requireKioskAuth, async (req, res) => {
  const { whatsapp, email, publishConsent, feedback } = req.body;
  const [row] = await db.update(sessions).set({
    customerWhatsapp: whatsapp ? String(whatsapp).trim() : null,
    customerEmail: email ? String(email).trim() : null,
    publishConsent: Boolean(publishConsent),
    feedback: feedback ? String(feedback).trim() : null,
  }).where(and(eq(sessions.id, String(req.params.id)), eq(sessions.tenantId, req.tenantId!))).returning();
  if (!row) return res.status(404).json({ error: "Sesi tidak ditemukan" });
  res.json(row);
});

// POST /api/sessions/:id/photo  (multipart) — upload 1 foto, slotIndex di body untuk retake per slot
//
// Now that the kiosk fires this off in the background instead of waiting for
// it before letting the customer continue (see client SesiFoto.tsx), uploads
// for different slots of the same session can genuinely run concurrently.
// The read-modify-write on photoUrls/drivePhotoIds (and, for gdrive, the
// read-check-create of driveFolderId) is NOT safe under that concurrency
// without locking — two overlapping requests could each read the array
// before either writes, then whichever writes last clobbers the other's
// slot, or (for gdrive) each could see no folder yet and create two. A
// row lock for the duration of this one request serializes just that,
// which is cheap (one small file write) and keeps every write correct.
sessionsRouter.post("/:id/photo", requireKioskAuth, upload.single("photo"), async (req, res) => {
  const tenantId = req.tenantId!;
  const id = String(req.params.id);
  const slotIndex = Number(req.body.slotIndex);
  const file = req.file;
  if (!file) return res.status(400).json({ error: "File foto wajib diupload" });

  const row = await db.transaction(async (tx) => {
    const [session] = await tx.select().from(sessions).where(and(eq(sessions.id, id), eq(sessions.tenantId, tenantId))).for("update");
    if (!session) return null;

    let url: string;
    let updatedFields: Record<string, unknown>;

    if ((await getStorageDriver(tenantId)) === "gdrive") {
      const result = await uploadSessionPhoto(tenantId, {
        sessionId: id,
        slotIndex,
        buffer: file.buffer,
        mimeType: file.mimetype,
        existingFolderId: session.driveFolderId ?? null,
      });
      // NOT result.viewUrl — that's Drive's HTML "view this file" page
      // (drive.google.com/file/d/ID/view), not an image. Used here it made
      // every <img src={photoUrls[i]}> render broken (kiosk result screens,
      // admin Media Library thumbnails) and made "Download" in admin save an
      // HTML page renamed to .jpg instead of the actual photo. previewUrl is
      // Drive's thumbnail endpoint, a real image resource; drivePhotoIds
      // below still keeps downloadUrl around for actual full-quality saves.
      url = result.previewUrl;
      const drivePhotoIds = [...(session.drivePhotoIds ?? [])];
      drivePhotoIds[slotIndex] = { fileId: result.fileId, viewUrl: result.viewUrl, downloadUrl: result.downloadUrl, previewUrl: result.previewUrl };
      updatedFields = { driveFolderId: result.folderId, drivePhotoIds };
    } else {
      url = await saveUploadedFile(tenantId, file, "sessions", ".jpg");
      updatedFields = {};
    }

    const photoUrls = [...(session.photoUrls ?? [])];
    photoUrls[slotIndex] = url;
    updatedFields.photoUrls = photoUrls;

    const [updated] = await tx
      .update(sessions)
      .set(updatedFields)
      .where(and(eq(sessions.id, id), eq(sessions.tenantId, tenantId)))
      .returning();
    return updated;
  });

  if (!row) return res.status(404).json({ error: "Sesi tidak ditemukan" });
  res.json(row);
});

// Same concurrency reasoning as /:id/photo above — media upload can now
// genuinely overlap with in-flight photo uploads for the same session.
sessionsRouter.post("/:id/media", requireKioskAuth, upload.single("media"), async (req, res) => {
  const tenantId = req.tenantId!;
  const id = String(req.params.id);
  const file = req.file;
  if (!file) return res.status(400).json({ error: "File media wajib diupload" });

  // "video" packages produce a WebM (MediaRecorder); "gif" packages produce a
  // genuine encoded animated GIF (client-side gifenc) — not the same file
  // dressed up under a different field, so the extension must follow kind.
  const fallbackExtension = req.body.kind === "gif" ? ".gif" : ".webm";

  const row = await db.transaction(async (tx) => {
    const [session] = await tx.select().from(sessions).where(and(eq(sessions.id, id), eq(sessions.tenantId, tenantId))).for("update");
    if (!session) return null;

    let url: string;
    if ((await getStorageDriver(tenantId)) === "gdrive" && session.driveFolderId) {
      const result = await uploadSessionMedia(tenantId, {
        buffer: file.buffer,
        filename: `clip-${Date.now()}${fallbackExtension}`,
        mimeType: file.mimetype,
        folderId: session.driveFolderId,
      });
      url = result.downloadUrl;
    } else {
      url = await saveUploadedFile(tenantId, file, "sessions", fallbackExtension);
    }

    const mediaUrls = [...(session.mediaUrls ?? []), url];
    const field = req.body.kind === "gif" ? { gifUrl: url, mediaUrls } : { videoUrl: url, mediaUrls };
    const [updated] = await tx.update(sessions).set(field).where(and(eq(sessions.id, id), eq(sessions.tenantId, tenantId))).returning();
    return updated;
  });

  if (!row) return res.status(404).json({ error: "Sesi tidak ditemukan" });
  res.json(row);
});

// POST /api/sessions/:id/slot-media — the short clip captured at ONE
// specific photo shot (e.g. slot 2's own 1.6s GIF/webm), as opposed to
// /:id/media above which is the combined all-slots-at-once output. Same
// concurrency handling as /:id/photo, since retakes can re-upload a slot's
// clip while other slots are still capturing.
sessionsRouter.post("/:id/slot-media", requireKioskAuth, upload.single("media"), async (req, res) => {
  const tenantId = req.tenantId!;
  const id = String(req.params.id);
  const slotIndex = Number(req.body.slotIndex);
  const file = req.file;
  if (!file || !Number.isInteger(slotIndex) || slotIndex < 0) return res.status(400).json({ error: "File dan slotIndex wajib diisi" });

  const fallbackExtension = req.body.kind === "gif" ? ".gif" : ".webm";

  const row = await db.transaction(async (tx) => {
    const [session] = await tx.select().from(sessions).where(and(eq(sessions.id, id), eq(sessions.tenantId, tenantId))).for("update");
    if (!session) return null;

    let url: string;
    if ((await getStorageDriver(tenantId)) === "gdrive" && session.driveFolderId) {
      const result = await uploadSessionMedia(tenantId, {
        buffer: file.buffer,
        filename: `slot-${slotIndex}-${Date.now()}${fallbackExtension}`,
        mimeType: file.mimetype,
        folderId: session.driveFolderId,
      });
      url = result.downloadUrl;
    } else {
      url = await saveUploadedFile(tenantId, file, "sessions", fallbackExtension);
    }

    const slotClipUrls = [...(session.slotClipUrls ?? [])];
    slotClipUrls[slotIndex] = url;
    const [updated] = await tx.update(sessions).set({ slotClipUrls }).where(and(eq(sessions.id, id), eq(sessions.tenantId, tenantId))).returning();
    return updated;
  });

  if (!row) return res.status(404).json({ error: "Sesi tidak ditemukan" });
  res.json(row);
});

sessionsRouter.post("/:id/strip", requireKioskAuth, upload.single("strip"), async (req, res) => {
  const tenantId = req.tenantId!;
  const id = String(req.params.id);
  const file = req.file;
  if (!file) return res.status(400).json({ error: "File strip wajib diupload" });

  const row = await db.transaction(async (tx) => {
    const [session] = await tx.select().from(sessions).where(and(eq(sessions.id, id), eq(sessions.tenantId, tenantId))).for("update");
    if (!session) return null;

    let stripUrl: string;
    let driveFields: Record<string, unknown> = {};

    if ((await getStorageDriver(tenantId)) === "gdrive" && session.driveFolderId) {
      const result = await uploadSessionStrip(tenantId, {
        buffer: file.buffer,
        folderId: session.driveFolderId,
      });
      stripUrl = result.downloadUrl; // use download URL so client can directly download
      driveFields = { driveStripId: result.fileId };
    } else {
      stripUrl = await saveUploadedFile(tenantId, file, "sessions", ".jpg");
    }

    const [updated] = await tx
      .update(sessions)
      .set({ stripUrl, ...driveFields })
      .where(and(eq(sessions.id, id), eq(sessions.tenantId, tenantId)))
      .returning();
    return updated;
  });

  if (!row) return res.status(404).json({ error: "Sesi tidak ditemukan" });
  res.json(row);
});

// POST /api/sessions/:id/finalize — tandai selesai, generate share link + QR data
sessionsRouter.post("/:id/finalize", requireKioskAuth, async (req, res) => {
  const tenantId = req.tenantId!;
  const id = String(req.params.id);
  const { stripUrl, gifUrl, videoUrl } = req.body;
  const publicBaseUrl = String(process.env.PUBLIC_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");
  // Always server-computed — never trust a client-supplied shareUrl. The
  // client (Hasil.tsx) used to send its own guess based on window.location.origin
  // as an optimistic placeholder while waiting on a slower /api/config/public
  // round-trip, and for a packaged Electron kiosk that origin is "file://",
  // which got persisted as the session's PERMANENT share link once accepted
  // here. A blacklist (rejecting "localhost") papered over one case; the
  // server already has the one correct answer (PUBLIC_BASE_URL) for every
  // case, so there's no reason to ever take the kiosk's word for this.
  const shareUrl = `${publicBaseUrl}/#/share/${id}`;

  // gifUrl/videoUrl are usually already set by the earlier /:id/media upload
  // (which happens during capture, before this runs) — only include them here
  // when the request actually sent one, so a plain {stripUrl, shareUrl} call
  // (the common case) can't null out media that's already been saved.
  const patch: Record<string, unknown> = { stripUrl, shareUrl, completedAt: new Date() };
  if (gifUrl !== undefined) patch.gifUrl = gifUrl;
  if (videoUrl !== undefined) patch.videoUrl = videoUrl;

  const [row] = await db
    .update(sessions)
    .set(patch)
    .where(and(eq(sessions.id, id), eq(sessions.tenantId, tenantId)))
    .returning();
  if (!row) return res.status(404).json({ error: "Sesi tidak ditemukan" });

  res.json(row);
});

sessionsRouter.get("/", requireAdminAuth, async (req, res) => {
  const tenantId = req.tenantId!;
  const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 100));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const [rows, [{ total }]] = await Promise.all([
    db.select({
      id: sessions.id,
      customerWhatsapp: sessions.customerWhatsapp,
      customerEmail: sessions.customerEmail,
      publishConsent: sessions.publishConsent,
      feedback: sessions.feedback,
      shareUrl: sessions.shareUrl,
      createdAt: sessions.createdAt,
    }).from(sessions).where(eq(sessions.tenantId, tenantId)).orderBy(desc(sessions.createdAt)).limit(limit).offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(sessions).where(eq(sessions.tenantId, tenantId)),
  ]);
  res.json({ items: rows, total, limit, offset });
});

// GET /api/sessions/admin/overview?days=90 — dashboard stat cards, daily traffic
// chart, and the recent-session list (with resolved photo/video/GIF URLs) for
// the Media Library tab. Used to pull every session ever for this tenant just to
// count/bucket them in JS — the actual cause of "admin loading lama" as history
// grows. Stat cards now come from real SQL aggregates (cheap regardless of
// table size, and correctly all-time instead of accidentally windowed), the
// traffic chart is bucketed in SQL, and only the row-level list (the expensive
// part, since every row's assets get resolved) is bounded to `days`.
sessionsRouter.get("/admin/overview", requireAdminAuth, async (req, res) => {
  const tenantId = req.tenantId!;
  const days = Math.max(1, Math.min(365, Number(req.query.days) || 90));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [metricsRow] = await db.select({
    totalSessions: sql<number>`count(*)::int`,
    paidSessions: sql<number>`count(*) filter (where ${sessions.paymentStatus} = 'success')::int`,
    revenue: sql<number>`coalesce(sum(${sessions.totalAmount}) filter (where ${sessions.paymentStatus} = 'success'), 0)`,
    photos: sql<number>`coalesce(sum(jsonb_array_length(coalesce(${sessions.photoUrls}, '[]'::jsonb))), 0)::int`,
    videos: sql<number>`count(*) filter (where ${sessions.videoUrl} is not null)::int`,
    gifs: sql<number>`count(*) filter (where ${sessions.gifUrl} is not null)::int`,
    customers: sql<number>`count(distinct coalesce(nullif(${sessions.customerWhatsapp}, ''), nullif(${sessions.customerEmail}, '')))::int`,
  }).from(sessions).where(eq(sessions.tenantId, tenantId));

  const trafficRows = await db.select({
    date: sql<string>`to_char(${sessions.createdAt}, 'YYYY-MM-DD')`,
    visits: sql<number>`count(*)::int`,
    revenue: sql<number>`coalesce(sum(${sessions.totalAmount}) filter (where ${sessions.paymentStatus} = 'success'), 0)`,
  }).from(sessions)
    .where(and(eq(sessions.tenantId, tenantId), gte(sessions.createdAt, since)))
    .groupBy(sql`to_char(${sessions.createdAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${sessions.createdAt}, 'YYYY-MM-DD')`);

  const rawRows = await db.select({
    id: sessions.id,
    paymentMethod: sessions.paymentMethod,
    paymentStatus: sessions.paymentStatus,
    totalAmount: sessions.totalAmount,
    photoUrls: sessions.photoUrls,
    gifUrl: sessions.gifUrl,
    videoUrl: sessions.videoUrl,
    mediaUrls: sessions.mediaUrls,
    stripUrl: sessions.stripUrl,
    customerWhatsapp: sessions.customerWhatsapp,
    customerEmail: sessions.customerEmail,
    shareUrl: sessions.shareUrl,
    createdAt: sessions.createdAt,
    completedAt: sessions.completedAt,
    driveFolderId: sessions.driveFolderId,
    drivePhotoIds: sessions.drivePhotoIds,
    driveStripId: sessions.driveStripId,
  }).from(sessions).where(and(eq(sessions.tenantId, tenantId), gte(sessions.createdAt, since))).orderBy(sessions.createdAt);
  // photoUrls/stripUrl are thumbnail/preview URLs (see uploadSessionPhoto
  // above) — fine for display, but the Media Library's "Download" button
  // needs the real full-quality file. driveLinks carries the per-asset
  // downloadUrl alongside so the client isn't stuck downloading a thumbnail.
  const rows = rawRows.map((row) => {
    const { driveFolderId, drivePhotoIds, driveStripId, ...rest } = row;
    const drivePhotos = Array.isArray(drivePhotoIds) ? drivePhotoIds.filter(Boolean) : [];
    return {
      ...rest,
      photoUrls: resolveAssetUrls(rest.photoUrls),
      stripUrl: resolveAssetUrl(rest.stripUrl),
      gifUrl: resolveAssetUrl(rest.gifUrl),
      videoUrl: resolveAssetUrl(rest.videoUrl),
      mediaUrls: resolveAssetUrls(rest.mediaUrls),
      driveLinks: driveFolderId ? {
        folderUrl: getFolderUrl(driveFolderId),
        stripPreviewUrl: driveStripId ? getFilePreviewUrl(driveStripId) : null,
        photos: drivePhotos.map((p) => ({ viewUrl: p.viewUrl, downloadUrl: p.downloadUrl, previewUrl: p.previewUrl })),
      } : null,
    };
  });

  res.json({
    sessions: rows,
    metrics: {
      totalSessions: metricsRow.totalSessions,
      paidSessions: metricsRow.paidSessions,
      revenue: Number(metricsRow.revenue),
      photos: metricsRow.photos,
      videos: metricsRow.videos,
      gifs: metricsRow.gifs,
      customers: metricsRow.customers,
    },
    traffic: trafficRows.map((row) => ({ date: row.date, visits: row.visits, revenue: Number(row.revenue) })),
  });
});

// GET /api/sessions/recent — dipakai Operator Console (tab Riwayat & Log) di kiosk
// untuk tunjukkin ulang QR/reprint ke customer yang lupa scan. Harus didaftarkan
// SEBELUM "/:id" di bawah, kalau tidak Express bakal coba cocokkan "recent" sebagai
// id sesi (lalu ditolak validateUuidParam).
sessionsRouter.get("/recent", requireKioskAuth, async (req, res) => {
  const rows = await db.select({
    id: sessions.id,
    paymentStatus: sessions.paymentStatus,
    paymentMethod: sessions.paymentMethod,
    totalAmount: sessions.totalAmount,
    photoUrls: sessions.photoUrls,
    shareUrl: sessions.shareUrl,
    createdAt: sessions.createdAt,
    completedAt: sessions.completedAt,
  }).from(sessions).where(eq(sessions.tenantId, req.tenantId!)).orderBy(desc(sessions.createdAt)).limit(20);
  res.json(rows);
});

// GET /api/sessions/:id — dipakai kiosk selama alur berlangsung
sessionsRouter.get("/:id", requireKioskAuth, async (req, res) => {
  const [row] = await db.select().from(sessions).where(and(eq(sessions.id, String(req.params.id)), eq(sessions.tenantId, req.tenantId!)));
  if (!row) return res.status(404).json({ error: "Sesi tidak ditemukan" });
  res.json(row);
});

// GET /api/sessions/:id/public — dibuka customer dari HP lewat QR, tanpa auth apa pun.
// Aman karena hanya lookup by id (nanoid, tidak bisa ditebak) dan read-only.
sessionsRouter.get("/:id/public", async (req, res) => {
  const [row] = await db.select({
    id: sessions.id,
    tenantId: sessions.tenantId,
    photoUrls: sessions.photoUrls,
    stripUrl: sessions.stripUrl,
    gifUrl: sessions.gifUrl,
    videoUrl: sessions.videoUrl,
    slotClipUrls: sessions.slotClipUrls,
    shareUrl: sessions.shareUrl,
    driveFolderId: sessions.driveFolderId,
    drivePhotoIds: sessions.drivePhotoIds,
    driveStripId: sessions.driveStripId,
  }).from(sessions).where(eq(sessions.id, String(req.params.id)));
  if (!row) return res.status(404).json({ error: "Hasil tidak ditemukan" });

  // Enrich with Drive URLs if applicable
  const driveLinks = row.driveFolderId ? {
    folderUrl: getFolderUrl(row.driveFolderId),
    stripPreviewUrl: row.driveStripId ? getFilePreviewUrl(row.driveStripId) : null,
    photos: Array.isArray(row.drivePhotoIds)
      ? row.drivePhotoIds.filter(Boolean).map((p) => ({
          viewUrl: p.viewUrl,
          downloadUrl: p.downloadUrl,
          previewUrl: p.previewUrl,
        }))
      : [],
  } : null;

  const { tenantId, ...publicRow } = row;
  res.json({ ...publicRow, driveLinks });
});
