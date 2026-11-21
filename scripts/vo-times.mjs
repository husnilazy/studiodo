// Usage: node node_modules/tsx/dist/cli.mjs scripts/vo-times.mjs <id> [sentences]   (tsx, because it reads the script text from reelScripts.ts)
// Measures server/assets/story-reels/<id>.mp3 and writes <id>.json = { starts: [...sentence start times], duration }.
// Sentence boundaries = the (sentences-1) longest pauses in the voice over, so write the script with one clear pause between sentences.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SCRIPTS } from "../server/lib/contentStudio/reelScripts.ts";

const [id, nArg] = process.argv.slice(2);
const script = SCRIPTS.find((x) => x.id === id);
const n = Number(nArg) || script?.sentences.length;
if (!id || !n) throw new Error("usage: tsx scripts/vo-times.mjs <id> [sentences]");
const ffmpeg = path.resolve("node_modules/ffmpeg-static/ffmpeg.exe");
const mp3 = path.resolve("server/assets/story-reels", `${id}.mp3`);
const r = spawnSync(ffmpeg, ["-i", mp3, "-af", "silencedetect=noise=-33dB:d=0.12", "-f", "null", "-"], { encoding: "utf8" });
const log = r.stderr;
const dur = (() => { const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(log); return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0; })();
const gaps = [];
let start = null;
for (const line of log.split("\n")) {
  const a = /silence_start: ([\d.]+)/.exec(line); if (a) start = Number(a[1]);
  const b = /silence_end: ([\d.]+) \| silence_duration: ([\d.]+)/.exec(line);
  if (b) { gaps.push({ s: start ?? 0, e: Number(b[1]), d: Number(b[2]) }); start = null; }
}
const lead = gaps.find((x) => x.s < 0.05);
// Boundary i = the pause nearest to where sentence i should end, judging by the share of characters spoken so far (the largest-pause rule alone breaks on "..." and [sighs]).
const cand = gaps.filter((x) => x !== lead && x.e < dur - 0.3 && x.d >= 0.15);
const speechStart = lead ? lead.e : 0.05;
const weights = (script?.sentences ?? Array.from({ length: n }, () => "x".repeat(40))).map((x) => x.replace(/\[[^\]]*\]/g, "").length + 8);
const total = weights.reduce((p, q) => p + q, 0);
// DP over all candidate pauses: choose n-1 increasing boundaries so each sentence's length is closest to its share of the characters, favouring longer pauses.
const E = dur - 0.3, k = (E - speechStart) / total;
const pts = [{ e: speechStart, d: 0 }, ...cand];
const INF = 1e9;
const best = Array.from({ length: n }, () => pts.map(() => ({ c: INF, p: -1 })));
pts.forEach((pt, j) => { if (j > 0) best[0][j] = { c: (pt.e - speechStart - weights[0] * k) ** 2 - pt.d * 0.6, p: 0 }; });
for (let i = 1; i < n - 1; i++) for (let j = 1; j < pts.length; j++) for (let q = 1; q < j; q++) {
  if (best[i - 1][q].c >= INF || pts[j].e - pts[q].e < 0.9) continue;
  const c = best[i - 1][q].c + (pts[j].e - pts[q].e - weights[i] * k) ** 2 - pts[j].d * 0.6;
  if (c < best[i][j].c) best[i][j] = { c, p: q };
}
let bj = -1, bc = INF;
for (let j = 1; j < pts.length; j++) { if (best[n - 2][j].c >= INF) continue; const c = best[n - 2][j].c + (E - pts[j].e - weights[n - 1] * k) ** 2; if (c < bc) { bc = c; bj = j; } }
const boundaries = [];
for (let i = n - 2, j = bj; i >= 0 && j > 0; i--) { boundaries.unshift(pts[j]); j = best[i][j].p; }
const inner = cand;
const starts = [lead ? lead.e : 0.05, ...boundaries.map((x) => x.e)].map((x) => Math.round(x * 100) / 100);
const out = { starts, duration: Math.round((dur + 0.6) * 100) / 100 };
writeFileSync(path.resolve("server/assets/story-reels", `${id}.json`), JSON.stringify(out));
console.log(id, JSON.stringify(out), "| gaps (dur):", boundaries.map((x) => x.d.toFixed(2)).join(" "), "| all pauses:", inner.map((x) => x.e.toFixed(1)).join(" "));
void readFileSync;
