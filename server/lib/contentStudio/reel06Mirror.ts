import { wordmark } from "./theme.js";
import { assembleReel, at, blob, BLUE, CREAM, dot, INK, LIL, MINT, ORG, P, PINK, plus, s, star, tx, vis, YEL, type Sc } from "./heroReel2.js";
import { chip, cross, GREEN, RED, tick, toggle } from "./reelParts.js";
import type { SfxEvent } from "./sfx.js";

// Reel 06: "Cetakannya terbalik. 'Ini bukan aku!'"  Feature: mirror-asli (Cermin/Asli toggle: the print matches what the live view shows,
// text is not reversed). CTA type: "tag" (tag a friend whose photo came out reversed). The "HALO" shirt is an illustration.

export const MUSIC = "synthwave" as const;
export const VO_FILE = "vo-mirror.mp3";
export const T = { kaos: 0.99, layar: 4.0, cetak: 6.36, kebalik: 8.04, bingung: 9.39, bayangin: 15.14, hasil: 18.21, studiodo: 22.52, tag: 23.95, tombol: 25.6 };
export const DURATION = 27.6;
const STARTS = [0, T.layar - 0.1, T.cetak - 0.1, T.bingung - 0.1, T.bayangin - 0.1, T.hasil - 0.1, T.studiodo - 0.1, T.tag - 0.1];

const shirt = (x: number, y: number, sc: number, text: string, mirrored: boolean, c = "#fff") =>
  `<g transform="translate(${x} ${y}) scale(${sc})"><path d="M-150 -120 L-60 -150 Q0 -110 60 -150 L150 -120 L210 -20 L140 30 L110 -10 V190 H-110 V-10 L-140 30 L-210 -20Z" style="fill:${c}"/><g transform="translate(0 40) ${mirrored ? "scale(-1 1)" : ""}"><text x="0" y="0" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="76" style="fill:${INK}">${text}</text></g></g>`;
const strip = (x: number, y: number, sc: number, text: string, mirrored: boolean) =>
  `<g transform="translate(${x} ${y}) scale(${sc})"><rect x="-110" y="-280" width="220" height="560" rx="14" style="fill:#fff"/>${[0, 1, 2].map((i) => `<rect x="-90" y="${-258 + i * 176}" width="180" height="160" rx="10" style="fill:${[BLUE, PINK, YEL][i]}"/>`).join("")}<g transform="translate(0 -170) ${mirrored ? "scale(-1 1)" : ""}"><text x="0" y="0" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="52" style="fill:#fff">${text}</text></g></g>`;
const screenCard = (x: number, y: number, sc: number, text: string) =>
  `<g transform="translate(${x} ${y}) scale(${sc})"><rect x="-200" y="-150" width="400" height="300" rx="34" style="fill:#14122b"/><rect x="-176" y="-126" width="352" height="252" rx="22" style="fill:#2b2f6b"/><text x="0" y="22" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="84" style="fill:#fff">${text}</text><text x="0" y="-86" text-anchor="middle" font-family="InterK,sans-serif" font-weight="800" font-size="24" style="fill:#fff;opacity:.6">Tampilan live</text></g>`;

export function buildReelDoc(): { html: string; durationSec: number } {
  const SC: Sc[] = [];
  // 0 customer in a shirt with writing
  SC.push({ i: 0, bg: CREAM, dark: false, from: "50% 50%", art:
    blob(860, 520, 220, "#ffe3c4") + dot(110, 1500, 70, "#ffd0d8") + plus(930, 1500, 30, ORG, 0.3)
    + at(P({ x: 330, y: 1080, s: 0.95, expr: "senang", hair: "curly", skin: 2, pose: "up", color: 1 }), T.kaos + 0.2)
    + at(shirt(760, 1200, 1.2, "HALO", false), T.kaos + 0.5, null, "rise"),
    html: tx("Customer berfoto pakai *baju bertulisan.*", T.kaos, null, "left:120px;top:310px;font-size:100px;line-height:1", "big") });
  // 1 the live view is right
  SC.push({ i: 1, bg: MINT, dark: false, from: "20% 50%", art:
    blob(880, 480, 210, "#7af0bd") + dot(120, 1450, 90, "#7af0bd") + star(940, 1360, 30, INK, 0.3)
    + at(screenCard(540, 1150, 1.45, "HALO"), T.layar + 0.3, null, "rise") + at(tick(860, 900, 56), T.layar + 1.2),
    html: tx("Di layar, tulisannya *benar.*", T.layar, null, "left:120px;top:310px;font-size:116px;line-height:.98", "big") });
  // 2 the print is reversed
  SC.push({ i: 2, bg: PINK, dark: false, from: "90% 50%", art:
    blob(180, 520, 200, "#ffb3cf") + dot(950, 1480, 90, "#ff6fa5", 0.2) + plus(110, 1500, 32, INK, 0.1)
    + at(strip(540, 1170, 1.15, "HALO", true), T.cetak + 0.3, null, "rise") + at(cross(800, 900, 56), T.kebalik + 0.3),
    html: tx("Di hasil cetak... *kebalik.*", T.cetak, null, "left:120px;top:310px;font-size:124px;line-height:.98", "big") });
  // 3 confusion, the strip is thrown away
  SC.push({ i: 3, bg: "#14122b", dark: true, from: "50% 100%", art:
    dot(130, 560, 100, "#2a2550") + dot(960, 1400, 150, "#2a2550") + plus(930, 560, 34, YEL, 0.2)
    + at(P({ x: 250, y: 1090, s: 0.9, expr: "bingung", hair: "curly", skin: 2, pose: "chin", color: 1 }), T.bingung + 0.2)
    + at(P({ x: 560, y: 1110, s: 0.85, expr: "khawatir", hair: "hijab", skin: 1, pose: "hold", color: 2, jacket: "#fff3e4" }), T.bingung + 0.5)
    + at(`<g transform="translate(850 1330)"><path d="M-80 -90 H80 L66 110 H-66Z" style="fill:#3a3f7a"/><rect x="-96" y="-120" width="192" height="30" rx="10" style="fill:#4a50a0"/><g class="drop" style="--t:${s(T.bingung + 2.8)}"><rect x="-26" y="-250" width="52" height="150" rx="6" style="fill:#fff"/><rect x="-18" y="-240" width="36" height="34" rx="4" style="fill:${PINK}"/></g></g>`, T.bingung + 0.8),
    html: tx("Customer bingung, kamu bingung, *strip dibuang.*", T.bingung, null, "left:120px;top:310px;font-size:92px;line-height:1;color:#fff", "big") });
  // 4 imagine: the Cermin / Asli switch
  SC.push({ i: 4, bg: BLUE, dark: true, from: "50% 50%", art:
    dot(130, 1000, 100, "#3a64ff") + dot(960, 1500, 150, "#3a64ff") + star(980, 700, 30, YEL, 0.3)
    + at(toggle(540, 1100, "Cermin", "Asli", false), T.bayangin + 1.0, null, "rise")
    + vis(toggle(540, 1100, "Cermin", "Asli", true), T.bayangin + 3.0, null) + at(`<g transform="translate(540 1280)"><text x="0" y="0" text-anchor="middle" font-family="InterK,sans-serif" font-weight="800" font-size="34" style="fill:#fff;opacity:.8">Pilih di editor foto</text></g>`, T.bayangin + 1.6),
    html: tx("Sekarang bayangin ada tombol *cermin atau asli.*", T.bayangin, null, "left:120px;top:310px;font-size:100px;line-height:1;color:#fff", "big") });
  // 5 the print now matches the screen
  SC.push({ i: 5, bg: YEL, dark: false, from: "10% 50%", art:
    blob(180, 520, 200, "#ffe27a") + dot(950, 1480, 90, ORG, 0.2) + plus(110, 1500, 32, INK, 0.3)
    + at(screenCard(330, 1180, 0.95, "HALO"), T.hasil + 0.4, null, "rise") + at(strip(790, 1180, 0.8, "HALO", false), T.hasil + 1.0, null, "rise")
    + at(`<text x="540" y="1190" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="90" style="fill:${INK}">=</text>`, T.hasil + 1.6) + at(tick(540, 940, 56), T.hasil + 2.0),
    html: tx("Hasil cetak *persis* tampilan layar.", T.hasil, null, "left:120px;top:310px;font-size:112px;line-height:.98", "big") });
  // 6 reveal
  SC.push({ i: 6, bg: "#ffffff", dark: false, from: "50% 50%", art:
    [[160, 520, 40, ORG], [900, 600, 50, BLUE], [200, 1400, 60, YEL], [880, 1380, 44, PINK], [540, 440, 30, MINT]].map(([x, y, r, c], i) => at(dot(x as number, y as number, r as number, c as string, 0.1 * i), T.studiodo + 0.1 * i)).join(""),
    html: `<img class="biglogo" src="${wordmark("ink")}" alt="STUDIODO" style="--t:${s(T.studiodo)}">` + tx("Itu *STUDIODO.*", T.studiodo + 0.25, null, "left:0;right:0;top:1120px;text-align:center;font-size:104px", "mid") + `<div class="flash" style="--t:${s(T.studiodo)}"></div>` });
  // 7 CTA: tag a friend
  SC.push({ i: 7, bg: LIL, dark: false, from: "50% 100%", art:
    blob(160, 520, 190, "#dccdff") + dot(940, 420, 60, YEL, 0.2) + plus(100, 1500, 30, INK, 0.4)
    + at(P({ x: 250, y: 1300, s: 0.78, expr: "kaget", hair: "long", skin: 1, pose: "point", color: 2, jacket: INK }), T.tag + 0.4)
    + at(P({ x: 560, y: 1320, s: 0.75, expr: "senang", hair: "short", skin: 2, pose: "wave", color: 1 }), T.tag + 0.6)
    + at(P({ x: 850, y: 1300, s: 0.78, expr: "bingung", hair: "bun", skin: 0, pose: "chin", color: 3, glasses: true }), T.tag + 0.8),
    html: tx("Tag temanmu yang fotonya *pernah kebalik!*", T.tag, null, "left:120px;top:310px;font-size:104px;line-height:1", "big")
      + `<div class="btn" style="--t:${s(T.tombol)};top:760px;background:${INK};color:#fff">Tag di komentar ↓</div>` + tx("studiodo.id", T.tombol + 0.6, null, "left:120px;top:940px;font-size:56px", "url") });
  void CREAM; void RED; void chip; void GREEN;
  return assembleReel(SC, STARTS, DURATION, `.drop{transform:translateY(-120px);animation:drp 1s ease-in forwards;animation-delay:var(--t)}@keyframes drp{to{transform:translateY(60px);opacity:.0}}`);
}

export const SFX: SfxEvent[] = [
  ...[T.kaos, T.layar, T.cetak, T.bingung, T.bayangin, T.hasil, T.tag].map((t): SfxEvent => ["whoosh", t - 0.12, 0.28]),
  ...STARTS.slice(1).map((t): SfxEvent => ["swoosh", t - 0.05, 0.4]),
  ["pop", T.kaos + 0.5, 0.4], ["sparkle", T.kaos + 0.9, 0.3],
  ["pop", T.layar + 0.3, 0.4], ["ding", T.layar + 1.2, 0.5],
  ["pop", T.cetak + 0.3, 0.4], ["buzz", T.kebalik + 0.3, 0.7], ["thud", T.kebalik + 0.3, 0.7],
  ["pop", T.bingung + 0.5, 0.4], ["pop", T.bingung + 0.8, 0.4], ["thud", T.bingung + 3.1, 0.5],
  ["pop", T.bayangin + 1.0, 0.45], ["tick", T.bayangin + 3.0, 0.6], ["pop", T.bayangin + 3.0, 0.4], ["sparkle", T.bayangin + 3.1, 0.3],
  ["pop", T.hasil + 0.4, 0.4], ["pop", T.hasil + 1.0, 0.4], ["ding", T.hasil + 2.0, 0.55], ["sparkle", T.hasil + 2.1, 0.35],
  ["boom", T.studiodo, 0.9], ["sparkle", T.studiodo + 0.1, 0.4], ["beepHi", T.studiodo + 0.05, 0.25],
  ["pop", T.tombol, 0.5], ["tick", T.tombol + 0.3, 0.4], ["sparkle", T.tombol + 0.6, 0.3],
];
