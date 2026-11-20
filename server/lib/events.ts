import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { eventBooths, eventFrames, events, kioskKeys, sessions } from "../db/schema.js";
import { logEvent } from "./platformEvents.js";

// Events ("Acara"). Whether an event is live is decided HERE, on the server, from the schedule and the booth — a kiosk can
// no longer declare "an event is on" and get free sessions (the old setting lived only in the kiosk's own config).

/** Frames uploaded from the event screen are ordinary templates under this reserved category: kept out of the normal frame picker and Kelola Frame. */
export const EVENT_FRAME_CATEGORY = "__event";

export type EventRow = typeof events.$inferSelect;
export type BoothMode = "standard" | "event_only";

export function normalizeBoothMode(value: unknown): BoothMode {
  return value === "event_only" ? "event_only" : "standard";
}

/** Pure: is this event inside its on/off switch and schedule right now? (The session cap is checked separately.) */
export function isEventInWindow(event: Pick<EventRow, "enabled" | "startsAt" | "endsAt">, now = Date.now()): boolean {
  if (!event.enabled) return false;
  if (event.startsAt && now < new Date(event.startsAt).getTime()) return false;
  if (event.endsAt && now > new Date(event.endsAt).getTime()) return false;
  return true;
}

export type EventState = "live" | "scheduled" | "ended" | "off" | "full";

/** Pure: the label an event card shows. `used` = sessions already started in the event. */
export function eventState(event: Pick<EventRow, "enabled" | "startsAt" | "endsAt" | "sessionCap">, used: number, now = Date.now()): EventState {
  if (!event.enabled) return "off";
  if (event.endsAt && now > new Date(event.endsAt).getTime()) return "ended";
  if (event.startsAt && now < new Date(event.startsAt).getTime()) return "scheduled";
  if (event.sessionCap != null && used >= event.sessionCap) return "full";
  return "live";
}

/** Pure: of the events that could run on a booth, the one to use — the one that started most recently (an open start counts as oldest). */
export function pickLiveEvent<T extends Pick<EventRow, "startsAt" | "createdAt">>(candidates: T[]): T | null {
  if (candidates.length === 0) return null;
  const startOf = (e: T) => (e.startsAt ? new Date(e.startsAt).getTime() : 0);
  return [...candidates].sort((a, b) => startOf(b) - startOf(a) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
}

// What an event may restyle: texts, colours and three pictures. Everything else (flow, camera, printer…) stays the booth's own.
export const BRANDING_TEXT_KEYS = ["brandName", "tagline", "promoText", "idleHeadline", "idleSubheadline", "idleStartText", "packageHeadline", "paymentHeadline", "captureHeadline", "resultHeadline", "hashtag"] as const;
export const BRANDING_COLOR_KEYS = ["accentColor", "backgroundColor", "surfaceColor", "textColor"] as const;
export const BRANDING_IMAGE_KEYS = ["logoUrl", "idleCoverUrl", "idleBannerUrl"] as const;
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Pure: keeps only whitelisted branding. Text/colour are validated here; image values are passed through (data: URIs are stored by the route). */
export function sanitizeBranding(raw: unknown): { ok: true; value: Record<string, string> } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: {} };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Branding event tidak valid." };
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const isText = (BRANDING_TEXT_KEYS as readonly string[]).includes(key);
    const isColor = (BRANDING_COLOR_KEYS as readonly string[]).includes(key);
    const isImage = (BRANDING_IMAGE_KEYS as readonly string[]).includes(key);
    if (!isText && !isColor && !isImage) continue;
    if (value === null || value === "") continue;
    if (typeof value !== "string") return { ok: false, error: `Nilai branding "${key}" harus berupa teks.` };
    const v = isImage ? value.trim() : value.trim().slice(0, 200);
    if (!v) continue;
    if (isColor && !HEX.test(v)) return { ok: false, error: `Warna "${key}" tidak valid (contoh: #1a73e8).` };
    out[key] = v;
  }
  return { ok: true, value: out };
}

export interface EventInput {
  revertToStandard: boolean;
  branding: Record<string, string>;
  name: string;
  description: string;
  enabled: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  freeEntry: boolean;
  timerEnabled: boolean;
  sessionTimerMinutes: number;
  maxPhotos: number;
  hasGif: boolean;
  hasVideo: boolean;
  sessionCap: number | null;
  imageUrl?: string | null; // undefined = leave unchanged
  kioskKeyIds: string[];
  frameIds: string[];
}

const UUID = /^[0-9a-f-]{36}$/i;

function readDate(value: unknown, label: string): { ok: true; value: Date | null } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return { ok: false, error: `${label} tidak valid.` };
  return { ok: true, value: d };
}

function readInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (value === undefined || value === null || value === "" || !Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/** Pure: validates an event form body. Booth ids are filtered against the tenant's own booths by the caller. */
export function sanitizeEventInput(raw: unknown): { ok: true; value: EventInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Data event tidak valid." };
  const b = raw as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 80) : "";
  if (!name) return { ok: false, error: "Nama event wajib diisi." };
  const startsAt = readDate(b.startsAt, "Waktu mulai");
  if (!startsAt.ok) return startsAt;
  const endsAt = readDate(b.endsAt, "Waktu selesai");
  if (!endsAt.ok) return endsAt;
  if (startsAt.value && endsAt.value && endsAt.value.getTime() <= startsAt.value.getTime()) return { ok: false, error: "Waktu selesai harus setelah waktu mulai." };
  const cap = b.sessionCap === undefined || b.sessionCap === null || b.sessionCap === "" ? null : readInt(b.sessionCap, 0, 1, 1_000_000);
  const kioskKeyIds = Array.isArray(b.kioskKeyIds) ? [...new Set(b.kioskKeyIds.map(String).filter((id) => UUID.test(id)))] : [];
  const branding = sanitizeBranding(b.branding);
  if (!branding.ok) return branding;
  const image = b.imageUrl === undefined ? undefined : typeof b.imageUrl === "string" && b.imageUrl.trim() ? b.imageUrl.trim() : null;
  return {
    ok: true,
    value: {
      name,
      description: typeof b.description === "string" ? b.description.trim().slice(0, 300) : "",
      enabled: b.enabled !== false,
      startsAt: startsAt.value,
      endsAt: endsAt.value,
      freeEntry: b.freeEntry !== false,
      timerEnabled: b.timerEnabled !== false,
      sessionTimerMinutes: readInt(b.sessionTimerMinutes, 5, 1, 30),
      maxPhotos: readInt(b.maxPhotos, 0, 0, 50),
      hasGif: b.hasGif === true,
      hasVideo: b.hasVideo !== false,
      sessionCap: cap,
      imageUrl: image,
      kioskKeyIds,
      revertToStandard: b.revertToStandard === true,
      branding: branding.value,
      frameIds: Array.isArray(b.frameIds) ? [...new Set(b.frameIds.map(String).filter((id) => UUID.test(id)))].slice(0, 30) : [],
    },
  };
}

/** How many sessions each of these events has started (one query for all of them). */
export async function countEventSessions(eventIds: string[]): Promise<Map<string, number>> {
  if (eventIds.length === 0) return new Map();
  const rows = await db.select({ eventId: sessions.eventId, n: count() }).from(sessions).where(inArray(sessions.eventId, eventIds)).groupBy(sessions.eventId);
  return new Map(rows.map((r) => [r.eventId as string, Number(r.n)]));
}

/** Pure: should an event-only booth go back to normal mode? Yes once an event that asked for it has ended (after the booth was last switched) and nothing else is live or still coming. */
export function shouldRevertToStandard(
  applicable: Pick<EventRow, "enabled" | "startsAt" | "endsAt" | "revertToStandard">[],
  modeChangedAt: Date | null,
  now = Date.now(),
): boolean {
  const since = modeChangedAt ? new Date(modeChangedAt).getTime() : 0;
  const busy = applicable.some((e) => isEventInWindow(e, now) || (e.startsAt && new Date(e.startsAt).getTime() > now));
  if (busy) return false;
  return applicable.some((e) => e.revertToStandard && e.endsAt && new Date(e.endsAt).getTime() < now && new Date(e.endsAt).getTime() > since);
}

/** Every enabled event of the tenant that runs on this booth (live, coming or already over), by schedule order not applied. */
async function eventsForBooth(tenantId: string, kioskKeyId: string): Promise<EventRow[]> {
  const rows = await db.select().from(events).where(and(eq(events.tenantId, tenantId), eq(events.enabled, true)));
  if (rows.length === 0) return [];
  const links = await db.select().from(eventBooths).where(inArray(eventBooths.eventId, rows.map((e) => e.id)));
  const boothsOf = new Map<string, Set<string>>();
  for (const l of links) (boothsOf.get(l.eventId) ?? boothsOf.set(l.eventId, new Set()).get(l.eventId)!).add(l.kioskKeyId);
  return rows.filter((e) => {
    const set = boothsOf.get(e.id);
    return !set || set.size === 0 || set.has(kioskKeyId);
  });
}

/** The event live on this booth right now, or null. Honours the booth assignment, the schedule, the on/off switch and the session cap. */
export async function resolveActiveEvent(tenantId: string, kioskKeyId: string | null | undefined, now = Date.now()): Promise<EventRow | null> {
  if (!kioskKeyId) return null;
  const forThisBooth = (await eventsForBooth(tenantId, kioskKeyId)).filter((e) => isEventInWindow(e, now));
  if (forThisBooth.length === 0) return null;
  const capped = forThisBooth.filter((e) => e.sessionCap != null);
  const used = capped.length > 0 ? await countEventSessions(capped.map((e) => e.id)) : new Map<string, number>();
  return pickLiveEvent(forThisBooth.filter((e) => e.sessionCap == null || (used.get(e.id) ?? 0) < e.sessionCap));
}

/** The frame template ids each of these events offers (an event with none uses the booth's normal frames). */
export async function loadEventFrameIds(eventIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (eventIds.length === 0) return map;
  const rows = await db.select().from(eventFrames).where(inArray(eventFrames.eventId, eventIds));
  for (const r of rows) (map.get(r.eventId) ?? map.set(r.eventId, []).get(r.eventId)!).push(r.templateId);
  return map;
}

export async function getBoothMode(kioskKeyId: string | null | undefined): Promise<BoothMode> {
  if (!kioskKeyId) return "standard";
  const [row] = await db.select({ mode: kioskKeys.boothMode, at: kioskKeys.boothModeAt, tenantId: kioskKeys.tenantId, label: kioskKeys.label }).from(kioskKeys).where(eq(kioskKeys.id, kioskKeyId));
  const mode = normalizeBoothMode(row?.mode);
  if (mode !== "event_only" || !row) return mode;
  // An event-only booth whose last event (that asked for it) is over goes back to normal photobooth mode by itself.
  if (shouldRevertToStandard(await eventsForBooth(row.tenantId, kioskKeyId), row.at)) {
    await db.update(kioskKeys).set({ boothMode: "standard", boothModeAt: new Date() }).where(and(eq(kioskKeys.id, kioskKeyId), eq(kioskKeys.boothMode, "event_only")));
    logEvent({ tenantId: row.tenantId, category: "kiosk", action: "booth_mode.auto_reverted", message: `Booth "${row.label ?? kioskKeyId.slice(0, 8)}" kembali ke mode standar karena eventnya sudah selesai`, actorType: "system" });
    return "standard";
  }
  return mode;
}

/** What a kiosk needs to know: the live event (as the kiosk's own event settings) and whether its booth is event-only. */
export function eventForKiosk(event: EventRow | null, frameCount = 0) {
  if (!event) return null;
  return {
    id: event.id,
    name: event.name,
    description: event.description,
    imageUrl: event.imageUrl,
    startsAt: event.startsAt ? new Date(event.startsAt).toISOString() : "",
    endsAt: event.endsAt ? new Date(event.endsAt).toISOString() : "",
    freeEntry: event.freeEntry,
    timerEnabled: event.timerEnabled,
    sessionTimerMinutes: event.sessionTimerMinutes,
    maxPhotos: event.maxPhotos,
    hasGif: event.hasGif,
    hasVideo: event.hasVideo,
    frameCount,
    branding: event.branding ?? {},
    version: new Date(event.updatedAt).toISOString(),
  };
}
