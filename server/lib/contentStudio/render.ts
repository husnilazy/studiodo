import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { resolveFfmpeg } from "../ffmpeg.js";
import { BUILTIN_DECKS } from "./decks.js";
import { buildReelDoc, buildSlideDoc, SLIDE_SETTLE_MS } from "./templates.js";
import { buildIconDoc, type FileKind } from "./appicon.js";
import { buildTriptychDoc, COVER_SEC, DURATION_SEC, geometry, sanitizeTriptych, TILE_H, TILE_W, type Seam, type TriptychOptions } from "./triptych.js";
import { FORMATS, type Deck } from "./types.js";

// Content Studio storage lives next to the other local files: storage/content-studio/{assets,jobs,decks.json}.
const root = () => path.join(process.cwd(), "storage", "content-studio");
const assetsDir = () => path.join(root(), "assets");
const jobsDir = () => path.join(root(), "jobs");
const decksFile = () => path.join(root(), "decks.json");

// ---- decks (built-ins + saved edits; an edit with the same id shadows the built-in) ----
async function readSaved(): Promise<Deck[]> {
  try {
    return JSON.parse(await readFile(decksFile(), "utf8")) as Deck[];
  } catch {
    return [];
  }
}

export async function listDecks(): Promise<Deck[]> {
  const saved = await readSaved();
  const byId = new Map(saved.map((d) => [d.id, d]));
  const out: Deck[] = BUILTIN_DECKS.map((b) => ({ ...(byId.get(b.id) ?? b), builtin: true }));
  for (const d of saved) if (!BUILTIN_DECKS.some((b) => b.id === d.id)) out.push({ ...d, builtin: false });
  return out;
}

export async function saveDeck(deck: Deck): Promise<Deck> {
  await mkdir(root(), { recursive: true });
  const saved = (await readSaved()).filter((d) => d.id !== deck.id);
  const next = { ...deck, builtin: undefined, updatedAt: new Date().toISOString() };
  saved.push(next);
  await writeFile(decksFile(), JSON.stringify(saved, null, 2));
  return next;
}

export async function deleteDeck(id: string): Promise<void> {
  const saved = (await readSaved()).filter((d) => d.id !== id);
  await mkdir(root(), { recursive: true });
  await writeFile(decksFile(), JSON.stringify(saved, null, 2));
}

// ---- uploaded assets ("asset:<file>" in a slide's images) ----
const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
const safeName = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);

export async function saveAsset(name: string, dataUrl: string): Promise<string> {
  const m = /^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/i.exec(dataUrl);
  if (!m) throw new Error("File harus gambar PNG/JPG/WebP/GIF");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 12 * 1024 * 1024) throw new Error("Gambar maksimal 12 MB");
  await mkdir(assetsDir(), { recursive: true });
  const file = `${Date.now().toString(36)}-${safeName(name || "gambar")}`.replace(/\.[a-z]+$/i, "") + "." + m[1].toLowerCase().replace("jpeg", "jpg");
  await writeFile(path.join(assetsDir(), file), buf);
  return file;
}

export async function listAssets(): Promise<{ name: string; size: number }[]> {
  try {
    const names = await readdir(assetsDir());
    return Promise.all(names.map(async (name) => ({ name, size: (await stat(path.join(assetsDir(), name))).size })));
  } catch {
    return [];
  }
}

export async function readAsset(name: string): Promise<{ buf: Buffer; mime: string } | null> {
  const file = path.join(assetsDir(), safeName(name));
  if (!file.startsWith(assetsDir()) || !existsSync(file)) return null;
  return { buf: await readFile(file), mime: MIME[file.split(".").pop()!.toLowerCase()] ?? "application/octet-stream" };
}

export async function deleteAsset(name: string): Promise<void> {
  const file = path.join(assetsDir(), safeName(name));
  if (file.startsWith(assetsDir())) await rm(file, { force: true });
}

/** Swaps "asset:<file>" references for inline data URLs so the page needs no network or auth. */
export async function inlineAssets(deck: Deck): Promise<Deck> {
  const slides = await Promise.all(
    deck.slides.map(async (s0) => {
      let s = s0;
      if (s.bgImage?.startsWith("asset:")) {
        const a = await readAsset(s.bgImage.slice(6));
        s = { ...s, bgImage: a ? `data:${a.mime};base64,${a.buf.toString("base64")}` : undefined };
      }
      if (!s.images?.length) return s;
      const images = await Promise.all(
        s.images.map(async (ref) => {
          if (!ref.startsWith("asset:")) return ref;
          const a = await readAsset(ref.slice(6));
          return a ? `data:${a.mime};base64,${a.buf.toString("base64")}` : "";
        }),
      );
      return { ...s, images: images.filter(Boolean) };
    }),
  );
  return { ...deck, slides };
}

export async function previewDoc(deck: Deck, index: number): Promise<string> {
  const d = await inlineAssets(deck);
  const html = d.format === "reel" ? buildReelDoc(d).html : buildSlideDoc(d, Math.min(Math.max(index, 0), d.slides.length - 1));
  return html.replace("<script>", "<script>window.__live=true;"); // preview plays live; renders pause + seek instead
}

// ---- Chrome ----
function findChrome(): string {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  ].filter(Boolean) as string[];
  const found = candidates.find((c) => existsSync(c));
  if (!found) throw new Error("Chrome/Edge tidak ditemukan di PC ini. Pasang Google Chrome, atau set CHROME_PATH di .env.");
  return found;
}

async function launch(): Promise<Browser> {
  await mkdir(path.join(root(), "chrome-profile"), { recursive: true });
  return puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    userDataDir: path.join(root(), "chrome-profile"),
    args: ["--hide-scrollbars", "--force-color-profile=srgb", "--disable-gpu-vsync", "--mute-audio"],
  });
}

export function renderEnvironment(): { chrome: string | null; ffmpeg: boolean } {
  let chrome: string | null = null;
  try { chrome = findChrome(); } catch { /* reported to the UI */ }
  return { chrome, ffmpeg: !!resolveFfmpeg() };
}

// ---- jobs (in memory; outputs on disk, pruned after a day) ----
export type Job = {
  id: string; deckId: string; mode: "png" | "mp4" | "mp4-slides" | "trio-png" | "trio-mp4" | "icon"; status: "running" | "done" | "error";
  progress: number; label: string; files: { name: string; size: number }[]; error?: string; startedAt: number;
};
const jobs = new Map<string, Job>();
export const getJob = (id: string) => jobs.get(id);
export const jobFilePath = (id: string, name: string) => {
  const file = path.join(jobsDir(), id.replace(/[^a-z0-9-]/gi, ""), safeName(name));
  return file.startsWith(jobsDir()) && existsSync(file) ? file : null;
};

async function pruneOldJobs() {
  try {
    for (const name of await readdir(jobsDir())) {
      const dir = path.join(jobsDir(), name);
      if (Date.now() - (await stat(dir)).mtimeMs > 24 * 3600 * 1000) { await rm(dir, { recursive: true, force: true }); jobs.delete(name); }
    }
  } catch { /* no jobs dir yet */ }
}

async function finish(job: Job, dir: string) {
  job.files = await Promise.all((await readdir(dir)).sort().map(async (name) => ({ name, size: (await stat(path.join(dir, name))).size })));
  job.status = "done"; job.progress = 1; job.label = "Selesai";
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "deck";

async function renderPng(job: Job, deck: Deck, dir: string) {
  const { width, height } = FORMATS[deck.format];
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    for (let i = 0; i < deck.slides.length; i++) {
      job.label = `Slide ${i + 1} / ${deck.slides.length}`;
      await page.setContent(buildSlideDoc(deck, i), { waitUntil: "load" });
      await page.waitForFunction("window.__ready === true", { timeout: 20000 });
      await page.evaluate(`window.__seek(${SLIDE_SETTLE_MS})`);
      await page.screenshot({ path: path.join(dir, deck.format === "highlight" ? `sorotan-${String(i + 1).padStart(2, "0")}-${slug(deck.slides[i].title)}.png` : `${slug(deck.title)}-${String(i + 1).padStart(2, "0")}.png`), type: "png" });
      job.progress = (i + 1) / deck.slides.length;
    }
  } finally {
    await browser.close();
  }
}

const FPS = 30;
const SLIDE_VIDEO_SEC = 5; // per-slide video: every slide animation settles within ~3.6 s, then a short hold

/** H.264 High, CRF 15, BT.709-tagged yuv420p: HD output that keeps STUDIODO's colours on phones. */
function startEncoder(out: string) {
  const ffmpeg = resolveFfmpeg();
  if (!ffmpeg) throw new Error("ffmpeg tidak ditemukan di server");
  const proc = spawn(ffmpeg, [
    "-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", "medium", "-crf", "15", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", String(FPS),
    "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos:out_color_matrix=bt709,format=yuv420p",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
    "-movflags", "+faststart", "-an", out,
  ], { stdio: ["pipe", "ignore", "pipe"] });
  let stderr = "";
  proc.stderr.on("data", (c) => { stderr = (stderr + c).slice(-1500); });
  const closed = new Promise<void>((resolve, reject) => {
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${stderr}`))));
  });
  closed.catch(() => undefined); // surfaced when awaited below; this only prevents an unhandled-rejection crash meanwhile
  proc.stdin.on("error", () => undefined);
  return { proc, closed };
}

/** Seeks the (paused) page frame by frame and pipes JPEG frames into ffmpeg. */
async function recordFrames(page: Page, out: string, frames: number, onFrame: (f: number) => void, cover?: { at: number; path: string }) {
  const enc = startEncoder(out);
  for (let f = 0; f < frames; f++) {
    await page.evaluate(`window.__seek(${((f / FPS) * 1000).toFixed(2)})`);
    const shot = (await page.screenshot({ type: "jpeg", quality: 96 })) as Uint8Array;
    if (!enc.proc.stdin.write(shot)) await new Promise<void>((r) => enc.proc.stdin.once("drain", () => r()));
    if (cover && f === cover.at) await writeFile(cover.path, shot);
    onFrame(f);
  }
  enc.proc.stdin.end();
  await enc.closed;
}

/** One continuous video: a native reel as is, or a carousel re-laid-out as a 9:16 reel (every slide becomes a scene). */
async function renderMp4(job: Job, deck: Deck, dir: string) {
  const native = deck.format === "reel";
  const reelDeck: Deck = native ? deck : { ...deck, format: "reel", slides: deck.slides.map((sl) => ({ ...sl, seconds: sl.seconds ?? 4.2 })) };
  const { width, height } = FORMATS.reel;
  const { html, durationSec } = buildReelDoc(reelDeck);
  const frames = Math.ceil(durationSec * FPS);
  const out = path.join(dir, `${slug(deck.title)}${native ? "" : "-reel"}.mp4`);
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load" });
    await page.waitForFunction("window.__ready === true", { timeout: 20000 });
    await recordFrames(page, out, frames, (f) => { job.progress = ((f + 1) / frames) * 0.97; job.label = `Frame ${f + 1} / ${frames}`; },
      { at: Math.min(frames - 1, Math.round(FPS * 2.2)), path: path.join(dir, `${slug(deck.title)}-cover.jpg`) });
    job.label = "Menyelesaikan video…";
  } finally {
    await browser.close();
  }
}

/** One short animated video per carousel slide (upload them as video slides in an Instagram carousel). */
async function renderMp4Slides(job: Job, deck: Deck, dir: string) {
  const { width, height } = FORMATS[deck.format];
  const per = Math.ceil(SLIDE_VIDEO_SEC * FPS);
  const total = per * deck.slides.length;
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    for (let i = 0; i < deck.slides.length; i++) {
      await page.setContent(buildSlideDoc(deck, i), { waitUntil: "load" });
      await page.waitForFunction("window.__ready === true", { timeout: 20000 });
      const out = path.join(dir, `${slug(deck.title)}-${String(i + 1).padStart(2, "0")}.mp4`);
      await recordFrames(page, out, per, (f) => { job.progress = ((i * per + f + 1) / total) * 0.98; job.label = `Slide ${i + 1} / ${deck.slides.length} · frame ${f + 1} / ${per}`; });
    }
    job.label = "Menyelesaikan video…";
  } finally {
    await browser.close();
  }
}

// ---- "Pembuka Feed": three seamless tiles rendered from one wide canvas ----
const TRIO_NAMES = ["feed-1-kiri-logo", "feed-2-tengah-coming-soon", "feed-3-kanan-all-in-one"];

/** One ffmpeg pass: the wide canvas is split and cropped into the three tile videos. */
function startTrioEncoder(outs: string[], pitch: number, canvasW: number) {
  const ffmpeg = resolveFfmpeg();
  if (!ffmpeg) throw new Error("ffmpeg tidak ditemukan di server");
  const crops = outs.map((_, i) => `[b${i}]crop=${TILE_W}:${TILE_H}:${i * pitch}:0[o${i}]`).join(";");
  const split = `[0:v]scale=${canvasW}:${TILE_H}:flags=lanczos:out_color_matrix=bt709,format=yuv420p,split=${outs.length}${outs.map((_, i) => `[b${i}]`).join("")}`;
  const args = ["-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", "-filter_complex", `${split};${crops}`];
  outs.forEach((out, i) => args.push(
    "-map", `[o${i}]`, "-c:v", "libx264", "-preset", "medium", "-crf", "15", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", String(FPS),
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-movflags", "+faststart", "-an", out));
  const proc = spawn(ffmpeg, args, { stdio: ["pipe", "ignore", "pipe"] });
  let stderr = "";
  proc.stderr.on("data", (c) => { stderr = (stderr + c).slice(-1500); });
  const closed = new Promise<void>((resolve, reject) => {
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${stderr}`))));
  });
  closed.catch(() => undefined);
  proc.stdin.on("error", () => undefined);
  return { proc, closed };
}

const trioNotes = (seam: Seam) => [
  "URUTAN UNGGAH (penting)",
  "Grid Instagram menampilkan postingan TERBARU di kiri atas. Supaya urutannya benar, unggah dari KANAN ke KIRI:",
  "  1. feed-3-kanan-all-in-one   (unggah PERTAMA)",
  "  2. feed-2-tengah-coming-soon",
  "  3. feed-1-kiri-logo          (unggah TERAKHIR, jadi paling kiri)",
  "",
  seam === "panorama"
    ? "MODE PANORAMA: ketiga PNG menyambung persis jika diletakkan berdampingan (tanpa tumpang-tindih). Catatan: grid profil Instagram memotong +-36 px kiri-kanan tiap postingan (3:4), jadi di grid sambungan bisa terlihat bergeser sedikit. Kalau ingin mulus di grid, render ulang dengan mode 'Grid 3:4'."
    : "MODE GRID 3:4: tiap tile bertumpang-tindih 72 px supaya bagian yang terlihat di grid Instagram (dipotong 36 px kiri-kanan) menyambung. Jika ketiga PNG diletakkan berdampingan akan terlihat tumpang-tindih; itu normal. Untuk PNG yang menyambung persis, pakai mode 'Panorama'.",
  "",
  "Untuk MP4: pilih cover dari file PNG dengan nama yang sama (Edit sampul > Tambah dari galeri), karena frame pertama video belum lengkap. Jangan memangkas sendiri.",
  "",
  "USULAN CAPTION",
  "Kiri (logo): STUDIODO. Platform photobooth all-in-one. Coming soon. Ikuti untuk kabar terbaru!",
  "Tengah: Coming soon. Kami sedang menyiapkan sesuatu untuk bisnis photobooth kamu.",
  "Kanan: All-in-One Photobooth App & Software: kiosk, pembayaran QRIS, kasir, dan galeri hasil dalam satu platform. studiodo.id",
].join("\n");

async function renderTriptych(job: Job, o: TriptychOptions, mode: "trio-png" | "trio-mp4", dir: string) {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    const { pitch, canvasW } = geometry(o.seam);
    await page.setViewport({ width: canvasW, height: TILE_H, deviceScaleFactor: 1 });
    await page.setContent(buildTriptychDoc(o), { waitUntil: "load" });
    await page.waitForFunction("window.__ready === true", { timeout: 20000 });

    // Stills (also the covers for the videos)
    job.label = "Membuat gambar tile…";
    await page.evaluate(`window.__seek(${COVER_SEC * 1000})`);
    for (let i = 0; i < 3; i++) {
      await page.screenshot({ path: path.join(dir, `${TRIO_NAMES[i]}.png`), clip: { x: i * pitch, y: 0, width: TILE_W, height: TILE_H } });
    }
    await page.screenshot({ path: path.join(dir, "panorama-lengkap.png") });
    await writeFile(path.join(dir, "URUTAN-UNGGAH.txt"), trioNotes(o.seam), "utf8");
    job.progress = mode === "trio-png" ? 0.99 : 0.05;
    if (mode === "trio-png") return;

    const frames = Math.ceil(DURATION_SEC * FPS);
    const enc = startTrioEncoder(TRIO_NAMES.map((n) => path.join(dir, `${n}.mp4`)), pitch, canvasW);
    for (let f = 0; f < frames; f++) {
      await page.evaluate(`window.__seek(${((f / FPS) * 1000).toFixed(2)})`);
      const shot = (await page.screenshot({ type: "jpeg", quality: 95 })) as Uint8Array;
      if (!enc.proc.stdin.write(shot)) await new Promise<void>((r) => enc.proc.stdin.once("drain", () => r()));
      job.progress = 0.05 + ((f + 1) / frames) * 0.93;
      job.label = `Frame ${f + 1} / ${frames}`;
    }
    enc.proc.stdin.end();
    job.label = "Menyelesaikan 3 video…";
    await enc.closed;
  } finally {
    await browser.close();
  }
}

export async function startTriptychRender(input: unknown, mode: "trio-png" | "trio-mp4"): Promise<Job> {
  if ([...jobs.values()].some((j) => j.status === "running")) throw new Error("Masih ada render yang berjalan, tunggu selesai dulu");
  await pruneOldJobs();
  const opts = sanitizeTriptych(input);
  const job: Job = { id: crypto.randomUUID(), deckId: "pembuka-feed", mode, status: "running", progress: 0, label: "Menyiapkan Chrome…", files: [], startedAt: Date.now() };
  jobs.set(job.id, job);
  const dir = path.join(jobsDir(), job.id);
  await mkdir(dir, { recursive: true });
  (async () => {
    try {
      await renderTriptych(job, opts, mode, dir);
      await finish(job, dir);
    } catch (e) {
      job.status = "error";
      job.error = e instanceof Error ? e.message : String(e);
      console.error("[content-studio] render pembuka feed gagal:", job.error);
    }
  })();
  return job;
}

// ---- STUDIODO app icon: transparent PNGs + profile pictures (dark / white) ----
async function renderIcons(job: Job, dir: string) {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 });
    const files: [FileKind, string][] = [
      ["logo-silver", "logo-studiodo-silver.png"], ["avatar-silver", "foto-profil-studiodo-silver.png"],
      ["icon-dark", "icon-studiodo-dark.png"], ["icon-white", "icon-studiodo-white.png"],
      ["avatar-dark", "foto-profil-studiodo-dark.png"], ["avatar-white", "foto-profil-studiodo-white.png"],
    ];
    for (let k = 0; k < files.length; k++) {
      const [kind, name] = files[k];
      job.label = name;
      await page.setContent(buildIconDoc(kind), { waitUntil: "load" });
      await page.waitForFunction("document.fonts.ready.then(() => true)", { timeout: 20000 });
      await page.screenshot({ path: path.join(dir, name), omitBackground: kind.startsWith("icon-") || kind === "logo-silver" });
      job.progress = (k + 1) / files.length;
    }
  } finally {
    await browser.close();
  }
}

export async function startIconRender(): Promise<Job> {
  if ([...jobs.values()].some((j) => j.status === "running")) throw new Error("Masih ada render yang berjalan, tunggu selesai dulu");
  await pruneOldJobs();
  const job: Job = { id: crypto.randomUUID(), deckId: "ikon-logo", mode: "icon", status: "running", progress: 0, label: "Menyiapkan Chrome…", files: [], startedAt: Date.now() };
  jobs.set(job.id, job);
  const dir = path.join(jobsDir(), job.id);
  await mkdir(dir, { recursive: true });
  (async () => {
    try { await renderIcons(job, dir); await finish(job, dir); }
    catch (e) { job.status = "error"; job.error = e instanceof Error ? e.message : String(e); console.error("[content-studio] render ikon gagal:", job.error); }
  })();
  return job;
}

export async function startRender(deckIn: Deck, mode: "png" | "mp4" | "mp4-slides"): Promise<Job> {
  if (mode !== "png" && deckIn.format === "highlight") throw new Error("Cover Sorotan hanya tersedia sebagai PNG");
  if (mode === "mp4-slides" && deckIn.format !== "carousel") throw new Error("MP4 per slide hanya untuk carousel");
  if (!deckIn.slides.length) throw new Error("Deck belum punya slide");
  if ([...jobs.values()].some((j) => j.status === "running")) throw new Error("Masih ada render yang berjalan, tunggu selesai dulu");
  await pruneOldJobs();
  const deck = await inlineAssets(deckIn);
  const job: Job = { id: crypto.randomUUID(), deckId: deck.id, mode, status: "running", progress: 0, label: "Menyiapkan Chrome…", files: [], startedAt: Date.now() };
  jobs.set(job.id, job);
  const dir = path.join(jobsDir(), job.id);
  await mkdir(dir, { recursive: true });
  (async () => {
    try {
      if (mode === "png") await renderPng(job, deck, dir);
      else if (mode === "mp4-slides") await renderMp4Slides(job, deck, dir);
      else await renderMp4(job, deck, dir);
      await finish(job, dir);
    } catch (e) {
      job.status = "error";
      job.error = e instanceof Error ? e.message : String(e);
      console.error("[content-studio] render gagal:", job.error);
    }
  })();
  return job;
}
