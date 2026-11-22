import { kacaFonts } from "./styleKaca.js";
import { wordmark } from "./theme.js";
import { placeEd, type FigEd } from "./art4.js";
import type { ThemeName } from "./types.js";

// Hero reel v2 "Booth tanpa kasir": an 11-shot storyboard, every shot with its own solid colour, its own composition and its own
// illustrated props (photobooth cabinet, printer, phones, dashboard). Pure CSS animation so the renderer can seek frame by frame.
// Scene starts and phrase times are measured from the Siti v4 take-1 voice over (39.0 s).

export const TIMES = { jam: 0.95, antrean: 2.57, customer: 4.26, dan: 6.53, scroll: 7.47, satu1: 9.47, per: 10.35, satu2: 10.99, bayangin: 11.87, scan: 15.24, bayar: 15.98, sesi: 16.68, hitung: 18.5, strip: 21.28, dan2: 25.42, duduk: 26.34, mimpi: 31.23, studiodo: 32.58, mau: 34.0, komen: 35.13, nanti: 37.28 };
export const HERO_DURATION = 39.4;
export const SCENE_STARTS = [0, 4.2, 6.45, 9.4, 11.8, 15.2, 18.3, 21.2, 25.4, 31.15, 33.95];

export const INK = "#14122b", BLUE = "#1f4bff", NAVY = "#101a4a", YEL = "#ffd23f", ORG = "#ff6b2c", MINT = "#3ddc97", LIL = "#c9b6ff", CREAM = "#fff3e4", PINK = "#ff8fb8", TEAL = "#12b5a6";
export const s = (n: number) => `${n.toFixed(2)}s`;
export const br = (h: string) => h.replace(/\|/g, "<br>");
export const em = (h: string) => h.replace(/\*([^*]+)\*/g, "<em>$1</em>");
export const rich = (h: string) => br(em(h));

// ---- text: absolutely placed block; `cls` picks the entrance. `o` = when it leaves.
export const tx = (html: string, t: number, o: number | null, css: string, cls = "") => `<div class="tx ${cls}" style="--t:${s(t)};${o !== null ? `--o:${s(o)};` : ""}${css}">${rich(html)}</div>`;
export const at = (inner: string, t: number, o: number | null = null, cls = "pop") => `<g class="an ${cls}" style="--t:${s(t)};${o !== null ? `--o:${s(o)};` : ""}">${inner}</g>`;
export const vis = (inner: string, t: number, o: number | null) => `<g class="vis" style="--t:${s(t)};${o !== null ? `--o:${s(o)};` : "--o:999s;"}">${inner}</g>`;
export const svg = (inner: string) => `<svg class="art" viewBox="0 0 1080 1920" aria-hidden="true">${inner}</svg>`;

// ---- flat decoration
export const dot = (x: number, y: number, r: number, c: string, d = 0, cls = "bob") => `<circle class="${cls}" cx="${x}" cy="${y}" r="${r}" style="fill:${c};--d:${d}s"/>`;
export const plus = (x: number, y: number, r: number, c: string, d = 0) => `<path class="spin" d="M${x - r} ${y} h${r * 2} M${x} ${y - r} v${r * 2}" style="stroke:${c};stroke-width:${r * 0.42};stroke-linecap:round;fill:none;--d:${d}s;transform-box:fill-box;transform-origin:center"/>`;
export const star = (x: number, y: number, r: number, c: string, d = 0) => `<path class="bob" d="M${x} ${y - r} Q${x + r * 0.16} ${y - r * 0.16} ${x + r} ${y} Q${x + r * 0.16} ${y + r * 0.16} ${x} ${y + r} Q${x - r * 0.16} ${y + r * 0.16} ${x - r} ${y} Q${x - r * 0.16} ${y - r * 0.16} ${x} ${y - r}Z" style="fill:${c};--d:${d}s"/>`;
export const blob = (x: number, y: number, r: number, c: string) => `<path d="M${x - r} ${y} C${x - r} ${y - r * 1.1} ${x + r * 0.2} ${y - r * 1.3} ${x + r} ${y - r * 0.3} C${x + r * 1.2} ${y + r * 0.8} ${x - r * 0.1} ${y + r * 1.2} ${x - r} ${y}Z" style="fill:${c}"/>`;

// ---- characters (art4): head-centre placement; shoe + jacket + bag + glasses make each one different
export const P = (o: FigEd) => placeEd(o);
export const SH = (x: number, y: number, rx: number) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${rx / 9}" style="fill:#000;opacity:.22"/>`;

// ---- phone: screen content is passed in (pixel units 0..200 x 0..400)
let uid = 0;
export const phone = (x: number, y: number, sc: number, screen: string, rot = 0) => {
  const id = `ph${++uid}`;
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})"><defs><clipPath id="${id}"><rect x="-100" y="-200" width="200" height="400" rx="26"/></clipPath></defs>
    <rect x="-112" y="-212" width="224" height="424" rx="40" style="fill:${INK}"/><rect x="-100" y="-200" width="200" height="400" rx="28" style="fill:#fff"/>
    <g clip-path="url(#${id})">${screen}</g><rect x="-30" y="-196" width="60" height="14" rx="7" style="fill:${INK}"/></g>`;
};
export const scrMutasi = () => {
  const rows = Array.from({ length: 14 }, (_, i) => `<rect x="-86" y="${-170 + i * 44}" width="172" height="34" rx="9" style="fill:${i % 3 === 1 ? "#ffd0d8" : "#eceffa"}"/><rect x="-76" y="${-160 + i * 44}" width="${60 + ((i * 37) % 60)}" height="7" rx="3" style="fill:${INK};opacity:.7"/><rect x="-76" y="${-146 + i * 44}" width="${40 + ((i * 23) % 50)}" height="6" rx="3" style="fill:${INK};opacity:.3"/><rect x="38" y="${-158 + i * 44}" width="40" height="8" rx="4" style="fill:${i % 3 === 1 ? "#e5384f" : "#1a9d63"}"/>`).join("");
  return `<rect x="-100" y="-200" width="200" height="60" style="fill:${BLUE}"/><text x="0" y="-160" text-anchor="middle" font-family="InterK,sans-serif" font-weight="800" font-size="20" style="fill:#fff">Mutasi rekening</text><g class="scrl">${rows}${rows}</g><rect x="-100" y="-200" width="200" height="60" style="fill:${BLUE}"/><text x="0" y="-160" text-anchor="middle" font-family="InterK,sans-serif" font-weight="800" font-size="20" style="fill:#fff">Mutasi rekening</text>`;
};
export const scrPay = (t: number) => `<rect x="-100" y="-200" width="200" height="400" style="fill:#eef2ff"/><text x="0" y="-130" text-anchor="middle" font-family="InterK,sans-serif" font-weight="700" font-size="20" style="fill:${INK};opacity:.6">Total bayar</text><text x="0" y="-84" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="36" style="fill:${INK}">Rp 25.000</text>
  <rect x="-80" y="-30" width="160" height="56" rx="14" style="fill:#fff"/><circle cx="-50" cy="-2" r="15" style="fill:${ORG}"/><rect x="-26" y="-10" width="90" height="9" rx="4" style="fill:${INK};opacity:.7"/><rect x="-26" y="4" width="56" height="7" rx="3" style="fill:${INK};opacity:.3"/>
  <g class="beat" style="--t:${s(t)}"><rect x="-80" y="90" width="160" height="62" rx="31" style="fill:${BLUE}"/><text x="0" y="130" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="30" style="fill:#fff">BAYAR</text></g>`;
export const qrCells = (n: number, size: number, ox: number, oy: number, seed = 3) => {
  let out = "";
  const cell = size / n;
  const finder = (r: number, c: number) => (r < 3 && c < 3) || (r < 3 && c >= n - 3) || (r >= n - 3 && c < 3);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const on = finder(r, c) ? !(r % 3 === 1 && c % 3 === 1 && !(r === 1 && (c === 1 || c === n - 2)) && !(r === n - 2 && c === 1)) || (r === 1 && (c === 1 || c === n - 2)) || (r === n - 2 && c === 1) : ((r * 7 + c * 13 + seed * 5 + r * c) % 5) < 2;
    if (on) out += `<rect x="${(ox + c * cell).toFixed(1)}" y="${(oy + r * cell).toFixed(1)}" width="${(cell + 0.6).toFixed(1)}" height="${(cell + 0.6).toFixed(1)}" style="fill:${INK}"/>`;
  }
  return out;
};
export const scrGallery = () => `<rect x="-100" y="-200" width="200" height="400" style="fill:#f4f1ff"/><text x="0" y="-158" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="24" style="fill:${INK}">Fotomu siap!</text>
  ${[[-84, -134], [6, -134], [-84, -52], [6, -52]].map(([x, y], i) => `<rect x="${x}" y="${y}" width="78" height="72" rx="10" style="fill:${[BLUE, PINK, YEL, MINT][i]}"/><circle cx="${x + 39}" cy="${y + 28}" r="14" style="fill:#fff;opacity:.85"/><rect x="${x + 14}" y="${y + 46}" width="50" height="14" rx="7" style="fill:#fff;opacity:.85"/>`).join("")}
  <rect x="-54" y="40" width="108" height="108" rx="12" style="fill:#fff"/>${qrCells(9, 92, -46, 48)}<text x="0" y="180" text-anchor="middle" font-family="InterK,sans-serif" font-weight="800" font-size="17" style="fill:${BLUE}">Scan untuk unduh</text>`;

// ---- photobooth cabinet. Local units: origin = bottom centre, ~340 wide, ~730 tall. `screens` swap on the touchscreen over time.
type Scr = { html: string; t: number; o: number | null };
export function boothScreens(list: Scr[]): string { return list.map((x) => vis(x.html, x.t, x.o)).join(""); }
export const scQR = (label = "Scan QRIS untuk bayar") => `<rect x="-100" y="-540" width="200" height="200" rx="18" style="fill:#0f1330"/><rect x="-66" y="-526" width="132" height="132" rx="10" style="fill:#fff"/>${qrCells(11, 112, -56, -516)}<text x="0" y="-364" text-anchor="middle" font-family="InterK,sans-serif" font-weight="800" font-size="15" style="fill:#fff">${label}</text><rect class="scanline" x="-60" y="-516" width="120" height="6" rx="3" style="fill:${MINT}"/>`;
export const scIdle = () => `<rect x="-100" y="-540" width="200" height="200" rx="18" style="fill:#0f1330"/><circle class="beat2" cx="0" cy="-460" r="34" style="fill:${ORG}"/><path d="M-12 -474 L-12 -446 L16 -460Z" style="fill:#fff"/><text x="0" y="-390" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="22" style="fill:#fff">Sentuh untuk mulai</text>`;
export const scOk = () => `<rect x="-100" y="-540" width="200" height="200" rx="18" style="fill:#0d6b46"/><circle cx="0" cy="-464" r="50" style="fill:${MINT}"/><path d="M-24 -464 L-8 -446 L26 -484" style="fill:none;stroke:#fff;stroke-width:12;stroke-linecap:round;stroke-linejoin:round"/><text x="0" y="-380" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="24" style="fill:#fff">LUNAS</text>`;
export const scCam = () => `<rect x="-100" y="-540" width="200" height="200" rx="18" style="fill:#2b2f6b"/><circle cx="0" cy="-466" r="40" style="fill:${PINK}"/><circle cx="-14" cy="-474" r="5" style="fill:${INK}"/><circle cx="14" cy="-474" r="5" style="fill:${INK}"/><path d="M-14 -452 Q0 -438 14 -452" style="fill:none;stroke:${INK};stroke-width:5;stroke-linecap:round"/><rect x="-82" y="-420" width="164" height="14" rx="7" style="fill:#fff;opacity:.25"/><text x="0" y="-376" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="20" style="fill:#fff">Siap-siap, senyum!</text>`;
export function booth(x: number, y: number, sc: number, screens: Scr[], strip?: { t: number }, accent = BLUE): string {
  const strp = strip ? `<g clip-path="url(#bclip)"><g class="prt" style="--t:${s(strip.t)}"><rect x="-34" y="-292" width="68" height="226" rx="6" style="fill:#fff"/>${[0, 1, 2, 3].map((i) => `<rect x="-26" y="${-284 + i * 54}" width="52" height="46" rx="4" style="fill:${[BLUE, PINK, YEL, MINT][i]}"/>`).join("")}</g></g>` : "";
  return `<g transform="translate(${x} ${y}) scale(${sc})"><defs><clipPath id="bclip"><rect x="-120" y="-292" width="240" height="400"/></clipPath></defs>
    <ellipse cx="0" cy="0" rx="230" ry="20" style="fill:#000;opacity:.22"/>
    <rect x="-176" y="-740" width="352" height="716" rx="46" style="fill:#fff"/>
    <rect x="-176" y="-740" width="46" height="716" rx="23" style="fill:${accent}"/><rect x="130" y="-740" width="46" height="716" rx="23" style="fill:${accent}"/>
    <rect x="-176" y="-740" width="352" height="96" rx="46" style="fill:${INK}"/><text x="0" y="-678" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="34" letter-spacing="3" style="fill:#fff">PHOTO BOOTH</text>
    <circle cx="0" cy="-596" r="38" style="fill:${INK}"/><circle cx="0" cy="-596" r="24" style="fill:#3a4a9a"/><circle cx="-8" cy="-604" r="7" style="fill:#fff;opacity:.8"/>
    <circle class="glow" cx="0" cy="-440" r="148" style="fill:none;stroke:#fff3c4;stroke-width:22"/><circle cx="0" cy="-440" r="148" style="fill:none;stroke:${YEL};stroke-width:6;opacity:.8"/>
    <rect x="-112" y="-552" width="224" height="224" rx="24" style="fill:${INK}"/>${boothScreens(screens)}
    <rect x="-104" y="-300" width="208" height="46" rx="14" style="fill:${INK}"/><rect x="-80" y="-286" width="160" height="14" rx="7" style="fill:#000"/><text x="-96" y="-306" font-family="InterK,sans-serif" font-weight="800" font-size="14" style="fill:${accent}">CETAK</text>
    ${strp}
    <rect x="-112" y="-200" width="224" height="150" rx="20" style="fill:${accent};opacity:.14"/><rect x="-86" y="-176" width="80" height="80" rx="12" style="fill:${accent}"/><path d="M-70 -150 h48 M-70 -134 h34 M-70 -118 h42" style="stroke:#fff;stroke-width:6;stroke-linecap:round"/><circle cx="52" cy="-136" r="26" style="fill:${YEL}"/><circle cx="52" cy="-136" r="12" style="fill:${INK}"/>
    <circle class="blink" cx="-146" cy="-690" r="7" style="fill:${MINT}"/></g>`;
}
// compact dye-sub printer with a strip sliding out of the slot
export function printer(x: number, y: number, sc: number, t: number): string {
  return `<g transform="translate(${x} ${y}) scale(${sc})"><defs><clipPath id="pclip"><rect x="-200" y="-70" width="400" height="500"/></clipPath></defs>
    <ellipse cx="0" cy="8" rx="250" ry="22" style="fill:#000;opacity:.2"/>
    <rect x="-230" y="-170" width="460" height="170" rx="34" style="fill:${INK}"/><rect x="-230" y="-170" width="460" height="64" rx="34" style="fill:${BLUE}"/>
    <text x="-196" y="-128" font-family="Bricolage,sans-serif" font-weight="800" font-size="30" style="fill:#fff">CETAK FOTO</text><circle class="blink" cx="190" cy="-136" r="11" style="fill:${MINT}"/><circle cx="154" cy="-136" r="11" style="fill:${YEL}"/>
    <rect x="-140" y="-80" width="280" height="22" rx="11" style="fill:#000"/>
    <g clip-path="url(#pclip)"><g class="prt2" style="--t:${s(t)}"><rect x="-70" y="-76" width="140" height="460" rx="8" style="fill:#fff"/>${[0, 1, 2, 3].map((i) => `<rect x="-56" y="${-62 + i * 100}" width="112" height="88" rx="8" style="fill:${[BLUE, PINK, YEL, MINT][i]}"/><circle cx="0" cy="${-30 + i * 100}" r="20" style="fill:#fff;opacity:.85"/><rect x="-32" y="${-4 + i * 100}" width="64" height="18" rx="9" style="fill:#fff;opacity:.85"/>`).join("")}</g></g></g>`;
}
export const card = (x: number, y: number, w: number, h: number, c: string, inner: string, t: number, cls = "pop") => `<g class="an ${cls}" style="--t:${s(t)}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="30" style="fill:${c}"/>${inner}</g>`;
export const logo = (dark: boolean) => `<img class="lg" src="${wordmark(dark ? "white" : "ink")}" alt="STUDIODO">`;

// Instagram Reels safe area (1080x1920): top ~300 (status bar + Reels header), bottom ~1500 (caption, audio, comment box), sides 110/130
// (action buttons on the right; tall phones crop the edges). Text starts at y=310 inside x 120..960; every scene's art is scaled into the box.
export const SAFE = { l: 120, r: 960, t: 310, b: 1500 };
const ART_SAFE = "translate(0 -230) translate(540 1700) scale(.85) translate(-540 -1700)";
export type Sc = { i: number; bg: string; dark: boolean; art: string; html: string; from: string };
function scene(o: Sc, starts: number[]): string {
  const a = starts[o.i], first = o.i === 0;
  return `<section class="sc ${first ? "first" : ""}" style="--in:${s(a)};--bg:${o.bg};--ink:${o.dark ? "#ffffff" : INK};--fx:${o.from}">${svg(`<g transform="${ART_SAFE}">${o.art}</g>`)}${o.html}</section>`;
}

export function buildHeroReelDoc(_theme: ThemeName = "biru"): { html: string; durationSec: number } {
  const T = TIMES;
  const D = (n: number) => n; // readability
  const SC: Sc[] = [];
  const bld = (x: number, w: number, h: number, c: string, win: string) => `<rect x="${x}" y="${1620 - h}" width="${w}" height="${h}" rx="10" style="fill:${c}"/>` + Array.from({ length: Math.floor(h / 120) * 2 }, (_, k) => `<rect x="${x + 22 + (k % 2) * (w / 2 - 6)}" y="${1620 - h + 30 + Math.floor(k / 2) * 120}" width="${w / 2 - 38}" height="62" rx="8" style="fill:${(k * 7 + x) % 5 === 0 ? win : "#27357f"}"/>`).join("");

  // 1 night, queue at the booth
  SC.push({ i: 0, bg: NAVY, dark: true, from: "50% 50%", art:
    dot(840, 360, 96, "#ffe08a") + dot(880, 330, 84, NAVY) + star(160, 560, 20, "#fff", 0.3) + star(520, 640, 14, "#fff", 0.9) + star(960, 600, 16, "#fff", 0.5)
    + bld(-40, 250, 520, "#1a2766", YEL) + bld(250, 220, 380, "#152060", YEL) + bld(760, 330, 600, "#1a2766", YEL)
    + `<rect x="0" y="1620" width="1080" height="300" style="fill:#0a1033"/>`
    + booth(840, 1600, 0.9, [{ html: scIdle(), t: 0, o: null }])
    + at(P({ x: 130, y: 1300, s: 0.6, expr: "khawatir", hair: "long", skin: 1, pose: "hold", color: 0, glasses: true, bag: CREAM }), 0.15) + at(P({ x: 270, y: 1315, s: 0.57, expr: "bingung", hair: "curly", skin: 2, pose: "chin", color: 2, jacket: "#2d2a55" }), 0.35)
    + at(P({ x: 410, y: 1325, s: 0.55, expr: "berpikir", hair: "short", skin: 3, pose: "down", color: 3 }), 0.55) + at(P({ x: 540, y: 1310, s: 0.58, expr: "khawatir", hair: "hijab", skin: 0, pose: "hold", color: 1, bag: "#ffd23f" }), 0.75),
    html:
      tx("JAM 7 *MALAM.*", T.jam, null, "left:120px;top:310px;font-size:150px;color:#fff", "big")
      + `<div class="chip" style="--t:${s(T.jam + 0.3)};left:120px;top:700px;background:${YEL};color:${INK}">🕖 19:00</div>`
      + tx("Antrean booth-mu *mengular.*", T.antrean, null, "left:120px;top:740px;font-size:70px;color:#fff;max-width:840px", "mid") });

  // 2 ready to pay
  SC.push({ i: 1, bg: YEL, dark: false, from: "20% 80%", art:
    blob(180, 520, 220, "#ffe27a") + blob(940, 1500, 260, "#ffc61a") + dot(900, 480, 40, ORG, 0.2) + plus(140, 1250, 34, INK, 0) + star(960, 880, 30, "#fff", 0.4)
    + at(phone(540, 1080, 2.0, scrPay(T.customer + 0.9)), T.customer - 0.1, null, "rise")
    + at(P({ x: 170, y: 1160, s: 0.7, expr: "senang", hair: "bun", skin: 0, pose: "hold", color: 2, bag: INK, jacket: "#7b5cff" }), T.customer + 0.2) + at(P({ x: 920, y: 1180, s: 0.68, expr: "khawatir", hair: "short", skin: 2, pose: "chin", color: 1 }), T.customer + 0.4)
    + dot(300, 700, 26, ORG, 0.1) + dot(780, 760, 18, MINT, 0.5), html: tx("Customer udah *siap bayar...*", T.customer, null, "left:120px;top:310px;font-size:96px;max-width:840px", "big") });

  // 3 owner still scrolling
  const notif = (x: number, y: number, txt: string, c: string, t: number) => `<g class="an pop" style="--t:${s(t)}"><rect x="${x}" y="${y}" width="300" height="74" rx="22" style="fill:${c}"/><text x="${x + 24}" y="${y + 46}" font-family="InterK,sans-serif" font-weight="800" font-size="26" style="fill:${INK}">${txt}</text></g>`;
  SC.push({ i: 2, bg: CREAM, dark: false, from: "80% 20%", art:
    blob(860, 520, 240, "#ffe3c4") + dot(100, 1500, 70, "#ffd0d8", 0) + plus(900, 1480, 30, ORG, 0.3)
    + at(P({ x: 360, y: 1010, s: 0.98, expr: "bingung", hair: "hijab", skin: 1, pose: "chin", color: 2, jacket: "#14122b", glasses: false }), T.dan + 0.1)
    + at(phone(700, 1150, 1.5, scrMutasi(), 6), T.dan + 0.25, null, "rise")
    + notif(60, 760, "Transfer masuk?", "#fff", T.scroll + 0.4) + notif(700, 700, "Rp 25.000 siapa?", "#ffd0d8", T.scroll + 0.9) + notif(120, 1580, "Belum cocok…", "#fff", T.scroll + 1.4),
    html: tx("dan *kamu?*", T.dan, T.scroll - 0.1, "left:120px;top:310px;font-size:170px", "big") + tx("Masih scroll *mutasi bank.*", T.scroll, null, "left:120px;top:310px;font-size:96px;max-width:840px", "big") });

  // 4 satu per satu: three colour slams
  const slam = (word: string, t: number, o: number | null, bgc: string, fg: string, sub: string, ic: string) =>
    `<div class="layer" style="--t:${s(t)};${o !== null ? `--o:${s(o)};` : ""}background:${bgc};color:${fg}"><div class="giant">${word}</div><div class="subtag" style="background:${fg};color:${bgc}">${sub}</div><div class="ic">${ic}</div></div>`;
  const mag = `<svg viewBox="0 0 200 200" width="220" height="220"><circle cx="86" cy="86" r="56" style="fill:none;stroke:currentColor;stroke-width:16"/><path d="M128 128 L180 180" style="stroke:currentColor;stroke-width:20;stroke-linecap:round"/></svg>`;
  SC.push({ i: 3, bg: ORG, dark: true, from: "50% 100%", art: dot(160, 420, 60, YEL, 0) + plus(920, 360, 38, "#fff", 0.2), html:
    slam("SATU.", T.satu1, T.per - 0.02, ORG, "#fff", "cek transfer #1", mag) + slam("PER.", T.per, T.satu2 - 0.02, YEL, INK, "cek transfer #2", mag) + slam("SATU.", T.satu2, null, INK, YEL, "cek transfer #3…", mag) });

  // 5 imagine: the QRIS booth
  SC.push({ i: 4, bg: BLUE, dark: true, from: "50% 50%", art:
    dot(150, 440, 110, "#3a64ff") + dot(950, 1280, 160, "#3a64ff") + plus(110, 1000, 32, YEL, 0) + star(980, 480, 30, YEL, 0.3) + star(210, 1430, 24, "#fff", 0.6)
    + at(booth(540, 1680, 1.3, [{ html: scQR(), t: 0, o: null }]), T.bayangin + 0.1, null, "rise")
    + at(`<g transform="translate(850 880) rotate(10)"><rect x="-110" y="-44" width="220" height="88" rx="24" style="fill:${YEL}"/><text x="0" y="14" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="44" style="fill:${INK}">QRIS</text></g>`, T.bayangin + 1.0)
    + at(P({ x: 930, y: 1230, s: 0.62, expr: "senang", hair: "curly", skin: 2, pose: "wave", color: 1, jacket: "#fff3e4", shoe: YEL }), T.bayangin + 1.6),
    html: tx("QRIS muncul *langsung*|di layar kiosk.", T.bayangin, null, "left:120px;top:310px;font-size:104px;line-height:1;color:#fff", "big") });

  // 6 scan - pay - session starts
  SC.push({ i: 5, bg: MINT, dark: false, from: "10% 50%", art:
    blob(900, 300, 200, "#7af0bd") + dot(120, 1560, 80, "#7af0bd") + plus(960, 1100, 30, INK, 0.2)
    + booth(790, 1640, 1.0, [{ html: scQR(), t: 0, o: T.bayar }, { html: scOk(), t: T.bayar, o: 17.0 }, { html: scCam(), t: 17.0, o: null }])
    + at(P({ x: 230, y: 1190, s: 0.95, expr: "senang", hair: "bun", skin: 0, pose: "hold", color: 2, jacket: "#14122b", bag: "#fff3e4", glasses: true }), 15.3)
    + vis(`<polygon points="330,1280 640,1010 640,1150" style="fill:#fff;opacity:.5"/>`, T.scan, T.bayar)
    + at(`<g transform="translate(300 1420) rotate(-12)"><rect x="-130" y="-52" width="260" height="104" rx="18" style="fill:none;stroke:#e5384f;stroke-width:12"/><text x="0" y="22" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="64" style="fill:#e5384f">LUNAS</text></g>`, T.bayar + 0.1, null, "stamp"),
    html: tx("SCAN.", T.scan, T.bayar - 0.02, "left:120px;top:310px;font-size:230px", "slam") + tx("BAYAR.", T.bayar, T.sesi - 0.02, "left:120px;top:310px;font-size:230px", "slam") + tx("Sesi foto *jalan sendiri!*", T.sesi, null, "left:120px;top:310px;font-size:112px;line-height:.98", "big") });

  // 7 inside the booth: 3-2-1 CEKREK
  const num = (n: string, t: number, o: number) => `<div class="tx slam" style="--t:${s(t)};--o:${s(o)};left:0;right:0;top:470px;text-align:center;font-size:520px;color:${INK}">${n}</div>`;
  SC.push({ i: 6, bg: PINK, dark: false, from: "50% 30%", art:
    dot(540, 760, 380, "#fff") + dot(540, 760, 320, "#ffe0ec") + `<circle class="glow" cx="540" cy="760" r="400" style="fill:none;stroke:#fff;stroke-width:26"/>`
    + dot(90, 300, 40, YEL, 0) + plus(980, 330, 36, INK, 0.2) + star(120, 1180, 26, "#fff", 0.2) + star(980, 1100, 30, "#fff", 0.5)
    + at(P({ x: 300, y: 1090, s: 0.86, expr: "kaget", hair: "curly", skin: 2, pose: "up", color: 2, shoe: BLUE }), 18.55) + at(P({ x: 540, y: 1060, s: 0.95, expr: "senang", hair: "hijab", skin: 0, pose: "up", color: 1, jacket: "#fff", glasses: false }), 18.7) + at(P({ x: 780, y: 1090, s: 0.86, expr: "senang", hair: "long", skin: 1, pose: "up", color: 3, bag: INK, glasses: true }), 18.85)
    + vis(`<g transform="translate(540 330)"><circle r="70" style="fill:${INK}"/><circle r="46" style="fill:#3a4a9a"/><circle cx="-14" cy="-16" r="12" style="fill:#fff;opacity:.85"/></g>`, 18.3, null),
    html: num("3", 18.5, 19.2) + num("2", 19.2, 19.85) + num("1", 19.85, 20.5) + tx("CEK*REK!*", 20.5, 21.15, "left:0;right:0;top:640px;text-align:center;font-size:250px;color:#14122b", "slam") + `<div class="flash" style="--t:${s(20.5)}"></div>` });

  // 8 print + digital gallery
  SC.push({ i: 7, bg: "#ffe9b8", dark: false, from: "50% 100%", art:
    blob(180, 1480, 250, "#ffd88a") + dot(960, 420, 60, ORG, 0.1) + plus(120, 560, 32, INK, 0.3) + star(980, 1000, 30, BLUE, 0.4)
    + printer(330, 1420, 1.3, T.strip) + at(phone(790, 1180, 1.6, scrGallery(), -6), 23.1, null, "rise") + at(star(900, 880, 44, ORG, 0), 23.6) + at(star(190, 1020, 36, BLUE, 0), 22.6),
    html: tx("Strip foto *keluar...*", T.strip, 23.0, "left:120px;top:310px;font-size:112px", "big") + tx("hasil digital *nyampe ke HP*|lewat QR.", 23.1, null, "left:120px;top:310px;font-size:92px;line-height:1", "big") });

  // 9 owner relaxes with the dashboard
  const stat = (x: number, y: number, label: string, val: string, t: number, color = INK) => `<g class="an pop" style="--t:${s(t)}"><rect x="${x}" y="${y}" width="210" height="140" rx="26" style="fill:#fff"/><text x="${x + 20}" y="${y + 42}" font-family="InterK,sans-serif" font-weight="700" font-size="21" style="fill:${INK};opacity:.55">${label}</text><text x="${x + 20}" y="${y + 100}" font-family="Bricolage,sans-serif" font-weight="800" font-size="46" style="fill:${color}">${val}</text></g>`;
  const rows9 = [["QRIS · Strip 4 foto", "+25.000"], ["Cetak tambahan", "+10.000"], ["Voucher event", "dipakai"]];
  SC.push({ i: 8, bg: TEAL, dark: true, from: "90% 90%", art:
    blob(160, 420, 180, "#37cdbf") + dot(940, 330, 56, YEL, 0.2) + plus(90, 1620, 30, "#fff", 0.4)
    + `<rect x="60" y="1560" width="460" height="40" rx="20" style="fill:#0b7a70"/><rect x="120" y="1590" width="26" height="150" style="fill:#0b7a70"/><rect x="440" y="1590" width="26" height="150" style="fill:#0b7a70"/>`
    + at(P({ x: 260, y: 1010, s: 0.9, expr: "lega", hair: "short", skin: 2, pose: "hold", color: 2, jacket: INK, shoe: YEL }), T.dan2 + 0.15)
    + at(`<g transform="translate(400 1470)"><path d="M-34 -30 H34 L26 40 Q0 52 -26 40Z" style="fill:#fff"/><path d="M34 -16 q26 0 22 22 q-4 18 -30 18" style="fill:none;stroke:#fff;stroke-width:9;stroke-linecap:round"/><path class="steam" d="M-10 -52 q-8 -12 0 -24 M10 -52 q-8 -12 0 -24" style="fill:none;stroke:#fff;stroke-width:5;stroke-linecap:round"/></g>`, T.dan2 + 0.5)
    + card(560, 820, 460, 640, "#f4fffd", `<text x="590" y="880" font-family="Bricolage,sans-serif" font-weight="800" font-size="30" style="fill:${INK}">Dashboard</text><circle cx="975" cy="868" r="10" style="fill:${MINT}"/>`, T.duduk + 0.4, "rise")
    + stat(585, 910, "Omzet", "1,25jt", T.duduk + 0.9, BLUE) + stat(805, 910, "Sesi foto", "48", T.duduk + 1.1, ORG)
    + rows9.map((r, i) => `<g class="an pop" style="--t:${s(T.duduk + 1.5 + i * 0.35)}"><rect x="585" y="${1070 + i * 86}" width="430" height="70" rx="20" style="fill:#e7f7f4"/><circle cx="615" cy="${1105 + i * 86}" r="9" style="fill:${MINT}"/><text x="640" y="${1113 + i * 86}" font-family="InterK,sans-serif" font-weight="800" font-size="23" style="fill:${INK}">${r[0]}</text><text x="990" y="${1113 + i * 86}" text-anchor="end" font-family="InterK,sans-serif" font-weight="800" font-size="23" style="fill:${BLUE}">${r[1]}</text></g>`).join("")
    + at(`<text x="790" y="1420" text-anchor="middle" font-family="InterK,sans-serif" font-weight="700" font-size="20" style="fill:${INK};opacity:.45">Contoh tampilan</text>`, T.duduk + 1.6)
    + at(`<g transform="translate(700 760) rotate(-5)"><rect x="-150" y="-30" width="300" height="60" rx="30" style="fill:${YEL}"/><text x="0" y="9" text-anchor="middle" font-family="InterK,sans-serif" font-weight="800" font-size="24" style="fill:${INK}">+ Rp 25.000 · QRIS</text></g>`, 28.0)
    + at(`<g transform="translate(760 1560)"><circle r="14" style="fill:${MINT}"/><text x="26" y="8" font-family="InterK,sans-serif" font-weight="800" font-size="22" style="fill:#fff">Booth online</text></g>`, 29.2),
    html: tx("Dan *kamu?*", T.dan2, T.duduk - 0.1, "left:120px;top:310px;font-size:170px;color:#fff", "big") + tx("Duduk *manis,*|ngopi,", T.duduk, 28.8, "left:120px;top:310px;font-size:140px;line-height:.95;color:#fff", "big") + tx("ngecek *omzet*|dan status booth|dari *dashboard.*", 28.8, null, "left:120px;top:310px;font-size:100px;line-height:1;color:#fff", "big") });

  // 10 reveal
  SC.push({ i: 9, bg: "#ffffff", dark: false, from: "50% 50%", art:
    [[160, 520, 40, ORG], [900, 600, 50, BLUE], [200, 1400, 60, YEL], [880, 1380, 44, PINK], [540, 440, 30, MINT], [100, 980, 26, BLUE], [990, 1000, 30, ORG]].map(([x, y, r, c], i) => at(dot(x as number, y as number, r as number, c as string, 0.1 * i, "bob"), T.studiodo + 0.1 * i)).join("")
    + [[330, 360], [760, 320], [150, 1100], [940, 1250]].map(([x, y], i) => at(star(x, y, 34, INK, 0.2 * i), T.studiodo + 0.3 + i * 0.1)).join(""),
    html: tx("Itu bukan *mimpi.*", T.mimpi, T.studiodo - 0.1, "left:0;right:0;top:760px;text-align:center;font-size:160px", "big")
      + `<img class="biglogo" src="${wordmark("ink")}" alt="STUDIODO" style="--t:${s(T.studiodo)}">` + tx("Itu *STUDIODO.*", T.studiodo + 0.25, null, "left:0;right:0;top:1120px;text-align:center;font-size:104px", "mid") + `<div class="flash" style="--t:${s(T.studiodo)}"></div>` });

  // 11 call to action
  const word = "COBA".split("").map((c, i) => `<b style="--t:${s(T.komen + 0.15 + i * 0.28)}">${c}</b>`).join("");
  SC.push({ i: 10, bg: BLUE, dark: true, from: "50% 100%", art:
    dot(120, 330, 90, "#3a64ff") + dot(960, 760, 130, "#3a64ff") + plus(940, 330, 34, YEL, 0) + star(120, 900, 30, YEL, 0.4)
    + at(P({ x: 190, y: 1364, s: 0.7, expr: "senang", hair: "hijab", skin: 1, pose: "wave", color: 2, jacket: "#fff3e4" }), 34.3) + at(P({ x: 540, y: 1340, s: 0.75, expr: "senang", hair: "curly", skin: 2, pose: "up", color: 1, shoe: YEL, glasses: true }), 34.45) + at(P({ x: 890, y: 1364, s: 0.7, expr: "senang", hair: "short", skin: 0, pose: "point", color: 3, bag: YEL }), 34.6),
    html: tx("Mau coba *gratis?*", T.mau, null, "left:120px;top:310px;font-size:150px;line-height:.95;color:#fff", "big")
      + `<div class="btn" style="--t:${s(T.komen)}">Coba gratis →</div><div class="kw" style="--t:${s(T.komen)}">Komen <span class="cw">${word}</span></div>` + tx("studiodo.id", T.nanti, null, "left:120px;top:960px;font-size:64px;color:#fff", "url") });

  void D;
  return assembleReel(SC, SCENE_STARTS, HERO_DURATION);
}

export const REEL_CSS = `
*{box-sizing:border-box;margin:0;padding:0}html,body{background:#000;overflow:hidden}
.stage{position:relative;width:1080px;height:1920px;overflow:hidden;font-family:"InterK",system-ui,sans-serif}
.sc{position:absolute;inset:0;isolation:isolate;background:var(--bg);color:var(--ink);overflow:hidden;clip-path:circle(0% at var(--fx));animation:wipe .55s cubic-bezier(.6,.05,.3,1) forwards;animation-delay:var(--in)}
.sc.first{clip-path:none;animation:none}
@keyframes wipe{to{clip-path:circle(160% at var(--fx))}}
.art{position:absolute;left:0;top:0;width:1080px;height:1920px;overflow:visible}
.lg{position:absolute;left:120px;top:232px;height:40px;z-index:20}
.tx{position:absolute;max-width:840px;opacity:0;font-family:"Bricolage",system-ui,sans-serif;font-weight:800;letter-spacing:-.035em;line-height:.98;z-index:10;color:var(--ink);animation:txin .6s cubic-bezier(.2,1.3,.4,1) forwards,txout .25s ease forwards;animation-delay:var(--t),var(--o,999s)}
.tx[style*="right:0"]{margin:0 auto}
.guide{position:absolute;inset:0;z-index:99;pointer-events:none;background:linear-gradient(rgba(255,0,0,.28) 0 300px,transparent 300px 1500px,rgba(255,0,0,.28) 1500px);}.guide::before{content:'';position:absolute;left:120px;top:300px;width:840px;height:1200px;border:3px dashed #00e0ff}.guide::after{content:'';position:absolute;right:0;top:1050px;width:130px;height:450px;background:rgba(255,0,0,.2)}
.tx em,.cw{font-family:"Instrument",Georgia,serif;font-style:italic;font-weight:400;font-size:1.12em;letter-spacing:-.02em;color:inherit;opacity:.92}
@keyframes txin{from{opacity:0;transform:translateY(80px) scale(.82) rotate(-3deg)}to{opacity:1;transform:none}}@keyframes txout{to{opacity:0;transform:translateY(-40px) scale(.96)}}
.tx.slam{animation:slam .5s cubic-bezier(.2,1.6,.4,1) forwards,txout .25s ease forwards;animation-delay:var(--t),var(--o,999s)}
@keyframes slam{0%{opacity:0;transform:scale(2.6) rotate(-6deg)}60%{opacity:1;transform:scale(.94)}100%{opacity:1;transform:none}}
.tx.url{font-weight:700;letter-spacing:.04em}
.an{opacity:0;transform-box:fill-box;transform-origin:50% 100%;animation:popin .55s cubic-bezier(.2,1.5,.4,1) forwards,gone .25s ease forwards;animation-delay:var(--t),var(--o,999s)}
.an.rise{animation-name:rise,gone;transform-origin:50% 100%}.an.stamp{animation-name:stamp,gone;transform-origin:50% 50%}
@keyframes popin{from{opacity:0;transform:scale(.25)}to{opacity:1;transform:none}}@keyframes rise{from{opacity:0;transform:translateY(240px)}to{opacity:1;transform:none}}@keyframes stamp{0%{opacity:0;transform:scale(3) rotate(8deg)}70%{opacity:1;transform:scale(.92)}100%{opacity:1;transform:none}}@keyframes gone{to{opacity:0}}
.vis{opacity:0;animation:on .01s forwards,off .01s forwards;animation-delay:var(--t),var(--o)}@keyframes on{to{opacity:1}}@keyframes off{to{opacity:0}}
.bob{animation:bob 3s ease-in-out infinite;animation-delay:var(--d,0s);transform-box:fill-box;transform-origin:center}@keyframes bob{50%{transform:translateY(-16px)}}
.spin{animation:spinr 6s linear infinite;animation-delay:var(--d,0s)}@keyframes spinr{to{transform:rotate(360deg)}}
.beat,.beat2{animation:beatx 1.2s ease-in-out infinite;animation-delay:var(--t,0s);transform-box:fill-box;transform-origin:center}@keyframes beatx{50%{transform:scale(1.1)}}
.blink{animation:blk 1.1s steps(2) infinite}@keyframes blk{50%{opacity:.25}}
.glow{animation:glw 1.6s ease-in-out infinite}@keyframes glw{50%{opacity:.45}}
.scrl{animation:scrl 2.2s linear infinite}@keyframes scrl{to{transform:translateY(-616px)}}
.scanline{animation:scn 1.5s ease-in-out infinite}@keyframes scn{50%{transform:translateY(112px)}}
.steam{animation:stm 2.2s ease-in-out infinite}@keyframes stm{50%{transform:translateY(-10px);opacity:.4}}
.prt{transform:translateY(-230px);animation:prtx 1.6s ease-out forwards;animation-delay:var(--t)}@keyframes prtx{to{transform:none}}
.prt2{transform:translateY(-400px);animation:prty 1.8s ease-out forwards;animation-delay:var(--t)}@keyframes prty{to{transform:translateY(-130px)}}
.chip{position:absolute;opacity:0;padding:20px 40px;border-radius:99px;font:800 56px "Bricolage",sans-serif;z-index:10;animation:txin .5s cubic-bezier(.2,1.4,.4,1) forwards;animation-delay:var(--t)}
.layer{position:absolute;inset:0;clip-path:circle(0% at 50% 60%);animation:lyr .45s cubic-bezier(.5,.05,.3,1) forwards;animation-delay:var(--t);z-index:8}
@keyframes lyr{to{clip-path:circle(160% at 50% 60%)}}
.giant{position:absolute;left:0;right:0;top:600px;text-align:center;font:800 360px/1 "Bricolage",sans-serif;letter-spacing:-.05em}
.subtag{position:absolute;left:120px;top:1040px;padding:18px 36px;border-radius:99px;font:800 46px "InterK",sans-serif;transform:rotate(-3deg)}
.ic{position:absolute;right:150px;top:1160px;transform:rotate(-8deg)}
.flash{position:absolute;inset:0;background:#fff;opacity:0;z-index:30;pointer-events:none;animation:flash .5s ease-out forwards;animation-delay:var(--t)}@keyframes flash{0%{opacity:.95}100%{opacity:0}}
.biglogo{position:absolute;left:140px;top:800px;width:800px;opacity:0;z-index:12;animation:logoin .9s cubic-bezier(.2,1.4,.4,1) forwards;animation-delay:var(--t)}@keyframes logoin{from{opacity:0;transform:scale(.4) rotate(-6deg)}to{opacity:1;transform:none}}
.btn{position:absolute;left:120px;top:640px;padding:34px 62px;border-radius:99px;font:800 54px "InterK",sans-serif;background:${YEL};color:${INK};opacity:0;z-index:11;animation:txin .6s cubic-bezier(.2,1.3,.4,1) forwards,beat 1.8s ease-in-out infinite 1.2s;animation-delay:var(--t)}@keyframes beat{50%{transform:scale(1.05)}}
.kw{position:absolute;left:120px;top:780px;padding:22px 42px;border:3px dashed rgba(255,255,255,.7);border-radius:99px;font:700 48px "InterK",sans-serif;color:#fff;opacity:0;z-index:11;animation:txin .6s ease forwards;animation-delay:var(--t)}.kw .cw{font-family:"Bricolage",sans-serif;font-weight:800;font-style:normal;font-size:1em;letter-spacing:.12em;color:${YEL}}.kw b{opacity:0;display:inline-block;animation:txin .3s ease forwards;animation-delay:var(--t)}
`;

/** Wraps scenes into one seekable HTML page (1080x1920, scene i starts at starts[i] seconds). */
export function assembleReel(sc: Sc[], starts: number[], durationSec: number, extraCss = ""): { html: string; durationSec: number } {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${kacaFonts()}${REEL_CSS}${extraCss}</style></head><body><div class="stage">${sc.map((o) => scene(o, starts)).join("")}${process.env.REEL_GUIDE ? '<div class="guide"></div>' : ""}</div>
<script>window.__seek=(ms)=>{document.getAnimations().forEach(a=>{a.pause();a.currentTime=ms;});};window.__ready=true;</script></body></html>`;
  return { html, durationSec };
}
