import { wordmark } from "./theme.js";
import { assembleReel, at, blob, BLUE, CREAM, dot, INK, LIL, MINT, ORG, P, PINK, plus, s, star, TEAL, tx, YEL, type Sc } from "./heroReel2.js";
import { chip, cross, GREEN, RED, stamp, tick } from "./reelParts.js";
import { CAM_CSS, cable, camera, laptop, webcam } from "./reelCam.js";
import type { SfxEvent } from "./sfx.js";

// Reel 09: "Kamera Canon-mu bagus. Tapi disambungin ke booth?"  Feature: kamera-sdk (bridge Canon/Sony bawaan, kamera terdeteksi otomatis,
// tanpa instalasi tambahan). Claims stay literal: NOT "resmi"/"terbukti" (the catalog says it is untested on a physical Canon/Sony camera). CTA: "simpan".

export const MUSIC = "techno" as const;
export const VO_FILE = "vo-kamera.mp3";
export const T = { bagus: 0.0, tapi: 1.94, harus: 3.92, ujung: 8.95, webcam: 10.93, bridge: 13.35, sdk: 14.5, sony: 18.3, hubung: 20.26, deteksi: 21.95, pilih: 23.91, tanpa: 26.4, colok: 28.31, studiodo: 30.38, tanya: 31.52, simpan: 33.6 };
export const DURATION = 37.3;
const STARTS = [0, T.tapi - 0.1, T.harus - 0.1, T.webcam - 0.1, T.bridge - 0.1, T.hubung - 0.1, T.tanpa - 0.1, T.studiodo - 0.1, T.tanya - 0.1];

const label = (x: number, y: number, txt: string, c: string, fg: string, t: number, w = 300, size = 34) => chip(x, y, txt, c, fg, t, w, size);
const listRow = (y: number, name: string, on: boolean, t: number) =>
  at(`<g transform="translate(0 ${y})"><rect x="-166" y="-26" width="332" height="52" rx="16" style="fill:${on ? "#dff7ea" : "#fff"};stroke:${on ? GREEN : "#d6dbf5"};stroke-width:4"/><circle cx="-134" cy="0" r="9" style="fill:${on ? GREEN : "#b8bee6"}"/><text x="-110" y="9" font-family="InterK,sans-serif" font-weight="800" font-size="24" style="fill:${INK}">${name}</text></g>`, t);

export function buildReelDoc(): { html: string; durationSec: number } {
  const SC: Sc[] = [];
  // 0 the camera is good
  SC.push({ i: 0, bg: YEL, dark: false, from: "50% 50%", art:
    blob(180, 520, 200, "#ffe27a") + blob(900, 1500, 160, "#ffd34a") + dot(950, 640, 70, ORG, 0.2) + plus(120, 1480, 34, INK, 0.3) + star(960, 1380, 30, INK, 0.1)
    + at(camera(540, 1290, 2.0, "#2b2f6b", ORG), T.bagus + 0.3, null, "rise")
    + label(380, 1650, "Canon", "#fff", INK, T.bagus + 0.9, 260, 42) + label(700, 1650, "Sony", "#fff", INK, T.bagus + 1.1, 260, 42),
    html: tx("Kamera Canon-mu *bagus.*", T.bagus, null, "left:120px;top:310px;font-size:128px;line-height:.98", "big") });
  // 1 but connecting it to the booth?
  SC.push({ i: 1, bg: CREAM, dark: false, from: "20% 50%", art:
    blob(860, 520, 220, "#ffe3c4") + dot(110, 1500, 70, "#ffd0d8") + plus(930, 1500, 30, ORG, 0.3)
    + camera(260, 1280, 1.0, "#2b2f6b", ORG) + at(laptop(790, 1280, 0.95, `<text x="0" y="14" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="60" style="fill:${INK};opacity:.5">booth</text>`), T.tapi + 0.4)
    + `<path d="M370 1330 C470 1450 620 1450 690 1330" style="fill:none;stroke:${INK};stroke-width:12;stroke-linecap:round;stroke-dasharray:4 26"/>`
    + at(`<text x="530" y="1560" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="170" style="fill:${ORG}">?</text>`, T.tapi + 1.0),
    html: tx("Tapi disambungin ke *booth?*", T.tapi, null, "left:120px;top:310px;font-size:112px;line-height:1", "big") });
  // 2 the install hell, then "not detected"
  SC.push({ i: 2, bg: PINK, dark: false, from: "90% 50%", art:
    blob(180, 520, 200, "#ffb3cf") + dot(950, 1480, 90, "#ff6fa5", 0.2) + plus(110, 1500, 32, INK, 0.1)
    + label(380, 1080, "Software A", "#fff", INK, T.harus + 0.5, 400, 44) + label(700, 1210, "Driver B", "#fff", INK, T.harus + 1.5, 400, 44) + label(380, 1340, "Plugin C", "#fff", INK, T.harus + 2.6, 400, 44) + label(700, 1470, "Update D", "#fff", INK, T.harus + 3.6, 400, 44)
    + at(camera(280, 1640, 0.8, "#2b2f6b", ORG), T.harus + 0.3)
    + stamp(690, 1640, "TIDAK TERDETEKSI", RED, -5, T.ujung + 0.1, 46),
    html: tx("Harus pasang software ini, *driver itu...*", T.harus, T.ujung - 0.1, "left:120px;top:310px;font-size:92px;line-height:1", "big") + tx("Kamera *tidak terdeteksi.*", T.ujung, null, "left:120px;top:310px;font-size:108px;line-height:1", "big") });
  // 3 back to the webcam
  SC.push({ i: 3, bg: "#14122b", dark: true, from: "50% 100%", art:
    dot(130, 560, 100, "#2a2550") + dot(960, 1400, 150, "#2a2550") + plus(930, 560, 34, YEL, 0.2)
    + at(`<g style="opacity:.5">${camera(290, 1330, 1.05, "#46497f", "#8a8fb3")}</g>` + cross(290, 1330, 90, RED), T.webcam + 0.3)
    + at(webcam(770, 1330, 2.1), T.webcam + 1.2, null, "rise")
    + at(P({ x: 540, y: 1700, s: 0.5, expr: "khawatir", hair: "short", skin: 2, pose: "down", color: 1 }), T.webcam + 1.6),
    html: tx("Akhirnya balik lagi ke *webcam.*", T.webcam, null, "left:120px;top:310px;font-size:108px;line-height:1;color:#fff", "big") });
  // 4 STUDIODO: Canon through the official Canon SDK (tested by the owner on a real Canon camera), Sony bridge also built in
  SC.push({ i: 4, bg: BLUE, dark: true, from: "50% 50%", art:
    dot(130, 1000, 100, "#3a64ff") + dot(960, 1500, 150, "#3a64ff") + star(980, 700, 30, YEL, 0.3)
    + at(laptop(540, 1260, 1.4, `<text x="0" y="-84" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="34" style="fill:${INK}">Bridge kamera</text>`
      + at(`<rect x="-150" y="-50" width="300" height="64" rx="20" style="fill:${ORG}"/><text x="0" y="-8" text-anchor="middle" font-family="InterK,sans-serif" font-weight="800" font-size="28" style="fill:#fff">Canon · SDK resmi</text>`, T.sdk)
      + at(`<rect x="-150" y="36" width="300" height="64" rx="20" style="fill:${TEAL}"/><text x="0" y="78" text-anchor="middle" font-family="InterK,sans-serif" font-weight="800" font-size="28" style="fill:#fff">Sony · bawaan</text>`, T.sony)), T.bridge + 0.6)
    + label(540, 1640, "Bawaan aplikasi", MINT, INK, T.sony + 0.9, 520, 44),
    html: tx("Di STUDIODO, Canon lewat *SDK resmi.*", T.bridge, T.sony - 0.1, "left:120px;top:310px;font-size:100px;line-height:1;color:#fff", "big") + tx("Bridge *Sony* juga bawaan.", T.sony, null, "left:120px;top:310px;font-size:104px;line-height:1;color:#fff", "big") });
  // 5 plug in, detected automatically, pick, start
  SC.push({ i: 5, bg: MINT, dark: false, from: "10% 90%", art:
    blob(880, 480, 210, "#7af0bd") + dot(120, 1450, 90, "#7af0bd") + star(940, 1360, 30, INK, 0.3)
    + camera(230, 1580, 0.85, "#2b2f6b", ORG)
    + cable(310, 1510, 560, 1380, INK, T.hubung + 0.5)
    + laptop(790, 1330, 1.15, listRow(-60, "Canon EOS", true, T.deteksi + 0.5) + listRow(0, "Webcam", false, T.deteksi + 0.2) + listRow(60, "Sony", false, T.deteksi + 0.35)
      + at(`<g transform="translate(0 100)"><rect x="-100" y="-24" width="200" height="48" rx="24" style="fill:${ORG}"/><text x="0" y="9" text-anchor="middle" font-family="InterK,sans-serif" font-weight="800" font-size="24" style="fill:#fff">Mulai sesi</text></g>`, T.pilih + 1.2), "#eef2ff")
    + at(tick(230, 1420, 34), T.deteksi + 0.6),
    html: tx("Hubungkan kamera *ke PC.*", T.hubung, T.deteksi - 0.1, "left:120px;top:310px;font-size:112px;line-height:1", "big") + tx("Terdeteksi *otomatis.*", T.deteksi, T.pilih - 0.1, "left:120px;top:310px;font-size:116px;line-height:1", "big") + tx("Pilih kameranya, lalu *mulai sesi.*", T.pilih, null, "left:120px;top:310px;font-size:96px;line-height:1", "big") });
  // 6 no extra install, just plug in
  SC.push({ i: 6, bg: LIL, dark: false, from: "90% 20%", art:
    blob(860, 500, 220, "#dccdff") + dot(130, 1500, 80, "#b49cff") + plus(930, 1500, 30, INK, 0.2) + star(120, 880, 28, INK, 0.3)
    + at(camera(540, 1290, 1.7, "#2b2f6b", ORG), T.tanpa + 0.3, null, "rise")
    + label(540, 1650, "Tanpa instalasi tambahan", "#fff", INK, T.tanpa + 0.8, 640, 40),
    html: tx("Tanpa *instalasi tambahan.*", T.tanpa, T.colok - 0.1, "left:120px;top:310px;font-size:112px;line-height:1", "big") + tx("Kamera bagus, *tinggal colok.*", T.colok, null, "left:120px;top:310px;font-size:104px;line-height:1", "big") });
  // 7 reveal
  SC.push({ i: 7, bg: "#ffffff", dark: false, from: "50% 50%", art:
    [[160, 520, 40, ORG], [900, 600, 50, BLUE], [200, 1400, 60, YEL], [880, 1380, 44, PINK], [540, 440, 30, MINT]].map(([x, y, r, c], i) => at(dot(x as number, y as number, r as number, c as string, 0.1 * i), T.studiodo + 0.1 * i)).join(""),
    html: `<img class="biglogo" src="${wordmark("ink")}" alt="STUDIODO" style="--t:${s(T.studiodo)}">` + tx("Kamera terhubung, *booth siap.*", T.studiodo + 0.25, null, "left:0;right:0;top:1120px;text-align:center;font-size:84px", "mid") + `<div class="flash" style="--t:${s(T.studiodo)}"></div>` });
  // 8 CTA: ask which camera, save
  SC.push({ i: 8, bg: TEAL, dark: true, from: "50% 100%", art:
    blob(160, 520, 190, "#37cdbf") + dot(940, 420, 60, YEL, 0.2) + plus(100, 1500, 30, "#fff", 0.4)
    + at(P({ x: 250, y: 1300, s: 0.78, expr: "berpikir", hair: "short", skin: 2, pose: "chin", color: 1, jacket: "#fff3e4" }), T.tanya + 0.4)
    + at(camera(560, 1330, 0.9, "#fff3e4", ORG), T.tanya + 0.6)
    + at(P({ x: 880, y: 1300, s: 0.78, expr: "senang", hair: "curly", skin: 3, pose: "point", color: 3, glasses: true }), T.tanya + 0.8),
    html: tx("Kamera apa yang kamu pakai *di booth?*", T.tanya, null, "left:120px;top:310px;font-size:98px;line-height:1;color:#fff", "big")
      + `<div class="btn" style="--t:${s(T.simpan)};top:760px">Simpan buat checklist ↓</div>` + tx("studiodo.id", T.simpan + 0.6, null, "left:120px;top:940px;font-size:56px;color:#fff", "url") });
  void chip; void tick; void GREEN;
  return assembleReel(SC, STARTS, DURATION, CAM_CSS);
}

export const SFX: SfxEvent[] = [
  ...[T.bagus, T.tapi, T.harus, T.webcam, T.bridge, T.hubung, T.tanpa, T.tanya].map((t): SfxEvent => ["whoosh", Math.max(0, t - 0.12), 0.28]),
  ...STARTS.slice(1).map((t): SfxEvent => ["swoosh", t - 0.05, 0.4]),
  ["pop", T.bagus + 0.3, 0.4], ["pop", T.bagus + 0.9, 0.3], ["pop", T.bagus + 1.1, 0.3], ["sparkle", T.bagus + 1.4, 0.3],
  ["pop", T.tapi + 0.4, 0.4], ["beepLow", T.tapi + 1.0, 0.4],
  ...[0.5, 1.5, 2.6, 3.6].map((d): SfxEvent => ["pop", T.harus + d, 0.4]), ["buzz", T.ujung + 0.1, 0.5], ["thud", T.ujung + 0.1, 0.5],
  ["pop", T.webcam + 0.3, 0.4], ["pop", T.webcam + 1.2, 0.4],
  ["pop", T.bridge + 0.6, 0.45], ["pop", T.sdk, 0.4], ["ding", T.sdk + 0.2, 0.45], ["pop", T.sony, 0.4], ["zap", T.sony + 0.1, 0.3], ["ding", T.sony + 0.9, 0.45],
  ["tick", T.hubung + 0.5, 0.45], ["pop", T.deteksi + 0.2, 0.35], ["pop", T.deteksi + 0.35, 0.35], ["ding", T.deteksi + 0.5, 0.5], ["pop", T.pilih + 1.2, 0.4],
  ["pop", T.tanpa + 0.3, 0.45], ["sparkle", T.tanpa + 0.8, 0.4], ["ding", T.colok + 0.2, 0.4],
  ["boom", T.studiodo, 0.9], ["sparkle", T.studiodo + 0.1, 0.4], ["beepHi", T.studiodo + 0.05, 0.25],
  ["pop", T.simpan, 0.5], ["ding", T.simpan + 0.2, 0.4], ["sparkle", T.simpan + 0.5, 0.3],
];
