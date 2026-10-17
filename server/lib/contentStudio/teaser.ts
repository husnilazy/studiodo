import { APP_ICON_CSS, appIconHtml, silverLogoHtml } from "./appicon.js";
import { BASE_CSS, fontFaces } from "./theme.js";
import { mockBoothL, mockDashboard, mockGallery, mockQris } from "./templates.js";
import { GRAIN, printer, qrCard, renderCard, sanitizeTriptych, scroller, soft, stat, toast, triptychCss, type Card, type LogoStyle } from "./triptych.js";

// "Teaser Reel": one continuous 1080x1920 motion graphic (18 s) that tells the whole story in four connected scenes.
//   1  logo reveal (flash, ripples, metallic wordmark)        0.0 -  3.9 s
//   2  COMING SOON (kinetic type + floating product cards)    3.4 -  7.7 s
//   3  the product in four beats: pay QRIS -> shoot & print -> results on the phone -> watch the dashboard   7.3 - 14.0 s
//   4  All-in-One headline, features, call to action, logo    13.6 - 19.2 s
// Everything is CSS animation on one absolute timeline (like the other renderers), so frames can be sought exactly.

export const TEASER_W = 1080;
export const TEASER_H = 1920;
export const TEASER_DURATION_SEC = 19.2;
export const TEASER_COVER_SEC = 17.0;

export type TeaserOptions = { logoStyle: LogoStyle; comingTitle: string; beats: string; headline: string; features: string; cta: string };

export const DEFAULT_TEASER: TeaserOptions = {
  logoStyle: "silver",
  comingTitle: "COMING|SOON",
  beats: "Bayar QRIS|Foto & cetak|Hasil di HP|Pantau dashboard",
  headline: "All-in-One|Photobooth|App & Software",
  features: "Kiosk|QRIS|Kasir|Galeri",
  cta: "studiodo.id",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const lines = (s: string, max: number) => s.split("|").map((x) => x.trim()).filter(Boolean).slice(0, max);

export function sanitizeTeaser(input: any): TeaserOptions {
  const t = sanitizeTriptych(input);
  const beats = typeof input?.beats === "string" && input.beats.trim() ? input.beats.replace(/[\r\n]+/g, " ").slice(0, 120) : DEFAULT_TEASER.beats;
  return { logoStyle: t.logoStyle, comingTitle: t.comingTitle, headline: t.headline, features: t.features, cta: t.cta, beats };
}

const fit = (ls: string[], width: number, max: number, min: number, k: number) => Math.round(Math.max(min, Math.min(max, width / (Math.max(...ls.map((l) => l.length), 1) * k))));
const COLORS_SOON = ["#d9dcff", "#e6c4ff", "#ffbfdc", "#ffd3b0"];
const arrow = `<svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;

const CSS = `
.cv{width:${TEASER_W}px;height:${TEASER_H}px}
.ts-scene{position:absolute;inset:0}
.ts-scene .tp-pos,.ts-scene .tp-rip,.ts-scene .tp-flash{position:absolute}
.ts-flex{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
@keyframes tsin{from{opacity:0}to{opacity:1}}
@keyframes tsout{from{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(1.07)}}
.ts-sweep{left:0;top:-160px;width:620px;height:2300px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent);mix-blend-mode:soft-light;pointer-events:none;z-index:8;animation:tssweep 1.6s cubic-bezier(.45,0,.3,1) both}
@keyframes tssweep{from{transform:translateX(-760px) skewX(-18deg)}to{transform:translateX(1700px) skewX(-18deg)}}
.ts-step{display:inline-flex;align-items:center;gap:12px;padding:11px 26px;border-radius:999px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.32);font-weight:800;font-size:26px;letter-spacing:.2em}
.ts-dots{display:flex;gap:14px}.ts-dots i{width:14px;height:14px;border-radius:50%;background:rgba(255,255,255,.28)}.ts-dots i.on{width:44px;border-radius:8px;background:#fff}
`;

const scene = (inner: string, start: number, end?: number, z = 2, out = 0.6) =>
  `<div class="ts-scene" style="z-index:${z};animation:tsin .01s linear ${start}s both${end !== undefined ? `,tsout ${out}s ease-in ${end}s forwards` : ""}">${inner}</div>`;

export function buildTeaserDoc(optsIn: TeaserOptions, live = false): string {
  const o = sanitizeTeaser(optsIn);
  const coming = lines(o.comingTitle, 2);
  const comingSize = fit(coming, 940, 200, 90, /[a-z]/.test(o.comingTitle) ? 0.66 : 0.84);
  const head = lines(o.headline, 3);
  const headSize = fit(head, 940, 118, 60, 0.66);
  const feats = lines(o.features, 6);
  const beats = lines(o.beats, 4);
  while (beats.length < 4) beats.push("");

  const blobs = ([
    [-320, -260, 1300, "79,79,232", 0.95, 0], [180, 640, 1150, "106,63,214", 0.8, -4], [420, -330, 950, "154,166,255", 0.45, -7],
    [520, 330, 1050, "240,111,176", 0.68, -2], [60, 1230, 1150, "255,176,122", 0.42, -6], [-220, 980, 900, "138,92,240", 0.5, -9],
  ] as const).map(([x, y, size, rgb, a, d]) => `<div class="tp-blob" style="left:${x}px;top:${y}px;width:${size}px;height:${size}px;background:${soft(rgb)};opacity:${a};animation-delay:${d}s"></div>`).join("");

  const card = (c: Omit<Card, "tile">) => renderCard({ ...c, tile: 0, innerAt: c.innerAt ?? c.at - 0.1 }, 0);

  // ---- scene 1: logo
  const logo = o.logoStyle === "silver"
    ? `<div class="tp-a" style="animation-name:tplogo;animation-duration:1.4s;animation-delay:.6s;animation-timing-function:cubic-bezier(.2,.8,.2,1)"><div style="animation:tpfloat 7s ease-in-out 2s infinite">${silverLogoHtml(900, "silver", "--sweep-delay:1.7s")}</div></div>`
    : `<div class="tp-a" style="animation-name:tpicon;animation-duration:1.2s;animation-delay:.55s;animation-timing-function:cubic-bezier(.3,1.2,.4,1)"><div style="animation:tpfloat 6s ease-in-out 2s infinite">${appIconHtml(o.logoStyle === "squircle-dark" ? "dark" : "white", 640, "--shine-delay:1.8s")}</div></div>`;
  const s1 = `
    <div class="tp-rip" style="left:${540 - 350}px;top:${930 - 350}px;animation-delay:1s"></div>
    <div class="tp-rip" style="left:${540 - 350}px;top:${930 - 350}px;animation-delay:2.6s"></div>
    <div class="tp-flash" style="left:${540 - 230}px;top:${930 - 230}px"></div>
    <div class="ts-flex" style="z-index:6">${logo}</div>`;

  // ---- scene 2: COMING SOON
  const comingLines = coming.map((ln, li) => {
    const chars = [...ln].map((ch, ci) => {
      const delay = 4.0 + li * 0.5 + ci * 0.065;
      const color = li === 0 ? "#fff" : COLORS_SOON[ci % COLORS_SOON.length];
      return ch === " " ? `<span style="display:inline-block;width:.3em"></span>` : `<span class="tp-a" style="display:inline-block;color:${color};transform-origin:50% 100%;animation-name:tpletter;animation-duration:1s;animation-delay:${delay.toFixed(2)}s">${esc(ch)}</span>`;
    }).join("");
    return `<div class="tp-a" style="font-family:Sora;font-weight:700;font-size:${comingSize}px;line-height:.95;white-space:nowrap;animation-name:tptrack;animation-duration:1.7s;animation-delay:${(3.9 + li * 0.5).toFixed(2)}s;animation-timing-function:cubic-bezier(.2,.7,.2,1)">${chars}</div>`;
  }).join("");
  const s2 = `
    ${card({ html: toast("Pembayaran diterima", "QRIS · Rp 35.000"), w: 400, h: 96, x: 60, y: 190, sc: 1.05, rot: -5, enter: "drop", at: 4.5, bob: [9, 6, -2], z: 4 })}
    ${card({ html: qrCard(), w: 260, h: 320, x: 745, y: 120, sc: 1, rot: 8, enter: "pop", at: 4.8, bob: [8, 7, -4], z: 3 })}
    ${card({ html: stat("Sesi foto hari ini", 48, "▲ 12 sesi"), w: 250, h: 150, x: 90, y: 1430, sc: 1.1, rot: -4, enter: "rise", at: 5.2, bob: [8, 6.5, -1], z: 3 })}
    ${card({ html: scroller(), w: 176, h: 340, x: 850, y: 1330, sc: 1.2, rot: 5, enter: "swing", at: 5.4, bob: [6, 9, -2], z: 2 })}
    ${card({ html: printer(1), w: 320, h: 590, x: 400, y: 1400, sc: 0.85, rot: -2, enter: "fade", at: 5.6, bob: [6, 7, -3], z: 3 })}
    <div class="ts-flex" style="z-index:6;padding-bottom:60px"><div style="perspective:1000px">${comingLines}</div>
      <div class="tp-a" style="margin-top:46px;font-weight:600;font-size:38px;letter-spacing:.22em;color:rgba(255,255,255,.82);animation-name:tprise;animation-delay:5.3s">studiodo.id</div></div>`;

  // ---- scene 3: four beats of the product story
  const B0 = 7.3, BL = 1.65;
  const beat = (i: number, content: string) => {
    const start = B0 + i * BL, end = i === 3 ? 13.9 : start + BL - 0.05;
    const lab = beats[i];
    const size = fit([lab], 900, 118, 64, 0.6);
    const dots = [0, 1, 2, 3].map((k) => `<i class="${k === i ? "on" : ""}"></i>`).join("");
    const head = `<div class="ts-flex" style="z-index:6;justify-content:flex-start;padding-top:170px">
        <div class="tp-a ts-step" style="animation-name:tppop;animation-delay:${(start + 0.05).toFixed(2)}s">0${i + 1} / 04</div>
        <div class="tp-mask" style="margin-top:22px"><div class="tp-a" style="animation-name:tpword;animation-delay:${(start + 0.15).toFixed(2)}s;font-family:Sora;font-weight:700;font-size:${size}px;letter-spacing:-.035em;white-space:nowrap">${esc(lab)}</div></div>
      </div>
      <div class="ts-flex" style="z-index:6;justify-content:flex-end;padding-bottom:110px"><div class="ts-dots">${dots}</div></div>`;
    return scene(head + content, start, end, 3 + i, 0.4);
  };
  const s3 = [
    beat(0, card({ html: mockQris(false), w: 560, h: 800, x: 204, y: 470, sc: 1.2, rot: -3, enter: "pop", at: B0 + 0.2, bob: [8, 7, -1], z: 3 })
      + card({ html: toast("Menunggu pembayaran", "Scan QRIS di layar"), w: 400, h: 96, x: 40, y: 1480, sc: 0.95, rot: 4, enter: "drop", at: B0 + 0.6, bob: [8, 6, -2], z: 4 })),
    beat(1, card({ html: printer(0), w: 320, h: 590, x: 296, y: 520, sc: 1.45, rot: 3, enter: "fade", at: B0 + BL + 0.1, bob: [7, 8, -3], z: 3 })
      + card({ html: toast("Pembayaran diterima", "QRIS · Rp 35.000"), w: 400, h: 96, x: 40, y: 410, sc: 0.95, rot: -5, enter: "drop", at: B0 + BL + 0.35, bob: [9, 6, -2], z: 4 })
      + card({ html: mockBoothL(), w: 880, h: 620, x: 20, y: 1280, sc: 0.5, rot: -5, enter: "pop", at: B0 + BL + 0.5, bob: [6, 7.5, -2], z: 2 })),
    beat(2, card({ html: mockGallery(), w: 470, h: 880, x: 300, y: 500, sc: 1.05, rot: 2, enter: "rise", at: B0 + 2 * BL + 0.1, bob: [8, 8, -5], z: 3 })
      + card({ html: qrCard(), w: 260, h: 320, x: 50, y: 1230, sc: 0.85, rot: -7, enter: "pop", at: B0 + 2 * BL + 0.4, bob: [8, 7, -4], z: 4 })
      + card({ html: scroller(), w: 176, h: 340, x: 840, y: 1130, sc: 1.1, rot: 5, enter: "swing", at: B0 + 2 * BL + 0.3, bob: [6, 9, -2], z: 3 })),
    beat(3, card({ html: mockDashboard(), w: 900, h: 694, x: 54, y: 560, sc: 1.08, rot: -2, enter: "rise", at: B0 + 3 * BL + 0.1, bob: [8, 8, -3], z: 3 })
      + card({ html: stat("Sesi foto hari ini", 48, "▲ 12 sesi"), w: 250, h: 150, x: 740, y: 1380, sc: 1.05, rot: 5, enter: "drop", at: B0 + 3 * BL + 0.45, bob: [8, 6.5, -1], z: 4 })
      + card({ html: toast("Booth online", "3 dari 3 kiosk aktif"), w: 400, h: 96, x: 50, y: 1420, sc: 0.95, rot: -4, enter: "drop", at: B0 + 3 * BL + 0.6, bob: [9, 6, -2], z: 4 })),
  ].join("");

  // ---- scene 4: All-in-One
  const S4 = 13.9;
  const headLines = head.map((ln, i) =>
    `<div class="tp-mask"><div class="tp-a" style="animation-name:tpword;animation-delay:${(S4 + 0.3 + i * 0.22).toFixed(2)}s;font-family:Sora;font-weight:700;font-size:${headSize}px;line-height:1.08;letter-spacing:-.035em;white-space:nowrap;${i === head.length - 1 ? "background:linear-gradient(100deg,#c9ccff,#ffc2dc 55%,#ffd8b8);-webkit-background-clip:text;background-clip:text;color:transparent" : ""}">${esc(ln)}</div></div>`).join("");
  const featLine = feats.map((f) => esc(f)).join(`<span style="opacity:.45;margin:0 .7em">·</span>`);
  const s4 = `
    ${card({ html: mockDashboard(), w: 900, h: 694, x: -110, y: 70, sc: 0.42, rot: -8, enter: "drop", at: S4 + 0.4, bob: [7, 8, -2], z: 1, op: 0.55 })}
    ${card({ html: mockQris(false), w: 560, h: 800, x: 770, y: 80, sc: 0.34, rot: 8, enter: "swing", at: S4 + 0.6, bob: [7, 8, -5], z: 1, op: 0.55 })}
    ${card({ html: mockGallery(), w: 470, h: 880, x: 30, y: 1380, sc: 0.44, rot: -6, enter: "rise", at: S4 + 0.8, bob: [7, 8, -3], z: 1, op: 0.6 })}
    ${card({ html: printer(2), w: 320, h: 590, x: 860, y: 1440, sc: 0.62, rot: 5, enter: "fade", at: S4 + 1.0, bob: [6, 7, -1], z: 1, op: 0.75 })}
    <div class="ts-flex" style="z-index:6;padding-bottom:140px"><div>${headLines}</div>
      <div class="tp-a" style="margin-top:34px;font-weight:600;font-size:38px;letter-spacing:.06em;color:rgba(255,255,255,.9);animation-name:tprise;animation-delay:${(S4 + 1.2).toFixed(2)}s">${featLine}</div>
      <div class="tp-a" style="margin-top:50px;animation-name:tppop;animation-delay:${(S4 + 1.8).toFixed(2)}s"><span class="tp-cta" style="font-size:42px;padding:28px 60px">${esc(o.cta)}${arrow}</span></div></div>
    <div class="ts-flex" style="z-index:6;justify-content:flex-end;padding-bottom:150px"><div class="tp-a" style="animation-name:tprise;animation-delay:${(S4 + 2.4).toFixed(2)}s">${silverLogoHtml(440, "silver", `--sweep-delay:${(S4 + 2.6).toFixed(2)}s`)}</div></div>`;

  const body = `
<div class="cv">
  ${blobs}
  ${scene(s1, 0, 3.3)}
  ${scene(s2, 3.4, 7.1)}
  ${s3}
  ${scene(s4, S4 - 0.3, undefined, 3)}
  <div class="ts-sweep" style="animation-delay:3.2s"></div>
  <div class="ts-sweep" style="animation-delay:6.9s"></div>
  <div class="ts-sweep" style="animation-delay:13.3s"></div>
  <div class="ts-sweep" style="animation-delay:16.9s"></div>
  <div class="tp-grain" style="background-image:${GRAIN}"></div>
</div>`;

  const script = `
(()=>{
  const fonts=document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve();
  Promise.race([fonts,new Promise(r=>setTimeout(r,2500))]).then(()=>{if(!window.__live)document.getAnimations().forEach(a=>a.pause());window.__ready=true;});
  window.__seek=(ms)=>{document.getAnimations().forEach(a=>{a.pause();a.currentTime=ms;});};
})();`;

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="only light"><style>${fontFaces()}${BASE_CSS}${APP_ICON_CSS}${triptychCss(TEASER_W)}${CSS}</style></head><body>${body}<script>${live ? "window.__live=true;" : ""}${script}</script></body></html>`;
}
