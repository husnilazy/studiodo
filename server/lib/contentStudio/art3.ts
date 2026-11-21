// Semi-3D "toy" characters: bean-shaped bodies, big spherical heads, glossy hair, soft shading (gradients, highlights, contact
// shadows). Friendly proportions on purpose (big head, tiny face, mitten hands, no teeth/eye whites) so it reads cute, not uncanny.
// Pure SVG; colours that matter come from the deck theme (var(--c1..c3)).
import { bubble, clock, coins, kiosk, okBadge, phone, sparkle, warn, camera, sliders, strip, printer, shield, lock, frames, rocket, checklist } from "./art.js";
import type { Expr, Hair } from "./art.js";

type Pose = "down" | "hold" | "up" | "chin" | "point";
export type Fig3 = { x: number; y: number; s?: number; expr: Expr; pose?: Pose; hair?: Hair; skin?: number; color?: 1 | 2 | 3; d?: number; flip?: boolean };

let uid = 0;
const SKINS: [string, string, string][] = [["#ffe0c8", "#f2b996", "#c98a68"], ["#f7cba6", "#e0a47a", "#b57652"], ["#e6b088", "#c98a62", "#9c6544"], ["#c99370", "#a8714f", "#7c4d33"]];
const HAIRS: [string, string][] = [["#4a3a66", "#1d1630"], ["#3b3b4d", "#14141f"], ["#7a5238", "#3a2417"]];

export function figure3(o: Fig3): string {
  const id = `g${++uid}`;
  const skin = SKINS[(o.skin ?? 1) % SKINS.length], hairC = HAIRS[(o.skin ?? 0) % HAIRS.length];
  const col = o.color === 3 ? "--c3" : o.color === 2 ? "--c2" : "--c1";
  const dark = `color-mix(in srgb,var(${col}) 62%,#000)`, light = `color-mix(in srgb,var(${col}) 78%,#fff)`;
  const expr = o.expr, pose = o.pose ?? "down", hair = o.hair ?? "short";
  const defs = `<defs>
    <radialGradient id="${id}h" cx=".38" cy=".3" r=".85"><stop offset="0" stop-color="${skin[0]}"/><stop offset=".6" stop-color="${skin[1]}"/><stop offset="1" stop-color="${skin[2]}"/></radialGradient>
    <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${light}"/><stop offset=".45" style="stop-color:var(${col})"/><stop offset="1" style="stop-color:${dark}"/></linearGradient>
    <linearGradient id="${id}a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:${light}"/><stop offset="1" style="stop-color:var(${col})"/></linearGradient>
    <linearGradient id="${id}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hairC[0]}"/><stop offset="1" stop-color="${hairC[1]}"/></linearGradient>
    <linearGradient id="${id}j" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:color-mix(in srgb,var(--c3) 70%,#fff)"/><stop offset="1" style="stop-color:var(--c3)"/></linearGradient>
    <radialGradient id="${id}k" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ff8aa5" stop-opacity=".55"/><stop offset="1" stop-color="#ff8aa5" stop-opacity="0"/></radialGradient>
  </defs>`;
  const arm = (d: string, hx: number, hy: number) =>
    `<path d="${d}" style="fill:none;stroke:${dark};stroke-width:42;stroke-linecap:round;opacity:.35" transform="translate(0 5)"/><path d="${d}" style="fill:none;stroke:url(#${id}a);stroke-width:36;stroke-linecap:round"/><circle cx="${hx}" cy="${hy}" r="19" fill="url(#${id}h)"/><ellipse cx="${hx - 5}" cy="${hy - 6}" rx="7" ry="5" fill="#fff" opacity=".3"/>`;
  const mir = (d: string) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_m, a, b) => `${-Number(a)} ${b}`);
  const A: Record<Pose, string> = {
    down: arm("M-62 104 Q-100 176 -80 238", -80, 244) + arm("M62 104 Q100 176 80 238", 80, 244),
    hold: arm("M-62 106 Q-100 178 -38 204", -34, 204) + arm("M62 106 Q100 178 38 204", 34, 204),
    up: arm("M-62 100 Q-140 60 -54 -4", -52, -8) + arm(mir("M-62 100 Q-140 60 -54 -4"), 52, -8),
    chin: arm("M-62 104 Q-100 176 -80 238", -80, 244) + arm("M62 100 Q140 92 24 66", 20, 64),
    point: arm("M-62 104 Q-100 176 -80 238", -80, 244) + arm("M62 100 Q156 100 196 30", 200, 24),
  };
  const body = `<ellipse cx="0" cy="318" rx="104" ry="17" fill="#000" opacity=".3"/>
    <ellipse cx="-26" cy="300" rx="28" ry="16" style="fill:${dark}"/><ellipse cx="26" cy="300" rx="28" ry="16" style="fill:${dark}"/>
    <ellipse cx="0" cy="176" rx="68" ry="122" fill="url(#${id}b)"/><ellipse cx="-26" cy="140" rx="18" ry="62" fill="#fff" opacity=".13"/>`;
  const hijab = hair === "hijab";
  const cap = (extra = "") => `<path d="M-58 -4 C-66 -80 66 -80 58 -4 C46 -42 16 -54 0 -54 C-16 -54 -46 -42 -58 -4Z" fill="url(#${id}r)"/><ellipse cx="-20" cy="-50" rx="22" ry="7" fill="#fff" opacity=".22"/>${extra}`;
  const back = hair === "long" ? `<path d="M-64 0 C-88 -84 88 -84 64 0 C84 34 78 82 74 112 Q0 136 -74 112 C-78 82 -84 34 -64 0Z" fill="url(#${id}r)"/>`
    : hijab ? `<path d="M-68 6 C-68 -76 68 -76 68 6 C68 52 100 96 108 176 Q0 214 -108 176 C-100 96 -68 52 -68 6Z" fill="url(#${id}j)"/>` : "";
  const front = hijab ? "" : hair === "bun" ? cap(`<circle cx="0" cy="-74" r="24" fill="url(#${id}r)"/><ellipse cx="-8" cy="-82" rx="9" ry="5" fill="#fff" opacity=".25"/>`)
    : hair === "curly" ? [-46, -22, 2, 26, 50].map((cx, i) => `<circle cx="${cx}" cy="${-30 - (i % 2) * 14}" r="30" fill="url(#${id}r)"/>`).join("") + `<ellipse cx="-20" cy="-62" rx="18" ry="6" fill="#fff" opacity=".2"/>` : cap();
  const head = `<circle cx="-58" cy="8" r="11" fill="url(#${id}h)"/><circle cx="58" cy="8" r="11" fill="url(#${id}h)"/><circle cx="0" cy="0" r="58" fill="url(#${id}h)"/><ellipse cx="-20" cy="-30" rx="22" ry="12" fill="#fff" opacity=".22"/>`;
  const hy = hijab ? 3 : 0;
  const eye = (cx: number, big = false) => `<ellipse cx="${cx}" cy="4" rx="${big ? 8 : 6.5}" ry="${big ? 10 : 8.5}" fill="#1b1730"/><circle cx="${cx - 2}" cy="${big ? -1 : 0}" r="2.4" fill="#fff"/>`;
  const closed = `<path d="M-30 6 Q-20 -4 -10 6M10 6 Q20 -4 30 6" style="fill:none;stroke:#1b1730;stroke-width:4;stroke-linecap:round"/>`;
  const brow = (d: string) => `<path d="${d}" style="fill:none;stroke:${hairC[1]};stroke-width:4.2;stroke-linecap:round;opacity:.85"/>`;
  const face: Record<Expr, string> = {
    bingung: eye(-20) + eye(20) + brow("M-32 -14 Q-20 -22 -8 -14M10 -18 L30 -10") + `<path d="M-10 32 Q-4 26 2 32 T14 32" style="fill:none;stroke:#7a3b3b;stroke-width:3.6;stroke-linecap:round"/>`,
    kaget: eye(-20, true) + eye(20, true) + brow("M-32 -20 Q-20 -30 -8 -20M8 -20 Q20 -30 32 -20") + `<ellipse cx="0" cy="34" rx="7" ry="9" fill="#5a2230"/>`,
    senang: closed + `<path d="M-14 24 Q0 44 14 24Z" fill="#5a2230"/><path d="M-7 33 Q0 40 7 33" fill="none" stroke="#ff8aa5" stroke-width="4" stroke-linecap="round"/>`,
    khawatir: eye(-20) + eye(20) + brow("M-34 -10 L-8 -20M34 -10 L8 -20") + `<path d="M-12 36 Q0 26 12 36" style="fill:none;stroke:#7a3b3b;stroke-width:3.6;stroke-linecap:round"/><path d="M48 -34 q10 16 0 22 q-10 -6 0 -22z" fill="#8ad8ff" class="a-blink"/>`,
    berpikir: eye(-20) + eye(20) + brow("M-32 -12 L-8 -12M8 -20 Q20 -28 32 -20") + `<path d="M-8 32 H8" style="fill:none;stroke:#7a3b3b;stroke-width:3.6;stroke-linecap:round"/>`,
    lega: closed + `<path d="M-10 28 Q0 38 10 28" style="fill:none;stroke:#7a3b3b;stroke-width:3.8;stroke-linecap:round"/>`,
  };
  const cheeks = `<circle cx="-36" cy="22" r="13" fill="url(#${id}k)"/><circle cx="36" cy="22" r="13" fill="url(#${id}k)"/><ellipse cx="0" cy="17" rx="4.5" ry="3.4" fill="${skin[2]}" opacity=".35"/>`;
  const sym = expr === "bingung" ? `<text x="64" y="-40" font-family="Bricolage,system-ui,sans-serif" font-weight="800" font-size="70" style="fill:var(--c3)" class="a-float">?</text>`
    : expr === "kaget" ? `<text x="64" y="-40" font-family="Bricolage,system-ui,sans-serif" font-weight="800" font-size="70" style="fill:var(--c3)" class="a-shake">!</text>`
    : expr === "berpikir" ? `<g style="fill:var(--c3)"><circle cx="70" cy="-34" r="6"/><circle cx="88" cy="-54" r="9"/><circle cx="112" cy="-80" r="15"/></g>`
    : expr === "senang" || expr === "lega" ? `<path d="M78 -48 l6 13 l13 6 l-13 6 l-6 13 l-6 -13 l-13 -6 l13 -6z" style="fill:var(--c3)" class="a-pop"/>` : "";
  const fig = `${defs}${body}${back}${A[pose]}${head}${front}<g transform="translate(0 ${hy})">${cheeks}${face[expr]}</g>${sym}`;
  return `<g transform="translate(${o.x} ${o.y}) scale(${(o.flip ? -1 : 1) * (o.s ?? 1)} ${o.s ?? 1})"><g class="a-float s3" style="--d:${o.d ?? 0}s;transform-box:fill-box;transform-origin:50% 100%">${fig}</g></g>`;
}

const floor = `<ellipse class="nb" cx="400" cy="330" rx="330" ry="260" style="fill:var(--c1);opacity:.22"/><ellipse class="nb" cx="400" cy="560" rx="260" ry="24" style="fill:#000;opacity:.3"/>`;

export function scene3(id: "error" | "scan" | "omzet" | "kasir", expr?: Expr): string {
  let inner = "";
  const P = (o: Partial<Fig3> & { expr: Expr }) => figure3({ x: 250, y: 160, s: 1, ...o, expr: expr ?? o.expr });
  if (id === "error") inner = kiosk(590, 330, 1.15, "error") + P({ expr: "khawatir", pose: "up", hair: "long", skin: 1 }) + warn(700, 100, 1, 0.3) + bubble(130, 100, 0.9, "them", 0.5);
  if (id === "scan") inner = kiosk(610, 320, 1.15, "qr") + P({ expr: "senang", pose: "hold", hair: "hijab", skin: 0, color: 2 }) + phone(250, 380, 1.0, "qr", "a-float", 0.2) + sparkle(110, 110, 0.8, 0.5);
  if (id === "omzet") inner = P({ expr: "senang", pose: "point", hair: "short", skin: 2, color: 2 }) + phone(570, 340, 1.5, "chart", "a-float", 0.3) + coins(690, 520, 1.1, 0.5) + sparkle(540, 100, 0.9, 0.6);
  if (id === "kasir") inner = P({ expr: "bingung", pose: "chin", hair: "curly", skin: 2 }) + phone(590, 340, 1.3, "notif", "a-float", 0.3) + clock(120, 110, 0.9, 0.2) + coins(670, 520, 0.9, 0.6);
  return `<svg class="art s3d" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${floor}${inner}</svg>`;
}
export const ART3_CSS = `.art.s3d .s3{filter:drop-shadow(0 14px 16px rgba(0,0,0,.35))}.art.s3d .nb{stroke:none}`;
export type { Hair };
void [camera, sliders, strip, printer, shield, lock, frames, rocket, checklist, okBadge];
