import path from "node:path";
import { buildMusic, buildSfx, mixAudio } from "../server/lib/contentStudio/sfx.js";
const dir = path.resolve("storage/content-studio/hero");
buildMusic(39.4, path.join(dir, "music.wav"));
mixAudio({ vo: path.join(dir, "vo-siti-v4-take1.mp3"), sfx: path.join(dir, "sfx.wav"), music: path.join(dir, "music.wav"), duration: 39.4, out: path.join(dir, "mix.wav") });
void buildSfx;
console.log("mixed");
