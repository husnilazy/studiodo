import { wordmark } from "./theme.js";
import { assembleReel, at, blob, BLUE, booth, CREAM, dot, INK, LIL, MINT, ORG, P, PINK, plus, s, scIdle, star, TEAL, tx, vis, YEL, type Sc } from "./heroReel2.js";
import { chip, GREEN, RED, tick } from "./reelParts.js";
import type { SfxEvent } from "./sfx.js";

// Reel 08: "Antrean 30 menit karena alurnya kepanjangan."  Feature: mode-alur (4 kiosk flows: Lengkap, Ringkas, Satu harga, Kilat; busy events
// can use Kilat, premium booths Lengkap). CTA type: "tanya" (ask for the audience's longest queue). The 30 minutes are an illustrative example.

export const MUSIC = "house" as const;
export const VO_FILE = "vo-mode.mp3";
export const T = { event: 0.5, alur: 4.51, antre: 6.9, bubar: 8.84, bayangin: 10.95, nama: 15.36, ramai: 18.66, premium: 20.54, studiodo: 22.48, tanya: 23.55, tombol: 25.9 };
export const DURATION = 28.8;
const STARTS = [0, T.alur - 0.1, T.antre - 0.1, T.bubar - 0.1, T.bayangin - 0.1, T.ramai - 0.1, T.premium - 0.1, T.studiodo - 0.1, T.tanya - 0.1];

const step = (x: number, y: number, n: number, label: string, c: string, t: number) =>
  at(`<g transform="translate(${x} ${y})"><rect x="-150" y="-52" width="300" height="104" rx="30" style="fill:#fff"/><circle cx="-100" cy="0" r="26" style="fill:${c}"/><text x="-100" y="11" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="30" style="fill:#fff">${n}</text><text x="-58" y="12" font-family="InterK,sans-serif" font-weight="800" font-size="32" style="fill:${INK}">${label}</text></g>`, t);
const mode = (x: number, y: number, name: string, sub: string, c: string, t: number, hot = false) =>
  at(`<g transform="translate(${x} ${y})"><rect x="-200" y="-130" width="400" height="260" rx="40" style="fill:${hot ? c : "#fff"}"/><text x="0" y="-12" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="56" style="fill:${hot ? "#fff" : INK}">${name}</text><text x="0" y="50" text-anchor="middle" font-family="InterK,sans-serif" font-weight="700" font-size="28" style="fill:${hot ? "#fff" : INK};opacity:.7">${sub}</text><circle cx="-150" cy="-84" r="16" style="fill:${hot ? "#fff" : c}"/></g>`, t);
const clock = (x: number, y: number, sc: number, label: string) =>
  `<g transform="translate(${x} ${y}) scale(${sc})"><circle r="120" style="fill:#fff;stroke:${INK};stroke-width:14"/><path d="M0 0 V-70" style="stroke:${INK};stroke-width:12;stroke-linecap:round"/><g class="hand"><path d="M0 0 L56 30" style="stroke:${RED};stroke-width:12;stroke-linecap:round"/></g><circle r="11" style="fill:${INK}"/><text x="0" y="170" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="52" style="fill:${INK}">${label}</text></g>`;

export function buildReelDoc(): { html: string; durationSec: number } {
  const SC: Sc[] = [];
  const leaver = (x: number, i: number) => `<g class="lv" style="--t:${s(T.bubar + 0.5 + i * 0.5)};--dx:${i % 2 ? 900 : 700}px">${P({ x, y: 1230, s: 0.78, expr: "khawatir", hair: (["curly", "long", "bun", "short"] as const)[i], skin: (i + 1) % 4, pose: "down", color: i + 1, bag: i === 1 ? INK : undefined })}</g>`;
  // 0 a busy event, the kiosk flow is long
  SC.push({ i: 0, bg: YEL, dark: false, from: "50% 50%", art:
    blob(180, 520, 200, "#ffe27a") + dot(950, 1480, 90, ORG, 0.2) + plus(110, 1500, 32, INK, 0.3)
    + booth(700, 1700, 1.05, [{ html: scIdle(), t: 0, o: null }])
    + [0, 1, 2].map((i) => at(P({ x: 130 + i * 150, y: 1260 - (i % 2) * 14, s: 0.58, expr: i % 2 ? "bingung" : "khawatir", hair: (["long", "short", "hijab"] as const)[i], skin: (i + 1) % 4, pose: i === 1 ? "chin" : "hold", color: i }), T.event + 0.3 + i * 0.2)).join(""),
    html: tx("Event lagi ramai, tapi *alur kiosknya kepanjangan.*", T.event, null, "left:120px;top:325px;font-size:92px;line-height:1", "big") });
  // 1 the long chain of steps
  SC.push({ i: 1, bg: CREAM, dark: false, from: "20% 50%", art:
    blob(860, 520, 220, "#ffe3c4") + dot(110, 1500, 70, "#ffd0d8") + plus(930, 1500, 30, ORG, 0.3)
    + step(330, 960, 1, "Paket", BLUE, T.alur + 0.4) + step(750, 1070, 2, "Frame", ORG, T.alur + 1.1) + step(330, 1180, 3, "Filter", "#7b5cff", T.alur + 1.8) + step(750, 1290, 4, "Edit", TEAL, T.alur + 2.4)
    + at(`<text x="540" y="1420" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="60" style="fill:${INK};opacity:.5">…</text>`, T.alur + 2.9),
    html: tx("Pilih paket, frame, filter, *edit...*", T.alur, null, "left:120px;top:325px;font-size:104px;line-height:1", "big") });
  // 2 the queue grows to 30 minutes
  SC.push({ i: 2, bg: PINK, dark: false, from: "90% 50%", art:
    blob(180, 520, 200, "#ffb3cf") + dot(950, 1480, 90, "#ff6fa5", 0.2) + plus(110, 1500, 32, INK, 0.1)
    + at(clock(310, 1040, 1.0, "30 menit"), T.antre + 0.3, null, "rise")
    + [0, 1, 2, 3].map((i) => at(P({ x: 560 + i * 120, y: 1300 - (i % 2) * 14, s: 0.5, expr: "khawatir", hair: (["curly", "long", "short", "bun"] as const)[i], skin: i % 4, pose: "hold", color: i }), T.antre + 0.6 + i * 0.2)).join(""),
    html: tx("antrean *tiga puluh menit.*", T.antre, null, "left:120px;top:325px;font-size:128px;line-height:.98", "big") });
  // 3 guests leave
  SC.push({ i: 3, bg: "#14122b", dark: true, from: "50% 100%", art:
    dot(130, 560, 100, "#2a2550") + dot(960, 1400, 150, "#2a2550") + plus(930, 560, 34, YEL, 0.2)
    + [150, 380, 610, 840].map((x, i) => at(leaver(x, i), T.bubar + 0.1 + i * 0.1)).join(""),
    html: tx("Tamu mulai *bubar.*", T.bubar, null, "left:120px;top:325px;font-size:140px;line-height:.98;color:#fff", "big") });
  // 4 imagine four flow modes
  SC.push({ i: 4, bg: BLUE, dark: true, from: "50% 50%", art:
    dot(130, 1000, 100, "#3a64ff") + dot(960, 1500, 150, "#3a64ff") + star(980, 700, 30, YEL, 0.3)
    + mode(340, 1010, "Lengkap", "semua langkah", ORG, T.nama + 0.0) + mode(760, 1010, "Ringkas", "langkah dipangkas", MINT, T.nama + 0.77)
    + mode(340, 1330, "Satu harga", "tanpa pilih paket", YEL, T.nama + 1.49) + mode(760, 1330, "Kilat", "paling cepat", PINK, T.nama + 2.19),
    html: tx("Sekarang bayangin ada *empat mode alur.*", T.bayangin, T.nama - 0.1, "left:120px;top:325px;font-size:112px;line-height:1;color:#fff", "big") + tx("Lengkap, Ringkas, *Satu harga,* dan Kilat.", T.nama, null, "left:120px;top:325px;font-size:100px;line-height:1;color:#fff", "big") });
  // 5 busy event: use Kilat
  SC.push({ i: 5, bg: MINT, dark: false, from: "10% 90%", art:
    blob(880, 480, 210, "#7af0bd") + dot(120, 1450, 90, "#7af0bd") + star(940, 1360, 30, INK, 0.3)
    + mode(540, 1030, "Kilat", "paling cepat", PINK, T.ramai + 0.4, true)
    + step(330, 1290, 1, "Bayar", BLUE, T.ramai + 1.0) + step(750, 1290, 2, "Foto", ORG, T.ramai + 1.4)
    + at(clock(540, 1560, 0.45, "5 menit"), T.ramai + 2.0).replace("5 menit", "antre pendek"),
    html: tx("Event ramai? *Pakai Kilat.*", T.ramai, null, "left:120px;top:325px;font-size:124px;line-height:.98", "big") });
  // 6 premium booth: use Lengkap
  SC.push({ i: 6, bg: LIL, dark: false, from: "90% 20%", art:
    blob(860, 500, 220, "#dccdff") + dot(130, 1500, 80, "#b49cff") + plus(930, 1500, 30, INK, 0.2) + star(120, 880, 28, INK, 0.3)
    + mode(540, 1010, "Lengkap", "semua langkah", ORG, T.premium + 0.4, true)
    + [["Paket", BLUE], ["Frame", ORG], ["Filter", "#7b5cff"], ["Edit", TEAL]].map(([l, c], i) => step(330 + (i % 2) * 420, 1260 + Math.floor(i / 2) * 120, i + 1, l as string, c as string, T.premium + 1.0 + i * 0.35)).join(""),
    html: tx("Booth premium? *Pakai Lengkap.*", T.premium, null, "left:120px;top:325px;font-size:124px;line-height:.98", "big") });
  // 7 reveal
  SC.push({ i: 7, bg: "#ffffff", dark: false, from: "50% 50%", art:
    [[160, 520, 40, ORG], [900, 600, 50, BLUE], [200, 1400, 60, YEL], [880, 1380, 44, PINK], [540, 440, 30, MINT]].map(([x, y, r, c], i) => at(dot(x as number, y as number, r as number, c as string, 0.1 * i), T.studiodo + 0.1 * i)).join(""),
    html: `<img class="biglogo" src="${wordmark("ink")}" alt="STUDIODO" style="--t:${s(T.studiodo)}">` + tx("Itu *STUDIODO.*", T.studiodo + 0.25, null, "left:0;right:0;top:1120px;text-align:center;font-size:104px", "mid") + `<div class="flash" style="--t:${s(T.studiodo)}"></div>` });
  // 8 CTA: ask for the longest queue
  SC.push({ i: 8, bg: TEAL, dark: true, from: "50% 100%", art:
    blob(160, 520, 190, "#37cdbf") + dot(940, 420, 60, YEL, 0.2) + plus(100, 1500, 30, "#fff", 0.4)
    + at(P({ x: 250, y: 1300, s: 0.78, expr: "berpikir", hair: "short", skin: 2, pose: "chin", color: 1, jacket: "#fff3e4" }), T.tanya + 0.4)
    + at(P({ x: 560, y: 1320, s: 0.75, expr: "senang", hair: "hijab", skin: 1, pose: "wave", color: 2 }), T.tanya + 0.6)
    + at(P({ x: 850, y: 1300, s: 0.78, expr: "bingung", hair: "curly", skin: 3, pose: "chin", color: 3, glasses: true }), T.tanya + 0.8),
    html: tx("Antrean terlama di booth-mu *berapa menit?*", T.tanya, null, "left:120px;top:325px;font-size:100px;line-height:1;color:#fff", "big")
      + `<div class="btn" style="--t:${s(T.tombol)};top:760px">Ceritakan di komentar ↓</div>` + tx("studiodo.id", T.tombol + 0.6, null, "left:120px;top:940px;font-size:56px;color:#fff", "url") });
  void chip; void GREEN; void tick; void vis; void CREAM;
  return assembleReel(SC, STARTS, DURATION, `.lv{animation:lvx 2.2s cubic-bezier(.5,0,.8,.6) forwards;animation-delay:var(--t)}@keyframes lvx{to{transform:translateX(var(--dx));opacity:0}}.hand{animation:hnd 4s linear infinite;transform-origin:0 0}@keyframes hnd{to{transform:rotate(360deg)}}`);
}

export const SFX: SfxEvent[] = [
  ...[T.event, T.alur, T.antre, T.bubar, T.bayangin, T.nama, T.ramai, T.premium, T.tanya].map((t): SfxEvent => ["whoosh", t - 0.12, 0.28]),
  ...STARTS.slice(1).map((t): SfxEvent => ["swoosh", t - 0.05, 0.4]),
  ["pop", T.event + 0.3, 0.3], ["pop", T.event + 0.5, 0.3], ["pop", T.event + 0.7, 0.3],
  ...[0.4, 1.1, 1.8, 2.4].map((d): SfxEvent => ["pop", T.alur + d, 0.4]), ["beepLow", T.alur + 2.9, 0.4],
  ["pop", T.antre + 0.3, 0.4], ["tick", T.antre + 0.5, 0.4], ["tick", T.antre + 0.8, 0.4], ["buzz", T.antre + 1.2, 0.5],
  ...[0, 1, 2, 3].map((i): SfxEvent => ["whoosh", T.bubar + 0.5 + i * 0.5, 0.25]),
  ...[0, 0.77, 1.49, 2.19].map((d): SfxEvent => ["pop", T.nama + d, 0.45]), ["ding", T.nama + 2.4, 0.45],
  ["pop", T.ramai + 0.4, 0.45], ["zap", T.ramai + 0.5, 0.4], ["pop", T.ramai + 1.0, 0.4], ["pop", T.ramai + 1.4, 0.4], ["ding", T.ramai + 2.0, 0.5],
  ["pop", T.premium + 0.4, 0.45], ...[0, 1, 2, 3].map((i): SfxEvent => ["pop", T.premium + 1.0 + i * 0.35, 0.35]), ["sparkle", T.premium + 2.4, 0.35],
  ["boom", T.studiodo, 0.9], ["sparkle", T.studiodo + 0.1, 0.4], ["beepHi", T.studiodo + 0.05, 0.25],
  ["pop", T.tombol, 0.5], ["ding", T.tombol + 0.2, 0.4], ["sparkle", T.tombol + 0.5, 0.3],
];
