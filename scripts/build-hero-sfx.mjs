// Synthesises the hero reel's sound effects with ffmpeg (no samples, so no licence questions) and mixes them under the voice over.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
const ffmpeg = createRequire(import.meta.url)("ffmpeg-static");
const dir = path.resolve("storage/content-studio/hero");
const R = 44100;
const src = {
  whoosh: (v) => ({ g: `aevalsrc='(random(0)*2-1)':d=0.55:s=${R},lowpass=f=2600,highpass=f=350,afade=t=in:d=0.3,afade=t=out:st=0.3:d=0.25`, v, d: 0.55 }),
  swoosh: (v) => ({ g: `aevalsrc='(random(0)*2-1)':d=0.7:s=${R},lowpass=f=5000,highpass=f=600,afade=t=in:d=0.35,afade=t=out:st=0.35:d=0.35`, v, d: 0.7 }),
  thud: (v) => ({ g: `aevalsrc='sin(2*PI*(55+140*exp(-t*28))*t)*exp(-t*8)+0.25*(random(0)*2-1)*exp(-t*70)':d=0.6:s=${R}`, v, d: 0.6 }),
  tick: (v) => ({ g: `aevalsrc='sin(2*PI*1100*t)*exp(-t*55)':d=0.15:s=${R}`, v, d: 0.15 }),
  beep: (v) => ({ g: `aevalsrc='sin(2*PI*880*t)*exp(-t*9)':d=0.3:s=${R}`, v, d: 0.3 }),
  beepHi: (v) => ({ g: `aevalsrc='sin(2*PI*1320*t)*exp(-t*6)':d=0.45:s=${R}`, v, d: 0.45 }),
  ding: (v) => ({ g: `aevalsrc='(sin(2*PI*1319*t)+0.6*sin(2*PI*1976*t)+0.3*sin(2*PI*2637*t))*exp(-t*4.5)':d=1.2:s=${R}`, v, d: 1.2 }),
  shutter: (v) => ({ g: `aevalsrc='(random(0)*2-1)*(exp(-t*140)+0.7*exp(-(t-0.07)*110)*gte(t,0.07))':d=0.3:s=${R},highpass=f=900`, v, d: 0.3 }),
  print: (v) => ({ g: `aevalsrc='sin(2*PI*140*t)*(0.5+0.5*sin(2*PI*28*t))*0.6+0.25*(random(0)*2-1)':d=1.0:s=${R},lowpass=f=1800,afade=t=in:d=0.1,afade=t=out:st=0.8:d=0.2`, v, d: 1.0 }),
  sparkle: (v) => ({ g: `aevalsrc='(sin(2*PI*2400*t)+0.7*sin(2*PI*3200*t)+0.5*sin(2*PI*4200*t))*exp(-t*12)':d=0.5:s=${R}`, v, d: 0.5 }),
  boom: (v) => ({ g: `aevalsrc='sin(2*PI*(40+90*exp(-t*9))*t)*exp(-t*2.6)':d=1.6:s=${R}`, v, d: 1.6 }),
  pop: (v) => ({ g: `aevalsrc='sin(2*PI*(500+900*exp(-t*40))*t)*exp(-t*28)':d=0.2:s=${R}`, v, d: 0.2 }),
};
const ev = [];
const at = (name, t, v = 0.5) => ev.push([name, t, v]);
// text entrances
for (const t of [0.95, 2.57, 4.26, 6.53, 7.47, 11.87, 16.68, 21.28, 25.42, 26.34, 28.8, 31.23, 34.0]) at("whoosh", t - 0.12, 0.28);
// scene transitions
for (const t of [4.15, 6.4, 9.35, 11.75, 15.15, 18.25, 21.15, 25.35, 31.1, 33.9]) at("swoosh", t - 0.1, 0.4);
// the "satu per satu" slams
for (const t of [9.47, 10.35, 10.99]) { at("thud", t, 0.9); at("tick", t + 0.03, 0.3); }
at("tick", 13.07, 0.25); at("tick", 13.8, 0.25); at("tick", 14.5, 0.25);
at("thud", 15.24, 0.7); at("beep", 15.3, 0.45);
at("pop", 15.48, 0.5); at("ding", 15.98, 0.5); at("sparkle", 16.1, 0.3);
at("sparkle", 18.5, 0.2);
// countdown 3-2-1, shutter, flash
for (const t of [18.5, 19.2, 19.85]) at("beep", t, 0.5);
at("shutter", 20.5, 0.9); at("sparkle", 20.55, 0.4); at("sparkle", 20.85, 0.3);
at("print", 21.3, 0.35); at("pop", 22.9, 0.5); at("sparkle", 23.4, 0.35);
// relaxed owner, dashboard numbers
at("pop", 25.8, 0.4); at("pop", 26.9, 0.35);
for (let i = 0; i < 9; i++) at("tick", 26.9 + i * 0.25, 0.12);
at("ding", 29.3, 0.35);
// reveal + CTA
at("boom", 32.58, 0.9); at("sparkle", 32.7, 0.4); at("beepHi", 32.6, 0.25);
at("pop", 35.13, 0.5);
for (let i = 0; i < 4; i++) { at("tick", 35.28 + i * 0.28, 0.45); at("pop", 35.28 + i * 0.28, 0.2); }
at("ding", 36.6, 0.35); at("sparkle", 36.62, 0.3);
const parts = ev.map(([n, t, v], i) => { const s = src[n](v); return `${s.g},volume=${s.v},adelay=${Math.round(t * 1000)}|${Math.round(t * 1000)}[e${i}]`; });
const mix = `${ev.map((_, i) => `[e${i}]`).join("")}amix=inputs=${ev.length}:normalize=0:dropout_transition=0,volume=0.9,alimiter=limit=0.9,aformat=channel_layouts=stereo:sample_rates=44100,apad=whole_dur=39.4[sfx]`;
const out = path.join(dir, "sfx.wav");
let r = spawnSync(ffmpeg, ["-y", "-filter_complex", [...parts, mix].join(";"), "-map", "[sfx]", "-t", "39.4", out], { encoding: "utf8" });
if (r.status !== 0) { console.error(r.stderr.slice(-1500)); process.exit(1); }
r = spawnSync(ffmpeg, ["-y", "-i", path.join(dir, "vo-siti-v4-take1.mp3"), "-i", out, "-filter_complex", "[0:a]aformat=channel_layouts=stereo:sample_rates=44100,apad=whole_dur=39.4[v];[v][1:a]amix=inputs=2:normalize=0:weights=1 0.55,alimiter=limit=0.95[m]", "-map", "[m]", "-t", "39.4", path.join(dir, "mix.wav")], { encoding: "utf8" });
if (r.status !== 0) { console.error(r.stderr.slice(-1500)); process.exit(1); }
console.log("mix ok", ev.length, "effects");
