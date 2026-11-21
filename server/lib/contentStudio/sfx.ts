// Synthesised sound effects + an electronic music bed for the reels, built with ffmpeg only (no samples, so no licence questions).
import { spawnSync } from "node:child_process";
import path from "node:path";
import { resolveFfmpeg } from "../ffmpeg.js";

const R = 44100;
type Src = { g: string; d: number };
const SRC: Record<string, Src> = {
  whoosh: { g: `anoisesrc=d=0.8:c=pink:a=0.5:r=${R},bandpass=f=650:width_type=h:w=700,lowpass=f=1900,afade=t=in:d=0.38:curve=qsin,afade=t=out:st=0.34:d=0.46:curve=qsin,volume=0.55`, d: 0.8 },
  swoosh: { g: `anoisesrc=d=1.0:c=pink:a=0.5:r=${R},bandpass=f=520:width_type=h:w=620,lowpass=f=1600,afade=t=in:d=0.5:curve=qsin,afade=t=out:st=0.45:d=0.55:curve=qsin,volume=0.55`, d: 1.0 },
  thud: { g: `aevalsrc='sin(2*PI*(52+70*exp(-t*22))*t)*exp(-t*7.5)':d=0.6:s=${R},lowpass=f=240,volume=0.9`, d: 0.6 },
  tick: { g: `aevalsrc='sin(2*PI*760*t)*exp(-t*38)':d=0.15:s=${R},lowpass=f=2400,volume=0.7`, d: 0.15 },
  beep: { g: `aevalsrc='sin(2*PI*740*t)*exp(-t*8)':d=0.35:s=${R},lowpass=f=3000,volume=0.7`, d: 0.35 },
  beepHi: { g: `aevalsrc='sin(2*PI*1046*t)*exp(-t*5.5)':d=0.5:s=${R},lowpass=f=3500,volume=0.7`, d: 0.5 },
  beepLow: { g: `aevalsrc='sin(2*PI*196*t)*exp(-t*4.5)':d=0.55:s=${R},lowpass=f=900,volume=0.8`, d: 0.55 },
  buzz: { g: `aevalsrc='(sin(2*PI*150*t)+0.6*sin(2*PI*152*t))*exp(-t*5)':d=0.7:s=${R},lowpass=f=700,volume=0.7`, d: 0.7 },
  ding: { g: `aevalsrc='(sin(2*PI*1175*t)+0.35*sin(2*PI*1760*t)+0.12*sin(2*PI*2349*t))*exp(-t*4)':d=1.4:s=${R},lowpass=f=5000,volume=0.7`, d: 1.4 },
  shutter: { g: `aevalsrc='(random(0)*2-1)*(exp(-t*110)+0.6*exp(-(t-0.07)*90)*gte(t,0.07))':d=0.3:s=${R},highpass=f=1200,lowpass=f=6000,volume=0.7`, d: 0.3 },
  print: { g: `aevalsrc='sin(2*PI*130*t)*(0.55+0.45*sin(2*PI*22*t))*0.5+0.12*(random(0)*2-1)':d=1.0:s=${R},lowpass=f=1100,afade=t=in:d=0.15,afade=t=out:st=0.75:d=0.25`, d: 1.0 },
  sparkle: { g: `aevalsrc='(sin(2*PI*2093*t)+0.5*sin(2*PI*2794*t)+0.3*sin(2*PI*3520*t))*exp(-t*9)':d=0.6:s=${R},lowpass=f=5500,volume=0.55`, d: 0.6 },
  boom: { g: `aevalsrc='sin(2*PI*(42+60*exp(-t*8))*t)*exp(-t*2.4)':d=1.6:s=${R},lowpass=f=220,volume=0.9`, d: 1.6 },
  pop: { g: `aevalsrc='sin(2*PI*(420+520*exp(-t*34))*t)*exp(-t*22)':d=0.25:s=${R},lowpass=f=2600,volume=0.7`, d: 0.25 },
  zap: { g: `aevalsrc='sin(2*PI*(1500-900*t*5)*t)*exp(-t*8)':d=0.4:s=${R},lowpass=f=3200,volume=0.55`, d: 0.4 },
  rise: { g: `aevalsrc='sin(2*PI*(260+520*t)*t)*t*0.7':d=0.9:s=${R},lowpass=f=2200,afade=t=out:st=0.7:d=0.2`, d: 0.9 },
};
export type SfxEvent = [name: keyof typeof SRC | string, at: number, volume?: number];

function ff(args: string[]) {
  const bin = resolveFfmpeg();
  if (!bin) throw new Error("ffmpeg tidak ditemukan");
  const r = spawnSync(bin, args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg: ${(r.stderr || "").slice(-900)}`);
}

export function buildSfx(events: SfxEvent[], duration: number, out: string) {
  const parts = events.map(([n, t, v], i) => `${SRC[n].g},volume=${v ?? 0.5},adelay=${Math.round(t * 1000)}|${Math.round(t * 1000)}[e${i}]`);
  const mix = `${events.map((_, i) => `[e${i}]`).join("")}amix=inputs=${events.length}:normalize=0:dropout_transition=0,volume=0.8,lowpass=f=8000,aecho=0.8:0.6:70|140:0.22|0.12,alimiter=limit=0.85,aformat=channel_layouts=stereo:sample_rates=${R},apad=whole_dur=${duration}[sfx]`;
  ff(["-y", "-filter_complex", [...parts, mix].join(";"), "-map", "[sfx]", "-t", String(duration), out]);
}

export type MusicStyle = "house" | "lofi" | "synthwave" | "techno" | "chill";
type Style = { bpm: number; root: number; kick: "four" | "soft" | "none" | "drive"; clap: boolean; hats: "off" | "shuf" | "none" | "16"; bass: number[]; arp: number[]; arpVol: number; padVol: number; bassVol: number; chord: number[] };
const STYLES: Record<MusicStyle, Style> = {
  house: { bpm: 124, root: 55, kick: "four", clap: true, hats: "off", bass: [55, 55, 65.41, 49, 55, 55, 73.42, 49], arp: [220, 261.63, 329.63, 392, 329.63, 261.63, 293.66, 392, 440, 392, 329.63, 261.63, 293.66, 329.63, 392, 523.25], arpVol: 0.16, padVol: 0, bassVol: 0.55, chord: [] },
  lofi: { bpm: 84, root: 55, kick: "soft", clap: true, hats: "shuf", bass: [55, 0, 55, 0, 65.41, 0, 49, 0], arp: [329.63, 0, 392, 0, 493.88, 0, 392, 0, 349.23, 0, 440, 0, 523.25, 0, 440, 0], arpVol: 0.2, padVol: 0.12, bassVol: 0.5, chord: [220, 261.63, 329.63, 392] },
  synthwave: { bpm: 108, root: 55, kick: "four", clap: true, hats: "16", bass: [55, 55, 55, 55, 65.41, 65.41, 49, 49], arp: [220, 329.63, 440, 329.63, 261.63, 392, 523.25, 392, 220, 329.63, 440, 329.63, 246.94, 392, 493.88, 392], arpVol: 0.2, padVol: 0.1, bassVol: 0.6, chord: [220, 261.63, 329.63] },
  techno: { bpm: 132, root: 49, kick: "drive", clap: false, hats: "off", bass: [49, 0, 49, 49, 0, 49, 55, 0], arp: [196, 0, 0, 196, 0, 233.08, 0, 0, 196, 0, 0, 261.63, 0, 233.08, 0, 0], arpVol: 0.18, padVol: 0, bassVol: 0.6, chord: [] },
  chill: { bpm: 96, root: 55, kick: "none", clap: false, hats: "shuf", bass: [55, 0, 0, 55, 0, 0, 65.41, 0], arp: [392, 0, 493.88, 0, 587.33, 0, 493.88, 0, 440, 0, 523.25, 0, 659.25, 0, 523.25, 0], arpVol: 0.18, padVol: 0.16, bassVol: 0.45, chord: [261.63, 329.63, 392, 493.88] },
};

/** A one-bar electronic loop in the chosen style, repeated to `duration`. Everything is synthesised, so it is free of licences. */
export function buildMusic(duration: number, out: string, style: MusicStyle = "house") {
  const st = STYLES[style];
  const beat = 60 / st.bpm, bar = beat * 4;
  const ev: { g: string; t: number; v: number }[] = [];
  const add = (g: string, t: number, v: number) => ev.push({ g, t, v });
  const kick = `aevalsrc='sin(2*PI*(48+150*exp(-t*38))*t)*exp(-t*7)':d=0.45:s=${R}`;
  const soft = `aevalsrc='sin(2*PI*(46+90*exp(-t*30))*t)*exp(-t*9)':d=0.4:s=${R},lowpass=f=200`;
  const clap = `aevalsrc='(random(0)*2-1)*exp(-t*26)':d=0.25:s=${R},highpass=f=1200,lowpass=f=7000`;
  const hat = `aevalsrc='(random(0)*2-1)*exp(-t*90)':d=0.08:s=${R},highpass=f=7000`;
  const note = (f: number) => `aevalsrc='(sin(2*PI*${f}*t)+0.5*sin(2*PI*${f * 2}*t)+0.3*sin(2*PI*${f * 3}*t))*exp(-t*9)':d=0.26:s=${R},lowpass=f=1800`;
  const pluck = (f: number) => `aevalsrc='(sin(2*PI*${f}*t)+0.4*sin(2*PI*${f * 2}*t))*exp(-t*${style === "lofi" || style === "chill" ? 7 : 16})':d=0.5:s=${R},lowpass=f=${style === "lofi" || style === "chill" ? 2600 : 4500}`;
  const pad = (fs: number[]) => `aevalsrc='(${fs.map((f) => `sin(2*PI*${f}*t)`).join("+")})*0.3*min(t/0.6,1)*min((${bar.toFixed(3)}-t)/0.5,1)':d=${bar.toFixed(3)}:s=${R},lowpass=f=1400`;
  for (let b = 0; b < 4; b++) {
    const t = b * beat;
    if (st.kick === "four" || st.kick === "drive") add(kick, t, 0.95);
    if (st.kick === "soft" && (b === 0 || b === 2)) add(soft, t, 0.8);
    if (st.kick === "drive") add(kick, t + beat * 0.75, 0.45);
    if (st.clap && b % 2 === 1) add(clap, t, 0.5);
    if (st.hats === "off") add(hat, t + beat / 2, 0.28);
    if (st.hats === "16") { for (let q = 0; q < 4; q++) add(hat, t + (beat * q) / 4, q % 2 ? 0.1 : 0.2); }
    if (st.hats === "shuf") { add(hat, t + beat / 2, 0.14); add(hat, t + beat * 0.83, 0.07); }
  }
  const k = st.root / 55;
  st.bass.forEach((f, i) => { if (f) add(note(f * k), i * (beat / 2), st.bassVol); });
  st.arp.forEach((f, i) => { if (f) add(pluck(f * k), i * (beat / 4), st.arpVol); });
  if (st.padVol && st.chord.length) add(pad(st.chord.map((f) => f * k)), 0, st.padVol);
  const parts = ev.map((e, i) => `${e.g},volume=${e.v},adelay=${Math.round(e.t * 1000)}|${Math.round(e.t * 1000)}[e${i}]`);
  const mix = `${ev.map((_, i) => `[e${i}]`).join("")}amix=inputs=${ev.length}:normalize=0:dropout_transition=0,apad=whole_dur=${bar.toFixed(4)},atrim=0:${bar.toFixed(4)},aformat=channel_layouts=stereo:sample_rates=${R},alimiter=limit=0.9[m]`;
  const barFile = out.replace(/\.wav$/, "-bar.wav");
  ff(["-y", "-filter_complex", [...parts, mix].join(";"), "-map", "[m]", barFile]);
  ff(["-y", "-stream_loop", String(Math.ceil(duration / bar)), "-i", barFile, "-af", `afade=t=in:d=0.4,afade=t=out:st=${(duration - 1.2).toFixed(2)}:d=1.2`, "-t", String(duration), out]);
}

/** VO on top, SFX under it, music ducked while the voice speaks. */
export function mixAudio(o: { vo: string; sfx: string; music?: string; duration: number; out: string }) {
  const inputs = ["-i", o.vo, "-i", o.sfx, ...(o.music ? ["-i", o.music] : [])];
  const fmt = `aformat=channel_layouts=stereo:sample_rates=${R}`;
  const f = o.music
    ? `[0:a]${fmt},apad=whole_dur=${o.duration},asplit=2[vo1][vo2];[2:a]volume=0.55[mu];[mu][vo2]sidechaincompress=threshold=0.02:ratio=9:attack=15:release=450[mud];[vo1][1:a][mud]amix=inputs=3:normalize=0:weights=1 0.55 0.6,alimiter=limit=0.95[m]`
    : `[0:a]${fmt},apad=whole_dur=${o.duration}[v];[v][1:a]amix=inputs=2:normalize=0:weights=1 0.55,alimiter=limit=0.95[m]`;
  ff(["-y", ...inputs, "-filter_complex", f, "-map", "[m]", "-t", String(o.duration), o.out]);
}
export const workDir = (name: string) => path.resolve("storage/content-studio", name);
