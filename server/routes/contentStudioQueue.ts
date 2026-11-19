import { Router } from "express";
import { rm } from "node:fs/promises";
import path from "node:path";
import { FEATURES, PILLARS, featureById } from "../lib/contentStudio/features.js";
import { CAPTION_VARIANTS, captionFor, featureDeck } from "../lib/contentStudio/generator.js";
import { checkConnection, clearConnection, loadConnection, mask, saveConnection } from "../lib/contentStudio/instagram.js";
import { createPost, mediaBase, refillCalendar, tick } from "../lib/contentStudio/publisher.js";
import { listDecks, saveDeck } from "../lib/contentStudio/render.js";
import { getPost, listPosts, loadSettings, mutatePosts, parseSettings, patchPost, publishDir, saveSettings, type ScheduledPost } from "../lib/contentStudio/schedule.js";
import type { Deck } from "../lib/contentStudio/types.js";

// Superadmin → Konten Instagram: feature generator, posting calendar, autopilot and the Instagram connection.
// Mounted by contentStudio.ts (same auth as the rest of the studio).
export const contentQueueRouter = Router();

const cleanId = (v: unknown) => String(v ?? "").replace(/[^a-zA-Z0-9-]/g, "");

contentQueueRouter.get("/features", (_req, res) => res.json({ pillars: PILLARS, features: FEATURES }));

contentQueueRouter.get("/features/:id/captions", (req, res) => {
  const f = featureById(cleanId(req.params.id));
  if (!f) return res.status(404).json({ error: "Fitur tidak ditemukan" });
  res.json({ captions: Array.from({ length: CAPTION_VARIANTS }, (_, i) => captionFor(f, i)) });
});

// POST { featureIds, formats?, variant? } -> the generated decks, already saved so they show up in the studio.
contentQueueRouter.post("/generate", async (req, res) => {
  const ids: string[] = Array.isArray(req.body?.featureIds) ? req.body.featureIds.map(String).slice(0, 60) : [];
  const formats: ("carousel" | "reel")[] = (Array.isArray(req.body?.formats) ? req.body.formats : ["carousel"]).filter((f: unknown) => f === "carousel" || f === "reel");
  if (!ids.length || !formats.length) return res.status(400).json({ error: "Pilih fitur dan format" });
  const decks: Deck[] = [];
  for (const id of ids) {
    const f = featureById(id);
    if (!f) continue;
    for (const format of formats) decks.push(await saveDeck(featureDeck(f, format, Number(req.body?.variant) || 0)));
  }
  res.json(decks);
});

contentQueueRouter.get("/queue", async (_req, res) => {
  const [posts, settings, conn] = await Promise.all([listPosts(), loadSettings(), loadConnection()]);
  res.json({ posts, settings, connected: !!conn, mediaBase: mediaBase() });
});

contentQueueRouter.get("/settings", async (_req, res) => res.json(await loadSettings()));
contentQueueRouter.put("/settings", async (req, res) => {
  const next = parseSettings(req.body, await loadSettings());
  if (typeof next === "string") return res.status(400).json({ error: next });
  res.json(await saveSettings(next));
});

// POST { deckId, scheduledAt, mode?, status? } -> schedule an existing deck.
contentQueueRouter.post("/queue", async (req, res) => {
  const deck = (await listDecks()).find((d) => d.id === cleanId(req.body?.deckId));
  if (!deck) return res.status(404).json({ error: "Deck tidak ditemukan" });
  const at = new Date(String(req.body?.scheduledAt));
  if (Number.isNaN(at.getTime())) return res.status(400).json({ error: "Waktu posting tidak valid" });
  try {
    const s = await loadSettings();
    const mode = req.body?.mode === "manual" ? "manual" : req.body?.mode === "auto" ? "auto" : s.defaultMode;
    res.json(await createPost(deck, at.toISOString(), mode, req.body?.status === "draft" ? "draft" : "scheduled"));
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Gagal menjadwalkan" }); }
});

contentQueueRouter.post("/queue/approve", async (req, res) => {
  const ids = new Set<string>(Array.isArray(req.body?.ids) ? req.body.ids.map(cleanId) : []);
  const approved = await mutatePosts((posts) => { let c = 0; for (const p of posts) if (p.status === "draft" && (!ids.size || ids.has(p.id))) { p.status = "scheduled"; c++; } return c; });
  res.json({ approved });
});

contentQueueRouter.patch("/queue/:id", async (req, res) => {
  const cur = await getPost(cleanId(req.params.id));
  if (!cur) return res.status(404).json({ error: "Post tidak ditemukan" });
  if (["posting", "preparing"].includes(cur.status)) return res.status(409).json({ error: "Post sedang diproses, coba lagi sebentar" });
  if (cur.status === "posted") return res.status(409).json({ error: "Post sudah tayang" });
  const b = req.body ?? {};
  const patch: Partial<ScheduledPost> = {};
  if (b.scheduledAt !== undefined) {
    const at = new Date(String(b.scheduledAt));
    if (Number.isNaN(at.getTime())) return res.status(400).json({ error: "Waktu posting tidak valid" });
    patch.scheduledAt = at.toISOString();
    if (cur.status === "ready" || cur.status === "failed") { patch.status = "scheduled"; patch.attempts = 0; }
  }
  if (b.mode === "auto" || b.mode === "manual") patch.mode = b.mode;
  if (["draft", "scheduled", "skipped"].includes(b.status)) {
    patch.status = b.status;
    if (b.status === "scheduled") { patch.attempts = 0; patch.error = undefined; patch.nextTryAt = undefined; }
  }
  if (typeof b.caption === "string") patch.caption = b.caption.slice(0, 2200);
  if (Array.isArray(b.hashtags)) patch.hashtags = b.hashtags.map(String).slice(0, 30);
  if (b.carouselMedia === "image" || b.carouselMedia === "video") {
    patch.carouselMedia = b.carouselMedia;
    if (b.carouselMedia !== cur.carouselMedia && cur.status === "ready") patch.status = "scheduled"; // rendered media no longer matches
  }
  res.json(await patchPost(cur.id, patch, "diubah"));
});

contentQueueRouter.delete("/queue/:id", async (req, res) => {
  const id = cleanId(req.params.id);
  await mutatePosts((posts) => { const i = posts.findIndex((p) => p.id === id && p.status !== "posting"); if (i >= 0) posts.splice(i, 1); });
  await rm(publishDir(id), { recursive: true, force: true });
  res.json({ ok: true });
});

// "Post now": due immediately; the worker renders and publishes it right away.
contentQueueRouter.post("/queue/:id/post-now", async (req, res) => {
  const cur = await getPost(cleanId(req.params.id));
  if (!cur || ["posted", "posting", "preparing", "draft", "skipped"].includes(cur.status)) return res.status(409).json({ error: "Post tidak bisa dikirim sekarang (setujui draf dulu)" });
  const post = await patchPost(cur.id, { scheduledAt: new Date().toISOString(), attempts: 0, nextTryAt: undefined, error: undefined, status: cur.status === "ready" ? "ready" : "scheduled" }, "kirim sekarang");
  void tick();
  res.json(post);
});

contentQueueRouter.post("/queue/:id/retry", async (req, res) => {
  const cur = await getPost(cleanId(req.params.id));
  if (!cur || cur.status !== "failed") return res.status(409).json({ error: "Hanya post gagal yang bisa diulang" });
  res.json(await patchPost(cur.id, { status: "scheduled", attempts: 0, nextTryAt: undefined, error: undefined }, "diulang"));
});

contentQueueRouter.post("/queue/:id/mark-posted", async (req, res) => {
  const cur = await getPost(cleanId(req.params.id));
  if (!cur) return res.status(404).json({ error: "Post tidak ditemukan" });
  res.json(await patchPost(cur.id, { status: "posted", postedAt: new Date().toISOString(), permalink: typeof req.body?.permalink === "string" ? req.body.permalink.slice(0, 300) : cur.permalink, error: undefined }, "ditandai terposting manual"));
});

contentQueueRouter.get("/queue/:id/files/:name", async (req, res) => {
  const cur = await getPost(cleanId(req.params.id));
  const name = path.basename(String(req.params.name));
  if (!cur || ![...(cur.files ?? []), cur.coverFile].includes(name)) return res.status(404).json({ error: "File tidak ditemukan" });
  res.download(path.join(publishDir(cur.id), name));
});

// Autopilot: fill the calendar now (drafts, or scheduled when auto-approve is on).
contentQueueRouter.post("/autopilot/run", async (req, res) => {
  try { res.json(await refillCalendar({ weeks: Math.min(Math.max(Number(req.body?.weeks) || 2, 1), 12), force: true })); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Autopilot gagal" }); }
});

// ---- Instagram connection ----
contentQueueRouter.get("/ig/status", async (_req, res) => {
  const conn = await loadConnection();
  const env = !!(process.env.IG_USER_ID && process.env.IG_ACCESS_TOKEN);
  res.json({ connected: !!conn, source: conn ? (env ? "env" : "file") : null, userId: conn?.userId ?? null, token: conn ? mask(conn.token) : null, mediaBase: mediaBase() });
});

contentQueueRouter.post("/ig/connect", async (req, res) => {
  const userId = String(req.body?.userId ?? "").trim(), token = String(req.body?.token ?? "").trim();
  try {
    await saveConnection(userId, token);
    const who = await checkConnection((await loadConnection())!);
    res.json({ ok: true, username: who.username });
  } catch (e) {
    await clearConnection().catch(() => undefined); // do not keep a token that does not work
    res.status(400).json({ error: e instanceof Error ? e.message : "Gagal menyambungkan" });
  }
});
contentQueueRouter.delete("/ig/connect", async (_req, res) => { await clearConnection(); res.json({ ok: true }); });

// Tests the two things auto-post depends on: the token works, and Instagram can reach this server's public media URL.
contentQueueRouter.post("/ig/test", async (_req, res) => {
  const out: { account?: string; accountError?: string; urlOk: boolean; urlError?: string; mediaBase: string } = { urlOk: false, mediaBase: mediaBase() };
  const conn = await loadConnection();
  if (conn) { try { out.account = (await checkConnection(conn)).username; } catch (e) { out.accountError = e instanceof Error ? e.message : String(e); } }
  else out.accountError = "Belum tersambung ke Instagram";
  try {
    const r = await fetch(`${out.mediaBase}/api/public/cs-media/ping`, { signal: AbortSignal.timeout(8000) });
    out.urlOk = r.ok && ((await r.json()) as { ok?: boolean })?.ok === true;
    if (!out.urlOk) out.urlError = `Server publik menjawab HTTP ${r.status}`;
  } catch (e) { out.urlError = e instanceof Error ? e.message : String(e); }
  res.json(out);
});
