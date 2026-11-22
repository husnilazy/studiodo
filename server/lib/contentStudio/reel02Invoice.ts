import { wordmark } from "./theme.js";
import { assembleReel, at, blob, BLUE, booth, CREAM, dot, INK, LIL, MINT, ORG, P, PINK, phone, plus, qrCells, s, scIdle, scrMutasi, star, TEAL, tx, vis, YEL, type Sc } from "./heroReel2.js";
import type { SfxEvent } from "./sfx.js";

// Reel 02: "Uangnya masuk. Fotonya enggak. Siapa yang ganti?"  Feature: invoice-tercatat (every QRIS invoice stored per session,
// late payments flagged, differences traceable). Claims literal; the scenario (a customer paying after the QR expired) is illustrative.
// T = phrase starts in the voice over (seconds). Re-measure with silencedetect once the real VO exists, then re-render.

export const MUSIC = "lofi" as const;
export const VO_FILE = "vo-invoice.mp3";
export const T = { bayar: 0.97, qr: 3.07, uang: 5.7, foto: 7.07, cek: 8.73, mutasi: 10.42, ketemu: 13.36, selisih: 15.13, bayangin: 16.72, telat: 20.53, ditandai: 21.69, trace: 23.12, studiodo: 25.38, mau: 26.59, komen: 28.3 };
export const DURATION = 31.3;
const STARTS = [0, T.qr - 0.1, T.uang - 0.1, T.foto - 0.1, T.cek - 0.1, T.mutasi - 0.1, T.selisih - 0.1, T.bayangin - 0.1, T.telat - 0.1, T.trace - 0.1, T.studiodo - 0.1, T.mau - 0.1];
const RED = "#e5384f", GREEN = "#1a9d63";

const money = (x: number, y: number, txt: string, bg: string, fg: string, t: number, w = 330) => at(`<g transform="translate(${x} ${y})"><rect x="${-w / 2}" y="-40" width="${w}" height="80" rx="40" style="fill:${bg}"/><text x="0" y="14" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="38" style="fill:${fg}">${txt}</text></g>`, t);
const stamp = (x: number, y: number, txt: string, c: string, rot: number, t: number, size = 56) => at(`<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="${-txt.length * size * 0.36}" y="${-size * 0.95}" width="${txt.length * size * 0.72}" height="${size * 1.7}" rx="14" style="fill:none;stroke:${c};stroke-width:10"/><text x="0" y="${size * 0.3}" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="${size}" style="fill:${c}">${txt}</text></g>`, t, null, "stamp");
const inv = (x: number, y: number, id: string, amt: string, status: string, sc: string, t: number, w = 780) => at(`<g transform="translate(${x} ${y})"><rect x="${-w / 2}" y="-64" width="${w}" height="128" rx="30" style="fill:#fff"/><circle cx="${-w / 2 + 48}" cy="0" r="17" style="fill:${sc}"/><text x="${-w / 2 + 86}" y="-4" font-family="InterK,sans-serif" font-weight="800" font-size="36" style="fill:${INK}">${id}</text><text x="${-w / 2 + 86}" y="36" font-family="InterK,sans-serif" font-weight="700" font-size="26" style="fill:${INK};opacity:.5">QRIS · ${amt}</text><rect x="${w / 2 - 230}" y="-30" width="200" height="60" rx="30" style="fill:${sc}"/><text x="${w / 2 - 130}" y="11" text-anchor="middle" font-family="InterK,sans-serif" font-weight="800" font-size="26" style="fill:${sc === YEL ? INK : "#fff"}">${status}</text></g>`, t);
const qrCard = (x: number, y: number, sc: number, faded: boolean) => `<g transform="translate(${x} ${y}) scale(${sc})"><rect x="-140" y="-160" width="280" height="320" rx="28" style="fill:#fff"/><g style="opacity:${faded ? 0.22 : 1}">${qrCells(13, 220, -110, -140)}</g><text x="0" y="132" text-anchor="middle" font-family="InterK,sans-serif" font-weight="800" font-size="22" style="fill:${INK}">Scan QRIS</text></g>`;
const scrSuccess = () => `<rect x="-100" y="-200" width="200" height="400" style="fill:#e9fbf2"/><circle cx="0" cy="-90" r="52" style="fill:${GREEN}"/><path d="M-22 -90 L-6 -72 L26 -108" style="fill:none;stroke:#fff;stroke-width:12;stroke-linecap:round;stroke-linejoin:round"/><text x="0" y="0" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="26" style="fill:${INK}">Pembayaran</text><text x="0" y="30" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="26" style="fill:${INK}">berhasil</text><text x="0" y="90" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="34" style="fill:${GREEN}">Rp 25.000</text>`;
const magn = (x: number, y: number, sc: number, c: string) => `<g transform="translate(${x} ${y}) scale(${sc})"><circle cx="0" cy="0" r="56" style="fill:rgba(255,255,255,.35);stroke:${c};stroke-width:16"/><path d="M42 42 L96 96" style="stroke:${c};stroke-width:20;stroke-linecap:round"/></g>`;
const clockFace = (x: number, y: number, sc: number) => `<g transform="translate(${x} ${y}) scale(${sc})"><circle r="90" style="fill:#fff;stroke:${INK};stroke-width:12"/><path d="M0 0 V-58" style="stroke:${INK};stroke-width:10;stroke-linecap:round"/><g class="hand"><path d="M0 0 L50 22" style="stroke:${RED};stroke-width:10;stroke-linecap:round"/></g><circle r="9" style="fill:${INK}"/></g>`;

export function buildReelDoc(): { html: string; durationSec: number } {
  const SC: Sc[] = [];
  // 0 customer pays
  SC.push({ i: 0, bg: CREAM, dark: false, from: "50% 50%", art:
    blob(860, 560, 230, "#ffe3c4") + dot(130, 1420, 70, "#ffd0d8") + plus(930, 1500, 30, ORG, 0.3)
    + at(P({ x: 250, y: 1020, s: 0.95, expr: "senang", hair: "bun", skin: 0, pose: "hold", color: 2, jacket: INK, bag: YEL }), T.bayar + 0.2)
    + at(phone(740, 1200, 1.5, scrSuccess(), 6), T.bayar + 0.4, null, "rise") + money(740, 760, "+ Rp 25.000", MINT, INK, T.bayar + 1.0),
    html: tx("Customer sudah *bayar.*", T.bayar, null, "left:120px;top:310px;font-size:130px;line-height:.98", "big") });
  // 1 the QR expired
  SC.push({ i: 1, bg: PINK, dark: false, from: "20% 80%", art:
    blob(180, 520, 200, "#ffb3cf") + dot(960, 1500, 100, "#ff6fa5", 0.2) + plus(120, 1500, 32, INK, 0.1)
    + at(qrCard(500, 1180, 1.7, true), T.qr + 0.2, null, "rise") + at(clockFace(850, 900, 0.8), T.qr + 0.4) + stamp(560, 1180, "KEDALUWARSA", RED, -10, T.qr + 1.1, 54),
    html: tx("Tapi QR-nya terlanjur *kedaluwarsa.*", T.qr, null, "left:120px;top:310px;font-size:104px;line-height:1", "big") });
  // 2 money came in
  SC.push({ i: 2, bg: MINT, dark: false, from: "50% 20%", art:
    blob(880, 480, 210, "#7af0bd") + dot(120, 1450, 90, "#7af0bd") + star(940, 1300, 32, INK, 0.3) + plus(110, 760, 30, INK, 0.1)
    + at(`<g transform="translate(540 1220)"><rect x="-230" y="-150" width="460" height="300" rx="46" style="fill:${INK}"/><circle cx="170" cy="-96" r="34" style="fill:${YEL}"/><circle cx="170" cy="-96" r="14" style="fill:${INK}"/><text x="-190" y="-70" font-family="InterK,sans-serif" font-weight="800" font-size="30" style="fill:#fff;opacity:.6">Saldo QRIS</text><text x="-190" y="30" font-family="Bricolage,sans-serif" font-weight="800" font-size="84" style="fill:#fff">Rp 25.000</text></g>`, T.uang + 0.2, null, "rise")
    + money(540, 930, "+ Rp 25.000 masuk", "#fff", INK, T.uang + 0.8, 520),
    html: tx("Uang *masuk...*", T.uang, null, "left:120px;top:310px;font-size:150px", "big") });
  // 3 but no photo session
  SC.push({ i: 3, bg: "#14122b", dark: true, from: "50% 100%", art:
    dot(140, 560, 100, "#2a2550") + dot(960, 1400, 150, "#2a2550") + plus(930, 560, 34, YEL, 0.2)
    + booth(660, 1700, 1.15, [{ html: scIdle(), t: 0, o: null }])
    + at(P({ x: 230, y: 1130, s: 0.95, expr: "bingung", hair: "long", skin: 1, pose: "chin", color: 0, glasses: true }), T.foto + 0.3),
    html: tx("fotonya *enggak jalan.*", T.foto, null, "left:120px;top:310px;font-size:128px;line-height:.98;color:#fff", "big") });
  // 4 customer asks
  SC.push({ i: 4, bg: YEL, dark: false, from: "90% 50%", art:
    blob(180, 480, 210, "#ffe27a") + dot(950, 1480, 90, ORG, 0.2) + plus(110, 1500, 32, INK, 0.3)
    + at(P({ x: 280, y: 1060, s: 0.98, expr: "kaget", hair: "curly", skin: 2, pose: "point", color: 1, jacket: "#7b5cff" }), T.cek + 0.2)
    + at(P({ x: 760, y: 1090, s: 0.92, expr: "bingung", hair: "hijab", skin: 1, pose: "chin", color: 2, jacket: INK }), T.cek + 0.5)
    + at(`<g transform="translate(300 860)"><path d="M-150 -70 h300 a30 30 0 0 1 30 30 v70 a30 30 0 0 1 -30 30 h-210 l-50 50 v-50 h-40 a30 30 0 0 1 -30 -30 v-70 a30 30 0 0 1 30 -30z" style="fill:#fff"/><text x="0" y="16" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="46" style="fill:${INK}">Uangku?!</text></g>`, T.cek + 0.6),
    html: tx("Customer minta kamu *cek.*", T.cek, null, "left:120px;top:310px;font-size:118px;line-height:.98", "big") });
  // 5 digging through statements
  SC.push({ i: 5, bg: CREAM, dark: false, from: "80% 30%", art:
    blob(860, 540, 230, "#ffe3c4") + dot(110, 1500, 70, "#ffd0d8") + plus(930, 1500, 30, ORG, 0.3)
    + at(P({ x: 270, y: 1040, s: 0.98, expr: "berpikir", hair: "hijab", skin: 1, pose: "hold", color: 2, jacket: INK }), T.mutasi + 0.2)
    + at(phone(720, 1180, 1.5, scrMutasi(), -5), T.mutasi + 0.3, null, "rise")
    + at(`<g class="bob">${magn(780, 1120, 1.0, INK)}</g>`, T.mutasi + 0.8)
    + stamp(520, 1560, "SESI? TIDAK KETEMU", RED, -4, T.ketemu, 34),
    html: tx("Kamu buka *mutasi,*|cari satu per satu", T.mutasi, T.ketemu, "left:120px;top:310px;font-size:104px;line-height:1", "big") + tx("dan sesinya *nggak ketemu.*", T.ketemu, null, "left:120px;top:310px;font-size:104px;line-height:1", "big") });
  // 6 the cash gap
  SC.push({ i: 6, bg: ORG, dark: true, from: "50% 50%", art:
    dot(140, 1450, 110, "#ff8a50") + dot(960, 560, 70, YEL, 0.3) + plus(930, 1500, 34, "#fff", 0.2)
    + at(`<g transform="translate(300 1180)"><rect x="-230" y="-170" width="460" height="340" rx="40" style="fill:#fff"/><text x="0" y="-80" text-anchor="middle" font-family="InterK,sans-serif" font-weight="800" font-size="30" style="fill:${INK};opacity:.55">Uang masuk</text><text x="0" y="20" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="70" style="fill:${GREEN}">Rp 25.000</text></g>`, T.selisih + 0.3)
    + at(`<g transform="translate(790 1180)"><rect x="-230" y="-170" width="460" height="340" rx="40" style="fill:#fff"/><text x="0" y="-80" text-anchor="middle" font-family="InterK,sans-serif" font-weight="800" font-size="30" style="fill:${INK};opacity:.55">Sesi tercatat</text><text x="0" y="20" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="70" style="fill:${RED}">Rp 0</text></g>`, T.selisih + 0.6)
    + at(`<g transform="translate(540 1180)"><circle r="64" style="fill:${INK}"/><text x="0" y="28" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="84" style="fill:#fff">≠</text></g>`, T.selisih + 0.9),
    html: tx("Selisih kas *lagi.*", T.selisih, null, "left:120px;top:310px;font-size:150px;color:#fff;line-height:.98", "slam") });
  // 7 imagine: every invoice stored per session
  SC.push({ i: 7, bg: BLUE, dark: true, from: "50% 50%", art:
    dot(130, 1000, 100, "#3a64ff") + dot(960, 1500, 150, "#3a64ff") + star(980, 700, 30, YEL, 0.3)
    + inv(540, 940, "Sesi #101", "Rp 25.000", "LUNAS", GREEN, T.bayangin + 1.2) + inv(540, 1100, "Sesi #102", "Rp 25.000", "LUNAS", GREEN, T.bayangin + 1.9) + inv(540, 1260, "Sesi #103", "Rp 35.000", "LUNAS", GREEN, T.bayangin + 2.6) + inv(540, 1420, "Sesi #104", "Rp 25.000", "LUNAS", GREEN, T.bayangin + 3.3),
    html: tx("Sekarang bayangin tiap invoice QRIS *tersimpan per sesi.*", T.bayangin, null, "left:120px;top:310px;font-size:94px;line-height:1;color:#fff", "big") });
  // 8 late payments get flagged
  SC.push({ i: 8, bg: LIL, dark: false, from: "10% 50%", art:
    blob(860, 500, 220, "#dccdff") + dot(130, 1500, 80, "#b49cff") + plus(930, 1500, 30, INK, 0.2) + star(120, 880, 28, INK, 0.3)
    + inv(540, 960, "Sesi #105", "Rp 25.000", "LUNAS", GREEN, T.telat + 0.3) + inv(540, 1130, "Sesi #106", "Rp 25.000", "TERLAMBAT", YEL, T.telat + 0.8)
    + at(clockFace(250, 1380, 0.7), T.telat + 1.1) + stamp(700, 1390, "DITANDAI", ORG, -6, T.ditandai + 0.3, 52),
    html: tx("Yang bayar *terlambat?*", T.telat, T.ditandai, "left:120px;top:310px;font-size:128px;line-height:.98", "big") + tx("*Ditandai* di riwayat.", T.ditandai, null, "left:120px;top:310px;font-size:128px;line-height:.98", "big") });
  // 9 differences can be traced
  SC.push({ i: 9, bg: TEAL, dark: true, from: "50% 100%", art:
    blob(160, 520, 190, "#37cdbf") + dot(940, 380, 56, YEL, 0.2) + plus(100, 1500, 30, "#fff", 0.4)
    + inv(540, 960, "Mutasi bank", "Rp 25.000", "MASUK", BLUE, T.trace + 0.3) + inv(540, 1400, "Sesi #106", "Rp 25.000", "TERLAMBAT", YEL, T.trace + 0.8)
    + at(`<path d="M540 1040 V1330" style="fill:none;stroke:#fff;stroke-width:10;stroke-dasharray:6 22;stroke-linecap:round"/>`, T.trace + 1.2)
    + at(`<g transform="translate(540 1185)"><circle r="54" style="fill:${MINT}"/><path d="M-20 0 L-6 14 L22 -14" style="fill:none;stroke:#fff;stroke-width:11;stroke-linecap:round;stroke-linejoin:round"/></g>`, T.trace + 1.6),
    html: tx("Selisih? *Bisa ditelusuri.*", T.trace, null, "left:120px;top:310px;font-size:118px;line-height:.98;color:#fff", "big") });
  // 10 reveal
  SC.push({ i: 10, bg: "#ffffff", dark: false, from: "50% 50%", art:
    [[160, 520, 40, ORG], [900, 600, 50, BLUE], [200, 1400, 60, YEL], [880, 1380, 44, PINK], [540, 440, 30, MINT]].map(([x, y, r, c], i) => at(dot(x as number, y as number, r as number, c as string, 0.1 * i), T.studiodo + 0.1 * i)).join(""),
    html: `<img class="biglogo" src="${wordmark("ink")}" alt="STUDIODO" style="--t:${s(T.studiodo)}">` + tx("Itu *STUDIODO.*", T.studiodo + 0.25, null, "left:0;right:0;top:1120px;text-align:center;font-size:104px", "mid") + `<div class="flash" style="--t:${s(T.studiodo)}"></div>` });
  // 11 call to action
  const word = "COBA".split("").map((c, i) => `<b style="--t:${s(T.komen + 0.15 + i * 0.28)}">${c}</b>`).join("");
  SC.push({ i: 11, bg: BLUE, dark: true, from: "50% 100%", art:
    dot(120, 330, 90, "#3a64ff") + dot(960, 760, 130, "#3a64ff") + plus(940, 330, 34, YEL, 0) + star(120, 900, 30, YEL, 0.4)
    + at(P({ x: 190, y: 1364, s: 0.7, expr: "senang", hair: "bun", skin: 0, pose: "wave", color: 2, jacket: "#fff3e4" }), T.mau + 0.3) + at(P({ x: 540, y: 1340, s: 0.75, expr: "senang", hair: "long", skin: 1, pose: "up", color: 1, shoe: YEL }), T.mau + 0.45) + at(P({ x: 890, y: 1364, s: 0.7, expr: "senang", hair: "curly", skin: 2, pose: "point", color: 3, bag: YEL, glasses: true }), T.mau + 0.6),
    html: tx("Mau coba *gratis?*", T.mau, null, "left:120px;top:310px;font-size:150px;line-height:.95;color:#fff", "big")
      + `<div class="btn" style="--t:${s(T.komen)}">Coba gratis →</div><div class="kw" style="--t:${s(T.komen)}">Komen <span class="cw">${word}</span></div>` + tx("studiodo.id", T.komen + 1.6, null, "left:120px;top:900px;font-size:64px;color:#fff", "url") });
  void vis;
  return assembleReel(SC, STARTS, DURATION, `.hand{animation:hnd 4s linear infinite;transform-origin:0 0}@keyframes hnd{to{transform:rotate(360deg)}}`);
}

export const SFX: SfxEvent[] = [
  ...[T.bayar, T.qr, T.uang, T.foto, T.cek, T.mutasi, T.bayangin, T.telat, T.ditandai, T.trace].map((t): SfxEvent => ["whoosh", t - 0.12, 0.28]),
  ...STARTS.slice(1).map((t): SfxEvent => ["swoosh", t - 0.05, 0.4]),
  ["ding", T.bayar + 1.0, 0.5], ["pop", T.bayar + 1.0, 0.4],
  ["buzz", T.qr + 1.1, 0.8], ["thud", T.qr + 1.1, 0.8],
  ["ding", T.uang + 0.8, 0.5], ["pop", T.uang + 0.2, 0.4], ["sparkle", T.uang + 0.9, 0.3],
  ["beepLow", T.foto + 0.3, 0.5],
  ["thud", T.cek + 0.6, 0.6], ["pop", T.cek + 0.2, 0.4],
  ["tick", T.mutasi + 0.5, 0.3], ["tick", T.mutasi + 0.8, 0.3], ["tick", T.mutasi + 1.1, 0.3], ["buzz", T.ketemu, 0.8], ["thud", T.ketemu, 0.9],
  ["thud", T.selisih, 0.9], ["pop", T.selisih + 0.3, 0.4], ["pop", T.selisih + 0.6, 0.4], ["thud", T.selisih + 0.9, 0.8],
  ...[1.2, 1.9, 2.6, 3.3].map((d): SfxEvent => ["pop", T.bayangin + d, 0.45]), ["ding", T.bayangin + 3.4, 0.4],
  ["pop", T.telat + 0.3, 0.4], ["pop", T.telat + 0.8, 0.4], ["beepLow", T.telat + 0.8, 0.4], ["thud", T.ditandai + 0.3, 0.8],
  ["pop", T.trace + 0.3, 0.4], ["pop", T.trace + 0.8, 0.4], ["zap", T.trace + 1.2, 0.4], ["ding", T.trace + 1.6, 0.6], ["sparkle", T.trace + 1.7, 0.4],
  ["boom", T.studiodo, 0.9], ["sparkle", T.studiodo + 0.1, 0.4], ["beepHi", T.studiodo + 0.05, 0.25],
  ["pop", T.komen, 0.5], ...[0, 1, 2, 3].map((i): SfxEvent => ["tick", T.komen + 0.15 + i * 0.28, 0.45]), ["ding", T.komen + 1.7, 0.35],
];
