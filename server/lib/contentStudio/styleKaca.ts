import { readFileSync } from "node:fs";
import path from "node:path";
import { BASE_CSS, fontFaces, wordmark } from "./theme.js";
import { FIT_SCRIPT, icon, stage } from "./templates.js";
import { CTA_KEYWORD } from "./hooks.js";
import { ART_CSS, scene as artScene } from "./art.js";
import { decodeArt } from "./scenes.js";
import { FORMATS, THEMES, type Deck, type Slide, type ThemeName } from "./types.js";

// "Kaca" (style "kaca"): STUDIODO's own look. A near-black base lit by drifting aurora blobs, fluted-glass ribs, frosted glass
// panels, outline pills and big Bricolage headlines with one serif-italic accent word. The colour comes from a theme
// (biru / ungu / rose / senja / tosca) so a feed never turns into one blue wall, and every slide kind has several
// compositions chosen per deck, so consecutive posts do not share one template. CSS-animation driven only (seekable).

const fontsDir = path.join(process.cwd(), "server", "assets", "fonts");
let fontCss: string | null = null;
export function kacaFonts(): string {
  if (fontCss) return fontCss;
  const b64 = (f: string) => readFileSync(path.join(fontsDir, f)).toString("base64");
  const face = (fam: string, w: number, style: string, file: string) => `@font-face{font-family:"${fam}";font-weight:${w};font-style:${style};src:url(data:font/woff2;base64,${b64(file)}) format("woff2")}`;
  fontCss = [
    face("Bricolage", 800, "normal", "bricolage-latin-800-normal.woff2"),
    face("Instrument", 400, "italic", "instrument-serif-latin-400-italic.woff2"),
    face("InterK", 500, "normal", "inter-latin-500-normal.woff2"),
    face("InterK", 700, "normal", "inter-latin-700-normal.woff2"),
  ].join("\n");
  return fontCss;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const em = (s: string) => esc(s).replace(/\*([^*]+)\*/g, "<em>$1</em>");
const nowrapHyphen = (h: string) => h.replace(/([A-Za-z]+-[A-Za-z]+)/g, '<span class="nw">$1</span>');
/** "line one|line *two*": every line wipes up on its own; *word* becomes the serif-italic accent. */
function lines(title: string, d0 = 0.1): string {
  return title.split("|").map((l, i) => `<span class="ln"><span class="li" style="--d:${(d0 + i * 0.14).toFixed(2)}s">${nowrapHyphen(em(l))}</span></span>`).join("");
}
const D = (n: number) => `style="--d:${n}s"`;
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

const THEME_VARS: Record<ThemeName, string> = {
  biru: "--c1:#0b3dff;--c2:#2f9bff;--c3:#59d6ff;--deep:#050b2e",
  ungu: "--c1:#6a1bff;--c2:#b06bff;--c3:#ff9be6;--deep:#120629",
  rose: "--c1:#e8185a;--c2:#ff6b8f;--c3:#ffc2a0;--deep:#2a0716",
  senja: "--c1:#ff5a12;--c2:#ffa23a;--c3:#ffe08a;--deep:#2a1004",
  tosca: "--c1:#0a8f9c;--c2:#2fd0c4;--c3:#b6fff0;--deep:#03201f",
};

export const KACA_CSS = `
${THEMES.map((t) => `.kc-${t}{${THEME_VARS[t]}}`).join("\n")}
.stagebox{font-family:"InterK",system-ui,sans-serif;background:#04050c}
.ks{--s:var(--s0,0s);position:absolute;inset:0;display:flex;flex-direction:column;overflow:hidden;color:#f4f6ff;background:radial-gradient(120% 80% at 50% 0%,var(--deep),#04050c 72%);padding:0 72px}
.ks .k_bg{position:absolute;inset:0;overflow:hidden;z-index:0}
.ks .k_bg i{position:absolute;border-radius:50%;mix-blend-mode:screen;filter:blur(30px);animation:kdrift 11s ease-in-out infinite}
.ks .k_bg i:nth-child(1){width:1000px;height:1000px;left:-360px;top:-280px;background:radial-gradient(circle,var(--c1),transparent 66%);opacity:.9}
.ks .k_bg i:nth-child(2){width:900px;height:900px;right:-380px;top:360px;background:radial-gradient(circle,var(--c2),transparent 66%);opacity:.75;animation-delay:-4s;animation-direction:reverse}
.ks .k_bg i:nth-child(3){width:900px;height:900px;left:-200px;bottom:-460px;background:radial-gradient(circle,var(--c3),transparent 66%);opacity:.55;animation-delay:-7s}
@keyframes kdrift{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(70px,50px) scale(1.12)}}
.ks .k_ribs{position:absolute;inset:0;z-index:1;pointer-events:none;background:repeating-linear-gradient(90deg,rgba(255,255,255,.075) 0 5px,rgba(255,255,255,0) 5px 44px,rgba(0,0,0,.2) 44px 50px);-webkit-mask-image:linear-gradient(#000 0,transparent 62%);mask-image:linear-gradient(#000 0,transparent 62%)}
.ks .k_ribs.low{-webkit-mask-image:linear-gradient(transparent 30%,#000 100%);mask-image:linear-gradient(transparent 30%,#000 100%)}
.ks .k_grain{position:absolute;inset:0;z-index:7;pointer-events:none;opacity:.07;mix-blend-mode:overlay;background-image:url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/></filter><rect width="220" height="220" filter="url(#n)"/></svg>')}")}
.ks .k_photo{position:absolute;inset:-4%;z-index:0;background-size:cover;background-position:center;animation:kken 9s ease-out both}
@keyframes kken{from{transform:scale(1.14)}to{transform:scale(1)}}
.ks .k_scrim{position:absolute;inset:0;z-index:1;background:linear-gradient(180deg,rgba(4,5,12,.55),rgba(4,5,12,.1) 38%,rgba(4,5,12,.94) 100%)}
.k_hd{position:relative;z-index:4;display:flex;align-items:center;justify-content:space-between;height:70px;margin-top:62px}
.k_hd img{height:40px;display:block}
.k_pg{font-weight:700;font-size:21px;letter-spacing:.12em;padding:9px 18px;border:1.5px solid rgba(255,255,255,.3);border-radius:99px;color:rgba(244,246,255,.82)}
.k_ft{position:relative;z-index:4;display:flex;align-items:center;justify-content:space-between;height:96px;font-weight:700;font-size:23px;letter-spacing:.08em;color:rgba(244,246,255,.72)}
.k_ft .k_sw{display:inline-flex;align-items:center;gap:10px;padding:11px 22px;border:1.5px solid rgba(255,255,255,.3);border-radius:99px;font-size:20px;letter-spacing:.14em;text-transform:uppercase}
.k_ft .k_sw svg{animation:knudge 1.1s ease-in-out infinite}
@keyframes knudge{50%{transform:translateX(7px)}}
.k_mn{position:relative;z-index:3;flex:1;min-height:0;display:flex;flex-direction:column;gap:30px;padding-top:30px}
.k_mn.ctr{justify-content:center;padding-top:0;padding-bottom:20px;gap:44px}

/* type */
.kh{font-family:"Bricolage",system-ui,sans-serif;font-weight:800;font-size:112px;line-height:.98;letter-spacing:-.035em}
.kh.xl{font-size:116px;line-height:.95}.kh.xl.s{font-size:98px}.kh.big{font-size:148px;line-height:.9}.kh.m{font-size:86px;line-height:1}
.kh.c{text-align:center}.nw{white-space:nowrap}
.ln{display:block;overflow:hidden;padding:0 .1em .2em 0;margin:0 -.1em -.14em 0}
.li{display:block;animation:kup .9s cubic-bezier(.2,.9,.2,1) both;animation-delay:calc(var(--s0,0s) + var(--d,0s))}
@keyframes kup{from{transform:translateY(112%) skewY(5deg);opacity:0}to{transform:none;opacity:1}}
.kh em{font-family:"Instrument",Georgia,serif;font-style:italic;font-weight:400;font-size:1.14em;letter-spacing:-.02em;padding:0 .04em;background:linear-gradient(100deg,var(--c3),#fff 42%,var(--c2) 62%,var(--c3));background-size:230% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:kshim 4.5s linear infinite}
@keyframes kshim{to{background-position:-230% 0}}
.kb{font-size:34px;line-height:1.42;font-weight:500;color:rgba(244,246,255,.78);max-width:880px;animation:kfade .8s ease both;animation-delay:calc(var(--s0,0s) + var(--d,.3s))}
.kb.c{text-align:center;margin:0 auto}
@keyframes kfade{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.k_pill{align-self:flex-start;display:inline-flex;align-items:center;gap:12px;padding:12px 26px;border:1.5px solid rgba(255,255,255,.42);border-radius:99px;font-weight:700;font-size:22px;letter-spacing:.16em;text-transform:uppercase;animation:kfade .7s ease both;animation-delay:calc(var(--s0,0s) + var(--d,0s))}
.k_pill.c{align-self:center}.k_pill::before{content:"";width:11px;height:11px;border-radius:50%;background:var(--c3);box-shadow:0 0 14px var(--c3)}
.k_glass{background:linear-gradient(145deg,rgba(255,255,255,.17),rgba(255,255,255,.05));border:1.5px solid rgba(255,255,255,.22);border-radius:44px;-webkit-backdrop-filter:blur(26px) saturate(1.5);backdrop-filter:blur(26px) saturate(1.5);box-shadow:inset 0 1.5px 0 rgba(255,255,255,.34),0 50px 100px -40px rgba(0,0,0,.8)}
.k_star{position:absolute;z-index:5;width:150px;height:150px;animation:kspin 12s linear infinite;filter:drop-shadow(0 0 24px var(--c3))}
@keyframes kspin{to{transform:rotate(360deg)}}

/* mockups (reused from the other styles) sit in a lit frame */
.ks .stage{margin:0 -34px;padding:0 34px;flex:1;min-height:0}
.ks .stage::before,.ks .stage::after{display:none}
.ks .stage .mock{border-radius:22px;box-shadow:0 0 0 2px rgba(255,255,255,.2),0 40px 90px -20px color-mix(in srgb,var(--c2) 60%,transparent)}
.k_card{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;padding:34px 34px 0;overflow:hidden;animation:kfade .9s ease both;animation-delay:calc(var(--s0,0s) + var(--d,.6s))}
.k_card .stage{margin:0 -34px;padding:0 34px}
.k_tape{align-self:center;margin-top:-8px;padding:18px 34px;font-weight:700;font-size:28px;line-height:1.3;text-align:center;max-width:900px;animation:kfade .8s ease both;animation-delay:calc(var(--s0,0s) + var(--d,.9s))}
.k_tape em{font-style:normal;color:var(--c3)}

/* cover B: oversized type, device bleeding off the corner */
.cvB .stage{margin:0 -72px 0 0;padding:0 0 0 20px;transform:rotate(-4deg) translateX(40px)}
/* cover C: centred, glow behind the device */
.ks .k_glow{position:absolute;left:50%;bottom:120px;width:900px;height:900px;margin-left:-450px;border-radius:50%;background:radial-gradient(circle,var(--c2),transparent 62%);opacity:.5;filter:blur(20px);z-index:0;animation:kdrift 9s ease-in-out infinite}
/* cover P: photo full bleed */
.cvP .k_mn{justify-content:flex-end;padding-bottom:40px}

/* compare A: flat split, no cards */
.k_cmpA{position:relative;flex:1;min-height:0;display:grid;grid-template-rows:1fr 1.25fr;margin:0 -72px}
.k_cmpA .k_half{display:flex;flex-direction:column;justify-content:center;gap:26px;padding:0 72px}
.k_cmpA .bf{opacity:.62}
.k_cmpA .af{clip-path:polygon(0 9%,100% 0,100% 100%,0 100%);margin-top:-30px;padding-top:60px;background:linear-gradient(135deg,var(--c1),var(--c2) 70%,var(--c3));color:#050816;animation:kwipeUp .9s cubic-bezier(.2,.9,.2,1) both;animation-delay:calc(var(--s0,0s) + 1.1s)}
@keyframes kwipeUp{from{transform:translateY(70%);opacity:0}to{transform:none;opacity:1}}
.k_half h4{font-weight:700;font-size:21px;letter-spacing:.2em;text-transform:uppercase;opacity:.8}
.k_half ul{list-style:none;display:grid;gap:22px}
.k_half li{display:flex;gap:18px;align-items:center;font-family:"Bricolage",system-ui,sans-serif;font-weight:800;font-size:44px;letter-spacing:-.02em;line-height:1.1}
.k_half li svg{flex:none}
.k_cmpA .bf li span.t{background:linear-gradient(#fff,#fff) 0 56%/0% 4px no-repeat;animation:kstrike .6s ease forwards;animation-delay:calc(var(--s0,0s) + .8s + var(--i,0)*.14s)}
@keyframes kstrike{to{background-size:100% 4px}}
.k_cmpA .af li{animation:kfade .6s ease both;animation-delay:calc(var(--s0,0s) + 1.7s + var(--i,0)*.16s)}
/* compare B: two glass columns */
.k_cmpB{display:grid;grid-template-columns:1fr 1fr;gap:26px;margin-top:6px;flex:1;min-height:0;align-content:center}
.k_cmpB .k_col{padding:40px 30px 44px}
.k_cmpB .k_col.bf{opacity:.75;animation:kfade .7s ease both;animation-delay:calc(var(--s0,0s) + .3s)}
.k_cmpB .k_col.af{background:linear-gradient(150deg,color-mix(in srgb,var(--c1) 70%,transparent),color-mix(in srgb,var(--c2) 38%,transparent));animation:kfade .7s ease both;animation-delay:calc(var(--s0,0s) + 1s)}
.k_cmpB h4{font-weight:700;font-size:21px;letter-spacing:.18em;text-transform:uppercase;margin-bottom:22px;opacity:.85}
.k_cmpB ul{list-style:none;display:grid;gap:26px}.k_cmpB li{display:flex;gap:14px;font-size:33px;font-weight:700;line-height:1.2}.k_cmpB li svg{flex:none;margin-top:3px}

/* steps A: timeline, numerals instead of cards */
.k_stpA{position:relative;display:grid;gap:34px;margin:10px 0 0 6px;padding-left:0}
.k_stpA::before{content:"";position:absolute;left:62px;top:40px;bottom:40px;width:3px;background:linear-gradient(var(--c3),transparent);opacity:.7}
.k_stpA .k_it{position:relative;display:flex;align-items:center;gap:36px;animation:kfade .7s ease both;animation-delay:calc(var(--s0,0s) + var(--d,0s))}
.k_stpA .k_no{flex:none;width:126px;text-align:center;font-family:"Bricolage",sans-serif;font-weight:800;font-size:116px;line-height:1;background:linear-gradient(var(--c3),var(--c2));-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 22px color-mix(in srgb,var(--c2) 70%,transparent))}
.k_stpA .k_tx{font-size:42px;font-weight:700;line-height:1.2;letter-spacing:-.01em}
/* steps B: glass rows */
.k_stpB{display:grid;gap:22px;margin-top:6px}
.k_stpB .k_it{display:flex;align-items:center;gap:28px;padding:30px 34px;border-radius:30px;font-size:38px;font-weight:700;line-height:1.2;animation:kslide .7s cubic-bezier(.2,.9,.2,1) both;animation-delay:calc(var(--s0,0s) + var(--d,0s))}
.k_stpB .k_it:nth-child(even){margin-left:50px}
@keyframes kslide{from{opacity:0;transform:translateX(-80px)}to{opacity:1;transform:none}}
.k_stpB .k_no{flex:none;display:grid;place-items:center;width:78px;height:78px;border-radius:50%;background:linear-gradient(145deg,var(--c2),var(--c1));font-family:"Bricolage",sans-serif;font-weight:800;font-size:44px;box-shadow:0 0 30px color-mix(in srgb,var(--c2) 60%,transparent)}

/* stat */
.k_stt{display:grid;gap:12px;margin-top:6px}
.k_stt .k_num{font-family:"Bricolage",sans-serif;font-weight:800;font-size:340px;line-height:.86;letter-spacing:-.06em;background:linear-gradient(160deg,#fff,var(--c3) 40%,var(--c2));-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 50px color-mix(in srgb,var(--c2) 55%,transparent));animation:kslam .9s cubic-bezier(.3,1.4,.5,1) both;animation-delay:calc(var(--s0,0s) + .3s)}
@keyframes kslam{from{opacity:0;transform:scale(1.25)}to{opacity:1;transform:none}}
.k_stt .k_lab{font-size:38px;font-weight:700;line-height:1.25;max-width:860px;animation:kfade .8s ease both;animation-delay:calc(var(--s0,0s) + 1.1s)}
.k_mq{position:relative;margin:18px -72px 0;overflow:hidden;border-block:1.5px solid rgba(255,255,255,.25);padding:18px 0;transform:rotate(-2.4deg);background:rgba(255,255,255,.06)}
.k_mq div{display:flex;width:max-content;font-family:"Bricolage",sans-serif;font-weight:800;font-size:34px;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;animation:kmq 10s linear infinite}
.k_mq span{padding:0 28px}.k_mq span:nth-child(odd){color:var(--c3)}
@keyframes kmq{to{transform:translateX(-50%)}}

/* note A: floating chips; note B: glass list */
.k_chips{display:flex;flex-wrap:wrap;gap:20px 16px;margin-top:8px}
.k_chips .k_ch{display:inline-flex;align-items:center;gap:16px;padding:22px 34px;border:1.5px solid rgba(255,255,255,.42);border-radius:99px;font-size:36px;font-weight:700;line-height:1.15;background:rgba(255,255,255,.06);animation:kpop .7s cubic-bezier(.3,1.5,.5,1) both;animation-delay:calc(var(--s0,0s) + var(--d,0s))}
.k_chips .k_ch:nth-child(2n){transform:translateX(30px)}.k_chips .k_ch:nth-child(3n){margin-left:20px}
@keyframes kpop{from{opacity:0;transform:scale(.7) translateY(30px)}to{opacity:1}}
.k_lst{padding:20px 38px;display:grid}
.k_lst .k_r{display:flex;align-items:center;gap:24px;padding:28px 0;font-size:38px;font-weight:700;line-height:1.2;border-bottom:1.5px solid rgba(255,255,255,.14);animation:kfade .7s ease both;animation-delay:calc(var(--s0,0s) + var(--d,0s))}
.k_lst .k_r:last-child{border:0}.k_lst .k_tk{flex:none;display:grid;place-items:center;width:58px;height:58px;border-radius:50%;background:linear-gradient(145deg,var(--c3),var(--c2));color:#04122a}

/* cta */
.k_btn{display:inline-flex;align-items:center;gap:18px;padding:30px 56px;border-radius:99px;background:linear-gradient(120deg,var(--c1),var(--c2));font-weight:700;font-size:38px;letter-spacing:.03em;box-shadow:0 0 0 2px rgba(255,255,255,.3),0 24px 70px -10px var(--c2);animation:kbeat 1.8s ease-in-out infinite}
@keyframes kbeat{50%{transform:scale(1.045)}}
.kw{display:inline-flex;align-items:center;gap:14px;margin-top:26px;padding:16px 34px;border:1.5px dashed rgba(255,255,255,.55);border-radius:99px;font-size:30px;font-weight:700;letter-spacing:.04em}
.kw b{font-family:"Bricolage",sans-serif;font-weight:800;color:var(--c3);letter-spacing:.1em}
.k_ctaLogo{height:84px;align-self:center;animation:kfade .8s ease both;animation-delay:calc(var(--s0,0s) + .2s)}
.k_rows{position:absolute;inset:-60px -120px;z-index:1;display:grid;align-content:center;gap:8px;transform:rotate(-8deg);opacity:.06;pointer-events:none}
.k_rows div{display:flex;width:max-content;font-family:"Bricolage",sans-serif;font-weight:800;font-size:150px;line-height:1;white-space:nowrap;animation:kmq 24s linear infinite}
.k_rows div:nth-child(even){animation-direction:reverse}.k_rows span{padding:0 40px}

/* chat + emoji sticker */
.k_chat{display:grid;gap:18px;padding:30px}
.k_chat .k_bub{max-width:80%;padding:20px 28px;font-size:32px;line-height:1.3;font-weight:700;border-radius:30px;animation:kfade .5s ease both;animation-delay:calc(var(--s0,0s) + var(--d,0s))}
.k_chat .k_them{justify-self:start;background:rgba(255,255,255,.14);border-bottom-left-radius:8px}
.k_chat .k_us{justify-self:end;background:linear-gradient(120deg,var(--c1),var(--c2));border-bottom-right-radius:8px}
.k_emo{align-self:flex-end;font-size:260px;line-height:1;margin:-20px 10px -10px 0;filter:drop-shadow(0 0 40px var(--c2));animation:kpop .8s cubic-bezier(.3,1.5,.5,1) both;animation-delay:calc(var(--s0,0s) + var(--d,.7s))}

/* reel */
.stagebox.reel .ks{padding:0 76px}
.stagebox.reel .k_hd{margin-top:150px}
.stagebox.reel .k_mn{padding-bottom:230px;gap:34px}
.stagebox.reel .k_ft{display:none}
.stagebox.reel .kh{font-size:122px}.stagebox.reel .kh.xl,.stagebox.reel .kh.big{font-size:146px}.stagebox.reel .kh.xl.s{font-size:120px}.stagebox.reel .kh.m{font-size:98px}
.stagebox.reel .kb{font-size:40px}.stagebox.reel .k_stt .k_num{font-size:400px}
.ksweep{position:absolute;inset:0;z-index:60;pointer-events:none;opacity:0;background:linear-gradient(105deg,transparent 30%,rgba(255,255,255,.55) 50%,transparent 70%);animation:ksweep .6s ease-in both;animation-delay:calc(var(--t,0s) - .25s)}
@keyframes ksweep{0%{opacity:1;transform:translateX(-100%)}100%{opacity:1;transform:translateX(100%)}}
.kscene{animation:ksIn .001s both,ksOut .001s forwards;animation-delay:var(--in,0s),var(--out,1000s)}
@keyframes ksIn{from{opacity:0;visibility:hidden}to{opacity:1;visibility:visible}}
@keyframes ksOut{to{opacity:0;visibility:hidden}}

/* illustrations */
.k_art{position:relative;flex:1;min-height:0}.k_art svg{position:absolute;inset:0;width:100%;height:100%}
.k_tilt,.k_full,.k_circle,.k_panel{display:flex;flex-direction:column}
.artA .k_card{padding:0}.artA .k_art{margin:0}
.artB .k_circle{position:absolute;right:-70px;bottom:66px;width:660px;height:660px;border-radius:50%;background:radial-gradient(circle at 38% 30%,color-mix(in srgb,var(--c2) 60%,transparent),color-mix(in srgb,var(--c1) 22%,transparent) 70%);border:1.5px solid rgba(255,255,255,.28);z-index:2;animation:kfade .9s ease both;animation-delay:calc(var(--s0,0s) + .7s)}
.artB .k_circle .k_art{position:absolute;inset:30px 70px 0 20px}
.artC .k_art{margin:0 -40px}.artC .k_glow{bottom:60px}
.artD .k_full{position:absolute;left:-20px;right:-20px;bottom:56px;height:660px;z-index:2}
.artE .k_tilt{flex:1;min-height:0;margin:30px 14px 0;transform:rotate(-3deg);border:7px solid #fff;border-radius:46px;background:linear-gradient(150deg,var(--c1),color-mix(in srgb,var(--c2) 80%,#000));overflow:hidden;box-shadow:0 40px 80px -20px rgba(0,0,0,.65);animation:kfade .9s ease both;animation-delay:calc(var(--s0,0s) + .6s)}
.artE .k_tape{position:absolute;left:50px;top:560px;z-index:6;transform:rotate(-4deg);padding:12px 28px;background:#ffd23f;color:#1b1730;font-weight:700;font-size:25px;letter-spacing:.14em;text-transform:uppercase;border-radius:8px}
.artF .k_arttop{flex:1.25;min-height:0;margin:0 -72px;position:relative;z-index:2}.artF .k_arttop .k_art{position:absolute;inset:0}
.scnA .k_art,.scnB .k_art{flex:1}
.scnB .k_panel{padding:34px 38px}.scnB h1{margin-bottom:6px}
.scnC .k_row{display:grid;grid-template-columns:1.55fr 1fr;gap:10px;align-items:center;flex:1;min-height:0}.scnC .k_row .k_art{height:100%}
.k_items{display:flex;flex-wrap:wrap;gap:14px}.scnC .k_items span{font-size:27px;padding:14px 22px}
.k_items span{padding:16px 28px;border:1.5px solid rgba(255,255,255,.4);border-radius:99px;font-weight:700;font-size:30px;background:rgba(255,255,255,.07);animation:kpop .7s cubic-bezier(.3,1.5,.5,1) both;animation-delay:calc(var(--s0,0s) + var(--d,0s))}
${ART_CSS}
`;

const STAR = `<svg class="k_star" viewBox="0 0 100 100"><path fill="#fff" d="M50 0l7 38 38-7-30 24 30 24-38-7-7 38-7-38-38 7 30-24L5 31l38 7z"/></svg>`;
const pad = (n: number) => String(n).padStart(2, "0");
const kstage = (s: Slide, reel: boolean, d = 0.5) => stage(s, reel, d).replace('class="stage"', 'class="stage t-dark"');
const kbody = (s: Slide, d = 0.45, cls = "") => (s.body ? `<p class="kb ${cls}" ${D(d)}>${esc(s.body)}</p>` : "");
const kpill = (s: Slide, d = 0, cls = "") => (s.eyebrow ? `<div class="k_pill ${cls}" ${D(d)}>${esc(s.eyebrow)}</div>` : "");
const ktape = (s: Slide) => (s.note ? `<div class="k_tape k_glass" ${D(0.9)}>${em(s.note)}</div>` : "");
const longCls = (s: Slide) => (s.title.replace(/[|*]/g, "").length > 30 ? " s" : "");
const longest0 = (s: Slide) => Math.max(...s.title.replace(/\*/g, "").split("|").map((l) => l.length));
const sizeCls = (s: Slide) => (s.title.replace(/[|*]/g, "").length > 38 ? "m" : "");
const ribs = (_low = false) => ""; // the vertical stripe texture was dropped: flat aurora glow only

type Pick = (salt: number, n: number) => number;

/** The illustration of a slide as an inline <svg> inside a sized box, or "" when the slide has none. */
function artHtml(s: Slide, cls = ""): string {
  const a = decodeArt(s.art);
  return a ? `<div class="k_art ${cls}">${artScene(a.scene, { expr: a.expr, hair: a.hair, skin: a.skin })}</div>` : "";
}

function inner(s: Slide, deck: Deck, reel: boolean, pick: Pick): { html: string; cls: string; extra: string } {
  const none = { cls: "", extra: "" };
  switch (s.kind) {
    case "cover":
    case "hook": {
      const emo = s.emoji && !s.art ? `<div class="k_emo" ${D(0.9)}>${esc(s.emoji)}</div>` : "";
      if (s.kind === "hook" && !s.bgImage && !s.art) return { cls: "ctr", extra: `${ribs()}<div class="k_glow"></div>`, html: `${kpill(s)}<h1 class="kh big${longCls(s)}">${lines(s.title, 0.2)}</h1>${kbody(s, 0.8)}${emo}` };
      if (!s.bgImage && s.art) {
        const av = pick(0, 6);
        const t = `<h1 class="kh ${av === 1 ? (longest0(s) > 13 ? "xl" : "big") : "xl"}${av === 2 ? " c" : ""}${longCls(s)}">${lines(s.title, 0.2)}</h1>`;
        if (av === 0) return { cls: "artA", extra: ribs(), html: `${kpill(s)}${t}${kbody(s, 0.85)}${emo}<div class="k_card k_glass" ${D(1.0)}>${artHtml(s)}</div>` };
        if (av === 1) return { cls: "artB", extra: ribs(), html: `${kpill(s)}${t}${kbody(s, 0.85)}${emo}<div class="k_circle">${artHtml(s)}</div>` };
        if (av === 2) return { cls: "artC", extra: `${ribs()}<div class="k_glow"></div>`, html: `${kpill(s, 0, "c")}${t}${kbody(s, 0.85, "c")}${emo}${artHtml(s)}` };
        if (av === 3) return { cls: "artD", extra: ribs(true), html: `${kpill(s)}${t}${kbody(s, 0.85)}${emo}<div class="k_full">${artHtml(s)}</div>` };
        if (av === 4) return { cls: "artE", extra: "", html: `${kpill(s)}${t}${emo}<div class="k_tilt">${artHtml(s)}</div><div class="k_tape">Kasus nyata</div>` };
        return { cls: "artF", extra: ribs(), html: `<div class="k_arttop">${artHtml(s)}</div>${kpill(s)}${t}${kbody(s, 0.85)}${emo}` };
      }
      const v = s.bgImage ? 3 : pick(0, 3);
      const longest = Math.max(...s.title.replace(/\*/g, "").split("|").map((l) => l.length));
      if (v === 3) return { cls: "cvP", extra: `<div class="k_photo" style="background-image:url('${esc(s.bgImage ?? "")}')"></div><div class="k_scrim"></div>`, html: `${kpill(s)}<div style="flex:1"></div><h1 class="kh xl${longCls(s)}">${lines(s.title, 0.2)}</h1>${kbody(s, 0.8)}${emo}` };
      if (v === 0) return { cls: "cvA", extra: ribs(), html: `${kpill(s)}<h1 class="kh xl${longCls(s)}">${lines(s.title, 0.2)}</h1>${kbody(s, 0.85)}${emo}${s.mockup && s.mockup !== "none" ? `<div class="k_card k_glass" ${D(1.1)}>${kstage(s, reel, 1.4)}</div>` : ""}` };
      if (v === 1) return { cls: "cvB", extra: STAR.replace("<svg", `<svg style="right:72px;top:${reel ? 252 : 160}px;width:92px;height:92px"`), html: `${kpill(s)}<h1 class="kh ${longest > 13 ? "xl" : "big"}${longCls(s)}">${lines(s.title, 0.2)}</h1>${kbody(s, 0.85)}${emo}${kstage(s, reel, 1.1)}` };
      return { cls: "cvC", extra: `${ribs()}<div class="k_glow"></div>`, html: `${kpill(s, 0, "c")}<h1 class="kh xl c${longCls(s)}">${lines(s.title, 0.2)}</h1>${kbody(s, 0.85, "c")}${emo}${kstage(s, reel, 1.2)}` };
    }
    case "scene": {
      const sv = pick(5, 3);
      const items = (s.items ?? []).slice(0, 3).map((it, i) => `<span style="--d:${(1.2 + i * 0.25).toFixed(2)}s">${esc(it)}</span>`).join("");
      const head = `${kpill(s)}<h1 class="kh m">${lines(s.title, 0.15)}</h1>`;
      if (sv === 0) return { cls: "scnA", extra: ribs(true), html: `${head}${artHtml(s)}<div class="k_items">${items}</div>${kbody(s, 1.6)}` };
      if (sv === 1) return { cls: "scnB", extra: ribs(), html: `${artHtml(s)}<div class="k_panel k_glass" ${D(0.6)}>${head}<div class="k_items" style="margin-top:14px">${items}</div></div>` };
      return { cls: "scnC", extra: ribs(true), html: `${head}<div class="k_row">${artHtml(s)}<div class="k_items" style="flex-direction:column;align-items:flex-start">${items}</div></div>${kbody(s, 1.6)}` };
    }
    case "feature":
      return { cls: "cvA", extra: ribs(), html: `${kpill(s)}<h1 class="kh ${sizeCls(s)}">${lines(s.title, 0.15)}</h1>${kbody(s, 0.7)}<div class="k_card k_glass" ${D(0.9)}>${kstage(s, reel, 1.1)}</div>${ktape(s)}` };
    case "steps": {
      const items = s.items ?? [];
      if (pick(2, 2) === 0) {
        const list = items.map((it, i) => `<div class="k_it" ${D(0.6 + i * 0.32)}><span class="k_no">${i + 1}</span><span class="k_tx">${em(it)}</span></div>`).join("");
        return { cls: "ctr", extra: "", html: `${kpill(s)}<h1 class="kh m">${lines(s.title, 0.15)}</h1><div class="k_stpA">${list}</div>${kbody(s, 0.7 + items.length * 0.3)}` };
      }
      const list = items.map((it, i) => `<div class="k_it k_glass" ${D(0.6 + i * 0.3)}><span class="k_no">${i + 1}</span><span>${em(it)}</span></div>`).join("");
      return { cls: "ctr", extra: "", html: `${kpill(s)}<h1 class="kh m">${lines(s.title, 0.15)}</h1><div class="k_stpB">${list}</div>${kbody(s, 0.7 + items.length * 0.3)}` };
    }
    case "stat": {
      const st = s.stat ?? { value: 0, label: "" };
      const tick = `<span>${esc(st.label)}</span><span>★</span>`.repeat(6);
      return { cls: "ctr", extra: "", html: `${kpill(s)}<h1 class="kh m">${lines(s.title, 0.15)}</h1><div class="k_stt"><div class="k_num">${esc(st.prefix ?? "")}<span class="count" style="--to:${Math.round(st.value)};--d:.7s"></span>${esc(st.suffix ?? "")}</div><div class="k_lab">${esc(st.label)}</div></div><div class="k_mq"><div>${tick}${tick}</div></div>${kbody(s, 2)}${ktape(s)}` };
    }
    case "compare": {
      if (pick(1, 2) === 0) {
        const bad = (s.itemsBefore ?? []).map((t, i) => `<li style="--i:${i}">${icon("x", 38, 3.4, "#fff")}<span class="t">${esc(t)}</span></li>`).join("");
        const good = (s.items ?? []).map((t, i) => `<li style="--i:${i}">${icon("check", 40, 3.8, "#050816")}<span>${esc(t)}</span></li>`).join("");
        return { cls: "", extra: "", html: `${kpill(s)}<h1 class="kh m">${lines(s.title, 0.15)}</h1><div class="k_cmpA"><div class="k_half bf"><h4>${esc(s.labelBefore || "Dulu")}</h4><ul>${bad}</ul></div><div class="k_half af"><h4>${esc(s.labelAfter || "Dengan STUDIODO")}</h4><ul>${good}</ul></div></div>` };
      }
      const bad = (s.itemsBefore ?? []).map((t) => `<li>${icon("x", 30, 3.4, "var(--c3)")}<span>${esc(t)}</span></li>`).join("");
      const good = (s.items ?? []).map((t) => `<li>${icon("check", 30, 3.8, "var(--c3)")}<span>${esc(t)}</span></li>`).join("");
      return { cls: "", extra: ribs(true), html: `${kpill(s)}<h1 class="kh m">${lines(s.title, 0.15)}</h1><div class="k_cmpB"><div class="k_col k_glass bf"><h4>${esc(s.labelBefore || "Dulu")}</h4><ul>${bad}</ul></div><div class="k_col k_glass af"><h4>${esc(s.labelAfter || "Dengan STUDIODO")}</h4><ul>${good}</ul></div></div>${ktape(s)}` };
    }
    case "chat": {
      const msgs = (s.chat ?? []).map((m, i) => `<div class="k_bub ${m.from === "us" ? "k_us" : "k_them"}" ${D(0.7 + i * 0.85)}>${esc(m.text)}</div>`).join("");
      return { cls: "ctr", extra: "", html: `${kpill(s)}${s.title ? `<h1 class="kh m">${lines(s.title, 0.15)}</h1>` : ""}<div class="k_chat k_glass">${msgs}</div>${ktape(s)}` };
    }
    case "note": {
      const items = s.items ?? [];
      const body = pick(3, 2) === 0
        ? `<div class="k_chips">${items.map((it, i) => `<div class="k_ch" ${D(0.7 + i * 0.26)}>${icon("check", 30, 3.8, "var(--c3)")}${em(it)}</div>`).join("")}</div>`
        : `<div class="k_lst k_glass">${items.map((it, i) => `<div class="k_r" ${D(0.7 + i * 0.28)}><span class="k_tk">${icon("check", 30, 3.8)}</span><span>${em(it)}</span></div>`).join("")}</div>`;
      return { cls: "ctr", extra: ribs(true), html: `${kpill(s)}<h1 class="kh m">${lines(s.title, 0.15)}</h1>${body}${kbody(s, 1.8)}${ktape(s)}` };
    }
    case "cta": {
      const key = `<div class="kw">Komen <b>${CTA_KEYWORD}</b> untuk mulai trial gratis</div>`;
      const btn = `<div class="k_btn" ${D(1.2)}>Coba gratis${icon("arrow", 36, 3)}</div>`;
      if (pick(4, 2) === 0) return { cls: "ctr", extra: `${ribs(true)}<div class="k_glow"></div>`, html: `<img class="k_ctaLogo" src="${wordmark("white")}" alt="STUDIODO"><h1 class="kh xl c">${lines(s.title, 0.3)}</h1>${kbody(s, 0.9, "c")}<div style="display:grid;justify-items:center;margin-top:10px">${btn}${key}</div>` };
      const words = "COBA GRATIS · BOOTH JALAN SENDIRI · ".repeat(4).split(" · ").map((w) => `<span>${esc(w)}</span>`).join("");
      return { cls: "ctr", extra: `<div class="k_rows">${`<div>${words}${words}</div>`.repeat(7)}</div>`, html: `${kpill(s)}<h1 class="kh xl">${lines(s.title, 0.3)}</h1>${kbody(s, 0.9)}<div>${btn}<br>${key}</div>` };
    }
    case "badge":
      return { ...none, html: "" };
  }
}

function kacaSlide(s: Slide, deck: Deck, ctx: { index: number; total: number; startSec?: number; sceneEnd?: number; reel: boolean }): string {
  const theme: ThemeName = deck.theme && THEMES.includes(deck.theme) ? deck.theme : "biru";
  const h = hash(deck.id);
  const pick: Pick = (salt, n) => (h >>> (salt * 3)) % n;
  const { html, cls, extra } = inner(s, deck, ctx.reel, pick);
  const last = ctx.index === ctx.total - 1;
  const swipe = ctx.reel || last ? "" : `<span class="k_sw">Geser ${icon("arrow", 22, 3.4)}</span>`;
  const timing = ctx.reel ? `--in:${(ctx.startSec ?? 0).toFixed(2)}s;--out:${ctx.sceneEnd?.toFixed(2) ?? "1000"}s;` : "";
  const bgPhoto = s.bgImage && s.kind !== "cover" && s.kind !== "hook" ? `<div class="k_photo" style="background-image:url('${esc(s.bgImage)}');opacity:.38"></div><div class="k_scrim"></div>` : "";
  return `<section class="ks kc-${theme} ${cls}${ctx.reel ? " kscene" : ""}" style="--s0:${ctx.startSec ?? 0}s;${timing}">
    <div class="k_bg"><i></i><i></i><i></i></div>${bgPhoto}${extra}<div class="k_grain"></div>
    <div class="k_hd"><img src="${wordmark("white")}" alt="STUDIODO">${ctx.reel ? "" : `<span class="k_pg">${pad(ctx.index + 1)} / ${pad(ctx.total)}</span>`}</div>
    <div class="k_mn${cls === "ctr" ? " ctr" : ""}">${html}</div>
    <div class="k_ft"><span>@${esc(deck.handle)}</span>${swipe}</div>
  </section>`;
}

function doc(deck: Deck, body: string): string {
  const { width, height } = FORMATS[deck.format];
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="only light"><style>${fontFaces()}${kacaFonts()}${BASE_CSS}${KACA_CSS}</style></head>
<body><div class="stagebox ${deck.format}" style="--W:${width}px;--H:${height}px">${body}</div><script>${FIT_SCRIPT}</script></body></html>`;
}

export function buildKacaSlideDoc(deck: Deck, index: number): string {
  return doc(deck, kacaSlide(deck.slides[index], deck, { index, total: deck.slides.length, reel: deck.format === "reel" }));
}

export function buildKacaReelDoc(deck: Deck): { html: string; durationSec: number } {
  let t = 0;
  const sweeps: string[] = [];
  const scenes = deck.slides.map((s, i) => {
    const len = Math.max(1.8, s.seconds ?? 3.4);
    const html = kacaSlide(s, deck, { index: i, total: deck.slides.length, reel: true, startSec: t, sceneEnd: t + len });
    if (i > 0) sweeps.push(`<div class="ksweep" style="--t:${t.toFixed(2)}s"></div>`);
    t += len;
    return html;
  });
  return { html: doc(deck, scenes.join("") + sweeps.join("")), durationSec: t + 0.8 };
}
