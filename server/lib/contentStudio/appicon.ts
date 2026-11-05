import { readFileSync } from "node:fs";
import path from "node:path";
import { BASE_CSS, fontFaces, wordmark } from "./theme.js";

// STUDIODO logo assets.
//  1. Metallic logo lockup (no tile): the wordmark in silver (or graphite) with a travelling light sweep + "Photobooth Apps".
//  2. Glossy glass squircle app icon (dark / white), kept for app-icon / profile-picture use.
// Everything is em/px-parametrised so it scales with the size you pass in.

export type IconVariant = "dark" | "white";
export type Metal = "silver" | "graphite";

// ---------------------------------------------------------------- metallic lockup
const METAL_FILL: Record<Metal, string> = {
  // brushed titanium: bright top, darker waist, soft bounce light at the bottom (Apple-style silver)
  silver: "linear-gradient(180deg,#ffffff 0%,#f4f6fb 20%,#cfd4df 46%,#9ea5b6 60%,#e8ebf3 80%,#ffffff 100%)",
  graphite: "linear-gradient(180deg,#5a6075 0%,#2a2e3d 30%,#0e1018 52%,#3a4054 78%,#6a7088 100%)",
};

let wordmarkB64: string | null = null;
const wordmarkBase64 = () => (wordmarkB64 ??= readFileSync(path.join(process.cwd(), "server", "assets", "studiodo-wordmark-white.png")).toString("base64"));

export const LOGO_CSS = `
.slv{display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 8px 26px rgba(2,3,20,.55))}
.slv-mark{aspect-ratio:720/125;background-repeat:no-repeat;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-size:100% 100%;mask-size:100% 100%;
  background-size:260% 100%,100% 100%;animation:slvSweep 5.6s cubic-bezier(.45,0,.3,1) var(--sweep-delay,1.8s) infinite}
.slv-sub{font-family:"Plus Jakarta Sans",sans-serif;font-weight:500;letter-spacing:.38em;padding-left:.38em;white-space:nowrap;-webkit-background-clip:text;background-clip:text;color:transparent;
  background-size:260% 100%,100% 100%;background-repeat:no-repeat;animation:slvSweep 5.6s cubic-bezier(.45,0,.3,1) var(--sweep-delay,1.8s) infinite}
@keyframes slvSweep{0%{background-position:150% 0,0 0}42%,100%{background-position:-60% 0,0 0}}
`;

/** Wordmark + "Photobooth Apps" in brushed metal. `width` is the wordmark width in px. */
export function silverLogoHtml(width: number, metal: Metal = "silver", extraStyle = ""): string {
  const maskUri = `url('data:image/png;base64,${wordmarkBase64()}')`; // single quotes: this goes inside a double-quoted style attribute
  const sweep = metal === "silver" ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.5)";
  const layers = `linear-gradient(105deg,transparent 40%,${sweep} 50%,transparent 60%),${METAL_FILL[metal]}`;
  return `<div class="slv" style="${extraStyle}"><div class="slv-mark" style="width:${width}px;background-image:${layers};-webkit-mask-image:${maskUri};mask-image:${maskUri}"></div><div class="slv-sub" style="margin-top:${Math.round(width * 0.05)}px;font-size:${Math.round(width * 0.05)}px;background-image:${layers}">Photobooth Apps</div></div>`;
}

// ---------------------------------------------------------------- glass squircle app icon
export const APP_ICON_CSS = `
.ico{position:relative;width:1em;height:1em;font-size:var(--sz,520px);border-radius:.235em;overflow:hidden;isolation:isolate;display:flex;flex-direction:column;align-items:center;justify-content:center;flex:none}
.ico.dark{background:radial-gradient(130% 110% at 26% 16%,#262a3d 0%,#0d0f18 50%,#040508 100%);box-shadow:0 .07em .14em rgba(0,0,0,.55),0 .02em .05em rgba(0,0,0,.45)}
.ico.white{background:radial-gradient(130% 110% at 26% 16%,#ffffff 0%,#f4f5fb 52%,#dde1f1 100%);box-shadow:0 .07em .14em rgba(20,22,80,.38),0 .02em .05em rgba(20,22,80,.26)}
.ico::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:.012em;z-index:3;pointer-events:none;
  background:linear-gradient(135deg,rgba(255,255,255,.9),rgba(255,255,255,.14) 26%,rgba(255,255,255,.03) 55%,rgba(255,255,255,.55) 100%);
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
.ico.white::before{background:linear-gradient(135deg,#fff,rgba(190,198,236,.55) 28%,rgba(180,188,230,.3) 58%,#fff 100%)}
.ico::after{content:"";position:absolute;inset:.026em;border-radius:.21em;z-index:2;pointer-events:none;box-shadow:inset 0 0 .045em rgba(255,255,255,.2),inset 0 -.1em .2em rgba(112,132,255,.1)}
.ico.white::after{box-shadow:inset 0 0 .05em rgba(255,255,255,.9),inset 0 -.1em .2em rgba(120,130,220,.16)}
.ico .glare{position:absolute;right:-.02em;top:-.02em;width:.62em;height:.52em;z-index:1;pointer-events:none;clip-path:polygon(18% 0,100% 0,100% 82%);background:linear-gradient(135deg,rgba(255,255,255,.2),rgba(255,255,255,.05) 55%,rgba(255,255,255,0))}
.ico.white .glare{background:linear-gradient(135deg,rgba(160,170,235,.28),rgba(160,170,235,.08) 55%,rgba(160,170,235,0))}
.ico .shine{position:absolute;top:-10%;left:0;width:34%;height:120%;z-index:2;pointer-events:none;transform:translateX(-160%) skewX(-20deg);background:linear-gradient(90deg,transparent,rgba(255,255,255,.34),transparent);animation:icoShine 1.7s cubic-bezier(.5,0,.3,1) var(--shine-delay,2.2s) both}
.ico.white .shine{background:linear-gradient(90deg,transparent,rgba(255,255,255,.95),transparent)}
@keyframes icoShine{from{transform:translateX(-160%) skewX(-20deg)}to{transform:translateX(420%) skewX(-20deg)}}
.ico img{width:.78em;height:auto;display:block;position:relative;z-index:1;margin-top:-.04em}
.ico .sub{position:relative;z-index:1;margin-top:.055em;font-family:"Plus Jakarta Sans",sans-serif;font-weight:500;font-size:.046em;letter-spacing:.22em;padding-left:.22em;color:rgba(255,255,255,.88);white-space:nowrap}
.ico.white .sub{color:rgba(18,20,58,.82)}
${LOGO_CSS}`;

/** The squircle icon markup. `size` is the pixel width; wordmark colours follow the variant. */
export function appIconHtml(variant: IconVariant, size: number, extraStyle = ""): string {
  const logo = wordmark(variant === "dark" ? "white" : "ink");
  return `<div class="ico ${variant}" style="--sz:${size}px;${extraStyle}"><span class="glare"></span><span class="shine"></span><img src="${logo}" alt="studiodo.id"><span class="sub">Photobooth Apps</span></div>`;
}

// ---------------------------------------------------------------- standalone files
const MESH_DARK = "radial-gradient(60% 70% at 20% 15%,#4f4fe8 0%,rgba(79,79,232,.55) 40%,transparent 80%),radial-gradient(60% 60% at 85% 90%,#b45fd0 0%,rgba(180,95,208,.45) 45%,transparent 85%),linear-gradient(135deg,#0b0c2e,#1b1670 55%,#3a1f78)";
const MESH_LIGHT = "radial-gradient(60% 70% at 15% 15%,#c7ceff 0%,rgba(199,206,255,.6) 45%,transparent 85%),radial-gradient(60% 60% at 90% 90%,#ffd3e4 0%,rgba(255,211,228,.6) 45%,transparent 85%),linear-gradient(135deg,#f6f7ff,#eef0ff)";
const NIGHT = "radial-gradient(70% 80% at 25% 20%,#2a2a8a 0%,rgba(42,42,138,.5) 45%,transparent 85%),radial-gradient(60% 60% at 85% 90%,#7a2f86 0%,rgba(122,47,134,.4) 45%,transparent 85%),linear-gradient(135deg,#070820,#10104a)";

const PAGE_CSS = `html,body{background:transparent!important}.stage{position:absolute;inset:0;display:grid;place-items:center}.ico .shine{animation:none;opacity:0}`;

export type FileKind = "icon-dark" | "icon-white" | "avatar-dark" | "avatar-white" | "logo-silver" | "avatar-silver";

/** A page that renders one standalone file (transparent where it makes sense). */
export function buildIconDoc(kind: FileKind): string {
  let stage: string;
  switch (kind) {
    case "icon-dark": stage = `<div class="stage">${appIconHtml("dark", 900)}</div>`; break;
    case "icon-white": stage = `<div class="stage">${appIconHtml("white", 900)}</div>`; break;
    case "avatar-dark": stage = `<div class="stage" style="background:${MESH_LIGHT}">${appIconHtml("dark", 760)}</div>`; break;
    case "avatar-white": stage = `<div class="stage" style="background:${MESH_DARK}">${appIconHtml("white", 760)}</div>`; break;
    case "logo-silver": stage = `<div class="stage">${silverLogoHtml(900, "silver", "--sweep-delay:-9999s")}</div>`; break;
    case "avatar-silver": stage = `<div class="stage" style="background:${NIGHT}">${silverLogoHtml(700, "silver", "--sweep-delay:-9999s")}</div>`; break;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="only light"><style>${fontFaces()}${BASE_CSS}${APP_ICON_CSS}${PAGE_CSS}</style></head><body>${stage}</body></html>`;
}

/** Side by side preview used by the panel: silver logo, white and dark squircle icons. */
export function buildIconPreviewDoc(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="only light"><style>${fontFaces()}${BASE_CSS}${APP_ICON_CSS}
html,body{background:#ececf4!important}
.row{position:absolute;inset:0;display:grid;grid-template-columns:1.25fr 1fr 1fr}
.cell{display:grid;place-items:center}
.cell.a{background:${NIGHT}}
.cell.b{background:${MESH_DARK}}
.cell.c{background:linear-gradient(135deg,#f6f7ff,#e4e7ff)}
</style></head><body><div class="row"><div class="cell a">${silverLogoHtml(560, "silver")}</div><div class="cell b">${appIconHtml("white", 360)}</div><div class="cell c">${appIconHtml("dark", 360)}</div></div></body></html>`;
}
