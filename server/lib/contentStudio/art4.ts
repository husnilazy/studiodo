// "Editorial" characters, modelled on the full-body flat style of a Pinterest/Behance reference the user picked: tall figures with a small
// head, wide-leg trousers, bold flat colour blocks (no outlines), saturated skin tones, gold earrings, black shoes, tiny ink faces.
// Origin of the figure's own coordinate system is the middle of the feet; the head centre is 505 units above it.
import type { Expr, Hair } from "./art.js";

type Pose = "down" | "hold" | "up" | "chin" | "point" | "wave";
export type FigEd = { x: number; y: number; s?: number; expr: Expr; pose?: Pose; hair?: Hair; skin?: number; color?: number; d?: number; jacket?: string; glasses?: boolean; bag?: string; shoe?: string };

const INK = "#1a1330";
export const HEAD_H = 505; // feet -> head centre
const SKINS = ["#ff7a35", "#f0a070", "#c27a4a", "#ffc9a0"];
const HAIRS = ["#17111f", "#17111f", "#3a2417", "#2b2140"];
const OUTFITS: [string, string][] = [["#e9c8ff", "#0f8a9d"], ["#ffd23f", "#2447e0"], ["#ffffff", "#ff6b5a"], ["#3ddc97", "#1a2b6b"]];
const fl = (c: string) => `style="fill:${c}"`;
const tube = (d: string, c: string, w: number) => `<path d="${d}" style="fill:none;stroke:${c};stroke-width:${w};stroke-linecap:round;stroke-linejoin:round"/>`;
const mir = (d: string) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_m, a, b) => `${-Number(a)} ${b}`);

export function figureEd(o: FigEd): string {
  const sk = SKINS[(o.skin ?? 1) % SKINS.length], hc = HAIRS[(o.skin ?? 1) % HAIRS.length];
  const [top, pants] = OUTFITS[(o.color ?? 0) % OUTFITS.length];
  const expr = o.expr, pose = o.pose ?? "down", hair = o.hair ?? "short";
  const sleeve = o.jacket ?? top;
  // sleeves: draw the same curve in the top colour but only over the shoulder end, using a dash so it stops short of the elbow
  const limb = (d: string, hx: number, hy: number, open = false) =>
    `${tube(d, sk, 21)}<path d="${d}" pathLength="100" style="fill:none;stroke:${sleeve};stroke-width:30;stroke-linecap:round;stroke-dasharray:30 100"/>`
    + `<circle cx="${hx}" cy="${hy}" r="13" ${fl(sk)}/>${open ? [-26, -9, 9, 26].map((a) => `<path d="M${hx} ${hy} l${(Math.sin((a * Math.PI) / 180) * 30).toFixed(1)} ${(-Math.cos((a * Math.PI) / 180) * 30).toFixed(1)}" style="fill:none;stroke:${sk};stroke-width:7;stroke-linecap:round"/>`).join("") : ""}`;
  const LD = "M-50 -418 Q-84 -340 -72 -268", LH = "M-50 -418 Q-86 -350 -16 -330", LUP = "M-50 -418 Q-112 -470 -86 -572";
  const R: Record<Pose, [string, string]> = {
    down: [limb(LD, -72, -262), limb(mir(LD), 72, -262)],
    hold: [limb(LH, -12, -330), limb(mir(LH), 12, -330)],
    up: [limb(LUP, -86, -580, true), limb(mir(LUP), 86, -580, true)],
    chin: [limb(LD, -72, -262), limb("M50 -418 Q100 -400 18 -446", 14, -448)],
    point: [limb(LD, -72, -262), limb("M50 -418 Q130 -430 196 -480", 200, -483)],
    wave: [limb("M-50 -418 Q-92 -350 -56 -300", -52, -296), limb("M50 -418 Q104 -490 76 -572", 76, -580, true)],
  };
  // trousers: two wide legs with rounded hems, plus black shoes
  const legs = `<path d="M-66 -306 L-4 -306 L-12 -26 Q-52 -12 -92 -26Z" ${fl(pants)}/><path d="M66 -306 L4 -306 L12 -26 Q52 -12 92 -26Z" ${fl(pants)}/>`
    + `<path d="M-100 -26 Q-54 -4 -12 -26 L-12 -6 Q-60 10 -108 -6Z" style="fill:#000;opacity:.12"/>`
    + [-1, 1].map((sg) => `<path d="M${sg * 98} -6 Q${sg * 62} -26 ${sg * 14} -10 L${sg * 12} 8 L${sg * 104} 8Z" ${fl("#ffffff")}/><path d="M${sg * 104} 3 L${sg * 12} 3 L${sg * 12} 9 L${sg * 106} 9Z" ${fl(o.shoe ?? "#ff6b2c")}/>`).join("");
  const torso = `<path d="M-60 -304 Q-66 -392 -48 -432 L48 -432 Q66 -392 60 -304Z" ${fl(top)}/>`;
  const jk = o.jacket ? `<path d="M-62 -304 Q-72 -394 -50 -434 L-20 -434 L-12 -304Z" ${fl(o.jacket)}/><path d="M62 -304 Q72 -394 50 -434 L20 -434 L12 -304Z" ${fl(o.jacket)}/>` : "";
  const bag = o.bag ? `<path d="M-44 -432 Q-96 -380 -92 -330" style="fill:none;stroke:${INK};stroke-width:5"/><path d="M-120 -332 h62 v78 q-31 8 -62 0z" ${fl(o.bag)}/><path d="M-112 -332 q23 -26 46 0" style="fill:none;stroke:${INK};stroke-width:5"/>` : "";
  const neck = `<rect x="-10" y="-452" width="20" height="26" rx="8" ${fl(sk)}/>`;
  const hy = -HEAD_H;
  const hijab = hair === "hijab";
  const back = hair === "long" ? `<path d="M-38 ${hy + 4} C-46 ${hy - 56} 46 ${hy - 56} 38 ${hy + 4} L44 -392 Q0 -380 -44 -392Z" ${fl(hc)}/>`
    : hair === "short" ? `<path d="M-37 ${hy + 6} C-42 ${hy - 54} 42 ${hy - 54} 37 ${hy + 6} L40 ${hy + 48} Q0 ${hy + 58} -40 ${hy + 48}Z" ${fl(hc)}/>` // bob like the reference
    : hair === "curly" ? [-36, -18, 0, 18, 36].map((cx, i) => `<circle cx="${cx}" cy="${hy - 22 - (i % 2) * 8}" r="22" ${fl(hc)}/>`).join("")
    : hair === "bun" ? `<circle cx="0" cy="${hy - 50}" r="18" ${fl(hc)}/>` : "";
  const scarf = hijab ? `<path d="M-46 ${hy + 4} C-50 ${hy - 56} 50 ${hy - 56} 46 ${hy + 4} C48 ${hy + 50} 66 ${hy + 80} 64 -396 L-64 -396 C-66 ${hy + 80} -48 ${hy + 50} -46 ${hy + 4}Z" ${fl("var(--c3)")}/>` : "";
  const head = hijab ? `<ellipse cx="0" cy="${hy + 4}" rx="26" ry="31" ${fl(sk)}/>` : `<ellipse cx="0" cy="${hy}" rx="30" ry="36" ${fl(sk)}/>`;
  const fringe = hijab || hair === "curly" ? "" : `<path d="M-31 ${hy - 6} C-30 ${hy - 50} 30 ${hy - 50} 31 ${hy - 6} C16 ${hy - 28} -10 ${hy - 28} -31 ${hy - 6}Z" ${fl(hc)}/>`;
  const earrings = hijab ? "" : [-1, 1].map((sg) => `<circle cx="${sg * 32}" cy="${hy + 8}" r="8" style="fill:none;stroke:#ffc21a;stroke-width:4.5"/>`).join("");
  const F: Record<Expr, string> = {
    bingung: `<path d="M-19 -12 Q-12 -17 -5 -12M7 -14 L19 -9" ${stk(2.8)}/><circle cx="-11" cy="0" r="2.6" ${fl(INK)}/><circle cx="11" cy="0" r="2.6" ${fl(INK)}/><path d="M-8 18 Q-3 14 2 18 T12 18" ${stk(2.8)}/>`,
    kaget: `<path d="M-19 -15 Q-12 -21 -5 -15M5 -15 Q12 -21 19 -15" ${stk(2.8)}/><circle cx="-11" cy="0" r="5" style="fill:#fff;stroke:${INK};stroke-width:2.6"/><circle cx="11" cy="0" r="5" style="fill:#fff;stroke:${INK};stroke-width:2.6"/><ellipse cx="0" cy="20" rx="4" ry="6" ${fl(INK)}/>`,
    senang: `<path d="M-19 2 Q-12 -5 -5 2M5 2 Q12 -5 19 2" ${stk(2.8)}/><path d="M-11 14 Q0 28 11 14Z" ${fl(INK)}/>`,
    khawatir: `<path d="M-20 -8 L-5 -15M20 -8 L5 -15" ${stk(2.8)}/><circle cx="-11" cy="1" r="2.6" ${fl(INK)}/><circle cx="11" cy="1" r="2.6" ${fl(INK)}/><path d="M-9 23 Q0 15 9 23" ${stk(2.8)}/>`,
    berpikir: `<path d="M-19 -9 H-5M6 -14 Q12 -18 19 -14" ${stk(2.8)}/><circle cx="-11" cy="1" r="2.6" ${fl(INK)}/><circle cx="11" cy="1" r="2.6" ${fl(INK)}/><path d="M-6 20 H6" ${stk(2.8)}/>`,
    lega: `<path d="M-19 2 Q-12 -5 -5 2M5 2 Q12 -5 19 2" ${stk(2.6)}/><path d="M-8 16 Q0 24 8 16" ${stk(2.8)}/>`,
  };
  const glasses = o.glasses ? `<g transform="translate(0 ${hy + (hijab ? 6 : 2)})"><circle cx="-12" cy="1" r="11" style="fill:rgba(255,255,255,.25);stroke:${INK};stroke-width:3"/><circle cx="12" cy="1" r="11" style="fill:rgba(255,255,255,.25);stroke:${INK};stroke-width:3"/><path d="M-1 1 h2" style="stroke:${INK};stroke-width:3"/></g>` : "";
  const face = `<g transform="translate(0 ${hy + (hijab ? 6 : 2)})">${F[expr]}</g>`;
  const sym = (t: string, cls: string) => `<text x="52" y="${hy - 30}" font-family="Bricolage,system-ui,sans-serif" font-weight="800" font-size="60" style="fill:var(--c3)" class="${cls}">${t}</text>`;
  const extra = expr === "bingung" ? sym("?", "a-float") : expr === "kaget" ? sym("!", "a-shake")
    : expr === "khawatir" ? `<path d="M48 ${hy - 20} q9 14 0 20 q-9 -6 0 -20z" ${fl("#8ad8ff")} class="a-blink"/>`
    : expr === "berpikir" ? `<g ${fl("var(--c3)")}><circle cx="52" cy="${hy - 30}" r="5"/><circle cx="68" cy="${hy - 48}" r="8"/><circle cx="92" cy="${hy - 70}" r="13"/></g>` : "";
  void extra;
  return `${back}${scarf}${R[pose][0]}${R[pose][1]}${legs}${torso}${jk}${bag}${neck}${head}${fringe}${earrings}${face}${glasses}${extra}`;
}
function stk(w: number) { return `style="fill:none;stroke:${INK};stroke-width:${w};stroke-linecap:round;stroke-linejoin:round"`; }

/** Places a figure by its HEAD centre (x, y), like the older figure kits, and adds a soft ground shadow under the feet. */
export function placeEd(o: FigEd): string {
  const sc = o.s ?? 1;
  return `<g transform="translate(${o.x} ${o.y + HEAD_H * sc}) scale(${sc})"><ellipse cx="0" cy="6" rx="120" ry="14" style="fill:#000;opacity:.28"/>${figureEd(o)}</g>`;
}
