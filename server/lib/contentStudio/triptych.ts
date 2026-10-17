import { APP_ICON_CSS, appIconHtml, silverLogoHtml } from "./appicon.js";
import { portraitSvg } from "./portraits.js";
import { BASE_CSS, fontFaces } from "./theme.js";
import { icon, mockBoothL, mockDashboard, mockGallery, mockQris, qrCells } from "./templates.js";

// "Pembuka Feed": three seamless animated posts for the top row of the Instagram profile grid
// (metallic logo -> COMING SOON -> All-in-One positioning). Dark, type-led, with a loose collage of product mockups around the
// text: printers printing strips, QRIS, the admin dashboard, a photo session, the gallery, payment toasts and a moving photo strip.
// Cards differ in size, tilt, depth and entrance, and some straddle the seams so the tiles read as one picture.
//
// Seam modes (pitch = distance between tile origins on the wide canvas):
//   panorama: pitch 1080 -> tiles are exactly adjacent, the three PNGs line up edge to edge.
//   grid:     pitch 1008 -> tiles overlap by 72 px; Instagram's profile grid crops each post to ~3:4 (36 px per side),
//             so the *visible* parts stay contiguous in the grid (but the PNGs themselves overlap).

export const TILE_W = 1080;
export const TILE_H = 1350;
export const DURATION_SEC = 9;
export const COVER_SEC = 6.0; // everything has settled; the light sweep is crossing the canvas

export type Seam = "panorama" | "grid";
export type LogoStyle = "silver" | "squircle-white" | "squircle-dark";
export const geometry = (seam: Seam) => {
  const pitch = seam === "grid" ? 1008 : 1080;
  return { pitch, canvasW: pitch * 2 + TILE_W };
};

export type TriptychOptions = {
  seam: Seam;
  logoStyle: LogoStyle;
  comingTitle: string; // "|" = line break (max 2 lines)
  comingSub: string;
  headline: string; // "|" = line break (max 3 lines)
  features: string; // "a|b|c"
  cta: string;
};

export const DEFAULT_TRIPTYCH: TriptychOptions = {
  seam: "panorama",
  logoStyle: "silver",
  comingTitle: "COMING|SOON",
  comingSub: "studiodo.id",
  headline: "All-in-One|Photobooth|App & Software",
  features: "Kiosk|QRIS|Kasir|Galeri",
  cta: "studiodo.id",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const lines = (s: string, max: number) => s.split("|").map((x) => x.trim()).filter(Boolean).slice(0, max);
const clean = (s: unknown, max = 60) => String(s ?? "").replace(/[\r\n]+/g, " ").slice(0, max);

/** Normalises untrusted input (the editor sends whatever was typed). */
export function sanitizeTriptych(input: any): TriptychOptions {
  const d = DEFAULT_TRIPTYCH;
  const pick = (k: "comingTitle" | "comingSub" | "headline" | "features" | "cta", max = 60) => (typeof input?.[k] === "string" && input[k].trim() ? clean(input[k], max) : d[k]);
  const style: LogoStyle = input?.logoStyle === "squircle-white" ? "squircle-white" : input?.logoStyle === "squircle-dark" ? "squircle-dark" : "silver";
  return {
    seam: input?.seam === "grid" ? "grid" : "panorama",
    logoStyle: style,
    comingTitle: pick("comingTitle", 40), comingSub: pick("comingSub", 70), headline: pick("headline", 80), features: pick("features", 80), cta: pick("cta", 40),
  };
}

const COLORS_SOON = ["#d9dcff", "#e6c4ff", "#ffbfdc", "#ffd3b0"];

/** radial glow with eased stops that ends exactly at the circle edge (closest-side): no visible rim, no banding. */
export function soft(rgb: string): string {
  const stops: [number, number][] = [[0, 1], [10, 0.88], [22, 0.68], [36, 0.45], [50, 0.26], [64, 0.12], [78, 0.04], [100, 0]];
  return `radial-gradient(circle closest-side,${stops.map(([p, a]) => `rgba(${rgb},${a}) ${p}%`).join(",")})`;
}

export const GRAIN = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`;

export const triptychCss = (canvasW: number) => `
html,body{margin:0;background:#000;overflow:hidden}
.cv{position:absolute;left:0;top:0;width:${canvasW}px;height:${TILE_H}px;overflow:hidden;font-family:"Plus Jakarta Sans",system-ui,sans-serif;color:#fff;--cw:${canvasW}px;background:#0a0b24}
.cv *{box-sizing:border-box}
.cv>*{position:absolute}
.tp-blob{border-radius:50%;animation:tpdrift 12s ease-in-out infinite alternate}
@keyframes tpdrift{from{transform:translate(0,0) scale(1)}to{transform:translate(90px,50px) scale(1.07)}}
.tp-grain{inset:0;background-image:${GRAIN};background-size:320px 320px;opacity:.085;mix-blend-mode:overlay;pointer-events:none;z-index:9}

/* ripples + flash + light sweep */
.tp-rip{width:700px;height:700px;border-radius:50%;border:2px solid rgba(255,255,255,.28);opacity:0;animation:tprip 5s cubic-bezier(.2,.5,.3,1) infinite}
@keyframes tprip{0%{transform:scale(.14);opacity:0}8%{opacity:.5}100%{transform:scale(7);opacity:0}}
.tp-flash{width:460px;height:460px;border-radius:50%;background:radial-gradient(circle,#fff 0%,rgba(255,255,255,.5) 34%,transparent 70%);animation:tpflash 1.3s ease-out .3s both;z-index:5}
@keyframes tpflash{0%{opacity:0;transform:scale(.2)}14%{opacity:.9}100%{opacity:0;transform:scale(5.5)}}
.tp-sweep{left:0;top:-120px;width:560px;height:1600px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent);mix-blend-mode:soft-light;pointer-events:none;z-index:8;animation:tpsweep 3.4s cubic-bezier(.45,0,.3,1) 4.6s both}
@keyframes tpsweep{from{transform:translateX(-760px) skewX(-18deg)}to{transform:translateX(calc(var(--cw) + 200px)) skewX(-18deg)}}

/* kinetic type */
.tp-a{animation-fill-mode:both;animation-duration:.9s;animation-timing-function:cubic-bezier(.2,.8,.2,1)}
@keyframes tprise{from{opacity:0;transform:translateY(60px)}to{opacity:1;transform:none}}
@keyframes tppop{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:none}}
@keyframes tpletter{from{opacity:0;transform:perspective(700px) rotateX(-85deg) translateY(70px);filter:blur(16px)}to{opacity:1;transform:none;filter:blur(0)}}
@keyframes tptrack{from{letter-spacing:.2em}to{letter-spacing:-.03em}}
@keyframes tpword{from{opacity:0;transform:translateY(90px) skewY(5deg);filter:blur(12px)}to{opacity:1;transform:none;filter:blur(0)}}
@keyframes tplogo{from{opacity:0;transform:scale(.9);clip-path:inset(-20% 100% -20% 0)}to{opacity:1;transform:none;clip-path:inset(-20% -5% -20% -5%)}}
@keyframes tpicon{0%{opacity:0;transform:scale(.55) translateY(40px)}70%{opacity:1;transform:scale(1.04) translateY(0)}100%{opacity:1;transform:none}}
@keyframes tpfloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
.tp-col{display:flex;flex-direction:column;align-items:center;text-align:center;z-index:6}
.tp-mask{overflow:hidden;padding:0 10px 8px}
.tp-cta{display:inline-flex;align-items:center;gap:16px;padding:24px 50px;border-radius:999px;background:#fff;color:#12143a;font-weight:800;font-size:36px;box-shadow:0 22px 50px rgba(8,9,40,.42)}

/* mockup cards: position -> entrance -> bob -> scale, so every layer owns exactly one transform */
.tp-pos{z-index:2}
.tp-bob{animation:tpbob var(--bt,6s) ease-in-out infinite}
@keyframes tpbob{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(var(--dy,-12px)) rotate(var(--dr,.8deg))}}
@keyframes tpe-rise{from{opacity:0;transform:translateY(230px) rotate(7deg) scale(.88)}to{opacity:1;transform:none}}
@keyframes tpe-pop{from{opacity:0;transform:scale(.4) rotate(-10deg)}to{opacity:1;transform:none}}
@keyframes tpe-drop{from{opacity:0;transform:translateY(-190px) rotate(-6deg)}to{opacity:1;transform:none}}
@keyframes tpe-swing{from{opacity:0;transform:translateX(170px) rotate(12deg) scale(.9)}to{opacity:1;transform:none}}
@keyframes tpe-fade{from{opacity:0}to{opacity:1}}
.tp-sc{transform-origin:0 0}

/* small custom cards */
.tp-toast{display:flex;align-items:center;gap:18px;width:400px;padding:20px 30px 20px 22px;border-radius:30px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.3);box-shadow:0 24px 60px rgba(2,3,24,.45)}
.tp-toast .ck{flex:none;width:54px;height:54px;border-radius:50%;background:#c9f2ea;display:grid;place-items:center}
.tp-toast b{display:block;font-size:26px;font-weight:700;color:#fff}.tp-toast i{display:block;margin-top:4px;font-style:normal;font-size:21px;color:rgba(255,255,255,.72)}
.tp-stat{width:250px;padding:22px 28px;border-radius:28px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.28);box-shadow:0 24px 60px rgba(2,3,24,.45)}
.tp-stat small{display:block;font-size:21px;font-weight:600;color:rgba(255,255,255,.72)}
.tp-stat strong{display:block;margin-top:6px;font-family:Sora;font-weight:700;font-size:70px;letter-spacing:-.04em;line-height:1}
.tp-stat em{display:block;margin-top:8px;font-style:normal;font-size:20px;font-weight:700;color:#bff0e6}
.tp-qrc{width:260px;padding:22px 22px 18px;border-radius:34px;background:#fff;box-shadow:0 28px 70px rgba(2,3,24,.5);text-align:center;color:#0b1020}
.tp-qrc .qr{width:216px;height:216px;padding:8px;box-shadow:none;border-radius:16px}
.tp-qrc div.l{margin-top:12px;font-weight:800;font-size:23px}
.tp-scroll{position:relative;width:176px;height:340px;border-radius:30px;overflow:hidden;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.28);box-shadow:0 28px 70px rgba(2,3,24,.45);-webkit-mask-image:linear-gradient(transparent,#000 14%,#000 86%,transparent);mask-image:linear-gradient(transparent,#000 14%,#000 86%,transparent)}
.tp-scroll-track{padding:14px 15px;animation:tpscroll 8s linear infinite}
@keyframes tpscroll{to{transform:translateY(-480px)}}
.tp-sf{width:146px;height:108px;padding:6px;margin-bottom:12px;background:#fff;border-radius:6px}
.tp-sf div{position:relative;width:100%;height:100%;border-radius:3px;overflow:hidden}

/* printer: body + slot + a strip that prints upward in thermal steps */
.tp-pr{position:relative;width:320px;height:590px}
.tp-pr-box{position:absolute;left:55px;top:0;width:210px;height:408px;overflow:hidden}
.tp-pr-strip{position:absolute;left:0;top:0;width:210px;padding:13px 13px 18px;background:#fff;border-radius:7px;box-shadow:0 14px 34px rgba(8,6,40,.4);animation:tpprintup 2.3s both;animation-delay:calc(var(--s,0s) + .25s)}
@keyframes tpprintup{
  0%{transform:translateY(440px);animation-timing-function:steps(14,end)}
  82%{transform:translateY(-10px);animation-timing-function:cubic-bezier(.2,1.5,.4,1)}
  100%{transform:none}}
.tp-pr-ph{position:relative;width:100%;aspect-ratio:4/3;border-radius:4px;overflow:hidden;margin-bottom:9px}
.tp-pr-lab{margin-top:12px;text-align:center;font-family:Sora;font-weight:700;font-size:13px;letter-spacing:.3em;color:#4f4fe8;padding-left:.3em}
.tp-pr-body{position:absolute;left:0;top:398px;width:320px;height:190px;border-radius:30px 30px 26px 26px;background:linear-gradient(180deg,#f8f9fd 0%,#dde1ec 52%,#b6bdcf 100%);box-shadow:0 30px 60px rgba(2,3,24,.5),inset 0 2px 0 rgba(255,255,255,.9),inset 0 -8px 18px rgba(80,90,130,.25)}
.tp-pr-slot{position:absolute;left:48px;top:392px;width:224px;height:22px;border-radius:12px;background:linear-gradient(#262d4d,#0b1020);box-shadow:inset 0 -3px 6px rgba(154,166,255,.5)}
.tp-pr-led{position:absolute;right:34px;top:446px;width:14px;height:14px;border-radius:50%;background:#bff0e6;box-shadow:0 0 14px #bff0e6}
.tp-pr-name{position:absolute;left:36px;top:446px;font-family:Sora;font-weight:700;font-size:15px;letter-spacing:.34em;color:#6a7188}
`;

const arrow = `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;

/** Font size from the longest line (uppercase Sora is much wider than lowercase). */
const fit = (ls: string[], width: number, max: number, min: number, k: number) => Math.round(Math.max(min, Math.min(max, width / (Math.max(...ls.map((l) => l.length), 1) * k))));

// ------------------------------------------------------------------ mockup pieces
export const printer = (look: number) => {
  const ph = [0, 1, 2].map((k) => `<div class="tp-pr-ph">${portraitSvg(look + k)}</div>`).join("");
  return `<div class="tp-pr"><div class="tp-pr-box"><div class="tp-pr-strip">${ph}<div class="tp-pr-lab">STUDIODO</div></div></div><div class="tp-pr-body"></div><div class="tp-pr-slot"></div><div class="tp-pr-led"></div><div class="tp-pr-name">STUDIODO</div></div>`;
};
export const toast = (title: string, sub: string) =>
  `<div class="tp-toast"><span class="ck">${icon("check", 30, 3.4, "#0f766e")}</span><div><b>${esc(title)}</b><i>${esc(sub)}</i></div></div>`;
export const stat = (label: string, to: number, delta: string) =>
  `<div class="tp-stat"><small>${esc(label)}</small><strong><span class="count" style="--to:${to}"></span></strong><em>${esc(delta)}</em></div>`;
export const qrCard = () => `<div class="tp-qrc"><div class="qr">${qrCells()}</div><div class="l">Scan QRIS</div></div>`;
export const scroller = () => {
  const frames = Array.from({ length: 12 }, (_, i) => `<div class="tp-sf"><div>${portraitSvg(i)}</div></div>`).join(""); // 4 looks x3 -> -480px = one period
  return `<div class="tp-scroll"><div class="tp-scroll-track">${frames}</div></div>`;
};

export type Card = {
  innerAt?: number; // when the card's own inner animations start (default: just after its entrance)
  html: string; w: number; h: number; // natural size
  tile: number; x: number; y: number; // top-left of the scaled box, relative to the tile
  sc: number; rot: number; enter: "rise" | "pop" | "drop" | "swing" | "fade"; at: number;
  bob?: [number, number, number]; // amplitude px, period s, phase s
  z?: number; op?: number;
};

/** One collage card: position -> entrance -> bob -> scale, each layer owning exactly one transform. `pitch` 0 = absolute x. */
export function renderCard(c: Card, pitch: number): string {
  const left = c.tile * pitch + c.x;
  const [amp, per, ph] = c.bob ?? [8, 7, 0];
  return `<div class="tp-pos" style="left:${left}px;top:${c.y}px;width:${Math.round(c.w * c.sc)}px;height:${Math.round(c.h * c.sc)}px;transform:rotate(${c.rot}deg);z-index:${c.z ?? 2};${c.op ? `opacity:${c.op}` : ""}">
      <div class="tp-a" style="animation-name:tpe-${c.enter};animation-delay:${c.at}s;animation-duration:1.15s;animation-timing-function:cubic-bezier(.2,.9,.25,1.1)">
        <div class="tp-bob" style="--dy:${-amp}px;--bt:${per}s;animation-delay:${ph}s">
          <div class="t-dark tp-sc" style="width:${c.w}px;height:${c.h}px;transform:scale(${c.sc});--s:${(c.innerAt ?? c.at + 0.2).toFixed(2)}s">${c.html}</div>
        </div>
      </div>
    </div>`;
}

export function buildTriptychDoc(optsIn: TriptychOptions, live = false): string {
  const o = sanitizeTriptych(optsIn);
  const { pitch, canvasW } = geometry(o.seam);
  const cx = [0, 1, 2].map((i) => i * pitch + 540); // tile centres
  const coming = lines(o.comingTitle, 2);
  const comingSize = fit(coming, 840, 190, 80, /[a-z]/.test(o.comingTitle) ? 0.66 : 0.84);
  const head = lines(o.headline, 3);
  const headSize = fit(head, 860, 100, 54, 0.66);
  const feats = lines(o.features, 6);

  const W = canvasW;
  const blobs = ([
    [-0.1, -0.42, 0.5, "79,79,232", 0.95, 0], [0.2, 0.3, 0.42, "106,63,214", 0.8, -4], [0.4, -0.5, 0.4, "154,166,255", 0.45, -7],
    [0.64, -0.36, 0.44, "240,111,176", 0.72, -2], [0.8, 0.28, 0.4, "255,176,122", 0.48, -6], [0.46, 0.46, 0.38, "138,92,240", 0.5, -9],
  ] as const).map(([fx, fy, fs, rgb, a, d]) => {
    const size = Math.round(fs * W);
    return `<div class="tp-blob" style="left:${Math.round(fx * W)}px;top:${Math.round(fy * W * 0.5)}px;width:${size}px;height:${size}px;background:${soft(rgb)};opacity:${a};animation-delay:${d}s"></div>`;
  }).join("");

  // The collage. Natural sizes are approximate (they only decide each card's rotation centre); content is never cropped.
  const cards: Card[] = [
    // tile 1 (logo)
    { html: printer(0), w: 320, h: 590, tile: 0, x: 60, y: 790, sc: 0.95, rot: -4, enter: "fade", at: 1.1, bob: [6, 7, -1], z: 3 },
    { html: mockDashboard(), w: 900, h: 694, tile: 0, x: 440, y: 925, sc: 0.52, rot: 5, enter: "rise", at: 2.0, bob: [8, 8, -3], z: 2 },
    { html: toast("Pembayaran diterima", "QRIS · Rp 35.000"), w: 400, h: 96, tile: 0, x: 55, y: 120, sc: 0.9, rot: -5, enter: "drop", at: 3.0, bob: [9, 6, -2], z: 4 },
    { html: qrCard(), w: 260, h: 320, tile: 0, x: 790, y: 70, sc: 0.8, rot: 9, enter: "pop", at: 2.6, bob: [8, 7, -4], z: 3, op: 0.95 },
    { html: scroller(), w: 176, h: 340, tile: 0, x: 985, y: 395, sc: 1, rot: 4, enter: "swing", at: 2.3, bob: [5, 9, -2], z: 2 },
    // tile 2 (coming soon)
    { html: stat("Sesi foto hari ini", 48, "▲ 12 sesi"), w: 250, h: 150, tile: 1, x: 105, y: 85, sc: 0.85, rot: -4, enter: "drop", at: 3.2, bob: [8, 6.5, -1], z: 3 },
    { html: mockGallery(), w: 470, h: 880, tile: 1, x: 115, y: 890, sc: 0.5, rot: -6, enter: "rise", at: 2.2, bob: [7, 8, -5], z: 2 },
    { html: mockBoothL(), w: 880, h: 620, tile: 1, x: 465, y: 945, sc: 0.46, rot: 3, enter: "pop", at: 2.8, bob: [6, 7.5, -2], z: 2 },
    { html: mockQris(false), w: 560, h: 800, tile: 1, x: 890, y: 80, sc: 0.36, rot: 7, enter: "swing", at: 3.4, bob: [7, 8, -6], z: 3, op: 0.95 },
    // tile 3 (positioning)
    { html: mockQris(false), w: 560, h: 800, tile: 2, x: 95, y: 925, sc: 0.5, rot: -4, enter: "rise", at: 3.0, bob: [7, 7, -3], z: 2 },
    { html: printer(2), w: 320, h: 590, tile: 2, x: 770, y: 855, sc: 0.8, rot: 4, enter: "fade", at: 3.3, bob: [6, 8, -4], z: 3 },
    { html: mockDashboard(), w: 900, h: 694, tile: 2, x: 690, y: 36, sc: 0.33, rot: 5, enter: "drop", at: 3.6, bob: [7, 7, -1], z: 2 },
    { html: toast("Booth online", "3 dari 3 kiosk aktif"), w: 400, h: 96, tile: 2, x: 62, y: 105, sc: 0.74, rot: -3, enter: "drop", at: 4.0, bob: [8, 6, -3], z: 4 },
    { html: mockGallery(), w: 470, h: 880, tile: 2, x: 440, y: 985, sc: 0.4, rot: 2, enter: "pop", at: 3.7, bob: [6, 8, -2], z: 1 },
  ];

  const cardHtml = cards.map((c) => renderCard(c, pitch)).join("");

  const comingLines = coming.map((ln, li) => {
    const chars = [...ln].map((ch, ci) => {
      const delay = 1.5 + li * 0.5 + ci * 0.065;
      const color = li === 0 ? "#fff" : COLORS_SOON[ci % COLORS_SOON.length];
      return ch === " " ? `<span style="display:inline-block;width:.3em"></span>` : `<span class="tp-a" style="display:inline-block;color:${color};transform-origin:50% 100%;animation-name:tpletter;animation-duration:1s;animation-delay:${delay.toFixed(2)}s">${esc(ch)}</span>`;
    }).join("");
    return `<div class="tp-a" style="font-family:Sora;font-weight:700;font-size:${comingSize}px;line-height:.95;white-space:nowrap;animation-name:tptrack;animation-duration:1.7s;animation-delay:${(1.4 + li * 0.5).toFixed(2)}s;animation-timing-function:cubic-bezier(.2,.7,.2,1)">${chars}</div>`;
  }).join("");

  const headLines = head.map((ln, i) =>
    `<div class="tp-mask"><div class="tp-a" style="animation-name:tpword;animation-delay:${(2.3 + i * 0.22).toFixed(2)}s;font-family:Sora;font-weight:700;font-size:${headSize}px;line-height:1.08;letter-spacing:-.035em;white-space:nowrap;${i === head.length - 1 ? "background:linear-gradient(100deg,#c9ccff,#ffc2dc 55%,#ffd8b8);-webkit-background-clip:text;background-clip:text;color:transparent" : ""}">${esc(ln)}</div></div>`).join("");

  const featLine = feats.map((f) => esc(f)).join(`<span style="opacity:.45;margin:0 .7em">·</span>`);

  const logo = o.logoStyle === "silver"
    ? `<div class="tp-a" style="animation-name:tplogo;animation-duration:1.5s;animation-delay:.6s;animation-timing-function:cubic-bezier(.2,.8,.2,1)"><div style="animation:tpfloat 7s ease-in-out 2.2s infinite">${silverLogoHtml(760, "silver", "--sweep-delay:1.9s")}</div></div>`
    : `<div class="tp-a" style="animation-name:tpicon;animation-duration:1.2s;animation-delay:.55s;animation-timing-function:cubic-bezier(.3,1.2,.4,1)"><div style="animation:tpfloat 6s ease-in-out 2s infinite">${appIconHtml(o.logoStyle === "squircle-dark" ? "dark" : "white", 520, "--shine-delay:1.9s")}</div></div>`;

  const body = `
<div class="cv">
  ${blobs}

  <div class="tp-rip" style="left:${cx[0] - 350}px;top:${540 - 350}px;animation-delay:1.0s"></div>
  <div class="tp-rip" style="left:${cx[0] - 350}px;top:${540 - 350}px;animation-delay:2.7s"></div>
  <div class="tp-rip" style="left:${cx[0] - 350}px;top:${540 - 350}px;animation-delay:4.4s"></div>
  <div class="tp-flash" style="left:${cx[0] - 230}px;top:${540 - 230}px"></div>

  ${cardHtml}

  <!-- TILE 1: logo -->
  <div class="tp-col" style="left:${cx[0] - 420}px;top:${540 - 130}px;width:840px">${logo}</div>

  <!-- TILE 2: COMING SOON -->
  <div class="tp-col" style="left:${cx[1] - 440}px;top:${540 - 225}px;width:880px">
    <div style="perspective:900px">${comingLines}</div>
    <div class="tp-a" style="margin-top:40px;font-weight:600;font-size:34px;letter-spacing:.2em;color:rgba(255,255,255,.82);animation-name:tprise;animation-delay:2.8s">${esc(o.comingSub)}</div>
  </div>

  <!-- TILE 3: positioning -->
  <div class="tp-col" style="left:${cx[2] - 440}px;top:${540 - 260}px;width:880px">
    <div>${headLines}</div>
    <div class="tp-a" style="margin-top:30px;font-weight:600;font-size:32px;letter-spacing:.06em;color:rgba(255,255,255,.88);animation-name:tprise;animation-delay:3.4s">${featLine}</div>
    <div class="tp-a" style="margin-top:40px;animation-name:tppop;animation-delay:4.0s"><span class="tp-cta">${esc(o.cta)}${arrow}</span></div>
  </div>

  <div class="tp-sweep"></div>
  <div class="tp-grain"></div>
</div>`;

  const script = `
(()=>{
  const fonts=document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve();
  Promise.race([fonts,new Promise(r=>setTimeout(r,2500))]).then(()=>{if(!window.__live)document.getAnimations().forEach(a=>a.pause());window.__ready=true;});
  window.__seek=(ms)=>{document.getAnimations().forEach(a=>{a.pause();a.currentTime=ms;});};
})();`;

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="only light"><style>${fontFaces()}${BASE_CSS}${APP_ICON_CSS}${triptychCss(canvasW)}</style></head><body>${body}<script>${live ? "window.__live=true;" : ""}${script}</script></body></html>`;
}
