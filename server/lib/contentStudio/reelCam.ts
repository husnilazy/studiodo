import { at, INK, s, YEL } from "./heroReel2.js";

// Illustration pieces for the camera reels (generic DSLR/mirrorless body, laptop, webcam, sliders). No real logos: brand names are only shown as text chips.

/** A generic interchangeable-lens camera. Origin = middle of the body. Width about 300, height about 250. */
export const camera = (x: number, y: number, sc: number, body = "#2b2f6b", accent = "#ff7a2f", lens = "#14122b", rot = 0) =>
  `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})"><ellipse cx="0" cy="130" rx="170" ry="16" style="fill:#000;opacity:.18"/>
  <path d="M-60 -92 L-40 -132 H50 L72 -92Z" style="fill:${body}"/>
  <rect x="-160" y="-96" width="320" height="196" rx="34" style="fill:${body}"/>
  <rect x="-160" y="-96" width="86" height="196" rx="34" style="fill:${accent}"/>
  <circle cx="6" cy="6" r="88" style="fill:#0b0a1c"/><circle cx="6" cy="6" r="70" style="fill:${lens}"/><circle cx="6" cy="6" r="46" style="fill:#3a4cc2"/><circle cx="6" cy="6" r="22" style="fill:#0b0a1c"/>
  <circle cx="-14" cy="-20" r="11" style="fill:#fff;opacity:.7"/><circle cx="22" cy="24" r="5" style="fill:#fff;opacity:.4"/>
  <rect x="98" y="-74" width="46" height="26" rx="9" style="fill:#fff;opacity:.9"/><circle cx="126" cy="-118" r="12" style="fill:${YEL}"/></g>`;

export const webcam = (x: number, y: number, sc: number) =>
  `<g transform="translate(${x} ${y}) scale(${sc})"><rect x="-26" y="40" width="52" height="64" rx="10" style="fill:#8a8fb3"/><rect x="-74" y="96" width="148" height="20" rx="10" style="fill:#6c7196"/><circle cx="0" cy="-10" r="62" style="fill:#e8ebff"/><circle cx="0" cy="-10" r="44" style="fill:#14122b"/><circle cx="0" cy="-10" r="22" style="fill:#3a4cc2"/><circle cx="-8" cy="-20" r="7" style="fill:#fff;opacity:.7"/></g>`;

/** Laptop with a screen. Origin = middle of the screen. `inner` is drawn in screen coordinates (-190..190 x, -120..120 y). */
export const laptop = (x: number, y: number, sc: number, inner: string, screenBg = "#f4f6ff") =>
  `<g transform="translate(${x} ${y}) scale(${sc})"><rect x="-210" y="-140" width="420" height="280" rx="26" style="fill:${INK}"/><rect x="-190" y="-120" width="380" height="240" rx="12" style="fill:${screenBg}"/>${inner}<path d="M-250 150 H250 L226 178 H-226Z" style="fill:#9aa0c8"/><rect x="-60" y="150" width="120" height="9" rx="4" style="fill:#7b82ae"/></g>`;

/** Cable from (x1,y1) to (x2,y2), drawn in with a stroke animation when `t` is given. */
export const cable = (x1: number, y1: number, x2: number, y2: number, c = INK, t = 0) =>
  `<path d="M${x1} ${y1} C${x1} ${(y1 + y2) / 2 + 120} ${x2} ${(y1 + y2) / 2 + 120} ${x2} ${y2}" pathLength="1" class="cab" style="--t:${s(t)};fill:none;stroke:${c};stroke-width:12;stroke-linecap:round"/>`;

/** A horizontal slider row for the exposure panel. value 0..1. */
export const slider = (x: number, y: number, w: number, label: string, val: string, v: number, c: string, t: number) =>
  at(`<g transform="translate(${x} ${y})"><rect x="0" y="-48" width="${w}" height="96" rx="28" style="fill:#fff"/><text x="30" y="-8" font-family="InterK,sans-serif" font-weight="800" font-size="28" style="fill:${INK}">${label}</text><text x="${w - 30}" y="-8" text-anchor="end" font-family="Bricolage,sans-serif" font-weight="800" font-size="30" style="fill:${c}">${val}</text><rect x="30" y="18" width="${w - 60}" height="12" rx="6" style="fill:#e4e7f7"/><rect x="30" y="18" width="${(w - 60) * v}" height="12" rx="6" style="fill:${c}"/><circle cx="${30 + (w - 60) * v}" cy="24" r="17" style="fill:#fff;stroke:${c};stroke-width:7"/></g>`, t);

/** A little "photo" tile (a face on a coloured card) with an exposure filter: bright=1 normal, <1 dark. */
export const shot = (x: number, y: number, w: number, h: number, bg: string, bright: number, label?: string) =>
  `<g transform="translate(${x} ${y})"><rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="22" style="fill:${bg}"/><circle cx="0" cy="${-h * 0.08}" r="${h * 0.2}" style="fill:#f2b48c"/><path d="M${-w * 0.3} ${h / 2} Q0 ${h * 0.05} ${w * 0.3} ${h / 2}Z" style="fill:#ff7a2f"/><circle cx="${-h * 0.07}" cy="${-h * 0.1}" r="${h * 0.017}" style="fill:${INK}"/><circle cx="${h * 0.07}" cy="${-h * 0.1}" r="${h * 0.017}" style="fill:${INK}"/><path d="M${-h * 0.07} ${-h * 0.03} Q0 ${h * 0.02} ${h * 0.07} ${-h * 0.03}" style="fill:none;stroke:${INK};stroke-width:${Math.max(3, h * 0.014)};stroke-linecap:round"/><rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="22" style="fill:#050514;opacity:${(1 - bright).toFixed(2)}"/>${label ? `<text x="0" y="${h / 2 + 40}" text-anchor="middle" font-family="InterK,sans-serif" font-weight="800" font-size="28" style="fill:${INK}">${label}</text>` : ""}</g>`;

export const CAM_CSS = `.cab{stroke-dasharray:1;stroke-dashoffset:1;animation:cabin .7s ease-out forwards;animation-delay:var(--t)}@keyframes cabin{to{stroke-dashoffset:0}}`;
