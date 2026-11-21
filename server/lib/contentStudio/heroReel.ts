import { kacaFonts } from "./styleKaca.js";
import { wordmark } from "./theme.js";
import { placeEd } from "./art4.js";
import { ART_CSS, clock, coins, kiosk, okBadge, phone, qr, sparkle, strip } from "./art.js";
import type { ThemeName } from "./types.js";

// Hero reel "Booth tanpa kasir": one 1080x1920 page whose whole timeline is CSS animation (seekable, so the renderer can step frame
// by frame). Every text and character entrance is timed to the voice over (see TIMES below, measured from the generated audio).
// Illustrations are STUDIODO's own semi-3D characters; the dashboard is a labelled sample UI, not live data.

const THEMES: Record<ThemeName, string> = {
  biru: "--c1:#0b3dff;--c2:#2f9bff;--c3:#59d6ff;--deep:#050b2e",
  ungu: "--c1:#6a1bff;--c2:#b06bff;--c3:#ff9be6;--deep:#120629",
  rose: "--c1:#e8185a;--c2:#ff6b8f;--c3:#ffc2a0;--deep:#2a0716",
  senja: "--c1:#ff5a12;--c2:#ffa23a;--c3:#ffe08a;--deep:#2a1004",
  tosca: "--c1:#0a8f9c;--c2:#2fd0c4;--c3:#b6fff0;--deep:#03201f",
};

/** Seconds where each phrase of the voice over starts (Siti, Eleven v4, take 1, 39.0 s). */
export const TIMES = { sigh: 0, jam: 0.95, antrean: 2.57, customer: 4.26, dan: 6.53, scroll: 7.47, satu1: 9.47, per: 10.35, satu2: 10.99, bayangin: 11.87, scan: 15.24, bayar: 15.98, sesi: 16.68, hitung: 18.5, strip: 21.28, dan2: 25.42, duduk: 26.34, mimpi: 31.23, studiodo: 32.58, mau: 34.0, komen: 35.13, nanti: 37.28, end: 39.0 };
export const HERO_DURATION = 39.4;

const s = (n: number) => `${n.toFixed(2)}s`;
const tx = (html: string, t: number, o: number | null, css = "", cls = "") => `<div class="tx ${cls}" style="--t:${s(t)};${o !== null ? `--o:${s(o)};` : ""}${css}">${html.replace(/\|/g, "<br>")}</div>`;
const sv = (inner: string, css: string, vb = "0 0 800 600") => `<svg class="sv" viewBox="${vb}" style="${css}" aria-hidden="true">${inner}</svg>`;
const em = (h: string) => h.replace(/\*([^*]+)\*/g, "<em>$1</em>");
const scene = (a: number, b: number, inner: string, cls = "") => `<section class="sc ${cls}" style="--in:${s(a)};--out:${s(b)}">${inner}</section>`;
const sweep = (t: number) => `<div class="sweep" style="--t:${s(t)}"></div>`;
const shadow = (_cx: number, _cy: number, _rx: number) => "";

function mutasi(x: number, y: number, sc: number): string {
  const rows = Array.from({ length: 12 }, (_, i) => `<rect x="-30" y="${-62 + i * 22}" width="60" height="16" rx="5" style="fill:${i % 3 === 0 ? "#ffb3c1" : "#e3e6f4"}"/><rect x="-24" y="${-58 + i * 22}" width="${22 + ((i * 17) % 22)}" height="4" rx="2" style="fill:#12162b;opacity:.7"/>`).join("");
  return `<g transform="translate(${x} ${y}) scale(${sc})"><defs><clipPath id="cm"><rect x="-37" y="-76" width="74" height="152" rx="10"/></clipPath></defs>
    <rect x="-44" y="-84" width="88" height="168" rx="16" style="fill:#12162b"/><rect x="-37" y="-76" width="74" height="152" rx="10" style="fill:#fff"/>
    <g clip-path="url(#cm)"><g class="scrollrows">${rows}${rows}</g></g></g>`;
}
const cup = (x: number, y: number, sc: number, d: number) => `<g transform="translate(${x} ${y}) scale(${sc})"><g class="a-pop" style="--d:${d}s;transform-box:fill-box;transform-origin:50% 100%"><path d="M-34 -30 H34 L26 40 Q0 52 -26 40Z" style="fill:#fff"/><path d="M34 -16 q26 0 22 22 q-4 18 -30 18" style="fill:none;stroke:#fff;stroke-width:9;stroke-linecap:round"/><rect x="-30" y="-14" width="60" height="26" style="fill:var(--c2);opacity:.85"/><path d="M-10 -52 q-8 -12 0 -24 M10 -52 q-8 -12 0 -24" style="fill:none;stroke:#fff;stroke-width:5;stroke-linecap:round;opacity:.7" class="a-blink"/></g></g>`;
// Editorial full-body characters (art4.ts), modelled on the user's Pinterest reference. Placed by head centre like the older kits.
type PO = { x: number; y: number; s?: number; expr: Parameters<typeof placeEd>[0]["expr"]; pose?: Parameters<typeof placeEd>[0]["pose"]; hair?: Parameters<typeof placeEd>[0]["hair"]; skin?: number; color?: number; d?: number };
let mk = 0;
const P = (o: PO) => placeEd({ ...o, s: (o.s ?? 1) * 0.95, color: (o.color ?? 0) + mk++ });

export function buildHeroReelDoc(theme: ThemeName = "biru"): { html: string; durationSec: number } {
  const T = TIMES;
  // ---- scene 1: the problem (0 - 11.9)
  const queue = sv(
    kiosk(660, 330, 1.05, "idle", 0.2) + P({ x: 120, y: 250, s: 0.6, expr: "khawatir", hair: "long", skin: 1, pose: "hold", d: 0.1 }) + P({ x: 235, y: 262, s: 0.58, expr: "bingung", hair: "curly", skin: 2, color: 2, pose: "chin", d: 0.3 })
      + P({ x: 350, y: 270, s: 0.56, expr: "berpikir", hair: "short", skin: 3, color: 3, d: 0.5 }) + P({ x: 462, y: 276, s: 0.54, expr: "khawatir", hair: "hijab", skin: 0, pose: "hold", d: 0.7 }),
    "left:0;top:930px;width:1080px;height:810px");
  const owner = sv(P({ x: 270, y: 50, s: 1.12, expr: "bingung", hair: "hijab", skin: 1, pose: "chin", color: 2 }) + mutasi(610, 330, 2.0) + shadow(400, 580, 280), "left:0;top:800px;width:1080px;height:810px", "0 0 800 600");
  const s1 = scene(0, 11.95,
    tx(em("JAM 7 *MALAM.*"), T.jam, T.customer - 0.1, "left:76px;top:230px;font-size:118px", "big")
    + tx(em("Antrean booth-mu *mengular.*"), T.antrean, T.customer - 0.1, "left:76px;top:450px;font-size:78px;max-width:900px", "mid")
    + `<div class="clk" style="--t:${s(T.jam)}"><svg viewBox="-60 -60 120 120"><circle r="52" style="fill:#fff"/><circle r="52" style="fill:none;stroke:#12162b;stroke-width:7"/><g class="hand"><path d="M0 0 V-34" style="stroke:#12162b;stroke-width:7;stroke-linecap:round"/></g><path d="M0 0 L20 12" style="stroke:var(--c1);stroke-width:7;stroke-linecap:round"/></svg></div>`
    + `<div class="wrap q" style="--t:${s(T.antrean)};--o:${s(T.dan - 0.15)}">${queue}</div>`
    + tx(em("📲 siap *bayar...*"), T.customer, T.dan - 0.15, "left:76px;top:700px;font-size:84px", "mid")
    + tx(em("dan *kamu?*"), T.dan, T.satu1 - 0.1, "left:76px;top:230px;font-size:140px", "big")
    + `<div class="wrap" style="--t:${s(T.dan)}">${owner}</div>`
    + tx(em("Masih scroll *mutasi bank.*"), T.scroll, T.satu1 - 0.1, "left:76px;top:470px;font-size:84px;max-width:900px", "mid")
    + tx("SATU.", T.satu1, T.per - 0.05, "left:0;right:0;top:560px;text-align:center;font-size:330px", "slam")
    + tx("PER.", T.per, T.satu2 - 0.05, "left:0;right:0;top:560px;text-align:center;font-size:330px", "slam")
    + tx("SATU.", T.satu2, T.bayangin - 0.2, "left:0;right:0;top:560px;text-align:center;font-size:330px", "slam"));
  // ---- scene 2: QRIS (11.87 - 18.3)
  const scan = sv(
    shadow(400, 580, 300) + kiosk(590, 300, 1.75, "qr", 0)
      + `<rect class="beam" x="505" y="170" width="170" height="8" rx="4" style="fill:var(--c3);filter:drop-shadow(0 0 14px var(--c3));--t:${s(T.bayangin + 1.2)}"/>`
      + P({ x: 200, y: 200, s: 1.0, expr: "senang", hair: "bun", skin: 0, pose: "hold", color: 2, d: 0.2 }) + phone(205, 380, 1.15, "qr", "a-float", 0.2)
      + okBadge(590, 230, 1.9, T.bayar - 0.5) + sparkle(110, 100, 0.9, T.scan) + sparkle(720, 90, 0.8, T.sesi),
    "left:0;top:700px;width:1080px;height:810px");
  const s2 = scene(T.bayangin - 0.05, 18.35,
    tx(em("QRIS muncul *langsung*|di layar kiosk."), T.bayangin, T.scan - 0.1, "left:76px;top:230px;font-size:104px;line-height:1", "mid")
    + `<div class="wrap" style="--t:${s(T.bayangin)}">${scan}</div>`
    + tx("SCAN.", T.scan, T.bayar - 0.05, "left:76px;top:230px;font-size:200px", "slam")
    + tx("BAYAR.", T.bayar, T.sesi - 0.05, "left:76px;top:230px;font-size:200px", "slam")
    + tx(em("Sesi foto *jalan sendiri!*"), T.sesi, 18.2, "left:76px;top:230px;font-size:120px;line-height:.98", "big"));
  // ---- scene 3: cekrek (18.27 - 25.4)
  const flash = (t: number) => `<div class="flash" style="--t:${s(t)}"></div>`;
  const pose = sv(
    shadow(400, 580, 300) + P({ x: 170, y: 200, s: 0.85, expr: "kaget", hair: "curly", skin: 2, pose: "up", color: 2, d: 0.1 }) + P({ x: 400, y: 180, s: 0.95, expr: "senang", hair: "hijab", skin: 0, pose: "up", d: 0.3 })
      + P({ x: 630, y: 200, s: 0.85, expr: "senang", hair: "long", skin: 1, pose: "up", color: 3, d: 0.5 }) + sparkle(90, 90, 0.9, 20.2) + sparkle(740, 120, 1, 20.4),
    "left:0;top:800px;width:1080px;height:900px");
  const result = sv(strip(300, 300, 1.7, -6, T.strip - 0.2) + phone(600, 330, 1.7, "photo", "a-float", 23.0) + sparkle(470, 90, 1, 23.4), "left:0;top:760px;width:1080px;height:810px");
  const cnt = (n: string, t: number, o: number) => tx(n, t, o, "left:0;right:0;top:300px;text-align:center;font-size:620px", "slam");
  const s3 = scene(18.25, 25.5,
    cnt("3", 18.5, 19.2) + cnt("2", 19.2, 19.85) + cnt("1", 19.85, 20.5) + tx(em("CEK*REK!*"), 20.5, 21.25, "left:0;right:0;top:420px;text-align:center;font-size:250px", "slam")
    + `<div class="wrap" style="--t:${s(18.3)};--o:${s(21.2)}">${pose}</div>` + flash(20.5)
    + `<div class="wrap" style="--t:${s(T.strip - 0.1)}">${result}</div>`
    + tx(em("Strip foto *keluar...*"), T.strip, 23.0, "left:76px;top:230px;font-size:100px", "mid")
    + tx(em("hasil digital *nyampe ke HP*|lewat QR."), 23.1, 25.4, "left:76px;top:230px;font-size:80px;line-height:1", "mid"));
  // ---- scene 4: the owner relaxes (25.42 - 31.25)
  const relax = sv(P({ x: 250, y: 60, s: 1.12, expr: "lega", hair: "short", skin: 2, pose: "hold", color: 2 }) + cup(262, 262, 1.0, T.dan2 + 0.4) + shadow(300, 585, 250) + sparkle(90, 110, 0.8, 27), "left:-60px;top:900px;width:900px;height:675px");
  const dash = `<div class="dash" style="--t:${s(T.duduk + 0.5)}"><div class="dh"><i></i><i></i><i></i><b>STUDIODO · Dashboard</b></div>
    <div class="cards"><div><small>Omzet hari ini</small><b>Rp 1.250.000</b></div><div><small>Sesi foto</small><b><span class="count" style="--to:48"></span></b></div><div><small>Booth online</small><b class="ok">3 / 3</b></div></div>
    <div class="rowx"><span class="dot"></span>QRIS · Strip 4 foto<em>Lunas</em></div><div class="rowx"><span class="dot"></span>Cetak tambahan<em>Lunas</em></div><div class="rowx"><span class="dot"></span>Voucher event<em>Dipakai</em></div><p>Contoh tampilan</p></div>`;
  const s4 = scene(T.dan2 - 0.05, 31.3,
    tx(em("Dan *kamu?*"), T.dan2, T.duduk - 0.1, "left:76px;top:230px;font-size:170px", "big")
    + tx(em("Duduk *manis,*|ngopi,"), T.duduk, 28.8, "left:76px;top:230px;font-size:140px;line-height:.95", "big")
    + tx(em("ngecek *omzet*|dan status booth|dari *dashboard.*"), 28.8, 31.2, "left:76px;top:230px;font-size:104px;line-height:1", "mid")
    + `<div class="wrap" style="--t:${s(T.dan2 + 0.1)}">${relax}</div>` + dash);
  // ---- scene 5: reveal (31.23 - 34.05)
  const s5 = scene(T.mimpi - 0.05, 34.1,
    tx(em("Itu bukan *mimpi.*"), T.mimpi, T.studiodo - 0.1, "left:0;right:0;top:760px;text-align:center;font-size:150px", "big")
    + `<img class="logoBig" src="${wordmark("white")}" alt="STUDIODO" style="--t:${s(T.studiodo)}">`
    + tx(em("Itu *STUDIODO.*"), T.studiodo + 0.2, null, "left:0;right:0;top:1130px;text-align:center;font-size:96px", "mid") + flash(T.studiodo));
  // ---- scene 6: call to action (34.0 - end)
  const word = "COBA".split("").map((c, i) => `<b style="--t:${s(T.komen + 0.15 + i * 0.28)}">${c}</b>`).join("");
  const cta = sv(P({ x: 190, y: 40, s: 0.95, expr: "senang", hair: "hijab", skin: 1, pose: "point", color: 2 }) + P({ x: 640, y: 50, s: 0.9, expr: "senang", hair: "short", skin: 2, pose: "hold", d: 0.4 }) + sparkle(400, 80, 1, T.komen) + sparkle(760, 120, 0.8, T.komen + 0.4) + shadow(400, 585, 300), "left:0;top:980px;width:1080px;height:780px");
  const s6 = scene(T.mau - 0.05, HERO_DURATION + 1,
    tx(em("Mau coba *gratis?*"), T.mau, null, "left:76px;top:230px;font-size:150px;line-height:.95", "big")
    + `<div class="wrap" style="--t:${s(T.mau + 0.2)}">${cta}</div>`
    + `<div class="btn" style="--t:${s(T.komen)}">Coba gratis →</div>`
    + `<div class="kw" style="--t:${s(T.komen)}">Komen <span class="cw">${word}</span></div>`
    + tx("studiodo.id", T.nanti, null, "left:76px;top:880px;font-size:64px", "url"));

  const css = `
*{box-sizing:border-box;margin:0;padding:0}html,body{background:#04050c;overflow:hidden}
.stage{position:relative;width:1080px;height:1920px;overflow:hidden;font-family:"InterK",system-ui,sans-serif;color:#f4f6ff;${THEMES[theme]};background:radial-gradient(120% 80% at 50% 0,var(--deep),#04050c 70%)}
.bg{position:absolute;inset:0;overflow:hidden}.bg i{position:absolute;border-radius:50%;mix-blend-mode:screen;filter:blur(40px);animation:drift 11s ease-in-out infinite}
.bg i:nth-child(1){width:1200px;height:1200px;left:-420px;top:-300px;background:radial-gradient(circle,var(--c1),transparent 66%);opacity:.9}
.bg i:nth-child(2){width:1100px;height:1100px;right:-480px;top:520px;background:radial-gradient(circle,var(--c2),transparent 66%);opacity:.7;animation-delay:-4s;animation-direction:reverse}
.bg i:nth-child(3){width:1100px;height:1100px;left:-240px;bottom:-560px;background:radial-gradient(circle,var(--c3),transparent 66%);opacity:.5;animation-delay:-7s}
@keyframes drift{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(90px,60px) scale(1.14)}}
.ribs{position:absolute;inset:0;background:repeating-linear-gradient(90deg,rgba(255,255,255,.07) 0 5px,rgba(255,255,255,0) 5px 44px,rgba(0,0,0,.2) 44px 50px);-webkit-mask-image:linear-gradient(#000,transparent 70%);mask-image:linear-gradient(#000,transparent 70%)}
.logo{position:absolute;left:76px;top:96px;height:46px;z-index:20}
.sc{position:absolute;inset:0;animation:scin .001s both,scout .001s forwards;animation-delay:var(--in),var(--out)}
@keyframes scin{from{opacity:0;visibility:hidden}to{opacity:1;visibility:visible}}@keyframes scout{to{opacity:0;visibility:hidden}}
.wrap{position:absolute;inset:0;opacity:0;animation:wrapin .6s ease both,wrapout .3s ease both;animation-delay:var(--t),var(--o,999s)}
@keyframes wrapin{from{opacity:0;transform:translateY(60px) scale(.94)}to{opacity:1;transform:none}}@keyframes wrapout{to{opacity:0;transform:translateX(-80px)}}
.sv{position:absolute;overflow:visible}
.tx{position:absolute;opacity:0;font-family:"Bricolage",system-ui,sans-serif;font-weight:800;letter-spacing:-.035em;line-height:.98;z-index:10;animation:txin .6s cubic-bezier(.2,1.3,.4,1) both,txout .3s ease both;animation-delay:var(--t),var(--o,999s)}
.tx.mid{font-weight:800}.tx em,.cw{font-family:"Instrument",Georgia,serif;font-style:italic;font-weight:400;font-size:1.12em;letter-spacing:-.02em;background:linear-gradient(100deg,var(--c3),#fff 45%,var(--c2) 65%,var(--c3));background-size:230% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:shim 4.5s linear infinite}
@keyframes shim{to{background-position:-230% 0}}
@keyframes txin{from{opacity:0;transform:translateY(80px) scale(.82) rotate(-3deg)}to{opacity:1;transform:none}}@keyframes txout{to{opacity:0;transform:translateY(-40px) scale(.96)}}
.tx.slam{animation:slam .5s cubic-bezier(.2,1.6,.4,1) both,txout .25s ease both;animation-delay:var(--t),var(--o,999s);text-shadow:0 20px 60px rgba(0,0,0,.45)}
@keyframes slam{0%{opacity:0;transform:scale(2.6) rotate(-6deg)}60%{opacity:1;transform:scale(.94)}100%{opacity:1;transform:none}}
.tx.url{font-weight:700;letter-spacing:.04em}
.flash{position:absolute;inset:0;background:#fff;opacity:0;z-index:30;pointer-events:none;animation:flash .5s ease-out forwards;animation-delay:var(--t)}@keyframes flash{0%{opacity:.95}100%{opacity:0}}
.sweep{position:absolute;inset:0;z-index:40;pointer-events:none;opacity:0;background:linear-gradient(105deg,transparent 30%,rgba(255,255,255,.5) 50%,transparent 70%);animation:swp .55s ease-in forwards;animation-delay:var(--t)}@keyframes swp{0%{opacity:1;transform:translateX(-100%)}100%{opacity:1;transform:translateX(100%)}}
.clk{position:absolute;right:56px;top:215px;width:150px;height:150px;opacity:0;animation:wrapin .6s ease both;animation-delay:var(--t);z-index:6}.clk .hand{transform-origin:0 0;animation:spin 2.6s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.scrollrows{animation:scroll 1.8s linear infinite}@keyframes scroll{to{transform:translateY(-264px)}}
.beam{animation:beam 1.5s ease-in-out infinite;animation-delay:var(--t)}@keyframes beam{0%,100%{transform:translateY(0)}50%{transform:translateY(190px)}}
.logoBig{position:absolute;left:140px;right:140px;top:880px;width:800px;opacity:0;z-index:12;filter:drop-shadow(0 0 60px var(--c2));animation:logoin .9s cubic-bezier(.2,1.4,.4,1) both;animation-delay:var(--t)}
@keyframes logoin{from{opacity:0;transform:scale(.4) rotate(-6deg);filter:blur(20px)}to{opacity:1;transform:none}}
.dash{position:absolute;right:56px;top:1010px;width:560px;padding:26px 28px;border-radius:34px;background:linear-gradient(145deg,rgba(255,255,255,.17),rgba(255,255,255,.05));border:1.5px solid rgba(255,255,255,.25);backdrop-filter:blur(24px);box-shadow:0 40px 90px -30px rgba(0,0,0,.8);opacity:0;z-index:9;animation:wrapin .7s cubic-bezier(.2,1.2,.4,1) both;animation-delay:var(--t)}
.dh{display:flex;align-items:center;gap:10px;margin-bottom:20px;font-weight:700;font-size:22px;color:rgba(244,246,255,.8)}.dh i{width:14px;height:14px;border-radius:50%;background:#ff6b6b}.dh i:nth-child(2){background:#ffd23f}.dh i:nth-child(3){background:#40d9a0}
.cards{display:grid;grid-template-columns:1.6fr 1fr 1fr;gap:12px}.cards div{padding:16px;border-radius:20px;background:rgba(255,255,255,.1)}.cards small{display:block;font-size:17px;opacity:.7;margin-bottom:6px}.cards b{font-family:"Bricolage",sans-serif;font-size:30px}.cards .ok{color:var(--c3)}
@property --n{syntax:"<integer>";initial-value:0;inherits:false}.count{counter-reset:n var(--n);animation:cnt 2.4s cubic-bezier(.2,.7,.2,1) both;animation-delay:var(--t)}.count::after{content:counter(n)}@keyframes cnt{from{--n:0}to{--n:var(--to)}}
.rowx{display:flex;align-items:center;gap:12px;margin-top:12px;padding:14px 18px;border-radius:18px;background:rgba(255,255,255,.08);font-weight:700;font-size:23px}.rowx .dot{width:12px;height:12px;border-radius:50%;background:var(--c3);box-shadow:0 0 12px var(--c3)}.rowx em{margin-left:auto;font-style:normal;font-size:19px;padding:5px 14px;border-radius:99px;background:rgba(64,217,160,.2);color:#7dffd0;background-clip:border-box;-webkit-background-clip:border-box;-webkit-text-fill-color:#7dffd0}
.dash p{margin-top:16px;font-size:16px;opacity:.5;text-align:right}
.btn{position:absolute;left:76px;top:560px;padding:34px 62px;border-radius:99px;font:700 52px "InterK",sans-serif;background:linear-gradient(120deg,var(--c1),var(--c2));box-shadow:0 0 0 2px rgba(255,255,255,.3),0 24px 80px -10px var(--c2);opacity:0;z-index:11;animation:txin .6s cubic-bezier(.2,1.3,.4,1) both,beat 1.8s ease-in-out infinite 1.2s;animation-delay:var(--t)}@keyframes beat{50%{transform:scale(1.05)}}
.kw{position:absolute;left:76px;top:730px;padding:22px 42px;border:2px dashed rgba(255,255,255,.6);border-radius:99px;font:700 48px "InterK",sans-serif;opacity:0;z-index:11;animation:txin .6s ease both;animation-delay:var(--t)}.kw .cw{font-family:"Bricolage",sans-serif;font-weight:800;font-style:normal;font-size:1em;letter-spacing:.12em;color:var(--c3);background:none;-webkit-text-fill-color:var(--c3)}.kw b{opacity:0;display:inline-block;animation:txin .3s ease both;animation-delay:var(--t)}
${ART_CSS}
.a-float,.a-pop,.a-shake,.a-blink{animation-delay:var(--d,0s)}
.art .a-pop,.a-pop{animation:apop .7s cubic-bezier(.3,1.5,.5,1) both;animation-delay:calc(var(--d,0s) + .25s)}

`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${kacaFonts()}${css}</style></head><body><div class="stage"><div class="bg"><i></i><i></i><i></i></div><div class="ribs"></div>
<img class="logo" src="${wordmark("white")}" alt="STUDIODO">${s1}${s2}${s3}${s4}${s5}${s6}${[T.bayangin - 0.2, 18.2, 25.35, 31.2, 33.95].map(sweep).join("")}</div>
<script>window.__seek=(ms)=>{document.getAnimations().forEach(a=>{a.pause();a.currentTime=ms;});};window.__ready=true;</script></body></html>`;
  void [coins, clock, qr];
  return { html, durationSec: HERO_DURATION };
}
