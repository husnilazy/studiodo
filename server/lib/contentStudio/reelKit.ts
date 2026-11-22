import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { wordmark } from "./theme.js";
import { assembleReel, at, blob, BLUE, CREAM, dot, INK, LIL, MINT, ORG, P, PINK, plus, s, star, TEAL, tx, YEL, type Sc } from "./heroReel2.js";
import type { FigEd } from "./art4.js";
import type { MusicStyle, SfxEvent } from "./sfx.js";
import { CAM_CSS } from "./reelCam.js";

// Data-driven story reel builder. A reel = one scene per voice-over sentence + a brand reveal + a CTA scene. Scene starts come from the measured voice over
// (server/assets/story-reels/<id>.json, written by scripts/vo-times.mjs). Each scene supplies its own art through `Ctx`, so every reel looks different
// while the timing / sfx / reveal / CTA plumbing is shared. Sound effects are collected automatically from every pop.

export type Ctx = {
  t: number; // scene start (s)
  d: number; // scene length (s)
  /** pop an svg group in at t+dt (also adds a pop sound). */
  A: (svg: string, dt?: number, cls?: string) => string;
  sfx: (name: SfxEvent[0], dt?: number, vol?: number) => void;
  person: (o: Omit<FigEd, "expr"> & { expr?: FigEd["expr"] }, dt?: number) => string;
};
export type SceneDef = {
  bg?: string; dark?: boolean; from?: string;
  text: string; // rich: *italic*, | = line break
  size?: number; align?: "left" | "center"; top?: number;
  text2?: { at: number; text: string; size?: number }; // a second line that replaces the first at t+at
  art: (c: Ctx) => string;
};
export type ReelDef = {
  id: string; music: MusicStyle; voice: string; // voice label only (documentation)
  scenes: SceneDef[]; // problem/solution sentences, in voice-over order
  brand: string; // tagline under the logo (brand sentence)
  cta: { text: string; btn?: string; kw?: string; bg?: string; art?: (c: Ctx) => string };
};

const PAL: [string, boolean][] = [[YEL, false], [CREAM, false], [PINK, false], ["#14122b", true], [BLUE, true], [MINT, false], [LIL, false], [TEAL, true], ["#ff6b2c", true], ["#ffffff", false]];
const plain = (h: string) => h.replace(/[*|]/g, "");
const autoSize = (h: string) => { const n = plain(h).length; return n <= 18 ? 132 : n <= 26 ? 116 : n <= 36 ? 100 : n <= 48 ? 88 : 78; };

type Timing = { starts: number[]; duration: number };
const timingFor = (id: string, n: number): Timing => {
  const f = path.join(process.cwd(), "server", "assets", "story-reels", `${id}.json`);
  if (existsSync(f)) return JSON.parse(readFileSync(f, "utf8")) as Timing;
  return { starts: Array.from({ length: n }, (_, i) => 0.4 + i * 3), duration: 0.4 + n * 3 + 1 }; // placeholder until the VO is measured
};

export function defineReel(def: ReelDef) {
  const n = def.scenes.length + 2;
  const tm = timingFor(def.id, n);
  const T = tm.starts;
  const DURATION = tm.duration;
  const sfxEvents: SfxEvent[] = [];
  const mk = (t0: number, d: number): Ctx => ({
    t: t0, d,
    A: (svg, dt = 0.3, cls = "pop") => { sfxEvents.push(["pop", t0 + dt, 0.4]); return at(svg, t0 + dt, null, cls); },
    sfx: (name, dt = 0, vol = 0.4) => { sfxEvents.push([name, t0 + dt, vol]); },
    person: (o, dt = 0.4) => { sfxEvents.push(["pop", t0 + dt, 0.3]); return at(P({ expr: "senang", ...o } as FigEd), t0 + dt); },
  });

  function buildReelDoc(): { html: string; durationSec: number } {
    sfxEvents.length = 0;
    const SC: Sc[] = [];
    const starts: number[] = [0];
    const len = (i: number) => (i + 1 < n ? T[i + 1] : DURATION) - T[i];
    def.scenes.forEach((sd, i) => {
      const [pbg, pdark] = PAL[(i * 3 + def.id.length) % PAL.length];
      const bg = sd.bg ?? pbg, dark = sd.dark ?? (sd.bg ? false : pdark);
      const c = mk(T[i], len(i));
      const size = sd.size ?? autoSize(sd.text);
      const col = dark ? "color:#fff;" : "";
      const pos = sd.align === "center" ? `left:120px;width:840px;text-align:center;top:${sd.top ?? 400}px;` : `left:120px;top:${sd.top ?? 400}px;`;
      let html = tx(sd.text, T[i], sd.text2 ? T[i] + sd.text2.at - 0.1 : null, `${pos}font-size:${size}px;line-height:1;${col}`, "big");
      if (sd.text2) html += tx(sd.text2.text, T[i] + sd.text2.at, null, `${pos}font-size:${sd.text2.size ?? autoSize(sd.text2.text)}px;line-height:1;${col}`, "big");
      const decor = blob(i % 2 ? 860 : 180, 520, 200, dark ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.35)") + dot(i % 2 ? 130 : 950, 1560, 80, dark ? "rgba(255,255,255,.1)" : "rgba(0,0,0,.07)", 0.2) + plus(i % 2 ? 940 : 110, 1560, 30, dark ? "#fff" : INK, 0.3);
      SC.push({ i, bg, dark, from: sd.from ?? ["50% 50%", "20% 50%", "90% 50%", "50% 100%", "10% 90%", "90% 20%"][i % 6], art: decor + `<g transform="translate(540 1380) scale(1.15) translate(-540 -1380)">${sd.art(c)}</g>`, html });
      if (i > 0) starts.push(T[i] - 0.1);
    });
    // brand reveal
    const rb = def.scenes.length, tb = T[rb];
    SC.push({ i: rb, bg: "#ffffff", dark: false, from: "50% 50%", art: ([[160, 520, 40, ORG], [900, 600, 50, BLUE], [200, 1400, 60, YEL], [880, 1380, 44, PINK], [540, 440, 30, MINT]] as [number, number, number, string][]).map(([x, y, r, c], k) => at(dot(x, y, r, c, 0.1 * k), tb + 0.1 * k)).join(""),
      html: `<img class="biglogo" src="${wordmark("ink")}" alt="STUDIODO" style="--t:${s(tb)}">` + tx(def.brand, tb + 0.25, null, "left:0;right:0;top:1120px;text-align:center;font-size:88px", "mid") + `<div class="flash" style="--t:${s(tb)}"></div>` });
    starts.push(tb - 0.1);
    sfxEvents.push(["boom", tb, 0.9], ["sparkle", tb + 0.1, 0.4], ["beepHi", tb + 0.05, 0.25]);
    // CTA
    const rc = rb + 1, tc = T[rc], dc = len(rc), btnT = tc + Math.min(2.2, dc * 0.5);
    const cc = mk(tc, dc);
    SC.push({ i: rc, bg: def.cta.bg ?? TEAL, dark: true, from: "50% 100%",
      art: blob(160, 520, 190, "rgba(255,255,255,.18)") + dot(940, 420, 60, YEL, 0.2) + plus(100, 1560, 30, "#fff", 0.4) + (def.cta.art ? def.cta.art(cc) : cc.person({ x: 300, y: 1700, s: 0.78, expr: "senang", hair: "short", skin: 2, pose: "wave", color: 1 }) + cc.person({ x: 800, y: 1700, s: 0.78, expr: "senang", hair: "hijab", skin: 1, pose: "up", color: 3 }, 0.6)),
      html: tx(def.cta.text, tc, null, `left:120px;top:400px;font-size:${autoSize(def.cta.text)}px;line-height:1;color:#fff`, "big")
        + (def.cta.btn ? `<div class="btn" style="--t:${s(btnT)};top:790px">${def.cta.btn}</div>` : "") + (def.cta.kw ? `<div class="kw" style="--t:${s(btnT)};top:790px">${def.cta.kw}</div>` : "")
        + tx("studiodo.id", btnT + 0.6, null, "left:120px;top:970px;font-size:56px;color:#fff", "url") });
    starts.push(tc - 0.1);
    sfxEvents.push(["pop", btnT, 0.5], ["ding", btnT + 0.2, 0.4], ["sparkle", btnT + 0.5, 0.3]);
    for (let i = 0; i < starts.length; i++) { if (i > 0) sfxEvents.push(["swoosh", starts[i] - 0.05, 0.4]); sfxEvents.push(["whoosh", Math.max(0, (i === 0 ? T[0] : starts[i] + 0.1) - 0.12), 0.26]); }
    return assembleReel(SC, starts, DURATION, CAM_CSS);
  }
  buildReelDoc(); // fills sfxEvents so SFX is available synchronously
  return { MUSIC: def.music, VO_FILE: `${def.id}.mp3`, T, DURATION, buildReelDoc, SFX: sfxEvents.slice() as SfxEvent[] };
}

// ---------------------------------------------------------------- props (origin = middle, ~300 wide unless noted)
const f = (c: string) => `style="fill:${c}"`;
const txt = (x: number, y: number, t: string, size: number, c = INK, w = 800, anchor = "middle", fam = "Bricolage") => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${fam === "Bricolage" ? "Bricolage,sans-serif" : "InterK,sans-serif"}" font-weight="${w}" font-size="${size}" style="fill:${c}">${t}</text>`;
const g = (x: number, y: number, sc: number, inner: string, rot = 0) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})">${inner}</g>`;
export const K = {
  txt, g,
  /** rounded label chip centred at (x,y). */
  chip: (x: number, y: number, label: string, bg: string, fg = "#fff", size = 40, w?: number) => { const ww = w ?? Math.max(160, label.length * size * 0.56 + 60); return g(x, y, 1, `<rect x="${-ww / 2}" y="${-size * 0.95}" width="${ww}" height="${size * 1.9}" rx="${size}" ${f(bg)}/>${txt(0, size * 0.36, label, size, fg)}`); },
  /** white card with title + subtitle. */
  card: (x: number, y: number, w: number, h: number, title: string, sub = "", c = INK, accent = BLUE) => g(x, y, 1, `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="32" ${f("#fff")}/><rect x="${-w / 2}" y="${-h / 2}" width="16" height="${h}" rx="8" ${f(accent)}/>${txt(-w / 2 + 50, sub ? -6 : 14, title, 38, c, 800, "start", "Inter")}${sub ? txt(-w / 2 + 50, 38, sub, 28, c, 700, "start", "Inter").replace("style=\"fill", "style=\"opacity:.6;fill") : ""}`),
  coin: (x: number, y: number, r: number, label = "Rp") => g(x, y, 1, `<circle r="${r}" ${f(YEL)}/><circle r="${r * 0.78}" style="fill:none;stroke:#e0a800;stroke-width:${r * 0.08}"/>${txt(0, r * 0.28, label, r * 0.8, "#a87400")}`),
  wallet: (x: number, y: number, sc: number) => g(x, y, sc, `<rect x="-150" y="-100" width="300" height="200" rx="34" ${f(BLUE)}/><rect x="-150" y="-100" width="300" height="60" rx="30" ${f("#3a64ff")}/><rect x="40" y="-20" width="120" height="70" rx="30" ${f(YEL)}/><circle cx="85" cy="15" r="14" ${f(INK)}/>`),
  qr: (x: number, y: number, sc: number) => g(x, y, sc, `<rect x="-110" y="-110" width="220" height="220" rx="26" ${f("#fff")}/>${Array.from({ length: 49 }, (_, i) => ((i * 7 + (i >> 3) * 5) % 3 === 0 || [0, 1, 7, 6, 8, 5, 42, 43, 48, 35, 41, 34].includes(i)) ? `<rect x="${-84 + (i % 7) * 24}" y="${-84 + Math.floor(i / 7) * 24}" width="20" height="20" rx="4" ${f(INK)}/>` : "").join("")}`),
  /** film strip with n frames. */
  strip: (x: number, y: number, n: number, sc: number, cols = [BLUE, PINK, ORG, MINT]) => g(x, y, sc, `<rect x="${-60}" y="${-n * 60 - 12}" width="120" height="${n * 120 + 24}" rx="14" ${f("#fff")}/>${Array.from({ length: n }, (_, i) => `<rect x="-46" y="${-n * 60 + i * 120 + 4}" width="92" height="104" rx="10" ${f(cols[i % cols.length])}/><circle cx="0" cy="${-n * 60 + i * 120 + 44}" r="20" ${f("#ffd9b8")}/>`).join("")}`),
  play: (x: number, y: number, r: number, c = ORG) => g(x, y, 1, `<circle r="${r}" ${f(c)}/><path d="M${-r * 0.3} ${-r * 0.45} L${r * 0.5} 0 L${-r * 0.3} ${r * 0.45}Z" ${f("#fff")}/>`),
  battery: (x: number, y: number, sc: number, level: number, c = MINT) => g(x, y, sc, `<rect x="-120" y="-60" width="230" height="120" rx="26" style="fill:none;stroke:${INK};stroke-width:12"/><rect x="118" y="-24" width="22" height="48" rx="8" ${f(INK)}/><rect x="-106" y="-46" width="${202 * level}" height="92" rx="16" ${f(c)}/>`),
  thermo: (x: number, y: number, sc: number, lvl: number, c = ORG) => g(x, y, sc, `<rect x="-26" y="-150" width="52" height="250" rx="26" ${f("#fff")}/><circle cy="110" r="46" ${f(c)}/><rect x="-12" y="${100 - 230 * lvl}" width="24" height="${230 * lvl + 10}" rx="12" ${f(c)}/>`),
  bell: (x: number, y: number, sc: number, c = YEL) => g(x, y, sc, `<path d="M-90 60 Q-90 -90 0 -100 Q90 -90 90 60Z" ${f(c)}/><rect x="-110" y="52" width="220" height="26" rx="13" ${f(c)}/><circle cy="100" r="22" ${f(INK)}/>`),
  heart: (x: number, y: number, sc: number, c = "#ff3d71") => g(x, y, sc, `<path d="M0 90 C-170 -30 -80 -130 0 -50 C80 -130 170 -30 0 90Z" ${f(c)}/>`),
  bars: (x: number, y: number, vals: number[], sc: number, cols = [BLUE, ORG, MINT, PINK, YEL]) => g(x, y, sc, `<rect x="-170" y="-130" width="340" height="270" rx="30" ${f("#fff")}/>${vals.map((v, i) => `<rect x="${-130 + i * 62}" y="${110 - v * 200}" width="44" height="${v * 200}" rx="10" ${f(cols[i % cols.length])}/>`).join("")}`),
  receipt: (x: number, y: number, sc: number, lines = 4) => g(x, y, sc, `<path d="M-90 -130 H90 V130 L60 110 L30 130 L0 110 L-30 130 L-60 110 L-90 130Z" ${f("#fff")}/>${Array.from({ length: lines }, (_, i) => `<rect x="-60" y="${-96 + i * 38}" width="${100 - (i % 2) * 30}" height="12" rx="6" ${f("#c6cbe6")}/><rect x="30" y="${-96 + i * 38}" width="36" height="12" rx="6" ${f(INK)}/>`).join("")}`),
  tag: (x: number, y: number, sc: number, label: string, c = ORG) => g(x, y, sc, `<path d="M-130 -70 H70 L140 0 L70 70 H-130Z" ${f(c)}/><circle cx="-100" cy="0" r="14" ${f("#fff")}/>${txt(-8, 16, label, 44, "#fff")}`),
  gear: (x: number, y: number, r: number, c = "#8a8fb3") => g(x, y, 1, `<g class="spin" style="transform-box:fill-box;transform-origin:center;--d:0s">${Array.from({ length: 8 }, (_, i) => `<rect x="${-r * 0.16}" y="${-r}" width="${r * 0.32}" height="${r * 0.4}" rx="${r * 0.08}" transform="rotate(${i * 45})" ${f(c)}/>`).join("")}<circle r="${r * 0.78}" ${f(c)}/><circle r="${r * 0.32}" ${f("#fff")}/></g>`),
  tickBox: (x: number, y: number, label: string, on = true, w = 700) => g(x, y, 1, `<rect x="${-w / 2}" y="-52" width="${w}" height="104" rx="30" ${f("#fff")}/><rect x="${-w / 2 + 28}" y="-30" width="60" height="60" rx="16" ${f(on ? MINT : "#e3e6f5")}/>${on ? `<path d="M${-w / 2 + 42} 0 L${-w / 2 + 56} 16 L${-w / 2 + 76} -16" style="fill:none;stroke:#fff;stroke-width:9;stroke-linecap:round;stroke-linejoin:round"/>` : ""}${txt(-w / 2 + 112, 12, label, 38, INK, 800, "start", "Inter")}`),
  mail: (x: number, y: number, sc: number) => g(x, y, sc, `<rect x="-130" y="-90" width="260" height="180" rx="26" ${f("#fff")}/><path d="M-130 -70 L0 30 L130 -70" style="fill:none;stroke:${BLUE};stroke-width:14;stroke-linejoin:round"/>`),
  mega: (x: number, y: number, sc: number, c = ORG) => g(x, y, sc, `<path d="M-110 -40 L90 -120 V120 L-110 40Z" ${f(c)}/><rect x="-150" y="-50" width="60" height="100" rx="20" ${f(INK)}/><rect x="-96" y="40" width="40" height="90" rx="14" ${f(INK)}/>`),
  clock: (x: number, y: number, sc: number, label?: string) => g(x, y, sc, `<circle r="120" style="fill:#fff;stroke:${INK};stroke-width:14"/><path d="M0 0 V-70" style="stroke:${INK};stroke-width:12;stroke-linecap:round"/><g class="hand"><path d="M0 0 L56 30" style="stroke:#e5384f;stroke-width:12;stroke-linecap:round"/></g><circle r="11" ${f(INK)}/>${label ? txt(0, 190, label, 52) : ""}`),
  cal: (x: number, y: number, sc: number, day: string, mon = "NOV") => g(x, y, sc, `<rect x="-130" y="-140" width="260" height="280" rx="30" ${f("#fff")}/><rect x="-130" y="-140" width="260" height="84" rx="30" ${f("#e5384f")}/>${txt(0, -82, mon, 46, "#fff")}${txt(0, 60, day, 150)}`),
  chatBubble: (x: number, y: number, w: number, label: string, me: boolean, bg?: string) => g(x, y, 1, `<rect x="${-w / 2}" y="-48" width="${w}" height="96" rx="38" ${f(bg ?? (me ? BLUE : "#fff"))}/>${txt(0, 12, label, 32, me && !bg ? "#fff" : INK, 800, "middle", "Inter")}`),
  notif: (x: number, y: number, w: number, title: string, sub: string, c = "#e5384f") => g(x, y, 1, `<rect x="${-w / 2}" y="-70" width="${w}" height="140" rx="34" ${f("#fff")}/><circle cx="${-w / 2 + 62}" cy="0" r="30" ${f(c)}/>${txt(-w / 2 + 112, -6, title, 34, INK, 800, "start", "Inter")}${txt(-w / 2 + 112, 36, sub, 26, "#6b6f94", 700, "start", "Inter")}`),
  arrow: (x1: number, y1: number, x2: number, y2: number, c = INK) => `<path d="M${x1} ${y1} L${x2} ${y2}" style="stroke:${c};stroke-width:12;stroke-linecap:round"/><path d="M${x2 - 24 * Math.sign(x2 - x1 || 1) + 0} ${y2 - 22} L${x2} ${y2} L${x2 - 24 * Math.sign(x2 - x1 || 1)} ${y2 + 22}" style="fill:none;stroke:${c};stroke-width:12;stroke-linecap:round;stroke-linejoin:round"/>`,
  /** wide framed tile: a stand-in photo. */
  photo: (x: number, y: number, w: number, h: number, bg: string, label?: string, face = true) => g(x, y, 1, `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="22" ${f(bg)}/>${face ? `<circle cy="${-h * 0.08}" r="${h * 0.19}" ${f("#f2b48c")}/><path d="M${-w * 0.3} ${h / 2} Q0 ${h * 0.05} ${w * 0.3} ${h / 2}Z" ${f(ORG)}/><circle cx="${-h * 0.065}" cy="${-h * 0.1}" r="${h * 0.016}" ${f(INK)}/><circle cx="${h * 0.065}" cy="${-h * 0.1}" r="${h * 0.016}" ${f(INK)}/><path d="M${-h * 0.065} ${-h * 0.03} Q0 ${h * 0.02} ${h * 0.065} ${-h * 0.03}" style="fill:none;stroke:${INK};stroke-width:5;stroke-linecap:round"/>` : ""}${label ? txt(0, h / 2 + 46, label, 34, INK, 800, "middle", "Inter") : ""}`),
};
export { star, LIL, CREAM };
