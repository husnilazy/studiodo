import { readFileSync } from "node:fs";
import path from "node:path";

// Design tokens mirror studiodo-web (globals.css): indigo accent, Sora display + Plus Jakarta Sans body, pastel blobs,
// glass cards, black pill buttons. Everything is animation-driven (CSS only) so a renderer can seek to any time.

const assetsDir = path.join(process.cwd(), "server", "assets");
let fontCss: string | null = null;

/** @font-face rules with the font files inlined, so renders never depend on the network. */
export function fontFaces(): string {
  if (fontCss) return fontCss;
  const faces: [string, number, string][] = [
    ["Sora", 300, "Sora-300"], ["Sora", 400, "Sora-400"], ["Sora", 600, "Sora-600"], ["Sora", 700, "Sora-700"],
    ["Plus Jakarta Sans", 400, "PlusJakartaSans-400"], ["Plus Jakarta Sans", 500, "PlusJakartaSans-500"],
    ["Plus Jakarta Sans", 600, "PlusJakartaSans-600"], ["Plus Jakarta Sans", 700, "PlusJakartaSans-700"],
  ];
  fontCss = faces
    .map(([family, weight, file]) => {
      const b64 = readFileSync(path.join(assetsDir, "fonts", `${file}.ttf`)).toString("base64");
      return `@font-face{font-family:"${family}";font-weight:${weight};font-style:normal;src:url(data:font/ttf;base64,${b64}) format("truetype");}`;
    })
    .join("\n");
  return fontCss;
}

const logoCache = new Map<string, string>();
export function wordmark(variant: "ink" | "white"): string {
  const hit = logoCache.get(variant);
  if (hit) return hit;
  const uri = `data:image/png;base64,${readFileSync(path.join(assetsDir, `studiodo-wordmark-${variant}.png`)).toString("base64")}`;
  logoCache.set(variant, uri);
  return uri;
}

export const BASE_CSS = `
:root{color-scheme:only light}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#000;overflow:hidden}
@property --n{syntax:"<integer>";initial-value:0;inherits:false}
:root{--k:1}
.stagebox{position:relative;width:var(--W);height:var(--H);overflow:hidden;font-family:"Plus Jakarta Sans",system-ui,sans-serif}

/* ---- tones ---- */
.t-light{--bg:#fafafd;--fg:#0b1020;--muted:#5b6478;--accent:#4f4fe8;--accent2:#9aa6ff;--card:rgba(255,255,255,.72);--cb:rgba(255,255,255,.95);--shadow:0 24px 70px rgba(60,70,140,.16);--ink:#0b1020;--onink:#fff;--c1:#c7ceff;--c2:#ffd3e4;--c3:#b8f0e6;--soft:rgba(11,16,32,.06);--pop:#4f4fe8;--logo:ink}
.t-dark{--bg:#0a0d18;--fg:#f1f2ff;--muted:#a3abc6;--accent:#8a8aff;--accent2:#5b5bd6;--card:rgba(255,255,255,.07);--cb:rgba(255,255,255,.16);--shadow:0 30px 80px rgba(0,0,0,.55);--ink:#f1f2ff;--onink:#0a0d18;--c1:#4f4fe8;--c2:#7a4fd0;--c3:#d8679e;--soft:rgba(255,255,255,.07);--pop:#9a96ff;--tick:#6a67ff;--logo:white}
.t-indigo{--bg:#4a46e0;--fg:#fff;--muted:rgba(255,255,255,.78);--accent:#ffffff;--accent2:#c9ccff;--card:rgba(255,255,255,.16);--cb:rgba(255,255,255,.34);--shadow:0 30px 80px rgba(20,18,110,.4);--ink:#fff;--onink:#2c2aa0;--c1:#8a8aff;--c2:#b78bff;--c3:#ffc2dc;--soft:rgba(255,255,255,.14);--pop:#ffd3e4;--tick:#4a46e0;--logo:white}
.t-mint{--bg:#e8f9f4;--fg:#0b1020;--muted:#44566a;--accent:#4f4fe8;--accent2:#9aa6ff;--card:rgba(255,255,255,.7);--cb:rgba(255,255,255,.95);--shadow:0 24px 70px rgba(30,110,100,.18);--ink:#0b1020;--onink:#fff;--c1:#b8f0e6;--c2:#c7ceff;--c3:#ffe3b8;--soft:rgba(11,16,32,.06);--pop:#4f4fe8;--logo:ink}

.slide{position:absolute;inset:0;display:flex;flex-direction:column;padding:84px 84px 72px;color:var(--fg);background:var(--bg);overflow:hidden}
.t-indigo.slide{background:linear-gradient(160deg,#5b57f0 0%,#4a46e0 45%,#3a37c4 100%)}
.t-mint.slide{background:linear-gradient(160deg,#eafcf6 0%,#dfe6ff 100%)}
.t-dark.slide{background:radial-gradient(120% 70% at 50% 0%,#17163f 0%,#0a0d18 60%)}

/* ---- gradient mesh (no blur filter: cheap to render, still soft) ---- */
.mesh{position:absolute;inset:0;pointer-events:none;z-index:0;overflow:hidden}
.mesh i{position:absolute;border-radius:50%;animation:drift 9s ease-in-out infinite}
.mesh i:nth-child(1){width:1100px;height:1100px;left:-380px;top:-300px;background:radial-gradient(circle,var(--c1) 0%,transparent 66%);opacity:.8}
.mesh i:nth-child(2){width:980px;height:980px;right:-420px;top:320px;background:radial-gradient(circle,var(--c2) 0%,transparent 66%);opacity:.75;animation-delay:-3s;animation-direction:reverse}
.mesh i:nth-child(3){width:1000px;height:1000px;left:-260px;bottom:-520px;background:radial-gradient(circle,var(--c3) 0%,transparent 66%);opacity:.7;animation-delay:-6s}
.t-dark .mesh i{opacity:.55}.t-indigo .mesh i{opacity:.6}
@keyframes drift{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(70px,50px) scale(1.12)}}

.hd,.main,.ft{position:relative;z-index:2}
.hd{display:flex;align-items:center;justify-content:space-between;height:64px}
.hd img{height:46px;width:auto;display:block}
.pager{font-family:"Sora";font-weight:600;font-size:24px;color:var(--muted);letter-spacing:.06em}
.main{flex:1;min-height:0;display:flex;flex-direction:column;gap:30px;padding-top:44px}
.ft{display:flex;justify-content:space-between;align-items:center;height:70px;margin-top:20px}

/* ---- type ---- */
.eyebrow{display:inline-flex;align-items:center;gap:14px;align-self:flex-start;padding:12px 26px;border-radius:999px;font-weight:600;font-size:24px;letter-spacing:.02em;color:var(--muted);background:var(--card);border:1px solid var(--cb);box-shadow:var(--shadow)}
.eyebrow .dot{position:relative;width:12px;height:12px;border-radius:50%;background:var(--pop)}
.eyebrow .dot::after{content:"";position:absolute;inset:0;border-radius:50%;background:var(--pop);animation:ping 1.8s ease-out infinite}
@keyframes ping{0%{transform:scale(1);opacity:.7}100%{transform:scale(3.2);opacity:0}}
h1{font-family:"Sora",sans-serif;font-weight:400;letter-spacing:-.035em;line-height:1.06;font-size:84px}
h1.xl{font-size:92px;line-height:1.02}
h1.m{font-size:70px}
h1 b{font-weight:700;background:linear-gradient(100deg,var(--accent) 20%,var(--accent2) 50%,var(--accent) 80%);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:shimmer 4s linear infinite}
.t-indigo h1 b{background:linear-gradient(100deg,#fff 20%,#c9ccff 50%,#fff 80%);background-size:200% 100%;-webkit-background-clip:text;background-clip:text}
.t-dark h1 b{background:linear-gradient(100deg,#8a8aff 10%,#ffc2dc 50%,#8a8aff 90%);background-size:200% 100%;-webkit-background-clip:text;background-clip:text}
@keyframes shimmer{to{background-position:-200% 0}}
p.body{font-size:34px;line-height:1.5;color:var(--muted);max-width:900px}
.pill{align-self:center;padding:22px 40px;border-radius:999px;background:var(--card);border:1px solid var(--cb);box-shadow:var(--shadow);font-size:29px;font-weight:600;line-height:1.35;text-align:center;max-width:880px}
.btn{display:inline-flex;align-items:center;gap:16px;padding:28px 54px;border-radius:999px;background:var(--ink);color:var(--onink);font-weight:700;font-size:34px;box-shadow:0 18px 40px rgba(11,16,32,.28)}
.handle{font-weight:600;font-size:26px;color:var(--muted)}
.swipe{display:inline-flex;align-items:center;gap:12px;padding:16px 30px;border-radius:999px;background:var(--ink);color:var(--onink);font-weight:700;font-size:24px}
.swipe svg{animation:nudge 1.4s ease-in-out infinite}
@keyframes nudge{0%,100%{transform:translateX(0)}50%{transform:translateX(8px)}}

/* ---- motion helpers (delay = scene start + local delay, so reels and slides share one timeline) ---- */
.in{animation:rise .85s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--s,0s) + var(--d,0s))}
.pop{animation:pop .7s cubic-bezier(.3,1.5,.5,1) both;animation-delay:calc(var(--s,0s) + var(--d,0s))}
.grow{transform-origin:bottom;animation:grow 1s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--s,0s) + var(--d,0s))}
.sl{animation:slideL .8s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--s,0s) + var(--d,0s))}
.float{animation:floatY 5s ease-in-out infinite}
@keyframes rise{from{opacity:0;transform:translateY(46px)}to{opacity:1;transform:none}}
@keyframes pop{from{opacity:0;transform:scale(.55)}to{opacity:1;transform:none}}
@keyframes grow{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes slideL{from{opacity:0;transform:translateX(90px)}to{opacity:1;transform:none}}
@keyframes floatY{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
.count{counter-reset:n var(--n);animation:cnt 1.8s cubic-bezier(.2,.7,.2,1) both;animation-delay:calc(var(--s,0s) + var(--d,0s))}
.count::after{content:counter(n)}
@keyframes cnt{from{--n:0}to{--n:var(--to)}}

/* ---- glass + mockups ---- */
.glass{background:var(--card);border:1px solid var(--cb);box-shadow:var(--shadow);border-radius:36px}
.stage{position:relative;flex:1;min-height:0;display:flex;align-items:center;justify-content:center;margin:0 -50px;padding:0 50px 0}
.mock{transform:scale(var(--k,1));transform-origin:center}
.win{width:900px;border-radius:34px;background:var(--card);border:1px solid var(--cb);box-shadow:var(--shadow);overflow:hidden}
.t-light .win,.t-mint .win{background:#fff}
.win .bar{height:58px;display:flex;align-items:center;gap:10px;padding:0 24px;background:var(--soft)}
.win .bar i{width:14px;height:14px;border-radius:50%;background:#ff6b6b}.win .bar i:nth-child(2){background:#ffc14d}.win .bar i:nth-child(3){background:#42d392}
.win .bar span{margin-left:18px;font-size:19px;font-weight:600;color:var(--muted)}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;padding:26px 26px 12px}
.tile{padding:22px 24px;border-radius:24px;background:var(--soft)}
.tile small{display:block;font-size:19px;font-weight:600;color:var(--muted)}
.tile strong{display:block;margin-top:8px;font-family:"Sora";font-size:36px;font-weight:700;letter-spacing:-.03em;color:var(--fg);white-space:nowrap}
.tile em{font-style:normal;font-size:18px;font-weight:700;color:#1faa77}
.chart{display:flex;align-items:flex-end;gap:16px;height:210px;margin:10px 26px 0;padding:22px 24px;border-radius:24px;background:var(--soft)}
.chart i{flex:1;border-radius:12px 12px 4px 4px;background:linear-gradient(180deg,var(--accent2),var(--accent))}
.rows{padding:18px 26px 28px;display:grid;gap:12px}
.row{display:flex;align-items:center;gap:18px;padding:16px 22px;border-radius:20px;background:var(--soft);font-size:22px;font-weight:600;color:var(--fg)}
.row .av{width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,var(--accent),var(--accent2));display:grid;place-items:center;color:#fff}
.row .tag{margin-left:auto;padding:6px 16px;border-radius:999px;font-size:17px;font-weight:700;background:rgba(31,170,119,.16);color:#1faa77}
.row .amt{font-family:"Sora";font-weight:700}
.kiosk{width:560px;border-radius:44px;background:#0b1020;padding:18px;box-shadow:0 40px 90px rgba(11,16,32,.35)}
.kiosk .scr{border-radius:30px;overflow:hidden;background:linear-gradient(170deg,#f2f3ff,#fff);padding:30px 34px;min-height:700px;display:flex;flex-direction:column;align-items:center;gap:22px;color:#0b1020;position:relative}
.kiosk h3{font-family:"Sora";font-size:34px;font-weight:700;letter-spacing:-.03em;text-align:center}
.kiosk .sub{font-size:21px;color:#5b6478;font-weight:600;text-align:center}
.qr{display:grid;grid-template-columns:repeat(21,1fr);gap:0;width:340px;height:340px;padding:18px;background:#fff;border-radius:28px;box-shadow:0 12px 40px rgba(60,70,140,.18)}
.qr i{background:#0b1020}.qr i.o{background:transparent}
.paid{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;background:rgba(255,255,255,.96);border-radius:30px}
.paid .ck{width:150px;height:150px;border-radius:50%;background:#1faa77;display:grid;place-items:center;box-shadow:0 20px 50px rgba(31,170,119,.45)}
.chip{padding:12px 26px;border-radius:999px;background:#eceeff;color:#4f4fe8;font-weight:700;font-size:21px}
.bigbtn{padding:22px 60px;border-radius:999px;background:#0b1020;color:#fff;font-weight:700;font-size:28px}
.phone{width:470px;border-radius:64px;background:#0b1020;padding:16px;box-shadow:0 40px 90px rgba(11,16,32,.38)}
.phone .scr{border-radius:50px;background:linear-gradient(180deg,#f4f5ff,#fff);padding:44px 26px 30px;min-height:800px;color:#0b1020;display:flex;flex-direction:column;gap:20px}
.phone h3{font-family:"Sora";font-size:30px;font-weight:700;text-align:center;letter-spacing:-.03em}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.ph{aspect-ratio:3/4;border-radius:22px;overflow:hidden;position:relative;background-size:cover;background-position:center}
.ph.s::before{content:"";position:absolute;left:50%;top:30%;width:38%;aspect-ratio:1;transform:translateX(-50%);border-radius:50%;background:rgba(255,255,255,.55)}
.ph.s::after{content:"";position:absolute;left:50%;bottom:-8%;width:78%;height:46%;transform:translateX(-50%);border-radius:50% 50% 0 0;background:rgba(255,255,255,.5)}
.dl{display:flex;gap:12px}.dl span{flex:1;text-align:center;padding:16px;border-radius:999px;font-weight:700;font-size:21px;background:#0b1020;color:#fff}.dl span+span{background:#eceeff;color:#4f4fe8}
.strip{width:330px;padding:26px 26px 40px;background:#fff;border-radius:10px;box-shadow:0 30px 70px rgba(11,16,32,.25);display:grid;gap:16px}
.strip .ph{aspect-ratio:4/3;border-radius:6px}
.strip .lb{text-align:center;font-family:"Sora";font-weight:700;font-size:22px;color:#0b1020;letter-spacing:.08em}
.cnt3{position:absolute;inset:0;display:grid;place-items:center;font-family:"Sora";font-weight:700;font-size:240px;color:#fff;text-shadow:0 10px 50px rgba(79,79,232,.7)}
.queue{display:grid;gap:18px;width:760px}
.q{display:flex;align-items:center;gap:26px;padding:26px 34px;border-radius:30px;background:var(--card);border:1px solid var(--cb);box-shadow:var(--shadow);font-size:30px;font-weight:600}
.q b{font-family:"Sora";font-size:46px;letter-spacing:-.03em;min-width:150px}
.q .st{margin-left:auto;padding:10px 22px;border-radius:999px;font-size:21px;font-weight:700;background:var(--soft);color:var(--muted)}
.q.now{background:var(--ink);color:var(--onink)}.q.now .st{background:var(--tick,var(--pop));color:#fff}
.hub{position:relative;width:920px;height:640px}
.hub svg.lines{position:absolute;inset:0;width:100%;height:100%}
.hub .core{position:absolute;left:335px;top:195px;width:250px;height:250px;border-radius:50%;background:linear-gradient(160deg,#6a67ff,#4f4fe8);border:4px solid rgba(255,255,255,.78);display:grid;place-items:center;color:#fff;box-shadow:0 0 80px rgba(138,138,255,.4)}
.hub .core b{font-family:"Sora";font-size:34px;font-weight:700}
.node{position:absolute;display:grid;place-items:center;border-radius:50%;box-shadow:0 14px 36px rgba(20,18,110,.25)}
.node.n1{background:#c7ceff;color:#4f4fe8}.node.n2{background:#ffd3e4;color:#c2417a}.node.n3{background:#b8f0e6;color:#0f766e}.node.n4{background:#ffe3b8;color:#b45309}
.steps{display:grid;gap:22px;flex:1;align-content:space-evenly}
.step{display:flex;align-items:center;gap:28px;padding:38px 40px;border-radius:32px;background:var(--card);border:1px solid var(--cb);box-shadow:var(--shadow);font-size:35px;font-weight:600;line-height:1.3}
.steps.many{gap:14px}.steps.many .step{padding:24px 34px;font-size:31px}.steps.many .step .no{width:64px;height:64px;font-size:30px}
.step .no{flex:none;width:76px;height:76px;border-radius:50%;display:grid;place-items:center;font-family:"Sora";font-weight:700;font-size:34px;background:var(--ink);color:var(--onink)}
.statcard{align-self:stretch;padding:70px 60px;text-align:center;display:grid;gap:18px;justify-items:center}
.statcard .num{font-family:"Sora";font-weight:700;font-size:250px;letter-spacing:-.06em;line-height:1;background:linear-gradient(180deg,var(--accent),var(--accent2));-webkit-background-clip:text;background-clip:text;color:transparent}
.t-dark .statcard .num{background:linear-gradient(180deg,#8a8aff,#ffc2dc);-webkit-background-clip:text;background-clip:text}
.t-indigo .statcard .num{background:linear-gradient(180deg,#fff,#c9ccff);-webkit-background-clip:text;background-clip:text}
.statcard .lab{font-size:38px;font-weight:700}
.cmp{display:grid;grid-template-columns:1fr 1fr;gap:24px;flex:1;min-height:0}
.col{padding:38px 32px;border-radius:36px;display:flex;flex-direction:column;gap:20px}
.col.bad{background:var(--soft);border:1px solid transparent}
.col.good{background:var(--ink);color:var(--onink);box-shadow:0 30px 70px rgba(11,16,32,.3)}
.col h4{font-family:"Sora";font-size:30px;font-weight:700;letter-spacing:-.02em;opacity:.9}
.col ul{flex:1;display:flex;flex-direction:column;justify-content:space-evenly}.col li{list-style:none;display:flex;gap:16px;font-size:33px;line-height:1.3;font-weight:600}
.col li span{flex:none;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font-size:22px;font-weight:700;margin-top:2px}
.bad li span{background:rgba(255,107,107,.18);color:#e5484d}.bad li span.neu{background:var(--soft);color:var(--muted)}.good li span{background:var(--tick,var(--pop));color:#fff}
.main.k-cta{justify-content:center;gap:40px;padding-top:0}.ctawrap{display:flex;flex-direction:column;align-items:flex-start;gap:22px;margin-top:20px}.ctaurl{font-family:"Sora";font-weight:600;font-size:30px;color:var(--muted)}

/* ---- highlight cover (badge slide) ---- */
.bdgrings{position:absolute;inset:0;z-index:1;display:grid;place-items:center}
.bdgrings i{grid-area:1/1;border-radius:50%;border:2px solid var(--accent);opacity:.22}
.bdgmain{position:absolute;inset:0;z-index:2;display:grid;place-items:center}
.bdg{width:520px;height:520px;border-radius:50%;display:grid;place-items:center;color:#fff;background:linear-gradient(150deg,var(--accent),var(--accent2));box-shadow:var(--shadow),inset 0 0 0 10px rgba(255,255,255,.26)}
.t-indigo .bdg{background:rgba(255,255,255,.2);box-shadow:var(--shadow),inset 0 0 0 4px rgba(255,255,255,.62)}
.t-indigo .bdgrings i{border-color:#fff}
.t-dark .bdg{background:linear-gradient(150deg,#6a67ff,#4f4fe8);box-shadow:0 0 90px rgba(138,138,255,.35),inset 0 0 0 8px rgba(255,255,255,.5)}
.has-bg .bdg{background:rgba(255,255,255,.2);box-shadow:var(--shadow),inset 0 0 0 4px rgba(255,255,255,.62)}
/* ---- photo background: dark scrim, light text ---- */
.bgimg{position:absolute;inset:0;background-size:cover;background-position:center;z-index:0}
.scrim{position:absolute;inset:0;z-index:1;background:linear-gradient(180deg,rgba(8,10,22,.78) 0%,rgba(8,10,22,.5) 42%,rgba(8,10,22,.85) 100%)}
.has-bg{--fg:#fff;--muted:rgba(255,255,255,.84);--accent:#c9ccff;--accent2:#fff;--card:rgba(255,255,255,.16);--cb:rgba(255,255,255,.32);--ink:#fff;--onink:#0b1020;--pop:#ffd3e4;--tick:#4f4fe8}
.has-bg .mesh{display:none}
.has-bg .win{background:#fff;--fg:#0b1020;--muted:#5b6478;--soft:rgba(11,16,32,.06);--accent:#4f4fe8;--accent2:#9aa6ff}
/* ---- reel (9:16): bigger type, content centred, mockups scaled up by the fit script ---- */
.reel .slide{padding:150px 84px 170px}
.reel h1{font-size:104px}.reel h1.xl{font-size:124px}.reel h1.m{font-size:96px}
.reel p.body{font-size:42px;max-width:920px}.reel .eyebrow{font-size:28px;padding:14px 30px}
.reel .main{gap:44px}
.reel .main.k-cover,.reel .main.k-cta,.reel .main.k-stat{justify-content:center}
.reel .statcard .num{font-size:300px}.reel .statcard .lab{font-size:46px}
.reel .pill{font-size:34px}.reel .btn{font-size:40px;padding:34px 64px}.reel .handle{font-size:30px}
.reel .hd img{height:56px}
/* ---- reel scene switching ---- */
.scene{position:absolute;inset:0}
@keyframes sceneIn{from{opacity:0}to{opacity:1}}
@keyframes sceneOut{from{opacity:1}to{opacity:0}}
`;
