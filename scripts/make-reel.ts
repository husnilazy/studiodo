// Usage: tsx scripts/make-reel.ts <wifi> [--stills=1.5,4,8] [--no-vo]   builds sfx + music, mixes with the VO (if present) and renders the MP4.
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { renderHeroReel } from "../server/lib/contentStudio/render.js";
import { storyReelById } from "../server/lib/contentStudio/storyReels.js";
import { buildMusic, buildSfx, mixAudio, type MusicStyle, type SfxEvent } from "../server/lib/contentStudio/sfx.js";

const name = process.argv[2] ?? "wifi";
const stillsArg = process.argv.find((a) => a.startsWith("--stills="));
const entry = storyReelById(name);
if (!entry) throw new Error(`reel tidak dikenal: ${name}`);
const mod = (await entry.load()) as { buildReelDoc: () => { html: string; durationSec: number }; SFX: SfxEvent[]; DURATION: number; VO_FILE: string; MUSIC?: MusicStyle };
const dir = path.resolve("storage/content-studio", `reel-${name}`);
await mkdir(dir, { recursive: true });
const assetVo = path.resolve("server/assets/story-reels", `${name}.mp3`);
const vo = existsSync(assetVo) ? assetVo : path.join(dir, mod.VO_FILE);
let audio: string | undefined;
if (!stillsArg) {
  buildSfx(mod.SFX, mod.DURATION, path.join(dir, "sfx.wav"));
  buildMusic(mod.DURATION, path.join(dir, "music.wav"), (mod as { MUSIC?: MusicStyle }).MUSIC ?? "house");
  if (existsSync(vo)) { audio = path.join(dir, "mix.wav"); mixAudio({ vo, sfx: path.join(dir, "sfx.wav"), music: path.join(dir, "music.wav"), duration: mod.DURATION, out: audio }); }
  else console.log("VO belum ada: render tanpa suara VO (sfx + musik saja)");
  if (!audio) { audio = path.join(dir, "bed.wav"); mixAudio({ vo: path.join(dir, "sfx.wav"), sfx: path.join(dir, "sfx.wav"), music: path.join(dir, "music.wav"), duration: mod.DURATION, out: audio }); }
}
process.env.HERO_STILLS_ONLY = stillsArg ? "1" : "";
await renderHeroReel(path.join(dir, `reel-${name}.mp4`), { audio, builder: mod.buildReelDoc, stills: stillsArg ? { dir: path.join(dir, "stills"), at: stillsArg.slice(9).split(",").map(Number) } : undefined });
console.log("done", dir);
