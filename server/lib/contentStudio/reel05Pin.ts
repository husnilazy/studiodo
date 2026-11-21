import { wordmark } from "./theme.js";
import { assembleReel, at, blob, BLUE, booth, dot, INK, LIL, MINT, ORG, P, PINK, plus, s, scIdle, star, tx, vis, YEL, type Sc } from "./heroReel2.js";
import { chip, GREEN, lock, RED, row, tick } from "./reelParts.js";
import type { SfxEvent } from "./sfx.js";

// Reel 05: "Anak SD ini baru saja mengobrak-abrik pengaturan booth-mu."  Feature: pin-operator (operator console behind a PIN pad;
// corner + number of taps configurable; crew-only access). CTA type: "link" (details in the bio link), not "coba gratis".
// The scene (a kid tapping the screen) is a light, illustrative story; nobody is blamed.

export const MUSIC = "chill" as const;
export const VO_FILE = "vo-pin.mp3";
export const T = { anak: 0.9, sudut: 3.88, kacau: 8.45, bayangin: 13.31, ketuk: 16.54, kru: 18.98, studiodo: 21.55, link: 22.99, tombol: 24.3 };
export const DURATION = 27.3;
const STARTS = [0, T.sudut - 0.1, T.kacau - 0.1, T.bayangin - 0.1, T.ketuk - 0.1, T.kru - 0.1, T.studiodo - 0.1, T.link - 0.1];

const ripple = (x: number, y: number, t: number) => at(`<g transform="translate(${x} ${y})"><circle r="46" style="fill:none;stroke:${ORG};stroke-width:10"/><circle r="14" style="fill:${ORG}"/></g>`, t, t + 1.6);
const pad = (x: number, y: number, sc: number, dots: number[], t0: number) => {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k, i) => k ? `<g transform="translate(${(i % 3) * 120 - 120} ${Math.floor(i / 3) * 112})"><rect x="-48" y="-44" width="96" height="88" rx="24" style="fill:#2b2f6b"/><text x="0" y="14" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="40" style="fill:#fff">${k}</text></g>` : "").join("");
  const dotsSvg = [0, 1, 2, 3].map((i) => `<circle cx="${i * 56 - 84}" cy="-110" r="16" style="fill:rgba(255,255,255,.25)"/>`).join("") + dots.map((d, i) => `<g class="an pop" style="--t:${s(t0 + d)}"><circle cx="${i * 56 - 84}" cy="-110" r="16" style="fill:${YEL}"/></g>`).join("");
  return `<g transform="translate(${x} ${y}) scale(${sc})"><rect x="-210" y="-210" width="420" height="640" rx="44" style="fill:#14122b"/><text x="0" y="-160" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="30" style="fill:#fff">Masukkan PIN</text>${dotsSvg}<g transform="translate(0 -20)">${keys}</g></g>`;
};

export function buildReelDoc(): { html: string; durationSec: number } {
  const SC: Sc[] = [];
  // 0 a kid taps the booth screen
  SC.push({ i: 0, bg: YEL, dark: false, from: "50% 50%", art:
    blob(180, 520, 200, "#ffe27a") + dot(950, 1480, 90, ORG, 0.2) + plus(110, 1500, 32, INK, 0.3)
    + booth(660, 1700, 1.1, [{ html: scIdle(), t: 0, o: null }])
    + at(P({ x: 220, y: 1250, s: 0.6, expr: "senang", hair: "short", skin: 2, pose: "point", color: 1, shoe: ORG }), T.anak + 0.3)
    + ripple(560, 1190, T.anak + 1.2) + ripple(760, 1190, T.anak + 1.8),
    html: tx("Anak iseng *ketuk-ketuk* layar booth-mu.", T.anak, null, "left:120px;top:310px;font-size:88px;line-height:1", "big") });
  // 1 corners tapped -> settings open
  SC.push({ i: 1, bg: ORG, dark: true, from: "10% 90%", art:
    dot(140, 1450, 110, "#ff8a50") + dot(960, 560, 70, YEL, 0.3) + plus(930, 1500, 34, "#fff", 0.2)
    + `<rect x="190" y="880" width="700" height="520" rx="46" style="fill:#14122b"/>`
    + at(`<g transform="translate(250 940)"><circle r="40" style="fill:${YEL}"/><text x="0" y="14" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="40" style="fill:${INK}">1</text></g>`, T.sudut + 0.6)
    + at(`<g transform="translate(830 940)"><circle r="40" style="fill:${YEL}"/><text x="0" y="14" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="40" style="fill:${INK}">2</text></g>`, T.sudut + 1.4)
    + at(`<g transform="translate(540 1170)"><rect x="-260" y="-110" width="520" height="220" rx="34" style="fill:#fff"/><text x="0" y="-30" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="44" style="fill:${INK}">Pengaturan</text><text x="0" y="40" text-anchor="middle" font-family="InterK,sans-serif" font-weight="700" font-size="30" style="fill:${RED}">terbuka tanpa kunci!</text></g>`, T.sudut + 2.0, null, "stamp"),
    html: tx("Pojok kiri, pojok kanan, dan... *pengaturan terbuka.*", T.sudut, null, "left:120px;top:310px;font-size:96px;line-height:1;color:#fff", "big") });
  // 2 chaos: prices and look messed up
  SC.push({ i: 2, bg: PINK, dark: false, from: "90% 20%", art:
    blob(180, 520, 200, "#ffb3cf") + dot(960, 1480, 90, "#ff6fa5", 0.2) + plus(110, 1500, 32, INK, 0.1)
    + row(540, 980, "Paket Strip 4 foto", "Rp 1.000.000", RED, T.kacau + 0.5, 780, { txt: "BERUBAH", bg: YEL, fg: INK })
    + row(540, 1160, "Paket Cetak tambahan", "Rp 1", RED, T.kacau + 1.1, 780, { txt: "BERUBAH", bg: YEL, fg: INK })
    + chip(540, 1340, "Tampilan berantakan", "#fff", INK, T.kacau + 1.8, 520, 32) + at(P({ x: 880, y: 1330, s: 0.5, expr: "kaget", hair: "curly", skin: 3, pose: "up", color: 2 }), T.kacau + 2.0),
    html: tx("Harga paket berubah, *tampilan berantakan.*", T.kacau, null, "left:120px;top:310px;font-size:100px;line-height:1", "big") });
  // 3 imagine: a PIN pad
  SC.push({ i: 3, bg: BLUE, dark: true, from: "50% 50%", art:
    dot(130, 1000, 100, "#3a64ff") + dot(960, 1500, 150, "#3a64ff") + star(980, 700, 30, YEL, 0.3)
    + at(pad(540, 1130, 1.0, [], 0) + lock(830, 930, 1.0, YEL), T.bayangin + 0.8, null, "rise"),
    html: tx("Sekarang bayangin konsol operator *dikunci PIN.*", T.bayangin, null, "left:120px;top:310px;font-size:100px;line-height:1;color:#fff", "big") });
  // 4 tap the right corner, type the PIN, it opens
  SC.push({ i: 4, bg: MINT, dark: false, from: "10% 50%", art:
    blob(880, 480, 210, "#7af0bd") + dot(120, 1450, 90, "#7af0bd") + star(940, 1360, 30, INK, 0.3)
    + at(`<rect x="190" y="880" width="700" height="540" rx="46" style="fill:#14122b"/><g transform="translate(250 940)"><circle r="58" style="fill:${YEL}"/><text x="0" y="10" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="26" style="fill:${INK}">sudut</text></g>`, T.ketuk + 0.3)
    + at(pad(540, 1130, 0.9, [0.9, 1.3, 1.7, 2.1], T.ketuk + 1.2), T.ketuk + 1.0)
    + vis(tick(540, 1130, 120), T.ketuk + 3.6, null) + vis(chip(540, 1380, "Konsol terbuka", GREEN, "#fff", 0, 420, 34).replace('class="an pop"', 'class=""'), T.ketuk + 3.6, null),
    html: tx("Ketuk sudut yang benar, *masukin PIN,* baru kebuka.", T.ketuk, null, "left:120px;top:310px;font-size:92px;line-height:1", "big") });
  // 5 only the crew knows
  SC.push({ i: 5, bg: LIL, dark: false, from: "90% 50%", art:
    blob(860, 500, 220, "#dccdff") + dot(130, 1500, 80, "#b49cff") + plus(930, 1500, 30, INK, 0.2) + star(120, 880, 28, INK, 0.3)
    + at(P({ x: 300, y: 1080, s: 0.95, expr: "senang", hair: "hijab", skin: 1, pose: "hold", color: 2, jacket: INK }), T.kru + 0.2)
    + at(P({ x: 640, y: 1100, s: 0.9, expr: "senang", hair: "short", skin: 2, pose: "point", color: 1 }), T.kru + 0.4)
    + chip(300, 860, "Kru", YEL, INK, T.kru + 0.8, 220, 34) + chip(780, 900, "Hanya yang tahu PIN", "#fff", INK, T.kru + 1.2, 520, 30) + at(lock(850, 1240, 1.3, INK), T.kru + 1.6, null, "stamp"),
    html: tx("Cuma kru *yang tahu.*", T.kru, null, "left:120px;top:310px;font-size:140px;line-height:.98", "big") });
  // 6 reveal
  SC.push({ i: 6, bg: "#ffffff", dark: false, from: "50% 50%", art:
    [[160, 520, 40, ORG], [900, 600, 50, BLUE], [200, 1400, 60, YEL], [880, 1380, 44, PINK], [540, 440, 30, MINT]].map(([x, y, r, c], i) => at(dot(x as number, y as number, r as number, c as string, 0.1 * i), T.studiodo + 0.1 * i)).join(""),
    html: `<img class="biglogo" src="${wordmark("ink")}" alt="STUDIODO" style="--t:${s(T.studiodo)}">` + tx("Itu *STUDIODO.*", T.studiodo + 0.25, null, "left:0;right:0;top:1120px;text-align:center;font-size:104px", "mid") + `<div class="flash" style="--t:${s(T.studiodo)}"></div>` });
  // 7 CTA: link in bio
  SC.push({ i: 7, bg: BLUE, dark: true, from: "50% 100%", art:
    dot(120, 330, 90, "#3a64ff") + dot(960, 760, 130, "#3a64ff") + plus(940, 330, 34, YEL, 0) + star(120, 900, 30, YEL, 0.4)
    + at(P({ x: 250, y: 1300, s: 0.78, expr: "senang", hair: "bun", skin: 0, pose: "wave", color: 2, jacket: "#fff3e4" }), T.link + 0.4)
    + at(P({ x: 560, y: 1320, s: 0.75, expr: "senang", hair: "long", skin: 1, pose: "up", color: 1, shoe: YEL }), T.link + 0.6)
    + at(P({ x: 850, y: 1300, s: 0.78, expr: "senang", hair: "curly", skin: 2, pose: "point", color: 3, glasses: true }), T.link + 0.8),
    html: tx("Info lengkapnya *ada di link bio.*", T.link, null, "left:120px;top:310px;font-size:112px;line-height:.98;color:#fff", "big")
      + `<div class="btn" style="--t:${s(T.tombol)};top:700px">Buka link di bio ↑</div>` + tx("studiodo.id", T.tombol + 0.6, null, "left:120px;top:880px;font-size:60px;color:#fff", "url") });
  void RED;
  return assembleReel(SC, STARTS, DURATION);
}

export const SFX: SfxEvent[] = [
  ...[T.anak, T.sudut, T.kacau, T.bayangin, T.ketuk, T.kru, T.link].map((t): SfxEvent => ["whoosh", t - 0.12, 0.28]),
  ...STARTS.slice(1).map((t): SfxEvent => ["swoosh", t - 0.05, 0.4]),
  ["tick", T.anak + 1.2, 0.5], ["tick", T.anak + 1.8, 0.5], ["pop", T.anak + 0.3, 0.35],
  ["tick", T.sudut + 0.6, 0.5], ["tick", T.sudut + 1.4, 0.5], ["buzz", T.sudut + 2.0, 0.7], ["thud", T.sudut + 2.0, 0.7],
  ["pop", T.kacau + 0.5, 0.4], ["pop", T.kacau + 1.1, 0.4], ["pop", T.kacau + 1.8, 0.4], ["beepLow", T.kacau + 1.1, 0.4],
  ["pop", T.bayangin + 0.8, 0.45], ["thud", T.bayangin + 1.0, 0.6], ["sparkle", T.bayangin + 1.1, 0.3],
  ["pop", T.ketuk + 0.3, 0.4], ...[0.9, 1.3, 1.7, 2.1].map((d): SfxEvent => ["tick", T.ketuk + 1.2 + d, 0.5]), ["ding", T.ketuk + 3.6, 0.55], ["sparkle", T.ketuk + 3.7, 0.35],
  ["pop", T.kru + 0.2, 0.4], ["pop", T.kru + 0.8, 0.4], ["thud", T.kru + 1.6, 0.8],
  ["boom", T.studiodo, 0.9], ["sparkle", T.studiodo + 0.1, 0.4], ["beepHi", T.studiodo + 0.05, 0.25],
  ["pop", T.tombol, 0.5], ["ding", T.tombol + 0.2, 0.4], ["sparkle", T.tombol + 0.5, 0.3],
];
