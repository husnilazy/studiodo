import { existsSync, statSync } from "node:fs";
import { readdir, rm, mkdir } from "node:fs/promises";
import path from "node:path";
import { listDecks, renderForPublish } from "./render.js";
import { renderStoryReelForPublish, storyReelById, storyReelDeckId } from "./storyReels.js";

// "Pratinjau": watch a reel (or flip a carousel) before it goes out. Reels are rendered on demand on the PC (the same pipeline and
// the same audio mix as the real post, so what you watch is what Instagram gets) into storage/content-studio/previews/<key>/ and
// kept for a day, so the second viewing is instant. One render at a time: Chrome + ffmpeg are heavy and a second Chrome on the same
// profile fails, so previews and the publisher's own renders wait for each other through `withRenderLock`.

export type PreviewState = { key: string; status: "none" | "rendering" | "ready" | "failed"; error?: string; file?: string; startedAt?: number };

const root = () => path.join(process.cwd(), "storage", "content-studio", "previews");
const clean = (k: string) => k.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 80);
export const previewDir = (key: string) => path.join(root(), clean(key));
const DAY = 86_400_000;

// One render at a time across previews and the publisher (a simple promise chain).
let gate: Promise<unknown> = Promise.resolve();
export function withRenderLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = gate.then(fn, fn);
  gate = run.catch(() => undefined);
  return run;
}

const states = new Map<string, PreviewState>();

function cachedFile(key: string): string | undefined {
  const f = path.join(previewDir(key), "reel.mp4");
  if (!existsSync(f)) return undefined;
  return Date.now() - statSync(f).mtimeMs < DAY ? f : undefined;
}

export function previewState(keyIn: string): PreviewState {
  const key = clean(keyIn);
  const s = states.get(key);
  if (s?.status === "rendering") return s;
  if (cachedFile(key)) return { key, status: "ready", file: "reel.mp4" };
  return s ?? { key, status: "none" };
}

export function previewFile(keyIn: string): string | undefined { return cachedFile(clean(keyIn)); }

async function sweepOld() {
  try {
    for (const d of await readdir(root())) {
      const f = path.join(root(), d, "reel.mp4");
      if (!existsSync(f) || Date.now() - statSync(f).mtimeMs > 2 * DAY) await rm(path.join(root(), d), { recursive: true, force: true });
    }
  } catch { /* nothing to sweep yet */ }
}

/**
 * Starts rendering a preview and returns at once (the client polls previewState). `target` is a story reel id (voiced reel) or the
 * id of a reel deck. Throws when the target is not a reel or does not exist.
 */
export async function startPreview(target: { storyReelId?: string; deckId?: string }, force = false): Promise<PreviewState> {
  let key: string;
  let job: (dir: string) => Promise<unknown>;
  const storyId = target.storyReelId ?? (target.deckId?.startsWith("story-") ? target.deckId.slice(6) : undefined);
  if (storyId) {
    if (!storyReelById(storyId)) throw new Error("Reel cerita tidak dikenal");
    key = storyReelDeckId(storyId);
    job = (dir) => renderStoryReelForPublish(storyId, dir);
  } else {
    const deck = (await listDecks()).find((d) => d.id === target.deckId);
    if (!deck) throw new Error("Deck tidak ditemukan");
    if (deck.format !== "reel") throw new Error("Pratinjau video hanya untuk reel. Carousel dilihat per slide.");
    key = clean(deck.id);
    job = (dir) => renderForPublish(deck, dir, "image");
  }
  const cur = states.get(key);
  if (cur?.status === "rendering") return cur;
  if (!force && cachedFile(key)) return { key, status: "ready", file: "reel.mp4" };
  const state: PreviewState = { key, status: "rendering", startedAt: Date.now() };
  states.set(key, state);
  void sweepOld();
  void withRenderLock(async () => {
    const dir = previewDir(key);
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    await job(dir);
    // a story reel writes reel.mp4; a normal reel deck writes <slug>.mp4: normalise the name so the player has one URL
    const mp4 = (await readdir(dir)).find((n) => n.endsWith(".mp4"));
    if (!mp4) throw new Error("Render tidak menghasilkan video");
    if (mp4 !== "reel.mp4") { const { rename } = await import("node:fs/promises"); await rename(path.join(dir, mp4), path.join(dir, "reel.mp4")); }
  }).then(
    () => { states.set(key, { key, status: "ready", file: "reel.mp4" }); },
    (e) => { states.set(key, { key, status: "failed", error: e instanceof Error ? e.message : String(e) }); },
  );
  return state;
}
