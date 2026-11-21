import path from "node:path";
import { renderHeroReel } from "../server/lib/contentStudio/render.js";
const dir = path.resolve("storage/content-studio/hero");
const stills = process.env.HERO_STILLS_ONLY ? { dir: path.join(dir, "stills"), at: (process.env.HERO_AT ?? "1.5,3.5,5.5,8,10,10.6,13,15.5,17,19.5,20.8,22,24,27,29.5,32,33.5,36,38").split(",").map(Number) } : undefined;
await renderHeroReel(path.join(dir, "hero-booth-tanpa-kasir.mp4"), { audio: path.join(dir, "mix.wav"), stills });
console.log("done");
