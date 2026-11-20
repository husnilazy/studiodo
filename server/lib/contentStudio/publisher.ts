import { rm } from "node:fs/promises";
import { appBaseUrl } from "../urls.js";
import { featureById } from "./features.js";
import { featureDeck, planAutopilot, localToIso, postingSlots, CAPTION_VARIANTS } from "./generator.js";
import { buildCaption, checkConnection, loadConnection, publishPost } from "./instagram.js";
import { listDecks, renderForPublish, saveDeck } from "./render.js";
import {
  duePrepare, duePublish, getPost, listPosts, loadSettings, localDayKey, mutatePosts, newPostId, newToken, patchPost, publishDir, retryDelayMs, saveSettings,
  type CsSettings, type PostMode, type ScheduledPost,
} from "./schedule.js";
import type { Deck } from "./types.js";

// The worker behind "Kalender": every minute it (1) renders posts that are about to be due, (2) publishes the auto ones
// through the Instagram API, (3) keeps the calendar filled when Autopilot is on. Manual posts stop at "ready": the media
// package is prepared and a person downloads + posts it, then marks it posted.

/** Public base URL Instagram downloads media from. CS_MEDIA_BASE_URL wins, then PUBLIC_BASE_URL, then the app URL. */
export const mediaBase = () => (process.env.CS_MEDIA_BASE_URL || process.env.PUBLIC_BASE_URL || appBaseUrl()).replace(/\/$/, "");
export const mediaUrl = (token: string, file: string) => `${mediaBase()}/api/public/cs-media/${token}/${encodeURIComponent(file)}`;

export function validateForPosting(deck: Deck): string | null {
  if (deck.format === "highlight") return "Cover Sorotan tidak bisa diposting sebagai feed";
  if (!deck.slides.length) return "Deck belum punya slide";
  if (deck.format === "carousel" && deck.slides.length > 10) return "Carousel Instagram maksimal 10 slide";
  return null;
}

export async function createPost(deck: Deck, scheduledAt: string, mode: PostMode, status: "draft" | "scheduled", extra: Partial<ScheduledPost> = {}): Promise<ScheduledPost> {
  const problem = validateForPosting(deck);
  if (problem) throw new Error(problem);
  const post: ScheduledPost = {
    id: newPostId(), deckId: deck.id, title: deck.title, format: deck.format === "reel" ? "reel" : "carousel", featureId: deck.featureId,
    scheduledAt, mode, status, caption: deck.caption, hashtags: deck.hashtags, carouselMedia: "image", token: newToken(),
    attempts: 0, createdAt: new Date().toISOString(), log: [], ...extra,
  };
  await mutatePosts((posts) => { posts.push(post); });
  return post;
}

// ------------------------------------------------------------------ worker steps ----

async function prepare(p: ScheduledPost): Promise<void> {
  await patchPost(p.id, { status: "preparing", error: undefined }, "render dimulai");
  try {
    const deck = (await listDecks()).find((d) => d.id === p.deckId);
    if (!deck) throw new Error("Deck tidak ditemukan (sudah dihapus?)");
    const problem = validateForPosting(deck);
    if (problem) throw new Error(problem);
    const out = await renderForPublish(deck, publishDir(p.id), p.carouselMedia);
    if (!out.files.length) throw new Error("Render tidak menghasilkan file");
    await patchPost(p.id, { status: "ready", mediaType: out.type, files: out.files, coverFile: out.cover, attempts: 0, nextTryAt: undefined }, `render selesai (${out.files.length} file)`);
  } catch (e) {
    const attempts = p.attempts + 1;
    const wait = retryDelayMs(attempts);
    const msg = e instanceof Error ? e.message : String(e);
    await patchPost(p.id, wait === null
      ? { status: "failed", attempts, error: msg }
      : { status: "scheduled", attempts, error: msg, nextTryAt: new Date(Date.now() + wait).toISOString() }, `render gagal: ${msg}`);
  }
}

async function publish(p: ScheduledPost): Promise<void> {
  const conn = await loadConnection();
  if (!conn) return; // stays "ready": the calendar tells the owner to connect Instagram or post by hand
  if (!p.files?.length || !p.mediaType) { await patchPost(p.id, { status: "scheduled", attempts: 0 }, "media hilang, render ulang"); return; }
  await patchPost(p.id, { status: "posting" }, "mengirim ke Instagram");
  try {
    const res = await publishPost(conn, {
      type: p.mediaType, urls: p.files.map((f) => mediaUrl(p.token, f)), coverUrl: p.coverFile ? mediaUrl(p.token, p.coverFile) : undefined,
      caption: buildCaption(p.caption, p.hashtags),
    });
    await patchPost(p.id, { status: "posted", igMediaId: res.id, permalink: res.permalink, postedAt: new Date().toISOString(), error: undefined, force: undefined }, "terposting");
  } catch (e) {
    const attempts = p.attempts + 1;
    const wait = retryDelayMs(attempts);
    const msg = e instanceof Error ? e.message : String(e);
    await patchPost(p.id, wait === null
      ? { status: "failed", attempts, error: msg }
      : { status: "ready", attempts, error: msg, nextTryAt: new Date(Date.now() + wait).toISOString() }, `gagal posting: ${msg}`);
  }
}

/** Autopilot: queue more posts when the calendar runs shorter than the configured horizon. Returns how many were added. */
export async function refillCalendar(opts: { weeks?: number; force?: boolean } = {}): Promise<ScheduledPost[]> {
  const s = await loadSettings();
  const posts = await listPosts();
  const live = posts.filter((p) => p.status !== "skipped");
  const horizonEnd = Date.now() + s.horizonDays * 86_400_000;
  const lastAt = live.reduce((m, p) => Math.max(m, new Date(p.scheduledAt).getTime()), 0);
  if (!opts.force && lastAt >= horizonEnd) return [];
  const localNow = new Date(Date.now() + s.tzOffsetMin * 60_000);
  const after = new Date(Math.max(lastAt, Date.now()) + s.tzOffsetMin * 60_000 + 86_400_000);
  const startDate = (opts.force && !lastAt ? localNow : after).toISOString().slice(0, 10);
  const slots = planAutopilot({
    startDate, weeks: opts.weeks ?? Math.ceil(s.horizonDays / 7), days: s.days, times: s.times, reelEvery: s.reelEvery, tzOffsetMin: s.tzOffsetMin,
    used: live.filter((p) => p.featureId).map((p) => ({ featureId: p.featureId!, format: p.format })),
  });
  const created: ScheduledPost[] = [];
  for (const [i, slot] of slots.entries()) {
    const f = featureById(slot.featureId);
    if (!f) continue;
    const deck = featureDeck(f, slot.format, (live.length + i) % CAPTION_VARIANTS);
    await saveDeck(deck);
    created.push(await createPost(deck, slot.scheduledAt, s.defaultMode, s.autoApprove ? "scheduled" : "draft"));
  }
  await saveSettings({ ...s, lastRefillAt: new Date().toISOString() });
  return created;
}

let ticking = false;
/** One pass of the worker. Safe to call concurrently (extra calls return immediately). */
export async function tick(now = new Date()): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const s: CsSettings = await loadSettings();
    let posts = await listPosts();
    for (const p of duePrepare(posts, now, s.prepLeadMin)) await prepare(p);
    posts = await listPosts();
    for (const p of duePublish(posts, now, s.maxPerDay, (iso) => localDayKey(iso, s.tzOffsetMin))) await publish(p);
    // Free disk: media of posts finished more than 3 days ago.
    for (const p of (await listPosts()).filter((x) => (x.status === "posted" || x.status === "failed" || x.status === "skipped") && x.files?.length)) {
      const done = new Date(p.postedAt ?? p.scheduledAt).getTime();
      if (now.getTime() - done > 3 * 86_400_000) { await rm(publishDir(p.id), { recursive: true, force: true }); await patchPost(p.id, { files: [], coverFile: undefined }); }
    }
    if (s.autopilot && now.getTime() - new Date(s.lastRefillAt ?? 0).getTime() > 6 * 3_600_000) await refillCalendar();
  } catch (e) {
    console.error("[content-studio] penjadwal error:", e instanceof Error ? e.message : e);
  } finally {
    ticking = false;
  }
}

/** After a crash/restart: a render that never finished is retried; a post that was mid-upload is NOT retried (it may already be live). */
export async function recoverStuck(): Promise<void> {
  await mutatePosts((posts) => {
    for (const p of posts) {
      if (p.status === "preparing") { p.status = "scheduled"; p.log = [...p.log, "server restart saat render, diulang"].slice(-12); }
      if (p.status === "posting") { p.status = "failed"; p.error = "Server restart saat mengirim ke Instagram. Cek akun Instagram sebelum mencoba lagi agar tidak dobel."; }
    }
  });
}

export function startContentPublisher() {
  void recoverStuck().catch(() => undefined);
  setTimeout(() => void tick(), 45_000);
  setInterval(() => void tick(), 60_000);
}

export { checkConnection, getPost, localToIso, postingSlots };
