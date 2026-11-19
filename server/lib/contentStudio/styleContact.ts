import { readFileSync } from "node:fs";
import path from "node:path";
import { BASE_CSS, fontFaces } from "./theme.js";
import { FIT_SCRIPT, icon, stage } from "./templates.js";
import { FORMATS, type Deck, type Slide, type Tone } from "./types.js";

// "Contact Sheet" (style "kontak"): the photobooth's own visual language instead of glass gradients.
// Flat paper / ink / cobalt / butter / blush colour blocks, a scrolling film-strip ribbon with a frame counter, serif
// headlines that wipe in line by line, highlighter blocks, rubber-stamp labels and hard-shadow "prints" that get pasted
// down in 12 fps stop-motion steps. Everything is CSS-animation driven so the renderer can seek to any frame.

const fontsDir = path.join(process.cwd(), "server", "assets", "fonts");
let fontCss: string | null = null;
function contactFonts(): string {
  if (fontCss) return fontCss;
  const b64 = (f: string) => readFileSync(path.join(fontsDir, f)).toString("base64");
  fontCss = [
    `@font-face{font-family:"Fraunces";font-weight:700;font-style:normal;src:url(data:font/woff2;base64,${b64("fraunces-latin-700-normal.woff2")}) format("woff2")}`,
    `@font-face{font-family:"Fraunces";font-weight:900;font-style:italic;src:url(data:font/woff2;base64,${b64("fraunces-latin-900-italic.woff2")}) format("woff2")}`,
    `@font-face{font-family:"Space Grotesk";font-weight:300 700;font-style:normal;src:url(data:font/woff2;base64,${b64("space-grotesk-latin-wght-normal.woff2")}) format("woff2")}`,
  ].join("\n");
  return fontCss;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const em = (s: string) => esc(s).replace(/\*([^*]+)\*/g, "<em>$1</em>");
/** "line one|line *two*" -> each line wipes up on its own (staggered), *word* becomes a highlighted italic. */
function lines(title: string, d0 = 0.1): string {
  return title.split("|").map((l, i) => `<span class="ln"><span class="li" style="--d:${(d0 + i * 0.14).toFixed(2)}s">${em(l)}</span></span>`).join("");
}
const D = (n: number) => `style="--d:${n}s"`;

const noise = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .55 0"/></filter><rect width="240" height="240" filter="url(#n)"/></svg>`,
);
const sprocket = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="46" height="34"><path fill-rule="evenodd" d="M0 0H46V34H0Z M16 9H30A4 4 0 0 1 34 13V21A4 4 0 0 1 30 25H16A4 4 0 0 1 12 21V13A4 4 0 0 1 16 9Z"/></svg>`,
);

// tone -> colour blocks. Tone names are the same as the classic style so a deck can switch style without re-toning.
const KT: Record<Tone, string> = {
  light: "--bg:#efe9dc;--fg:#14110f;--mute:#4a443c;--ac:#ff4b1f;--mark:#ffd23f;--em:#14110f;--sh:#14110f;--card:#fffaf0",
  dark: "--bg:#14110f;--fg:#efe9dc;--mute:#b9b0a1;--ac:#ff6a3d;--mark:#ffd23f;--em:#14110f;--sh:#ff4b1f;--card:#26211d",
  indigo: "--bg:#2a3cff;--fg:#f6f1e6;--mute:#d7dbff;--ac:#ffd23f;--mark:#ffd23f;--em:#14110f;--sh:#14110f;--card:#3a4aff",
  peach: "--bg:#ffd23f;--fg:#14110f;--mute:#3d3320;--ac:#ff4b1f;--mark:#14110f;--em:#ffd23f;--sh:#14110f;--card:#ffe27a",
  mint: "--bg:#ffb9cf;--fg:#14110f;--mute:#4a2d38;--ac:#2a3cff;--mark:#2a3cff;--em:#f6f1e6;--sh:#14110f;--card:#ffd3e1",
};

export const CONTACT_CSS = `
${Object.entries(KT).map(([k, v]) => `.kt-${k}{${v}}`).join("\n")}
.stagebox{font-family:"Space Grotesk",system-ui,sans-serif}
.kslide{--s:var(--s0,0s);position:absolute;inset:0;display:flex;flex-direction:column;color:var(--fg);background:var(--bg);overflow:hidden;padding:0 76px}
.kslide::after{content:"";position:absolute;inset:0;pointer-events:none;z-index:6;background:url("data:image/svg+xml,${noise}");opacity:.16;mix-blend-mode:multiply}
.kt-dark::after,.kt-indigo::after{mix-blend-mode:screen;opacity:.07}
.kdots{position:absolute;right:-40px;top:70px;width:520px;height:520px;z-index:0;pointer-events:none;opacity:.2;background:radial-gradient(circle,var(--fg) 2.6px,transparent 3.2px) 0 0/24px 24px;-webkit-mask-image:radial-gradient(circle at 100% 0,#000,transparent 66%);mask-image:radial-gradient(circle at 100% 0,#000,transparent 66%)}
.kfilm{position:absolute;left:0;right:0;top:0;height:40px;z-index:3;background:var(--fg);-webkit-mask-image:url("data:image/svg+xml,${sprocket}");mask-image:url("data:image/svg+xml,${sprocket}");-webkit-mask-size:46px 34px;mask-size:46px 34px;-webkit-mask-position:0 3px;mask-position:0 3px;animation:kfilm .9s steps(5) infinite}
@keyframes kfilm{to{-webkit-mask-position:-46px 3px;mask-position:-46px 3px}}
.khd{position:relative;z-index:3;display:flex;align-items:center;justify-content:space-between;height:78px;margin-top:40px;font-weight:700;font-size:22px;letter-spacing:.16em;text-transform:uppercase}
.khd .brand{display:flex;align-items:center;gap:12px}
.khd .brand i{width:20px;height:20px;border-radius:50%;border:4px solid var(--fg);position:relative}
.khd .brand i::after{content:"";position:absolute;inset:3px;border-radius:50%;background:var(--ac)}
.khd .fr{display:flex;gap:14px;align-items:baseline}.khd .fr b{font-family:"Fraunces",serif;font-size:36px;letter-spacing:0;font-weight:700}
.km{position:relative;z-index:2;flex:1;min-height:0;display:flex;flex-direction:column;gap:28px;padding-top:26px}
.km.k-steps,.km.k-compare,.km.k-stat,.km.k-cta,.km.k-chat,.km.k-hook,.km.k-note{justify-content:center;gap:44px;padding-top:0;padding-bottom:30px}
.kft{position:relative;z-index:3;display:flex;justify-content:space-between;align-items:center;height:92px;font-weight:700;font-size:25px;letter-spacing:.06em}
.kft .rec{display:inline-flex;align-items:center;gap:14px}
.kft .rec i{width:18px;height:18px;border-radius:50%;background:var(--ac);animation:kblink 1s steps(1) infinite}
@keyframes kblink{50%{opacity:0}}
.kft .sw{display:inline-flex;align-items:center;gap:10px;padding:12px 22px;border:3px solid var(--fg);border-radius:10px;box-shadow:5px 5px 0 var(--sh);text-transform:uppercase;font-size:21px;letter-spacing:.14em}
.kft .sw svg{animation:knudge .8s steps(2) infinite}
@keyframes knudge{50%{transform:translateX(7px)}}

/* ---- type ---- */
.kh{font-family:"Fraunces",Georgia,serif;font-weight:700;font-size:100px;line-height:.98;letter-spacing:-.028em}
.kh.xl{font-size:122px;line-height:.94}.kh.m{font-size:84px;line-height:1}
.ln{display:block;position:relative;overflow:hidden;padding:0 .12em .22em 0;margin:0 -.12em -.12em 0}
.ln:nth-child(1){z-index:6}.ln:nth-child(2){z-index:5}.ln:nth-child(3){z-index:4}.ln:nth-child(4){z-index:3}
.li{display:block;animation:kup .85s cubic-bezier(.2,.9,.2,1) both;animation-delay:calc(var(--s,0s) + var(--d,0s))}
@keyframes kup{from{transform:translateY(112%) rotate(3deg)}to{transform:none}}
.kh em{position:relative;z-index:0;font-style:italic;font-weight:900;color:var(--em);padding:0 .06em;white-space:nowrap}
.kh em::before{content:"";position:absolute;z-index:-1;left:0;right:0;bottom:.02em;top:.1em;background:var(--mark);transform-origin:left;animation:kmark .55s steps(7,end) both;animation-delay:calc(var(--s,0s) + var(--d,0s) + .75s)}
@keyframes kmark{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.kb{font-size:35px;line-height:1.42;font-weight:500;color:var(--mute);max-width:880px;animation:kfade .6s steps(6,end) both;animation-delay:calc(var(--s,0s) + var(--d,.3s))}
@keyframes kfade{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}

/* ---- rubber stamp label ---- */
.kstamp{align-self:flex-start;display:inline-flex;align-items:center;gap:12px;padding:10px 22px;border:4px solid var(--ac);color:var(--ac);border-radius:10px;font-weight:700;font-size:25px;letter-spacing:.18em;text-transform:uppercase;transform:rotate(-2.2deg);animation:kstamp .5s cubic-bezier(.3,1.6,.5,1) both,kjit 1s steps(1) infinite;animation-delay:calc(var(--s,0s) + var(--d,0s)),calc(var(--s,0s) + var(--d,0s) + .5s)}
@keyframes kstamp{0%{opacity:0;transform:scale(2.6) rotate(-9deg)}60%{opacity:1}100%{opacity:1;transform:scale(1) rotate(-2.2deg)}}
@keyframes kjit{0%{transform:rotate(-2.2deg) translate(0,0)}34%{transform:rotate(-1.4deg) translate(1px,-1px)}67%{transform:rotate(-2.8deg) translate(-1px,1px)}}

/* ---- mockups become taped-down prints (stop-motion paste) ---- */
.kslide .stage{margin:0 -40px;padding:0 40px}
.kslide .stage::before,.kslide .stage::after{display:none}
.kslide .stage .paper{animation:kpaste .72s steps(6,end) both;animation-delay:calc(var(--s0,0s) + var(--d,0s))}
.kslide .stage[data-in] .paper{animation-name:kpaste;animation-duration:.72s;animation-timing-function:steps(6,end)}
@keyframes kpaste{0%{opacity:0;transform:translateY(90px) scale(1.14) rotate(5deg)}30%{opacity:1}100%{opacity:1;transform:rotate(-1.1deg)}}
.kslide .stage .mock{outline:16px solid #fffaf0;box-shadow:0 0 0 19px #14110f,26px 28px 0 19px var(--sh);border-radius:6px}

/* ---- sticker note under a mockup ---- */
.knote{align-self:center;padding:18px 34px;background:var(--card);border:4px solid var(--fg);border-radius:12px;box-shadow:8px 8px 0 var(--sh);font-weight:700;font-size:29px;line-height:1.3;text-align:center;max-width:880px;transform:rotate(-1.2deg);animation:kstamp2 .5s steps(5,end) both;animation-delay:calc(var(--s,0s) + var(--d,.7s))}
.knote em{font-style:normal;background:var(--mark);color:var(--em);padding:0 .25em}
@keyframes kstamp2{from{opacity:0;transform:scale(1.3) rotate(-4deg)}to{opacity:1;transform:rotate(-1.2deg)}}

/* ---- steps: ticket rows ---- */
.ksteps{display:grid;gap:20px;margin-top:6px}
.kstep{display:flex;align-items:center;gap:30px;padding:32px 36px;background:var(--card);border:4px solid var(--fg);border-radius:14px;box-shadow:9px 9px 0 var(--sh);font-size:40px;font-weight:700;line-height:1.2;animation:kwipe .6s steps(7,end) both;animation-delay:calc(var(--s,0s) + var(--d,0s))}
.kstep:nth-child(even){transform:translateX(18px)}
@keyframes kwipe{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 -30px -30px -10px)}}
.kstep .no{flex:none;display:grid;place-items:center;width:92px;height:92px;border-radius:50%;background:var(--fg);color:var(--bg);font-family:"Fraunces",serif;font-size:54px;font-weight:700}
.ksteps.many .kstep{padding:15px 26px;font-size:30px}.ksteps.many .kstep .no{width:62px;height:62px;font-size:36px}

/* ---- stat ---- */
.kstat{position:relative;display:grid;justify-items:start;gap:10px;margin-top:4px}
.kstat .num{font-family:"Fraunces",serif;font-weight:900;font-style:italic;font-size:330px;line-height:.86;letter-spacing:-.05em;color:var(--em);-webkit-text-stroke:0;background:var(--mark);padding:0 .08em;animation:kslam .6s cubic-bezier(.3,1.5,.5,1) both;animation-delay:calc(var(--s,0s) + var(--d,.3s));box-shadow:14px 14px 0 var(--sh)}
@keyframes kslam{from{opacity:0;transform:scale(1.5) rotate(-4deg)}to{opacity:1;transform:rotate(-1deg)}}
.kstat .lab{font-weight:700;font-size:38px;line-height:1.25;max-width:860px;animation:kfade .6s steps(6,end) both;animation-delay:calc(var(--s,0s) + var(--d,.3s) + .9s)}
.kmq{position:relative;margin:10px -120px 0;width:calc(100% + 240px);overflow:hidden;background:var(--fg);color:var(--bg);transform:rotate(-2.6deg);padding:16px 0;border-block:4px solid var(--fg)}
.kmq div{display:flex;width:max-content;font-weight:700;font-size:30px;letter-spacing:.14em;text-transform:uppercase;white-space:nowrap;animation:kmq 9s linear infinite}
.kmq span{padding:0 26px}.kmq span:nth-child(odd){color:var(--mark)}
@keyframes kmq{to{transform:translateX(-50%)}}

/* ---- compare ---- */
.kcmp{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:6px;align-items:stretch}
.kvs{position:absolute;left:50%;top:50%;z-index:4;width:104px;height:104px;margin:-52px 0 0 -52px;display:grid;place-items:center;border-radius:50%;background:var(--fg);color:var(--bg);border:5px solid var(--bg);font-family:"Fraunces",serif;font-weight:900;font-style:italic;font-size:44px;animation:kslam .5s cubic-bezier(.3,1.5,.5,1) both;animation-delay:calc(var(--s,0s) + 1.0s)}
.kcol{padding:40px 30px 44px;border:4px solid var(--fg);border-radius:14px;background:var(--card);box-shadow:9px 9px 0 var(--sh)}
.kcol.bad{transform:rotate(-1.6deg);background:transparent;box-shadow:none;border-style:dashed;animation:kfade .6s steps(6,end) both;animation-delay:calc(var(--s,0s) + .3s)}
.kcol.good{transform:rotate(1.2deg);background:var(--mark);color:var(--em);animation:kpaste2 .6s steps(6,end) both;animation-delay:calc(var(--s,0s) + 1.1s)}
@keyframes kpaste2{from{opacity:0;transform:translateY(60px) scale(1.1) rotate(6deg)}to{opacity:1;transform:rotate(1.2deg)}}
.kcol h4{font-weight:700;font-size:23px;letter-spacing:.16em;text-transform:uppercase;margin-bottom:18px}
.kcol ul{list-style:none;display:grid;gap:30px}
.kcol li{display:flex;gap:14px;font-size:36px;font-weight:700;line-height:1.18;position:relative}
.kcol li svg{flex:none;margin-top:2px}
.kcol.bad li span.t{opacity:.85;background:linear-gradient(var(--ac),var(--ac)) 0 56%/0% 6px no-repeat;animation:kstrike .5s steps(5,end) forwards;animation-delay:calc(var(--s,0s) + 1.0s + var(--i,0)*.12s)}
@keyframes kstrike{to{background-size:100% 6px}}
.kcol.good li{animation:kfade .5s steps(5,end) both;animation-delay:calc(var(--s,0s) + 1.5s + var(--i,0)*.16s)}

/* ---- cta ---- */
.kbtn{display:inline-flex;align-items:center;gap:18px;padding:30px 52px;background:var(--fg);color:var(--bg);border:4px solid var(--fg);border-radius:14px;font-weight:700;font-size:38px;letter-spacing:.04em;text-transform:uppercase;box-shadow:12px 12px 0 var(--ac);animation:kpress 1.6s steps(1) infinite}
@keyframes kpress{0%{transform:none;box-shadow:12px 12px 0 var(--ac)}60%{transform:translate(8px,8px);box-shadow:4px 4px 0 var(--ac)}80%{transform:none;box-shadow:12px 12px 0 var(--ac)}}
.kurl{font-family:"Fraunces",serif;font-size:46px;font-weight:700;margin-top:26px}

/* ---- hook / chat / note ---- */
.kemo{align-self:flex-end;font-size:230px;line-height:1;margin:-30px 10px -20px 0;animation:kslam .6s cubic-bezier(.3,1.5,.5,1) both,kjit2 .8s steps(1) infinite;animation-delay:calc(var(--s,0s) + var(--d,.6s)),calc(var(--s,0s) + var(--d,.6s) + .6s)}
@keyframes kjit2{0%{transform:rotate(-1deg)}33%{transform:rotate(3deg) translateY(-4px)}66%{transform:rotate(-4deg)}}
.kchat{display:grid;gap:18px;padding:26px;background:var(--card);border:4px solid var(--fg);border-radius:16px;box-shadow:10px 10px 0 var(--sh)}
.kchat .bub{max-width:78%;padding:18px 26px;font-size:32px;line-height:1.3;font-weight:600;border:4px solid var(--fg);border-radius:18px;animation:kfade .4s steps(4,end) both;animation-delay:calc(var(--s,0s) + var(--d,0s))}
.kchat .them{justify-self:start;background:#fffaf0;color:#14110f;border-bottom-left-radius:4px}
.kchat .us{justify-self:end;background:var(--ac);color:#fffaf0;border-bottom-right-radius:4px}
.kchat .top{display:flex;gap:14px;align-items:center;font-size:25px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding-bottom:12px;border-bottom:4px dashed var(--fg)}
.knotes{display:grid;gap:18px}
.ksticky{display:flex;align-items:center;gap:22px;padding:22px 28px;border:4px solid #14110f;color:#14110f;border-radius:6px;font-size:33px;font-weight:700;line-height:1.2;box-shadow:8px 8px 0 var(--sh);transform:rotate(var(--r,0deg));animation:kpaste2 .55s steps(6,end) both;animation-delay:calc(var(--s,0s) + var(--d,0s))}
.ksticky .tk{flex:none;display:grid;place-items:center;width:54px;height:54px;border-radius:50%;background:#14110f;color:#fffaf0}

/* ---- cover badge (rotating text sticker) ---- */
.kbadge{position:absolute;right:50px;top:650px;width:236px;height:236px;z-index:5;animation:kslam .6s cubic-bezier(.3,1.5,.5,1) both;animation-delay:calc(var(--s,0s) + 1s)}
.kbadge svg{width:100%;height:100%;animation:kspin 10s steps(40) infinite}
@keyframes kspin{to{transform:rotate(360deg)}}
.kbadge .core{position:absolute;inset:0;display:grid;place-items:center}
.kbadge .core i{width:92px;height:92px;border-radius:50%;background:var(--ac);border:5px solid var(--fg);box-shadow:5px 5px 0 var(--fg)}
.kbadge .core i::after{content:"";display:block;margin:20px;width:42px;height:42px;border-radius:50%;background:var(--bg);border:5px solid var(--fg)}

/* ---- reel ---- */
.stagebox.reel .kslide{padding:0 80px}
.stagebox.reel .km{padding-top:90px;padding-bottom:250px;gap:36px}
.stagebox.reel .khd{margin-top:96px}
.stagebox.reel .kft{display:none} /* Instagram covers the bottom of a reel with its own UI */
.stagebox.reel .km.k-hook{justify-content:center}
.stagebox.reel .kh{font-size:118px}.stagebox.reel .kh.xl{font-size:138px}.stagebox.reel .kh.m{font-size:96px}
.stagebox.reel .kb{font-size:40px}
.stagebox.reel .kstat .num{font-size:380px}
.kflash{position:absolute;inset:0;z-index:50;background:#fffaf0;opacity:0;pointer-events:none;animation:kflash .34s steps(4) both;animation-delay:calc(var(--t,0s) - .1s)}
@keyframes kflash{0%{opacity:0}30%{opacity:.96}100%{opacity:0}}
.kscene{animation:ksIn .001s both,ksOut .001s forwards;animation-delay:var(--in,0s),var(--out,1000s)}
@keyframes ksIn{from{opacity:0;visibility:hidden}to{opacity:1;visibility:visible}}
@keyframes ksOut{to{opacity:0;visibility:hidden}}
`;

function badge(): string {
  const text = "PHOTOBOOTH SAAS ★ STUDIODO ★ ".repeat(1);
  return `<div class="kbadge"><svg viewBox="0 0 240 240"><defs><path id="kc" d="M120 120m-92 0a92 92 0 1 1 184 0a92 92 0 1 1-184 0"/></defs><circle cx="120" cy="120" r="116" fill="var(--mark)" stroke="var(--fg)" stroke-width="5"/><text font-family="Space Grotesk" font-weight="700" font-size="22" letter-spacing="3.4" fill="var(--em)"><textPath href="#kc">${text}</textPath></text></svg><div class="core"><i></i></div></div>`;
}

const kstage = (s: Slide, reel: boolean, d = 0.5) => stage(s, reel, d).replace('class="stage"', 'class="stage t-light"');
const knote = (s: Slide) => (s.note ? `<div class="knote" ${D(0.9)}>${em(s.note)}</div>` : "");
const kstamp = (s: Slide, d = 0) => (s.eyebrow ? `<div class="kstamp" ${D(d)}>${esc(s.eyebrow)}</div>` : "");
const kbody = (s: Slide, d = 0.45) => (s.body ? `<p class="kb" ${D(d)}>${esc(s.body)}</p>` : "");
const sizeCls = (s: Slide) => (s.title.replace(/[|*]/g, "").length > 38 ? "m" : "");

function inner(s: Slide, deck: Deck, reel: boolean): string {
  switch (s.kind) {
    case "cover":
      return `${kstamp(s)}<h1 class="kh xl">${lines(s.title, 0.2)}</h1>${kbody(s, 0.8)}${kstage(s, reel, 1.1)}`;
    case "feature":
      return `${kstamp(s)}<h1 class="kh ${sizeCls(s)}">${lines(s.title, 0.15)}</h1>${kbody(s, 0.7)}${kstage(s, reel, 1)}${knote(s)}`;
    case "steps": {
      const items = s.items ?? [];
      return `${kstamp(s)}<h1 class="kh m">${lines(s.title, 0.15)}</h1><div class="ksteps${items.length > 4 ? " many" : ""}">${items.map((it, i) =>
        `<div class="kstep" ${D(0.7 + i * 0.3)}><span class="no">${i + 1}</span><span>${em(it)}</span></div>`).join("")}</div>${kbody(s, 0.7 + items.length * 0.3)}${kstage(s, reel, 1.3)}`;
    }
    case "stat": {
      const st = s.stat ?? { value: 0, label: "" };
      const tick = `<span>${esc(st.label)}</span><span>★</span>`.repeat(6);
      return `${kstamp(s)}<h1 class="kh m">${lines(s.title, 0.15)}</h1><div class="kstat"><div class="num" ${D(0.5)}>${esc(st.prefix ?? "")}<span class="count" style="--to:${Math.round(st.value)};--d:.8s"></span>${esc(st.suffix ?? "")}</div><div class="lab">${esc(st.label)}</div></div>
        <div class="kmq"><div>${tick}${tick}</div></div>${kbody(s, 2)}${knote(s)}`;
    }
    case "compare": {
      const bad = (s.itemsBefore ?? []).map((t, i) => `<li style="--i:${i}"><span>${icon("x", 30, 3.6, "var(--ac)")}</span><span class="t">${esc(t)}</span></li>`).join("");
      const good = (s.items ?? []).map((t, i) => `<li style="--i:${i}"><span>${icon("check", 30, 3.8)}</span><span>${esc(t)}</span></li>`).join("");
      return `${kstamp(s)}<h1 class="kh m">${lines(s.title, 0.15)}</h1><div class="kcmp"><div class="kvs">VS</div><div class="kcol bad"><h4>${esc(s.labelBefore || "Tanpa sistem")}</h4><ul>${bad}</ul></div><div class="kcol good"><h4>${esc(s.labelAfter || "Dengan STUDIODO")}</h4><ul>${good}</ul></div></div>${knote(s)}`;
    }
    case "hook": {
      const emo = s.emoji ? `<div class="kemo" ${D(0.9)}>${esc(s.emoji)}</div>` : "";
      return `${kstamp(s)}<h1 class="kh xl">${lines(s.title, 0.2)}</h1>${kbody(s, 0.8)}${emo}${kstage(s, reel, 1.2)}${knote(s)}`;
    }
    case "chat": {
      const msgs = (s.chat ?? []).map((m, i) => `<div class="bub ${m.from === "us" ? "us" : "them"}" ${D(0.7 + i * 0.85)}>${esc(m.text)}</div>`).join("");
      return `${kstamp(s)}${s.title ? `<h1 class="kh m">${lines(s.title, 0.15)}</h1>` : ""}<div class="kchat"><div class="top"><span class="rec"></span>STUDIODO · online</div>${msgs}</div>${knote(s)}`;
    }
    case "note": {
      const cols = ["#ffd23f", "#ff9ec0", "#fffaf0", "#b9c4ff", "#ffb48f"];
      const rots = [-1.6, 1.2, -0.8, 1.6, -1.1];
      const list = (s.items ?? []).map((it, i) => `<div class="ksticky" style="--r:${rots[i % 5]}deg;background:${cols[i % 5]};--d:${(0.7 + i * 0.28).toFixed(2)}s"><span class="tk">${icon("check", 30, 3.8)}</span><span>${em(it)}</span></div>`).join("");
      return `${kstamp(s)}<h1 class="kh m">${lines(s.title, 0.15)}</h1><div class="knotes">${list}</div>${kbody(s, 1.8)}${kstage(s, reel, 1.6)}${knote(s)}`;
    }
    case "cta":
      return `${kstamp(s)}<h1 class="kh xl">${lines(s.title, 0.2)}</h1>${kbody(s, 0.8)}${kstage(s, reel, 1.1)}
        <div class="kfade" style="margin-top:14px;animation:kfade .6s steps(6,end) both;animation-delay:calc(var(--s,0s) + 1.1s)"><div class="kbtn">${esc(deck.handle === "studiodo.id" ? "Coba gratis" : "Coba gratis")}${icon("arrow", 38, 3.2)}</div><div class="kurl">studiodo.id</div></div>`;
    case "badge":
      return "";
  }
}

function contactSlide(s: Slide, deck: Deck, ctx: { index: number; total: number; startSec?: number; sceneEnd?: number; reel: boolean }): string {
  const tone: Tone = s.tone ?? deck.tone;
  const last = ctx.index === ctx.total - 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  const bg = s.bgImage ? `<div class="bgimg" style="background-image:url('${esc(s.bgImage)}');position:absolute;inset:0;background-size:cover;background-position:center;opacity:.28;z-index:0"></div>` : "";
  const swipe = ctx.reel || last ? "" : `<span class="sw">Geser ${icon("arrow", 22, 3.4)}</span>`;
  const cls = `kslide kt-${tone}${ctx.reel ? " kscene" : ""}`;
  const timing = ctx.reel ? `--in:${(ctx.startSec ?? 0).toFixed(2)}s;--out:${ctx.sceneEnd?.toFixed(2) ?? "1000"}s;` : "";
  return `<section class="${cls}" style="--s0:${ctx.startSec ?? 0}s;${timing}">
    ${bg}<div class="kdots"></div><div class="kfilm"></div>
    <div class="khd"><span class="brand"><i></i>STUDIODO · Photobooth SaaS</span><span class="fr">${ctx.reel ? "REEL" : "FRAME"} <b>${pad(ctx.index + 1)}</b>/${pad(ctx.total)}</span></div>
    <div class="km k-${s.kind}">${inner(s, deck, ctx.reel)}</div>
    ${s.kind === "cover" && !ctx.reel ? badge() : ""}
    <div class="kft"><span class="rec"><i></i>@${esc(deck.handle)}</span>${swipe}</div>
  </section>`;
}

function doc(deck: Deck, body: string): string {
  const { width, height } = FORMATS[deck.format];
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="only light"><style>${fontFaces()}${contactFonts()}${BASE_CSS}${CONTACT_CSS}</style></head>
<body><div class="stagebox ${deck.format}" style="--W:${width}px;--H:${height}px">${body}</div><script>${FIT_SCRIPT}</script></body></html>`;
}

export function buildContactSlideDoc(deck: Deck, index: number): string {
  return doc(deck, contactSlide(deck.slides[index], deck, { index, total: deck.slides.length, reel: deck.format === "reel" }));
}

export function buildContactReelDoc(deck: Deck): { html: string; durationSec: number } {
  let t = 0;
  const flashes: string[] = [];
  const scenes = deck.slides.map((s, i) => {
    const len = Math.max(1.8, s.seconds ?? 3.4);
    const html = contactSlide(s, deck, { index: i, total: deck.slides.length, reel: true, startSec: t, sceneEnd: t + len });
    if (i > 0) flashes.push(`<div class="kflash" style="--t:${t.toFixed(2)}s"></div>`);
    t += len;
    return html;
  });
  return { html: doc(deck, scenes.join("") + flashes.join("")), durationSec: t + 0.8 };
}
