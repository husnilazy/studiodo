import path from "node:path";
import { buildMusic, type MusicStyle } from "../server/lib/contentStudio/sfx.js";
for (const st of ["house", "lofi", "synthwave", "techno", "chill"] as MusicStyle[]) buildMusic(8, path.resolve("storage/content-studio", `music-${st}.wav`), st);
console.log("ok");
