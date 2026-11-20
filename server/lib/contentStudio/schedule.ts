import crypto from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

// Posting queue + settings for the Instagram auto-poster. Plain JSON files next to the decks (no DB migration), written
// atomically and serialised through one in-process lock because the worker and the API routes both change the queue.

export type PostStatus = "draft" | "scheduled" | "preparing" | "ready" | "posting" | "posted" | "failed" | "skipped";
export type PostMode = "auto" | "manual"; // auto = the server publishes through the Instagram API; manual = package is prepared, a person posts it

export type ScheduledPost = {
  id: string;
  deckId: string;
  title: string;
  format: "carousel" | "reel";
  featureId?: string;
  scheduledAt: string; // ISO (UTC)
  force?: boolean; // "Kirim sekarang" pressed: a person asked for this one, so the per-day safety cap does not hold it back
  revision?: { text: string; at: string }; // note asked from the review screen; the post stays a draft until it is cleared
  mode: PostMode;
  status: PostStatus;
  caption: string;
  hashtags: string[];
  carouselMedia: "image" | "video";
  token: string; // unguessable id used in the public media URL Instagram downloads from
  mediaType?: "reel" | "images" | "videos";
  files?: string[];
  coverFile?: string;
  attempts: number;
  nextTryAt?: string;
  error?: string;
  igMediaId?: string;
  permalink?: string;
  postedAt?: string;
  createdAt: string;
  log: string[]; // last few events, newest last
};

export type CsSettings = {
  tzOffsetMin: number; // minutes east of UTC; WIB = 420
  days: number[]; // posting weekdays (0 = Sunday)
  times: string[]; // HH:mm local
  reelEvery: number; // every Nth post is a reel (0 = never)
  defaultMode: PostMode;
  prepLeadMin: number; // render this long before the post is due
  maxPerDay: number; // safety cap on published posts per local day
  autopilot: boolean; // keep the calendar filled automatically
  autoApprove: boolean; // autopilot drafts go straight to "scheduled" (off = a person approves first)
  horizonDays: number; // autopilot keeps this many days of posts queued ahead
  lastRefillAt?: string;
};

export const DEFAULT_SETTINGS: CsSettings = {
  tzOffsetMin: 420, days: [1, 3, 5, 0], times: ["19:00"], reelEvery: 3, defaultMode: "auto", prepLeadMin: 30, maxPerDay: 3,
  autopilot: false, autoApprove: false, horizonDays: 14,
};

const dir = () => path.join(process.cwd(), "storage", "content-studio");
const queueFile = () => path.join(dir(), "queue.json");
const settingsFile = () => path.join(dir(), "settings.json");
export const publishDir = (id: string) => path.join(dir(), "publish", id.replace(/[^a-zA-Z0-9-]/g, ""));

let lock: Promise<unknown> = Promise.resolve();
/** Runs `fn` after every earlier queue operation finished (read-modify-write safe). */
export function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = lock.then(fn, fn);
  lock = run.catch(() => undefined);
  return run;
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(file, "utf8")) as T; } catch { return fallback; }
}
async function writeJson(file: string, data: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2));
  await rename(tmp, file);
}

export const newPostId = () => `po-${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`;
export const newToken = () => crypto.randomBytes(18).toString("hex");

export const listPosts = async (): Promise<ScheduledPost[]> => (await readJson<ScheduledPost[]>(queueFile(), [])).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

/** Atomically transforms the whole queue. */
export const mutatePosts = <T>(fn: (posts: ScheduledPost[]) => T): Promise<T> =>
  withLock(async () => {
    const posts = await readJson<ScheduledPost[]>(queueFile(), []);
    const out = fn(posts);
    await writeJson(queueFile(), posts);
    return out;
  });

export const getPost = async (id: string) => (await listPosts()).find((p) => p.id === id);

export const patchPost = (id: string, patch: Partial<ScheduledPost>, note?: string) =>
  mutatePosts((posts) => {
    const p = posts.find((x) => x.id === id);
    if (!p) return undefined;
    Object.assign(p, patch);
    if (note) p.log = [...p.log, `${new Date().toISOString().slice(0, 16).replace("T", " ")} ${note}`].slice(-12);
    return { ...p };
  });

export async function loadSettings(): Promise<CsSettings> {
  return { ...DEFAULT_SETTINGS, ...(await readJson<Partial<CsSettings>>(settingsFile(), {})) };
}
export const saveSettings = (s: CsSettings) => withLock(async () => { await writeJson(settingsFile(), s); return s; });

/** Validates untrusted settings input. */
export function parseSettings(input: any, base: CsSettings): CsSettings | string {
  if (!input || typeof input !== "object") return "Pengaturan tidak valid";
  const HM = /^\d{2}:\d{2}$/;
  const times = Array.isArray(input.times) ? input.times.map(String).filter((t: string) => HM.test(t)) : base.times;
  const days = Array.isArray(input.days) ? input.days.map(Number).filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6) : base.days;
  if (!times.length) return "Isi minimal satu jam posting";
  if (!days.length) return "Pilih minimal satu hari posting";
  const num = (v: unknown, def: number, min: number, max: number) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Math.round(Number(v)))) : def);
  return {
    ...base,
    tzOffsetMin: num(input.tzOffsetMin, base.tzOffsetMin, -720, 840),
    days: [...new Set<number>(days)], times: [...new Set<string>(times)].sort().slice(0, 6),
    reelEvery: num(input.reelEvery, base.reelEvery, 0, 10),
    defaultMode: input.defaultMode === "manual" ? "manual" : "auto",
    prepLeadMin: num(input.prepLeadMin, base.prepLeadMin, 5, 720),
    maxPerDay: num(input.maxPerDay, base.maxPerDay, 1, 25),
    autopilot: !!input.autopilot, autoApprove: !!input.autoApprove,
    horizonDays: num(input.horizonDays, base.horizonDays, 3, 90),
  };
}

// ------------------------------------------------------------------ pure scheduling rules ----

/** Seconds-since-epoch helper kept separate so tests can pass fixed clocks. */
const t = (iso: string) => new Date(iso).getTime();

/** Scheduled posts whose media should be rendered now (due within the lead time, not waiting for a retry). */
export function duePrepare(posts: ScheduledPost[], now: Date, leadMin: number): ScheduledPost[] {
  return posts.filter((p) => p.status === "scheduled" && t(p.scheduledAt) - leadMin * 60_000 <= now.getTime() && (!p.nextTryAt || t(p.nextTryAt) <= now.getTime()));
}

/**
 * Auto posts that may be published now: rendered, due, not in a retry wait, and within the per-day cap.
 * `localDay` maps an ISO time to the local calendar day so the cap follows the configured time zone.
 */
export function duePublish(posts: ScheduledPost[], now: Date, maxPerDay: number, localDay: (iso: string) => string): ScheduledPost[] {
  const today = localDay(now.toISOString());
  let postedToday = posts.filter((p) => p.status === "posted" && p.postedAt && localDay(p.postedAt) === today).length;
  const ready = posts.filter((x) => x.status === "ready" && x.mode === "auto" && t(x.scheduledAt) <= now.getTime() && (!x.nextTryAt || t(x.nextTryAt) <= now.getTime()));
  const out: ScheduledPost[] = ready.filter((x) => x.force); // asked for by a person: the cap is a guard for automation, not for them
  for (const p of ready.filter((x) => !x.force)) {
    if (postedToday + out.length >= maxPerDay) break;
    out.push(p);
  }
  return out;
}

/** Retry back-off: 5 min, 20 min, then give up (the caller marks the post failed). */
export function retryDelayMs(attempts: number): number | null {
  return attempts === 1 ? 5 * 60_000 : attempts === 2 ? 20 * 60_000 : null;
}

export const localDayKey = (iso: string, tzOffsetMin: number) => new Date(t(iso) + tzOffsetMin * 60_000).toISOString().slice(0, 10);

/** A draft may be approved only when no revision is pending. */
export const approvable = (p: Pick<ScheduledPost, "status" | "revision">) => p.status === "draft" && !p.revision;

/**
 * Patch for a revision note from the review screen. Asking for a revision always pulls the post back to "draft", so nothing that
 * is still being discussed can go out; an empty note clears the request (the post stays a draft, approving is a separate step).
 */
export function revisionPatch(text: unknown, nowIso: string): Partial<ScheduledPost> {
  const t = typeof text === "string" ? text.trim().slice(0, 1000) : "";
  return t ? { revision: { text: t, at: nowIso }, status: "draft", attempts: 0, nextTryAt: undefined } : { revision: undefined };
}

/** How many posts went out today (local day) and whether the safety cap is used up. */
export function capStatus(posts: Pick<ScheduledPost, "status" | "postedAt">[], now: Date, maxPerDay: number, localDay: (iso: string) => string): { postedToday: number; reached: boolean } {
  const today = localDay(now.toISOString());
  const postedToday = posts.filter((p) => p.status === "posted" && p.postedAt && localDay(p.postedAt) === today).length;
  return { postedToday, reached: postedToday >= maxPerDay };
}
