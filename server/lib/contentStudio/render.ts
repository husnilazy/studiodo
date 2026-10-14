import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import puppeteer, { type Browser } from "puppeteer-core";
import { resolveFfmpeg } from "../ffmpeg.js";
import { BUILTIN_DECKS } from "./decks.js";
import { buildReelDoc, buildSlideDoc, SLIDE_SETTLE_MS } from "./templates.js";
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
    deck.slides.map(async (s) => {
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
  id: string; deckId: string; mode: "png" | "mp4"; status: "running" | "done" | "error";
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
      await page.screenshot({ path: path.join(dir, `${slug(deck.title)}-${String(i + 1).padStart(2, "0")}.png`), type: "png" });
      job.progress = (i + 1) / deck.slides.length;
    }
  } finally {
    await browser.close();
  }
}

const FPS = 30;
async function renderMp4(job: Job, deck: Deck, dir: string) {
  const ffmpeg = resolveFfmpeg();
  if (!ffmpeg) throw new Error("ffmpeg tidak ditemukan di server");
  const { width, height } = FORMATS.reel;
  const { html, durationSec } = buildReelDoc(deck);
  const frames = Math.ceil(durationSec * FPS);
  const out = path.join(dir, `${slug(deck.title)}.mp4`);
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height: FORMATS.reel.height, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load" });
    await page.waitForFunction("window.__ready === true", { timeout: 20000 });

    const proc = spawn(ffmpeg, [
      "-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
      "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", "-r", String(FPS),
      "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-movflags", "+faststart", "-an", out,
    ], { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (c) => { stderr = (stderr + c).slice(-1500); });
    const closed = new Promise<void>((resolve, reject) => {
      proc.on("error", reject);
      proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${stderr}`))));
    });
    proc.stdin.on("error", () => undefined); // surfaced through `closed`

    for (let f = 0; f < frames; f++) {
      await page.evaluate(`window.__seek(${((f / FPS) * 1000).toFixed(2)})`);
      const shot = (await page.screenshot({ type: "jpeg", quality: 92 })) as Uint8Array;
      if (!proc.stdin.write(shot)) await new Promise<void>((r) => proc.stdin.once("drain", () => r()));
      if (f === Math.min(frames - 1, Math.round(FPS * 2.2))) await writeFile(path.join(dir, `${slug(deck.title)}-cover.jpg`), shot);
      job.progress = (f + 1) / frames * 0.97;
      job.label = `Frame ${f + 1} / ${frames}`;
    }
    proc.stdin.end();
    job.label = "Menggabungkan video…";
    await closed;
  } finally {
    await browser.close();
  }
}

export async function startRender(deckIn: Deck, mode: "png" | "mp4"): Promise<Job> {
  if (mode === "mp4" && deckIn.format !== "reel") throw new Error("MP4 hanya untuk deck format Reel");
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
