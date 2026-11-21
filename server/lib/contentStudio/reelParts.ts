import { at, INK, YEL } from "./heroReel2.js";

// Small illustrated pieces shared by the story reels (chips, list rows, speech bubbles, stamps, icons). Pixel units on the 1080x1920 canvas.
export const RED = "#e5384f", GREEN = "#1a9d63", GOLD = "#ffcf5c";

export const chip = (x: number, y: number, txt: string, bg: string, fg: string, t: number, w = 360, size = 32) =>
  at(`<g transform="translate(${x} ${y})"><rect x="${-w / 2}" y="-38" width="${w}" height="76" rx="38" style="fill:${bg}"/><text x="0" y="${size * 0.36}" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="${size}" style="fill:${fg}">${txt}</text></g>`, t);

export const row = (x: number, y: number, title: string, sub: string, dotc: string, t: number, w = 780, tag?: { txt: string; bg: string; fg: string }) =>
  at(`<g transform="translate(${x} ${y})"><rect x="${-w / 2}" y="-72" width="${w}" height="144" rx="30" style="fill:#fff"/><circle cx="${-w / 2 + 50}" cy="0" r="18" style="fill:${dotc}"/><text x="${-w / 2 + 92}" y="-8" font-family="InterK,sans-serif" font-weight="800" font-size="34" style="fill:${INK}">${title}</text><text x="${-w / 2 + 92}" y="34" font-family="InterK,sans-serif" font-weight="700" font-size="25" style="fill:${INK};opacity:.55">${sub}</text>${tag ? `<rect x="${w / 2 - 230}" y="-30" width="200" height="60" rx="30" style="fill:${tag.bg}"/><text x="${w / 2 - 130}" y="11" text-anchor="middle" font-family="InterK,sans-serif" font-weight="800" font-size="26" style="fill:${tag.fg}">${tag.txt}</text>` : ""}</g>`, t);

export const bubble = (x: number, y: number, w: number, txt: string, bg: string, t: number, rot = 0, fg = INK) =>
  at(`<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="${-w / 2}" y="-52" width="${w}" height="104" rx="30" style="fill:${bg}"/><path d="M${-w / 2 + 40} 52 l-22 34 l54 -34z" style="fill:${bg}"/><text x="0" y="12" text-anchor="middle" font-family="InterK,sans-serif" font-weight="800" font-size="30" style="fill:${fg}">${txt}</text></g>`, t);

export const stamp = (x: number, y: number, txt: string, c: string, rot: number, t: number, size = 56) =>
  at(`<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="${-txt.length * size * 0.36}" y="${-size * 0.95}" width="${txt.length * size * 0.72}" height="${size * 1.7}" rx="14" style="fill:none;stroke:${c};stroke-width:10"/><text x="0" y="${size * 0.3}" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="${size}" style="fill:${c}">${txt}</text></g>`, t, null, "stamp");

export const alarm = (x: number, y: number, sc: number, t: number) =>
  at(`<g transform="translate(${x} ${y}) scale(${sc})"><circle r="70" style="fill:${RED}"/><path d="M0 -38 V6" style="stroke:#fff;stroke-width:14;stroke-linecap:round"/><circle cx="0" cy="30" r="9" style="fill:#fff"/></g>`, t, null, "pop");

export const lock = (x: number, y: number, sc: number, c: string) =>
  `<g transform="translate(${x} ${y}) scale(${sc})"><rect x="-50" y="-10" width="100" height="80" rx="16" style="fill:${c}"/><path d="M-30 -10 V-34 a30 30 0 0 1 60 0 V-10" style="fill:none;stroke:${c};stroke-width:16;stroke-linecap:round"/><circle cx="0" cy="30" r="9" style="fill:#fff"/></g>`;

export const tick = (x: number, y: number, r: number, c = GREEN) =>
  `<g transform="translate(${x} ${y})"><circle r="${r}" style="fill:${c}"/><path d="M${-r * 0.4} 0 L${-r * 0.12} ${r * 0.3} L${r * 0.45} ${-r * 0.3}" style="fill:none;stroke:#fff;stroke-width:${r * 0.22};stroke-linecap:round;stroke-linejoin:round"/></g>`;

export const cross = (x: number, y: number, r: number, c = RED) =>
  `<g transform="translate(${x} ${y})"><circle r="${r}" style="fill:${c}"/><path d="M${-r * 0.35} ${-r * 0.35} L${r * 0.35} ${r * 0.35} M${r * 0.35} ${-r * 0.35} L${-r * 0.35} ${r * 0.35}" style="fill:none;stroke:#fff;stroke-width:${r * 0.22};stroke-linecap:round"/></g>`;

export const toggle = (x: number, y: number, left: string, right: string, rightOn: boolean) =>
  `<g transform="translate(${x} ${y})"><rect x="-250" y="-54" width="500" height="108" rx="54" style="fill:#fff"/><rect x="${rightOn ? 0 : -246}" y="-50" width="246" height="100" rx="50" style="fill:${YEL}"/><text x="-123" y="12" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="38" style="fill:${INK}">${left}</text><text x="123" y="12" text-anchor="middle" font-family="Bricolage,sans-serif" font-weight="800" font-size="38" style="fill:${INK}">${right}</text></g>`;
