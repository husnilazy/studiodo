import { wordmark } from "./theme.js";
import { assembleReel, at, blob, BLUE, booth, CREAM, dot, INK, LIL, MINT, ORG, P, PINK, plus, s, scIdle, star, TEAL, tx, vis, YEL, type Sc } from "./heroReel2.js";
import { chip, GREEN, RED, stamp, tick } from "./reelParts.js";
import { CAM_CSS, camera, laptop, shot, slider } from "./reelCam.js";
import type { SfxEvent } from "./sfx.js";

// Reel 11: "Sore terang, malam gelap: lari ke booth buat ubah setelan kamera?"  Feature: kontrol-kamera (ISO, shutter, aperture, white balance from the
// dashboard, live view alongside, settings saved). Catalog check: only for cameras supported by digiCamControl. CTA: "coba".

export const MUSIC = "house" as const;
export const VO_FILE = "vo-kontrol.mp3";
export const T = { sore: 0.86, malam: 2.75, suram: 4.58, lari: 6.66, studiodo: 11.03, atur: 12.16, tanpa: 16.77, live: 18.51, simpan: 22.12, pas: 23.93, brand: 26.49, coba: 27.52, tombol: 28.2 };
export const DURATION = 30.7;
const STARTS = [0, T.malam - 0.1, T.suram - 0.1, T.lari - 0.1, T.studiodo - 0.1, T.tanpa - 0.1, T.live - 0.1, T.pas - 0.1, T.brand - 0.1, T.coba - 0.1];

const sun = (x: number, y: number, r: number, t: number) => at(`<g transform="translate(${x} ${y})">${Array.from({ length: 12 }, (_, i) => `<rect x="-8" y="${-r - 44}" width="16" height="34" rx="8" transform="rotate(${i * 30})" style="fill:${ORG}"/>`).join("")}<circle r="${r}" style="fill:${ORG}"/></g>`, t, null, "rise");
const moon = (x: number, y: number, r: number, t: number) => at(`<g transform="translate(${x} ${y})"><circle r="${r}" style="fill:#fff3c4"/><circle cx="${r * 0.42}" cy="${-r * 0.18}" r="${r * 0.86}" style="fill:#14122b"/></g>`, t, null, "rise");

export function buildReelDoc(): { html: string; durationSec: number } {
  const SC: Sc[] = [];
  const sliders = (x: number, y0: number, w: number, t0: number, dt: number, v = [0.35, 0.55, 0.45, 0.6], vals = ["200", "1/125", "f/4", "5200K"]) =>
    [["ISO", ORG], ["Shutter", BLUE], ["Aperture", "#7b5cff"], ["White balance", TEAL]].map(([l, c], i) => slider(x, y0 + i * 125, w, l as string, vals[i], v[i], c as string, t0 + i * dt)).join("");
  // 0 afternoon: bright venue
  SC.push({ i: 0, bg: YEL, dark: false, from: "50% 50%", art:
    blob(180, 520, 200, "#ffe27a") + dot(950, 1560, 90, ORG, 0.2) + plus(110, 1560, 32, INK, 0.3)
    + sun(840, 1000, 80, T.sore + 0.4) + at(shot(430, 1400, 400, 500, PINK, 1, "Terang"), T.sore + 0.8),
    html: tx("Sore, lampu venue *masih terang.*", T.sore, null, "left:120px;top:325px;font-size:104px;line-height:1", "big") });
  // 1 night: it gets dark
  SC.push({ i: 1, bg: "#14122b", dark: true, from: "50% 100%", art:
    dot(130, 560, 100, "#2a2550") + dot(960, 1500, 150, "#2a2550") + star(930, 760, 30, YEL, 0.2)
    + moon(820, 1000, 80, T.malam + 0.4) + at(shot(430, 1400, 400, 500, PINK, 0.55, "Mulai gelap"), T.malam + 0.7),
    html: tx("Malam, *mendadak gelap.*", T.malam, null, "left:120px;top:325px;font-size:118px;line-height:1;color:#fff", "big") });
  // 2 the photo gets gloomy
  SC.push({ i: 2, bg: "#2a2550", dark: true, from: "50% 50%", art:
    dot(130, 1000, 100, "#3a3470") + dot(960, 1560, 120, "#3a3470") + plus(930, 760, 34, YEL, 0.2)
    + at(shot(540, 1330, 480, 600, PINK, 0.8), T.suram + 0.4) + stamp(540, 1720, "TERLALU GELAP", RED, -4, T.suram + 1.2, 54),
    html: tx("Foto di booth *jadi suram.*", T.suram, null, "left:120px;top:325px;font-size:112px;line-height:1;color:#fff", "big") });
  // 3 running to the booth, changing settings one by one
  SC.push({ i: 3, bg: PINK, dark: false, from: "90% 50%", art:
    blob(180, 520, 200, "#ffb3cf") + dot(950, 1560, 90, "#ff6fa5", 0.2) + plus(110, 1560, 32, INK, 0.1)
    + at(P({ x: 300, y: 1700, s: 0.8, expr: "khawatir", hair: "bun", skin: 2, pose: "up", color: 1 }), T.lari + 0.4)
    + at(camera(760, 1330, 1.0, "#2b2f6b", ORG), T.lari + 0.6)
    + chip(700, 1030, "ISO", "#fff", INK, T.lari + 2.0, 240, 40) + chip(820, 1130, "Shutter", "#fff", INK, T.lari + 2.8, 300, 40) + chip(700, 1560, "Aperture", "#fff", INK, T.lari + 3.6, 320, 40) + chip(840, 1660, "WB", "#fff", INK, T.lari + 4.2, 200, 40),
    html: tx("Lari ke booth, buka kamera, *ubah satu per satu.*", T.lari, null, "left:120px;top:325px;font-size:84px;line-height:1", "big") });
  // 4 STUDIODO: from the dashboard
  SC.push({ i: 4, bg: BLUE, dark: true, from: "50% 50%", art:
    dot(130, 1000, 100, "#3a64ff") + dot(960, 1560, 150, "#3a64ff") + star(980, 700, 30, YEL, 0.3)
    + at(`<rect x="100" y="1020" width="880" height="620" rx="40" style="fill:#0f1330;opacity:.35"/>`, T.studiodo + 0.3)
    + sliders(150, 1130, 780, T.atur + 0.2, 1.1),
    html: tx("Di STUDIODO, atur *dari dashboard.*", T.studiodo, T.atur - 0.1, "left:120px;top:325px;font-size:100px;line-height:1;color:#fff", "big") + tx("ISO, shutter, aperture, *white balance.*", T.atur, null, "left:120px;top:325px;font-size:96px;line-height:1;color:#fff", "big") });
  // 5 without touching the camera
  SC.push({ i: 5, bg: MINT, dark: false, from: "10% 90%", art:
    blob(880, 480, 210, "#7af0bd") + dot(120, 1560, 90, "#7af0bd") + star(940, 1450, 30, INK, 0.3)
    + at(camera(260, 1500, 1.0, "#2b2f6b", ORG), T.tanpa + 0.3)
    + at(`<path d="M400 1400 C470 1280 560 1250 640 1250" style="fill:none;stroke:${INK};stroke-width:10;stroke-linecap:round;stroke-dasharray:4 24"/>`, T.tanpa + 0.8)
    + at(laptop(760, 1250, 0.95, `<rect x="-150" y="-80" width="300" height="42" rx="21" style="fill:#e4e7f7"/><rect x="-150" y="-80" width="170" height="42" rx="21" style="fill:${ORG}"/><circle cx="20" cy="-59" r="20" style="fill:#fff;stroke:${ORG};stroke-width:6"/><rect x="-150" y="0" width="300" height="42" rx="21" style="fill:#e4e7f7"/><rect x="-150" y="0" width="110" height="42" rx="21" style="fill:${BLUE}"/><circle cx="-40" cy="21" r="20" style="fill:#fff;stroke:${BLUE};stroke-width:6"/>`), T.tanpa + 0.6)
    + chip(540, 1700, "Tanpa menyentuh kamera", "#fff", INK, T.tanpa + 1.4, 700, 40),
    html: tx("Tanpa *menyentuh kameranya.*", T.tanpa, null, "left:120px;top:325px;font-size:112px;line-height:1", "big") });
  // 6 live view alongside, saved
  SC.push({ i: 6, bg: LIL, dark: false, from: "90% 20%", art:
    blob(860, 500, 220, "#dccdff") + dot(130, 1560, 80, "#b49cff") + plus(930, 1560, 30, INK, 0.2) + star(120, 900, 28, INK, 0.3)
    + at(laptop(540, 1300, 1.5, ""), T.live + 0.3)
    + `<g transform="translate(540 1300) scale(1.5)">${vis(shot(0, 0, 160, 200, PINK, 0.5), T.live + 0.5, T.live + 2.6)}${vis(shot(0, 0, 160, 200, PINK, 1), T.live + 2.6, null)}</g>`
    + chip(540, 1700, "Live view", "#fff", INK, T.live + 0.9, 300, 40) + chip(780, 1560, "Tersimpan", GREEN, "#fff", T.simpan + 0.2, 320, 38) + at(tick(640, 1560, 26, "#fff"), T.simpan + 0.5),
    html: tx("Live view di sebelahnya: *hasil langsung kelihatan.*", T.live, T.simpan - 0.1, "left:120px;top:325px;font-size:88px;line-height:1", "big") + tx("Setelan *tersimpan.*", T.simpan, null, "left:120px;top:325px;font-size:116px;line-height:1", "big") });
  // 7 the settings are right, nobody ran anywhere
  SC.push({ i: 7, bg: CREAM, dark: false, from: "20% 50%", art:
    blob(860, 520, 220, "#ffe3c4") + dot(110, 1560, 70, "#ffd0d8") + plus(930, 1560, 30, ORG, 0.3)
    + at(shot(760, 1360, 360, 460, PINK, 1, "Pas"), T.pas + 0.4)
    + at(P({ x: 290, y: 1700, s: 0.8, expr: "lega", hair: "bun", skin: 2, pose: "up", color: 2, jacket: "#fff3e4" }), T.pas + 0.2),
    html: tx("Setelan pas, *tanpa lari-lari.*", T.pas, null, "left:120px;top:325px;font-size:112px;line-height:1", "big") });
  // 8 reveal
  SC.push({ i: 8, bg: "#ffffff", dark: false, from: "50% 50%", art:
    [[160, 520, 40, ORG], [900, 600, 50, BLUE], [200, 1400, 60, YEL], [880, 1380, 44, PINK], [540, 440, 30, MINT]].map(([x, y, r, c], i) => at(dot(x as number, y as number, r as number, c as string, 0.1 * i), T.brand + 0.1 * i)).join(""),
    html: `<img class="biglogo" src="${wordmark("ink")}" alt="STUDIODO" style="--t:${s(T.brand)}">` + tx("Kamera diatur *dari jauh.*", T.brand + 0.25, null, "left:0;right:0;top:1120px;text-align:center;font-size:92px", "mid") + `<div class="flash" style="--t:${s(T.brand)}"></div>` });
  // 9 CTA: try it free
  SC.push({ i: 9, bg: TEAL, dark: true, from: "50% 100%", art:
    blob(160, 520, 190, "#37cdbf") + dot(940, 420, 60, YEL, 0.2) + plus(100, 1560, 30, "#fff", 0.4)
    + at(P({ x: 250, y: 1700, s: 0.78, expr: "senang", hair: "short", skin: 2, pose: "wave", color: 1, jacket: "#fff3e4" }), T.coba + 0.4)
    + at(camera(600, 1560, 0.8, "#fff3e4", ORG), T.coba + 0.6)
    + at(P({ x: 880, y: 1700, s: 0.78, expr: "lega", hair: "hijab", skin: 1, pose: "up", color: 3 }), T.coba + 0.8),
    html: tx("Atur kamera *dari dashboard.*", T.coba, null, "left:120px;top:325px;font-size:104px;line-height:1;color:#fff", "big")
      + `<div class="btn" style="--t:${s(T.tombol)};top:760px">Coba gratis →</div>` + tx("studiodo.id", T.tombol + 0.6, null, "left:120px;top:940px;font-size:56px;color:#fff", "url") });
  void booth; void scIdle; void star;
  return assembleReel(SC, STARTS, DURATION, CAM_CSS);
}

export const SFX: SfxEvent[] = [
  ...[T.sore, T.malam, T.suram, T.lari, T.studiodo, T.tanpa, T.live, T.pas, T.coba].map((t): SfxEvent => ["whoosh", Math.max(0, t - 0.12), 0.28]),
  ...STARTS.slice(1).map((t): SfxEvent => ["swoosh", t - 0.05, 0.4]),
  ["pop", T.sore + 0.4, 0.4], ["pop", T.sore + 0.8, 0.4], ["sparkle", T.sore + 1.2, 0.3],
  ["pop", T.malam + 0.4, 0.4], ["pop", T.malam + 0.7, 0.4], ["beepLow", T.malam + 1.2, 0.35],
  ["pop", T.suram + 0.4, 0.4], ["thud", T.suram + 1.2, 0.5], ["buzz", T.suram + 1.2, 0.4],
  ["pop", T.lari + 0.4, 0.4], ["pop", T.lari + 0.6, 0.4], ...[2.0, 2.8, 3.6, 4.2].map((d): SfxEvent => ["tick", T.lari + d, 0.4]),
  ["pop", T.studiodo + 0.3, 0.4], ...[0.2, 1.3, 2.4, 3.5].map((d): SfxEvent => ["pop", T.atur + d, 0.4]), ["zap", T.atur + 1.3, 0.25], ["ding", T.atur + 4.6, 0.4],
  ["pop", T.tanpa + 0.3, 0.4], ["zap", T.tanpa + 0.8, 0.3], ["pop", T.tanpa + 0.6, 0.4], ["ding", T.tanpa + 1.4, 0.4],
  ["pop", T.live + 0.3, 0.4], ["shutter", T.live + 2.6, 0.5], ["sparkle", T.live + 2.7, 0.4], ["ding", T.simpan + 0.3, 0.5],
  ["pop", T.pas + 0.2, 0.4], ["pop", T.pas + 0.4, 0.4], ["sparkle", T.pas + 0.9, 0.4],
  ["boom", T.brand, 0.9], ["sparkle", T.brand + 0.1, 0.4], ["beepHi", T.brand + 0.05, 0.25],
  ["pop", T.tombol, 0.5], ["ding", T.tombol + 0.2, 0.4], ["sparkle", T.tombol + 0.5, 0.3],
];
