import { wordmark } from "./theme.js";
import { assembleReel, at, blob, BLUE, booth, CREAM, dot, INK, LIL, MINT, ORG, P, PINK, plus, s, scIdle, star, TEAL, tx, YEL, type Sc } from "./heroReel2.js";
import { chip, tick } from "./reelParts.js";
import { CAM_CSS, camera, shot } from "./reelCam.js";
import type { SfxEvent } from "./sfx.js";

// Reel 10: "Satu booth, satu sudut kamera."  Feature: multi-kamera (kamera kedua = Sudut 2; mode "Bergantian per foto" and "Dua sudut tiap jepretan",
// the customer picks the angle on the Preview screen). Claim stays literal: NOT tested with two physical cameras (see needsCheck). CTA: "tag".

export const MUSIC = "synthwave" as const;
export const VO_FILE = "vo-multicam.mp3";
export const T = { satu: 0.0, dari: 2.56, studiodo: 7.19, pasang: 9.6, gantian: 12.31, foto1: 13.59, foto2: 15.68, dua: 17.68, jepret: 19.45, pilih: 22.4, perspektif: 25.64, brand: 27.88, tag: 28.98, tombol: 30.6 };
export const DURATION = 32.6;
const STARTS = [0, T.dari - 0.1, T.studiodo - 0.1, T.pasang - 0.1, T.gantian - 0.1, T.dua - 0.1, T.perspektif - 0.1, T.brand - 0.1, T.tag - 0.1];

const badge = (x: number, y: number, txt: string, c: string, t: number, w = 230) => chip(x, y, txt, c, "#fff", t, w, 34);

export function buildReelDoc(): { html: string; durationSec: number } {
  const SC: Sc[] = [];
  // 0 one booth, one angle
  SC.push({ i: 0, bg: YEL, dark: false, from: "50% 50%", art:
    blob(180, 520, 200, "#ffe27a") + dot(950, 1480, 90, ORG, 0.2) + plus(110, 1500, 32, INK, 0.3)
    + booth(720, 1700, 1.1, [{ html: scIdle(), t: 0, o: null }])
    + at(P({ x: 250, y: 1700, s: 0.7, expr: "bingung", hair: "bun", skin: 2, pose: "hold", color: 1 }), T.satu + 0.5)
    + badge(300, 1060, "1 sudut", INK, T.satu + 1.2, 240),
    html: tx("Satu booth, *satu sudut.*", T.satu, null, "left:120px;top:310px;font-size:124px;line-height:.98", "big") });
  // 1 ten identical shots
  const tiles = Array.from({ length: 10 }, (_, i) => at(`<g>${shot(190 + (i % 5) * 175, 1190 + Math.floor(i / 5) * 270, 150, 220, BLUE, 1)}<text x="${190 + (i % 5) * 175}" y="${1190 + Math.floor(i / 5) * 270 + 150}" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="30" style="fill:#fff">${i + 1}</text></g>`, T.dari + 0.9 + i * 0.4)).join("");
  SC.push({ i: 1, bg: CREAM, dark: false, from: "20% 50%", art:
    blob(860, 520, 220, "#ffe3c4") + dot(110, 1560, 70, "#ffd0d8") + plus(930, 1560, 30, ORG, 0.3) + tiles,
    html: tx("Foto pertama sampai kesepuluh, *mirip-mirip terus.*", T.dari, null, "left:120px;top:310px;font-size:84px;line-height:1", "big") });
  // 2 multi camera
  SC.push({ i: 2, bg: PINK, dark: false, from: "90% 50%", art:
    blob(180, 520, 200, "#ffb3cf") + dot(950, 1560, 90, "#ff6fa5", 0.2) + plus(110, 1560, 32, INK, 0.1)
    + at(camera(330, 1330, 1.0, "#2b2f6b", ORG, "#14122b", -6), T.studiodo + 0.4, null, "rise") + at(camera(760, 1330, 1.0, "#fff3e4", "#3a64ff", "#14122b", 6), T.studiodo + 0.9, null, "rise")
    + badge(540, 1650, "Multi kamera", INK, T.studiodo + 1.6, 420),
    html: tx("Di STUDIODO ada *multi kamera.*", T.studiodo, null, "left:120px;top:310px;font-size:112px;line-height:1", "big") });
  // 3 second camera = Sudut 2 (like the admin panel)
  const camRow = (y: number, title: string, tag: string, tagC: string, body: string, acc: string, t: number) =>
    at(`<g transform="translate(540 ${y})"><rect x="-400" y="-130" width="800" height="260" rx="40" style="fill:#fff"/>${camera(-260, 0, 0.5, body, acc)}<text x="-110" y="-20" font-family="Bricolage,sans-serif" font-weight="800" font-size="52" style="fill:${INK}">${title}</text><rect x="-110" y="20" width="${tag.length * 24 + 50}" height="60" rx="30" style="fill:${tagC}"/><text x="${-110 + (tag.length * 24 + 50) / 2}" y="62" text-anchor="middle" font-family="InterK,sans-serif" font-weight="800" font-size="30" style="fill:#fff">${tag}</text></g>`, t);
  SC.push({ i: 3, bg: "#14122b", dark: true, from: "50% 100%", art:
    dot(130, 560, 100, "#2a2550") + dot(960, 1400, 150, "#2a2550") + plus(930, 560, 34, YEL, 0.2)
    + camRow(1130, "Kamera utama", "Utama", BLUE, "#2b2f6b", ORG, T.pasang + 0.3)
    + camRow(1430, "Kamera tambahan", "Sudut 2", "#ff6fa5", "#fff3e4", "#3a64ff", T.pasang + 1.2),
    html: tx("Pasang kamera kedua sebagai *Sudut 2.*", T.pasang, null, "left:120px;top:310px;font-size:100px;line-height:1;color:#fff", "big") });
  // 4 alternate mode
  const alt = (x: number, n: number, who: string, c: string, t: number) => at(`<g>${shot(x, 1320, 270, 380, c, 1)}</g><text x="${x}" y="1470" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="64" style="fill:#fff">${n}</text><g transform="translate(${x} 1590)"><rect x="-120" y="-38" width="240" height="76" rx="38" style="fill:${c}"/><text x="0" y="12" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="38" style="fill:#fff">${who}</text></g>`, t);
  SC.push({ i: 4, bg: BLUE, dark: true, from: "50% 50%", art:
    dot(130, 1000, 100, "#3a64ff") + dot(960, 1560, 150, "#3a64ff") + star(980, 700, 30, YEL, 0.3)
    + alt(270, 1, "Utama", ORG, T.foto1 + 0.3) + alt(540, 2, "Sudut 2", "#ff6fa5", T.foto2 + 0.3) + alt(810, 3, "Utama", ORG, T.foto2 + 1.4),
    html: tx("Mode *bergantian:*", T.gantian, T.foto1 - 0.1, "left:120px;top:310px;font-size:124px;line-height:1;color:#fff", "big") + tx("Foto 1 dari *kamera utama,*", T.foto1, T.foto2 - 0.1, "left:120px;top:310px;font-size:100px;line-height:1;color:#fff", "big") + tx("foto 2 dari *Sudut 2.*", T.foto2, null, "left:120px;top:310px;font-size:112px;line-height:1;color:#fff", "big") });
  // 5 dual mode + customer picks on the Preview screen
  SC.push({ i: 5, bg: MINT, dark: false, from: "10% 90%", art:
    blob(880, 480, 210, "#7af0bd") + dot(120, 1560, 90, "#7af0bd") + star(940, 1450, 30, INK, 0.3)
    + at(`<g>${shot(330, 1300, 330, 420, ORG, 1)}</g>`, T.jepret + 0.5) + at(`<g>${shot(750, 1300, 330, 420, "#ff6fa5", 1)}</g>`, T.jepret + 0.9)
    + badge(330, 1600, "Utama", ORG, T.jepret + 0.6, 220) + badge(750, 1600, "Sudut 2", "#ff6fa5", T.jepret + 1.0, 220)
    + at(`<g transform="translate(750 1300)"><rect x="-176" y="-226" width="352" height="452" rx="30" style="fill:none;stroke:${INK};stroke-width:12"/></g>` + tick(900, 1110, 40), T.pilih + 0.4)
    + badge(540, 1000, "Preview: pilih sudut", INK, T.pilih + 0.2, 560),
    html: tx("Mode *dua sudut:*", T.dua, T.jepret - 0.1, "left:120px;top:310px;font-size:124px;line-height:1", "big") + tx("Satu jepretan, *dua foto sekaligus.*", T.jepret, T.pilih - 0.1, "left:120px;top:310px;font-size:92px;line-height:1", "big") + tx("Pelanggan *pilih sendiri.*", T.pilih, null, "left:120px;top:310px;font-size:104px;line-height:1", "big") });
  // 6 one booth, two perspectives
  SC.push({ i: 6, bg: LIL, dark: false, from: "90% 20%", art:
    blob(860, 500, 220, "#dccdff") + dot(130, 1560, 80, "#b49cff") + plus(930, 1560, 30, INK, 0.2) + star(120, 900, 28, INK, 0.3)
    + at(P({ x: 540, y: 1700, s: 0.78, expr: "senang", hair: "curly", skin: 2, pose: "up", color: 2, jacket: "#fff3e4" }), T.perspektif + 0.2)
    + at(camera(190, 1250, 0.62, "#2b2f6b", ORG, "#14122b", 14), T.perspektif + 0.4) + at(camera(890, 1250, 0.62, "#fff3e4", "#3a64ff", "#14122b", -14), T.perspektif + 0.6),
    html: tx("Satu booth, *dua perspektif.*", T.perspektif, null, "left:120px;top:310px;font-size:112px;line-height:1", "big") });
  // 7 reveal
  SC.push({ i: 7, bg: "#ffffff", dark: false, from: "50% 50%", art:
    [[160, 520, 40, ORG], [900, 600, 50, BLUE], [200, 1400, 60, YEL], [880, 1380, 44, PINK], [540, 440, 30, MINT]].map(([x, y, r, c], i) => at(dot(x as number, y as number, r as number, c as string, 0.1 * i), T.brand + 0.1 * i)).join(""),
    html: `<img class="biglogo" src="${wordmark("ink")}" alt="STUDIODO" style="--t:${s(T.brand)}">` + tx("Variasi foto, *tanpa ribet.*", T.brand + 0.25, null, "left:0;right:0;top:1120px;text-align:center;font-size:92px", "mid") + `<div class="flash" style="--t:${s(T.brand)}"></div>` });
  // 8 CTA: tag a friend
  SC.push({ i: 8, bg: TEAL, dark: true, from: "50% 100%", art:
    blob(160, 520, 190, "#37cdbf") + dot(940, 420, 60, YEL, 0.2) + plus(100, 1560, 30, "#fff", 0.4)
    + at(P({ x: 250, y: 1700, s: 0.78, expr: "senang", hair: "short", skin: 2, pose: "point", color: 1, jacket: "#fff3e4" }), T.tag + 0.4)
    + at(camera(600, 1560, 0.8, "#fff3e4", ORG), T.tag + 0.6)
    + at(P({ x: 880, y: 1700, s: 0.78, expr: "kaget", hair: "hijab", skin: 1, pose: "wave", color: 3 }), T.tag + 0.8),
    html: tx("Tag temanmu yang suka *eksperimen sudut.*", T.tag, null, "left:120px;top:310px;font-size:96px;line-height:1;color:#fff", "big")
      + `<div class="btn" style="--t:${s(T.tombol)};top:790px">Tag di komentar ↓</div>` + tx("studiodo.id", T.tombol + 0.6, null, "left:120px;top:970px;font-size:56px;color:#fff", "url") });
  void CREAM;
  return assembleReel(SC, STARTS, DURATION, CAM_CSS);
}

export const SFX: SfxEvent[] = [
  ...[T.satu, T.dari, T.studiodo, T.pasang, T.gantian, T.dua, T.perspektif, T.tag].map((t): SfxEvent => ["whoosh", Math.max(0, t - 0.12), 0.28]),
  ...STARTS.slice(1).map((t): SfxEvent => ["swoosh", t - 0.05, 0.4]),
  ["pop", T.satu + 0.5, 0.4], ["pop", T.satu + 1.2, 0.35],
  ...Array.from({ length: 10 }, (_, i): SfxEvent => ["tick", T.dari + 0.9 + i * 0.4, 0.3]), ["beepLow", T.dari + 5.2, 0.35],
  ["pop", T.studiodo + 0.4, 0.45], ["pop", T.studiodo + 0.9, 0.45], ["sparkle", T.studiodo + 1.6, 0.35],
  ["pop", T.pasang + 0.3, 0.45], ["pop", T.pasang + 1.2, 0.45], ["ding", T.pasang + 1.8, 0.4],
  ["shutter", T.foto1 + 0.3, 0.5], ["shutter", T.foto2 + 0.3, 0.5], ["shutter", T.foto2 + 1.4, 0.5],
  ["pop", T.jepret + 0.5, 0.4], ["shutter", T.jepret + 0.6, 0.5], ["pop", T.jepret + 0.9, 0.4], ["ding", T.pilih + 0.4, 0.5],
  ["pop", T.perspektif + 0.4, 0.4], ["pop", T.perspektif + 0.6, 0.4], ["sparkle", T.perspektif + 1.0, 0.35],
  ["boom", T.brand, 0.9], ["sparkle", T.brand + 0.1, 0.4], ["beepHi", T.brand + 0.05, 0.25],
  ["pop", T.tombol, 0.5], ["ding", T.tombol + 0.2, 0.4], ["sparkle", T.tombol + 0.5, 0.3],
];
