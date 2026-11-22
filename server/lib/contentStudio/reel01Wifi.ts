import { wordmark } from "./theme.js";
import { assembleReel, at, blob, BLUE, booth, CREAM, dot, em, INK, MINT, ORG, P, PINK, plus, s, scCam, star, tx, vis, YEL, type Sc } from "./heroReel2.js";
import type { SfxEvent } from "./sfx.js";

// Reel 01: "Wifi mal mati. Booth-mu ikut mati?"  Feature: offline-aman (session stored locally, synced when the connection returns).
// Claims kept literal: sessions are stored on the booth and sync automatically when internet is back. We do NOT claim QRIS works offline.
// TIMES are phrase starts in the voice over (seconds). Re-measure with silencedetect after the real VO is generated, then re-render.

export const MUSIC = "synthwave" as const;
export const VO_FILE = "vo-wifi.mp3";
export const T = { jam: 0.83, wifi: 2.49, antrean: 4.28, error: 6.41, errorWord: 8.22, bubar: 9.28, bayangin: 11.53, simpan: 14.06, sync: 15.48, putus: 18.34, sesiJalan: 19.36, studiodo: 20.73, mau: 22.0, komen: 23.12 };
export const DURATION = 26.6;
const STARTS = [0, T.wifi - 0.1, T.antrean - 0.1, T.error - 0.1, T.bubar - 0.1, T.bayangin - 0.1, T.simpan - 0.1, T.putus - 0.1, T.studiodo - 0.1, T.mau - 0.1];

const RED = "#ff4d5a", NIGHT = "#2a1670", INKBG = "#14122b";
const wifi = (x: number, y: number, sc: number, color: string, off: boolean, cls = "") =>
  `<g class="${cls}" transform="translate(${x} ${y}) scale(${sc})" style="transform-box:fill-box"><path d="M-60 -10 Q0 -64 60 -10 M-40 14 Q0 -20 40 14 M-18 38 Q0 24 18 38" style="fill:none;stroke:${color};stroke-width:12;stroke-linecap:round"/><circle cx="0" cy="58" r="9" style="fill:${color}"/>${off ? `<path d="M-52 -46 L52 76" style="stroke:${INK};stroke-width:18;stroke-linecap:round"/><path d="M-52 -46 L52 76" style="stroke:${RED};stroke-width:9;stroke-linecap:round"/>` : ""}</g>`;
const scErr = () => `<rect x="-100" y="-540" width="200" height="200" rx="18" style="fill:#7a1020"/><path d="M0 -520 L40 -450 H-40Z" style="fill:#ffd23f"/><text x="0" y="-462" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="40" style="fill:${INK}">!</text><text x="0" y="-410" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="24" style="fill:#fff">ERROR</text><text x="0" y="-380" text-anchor="middle" font-family="InterK,sans-serif" font-weight="700" font-size="14" style="fill:#fff;opacity:.8">Tidak ada koneksi</text>`;
const photoChip = (x: number, y: number, c: string, t: number, cls = "pop", extra = "") => at(`<g transform="translate(${x} ${y})"><rect x="-44" y="-52" width="88" height="104" rx="12" style="fill:#fff"/><rect x="-34" y="-42" width="68" height="62" rx="8" style="fill:${c}"/><circle cx="0" cy="-16" r="14" style="fill:#fff;opacity:.85"/><rect x="-24" y="28" width="48" height="8" rx="4" style="fill:${INK};opacity:.5"/></g>`, t, null, cls) + extra;
const fly = (x: number, y: number, dx: number, dy: number, c: string, t: number) => `<g class="fly" style="--t:${s(t)};--o:${s(t + 1.5)};--dx:${dx}px;--dy:${dy}px"><g transform="translate(${x} ${y})"><rect x="-34" y="-40" width="68" height="80" rx="10" style="fill:#fff"/><rect x="-26" y="-32" width="52" height="46" rx="6" style="fill:${c}"/></g></g>`;
const cloud = (x: number, y: number, sc: number, c: string) => `<g transform="translate(${x} ${y}) scale(${sc})"><circle cx="-70" cy="10" r="52" style="fill:${c}"/><circle cx="0" cy="-28" r="72" style="fill:${c}"/><circle cx="76" cy="12" r="50" style="fill:${c}"/><rect x="-120" y="10" width="246" height="52" rx="26" style="fill:${c}"/></g>`;
const chipSvg = (x: number, y: number, w: number, txt: string, bg: string, fg: string, t: number, o: number | null = null) => at(`<g transform="translate(${x} ${y})"><rect x="${-w / 2}" y="-34" width="${w}" height="68" rx="34" style="fill:${bg}"/><text x="0" y="12" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="34" style="fill:${fg}">${txt}</text></g>`, t, o);

export function buildReelDoc(): { html: string; durationSec: number } {
  const SC: Sc[] = [];
  const bld = (x: number, w: number, h: number, c: string) => `<rect x="${x}" y="${1620 - h}" width="${w}" height="${h}" rx="10" style="fill:${c}"/>` + Array.from({ length: Math.floor(h / 120) * 2 }, (_, k) => `<rect x="${x + 22 + (k % 2) * (w / 2 - 6)}" y="${1620 - h + 30 + Math.floor(k / 2) * 120}" width="${w / 2 - 38}" height="62" rx="8" style="fill:${(k * 7 + x) % 5 === 0 ? YEL : "#3a2a8a"}"/>`).join("");

  // 0 night, mall, wifi still on
  SC.push({ i: 0, bg: NIGHT, dark: true, from: "50% 50%", art:
    dot(860, 360, 90, "#ffe08a") + dot(900, 330, 78, NIGHT) + star(170, 520, 18, "#fff", 0.3) + star(560, 640, 14, "#fff", 0.9)
    + bld(-40, 260, 560, "#35248f") + bld(250, 220, 400, "#2d1f7c") + bld(700, 400, 640, "#35248f") + `<rect x="0" y="1620" width="1080" height="300" style="fill:#1a0f4d"/>`
    + at(wifi(850, 560, 1.6, MINT, false, "glow"), T.jam + 0.3)
    + at(P({ x: 200, y: 1300, s: 0.6, expr: "senang", hair: "long", skin: 1, pose: "hold", color: 0, glasses: true }), 0.2) + at(P({ x: 340, y: 1310, s: 0.58, expr: "senang", hair: "short", skin: 2, pose: "hold", color: 2 }), 0.4),
    html: tx("JAM 8 *MALAM.*", T.jam, null, "left:120px;top:325px;font-size:160px;color:#fff", "big") + `<div class="chip" style="--t:${s(T.jam + 0.3)};left:120px;top:700px;background:${YEL};color:${INK}">📍 Mal ramai</div>` });
  // 1 wifi dies
  SC.push({ i: 1, bg: RED, dark: true, from: "50% 50%", art:
    dot(150, 1500, 80, "#ff7a84") + dot(940, 440, 60, "#ff7a84", 0.4) + plus(920, 1500, 34, "#fff", 0.2)
    + at(wifi(540, 1050, 3.4, "#fff", true, "shake"), T.wifi + 0.1),
    html: tx("WIFI MAL *MATI.*", T.wifi, null, "left:120px;top:325px;font-size:190px;color:#fff;max-width:840px", "slam") });
  // 2 the queue of twelve
  const queue = [0, 1, 2, 3, 4, 5].map((i) => at(P({ x: 130 + i * 164, y: 1330 - (i % 2) * 16, s: 0.5, expr: i % 2 ? "bingung" : "khawatir", hair: (["long", "curly", "short", "hijab", "bun", "short"] as const)[i], skin: i % 4, pose: i % 3 === 0 ? "hold" : "down", color: i, glasses: i === 2, bag: i === 4 ? INK : undefined }), T.antrean + 0.15 * i)).join("");
  SC.push({ i: 2, bg: CREAM, dark: false, from: "10% 90%", art:
    blob(840, 540, 240, "#ffe3c4") + plus(110, 560, 30, ORG, 0.2) + queue
    + at(`<g transform="translate(790 900)"><circle r="150" style="fill:${YEL}"/><text x="0" y="40" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="150" style="fill:${INK}">12</text><text x="0" y="104" text-anchor="middle" font-family="InterK,sans-serif" font-weight="800" font-size="34" style="fill:${INK}">orang antre</text></g>`, T.antrean + 0.6),
    html: tx("Antrean *dua belas* orang...", T.antrean, null, "left:120px;top:325px;font-size:110px;max-width:840px", "big") });
  // 3 booth shows ERROR
  SC.push({ i: 3, bg: INKBG, dark: true, from: "50% 20%", art:
    dot(130, 520, 100, "#2a2550") + dot(960, 1380, 140, "#2a2550") + plus(960, 560, 34, RED, 0.2)
    + at(booth(540, 1700, 1.3, [{ html: scErr(), t: 0, o: null }], undefined, RED), T.error + 0.1, null, "rise")
    + at(`<g transform="translate(190 900) rotate(-10)"><path d="M0 -70 L72 54 H-72Z" style="fill:${YEL}"/><text x="0" y="30" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="64" style="fill:${INK}">!</text></g>`, T.errorWord + 0.1),
    html: tx("dan layar booth|cuma bilang: *ERROR.*", T.error, null, "left:120px;top:325px;font-size:112px;line-height:1;color:#fff", "big") });
  // 4 customers leave one by one
  const leaver = (x: number, i: number) => `<g class="lv" style="--t:${s(T.bubar + 0.5 + i * 0.55)};--dx:${i % 2 ? 900 : 700}px">${P({ x, y: 1230 - (i % 2) * 20, s: 0.78, expr: "khawatir", hair: (["curly", "long", "bun", "short"] as const)[i], skin: (i + 1) % 4, pose: "down", color: i + 1, bag: i === 1 ? INK : undefined })}</g>`;
  SC.push({ i: 4, bg: YEL, dark: false, from: "90% 50%", art:
    blob(200, 480, 210, "#ffe27a") + dot(940, 1560, 90, ORG, 0.2) + plus(120, 1500, 32, INK, 0.3)
    + [150, 380, 610, 840].map((x, i) => at(leaver(x, i), T.bubar + 0.1 + i * 0.1)).join(""),
    html: tx("Customer *bubar*|satu per satu.", T.bubar, null, "left:120px;top:325px;font-size:128px;line-height:.98", "big") });
  // 5 imagine: the booth keeps going
  SC.push({ i: 5, bg: MINT, dark: false, from: "50% 100%", art:
    blob(180, 500, 200, "#7af0bd") + dot(950, 1450, 100, "#7af0bd") + plus(960, 560, 32, INK, 0.1) + star(110, 1050, 28, "#fff", 0.4)
    + booth(790, 1680, 1.1, [{ html: scCam(), t: 0, o: null }])
    + at(P({ x: 190, y: 1160, s: 0.9, expr: "senang", hair: "curly", skin: 2, pose: "up", color: 2, shoe: BLUE }), T.bayangin + 0.4) + at(P({ x: 420, y: 1180, s: 0.85, expr: "senang", hair: "hijab", skin: 0, pose: "up", color: 1 }), T.bayangin + 0.6),
    html: tx("Sekarang bayangin|*booth-mu* tetap jalan.", T.bayangin, null, "left:120px;top:325px;font-size:104px;line-height:1", "big") });
  // 6 saved on the booth, then synced to the cloud
  SC.push({ i: 6, bg: BLUE, dark: true, from: "50% 50%", art:
    dot(130, 1000, 100, "#3a64ff") + dot(960, 1500, 150, "#3a64ff") + star(980, 700, 30, YEL, 0.3)
    + at(booth(230, 1640, 0.72, [{ html: scCam(), t: 0, o: null }], undefined, "#1a2fb0"), T.simpan + 0.1, null, "rise")
    + photoChip(480, 1440, PINK, T.simpan + 0.3) + photoChip(580, 1440, YEL, T.simpan + 0.7) + photoChip(680, 1440, MINT, T.simpan + 1.1)
    + `<path d="M420 1330 Q600 1180 760 1200" style="fill:none;stroke:#fff;stroke-width:7;stroke-dasharray:4 20;stroke-linecap:round"/>`
    + vis(wifi(600, 1120, 1.1, RED, true), T.simpan + 0.3, T.sync) + vis(wifi(600, 1120, 1.1, MINT, false), T.sync, null)
    + vis(chipSvg(600, 1010, 220, "OFFLINE", RED, "#fff", 0, null), T.simpan + 0.3, T.sync) + vis(chipSvg(600, 1010, 220, "ONLINE", MINT, INK, 0, null), T.sync, null)
    + at(cloud(850, 1180, 1.1, "#fff"), T.simpan + 0.2)
    + vis(`<text x="850" y="1190" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="30" style="fill:${INK}">SERVER</text>`, T.simpan + 0.2, T.sync + 1.4)
    + vis(`<g transform="translate(850 1180)"><circle r="40" style="fill:${MINT}"/><path d="M-16 0 L-4 12 L18 -12" style="fill:none;stroke:#fff;stroke-width:9;stroke-linecap:round;stroke-linejoin:round"/></g>`, T.sync + 1.4, null)
    + fly(480, 1440, 330, -240, PINK, T.sync + 0.1) + fly(580, 1440, 230, -240, YEL, T.sync + 0.4) + fly(680, 1440, 130, -240, MINT, T.sync + 0.7),
    html: tx("Sesi *tersimpan*|di booth,", T.simpan, T.sync - 0.1, "left:120px;top:325px;font-size:136px;line-height:.98;color:#fff", "big") + tx("lalu *tersinkron otomatis*|saat internet kembali.", T.sync, null, "left:120px;top:325px;font-size:90px;line-height:1;color:#fff", "big") });
  // 7 the punchline
  SC.push({ i: 7, bg: ORG, dark: true, from: "50% 50%", art:
    dot(140, 1450, 110, "#ff8a50") + dot(960, 520, 70, YEL, 0.3) + plus(930, 1480, 34, "#fff", 0.2)
    + at(wifi(850, 720, 1.2, "#fff", true), T.putus + 0.2)
    + at(P({ x: 260, y: 1060, s: 0.9, expr: "senang", hair: "bun", skin: 0, pose: "up", color: 2, jacket: INK }), T.sesiJalan + 0.2) + at(P({ x: 540, y: 1050, s: 0.95, expr: "senang", hair: "curly", skin: 2, pose: "up", color: 1, glasses: true }), T.sesiJalan + 0.35) + at(P({ x: 820, y: 1070, s: 0.9, expr: "senang", hair: "short", skin: 3, pose: "up", color: 3, bag: YEL }), T.sesiJalan)
    + chipSvg(540, 1760, 460, "Sesi ke-14 ✓", YEL, INK, T.sesiJalan + 0.9),
    html: tx("Internet putus?", T.putus, T.sesiJalan, "left:120px;top:325px;font-size:150px;color:#fff", "big") + tx("Sesi *tetap jalan!*", T.sesiJalan, null, "left:120px;top:325px;font-size:150px;color:#fff;line-height:.95", "slam") });
  // 8 reveal
  SC.push({ i: 8, bg: "#ffffff", dark: false, from: "50% 50%", art:
    [[160, 520, 40, ORG], [900, 600, 50, BLUE], [200, 1400, 60, YEL], [880, 1380, 44, PINK], [540, 440, 30, MINT]].map(([x, y, r, c], i) => at(dot(x as number, y as number, r as number, c as string, 0.1 * i), T.studiodo + 0.1 * i)).join(""),
    html: `<img class="biglogo" src="${wordmark("ink")}" alt="STUDIODO" style="--t:${s(T.studiodo)}">` + tx("Itu *STUDIODO.*", T.studiodo + 0.25, null, "left:0;right:0;top:1120px;text-align:center;font-size:104px", "mid") + `<div class="flash" style="--t:${s(T.studiodo)}"></div>` });
  // 9 call to action
  const word = "COBA".split("").map((c, i) => `<b style="--t:${s(T.komen + 0.15 + i * 0.28)}">${c}</b>`).join("");
  SC.push({ i: 9, bg: BLUE, dark: true, from: "50% 100%", art:
    dot(120, 330, 90, "#3a64ff") + dot(960, 760, 130, "#3a64ff") + plus(940, 330, 34, YEL, 0) + star(120, 900, 30, YEL, 0.4)
    + at(P({ x: 190, y: 1364, s: 0.7, expr: "senang", hair: "long", skin: 1, pose: "wave", color: 2, jacket: "#fff3e4" }), T.mau + 0.3) + at(P({ x: 540, y: 1340, s: 0.75, expr: "senang", hair: "hijab", skin: 2, pose: "up", color: 1, shoe: YEL }), T.mau + 0.45) + at(P({ x: 890, y: 1364, s: 0.7, expr: "senang", hair: "short", skin: 0, pose: "point", color: 3, bag: YEL, glasses: true }), T.mau + 0.6),
    html: tx("Mau coba *gratis?*", T.mau, null, "left:120px;top:325px;font-size:150px;line-height:.95;color:#fff", "big")
      + `<div class="btn" style="--t:${s(T.komen)}">Coba gratis →</div><div class="kw" style="--t:${s(T.komen)}">Komen <span class="cw">${word}</span></div>` + tx("studiodo.id", T.komen + 1.6, null, "left:120px;top:960px;font-size:64px;color:#fff", "url") });
  void em; void CREAM;
  return assembleReel(SC, STARTS, DURATION, EXTRA_CSS);
}

const EXTRA_CSS = `
.fly{opacity:0;animation:flyin 1.4s ease-in-out forwards,gone .2s forwards;animation-delay:var(--t),var(--o)}
@keyframes flyin{0%{opacity:0;transform:translate(0,0) scale(.8)}12%{opacity:1}100%{opacity:1;transform:translate(var(--dx),var(--dy)) scale(.5)}}
.lv{animation:lvx 2.2s cubic-bezier(.5,0,.8,.6) forwards;animation-delay:var(--t)}@keyframes lvx{to{transform:translateX(var(--dx));opacity:0}}
.shake{animation:shk .35s ease-in-out infinite}@keyframes shk{25%{transform:translate(-8px,2px) rotate(-3deg)}75%{transform:translate(8px,-2px) rotate(3deg)}}
`;

export const SFX: SfxEvent[] = [
  ...[T.jam, T.antrean, T.error, T.bubar, T.bayangin, T.simpan, T.sync, T.putus].map((t): SfxEvent => ["whoosh", t - 0.12, 0.28]),
  ...STARTS.slice(1).map((t): SfxEvent => ["swoosh", t - 0.05, 0.4]),
  ["pop", T.jam + 0.3, 0.4], ["buzz", T.wifi, 0.7], ["thud", T.wifi + 0.05, 0.9], ["beepLow", T.wifi + 0.5, 0.5],
  ...[0, 1, 2, 3, 4, 5].map((i): SfxEvent => ["pop", T.antrean + 0.15 * i, 0.25]), ["thud", T.antrean + 0.6, 0.6],
  ["buzz", T.error + 0.1, 0.5], ["buzz", T.errorWord, 0.8], ["beepLow", T.errorWord, 0.6], ["pop", T.errorWord + 0.1, 0.4],
  ...[0, 1, 2, 3].map((i): SfxEvent => ["whoosh", T.bubar + 0.5 + i * 0.55, 0.25]),
  ["sparkle", T.bayangin + 0.5, 0.35], ["pop", T.bayangin + 0.6, 0.4],
  ["pop", T.simpan + 0.3, 0.45], ["pop", T.simpan + 0.7, 0.45], ["pop", T.simpan + 1.1, 0.45],
  ["rise", T.sync - 0.7, 0.4], ["ding", T.sync + 0.05, 0.4], ["zap", T.sync + 0.1, 0.4], ["zap", T.sync + 0.4, 0.4], ["zap", T.sync + 0.7, 0.4], ["ding", T.sync + 1.5, 0.5], ["sparkle", T.sync + 1.5, 0.35],
  ["thud", T.sesiJalan, 0.9], ["shutter", T.sesiJalan + 0.5, 0.5], ["pop", T.sesiJalan + 0.9, 0.4], ["sparkle", T.sesiJalan + 1.0, 0.35],
  ["boom", T.studiodo, 0.9], ["sparkle", T.studiodo + 0.1, 0.4], ["beepHi", T.studiodo + 0.05, 0.25],
  ["pop", T.komen, 0.5], ...[0, 1, 2, 3].map((i): SfxEvent => ["tick", T.komen + 0.15 + i * 0.28, 0.45]), ["ding", T.komen + 1.7, 0.35],
];
