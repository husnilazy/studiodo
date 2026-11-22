import { wordmark } from "./theme.js";
import { assembleReel, at, blob, BLUE, booth, CREAM, dot, INK, LIL, MINT, ORG, P, PINK, phone, plus, s, scIdle, star, TEAL, tx, YEL, type Sc } from "./heroReel2.js";
import type { SfxEvent } from "./sfx.js";

// Reel 03: "Kamu tahu booth-mu error dari... komentar customer?"  Feature: monitor-error (kiosk errors reported to the dashboard with context,
// online/offline status). The CTA is deliberately NOT "coba gratis": this one asks the viewer to tag the operator who reports late.
// NOTE: verify that a tenant (not only the platform's superadmin log) sees these kiosk error reports before posting.
// T = phrase starts in the voice over (seconds), measured with silencedetect on vo-error.mp3.

export const MUSIC = "techno" as const;
export const VO_FILE = "vo-error.mp3";
export const T = { error: 0.87, rumah: 2.99, operator: 5.7, komentar: 8.54, bayangin: 12.25, lapor: 15.03, konteks: 16.96, online: 18.57, duluan: 21.12, studiodo: 23.49, cta: 24.82, tag: 26.75 };
export const DURATION = 29.4;
const STARTS = [0, T.rumah - 0.1, T.operator - 0.1, T.komentar - 0.1, T.bayangin - 0.1, T.lapor - 0.1, T.online - 0.1, T.duluan - 0.1, T.studiodo - 0.1, T.cta - 0.1];
const RED = "#e5384f", GREEN = "#1a9d63", GOLD = "#ffcf5c";

const chip = (x: number, y: number, txt: string, bg: string, fg: string, t: number, w = 360, size = 32) => at(`<g transform="translate(${x} ${y})"><rect x="${-w / 2}" y="-38" width="${w}" height="76" rx="38" style="fill:${bg}"/><text x="0" y="${size * 0.36}" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="${size}" style="fill:${fg}">${txt}</text></g>`, t);
const alarm = (x: number, y: number, sc: number, t: number) => at(`<g transform="translate(${x} ${y}) scale(${sc})"><circle r="70" style="fill:${RED}"/><path d="M0 -38 V6" style="stroke:#fff;stroke-width:14;stroke-linecap:round"/><circle cx="0" cy="30" r="9" style="fill:#fff"/></g>`, t, null, "pop");
const bubble = (x: number, y: number, w: number, txt: string, bg: string, t: number, rot = 0, fg = INK) => at(`<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="${-w / 2}" y="-52" width="${w}" height="104" rx="30" style="fill:${bg}"/><path d="M${-w / 2 + 40} 52 l-22 34 l54 -34z" style="fill:${bg}"/><text x="0" y="12" text-anchor="middle" font-family="InterK,sans-serif" font-weight="800" font-size="30" style="fill:${fg}">${txt}</text></g>`, t);
const bell = (x: number, y: number, sc: number, c: string) => `<g transform="translate(${x} ${y}) scale(${sc})"><path d="M-56 30 Q-56 -60 0 -70 Q56 -60 56 30 L70 52 H-70Z" style="fill:${c}"/><circle cx="0" cy="68" r="14" style="fill:${c}"/></g>`;
const logRow = (x: number, y: number, title: string, sub: string, dotc: string, t: number, w = 780) => at(`<g transform="translate(${x} ${y})"><rect x="${-w / 2}" y="-72" width="${w}" height="144" rx="30" style="fill:#fff"/><circle cx="${-w / 2 + 50}" cy="0" r="18" style="fill:${dotc}"/><text x="${-w / 2 + 92}" y="-8" font-family="InterK,sans-serif" font-weight="800" font-size="34" style="fill:${INK}">${title}</text><text x="${-w / 2 + 92}" y="34" font-family="InterK,sans-serif" font-weight="700" font-size="25" style="fill:${INK};opacity:.55">${sub}</text></g>`, t);

export function buildReelDoc(): { html: string; durationSec: number } {
  const SC: Sc[] = [];
  // 0 busy hour, a booth with an alarm
  SC.push({ i: 0, bg: GOLD, dark: false, from: "50% 50%", art:
    blob(850, 540, 220, "#ffe29a") + dot(130, 1450, 80, "#ffb938") + plus(940, 1500, 32, INK, 0.2)
    + at(booth(620, 1700, 1.1, [{ html: scIdle(), t: 0, o: null }], undefined, BLUE), T.error + 0.2, null, "rise") + alarm(380, 940, 1.0, T.error + 0.9)
    + at(P({ x: 190, y: 1130, s: 0.8, expr: "khawatir", hair: "curly", skin: 2, pose: "hold", color: 1 }), T.error + 0.4),
    html: tx("Booth *error* di jam ramai.", T.error, null, "left:120px;top:310px;font-size:120px;line-height:.98", "big") });
  // 1 owner at home, knows nothing
  SC.push({ i: 1, bg: LIL, dark: false, from: "10% 90%", art:
    blob(860, 520, 220, "#dccdff") + dot(120, 1450, 80, "#b49cff") + plus(930, 1500, 30, INK, 0.2) + star(900, 900, 30, INK, 0.3)
    + `<rect x="150" y="1380" width="780" height="40" rx="20" style="fill:#7b5cff"/><rect x="170" y="1230" width="560" height="170" rx="46" style="fill:#9d85ff"/>`
    + at(P({ x: 420, y: 1010, s: 0.9, expr: "lega", hair: "short", skin: 2, pose: "hold", color: 2, jacket: INK, shoe: YEL }), T.rumah + 0.2)
    + at(phone(800, 1180, 1.2, `<rect x="-100" y="-200" width="200" height="400" style="fill:#14122b"/><text x="0" y="14" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="64" style="fill:#fff;opacity:.5">…</text>`, 8), T.rumah + 0.5, null, "rise")
    + chip(760, 880, "Tidak ada notifikasi", "#fff", INK, T.rumah + 1.3, 420, 28),
    html: tx("Kamu di rumah, *nggak tahu* apa-apa.", T.rumah, null, "left:120px;top:310px;font-size:104px;line-height:1", "big") });
  // 2 operator busy, customers waiting
  SC.push({ i: 2, bg: PINK, dark: false, from: "90% 20%", art:
    blob(180, 520, 200, "#ffb3cf") + dot(960, 1480, 90, "#ff6fa5", 0.2) + plus(110, 1500, 32, INK, 0.1)
    + at(P({ x: 230, y: 1060, s: 0.95, expr: "kaget", hair: "bun", skin: 0, pose: "up", color: 2, jacket: BLUE }), T.operator + 0.2)
    + [0, 1, 2].map((i) => at(P({ x: 560 + i * 170, y: 1150, s: 0.7, expr: i % 2 ? "bingung" : "khawatir", hair: (["long", "short", "hijab"] as const)[i], skin: (i + 1) % 4, pose: "down", color: i + 1 }), T.operator + 0.5 + i * 0.25)).join("")
    + chip(300, 860, "Sibuk banget!", "#fff", INK, T.operator + 0.9, 330, 30) + chip(760, 940, "Nunggu…", YEL, INK, T.operator + 1.5, 250, 30),
    html: tx("Operator sibuk, customer *nunggu...*", T.operator, null, "left:120px;top:310px;font-size:108px;line-height:1", "big") });
  // 3 the bad news arrives as comments
  SC.push({ i: 3, bg: "#14122b", dark: true, from: "50% 100%", art:
    dot(130, 560, 100, "#2a2550") + dot(960, 1400, 150, "#2a2550") + plus(930, 560, 34, YEL, 0.2)
    + at(phone(540, 1180, 1.6, `<rect x="-100" y="-200" width="200" height="400" style="fill:#fff"/><text x="-84" y="-150" font-family="InterK,sans-serif" font-weight="800" font-size="19" style="fill:${INK}">Komentar</text><rect x="-84" y="-120" width="168" height="2" style="fill:${INK};opacity:.1"/>`, -4), T.komentar + 0.2, null, "rise")
    + bubble(540, 900, 520, "Kak, booth-nya error!", "#ffd0d8", T.komentar + 0.9, -3) + bubble(520, 1100, 540, "Kok nggak bisa mulai?", "#fff", T.komentar + 1.5, 2) + bubble(560, 1300, 500, "Udah 20 menit nunggu", "#ffd0d8", T.komentar + 2.1, -2),
    html: tx("dan kabar buruknya baru sampai... *lewat komentar.*", T.komentar, null, "left:120px;top:310px;font-size:92px;line-height:1;color:#fff", "big") });
  // 4 imagine: the kiosk reports by itself
  SC.push({ i: 4, bg: BLUE, dark: true, from: "50% 50%", art:
    dot(130, 1000, 100, "#3a64ff") + dot(960, 1500, 150, "#3a64ff") + star(980, 700, 30, YEL, 0.3)
    + at(booth(250, 1620, 0.75, [{ html: scIdle(), t: 0, o: null }], undefined, "#1a2fb0"), T.bayangin + 0.2, null, "rise") + alarm(250, 1010, 0.6, T.bayangin + 0.9)
    + `<path d="M380 1230 Q560 1100 760 1150" style="fill:none;stroke:#fff;stroke-width:7;stroke-dasharray:4 20;stroke-linecap:round"/>`
    + at(`<g transform="translate(850 1150)"><rect x="-120" y="-150" width="240" height="300" rx="34" style="fill:#fff"/>${bell(0, -30, 1.1, RED)}<text x="0" y="116" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="30" style="fill:${INK}">Laporan</text></g>`, T.bayangin + 1.3),
    html: tx("Sekarang bayangin *kiosk melapor sendiri.*", T.bayangin, null, "left:120px;top:310px;font-size:100px;line-height:1;color:#fff", "big") });
  // 5 error log with context
  SC.push({ i: 5, bg: MINT, dark: false, from: "50% 20%", art:
    blob(880, 480, 210, "#7af0bd") + dot(120, 1450, 90, "#7af0bd") + star(940, 1360, 30, INK, 0.3)
    + logRow(540, 960, "Kiosk 2 · Kamera tidak terdeteksi", "19:42 · Booth Mal A", RED, T.lapor + 0.5)
    + chip(300, 1160, "Versi aplikasi", "#fff", INK, T.konteks + 0.1, 330, 26) + chip(660, 1160, "Jaringan", "#fff", INK, T.konteks + 0.4, 250, 26) + chip(880, 1160, "Sesi aktif", "#fff", INK, T.konteks + 0.7, 230, 26)
    + logRow(540, 1330, "Kiosk 1 · Printer kehabisan kertas", "19:55 · Booth Mal A", YEL, T.konteks + 1.3),
    html: tx("Error-nya *dilaporkan ke dashboard,*|lengkap dengan konteks.", T.lapor, null, "left:120px;top:310px;font-size:84px;line-height:1", "big") });
  // 6 online / offline status
  const st = (y: number, name: string, c: string, label: string, t: number) => at(`<g transform="translate(540 ${y})"><rect x="-390" y="-70" width="780" height="140" rx="30" style="fill:#fff"/><circle cx="-330" cy="0" r="20" style="fill:${c}"/><text x="-286" y="12" font-family="InterK,sans-serif" font-weight="800" font-size="36" style="fill:${INK}">${name}</text><rect x="120" y="-32" width="240" height="64" rx="32" style="fill:${c}"/><text x="240" y="10" text-anchor="middle" font-family="InterK,sans-serif" font-weight="800" font-size="28" style="fill:${c === YEL ? INK : "#fff"}">${label}</text></g>`, t);
  SC.push({ i: 6, bg: YEL, dark: false, from: "10% 50%", art:
    blob(180, 520, 200, "#ffe27a") + dot(950, 1480, 90, ORG, 0.2) + plus(110, 1500, 32, INK, 0.3)
    + st(960, "Booth Mal A", GREEN, "ONLINE", T.online + 0.4) + st(1130, "Booth Event B", RED, "OFFLINE", T.online + 1.0) + st(1300, "Booth Kafe C", GREEN, "ONLINE", T.online + 1.6),
    html: tx("Status *online atau offline* kelihatan.", T.online, null, "left:120px;top:310px;font-size:104px;line-height:1", "big") });
  // 7 you know first: timeline
  SC.push({ i: 7, bg: ORG, dark: true, from: "50% 50%", art:
    dot(140, 1450, 110, "#ff8a50") + dot(960, 560, 70, YEL, 0.3) + plus(930, 1500, 34, "#fff", 0.2)
    + at(P({ x: 270, y: 1090, s: 0.95, expr: "senang", hair: "hijab", skin: 1, pose: "hold", color: 2, jacket: INK }), T.duluan + 0.2)
    + at(phone(760, 1180, 1.4, `<rect x="-100" y="-200" width="200" height="400" style="fill:#fff"/><rect x="-86" y="-160" width="172" height="90" rx="18" style="fill:#ffd0d8"/><text x="-70" y="-122" font-family="InterK,sans-serif" font-weight="800" font-size="17" style="fill:${INK}">Laporan kiosk</text><text x="-70" y="-96" font-family="InterK,sans-serif" font-weight="700" font-size="14" style="fill:${INK};opacity:.6">Kamera tidak terdeteksi</text>`, 6), T.duluan + 0.5, null, "rise")
    + chip(300, 860, "19:42 Laporan kiosk", "#fff", INK, T.duluan + 1.2, 450, 30) + chip(760, 1560, "20:10 Komentar customer", INK, "#fff", T.duluan + 2.0, 560, 28),
    html: tx("Kamu tahu *duluan,*|bukan belakangan.", T.duluan, null, "left:120px;top:310px;font-size:100px;line-height:.98;color:#fff", "big") });
  // 8 reveal
  SC.push({ i: 8, bg: "#ffffff", dark: false, from: "50% 50%", art:
    [[160, 520, 40, ORG], [900, 600, 50, BLUE], [200, 1400, 60, YEL], [880, 1380, 44, PINK], [540, 440, 30, MINT]].map(([x, y, r, c], i) => at(dot(x as number, y as number, r as number, c as string, 0.1 * i), T.studiodo + 0.1 * i)).join(""),
    html: `<img class="biglogo" src="${wordmark("ink")}" alt="STUDIODO" style="--t:${s(T.studiodo)}">` + tx("Itu *STUDIODO.*", T.studiodo + 0.25, null, "left:0;right:0;top:1120px;text-align:center;font-size:104px", "mid") + `<div class="flash" style="--t:${s(T.studiodo)}"></div>` });
  // 9 CTA: tag the operator (not "coba gratis")
  SC.push({ i: 9, bg: TEAL, dark: true, from: "50% 100%", art:
    blob(160, 520, 190, "#37cdbf") + dot(940, 420, 60, YEL, 0.2) + plus(100, 1500, 30, "#fff", 0.4)
    + at(P({ x: 250, y: 1260, s: 0.8, expr: "senang", hair: "curly", skin: 2, pose: "point", color: 1, jacket: "#fff3e4" }), T.cta + 0.4)
    + at(P({ x: 560, y: 1290, s: 0.75, expr: "bingung", hair: "short", skin: 3, pose: "chin", color: 3, glasses: true }), T.cta + 0.6)
    + at(P({ x: 840, y: 1270, s: 0.78, expr: "senang", hair: "hijab", skin: 0, pose: "wave", color: 2, bag: YEL }), T.cta + 0.8),
    html: tx("Punya operator yang *suka telat lapor?*", T.cta, null, "left:120px;top:310px;font-size:104px;line-height:1;color:#fff", "big")
      + `<div class="btn" style="--t:${s(T.tag)};top:700px">Tag dia di komentar ↓</div><div class="kw" style="--t:${s(T.tag + 0.3)};top:850px;border-style:solid;color:#fff">Simpan, kirim ke timmu</div>` + tx("studiodo.id", T.tag + 1.4, null, "left:120px;top:990px;font-size:56px;color:#fff", "url") });
  return assembleReel(SC, STARTS, DURATION);
}

export const SFX: SfxEvent[] = [
  ...[T.error, T.rumah, T.operator, T.komentar, T.bayangin, T.lapor, T.online, T.duluan, T.cta].map((t): SfxEvent => ["whoosh", t - 0.12, 0.28]),
  ...STARTS.slice(1).map((t): SfxEvent => ["swoosh", t - 0.05, 0.4]),
  ["buzz", T.error + 0.9, 0.8], ["thud", T.error + 0.9, 0.7], ["beepLow", T.error + 1.2, 0.5],
  ["pop", T.rumah + 0.5, 0.4], ["pop", T.rumah + 1.3, 0.4],
  ["pop", T.operator + 0.9, 0.4], ["pop", T.operator + 1.5, 0.4], ["buzz", T.operator + 0.2, 0.5],
  ["pop", T.komentar + 0.9, 0.45], ["pop", T.komentar + 1.5, 0.45], ["pop", T.komentar + 2.1, 0.45], ["buzz", T.komentar + 2.1, 0.4],
  ["buzz", T.bayangin + 0.9, 0.5], ["zap", T.bayangin + 1.1, 0.4], ["ding", T.bayangin + 1.4, 0.55], ["sparkle", T.bayangin + 1.5, 0.35],
  ["pop", T.lapor + 0.5, 0.45], ["pop", T.konteks + 0.1, 0.35], ["pop", T.konteks + 0.4, 0.35], ["pop", T.konteks + 0.7, 0.35], ["pop", T.konteks + 1.3, 0.45],
  ["pop", T.online + 0.4, 0.4], ["pop", T.online + 1.0, 0.4], ["beepLow", T.online + 1.0, 0.4], ["pop", T.online + 1.6, 0.4],
  ["ding", T.duluan + 0.5, 0.5], ["pop", T.duluan + 1.2, 0.4], ["pop", T.duluan + 2.0, 0.4], ["sparkle", T.duluan + 1.3, 0.3],
  ["boom", T.studiodo, 0.9], ["sparkle", T.studiodo + 0.1, 0.4], ["beepHi", T.studiodo + 0.05, 0.25],
  ["pop", T.tag, 0.5], ["ding", T.tag + 0.2, 0.4], ["tick", T.tag + 0.3, 0.4], ["sparkle", T.tag + 0.6, 0.3],
];
