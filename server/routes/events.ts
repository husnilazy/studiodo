import { Router } from "express";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { eventBooths, eventFrames, events, kioskKeys, sessions, templates } from "../db/schema.js";
import { requireAdminAuth } from "../middleware/adminAuth.js";
import { requireKioskAuth } from "../middleware/kioskAuth.js";
import { validateUuidParam } from "../middleware/validateUuidParam.js";
import { logEvent } from "../lib/platformEvents.js";
import { saveUploadedFile } from "../storage.js";
import { resolveFrameUrl } from "../lib/frameUrl.js";
import { countEventSessions, EVENT_FRAME_CATEGORY, eventForKiosk, eventState, getBoothMode, loadEventFrameIds, resolveActiveEvent, sanitizeEventInput, type EventRow } from "../lib/events.js";

// Events ("Acara") for the tenant dashboard (/api/events) plus the one route a kiosk calls to learn what is live on ITS booth.
// Every admin query is scoped to the signed-in tenant; booth ids from the body are checked against the tenant's own booths.

export const eventsRouter = Router();
eventsRouter.param("id", validateUuidParam("Event tidak ditemukan"));

// GET /api/events/active — the event live on this booth right now + whether the booth only runs events (kiosk auth)
eventsRouter.get("/active", requireKioskAuth, async (req, res) => {
  const [event, boothMode] = await Promise.all([resolveActiveEvent(req.tenantId!, req.kioskKeyId), getBoothMode(req.kioskKeyId)]);
  const frameCount = event ? (await loadEventFrameIds([event.id])).get(event.id)?.length ?? 0 : 0;
  res.json({ event: eventForKiosk(event, frameCount), boothMode, serverTime: new Date().toISOString() });
});

const admin = requireAdminAuth;

/** The tenant's live (non-revoked) booths, id -> label. */
async function tenantBooths(tenantId: string) {
  const rows = await db.select({ id: kioskKeys.id, label: kioskKeys.label, boothMode: kioskKeys.boothMode }).from(kioskKeys)
    .where(and(eq(kioskKeys.tenantId, tenantId), isNull(kioskKeys.revokedAt))).orderBy(asc(kioskKeys.createdAt));
  return rows;
}

async function ownEvent(tenantId: string, id: string): Promise<EventRow | null> {
  const [row] = await db.select().from(events).where(and(eq(events.id, id), eq(events.tenantId, tenantId)));
  return row ?? null;
}

/** An uploaded image arrives as a data: URI from the browser; move it to file storage and keep only the URL. */
async function storeEventImage(tenantId: string, value: unknown): Promise<string | null> {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value);
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(text);
  if (!match) return /^(https?:|\/)/.test(text) ? text : null;
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > 10 * 1024 * 1024) throw new Error("Foto event terlalu besar (maksimal 10 MB).");
  const extension = `.${(match[1].split("/")[1] ?? "png").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "png"}`;
  return resolveFrameUrl(await saveUploadedFile(tenantId, { buffer, originalname: `event${extension}`, mimetype: match[1] }, "branding", extension));
}

/** Pictures in the branding arrive as data: URIs; store them as files and keep the URL. A cover may be a video (then idleCoverType says so). */
async function storeBranding(tenantId: string, branding: Record<string, string>): Promise<Record<string, string>> {
  const out = { ...branding };
  for (const key of ["logoUrl", "idleCoverUrl", "idleBannerUrl"] as const) {
    const value = out[key];
    if (value === undefined) continue;
    const match = /^data:((?:image|video)\/[a-z0-9.+-]+);base64,(.+)$/i.exec(value);
    if (!match) { if (/^(https?:|\/)/.test(value)) out[key] = value; else delete out[key]; continue; }
    if (key !== "idleCoverUrl" && match[1].startsWith("video/")) { delete out[key]; continue; }
    const buffer = Buffer.from(match[2], "base64");
    if (buffer.length > 40 * 1024 * 1024) throw new Error("File branding terlalu besar (maksimal 40 MB).");
    const extension = `.${(match[1].split("/")[1] ?? "bin").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "bin"}`;
    out[key] = resolveFrameUrl(await saveUploadedFile(tenantId, { buffer, originalname: `event-branding${extension}`, mimetype: match[1] }, "branding", extension));
    if (key === "idleCoverUrl") out.idleCoverType = match[1].startsWith("video/") ? "video" : "image";
  }
  if (out.idleCoverUrl && !out.idleCoverType) out.idleCoverType = /\.(mp4|webm|mov)(\?|$)/i.test(out.idleCoverUrl) ? "video" : "image";
  if (!out.idleCoverUrl) delete out.idleCoverType;
  return out;
}

async function boothIdsOf(eventIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (eventIds.length === 0) return map;
  const links = await db.select().from(eventBooths).where(inArray(eventBooths.eventId, eventIds));
  for (const l of links) (map.get(l.eventId) ?? map.set(l.eventId, []).get(l.eventId)!).push(l.kioskKeyId);
  return map;
}

const serialize = (e: EventRow, used: number, boothIds: string[], frameIds: string[] = []) => ({
  id: e.id, name: e.name, description: e.description, imageUrl: e.imageUrl, enabled: e.enabled,
  startsAt: e.startsAt ? new Date(e.startsAt).toISOString() : null,
  endsAt: e.endsAt ? new Date(e.endsAt).toISOString() : null,
  freeEntry: e.freeEntry, timerEnabled: e.timerEnabled, sessionTimerMinutes: e.sessionTimerMinutes, maxPhotos: e.maxPhotos,
  hasGif: e.hasGif, hasVideo: e.hasVideo, sessionCap: e.sessionCap, revertToStandard: e.revertToStandard, branding: e.branding ?? {},
  kioskKeyIds: boothIds, frameIds, state: eventState(e, used), sessionCount: used,
});

// GET /api/events/frames — every frame an event may offer: the tenant's normal frames plus the ones uploaded for events
eventsRouter.get("/frames", admin, async (req, res) => {
  const rows = await db.select({
    id: templates.id, name: templates.name, orientation: templates.orientation, category: templates.category,
    slots: templates.slots, canvasWidth: templates.canvasWidth, canvasHeight: templates.canvasHeight, outputPreset: templates.outputPreset,
    imageUrl: sql<string | null>`case when left(${templates.frameImageUrl}, 5) = 'data:' then null else ${templates.frameImageUrl} end`,
  }).from(templates).where(and(eq(templates.tenantId, req.tenantId!), eq(templates.active, true))).orderBy(asc(templates.createdAt));
  res.json(rows.filter((r) => r.category !== "__stopmotion" && r.category !== "__custom")
    .map((r) => ({ id: r.id, name: r.name, orientation: r.orientation, slots: r.slots, canvasWidth: r.canvasWidth, canvasHeight: r.canvasHeight, outputPreset: r.outputPreset, eventOnly: r.category === EVENT_FRAME_CATEGORY, imageUrl: r.imageUrl ? resolveFrameUrl(r.imageUrl) : null })));
});

// GET /api/events — every event of the tenant, newest first, with its state and how many sessions it has run
eventsRouter.get("/", admin, async (req, res) => {
  const tenantId = req.tenantId!;
  const [rows, booths] = await Promise.all([
    db.select().from(events).where(eq(events.tenantId, tenantId)).orderBy(desc(events.startsAt), desc(events.createdAt)),
    tenantBooths(tenantId),
  ]);
  const ids = rows.map((r) => r.id);
  const [used, links, frameLinks] = await Promise.all([countEventSessions(ids), boothIdsOf(ids), loadEventFrameIds(ids)]);
  res.json({ booths, events: rows.map((e) => serialize(e, used.get(e.id) ?? 0, links.get(e.id) ?? [], frameLinks.get(e.id) ?? [])) });
});

async function saveEvent(tenantId: string, id: string | null, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const parsed = sanitizeEventInput(body);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
  const v = parsed.value;
  const own = new Set((await tenantBooths(tenantId)).map((b) => b.id));
  const boothIds = v.kioskKeyIds.filter((k) => own.has(k));
  // Only this tenant's own, real frames (not stop-motion or cashier custom frames) may be offered by an event.
  const frameRows = v.frameIds.length === 0 ? [] : await db.select({ id: templates.id, category: templates.category }).from(templates).where(and(eq(templates.tenantId, tenantId), inArray(templates.id, v.frameIds)));
  const frameIds = frameRows.filter((f) => f.category !== "__stopmotion" && f.category !== "__custom").map((f) => f.id);
  let imageUrl: string | null | undefined;
  try {
    imageUrl = v.imageUrl === undefined ? undefined : await storeEventImage(tenantId, v.imageUrl);
  } catch (error) {
    return { status: 400, body: { error: error instanceof Error ? error.message : "Foto event tidak dapat disimpan." } };
  }
  let branding: Record<string, string>;
  try { branding = await storeBranding(tenantId, v.branding); } catch (error) { return { status: 400, body: { error: error instanceof Error ? error.message : "Branding tidak dapat disimpan." } }; }
  const values = {
    revertToStandard: v.revertToStandard,
    branding,
    name: v.name, description: v.description, enabled: v.enabled, startsAt: v.startsAt, endsAt: v.endsAt, freeEntry: v.freeEntry,
    timerEnabled: v.timerEnabled, sessionTimerMinutes: v.sessionTimerMinutes, maxPhotos: v.maxPhotos, hasGif: v.hasGif, hasVideo: v.hasVideo,
    sessionCap: v.sessionCap, ...(imageUrl !== undefined ? { imageUrl } : {}), updatedAt: new Date(),
  };
  const eventId = await db.transaction(async (tx) => {
    let target = id;
    if (target) {
      await tx.update(events).set(values).where(and(eq(events.id, target), eq(events.tenantId, tenantId)));
      await tx.delete(eventBooths).where(eq(eventBooths.eventId, target));
    } else {
      const [row] = await tx.insert(events).values({ ...values, tenantId }).returning({ id: events.id });
      target = row.id;
    }
    if (boothIds.length > 0) await tx.insert(eventBooths).values(boothIds.map((kioskKeyId) => ({ eventId: target!, kioskKeyId })));
    await tx.delete(eventFrames).where(eq(eventFrames.eventId, target));
    if (frameIds.length > 0) await tx.insert(eventFrames).values(frameIds.map((templateId) => ({ eventId: target!, templateId })));
    return target;
  });
  logEvent({ tenantId, category: "kiosk", action: id ? "event.updated" : "event.created", message: `Event "${v.name}" ${id ? "diubah" : "dibuat"} (${boothIds.length === 0 ? "semua booth" : `${boothIds.length} booth`})`, actorType: "tenant_admin" });
  const row = await ownEvent(tenantId, eventId);
  const used = await countEventSessions([eventId]);
  return { status: id ? 200 : 201, body: { event: serialize(row!, used.get(eventId) ?? 0, boothIds, frameIds) } };
}

eventsRouter.post("/", admin, async (req, res) => {
  const r = await saveEvent(req.tenantId!, null, req.body);
  res.status(r.status).json(r.body);
});

eventsRouter.put("/:id", admin, async (req, res) => {
  const tenantId = req.tenantId!;
  if (!(await ownEvent(tenantId, String(req.params.id)))) return res.status(404).json({ error: "Event tidak ditemukan" });
  const r = await saveEvent(tenantId, String(req.params.id), req.body);
  res.status(r.status).json(r.body);
});

// PATCH /api/events/:id/enabled — { enabled } the quick on/off switch on an event card
eventsRouter.patch("/:id/enabled", admin, async (req, res) => {
  const tenantId = req.tenantId!;
  const event = await ownEvent(tenantId, String(req.params.id));
  if (!event) return res.status(404).json({ error: "Event tidak ditemukan" });
  const enabled = req.body?.enabled === true;
  await db.update(events).set({ enabled, updatedAt: new Date() }).where(and(eq(events.id, event.id), eq(events.tenantId, tenantId)));
  logEvent({ tenantId, category: "kiosk", action: enabled ? "event.enabled" : "event.disabled", message: `Event "${event.name}" ${enabled ? "diaktifkan" : "dinonaktifkan"}`, actorType: "tenant_admin" });
  res.json({ ok: true, enabled });
});

// DELETE /api/events/:id — the event goes; its sessions stay (they just stop belonging to an event)
eventsRouter.delete("/:id", admin, async (req, res) => {
  const tenantId = req.tenantId!;
  const event = await ownEvent(tenantId, String(req.params.id));
  if (!event) return res.status(404).json({ error: "Event tidak ditemukan" });
  // Frames that were uploaded for this event alone go with it; frames borrowed from the normal library stay.
  const owned = await db.select({ id: templates.id }).from(eventFrames).innerJoin(templates, eq(templates.id, eventFrames.templateId))
    .where(and(eq(eventFrames.eventId, event.id), eq(templates.tenantId, tenantId), eq(templates.category, EVENT_FRAME_CATEGORY)));
  await db.delete(events).where(and(eq(events.id, event.id), eq(events.tenantId, tenantId)));
  if (owned.length > 0) await db.delete(templates).where(and(eq(templates.tenantId, tenantId), inArray(templates.id, owned.map((o) => o.id))));
  logEvent({ tenantId, category: "kiosk", action: "event.deleted", message: `Event "${event.name}" dihapus (sesi tetap tersimpan)`, actorType: "tenant_admin" });
  res.json({ ok: true });
});

// GET /api/events/:id/stats — everything the event dashboard shows
eventsRouter.get("/:id/stats", admin, async (req, res) => {
  const tenantId = req.tenantId!;
  const event = await ownEvent(tenantId, String(req.params.id));
  if (!event) return res.status(404).json({ error: "Event tidak ditemukan" });

  const where = and(eq(sessions.eventId, event.id), eq(sessions.tenantId, tenantId));
  const [rows, recent, booths, links] = await Promise.all([
    db.select({
      id: sessions.id,
      kioskKeyId: sessions.kioskKeyId,
      createdAt: sessions.createdAt,
      paymentStatus: sessions.paymentStatus,
      paymentMethod: sessions.paymentMethod,
      totalAmount: sessions.totalAmount,
      photos: sql<number>`coalesce(jsonb_array_length(${sessions.photoUrls}), 0)`,
      hasGif: sql<boolean>`${sessions.gifUrl} is not null`,
      hasVideo: sql<boolean>`${sessions.videoUrl} is not null`,
      hasContact: sql<boolean>`(${sessions.customerWhatsapp} is not null or ${sessions.customerEmail} is not null)`,
      consent: sessions.publishConsent,
    }).from(sessions).where(where).orderBy(desc(sessions.createdAt)).limit(20000),
    db.select({ id: sessions.id, createdAt: sessions.createdAt, stripUrl: sessions.stripUrl, photoUrls: sessions.photoUrls, gifUrl: sessions.gifUrl, kioskKeyId: sessions.kioskKeyId, shareUrl: sessions.shareUrl })
      .from(sessions).where(and(where, sql`jsonb_array_length(${sessions.photoUrls}) > 0`)).orderBy(desc(sessions.createdAt)).limit(12),
    tenantBooths(tenantId),
    boothIdsOf([event.id]),
  ]);

  const label = new Map(booths.map((b) => [b.id, b.label || "Booth tanpa nama"]));
  const perBooth = new Map<string, { kioskKeyId: string | null; label: string; sessions: number; photos: number }>();
  const perHour = new Map<string, number>();
  let photos = 0, withPhotos = 0, gifs = 0, videos = 0, contacts = 0, consents = 0, revenue = 0, free = 0, paid = 0;
  for (const r of rows) {
    const photoCount = Number(r.photos) || 0;
    photos += photoCount;
    if (photoCount > 0) withPhotos++;
    if (r.hasGif) gifs++;
    if (r.hasVideo) videos++;
    if (r.hasContact) contacts++;
    if (r.consent) consents++;
    if (r.paymentStatus === "success") {
      if (r.paymentMethod === "event") free++;
      else { paid++; revenue += Number(r.totalAmount ?? 0); }
    }
    const key = r.kioskKeyId ?? "none";
    const slot = perBooth.get(key) ?? { kioskKeyId: r.kioskKeyId, label: r.kioskKeyId ? label.get(r.kioskKeyId) ?? "Booth dihapus" : "Tanpa booth", sessions: 0, photos: 0 };
    slot.sessions++;
    slot.photos += photoCount;
    perBooth.set(key, slot);
    const hour = new Date(r.createdAt).toISOString().slice(0, 13);
    perHour.set(hour, (perHour.get(hour) ?? 0) + 1);
  }

  const used = rows.length;
  res.json({
    event: serialize(event, used, links.get(event.id) ?? [], (await loadEventFrameIds([event.id])).get(event.id) ?? []),
    totals: { sessions: used, completed: withPhotos, photos, gifs, videos, contacts, consents, free, paid, revenue },
    perBooth: [...perBooth.values()].sort((a, b) => b.sessions - a.sessions),
    timeline: [...perHour.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([hour, count]) => ({ hour: `${hour}:00:00.000Z`, count })),
    recent: recent.map((r) => ({
      id: r.id, createdAt: new Date(r.createdAt).toISOString(), booth: r.kioskKeyId ? label.get(r.kioskKeyId) ?? null : null, shareUrl: r.shareUrl,
      thumb: resolveFrameUrl(r.stripUrl || (Array.isArray(r.photoUrls) ? r.photoUrls[0] : "") || r.gifUrl || ""),
    })),
  });
});

// GET /api/events/:id/gallery?before=<iso>&limit=48 — this event's results, newest first, for browsing and (re)printing at the booth
eventsRouter.get("/:id/gallery", admin, async (req, res) => {
  const tenantId = req.tenantId!;
  const event = await ownEvent(tenantId, String(req.params.id));
  if (!event) return res.status(404).json({ error: "Event tidak ditemukan" });
  const limit = Math.max(1, Math.min(96, Number(req.query.limit) || 48));
  const before = typeof req.query.before === "string" && !Number.isNaN(new Date(req.query.before).getTime()) ? new Date(req.query.before) : null;
  const rows = await db.select({
    id: sessions.id, createdAt: sessions.createdAt, orientation: sessions.orientation, stripUrl: sessions.stripUrl, photoUrls: sessions.photoUrls,
    gifUrl: sessions.gifUrl, videoUrl: sessions.videoUrl, shareUrl: sessions.shareUrl, kioskKeyId: sessions.kioskKeyId,
  }).from(sessions).where(and(eq(sessions.eventId, event.id), eq(sessions.tenantId, tenantId), sql`jsonb_array_length(${sessions.photoUrls}) > 0`, ...(before ? [sql`${sessions.createdAt} < ${before}`] : [])))
    .orderBy(desc(sessions.createdAt)).limit(limit + 1);
  const booths = new Map((await tenantBooths(tenantId)).map((b) => [b.id, b.label || ""]));
  const page = rows.slice(0, limit);
  res.json({
    items: page.map((r) => ({
      id: r.id, createdAt: new Date(r.createdAt).toISOString(), orientation: r.orientation, shareUrl: r.shareUrl, booth: r.kioskKeyId ? booths.get(r.kioskKeyId) || null : null,
      stripUrl: r.stripUrl ? resolveFrameUrl(r.stripUrl) : null,
      photoUrls: (Array.isArray(r.photoUrls) ? r.photoUrls : []).map((u) => resolveFrameUrl(u)),
      gifUrl: r.gifUrl ? resolveFrameUrl(r.gifUrl) : null, videoUrl: r.videoUrl ? resolveFrameUrl(r.videoUrl) : null,
    })),
    next: rows.length > limit ? new Date(page[page.length - 1].createdAt).toISOString() : null,
  });
});

// GET /api/events/:id/contacts — the WhatsApp numbers / e-mails guests left during this event (for the tenant's follow-up)
eventsRouter.get("/:id/contacts", admin, async (req, res) => {
  const tenantId = req.tenantId!;
  const event = await ownEvent(tenantId, String(req.params.id));
  if (!event) return res.status(404).json({ error: "Event tidak ditemukan" });
  const rows = await db.select({ createdAt: sessions.createdAt, whatsapp: sessions.customerWhatsapp, email: sessions.customerEmail, consent: sessions.publishConsent, feedback: sessions.feedback, kioskKeyId: sessions.kioskKeyId })
    .from(sessions).where(and(eq(sessions.eventId, event.id), eq(sessions.tenantId, tenantId), sql`(${sessions.customerWhatsapp} is not null or ${sessions.customerEmail} is not null)`)).orderBy(asc(sessions.createdAt));
  const booths = new Map((await tenantBooths(tenantId)).map((b) => [b.id, b.label || ""]));
  res.json({ eventName: event.name, contacts: rows.map((r) => ({ at: new Date(r.createdAt).toISOString(), whatsapp: r.whatsapp, email: r.email, consent: r.consent, feedback: r.feedback, booth: r.kioskKeyId ? booths.get(r.kioskKeyId) ?? "" : "" })) });
});
