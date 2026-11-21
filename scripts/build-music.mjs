// Synthesises a short royalty-free electronic loop (house, 124 BPM) with ffmpeg: kick, clap, hats, bass and a pluck arpeggio.
// Output: storage/content-studio/hero/music-demo.wav (one bar rendered, looped 8x).
import { spawnSync } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
const ffmpeg = createRequire(import.meta.url)("ffmpeg-static");
const dir = path.resolve("storage/content-studio/hero");
const R = 44100, BPM = 124, beat = 60 / BPM, bar = beat * 4;
const ev = [];
const add = (g, t, v) => ev.push({ g, t, v });
const kick = `aevalsrc='sin(2*PI*(48+150*exp(-t*38))*t)*exp(-t*7)':d=0.45:s=${R}`;
const clap = `aevalsrc='(random(0)*2-1)*exp(-t*26)':d=0.25:s=${R},highpass=f=1200,lowpass=f=7000`;
const hat = `aevalsrc='(random(0)*2-1)*exp(-t*90)':d=0.08:s=${R},highpass=f=7000`;
const note = (f, d = 0.22) => `aevalsrc='(sin(2*PI*${f}*t)+0.5*sin(2*PI*${f * 2}*t)+0.3*sin(2*PI*${f * 3}*t))*exp(-t*${(9 / d / 4).toFixed(1)})':d=${d}:s=${R},lowpass=f=1800`;
const pluck = (f) => `aevalsrc='(sin(2*PI*${f}*t)+0.4*sin(2*PI*${f * 2}*t))*exp(-t*16)':d=0.3:s=${R},lowpass=f=4500`;
for (let b = 0; b < 4; b++) { add(kick, b * beat, 0.95); if (b % 2 === 1) add(clap, b * beat, 0.5); add(hat, b * beat + beat / 2, 0.28); add(hat, b * beat + beat * 0.25, 0.1); add(hat, b * beat + beat * 0.75, 0.1); }
const bass = [55, 55, 65.41, 49, 55, 55, 73.42, 49];
bass.forEach((f, i) => add(note(f, 0.26), i * (beat / 2) + beat / 4 * 0, 0.55));
const arp = [220, 261.63, 329.63, 392, 329.63, 261.63, 293.66, 392, 440, 392, 329.63, 261.63, 293.66, 329.63, 392, 523.25];
arp.forEach((f, i) => add(pluck(f), i * (beat / 4), 0.16));
const parts = ev.map((e, i) => `${e.g},volume=${e.v},adelay=${Math.round(e.t * 1000)}|${Math.round(e.t * 1000)}[e${i}]`);
const mix = `${ev.map((_, i) => `[e${i}]`).join("")}amix=inputs=${ev.length}:normalize=0:dropout_transition=0,apad=whole_dur=${bar.toFixed(4)},atrim=0:${bar.toFixed(4)},aformat=channel_layouts=stereo:sample_rates=${R},alimiter=limit=0.9[m]`;
let r = spawnSync(ffmpeg, ["-y", "-filter_complex", [...parts, mix].join(";"), "-map", "[m]", path.join(dir, "bar.wav")], { encoding: "utf8" });
if (r.status !== 0) { console.error(r.stderr.slice(-1200)); process.exit(1); }
r = spawnSync(ffmpeg, ["-y", "-stream_loop", "7", "-i", path.join(dir, "bar.wav"), "-af", "afade=t=in:d=0.3,afade=t=out:st=14.5:d=1", "-t", "15.5", path.join(dir, "music-demo.wav")], { encoding: "utf8" });
if (r.status !== 0) { console.error(r.stderr.slice(-1200)); process.exit(1); }
console.log("ok", bar.toFixed(3));
