import { wordmark } from "./theme.js";
import { assembleReel, at, blob, BLUE, CREAM, dot, INK, LIL, MINT, ORG, P, PINK, plus, s, star, TEAL, tx, vis, YEL, type Sc } from "./heroReel2.js";
import { chip, cross, GREEN, RED, row, stamp, tick } from "./reelParts.js";
import type { SfxEvent } from "./sfx.js";

// Reel 07: "Voucher event 100 orang. Kuota jebol di orang ke-101."  Feature: voucher-promo (a code per event with a quota that is guarded,
// usage visible on the dashboard). CTA type: "simpan" (save it as an event checklist). The event and the numbers are illustrative.

export const MUSIC = "lofi" as const;
export const VO_FILE = "vo-voucher.mp3";
export const T = { event: 0.81, kode: 3.25, tamu101: 6.87, siapa: 11.6, bayangin: 14.9, batas: 17.77, dashboard: 20.18, studiodo: 22.5, simpan: 23.91, tombol: 25.4 };
export const DURATION = 27.6;
const STARTS = [0, T.kode - 0.1, T.tamu101 - 0.1, T.siapa - 0.1, T.bayangin - 0.1, T.batas - 0.1, T.dashboard - 0.1, T.studiodo - 0.1, T.simpan - 0.1];

const ticket = (x: number, y: number, sc: number, code: string, quota: string, c = YEL) =>
  `<g transform="translate(${x} ${y}) scale(${sc})"><path d="M-300 -110 H300 V-30 a30 30 0 0 0 0 60 V110 H-300 V30 a30 30 0 0 0 0 -60Z" style="fill:${c}"/><path d="M110 -100 V100" style="stroke:${INK};stroke-opacity:.25;stroke-width:6;stroke-dasharray:4 14;stroke-linecap:round"/><text x="-260" y="-30" font-family="InterK,sans-serif" font-weight="800" font-size="26" style="fill:${INK};opacity:.6">KODE VOUCHER</text><text x="-260" y="50" font-family="Bricolage,sans-serif" font-weight="800" font-size="54" style="fill:${INK}">${code}</text><text x="200" y="-10" text-anchor="middle" font-family="InterK,sans-serif" font-weight="800" font-size="24" style="fill:${INK};opacity:.6">KUOTA</text><text x="200" y="50" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="64" style="fill:${INK}">${quota}</text></g>`;
const crowd = (t0: number) => Array.from({ length: 12 }, (_, i) => at(P({ x: 150 + (i % 6) * 156, y: 1090 + Math.floor(i / 6) * 150, s: 0.36, expr: i % 3 === 0 ? "senang" : "berpikir", hair: (["short", "long", "bun", "curly", "hijab", "short"] as const)[i % 6], skin: i % 4, pose: i % 2 ? "hold" : "down", color: i }), t0 + 0.08 * i)).join("");

export function buildReelDoc(): { html: string; durationSec: number } {
  const SC: Sc[] = [];
  // 0 an event with a hundred guests
  SC.push({ i: 0, bg: TEAL, dark: true, from: "50% 50%", art:
    blob(160, 520, 190, "#37cdbf") + dot(960, 700, 50, YEL, 0.2) + plus(100, 1500, 30, "#fff", 0.4)
    + crowd(T.event + 0.3) + at(`<g transform="translate(850 880)"><circle r="120" style="fill:${YEL}"/><text x="0" y="30" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="110" style="fill:${INK}">100</text><text x="0" y="82" text-anchor="middle" font-family="InterK,sans-serif" font-weight="800" font-size="28" style="fill:${INK}">tamu</text></g>`, T.event + 1.0),
    html: tx("Event dengan *seratus tamu.*", T.event, null, "left:120px;top:325px;font-size:124px;line-height:.98;color:#fff", "big") });
  // 1 free promo codes handed out, tracked by hand
  SC.push({ i: 1, bg: CREAM, dark: false, from: "20% 50%", art:
    blob(860, 520, 220, "#ffe3c4") + dot(110, 1500, 70, "#ffd0d8") + plus(930, 1500, 30, ORG, 0.3)
    + at(`<g transform="translate(540 1180) rotate(-3)"><rect x="-300" y="-280" width="600" height="560" rx="26" style="fill:#fff"/>${Array.from({ length: 5 }, (_, i) => `<path d="M-250 ${-190 + i * 100} H250" style="stroke:${INK};stroke-opacity:.15;stroke-width:4"/>`).join("")}<text x="-250" y="-210" font-family="Bricolage,sans-serif" font-weight="800" font-size="44" style="fill:${INK}">Catatan kode</text>${Array.from({ length: 4 }, (_, i) => `<g class="an pop" style="--t:${s(T.kode + 0.8 + i * 0.5)}"><path d="M-250 ${-130 + i * 100} h60 M-170 ${-130 + i * 100} h60 M-90 ${-130 + i * 100} h60 M-250 ${-110 + i * 100} h140" style="stroke:${INK};stroke-width:7;stroke-linecap:round;fill:none"/></g>`).join("")}</g>`, T.kode + 0.3, null, "rise")
    + chip(780, 840, "Dicatat manual", YEL, INK, T.kode + 1.6, 420, 32),
    html: tx("Kode promo gratis dibagiin, *dicatat manual.*", T.kode, null, "left:120px;top:325px;font-size:92px;line-height:1", "big") });
  // 2 guest 101 asks, but all codes are used
  SC.push({ i: 2, bg: ORG, dark: true, from: "90% 50%", art:
    dot(140, 1450, 110, "#ff8a50") + dot(960, 560, 70, YEL, 0.3) + plus(930, 1500, 34, "#fff", 0.2)
    + at(ticket(540, 1000, 0.95, "EVENT100", "100/100", "#fff"), T.tamu101 + 0.3, null, "rise")
    + at(P({ x: 300, y: 1230, s: 0.78, expr: "bingung", hair: "bun", skin: 1, pose: "hold", color: 2, jacket: INK }), T.tamu101 + 0.8)
    + at(`<g transform="translate(300 1190)"><text x="0" y="-70" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="44" style="fill:#fff">#101</text></g>`, T.tamu101 + 1.1)
    + bubble101(T.tamu101 + 1.6),
    html: tx("Tamu ke seratus satu *masih minta,* kodenya sudah habis.", T.tamu101, null, "left:120px;top:325px;font-size:88px;line-height:1;color:#fff", "big") });
  // 3 who got one, who did not
  SC.push({ i: 3, bg: PINK, dark: false, from: "10% 20%", art:
    blob(180, 520, 200, "#ffb3cf") + dot(950, 1480, 90, "#ff6fa5", 0.2) + plus(110, 1500, 32, INK, 0.1)
    + at(P({ x: 270, y: 1090, s: 0.9, expr: "senang", hair: "short", skin: 2, pose: "up", color: 1 }), T.siapa + 0.3) + chip(270, 880, "Kebagian", GREEN, "#fff", T.siapa + 0.8, 280, 30)
    + at(P({ x: 780, y: 1090, s: 0.9, expr: "khawatir", hair: "long", skin: 1, pose: "chin", color: 2, jacket: INK }), T.siapa + 0.6) + chip(780, 880, "Nggak kebagian", RED, "#fff", T.siapa + 1.2, 340, 30),
    html: tx("Siapa yang kebagian? *Siapa yang nggak?*", T.siapa, null, "left:120px;top:325px;font-size:104px;line-height:1", "big") });
  // 4 imagine: a voucher with a quota
  SC.push({ i: 4, bg: BLUE, dark: true, from: "50% 50%", art:
    dot(130, 1000, 100, "#3a64ff") + dot(960, 1500, 150, "#3a64ff") + star(980, 700, 30, YEL, 0.3)
    + at(ticket(540, 1050, 1.0, "EVENT100", "0/100"), T.bayangin + 1.0, null, "rise")
    + at(`<g transform="translate(540 1290)"><rect x="-300" y="-24" width="600" height="48" rx="24" style="fill:rgba(255,255,255,.25)"/><rect class="grow" x="-300" y="-24" width="600" height="48" rx="24" style="fill:${MINT};--t:${s(T.bayangin + 1.6)}"/></g>`, T.bayangin + 1.4)
    + chip(540, 1420, "Kuota dijaga", "#fff", INK, T.bayangin + 2.4, 380, 32),
    html: tx("Sekarang bayangin kode voucher *punya kuota.*", T.bayangin, null, "left:120px;top:325px;font-size:100px;line-height:1;color:#fff", "big") });
  // 5 over the limit is rejected
  SC.push({ i: 5, bg: YEL, dark: false, from: "90% 50%", art:
    blob(180, 520, 200, "#ffe27a") + dot(950, 1480, 90, ORG, 0.2) + plus(110, 1500, 32, INK, 0.3)
    + at(ticket(540, 1030, 0.95, "EVENT100", "100/100", "#fff"), T.batas + 0.2, null, "rise")
    + at(P({ x: 300, y: 1250, s: 0.74, expr: "bingung", hair: "bun", skin: 1, pose: "hold", color: 2, jacket: INK }), T.batas + 0.6)
    + stamp(700, 1290, "DITOLAK", RED, -8, T.batas + 1.3, 64),
    html: tx("Lewat batas, *otomatis ditolak.*", T.batas, null, "left:120px;top:325px;font-size:116px;line-height:.98", "big") });
  // 6 usage visible on the dashboard
  SC.push({ i: 6, bg: MINT, dark: false, from: "10% 90%", art:
    blob(880, 480, 210, "#7af0bd") + dot(120, 1450, 90, "#7af0bd") + star(940, 1360, 30, INK, 0.3)
    + row(540, 960, "EVENT100 · Wedding Rani", "Dipakai 100 dari 100", GREEN, T.dashboard + 0.5, 780, { txt: "PENUH", bg: INK, fg: YEL })
    + row(540, 1140, "GATHERING25 · Kantor", "Dipakai 18 dari 25", YEL, T.dashboard + 1.1)
    + row(540, 1320, "PROMOJUNI · Mal", "Dipakai 42 dari 200", BLUE, T.dashboard + 1.7),
    html: tx("Pemakaiannya *kelihatan di dashboard.*", T.dashboard, null, "left:120px;top:325px;font-size:104px;line-height:1", "big") });
  // 7 reveal
  SC.push({ i: 7, bg: "#ffffff", dark: false, from: "50% 50%", art:
    [[160, 520, 40, ORG], [900, 600, 50, BLUE], [200, 1400, 60, YEL], [880, 1380, 44, PINK], [540, 440, 30, MINT]].map(([x, y, r, c], i) => at(dot(x as number, y as number, r as number, c as string, 0.1 * i), T.studiodo + 0.1 * i)).join(""),
    html: `<img class="biglogo" src="${wordmark("ink")}" alt="STUDIODO" style="--t:${s(T.studiodo)}">` + tx("Itu *STUDIODO.*", T.studiodo + 0.25, null, "left:0;right:0;top:1120px;text-align:center;font-size:104px", "mid") + `<div class="flash" style="--t:${s(T.studiodo)}"></div>` });
  // 8 CTA: save it
  SC.push({ i: 8, bg: LIL, dark: false, from: "50% 100%", art:
    blob(160, 520, 190, "#dccdff") + dot(940, 420, 60, YEL, 0.2) + plus(100, 1500, 30, INK, 0.4)
    + at(`<g transform="translate(540 1200)"><path d="M-130 -190 H130 V200 L0 110 L-130 200Z" style="fill:${INK}"/><path d="M-70 -110 H70 M-70 -60 H70 M-70 -10 H20" style="stroke:#fff;stroke-width:12;stroke-linecap:round"/></g>`, T.simpan + 0.5, null, "stamp")
    + at(P({ x: 190, y: 1330, s: 0.62, expr: "senang", hair: "curly", skin: 2, pose: "wave", color: 1 }), T.simpan + 0.8) + at(P({ x: 900, y: 1330, s: 0.62, expr: "senang", hair: "short", skin: 3, pose: "point", color: 3, glasses: true }), T.simpan + 1.0),
    html: tx("Simpan buat *checklist event* berikutnya.", T.simpan, null, "left:120px;top:325px;font-size:104px;line-height:1", "big")
      + `<div class="btn" style="--t:${s(T.tombol)};top:760px;background:${INK};color:#fff">Simpan postingan ini ↓</div>` + tx("studiodo.id", T.tombol + 0.6, null, "left:120px;top:940px;font-size:56px", "url") });
  void CREAM; void cross; void tick; void vis; void PINK;
  return assembleReel(SC, STARTS, DURATION, `.grow{transform-origin:0 50%;transform:scaleX(0);animation:grw 2s ease-out forwards;animation-delay:var(--t)}@keyframes grw{to{transform:scaleX(1)}}`);
}

function bubble101(t: number) {
  return at(`<g transform="translate(760 1190)"><rect x="-210" y="-60" width="420" height="120" rx="34" style="fill:#fff"/><path d="M-160 60 l-20 40 l60 -40z" style="fill:#fff"/><text x="0" y="14" text-anchor="middle" font-family="InterK,sans-serif" font-weight="800" font-size="32" style="fill:${INK}">Boleh minta kodenya?</text></g>`, t);
}

export const SFX: SfxEvent[] = [
  ...[T.event, T.kode, T.tamu101, T.siapa, T.bayangin, T.batas, T.dashboard, T.simpan].map((t): SfxEvent => ["whoosh", t - 0.12, 0.28]),
  ...STARTS.slice(1).map((t): SfxEvent => ["swoosh", t - 0.05, 0.4]),
  ...Array.from({ length: 6 }, (_, i): SfxEvent => ["pop", T.event + 0.3 + i * 0.16, 0.22]), ["pop", T.event + 1.0, 0.45], ["thud", T.event + 1.0, 0.5],
  ...[0, 1, 2, 3].map((i): SfxEvent => ["tick", T.kode + 0.8 + i * 0.5, 0.45]), ["pop", T.kode + 1.6, 0.4],
  ["pop", T.tamu101 + 0.3, 0.4], ["pop", T.tamu101 + 1.6, 0.4], ["beepLow", T.tamu101 + 1.7, 0.4],
  ["pop", T.siapa + 0.8, 0.4], ["buzz", T.siapa + 1.2, 0.5], ["pop", T.siapa + 1.2, 0.4],
  ["pop", T.bayangin + 1.0, 0.45], ["rise", T.bayangin + 1.1, 0.35], ["ding", T.bayangin + 3.3, 0.5], ["pop", T.bayangin + 2.4, 0.4],
  ["pop", T.batas + 0.2, 0.4], ["thud", T.batas + 1.3, 0.9], ["buzz", T.batas + 1.3, 0.6],
  ["pop", T.dashboard + 0.5, 0.4], ["pop", T.dashboard + 1.1, 0.4], ["pop", T.dashboard + 1.7, 0.4], ["ding", T.dashboard + 1.9, 0.4],
  ["boom", T.studiodo, 0.9], ["sparkle", T.studiodo + 0.1, 0.4], ["beepHi", T.studiodo + 0.05, 0.25],
  ["thud", T.simpan + 0.5, 0.6], ["pop", T.tombol, 0.5], ["tick", T.tombol + 0.3, 0.4], ["sparkle", T.tombol + 0.6, 0.3],
];
