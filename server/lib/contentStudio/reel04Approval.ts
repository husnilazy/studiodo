import { wordmark } from "./theme.js";
import { assembleReel, at, blob, BLUE, CREAM, dot, INK, LIL, MINT, ORG, P, PINK, phone, plus, s, star, TEAL, tx, vis, YEL, type Sc } from "./heroReel2.js";
import type { SfxEvent } from "./sfx.js";

// Reel 04: "Satu orang bisa tarik saldo booth-mu sendirian?"  Features: persetujuan-dua-orang (large withdrawals need a 2nd approval,
// new bank accounts are held first, approvals leave a trail). CTA type: "tanya" (ask the audience), not "coba gratis".
// The scenario (someone adding an account and emptying the balance) is illustrative; no accusation, no real amounts.
// T = phrase starts in the voice over (seconds), measured with silencedetect on vo-approval.mp3.

export const MUSIC = "house" as const;
export const VO_FILE = "vo-approval.mp3";
export const T = { rekening: 0.97, hilang: 3.33, nol: 5.71, sendirian: 6.82, belakangan: 9.25, bayangin: 11.37, ditahan: 15.57, jejak: 17.69, studiodo: 19.34, tanya: 20.5, jawab: 22.0 };
export const DURATION = 26.2;
const STARTS = [0, T.hilang - 0.1, T.sendirian - 0.1, T.belakangan - 0.1, T.bayangin - 0.1, T.ditahan - 0.1, T.jejak - 0.1, T.studiodo - 0.1, T.tanya - 0.1];
const RED = "#e5384f", GREEN = "#1a9d63", DARK = "#14122b";

const chip = (x: number, y: number, txt: string, bg: string, fg: string, t: number, w = 360, size = 32) => at(`<g transform="translate(${x} ${y})"><rect x="${-w / 2}" y="-38" width="${w}" height="76" rx="38" style="fill:${bg}"/><text x="0" y="${size * 0.36}" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="${size}" style="fill:${fg}">${txt}</text></g>`, t);
const row = (x: number, y: number, title: string, sub: string, dotc: string, t: number, w = 780, tag?: { txt: string; bg: string; fg: string }) => at(`<g transform="translate(${x} ${y})"><rect x="${-w / 2}" y="-72" width="${w}" height="144" rx="30" style="fill:#fff"/><circle cx="${-w / 2 + 50}" cy="0" r="18" style="fill:${dotc}"/><text x="${-w / 2 + 92}" y="-8" font-family="InterK,sans-serif" font-weight="800" font-size="34" style="fill:${INK}">${title}</text><text x="${-w / 2 + 92}" y="34" font-family="InterK,sans-serif" font-weight="700" font-size="25" style="fill:${INK};opacity:.55">${sub}</text>${tag ? `<rect x="${w / 2 - 230}" y="-30" width="200" height="60" rx="30" style="fill:${tag.bg}"/><text x="${w / 2 - 130}" y="11" text-anchor="middle" font-family="InterK,sans-serif" font-weight="800" font-size="26" style="fill:${tag.fg}">${tag.txt}</text>` : ""}</g>`, t);
const avatar = (x: number, y: number, c: string, letter: string, t: number, done: boolean) => at(`<g transform="translate(${x} ${y})"><circle r="82" style="fill:${c}"/><text x="0" y="26" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="76" style="fill:#fff">${letter}</text>${done ? `<g transform="translate(60 -60)"><circle r="30" style="fill:${GREEN}"/><path d="M-12 0 L-3 10 L14 -10" style="fill:none;stroke:#fff;stroke-width:7;stroke-linecap:round;stroke-linejoin:round"/></g>` : ""}</g>`, t);
const lock = (x: number, y: number, sc: number, c: string) => `<g transform="translate(${x} ${y}) scale(${sc})"><rect x="-50" y="-10" width="100" height="80" rx="16" style="fill:${c}"/><path d="M-30 -10 V-34 a30 30 0 0 1 60 0 V-10" style="fill:none;stroke:${c};stroke-width:16;stroke-linecap:round"/><circle cx="0" cy="30" r="9" style="fill:#fff"/></g>`;
const wallet = (x: number, y: number, label: string, amount: string, c: string, fg = "#fff") => `<g transform="translate(${x} ${y})"><rect x="-300" y="-160" width="600" height="320" rx="50" style="fill:${c}"/><text x="-250" y="-70" font-family="InterK,sans-serif" font-weight="800" font-size="30" style="fill:${fg};opacity:.65">${label}</text><text x="-250" y="40" font-family="Bricolage,sans-serif" font-weight="800" font-size="74" style="fill:${fg}">${amount}</text></g>`;

export function buildReelDoc(): { html: string; durationSec: number } {
  const SC: Sc[] = [];
  // 0 a new bank account is added
  SC.push({ i: 0, bg: DARK, dark: true, from: "50% 50%", art:
    dot(130, 520, 100, "#2a2550") + dot(960, 1400, 150, "#2a2550") + plus(930, 560, 34, YEL, 0.2) + star(120, 1450, 30, "#fff", 0.4)
    + row(540, 1040, "Rekening baru", "BCA •••• 4821", MINT, T.rekening + 0.5, 780, { txt: "BARU", bg: YEL, fg: INK })
    + chip(540, 1240, "Penarikan diubah", "#fff", INK, T.rekening + 1.2, 440, 30),
    html: tx("Rekening baru *ditambahkan.*", T.rekening, null, "left:120px;top:325px;font-size:120px;line-height:.98;color:#fff", "big") });
  // 1 balance gone
  SC.push({ i: 1, bg: RED, dark: true, from: "20% 50%", art:
    dot(150, 1500, 80, "#ff7a84") + dot(940, 480, 60, "#ff7a84", 0.4) + plus(920, 1500, 34, "#fff", 0.2)
    + at(wallet(540, 1180, "Saldo booth", "Rp 12.500.000", BLUE), T.hilang + 0.2, null, "rise")
    + vis(wallet(540, 1180, "Saldo booth", "Rp 0", INK), T.nol, null)
    + at(`<g transform="translate(540 1420)"><rect x="-300" y="-20" width="600" height="40" rx="20" style="fill:rgba(255,255,255,.25)"/><rect class="drain" x="-300" y="-20" width="600" height="40" rx="20" style="fill:${YEL};--t:${s(T.hilang + 0.9)}"/></g>`, T.hilang + 0.4),
    html: tx("Besok pagi, saldo booth... *hilang.*", T.hilang, null, "left:120px;top:325px;font-size:112px;line-height:.98;color:#fff", "big") });
  // 2 one person can withdraw alone
  SC.push({ i: 2, bg: ORG, dark: true, from: "90% 50%", art:
    dot(140, 1450, 110, "#ff8a50") + dot(960, 560, 70, YEL, 0.3) + plus(930, 1500, 34, "#fff", 0.2)
    + at(P({ x: 300, y: 1080, s: 0.98, expr: "senang", hair: "short", skin: 2, pose: "hold", color: 1, jacket: INK }), T.sendirian + 0.2)
    + at(phone(740, 1180, 1.4, `<rect x="-100" y="-200" width="200" height="400" style="fill:#fff"/><text x="0" y="-130" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="24" style="fill:${INK}">Tarik dana</text><rect x="-80" y="-80" width="160" height="60" rx="14" style="fill:#eef2ff"/><text x="0" y="-40" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="26" style="fill:${INK}">Rp 12.500.000</text><g class="beat"><rect x="-80" y="60" width="160" height="62" rx="31" style="fill:${RED}"/><text x="0" y="100" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="26" style="fill:#fff">TARIK</text></g>`, 6), T.sendirian + 0.4, null, "rise")
    + chip(300, 780, "Sendirian", YEL, INK, T.sendirian + 1.2, 300, 30),
    html: tx("Satu orang bisa tarik dana *sendirian...*", T.sendirian, null, "left:120px;top:325px;font-size:104px;line-height:1;color:#fff", "big") });
  // 3 the owner finds out later
  SC.push({ i: 3, bg: CREAM, dark: false, from: "10% 50%", art:
    blob(860, 520, 220, "#ffe3c4") + dot(110, 1500, 70, "#ffd0d8") + plus(930, 1500, 30, ORG, 0.3)
    + at(P({ x: 270, y: 1040, s: 0.98, expr: "kaget", hair: "hijab", skin: 1, pose: "hold", color: 2, jacket: INK }), T.belakangan + 0.2)
    + at(phone(740, 1180, 1.5, `<rect x="-100" y="-200" width="200" height="400" style="fill:#fff"/><text x="0" y="-100" text-anchor="middle" font-family="InterK,sans-serif" font-weight="700" font-size="20" style="fill:${INK};opacity:.6">Saldo booth</text><text x="0" y="-40" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="46" style="fill:${RED}">Rp 0</text>`, -5), T.belakangan + 0.4, null, "rise")
    + chip(300, 800, "Baru tahu…", "#fff", INK, T.belakangan + 1.2, 320, 30),
    html: tx("dan kamu baru tahu *belakangan.*", T.belakangan, null, "left:120px;top:325px;font-size:112px;line-height:.98", "big") });
  // 4 imagine: second person must approve
  SC.push({ i: 4, bg: BLUE, dark: true, from: "50% 50%", art:
    dot(130, 1000, 100, "#3a64ff") + dot(960, 1500, 150, "#3a64ff") + star(980, 700, 30, YEL, 0.3)
    + row(540, 1000, "Penarikan Rp 10.000.000", "Butuh 2 persetujuan", YEL, T.bayangin + 1.6, 780)
    + avatar(300, 1290, ORG, "A", T.bayangin + 2.3, true) + avatar(780, 1290, MINT, "B", T.bayangin + 3.3, true)
    + vis(chip(540, 1480, "1 / 2 disetujui", "#fff", INK, 0, 420, 30), T.bayangin + 2.4, T.bayangin + 3.3) + vis(chip(540, 1480, "2 / 2 disetujui · diproses", GREEN, "#fff", 0, 560, 30), T.bayangin + 3.3, null),
    html: tx("Sekarang bayangin penarikan besar *disetujui orang kedua.*", T.bayangin, null, "left:120px;top:325px;font-size:92px;line-height:1;color:#fff", "big") });
  // 5 new accounts are held
  SC.push({ i: 5, bg: YEL, dark: false, from: "10% 50%", art:
    blob(180, 520, 200, "#ffe27a") + dot(950, 1480, 90, ORG, 0.2) + plus(110, 1500, 32, INK, 0.3)
    + row(540, 1050, "Rekening baru", "BCA •••• 4821", MINT, T.ditahan + 0.4, 780, { txt: "DITAHAN", bg: INK, fg: YEL })
    + at(lock(540, 1330, 1.6, INK), T.ditahan + 1.0, null, "stamp"),
    html: tx("Rekening baru? *Ditahan dulu.*", T.ditahan, null, "left:120px;top:325px;font-size:124px;line-height:.98", "big") });
  // 6 every approval leaves a trail
  SC.push({ i: 6, bg: MINT, dark: false, from: "90% 20%", art:
    blob(880, 480, 210, "#7af0bd") + dot(120, 1450, 90, "#7af0bd") + star(940, 1360, 30, INK, 0.3)
    + row(540, 960, "Disetujui oleh Rani", "Penarikan Rp 10.000.000 · 19:40", GREEN, T.jejak + 0.5)
    + row(540, 1140, "Diajukan oleh Dimas", "Penarikan Rp 10.000.000 · 19:32", BLUE, T.jejak + 1.1)
    + row(540, 1320, "Rekening baru ditahan", "BCA •••• 4821 · 19:20", YEL, T.jejak + 1.7),
    html: tx("Setiap persetujuan, *ada jejaknya.*", T.jejak, null, "left:120px;top:325px;font-size:116px;line-height:.98", "big") });
  // 7 reveal
  SC.push({ i: 7, bg: "#ffffff", dark: false, from: "50% 50%", art:
    [[160, 520, 40, ORG], [900, 600, 50, BLUE], [200, 1400, 60, YEL], [880, 1380, 44, PINK], [540, 440, 30, MINT]].map(([x, y, r, c], i) => at(dot(x as number, y as number, r as number, c as string, 0.1 * i), T.studiodo + 0.1 * i)).join(""),
    html: `<img class="biglogo" src="${wordmark("ink")}" alt="STUDIODO" style="--t:${s(T.studiodo)}">` + tx("Itu *STUDIODO.*", T.studiodo + 0.25, null, "left:0;right:0;top:1120px;text-align:center;font-size:104px", "mid") + `<div class="flash" style="--t:${s(T.studiodo)}"></div>` });
  // 8 CTA: ask the audience (not "coba gratis")
  SC.push({ i: 8, bg: LIL, dark: false, from: "50% 100%", art:
    blob(160, 520, 190, "#dccdff") + dot(940, 420, 60, YEL, 0.2) + plus(100, 1500, 30, INK, 0.4)
    + at(P({ x: 250, y: 1280, s: 0.78, expr: "bingung", hair: "bun", skin: 0, pose: "chin", color: 2, jacket: INK }), T.tanya + 0.4)
    + at(P({ x: 560, y: 1300, s: 0.75, expr: "senang", hair: "short", skin: 2, pose: "hold", color: 1 }), T.tanya + 0.6)
    + at(P({ x: 850, y: 1280, s: 0.78, expr: "berpikir", hair: "curly", skin: 3, pose: "chin", color: 3, glasses: true }), T.tanya + 0.8),
    html: tx("Uang booth-mu *dijaga siapa?*", T.tanya, null, "left:120px;top:325px;font-size:100px;line-height:.98", "big")
      + `<div class="btn" style="--t:${s(T.jawab)};top:700px;background:${INK};color:#fff">Cerita di komentar ↓</div><div class="kw" style="--t:${s(T.jawab + 0.3)};top:850px;border-style:solid;color:${INK};border-color:${INK}">Satu orang, atau berdua?</div>` + tx("studiodo.id", T.jawab + 1.4, null, "left:120px;top:990px;font-size:56px", "url") });
  void TEAL; void PINK;
  return assembleReel(SC, STARTS, DURATION, `.drain{transform-origin:0 50%;animation:drn 2s ease-in forwards;animation-delay:var(--t)}@keyframes drn{to{transform:scaleX(0)}}`);
}

export const SFX: SfxEvent[] = [
  ...[T.rekening, T.hilang, T.sendirian, T.belakangan, T.bayangin, T.ditahan, T.jejak, T.tanya].map((t): SfxEvent => ["whoosh", t - 0.12, 0.28]),
  ...STARTS.slice(1).map((t): SfxEvent => ["swoosh", t - 0.05, 0.4]),
  ["pop", T.rekening + 0.5, 0.45], ["pop", T.rekening + 1.2, 0.4], ["beep", T.rekening + 0.55, 0.3],
  ["pop", T.hilang + 0.2, 0.4], ["rise", T.hilang + 0.9, 0.3], ["buzz", T.nol, 0.8], ["thud", T.nol, 0.9],
  ["pop", T.sendirian + 0.4, 0.4], ["pop", T.sendirian + 1.2, 0.4], ["beepLow", T.sendirian + 1.2, 0.4],
  ["thud", T.belakangan + 0.4, 0.6], ["pop", T.belakangan + 1.2, 0.4],
  ["pop", T.bayangin + 1.6, 0.45], ["pop", T.bayangin + 2.3, 0.45], ["ding", T.bayangin + 2.4, 0.4], ["pop", T.bayangin + 3.3, 0.45], ["ding", T.bayangin + 3.4, 0.55], ["sparkle", T.bayangin + 3.5, 0.35],
  ["pop", T.ditahan + 0.4, 0.45], ["thud", T.ditahan + 1.0, 0.9], ["tick", T.ditahan + 1.05, 0.5],
  ["pop", T.jejak + 0.5, 0.4], ["pop", T.jejak + 1.1, 0.4], ["pop", T.jejak + 1.7, 0.4], ["ding", T.jejak + 1.8, 0.4],
  ["boom", T.studiodo, 0.9], ["sparkle", T.studiodo + 0.1, 0.4], ["beepHi", T.studiodo + 0.05, 0.25],
  ["pop", T.jawab, 0.5], ["tick", T.jawab + 0.3, 0.4], ["sparkle", T.jawab + 0.6, 0.3],
];
