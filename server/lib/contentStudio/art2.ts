// Character styles v2: half-body people (head, shoulders, arms) instead of floating capsules. Three looks to choose from:
//  - "ink":   black outline on a light panel, one accent colour (the editorial "vector pack" look, minimal faces)
//  - "flat":  filled shapes, no outline, FACELESS heads (emotion comes from pose and floating symbols; the safest against "uncanny")
//  - "blok":  same colour blocks as flat but with the minimal ink face (friendly, not faceless)
//  - "glass": translucent frosted figures with glowing accents, faceless; matches the dark-glass slides
import { bubble, camera, clock, coins, kiosk, okBadge, phone, sparkle, warn } from "./art.js";
import type { Expr, Hair } from "./art.js";

export type ArtStyle = "ink" | "flat" | "blok" | "glass";
type Pose2 = "down" | "hold" | "up" | "chin" | "point";
type Fig = { x: number; y: number; s?: number; style: ArtStyle; expr: Expr; pose?: Pose2; hair?: Hair; skin?: number; accent?: boolean; d?: number };

const INK = "#14141f";
const SKINS = ["#f5c6a5", "#e9ad86", "#d99a73", "#b9805a"];
const HAIRS = ["#2b2140", "#1c1c28", "#4a2f22"];
const fl = (c: string, extra = "") => `style="fill:${c};${extra}"`;
const line = (c: string, w: number) => `style="fill:none;stroke:${c};stroke-width:${w};stroke-linecap:round;stroke-linejoin:round"`;

export function figure(o: Fig): string {
  const { style, expr } = o, pose = o.pose ?? "down", hair = o.hair ?? "short";
  const ink = style === "ink", glass = style === "glass";
  const skin = ink ? "#ffffff" : glass ? "rgba(255,255,255,.24)" : SKINS[(o.skin ?? 1) % SKINS.length];
  const hairC = ink ? INK : glass ? "rgba(255,255,255,.42)" : HAIRS[(o.skin ?? 0) % HAIRS.length];
  const cloth = ink ? (o.accent ? "var(--c3)" : INK) : glass ? "rgba(255,255,255,.2)" : o.accent ? "var(--c2)" : "var(--c1)";
  const outline = ink ? `stroke:${INK};stroke-width:4;stroke-linejoin:round;` : glass ? "stroke:rgba(255,255,255,.55);stroke-width:2;" : "";
  const sh = (d: string, fill: string) => `<path d="${d}" ${fl(fill, outline)}/>`;
  // sleeves: an outlined tube (outer stroke slightly wider) with a hand at the end
  const arm = (d: string, hx: number, hy: number) => {
    const edge = ink ? `<path d="${d}" ${line(INK, 38)}/>` : glass ? `<path d="${d}" ${line("rgba(255,255,255,.5)", 34)}/>` : "";
    return `${edge}<path d="${d}" ${line(cloth, 30)}/><circle cx="${hx}" cy="${hy}" r="15" ${fl(skin, outline)}/>`;
  };
  const mirror = (d: string) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_m, a, b) => `${-Number(a)} ${b}`);
  const A: Record<Pose2, string> = {
    down: arm("M-88 112 Q-100 210 -84 330", -84, 336) + arm("M88 112 Q100 210 84 330", 84, 336),
    hold: arm("M-88 112 Q-92 220 -34 252", -30, 252) + arm("M88 112 Q92 220 34 252", 30, 252),
    up: arm("M-88 112 Q-130 60 -46 -2", -44, -6) + arm(mirror("M-88 112 Q-130 60 -46 -2"), 44, -6),
    chin: arm("M-88 112 Q-100 210 -84 330", -84, 336) + arm("M88 112 Q130 96 22 58", 18, 56),
    point: arm("M-88 112 Q-100 210 -84 330", -84, 336) + arm("M88 112 Q150 110 190 40", 194, 34),
  };
  const back =
    hair === "long" ? sh("M-60 -6 C-76 -74 76 -74 60 -6 C78 56 66 112 80 170 L-80 170 C-66 112 -78 56 -60 -6Z", hairC)
    : hair === "curly" ? [-50, -26, 0, 26, 50].map((cx, i) => `<circle cx="${cx}" cy="${-14 - (i % 2) * 8}" r="34" ${fl(hairC, outline)}/>`).join("") : "";
  const torso = sh("M-116 214 C-116 116 -60 66 0 66 C60 66 116 116 116 214 L116 470 L-116 470Z", cloth);
  const neck = sh("M-14 30 H14 V74 Q0 86 -14 74Z", skin);
  const hijab = hair === "hijab";
  const headShape = hijab
    ? sh("M-60 8 C-60 -62 60 -62 60 8 C60 46 84 84 90 150 Q0 186 -90 150 C-84 84 -60 46 -60 8Z", ink ? "var(--c3)" : glass ? "rgba(255,255,255,.34)" : "var(--c3)") + `<ellipse cx="0" cy="6" rx="36" ry="40" ${fl(skin, outline)}/>`
    : `<ellipse cx="0" cy="0" rx="40" ry="44" ${fl(skin, outline)}/>`;
  const front = hijab ? "" : hair === "bun" ? sh("M-44 -6 C-48 -62 48 -62 44 -6 C34 -28 14 -36 0 -36 C-14 -36 -34 -28 -44 -6Z", hairC) + `<circle cx="0" cy="-58" r="18" ${fl(hairC, outline)}/>`
    : hair === "curly" ? "" : sh("M-44 -4 C-50 -62 50 -62 44 -4 C34 -30 12 -38 0 -38 C-14 -38 -34 -30 -44 -4Z", hairC);
  // face: minimal strokes on "ink"; nothing on the faceless styles (a floating symbol carries the mood)
  const fy = hijab ? 4 : 0;
  const faces: Record<Expr, string> = {
    bingung: `<path d="M-22 -14 Q-14 -20 -6 -14M8 -16 L22 -10" ${line(INK, 3.4)}/><circle cx="-14" cy="0" r="3.2" ${fl(INK)}/><circle cx="14" cy="0" r="3.2" ${fl(INK)}/><path d="M-10 22 Q-4 17 2 22 T14 22" ${line(INK, 3.4)}/>`,
    kaget: `<path d="M-22 -18 Q-14 -25 -6 -18M6 -18 Q14 -25 22 -18" ${line(INK, 3.4)}/><circle cx="-14" cy="0" r="6" ${fl("#fff", `stroke:${INK};stroke-width:3`)}/><circle cx="14" cy="0" r="6" ${fl("#fff", `stroke:${INK};stroke-width:3`)}/><ellipse cx="0" cy="24" rx="5" ry="7" ${fl(INK)}/>`,
    senang: `<path d="M-22 2 Q-14 -6 -6 2M6 2 Q14 -6 22 2" ${line(INK, 3.4)}/><path d="M-14 17 Q0 33 14 17Z" ${fl(INK)}/>`,
    khawatir: `<path d="M-24 -9 L-6 -17M24 -9 L6 -17" ${line(INK, 3.4)}/><circle cx="-14" cy="1" r="3.2" ${fl(INK)}/><circle cx="14" cy="1" r="3.2" ${fl(INK)}/><path d="M-11 28 Q0 18 11 28" ${line(INK, 3.4)}/>`,
    berpikir: `<path d="M-22 -10 H-6M8 -16 Q15 -21 22 -16" ${line(INK, 3.4)}/><circle cx="-14" cy="1" r="3.2" ${fl(INK)}/><circle cx="14" cy="1" r="3.2" ${fl(INK)}/><path d="M-8 24 H8" ${line(INK, 3.4)}/>`,
    lega: `<path d="M-22 2 Q-14 -6 -6 2M6 2 Q14 -6 22 2" ${line(INK, 3.2)}/><path d="M-10 20 Q0 29 10 20" ${line(INK, 3.4)}/>`,
  };
  const face = ink || style === "blok" ? `<g transform="translate(0 ${fy})">${faces[expr]}</g>` : "";
  const symColor = ink ? "var(--c3)" : "var(--c3)";
  const symbol = (t: string, x: number, y: number, cls: string) => `<text x="${x}" y="${y}" font-family="Bricolage,system-ui,sans-serif" font-weight="800" font-size="64" style="fill:${symColor};${ink ? `stroke:${INK};stroke-width:3;paint-order:stroke` : ""}" class="${cls}">${t}</text>`;
  const extra = expr === "bingung" ? symbol("?", 58, -34, "a-float") : expr === "kaget" ? symbol("!", 58, -34, "a-shake") : expr === "khawatir" ? `<path d="M52 -30 q9 14 0 20 q-9 -6 0 -20z" ${fl("#8ad8ff", outline)} class="a-blink"/>`
    : expr === "berpikir" ? `<g ${fl("var(--c3)", outline)}><circle cx="62" cy="-30" r="5"/><circle cx="78" cy="-48" r="8"/><circle cx="102" cy="-70" r="14"/></g>` : expr === "senang" || expr === "lega" ? `<path d="M70 -40 l5 11 l11 5 l-11 5 l-5 11 l-5 -11 l-11 -5 l11 -5z" ${fl("var(--c3)", outline)} class="a-pop"/>` : "";
  const body = `${back}${torso}${neck}${A[pose]}${headShape}${front}${face}${extra}`;
  const wrap = `<g class="a-float" style="--d:${o.d ?? 0}s;transform-box:fill-box;transform-origin:50% 100%">${body}</g>`;
  return `<g transform="translate(${o.x} ${o.y}) scale(${o.s ?? 1})">${wrap}</g>`;
}

const panel = (style: ArtStyle) => style === "ink"
  ? `<rect class="nb" x="0" y="0" width="800" height="600" rx="48" style="fill:#f4f0e6"/><circle class="nb" cx="560" cy="330" r="230" style="fill:var(--c3);opacity:.9"/><circle class="nb" cx="150" cy="500" r="70" style="fill:var(--c2);opacity:.9"/>`
  : style === "glass" ? `<ellipse class="nb" cx="400" cy="330" rx="320" ry="260" style="fill:#fff;opacity:.07"/><ellipse class="nb" cx="400" cy="330" rx="320" ry="260" style="fill:none;stroke:rgba(255,255,255,.3);stroke-width:2"/>`
  : `<ellipse class="nb" cx="400" cy="330" rx="300" ry="250" style="fill:var(--c1);opacity:.2"/>`;

/** Four sample scenes in the chosen style (800x600). */
export function scene2(id: "error" | "scan" | "omzet" | "kasir", style: ArtStyle, expr?: Expr): string {
  let inner = "";
  const P = (o: Partial<Fig> & { expr: Expr }) => figure({ x: 250, y: 200, style, ...o, expr: expr ?? o.expr });
  if (id === "error") inner = kiosk(590, 330, 1.15, "error") + P({ expr: "khawatir", pose: "up", hair: "long", skin: 1 }) + warn(700, 100, 1, 0.3) + bubble(140, 120, 0.9, "them", 0.5);
  if (id === "scan") inner = kiosk(600, 320, 1.15, "qr") + P({ expr: "senang", pose: "hold", hair: "hijab", skin: 0, accent: true }) + phone(250, 450, 1.1, "qr", "a-float", 0.2) + sparkle(110, 110, 0.8, 0.5);
  if (id === "omzet") inner = P({ expr: "senang", pose: "point", hair: "short", skin: 2, accent: true }) + phone(560, 360, 1.5, "chart", "a-float", 0.3) + coins(690, 520, 1.1, 0.5) + sparkle(540, 110, 0.9, 0.6);
  if (id === "kasir") inner = P({ expr: "bingung", pose: "chin", hair: "curly", skin: 2 }) + phone(580, 350, 1.3, "notif", "a-float", 0.3) + clock(120, 120, 0.9, 0.2) + coins(660, 520, 0.9, 0.6);
  return `<svg class="art ${style}" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><defs><linearGradient id="fade${style}" x1="0" y1="0" x2="0" y2="1"><stop offset=".72" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient><mask id="m${style}"><rect width="800" height="600" style="fill:url(#fade${style})"/></mask></defs>${panel(style)}<g ${style === "ink" ? "" : `mask="url(#m${style})"`}>${inner}</g></svg>`;
}

export const ART2_CSS = `
.art.ink *{stroke:${INK};stroke-width:4;stroke-linejoin:round}
.art.ink .nb,.art.ink .nb *{stroke:none}
.art.ink [style*="fill:var(--c1)"]{fill:${INK} !important}
.art.ink [style*="fill:var(--c2)"]{fill:var(--c3) !important}
.art.ink text{stroke:${INK}}
.art.ink [style*="fill:#12162b"]{fill:${INK} !important}
`;
