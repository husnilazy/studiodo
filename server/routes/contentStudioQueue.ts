import { Router } from "express";
import { rm } from "node:fs/promises";
import path from "node:path";
import { FEATURES, PILLARS, featureById } from "../lib/contentStudio/features.js";
import { CAPTION_VARIANTS, captionFor, featureDeck, withPhotos } from "../lib/contentStudio/generator.js";
import { checkConnection, clearConnection, discoverAccounts, loadConnection, mask, saveConnection } from "../lib/contentStudio/instagram.js";
import { previewFile, previewState, startPreview } from "../lib/contentStudio/previews.js";
import { createPost, heldKeys, mediaBase, reconcilePosted, refillCalendar, tick } from "../lib/contentStudio/publisher.js";
import { listDecks, saveDeck } from "../lib/contentStudio/render.js";
import { MONTH_PROGRAM, approvable, getPost, listPosts, loadSettings, mutatePosts, parseSettings, patchPost, publishDir, revisionPatch, saveSettings, type ScheduledPost } from "../lib/contentStudio/schedule.js";
import { STORY_REELS, storyReelById, storyReelDeck, storyReelDeckId } from "../lib/contentStudio/storyReels.js";
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
  const assetNames = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80)).filter(Boolean).slice(0, 8) : []);
  const photos = assetNames(req.body?.photos);
  const strips = assetNames(req.body?.strips);
  const decks: Deck[] = [];
  for (const id of ids) {
    const f = featureById(id);
    if (!f) continue;
    for (const format of formats) {
      const base = featureDeck(f, format, Number(req.body?.variant) || 0);
      decks.push(await saveDeck(photos.length || strips.length ? withPhotos(base, photos, strips) : base));
    }
  }
  res.json(decks);
});

// Story reels: hand-timed reels with voice over. GET lists them (+ whether already queued); POST /:id/queue puts one in the calendar as a draft.
contentQueueRouter.get("/story-reels", async (_req, res) => {
  const posts = await listPosts();
  res.json(STORY_REELS.map((r) => ({
    id: r.id, title: r.title, hook: r.hook, featureId: r.featureId, cta: r.cta, music: r.music, caption: r.caption, needsCheck: r.needsCheck ?? null,
    queued: posts.filter((p) => p.deckId === storyReelDeckId(r.id) && p.status !== "skipped").map((p) => ({ id: p.id, status: p.status, scheduledAt: p.scheduledAt })),
  })));
});
contentQueueRouter.post("/story-reels/:id/queue", async (req, res) => {
  const r = storyReelById(cleanId(req.params.id));
  if (!r) return res.status(404).json({ error: "Reel cerita tidak ditemukan" });
  const at = new Date(String(req.body?.scheduledAt ?? new Date(Date.now() + 86_400_000).toISOString()));
  if (Number.isNaN(at.getTime())) return res.status(400).json({ error: "Waktu posting tidak valid" });
  try {
    const deck = storyReelDeck(r);
    await saveDeck(deck);
    const s = await loadSettings();
    res.json(await createPost(deck, at.toISOString(), s.defaultMode, "draft"));
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Gagal mengantrekan" }); }
});

contentQueueRouter.get("/queue", async (_req, res) => {
  const [posts, settings, conn] = await Promise.all([listPosts(), loadSettings(), loadConnection()]);
  const h = heldKeys(settings.checkedKeys ?? []);
  const held = [
    ...h.features.map((id) => ({ key: `f:${id}`, label: featureById(id)?.name ?? id, note: featureById(id)?.check ?? "" })),
    ...h.reels.map((id) => ({ key: `r:${id}`, label: `🎬 ${storyReelById(id)?.title ?? id}`, note: storyReelById(id)?.needsCheck ?? "" })),
  ];
  res.json({ posts, settings, connected: !!conn, mediaBase: mediaBase(), held });
});

// Video preview of a reel (voice-over, music and effects as in the real post). POST starts a render on the PC and returns at once;
// GET /video-preview/:key is polled until it is "ready", then GET /video-preview/:key/file streams the mp4 (Range supported).
contentQueueRouter.post("/video-preview", async (req, res) => {
  try { res.json(await startPreview({ storyReelId: typeof req.body?.storyReelId === "string" ? req.body.storyReelId : undefined, deckId: typeof req.body?.deckId === "string" ? req.body.deckId : undefined }, req.body?.force === true)); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Pratinjau gagal dimulai" }); }
});
contentQueueRouter.get("/video-preview/:key", (req, res) => res.json(previewState(String(req.params.key))));
contentQueueRouter.get("/video-preview/:key/file", (req, res) => {
  const f = previewFile(String(req.params.key));
  if (!f) return res.status(404).json({ error: "Pratinjau belum siap" });
  res.setHeader("Content-Type", "video/mp4");
  res.sendFile(f, { dotfiles: "allow" }, (err) => { if (err && !res.headersSent) res.status(404).end(); });
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
  const approved = await mutatePosts((posts) => { let c = 0; for (const p of posts) if (approvable(p) && (!ids.size || ids.has(p.id))) { p.status = "scheduled"; c++; } return c; });
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
    patch.force = undefined; // a new time means it follows the normal rules again
    if (cur.status === "ready" || cur.status === "failed") { patch.status = "scheduled"; patch.attempts = 0; }
  }
  if (b.mode === "auto" || b.mode === "manual") patch.mode = b.mode;
  if (["draft", "scheduled", "skipped"].includes(b.status)) {
    patch.status = b.status;
    if (b.status === "scheduled") { patch.attempts = 0; patch.error = undefined; patch.nextTryAt = undefined; }
  }
  if (b.revision !== undefined) Object.assign(patch, revisionPatch(b.revision, new Date().toISOString()));
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
  const post = await patchPost(cur.id, { scheduledAt: new Date().toISOString(), attempts: 0, nextTryAt: undefined, error: undefined, force: true, status: cur.status === "ready" ? "ready" : "scheduled" }, "kirim sekarang");
  void tick();
  res.json(post);
});

contentQueueRouter.post("/queue/:id/retry", async (req, res) => {
  const cur = await getPost(cleanId(req.params.id));
  if (!cur || cur.status !== "failed") return res.status(409).json({ error: "Hanya post gagal yang bisa diulang" });
  res.json(await patchPost(cur.id, { status: "scheduled", attempts: 0, nextTryAt: undefined, error: undefined }, "diulang"));
});

// Ask Instagram whether the posts we marked "posted" are really there (the worker also does this every 20 minutes).
contentQueueRouter.post("/queue/reconcile", async (_req, res) => {
  try { res.json(await reconcilePosted({ all: true })); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Pengecekan gagal" }); }
});

// A post that Instagram no longer has goes back to the queue (due now) and is rendered + published again.
contentQueueRouter.post("/queue/:id/repost", async (req, res) => {
  const cur = await getPost(cleanId(req.params.id));
  if (!cur || cur.status !== "posted" || !cur.igGone) return res.status(409).json({ error: "Hanya post yang hilang dari Instagram yang bisa diposting ulang" });
  const post = await patchPost(cur.id, { status: "scheduled", scheduledAt: new Date().toISOString(), force: true, attempts: 0, nextTryAt: undefined, error: undefined, igGone: undefined, igCheckedAt: undefined, igMediaId: undefined, permalink: undefined, postedAt: undefined, files: [], coverFile: undefined, mediaType: undefined }, "diposting ulang (hilang dari Instagram)");
  void tick();
  res.json(post);
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

// "Program 1 bulan": 3 posts a day (09:00 reel, 14:00 carousel, 18:30 reel), published automatically until the trial ends.
// replaceFuture=true skips the autopilot posts that are still waiting (draft/scheduled with a feature) so the new rhythm starts clean.
contentQueueRouter.post("/autopilot/month", async (req, res) => {
  try {
    const base = await loadSettings();
    const next = { ...base, ...MONTH_PROGRAM, checkedKeys: [...new Set([...(base.checkedKeys ?? []), "f:kamera-sdk", "r:kamera"])], autopilotUntil: new Date(Date.now() + MONTH_PROGRAM.horizonDays * 86_400_000).toISOString() };
    await saveSettings(next);
    let skipped = 0;
    if (req.body?.replaceFuture) {
      skipped = await mutatePosts((posts) => {
        let n = 0;
        for (const p of posts) if ((p.status === "draft" || p.status === "scheduled") && p.featureId && new Date(p.scheduledAt).getTime() > Date.now()) { p.status = "skipped"; p.log = [...p.log, "diganti Program 1 bulan"].slice(-12); n++; }
        return n;
      });
    }
    const created = await refillCalendar({ weeks: 5, force: true, exactHorizon: true, fromToday: true });
    const held = heldKeys(next.checkedKeys);
    res.json({
      settings: next, skipped, created: created.length,
      reels: created.filter((p) => p.format === "reel").length, carousels: created.filter((p) => p.format === "carousel").length,
      first: created[0]?.scheduledAt, last: created[created.length - 1]?.scheduledAt, held,
    });
  } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "Program 1 bulan gagal" }); }
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
// POST { token, igUserId?, appId?, appSecret? } -> { ok, username } | { choose: [...] }. The token is a short-lived user token from the Graph API
// Explorer; the server exchanges it, finds the Instagram account and stores the non-expiring page token. App id/secret come from the
// request (not stored) or META_APP_ID / META_APP_SECRET in .env.
contentQueueRouter.post("/ig/connect-token", async (req, res) => {
  const shortToken = String(req.body?.token ?? "").trim();
  const appId = String(req.body?.appId ?? process.env.META_APP_ID ?? "").trim();
  const appSecret = String(req.body?.appSecret ?? process.env.META_APP_SECRET ?? "").trim();
  if (shortToken.length < 20) return res.status(400).json({ error: "Tempel token dari Graph API Explorer" });
  if (!/^\d{5,25}$/.test(appId) || appSecret.length < 16) return res.status(400).json({ error: "ID aplikasi (angka) dan App Secret diperlukan. Keduanya ada di Meta for Developers → Pengaturan aplikasi → Dasar. Tidak disimpan." });
  try {
    const found = await discoverAccounts(shortToken, { id: appId, secret: appSecret });
    if (!found.length) return res.status(400).json({ error: "Tidak ada akun Instagram profesional yang tertaut ke Halaman Facebook di token ini. Pastikan izin pages_show_list sudah dicentang saat membuat token dan akun Instagram tertaut ke sebuah Halaman." });
    const wanted = String(req.body?.igUserId ?? "");
    const pick = wanted ? found.find((c) => c.igUserId === wanted) : found.length === 1 ? found[0] : undefined;
    if (!pick) return res.json({ choose: found.map(({ igUserId, username, pageName }) => ({ igUserId, username, pageName })) });
    await saveConnection(pick.igUserId, pick.pageToken);
    const who = await checkConnection((await loadConnection())!);
    res.json({ ok: true, username: who.username || pick.username });
  } catch (e) {
    await clearConnection().catch(() => undefined);
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
