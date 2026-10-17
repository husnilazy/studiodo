import { APP_ICON_CSS, silverLogoHtml } from "./appicon.js";
import { portraitSvg } from "./portraits.js";
import { BASE_CSS, fontFaces, wordmark } from "./theme.js";
import { FORMATS, type Deck, type Mockup, type Slide, type Tone } from "./types.js";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** "line one|line *two*" -> escaped HTML with <br> and <b> accents. */
const rich = (s: string) => esc(s).replace(/\|/g, "<br>").replace(/\*([^*]+)\*/g, "<b>$1</b>");
const D = (n: number) => `style="--d:${n}s"`;

// ---- icons (24px grid, stroke) ----
const ICONS: Record<string, string> = {
  chart: "M3 3v18h18M7 14l4-4 3 3 5-6",
  qr: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14v7M14 20h3",
  image: "M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M9 9.5h.01",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 100-8 4 4 0 000 8z",
  card: "M2 6h20v12H2zM2 10h20",
  ticket: "M3 7h18v3a2 2 0 000 4v3H3v-3a2 2 0 000-4zM13 7v10",
  swap: "M7 7h12l-3-3M17 17H5l3 3",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-6 8-6s8 2 8 6",
  check: "M5 12l5 5 9-10",
  arrow: "M5 12h14M13 6l6 6-6 6",
  x: "M6 6l12 12M18 6L6 18",
  spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  play: "M8 5v14l11-7z",
  help: "M12 22a10 10 0 100-20 10 10 0 000 20zM9.5 9a2.5 2.5 0 115 0c0 1.7-2.5 2-2.5 4M12 17h.01",
  bell: "M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 004 0",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
};
export const icon = (name: string, size: number, stroke = 2, color = "currentColor") =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[name]}"/></svg>`;

// ---- deterministic fake QR (never scannable; it's a visual) ----
export function qrCells(): string {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const N = 21;
  const finder = (x: number, y: number) => {
    const inBox = (ox: number, oy: number) => x >= ox && x < ox + 7 && y >= oy && y < oy + 7;
    for (const [ox, oy] of [[0, 0], [14, 0], [0, 14]] as const) {
      if (inBox(ox, oy)) {
        const dx = x - ox, dy = y - oy;
        const ring = dx === 0 || dx === 6 || dy === 0 || dy === 6;
        const core = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
        return ring || core;
      }
      if (x >= ox - 1 && x <= ox + 7 && y >= oy - 1 && y <= oy + 7) return false;
    }
    return null;
  };
  let out = "";
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const f = finder(x, y);
    out += `<i class="${(f === null ? rnd() > 0.52 : f) ? "" : "o"}"></i>`;
  }
  return out;
}

const PHOTO_BG = [
  "linear-gradient(160deg,#ffd3e4,#c7ceff)", "linear-gradient(160deg,#b8f0e6,#c7ceff)", "linear-gradient(160deg,#ffe3b8,#ffd3e4)",
  "linear-gradient(160deg,#c7ceff,#9aa6ff)", "linear-gradient(160deg,#bfd8ff,#b8f0e6)", "linear-gradient(160deg,#ffd3e4,#ffe3b8)",
];
const photo = (i: number, images: string[] | undefined, extra = "") => {
  const img = images?.[i % Math.max(images.length, 1)];
  return img
    ? `<div class="ph" style="background-image:url('${esc(img)}');${extra}"></div>`
    : `<div class="ph" style="${extra}">${portraitSvg(i)}</div>`;
};

// ---- mockups ----
export function mockDashboard(laptop = true): string {
  const bars = [38, 56, 44, 70, 62, 88, 100];
  const open = laptop
    ? `<div class="mock mbp"><div class="lid"><i class="cam"></i><div class="mscr"><div class="mbar"><span class="apl"></span><b>STUDIODO</b><span>File</span><span>Edit</span><span>Tampilan</span><em>Sen 09.41</em></div><div class="mwb"><div class="mws"><div class="win"><div class="bar"><i></i><i></i><i></i><span>admin.studiodo.id · Dashboard</span></div>`
    : `<div class="mock win"><div class="bar"><i></i><i></i><i></i><span>STUDIODO · Dashboard</span></div>`;
  const close = laptop ? `</div></div></div></div><div class="mbase"></div></div>` : "";
  return `${open}
    <div class="tiles">
      <div class="tile pop" ${D(0.5)}><small>Omzet hari ini</small><strong>Rp 1.250.000</strong><em>▲ 18%</em></div>
      <div class="tile pop" ${D(0.65)}><small>Sesi foto</small><strong><span class="count" style="--to:48;--d:.7s"></span></strong><em>▲ 12 sesi</em></div>
      <div class="tile pop" ${D(0.8)}><small>Booth online</small><strong>3 / 3</strong><em>● semua aktif</em></div>
    </div>
    <div class="rows">
      <div class="row sl" ${D(1.5)}><span class="av">${icon("qr", 24, 2.2)}</span>QRIS · Strip 4 foto<span class="amt" style="margin-left:auto">Rp 35.000</span><span class="tag" style="margin-left:14px">Lunas</span></div>
      <div class="row sl" ${D(1.7)}><span class="av">${icon("ticket", 24, 2.2)}</span>Voucher · Event Wedding<span class="amt" style="margin-left:auto">Gratis</span><span class="tag" style="margin-left:14px">Dipakai</span></div>
      <div class="row sl" ${D(1.9)}><span class="av">${icon("qr", 24, 2.2)}</span>QRIS · Cetak tambahan<span class="amt" style="margin-left:auto">Rp 15.000</span><span class="tag" style="margin-left:14px">Lunas</span></div>
    </div>
    <div class="chart">${bars.map((h, i) => `<i class="grow" style="height:${h}%;--d:${0.9 + i * 0.08}s"></i>`).join("")}</div>
    </div>${close}`;
}

export function mockQris(reel: boolean): string {
  return `<div class="mock kiosk"><div class="scr">
    <span class="chip">Pembayaran</span>
    <h3>Scan QRIS untuk mulai</h3>
    <div class="sub">Paket Strip 4 Foto · Rp 35.000</div>
    <div class="qr pop" ${D(0.3)}>${qrCells()}</div>
    <div class="sub">Menunggu pembayaran…</div>
    ${reel ? `<div class="paid pop" style="--d:2.4s"><div class="ck">${icon("check", 84, 3.2, "#fff")}</div><h3>Pembayaran diterima</h3><div class="sub">Rp 35.000 · QRIS</div><div class="bigbtn">Mulai Foto</div></div>` : ""}
  </div></div>`;
}

export function mockGallery(images?: string[]): string {
  return `<div class="mock phone"><div class="scr">
    <h3>Foto kamu sudah siap</h3>
    <div class="grid2">${[0, 1, 2, 3].map((i) => photo(i, images, `animation:pop .6s cubic-bezier(.3,1.5,.5,1) both;animation-delay:calc(var(--s,0s) + ${0.5 + i * 0.15}s)`)).join("")}</div>
    <div class="dl in" ${D(1.4)}><span>Unduh semua</span><span>Bagikan</span></div>
  </div></div>`;
}

export function mockBooth(images?: string[]): string {
  return `<div class="mock kiosk"><div class="scr" style="background:linear-gradient(170deg,#c7ceff,#eceeff)">
    <span class="chip">Sesi foto</span>
    <div style="position:relative;width:100%;aspect-ratio:3/4;border-radius:26px;overflow:hidden;background:${PHOTO_BG[0]}">
      ${images?.[0] ? `<div style="position:absolute;inset:0;background:url('${esc(images[0])}') center/cover"></div>` : photo(1, images, "position:absolute;inset:0;aspect-ratio:auto;border-radius:0")}
      <div class="cnt3 pop" style="--d:.6s">3</div>
    </div>
    <div class="bigbtn in" ${D(0.3)}>Mulai Foto</div>
  </div></div>`;
}

function mockStrip(images?: string[]): string {
  return `<div class="mock"><div class="strip float"><div>${[0, 1, 2, 3].map((i) => `<div style="margin-bottom:16px;animation:pop .6s cubic-bezier(.3,1.5,.5,1) both;animation-delay:calc(var(--s,0s) + ${0.4 + i * 0.25}s)">${photo(i, images)}</div>`).join("")}</div><div class="lb">STUDIODO</div></div></div>`;
}

function mockQueue(): string {
  return `<div class="mock queue">
    <div class="q now sl" ${D(0.4)}><b>A-012</b>Dipanggil ke Booth 1<span class="st">Sekarang</span></div>
    <div class="q sl" ${D(0.6)}><b>A-013</b>Menunggu giliran<span class="st">Berikutnya</span></div>
    <div class="q sl" ${D(0.8)}><b>A-014</b>Menunggu giliran<span class="st">Antri</span></div>
  </div>`;
}

function mockHub(): string {
  const cx = 460, cy = 320;
  const orbits: [number, number][] = [[230, 150], [330, 215], [420, 265]]; // rx, ry
  const rings = orbits
    .map(([rx, ry], i) => `<g class="pop" style="transform-origin:${cx}px ${cy}px;--d:${0.15 + i * 0.15}s"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="rgba(138,138,255,${0.55 - i * 0.12})" stroke-width="2"${i === 1 ? ' stroke-dasharray="4 10"' : ""}/></g>`)
    .join("");
  // [icon, orbit, angle°, size, tint, delay]
  const nodes: [string, number, number, number, string, number][] = [
    ["image", 0, 200, 92, "n1", 1.0], ["swap", 0, 340, 92, "n2", 1.1],
    ["chart", 1, 235, 100, "n3", 1.2], ["card", 1, 300, 72, "n4", 1.3], ["camera", 1, 130, 100, "n2", 1.4], ["user", 1, 35, 88, "n1", 1.5],
    ["qr", 2, 270, 84, "n4", 1.6], ["ticket", 2, 5, 84, "n3", 1.7],
  ];
  const chips = nodes.map(([n, o, deg, sz, tint, d], i) => {
    const [rx, ry] = orbits[o], r = (deg * Math.PI) / 180;
    const left = Math.round(cx + rx * Math.cos(r) - sz / 2), top = Math.round(cy + ry * Math.sin(r) - sz / 2);
    return `<div class="node ${tint} pop" style="left:${left}px;top:${top}px;width:${sz}px;height:${sz}px;--d:${d}s"><span class="float" style="display:grid;animation-delay:-${i * 0.6}s">${icon(n, Math.round(sz * 0.48), 1.9)}</span></div>`;
  }).join("");
  return `<div class="mock hub"><svg class="lines" viewBox="0 0 920 640">${rings}</svg>${chips}
    <div class="core pop" style="--d:.1s"><div style="display:grid;place-items:center;gap:10px"><svg width="80" height="80" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#fff" fill-opacity=".95"/><circle cx="32" cy="32" r="12" fill="#4f4fe8"/><circle cx="32" cy="32" r="5" fill="#fff"/></svg><b>Dashboard</b></div></div></div>`;
}

const lphoto = (i: number, images: string[] | undefined, extra = "") => photo(i, images, extra);
const popIn = (delay: number) => `animation:pop .6s cubic-bezier(.3,1.5,.5,1) both;animation-delay:calc(var(--s,0s) + ${delay}s)`;

function mockQrisL(reel: boolean): string {
  return `<div class="mock mon"><div class="bez"><div class="lscr">
    <div class="l-left">
      <span class="chip">Pembayaran</span>
      <h3>Scan QRIS<br>untuk mulai</h3>
      <div class="sub">Paket Strip 4 Foto · Rp 35.000</div>
      <div class="ls"><i>1</i>Buka aplikasi pembayaran kamu</div>
      <div class="ls"><i>2</i>Scan kode di samping</div>
      <div class="ls"><i>3</i>Sesi foto langsung dimulai</div>
    </div>
    <div class="l-right"><div class="qr pop" style="--d:.3s">${qrCells()}</div></div>
    ${reel ? `<div class="paid pop" style="--d:2.4s"><div class="ck">${icon("check", 84, 3.2, "#fff")}</div><h3>Pembayaran diterima</h3><div class="sub">Rp 35.000 · QRIS</div></div>` : ""}
  </div></div><div class="neck"></div><div class="base"></div></div>`;
}

export function mockBoothL(images?: string[]): string {
  return `<div class="mock mon"><div class="bez"><div class="lscr" style="grid-template-columns:1.25fr 1fr">
    <div class="l-left" style="padding:28px"><div class="cam" style="background:${PHOTO_BG[0]}">${lphoto(1, images, "position:absolute;inset:0;aspect-ratio:auto;border-radius:0")}<div class="cnt3 pop" style="--d:.6s">3</div></div></div>
    <div class="l-right" style="gap:16px;align-content:center;justify-items:center">
      <span class="chip">Sesi foto</span>
      <h3 style="text-align:center">Foto 1 dari 4</h3>
      <div class="dots"><i class="on"></i><i></i><i></i><i></i></div>
      <div class="minis">${[0, 1, 2, 3].map((i) => lphoto(i + 1, images, "opacity:" + (i === 0 ? "1" : ".45"))).join("")}</div>
      <div class="bigbtn in" ${D(0.3)}>Mulai Foto</div>
    </div>
  </div></div><div class="neck"></div><div class="base"></div></div>`;
}

function mockGalleryL(images?: string[]): string {
  return `<div class="mock mon"><div class="bez"><div class="lscr" style="grid-template-columns:1.3fr 1fr">
    <div class="l-left" style="padding:30px"><div class="g4">${[0, 1, 2, 3].map((i) => lphoto(i, images, popIn(0.5 + i * 0.15))).join("")}</div></div>
    <div class="l-right" style="gap:14px;align-content:center;justify-items:center">
      <h3 style="text-align:center;font-size:30px">Foto kamu siap</h3>
      <div class="qr sm pop" style="--d:1.0s">${qrCells()}</div>
      <div class="sub">Scan untuk unduh di HP</div>
      <div class="dl" style="width:100%"><span>Unduh semua</span><span>Bagikan</span></div>
    </div>
  </div></div><div class="neck"></div><div class="base"></div></div>`;
}

function mockPrintL(images?: string[]): string {
  return `<div class="mock"><div class="print float"><div class="pg">${[0, 1, 2, 3].map((i) => `<div style="${popIn(0.4 + i * 0.22)}">${lphoto(i, images)}</div>`).join("")}</div><div class="lb"><span>STUDIODO</span><span>Cetak 4R · landscape</span></div></div></div>`;
}

const MOCKS: Record<Exclude<Mockup, "none">, { html: (s: Slide, reel: boolean) => string; fit: "crop" | "fit"; k: number; in: string }> = {
  dashboard: { html: () => mockDashboard(false), fit: "crop", k: 1, in: "rise" },
  macbook: { html: () => mockDashboard(true), fit: "fit", k: 1, in: "rise" },
  qris: { html: (_s, reel) => mockQris(reel), fit: "crop", k: 0.82, in: "lift" },
  gallery: { html: (s) => mockGallery(s.images), fit: "crop", k: 0.8, in: "tilt" },
  booth: { html: (s) => mockBooth(s.images), fit: "crop", k: 0.82, in: "zoom" },
  strip: { html: (s) => mockStrip(s.images), fit: "fit", k: 0.45, in: "print" },
  queue: { html: () => mockQueue(), fit: "fit", k: 0.9, in: "slide" },
  hub: { html: () => mockHub(), fit: "fit", k: 0.72, in: "spin" },
  "qris-l": { html: (_s, reel) => mockQrisL(reel), fit: "fit", k: 0.7, in: "drop" },
  "booth-l": { html: (s) => mockBoothL(s.images), fit: "fit", k: 0.7, in: "flip" },
  "gallery-l": { html: (s) => mockGalleryL(s.images), fit: "fit", k: 0.7, in: "swing" },
  "print-l": { html: (s) => mockPrintL(s.images), fit: "fit", k: 0.6, in: "print" },
};

const stage = (s: Slide, reel: boolean, d = 0.36) => {
  if (!s.mockup || s.mockup === "none") return "";
  const m = MOCKS[s.mockup];
  return `<div class="stage" data-fit="${m.fit}" data-k="${m.k}" data-in="${m.in}" style="--d:${d}s;--k:${m.k}"><div class="paper">${m.html(s, reel)}</div></div>`;
};
const note = (s: Slide) => (s.note ? `<div class="pill in" ${D(0.7)}>${rich(s.note)}</div>` : "");
const eyebrow = (s: Slide) => (s.eyebrow ? `<div class="eyebrow in"><span class="dot"></span>${esc(s.eyebrow)}</div>` : "");
const heading = (s: Slide, cls = "") => `<h1 class="in ${cls}" ${D(0.12)}>${rich(s.title)}</h1>`;
const bodyP = (s: Slide) => (s.body ? `<p class="body in" ${D(0.24)}>${esc(s.body)}</p>` : "");
const titleSize = (s: Slide) => (s.title.replace(/[|*]/g, "").length > 38 ? "m" : "");

function mainFor(s: Slide, deck: Deck, reel: boolean): string {
  switch (s.kind) {
    case "cover":
      return `${eyebrow(s)}${heading(s, "xl")}${bodyP(s)}${stage(s, reel)}`;
    case "feature":
      return `${eyebrow(s)}${heading(s, titleSize(s))}${bodyP(s)}${stage(s, reel)}${note(s)}`;
    case "steps":
      return `${eyebrow(s)}${heading(s, "m")}<div class="steps${(s.items ?? []).length > 4 ? " many" : ""}">${(s.items ?? []).map((it, i) =>
        `<div class="step sl" ${D(0.35 + i * 0.18)}><span class="no">${i + 1}</span><span>${rich(it)}</span></div>`).join("")}</div>${bodyP(s)}${stage(s, reel, 0.9)}`;
    case "stat": {
      const st = s.stat ?? { value: 0, label: "" };
      return `${eyebrow(s)}${heading(s, "m")}<div class="statcard glass pop" ${D(0.3)}>
        <div class="num">${esc(st.prefix ?? "")}<span class="count" style="--to:${Math.round(st.value)};--d:.6s"></span>${esc(st.suffix ?? "")}</div>
        <div class="lab">${esc(st.label)}</div></div>${bodyP(s)}${note(s)}`;
    }
    case "compare":
      return `${eyebrow(s)}${heading(s, "m")}<div class="cmp">
        <div class="col bad sl" ${D(0.3)}><h4>${esc(s.labelBefore || "Tanpa sistem")}</h4><ul>${(s.itemsBefore ?? []).map((t) => `<li><span${s.labelBefore ? ' class="neu"' : ""}>${s.labelBefore ? icon("check", 22, 3.4) : icon("x", 22, 3)}</span>${esc(t)}</li>`).join("")}</ul></div>
        <div class="col good sl" ${D(0.5)}><h4>${esc(s.labelAfter || "Dengan STUDIODO")}</h4><ul>${(s.items ?? []).map((t) => `<li><span>${icon("check", 22, 3.4)}</span>${esc(t)}</li>`).join("")}</ul></div></div>${note(s)}`;
    case "hook": {
      const sticker = s.eyebrow ? `<div class="sticker in">${esc(s.eyebrow)}</div>` : "";
      const emo = s.emoji ? `<div class="emo-wrap"><div class="emo pop" ${D(0.7)}><span class="float"><span>${esc(s.emoji)}</span></span></div></div>` : "";
      return `${sticker}${heading(s, "xl hk")}${bodyP(s)}${emo}${stage(s, reel)}${note(s)}`;
    }
    case "chat": {
      const msgs = (s.chat ?? []).map((m, i) => `<div class="bub ${m.from === "us" ? "us" : "them"} pop" ${D(0.55 + i * 0.9)}>${esc(m.text)}</div>`).join("");
      const av = `<svg viewBox="0 0 64 64" width="58" height="58"><circle cx="32" cy="32" r="30" fill="#4f4fe8"/><circle cx="32" cy="32" r="12" fill="#fff"/><circle cx="32" cy="32" r="5" fill="#4f4fe8"/></svg>`;
      const dense = (s.chat ?? []).reduce((n, m) => n + m.text.length, 0) > 230 ? " dense" : "";
      return `${eyebrow(s)}${s.title ? heading(s, "m") : ""}<div class="chat${dense} in" ${D(0.2)}><div class="chat-top">${av}<div><b>STUDIODO</b><small>● online</small></div></div><div class="chat-body">${msgs}</div></div>${note(s)}`;
    }
    case "note": {
      const cols = ["#ffd3e4", "#ffe3b8", "#d5ccff", "#b8f0e6", "#bfd8ff"];
      const rots = [-1.6, 1.2, -0.8, 1.6, -1.1];
      const list = (s.items ?? []).map((it, i) => `<div class="sticky" style="--d:${(0.35 + i * 0.22).toFixed(2)}s;--r:${rots[i % 5]}deg;background:${cols[i % 5]}"><span class="tk">${icon("check", 34, 3.6, "#1d1733")}</span><span>${rich(it)}</span></div>`).join("");
      return `${eyebrow(s)}${heading(s, "m")}<div class="notes">${list}</div>${bodyP(s)}${stage(s, reel, 0.9)}${note(s)}`;
    }
    case "badge":
      return ""; // rendered by slideHtml (no header/footer)
    case "cta":
      return `${eyebrow(s)}${heading(s, "xl")}${bodyP(s)}${stage(s, reel)}
        <div class="in ctawrap" ${D(0.6)}><div class="btn">${esc(deck.handle === "studiodo.id" ? "Coba gratis di studiodo.id" : "Coba gratis")}${icon("arrow", 34, 2.6)}</div><div class="ctaurl">studiodo.id</div></div>`;
  }
}

export type RenderCtx = { index: number; total: number; startSec?: number; sceneEnd?: number; reel: boolean };

function slideHtml(s: Slide, deck: Deck, ctx: RenderCtx): string {
  const tone: Tone = s.tone ?? deck.tone;
  const logo = wordmark(tone === "dark" || tone === "indigo" || s.bgImage ? "white" : "ink");
  const last = ctx.index === ctx.total - 1;
  const pager = ctx.reel ? "" : `<div class="pager">${String(ctx.index + 1).padStart(2, "0")} / ${String(ctx.total).padStart(2, "0")}</div>`;
  const swipe = ctx.reel || last ? "" : `<div class="swipe">Geser ${icon("arrow", 24, 3)}</div>`;
  const sceneAnim = ctx.reel
    ? `animation:sceneIn .5s ease both${last ? "" : ",sceneOut .5s ease forwards"};animation-delay:${ctx.startSec === 0 ? "0s" : `${(ctx.startSec ?? 0) - 0.25}s`}${last ? "" : `,${(ctx.sceneEnd ?? 0) - 0.3}s`};`
    : "";
  const bg = s.bgImage ? `<div class="bgimg" style="background-image:url('${esc(s.bgImage)}')"></div><div class="scrim"></div>` : "";
  if (s.kind === "badge") {
    // Highlight cover: icon only, kept inside the centre safe zone (Instagram crops it to a circle).
    if (s.icon === "app") {
      const metal = tone === "light" || tone === "mint" ? "graphite" : "silver";
      return `<section class="slide t-${tone}" style="--s:0s">
      <div class="mesh"><i></i><i></i><i></i></div>${bg}
      <div class="bdgmain"><div class="pop" style="--d:.2s;animation:pop .8s cubic-bezier(.3,1.4,.5,1) both"><div class="float">${silverLogoHtml(720, metal, "--sweep-delay:1.2s")}</div></div></div>
    </section>`;
    }
    const name = s.icon && ICONS[s.icon] ? s.icon : "spark";
    return `<section class="slide t-${tone}${s.bgImage ? " has-bg" : ""}" style="--s:0s">
      <div class="mesh"><i></i><i></i><i></i></div>${bg}
      <div class="bdgrings"><i class="pop" style="width:700px;height:700px;--d:.25s"></i><i class="pop" style="width:900px;height:900px;--d:.4s"></i><i class="pop" style="width:1120px;height:1120px;--d:.55s"></i></div>
      <div class="bdgmain"><div class="bdg pop"><span class="float" style="display:grid">${icon(name, 250, 1.6)}</span></div></div>
    </section>`;
  }
  return `<section class="slide t-${tone}${s.bgImage ? " has-bg" : ""}" style="--s0:${ctx.startSec ?? 0}s;${sceneAnim}">
    <div class="mesh"><i></i><i></i><i></i></div>${bg}
    <div class="hd"><img src="${logo}" alt="STUDIODO">${pager}</div>
    <div class="main k-${s.kind}">${mainFor(s, deck, ctx.reel)}</div>
    <div class="ft"><span class="handle">@${esc(deck.handle)}</span>${swipe}</div>
  </section>`;
}

// Runs in the page: fit "fit"-type mockups inside their stage; "crop" ones keep natural size, top-anchored, fading out at the bottom.
const FIT_SCRIPT = `
(()=>{
  const run=()=>{document.querySelectorAll('.stage').forEach(st=>{
    const m=st.querySelector('.mock'); if(!m) return; const reel=document.querySelector('.stagebox').classList.contains('reel');
    m.style.transform='none'; const w=m.offsetWidth,h=m.offsetHeight,sw=st.clientWidth,sh=st.clientHeight; let k,top;
    if(reel||st.dataset.fit==='fit'){k=Math.min(reel?1.55:1,(sw-100)/w,sh/h);m.style.transform='scale('+k+')';top=m.offsetTop+(h-h*k)/2;}
    else{st.style.alignItems='flex-start';st.style.overflow='hidden';st.style.webkitMaskImage='linear-gradient(#000 82%,transparent)';k=Math.min(1,(sw-100)/w)*(st.dataset.k?+st.dataset.k:1);m.style.transformOrigin='top center';m.style.transform='scale('+k+')';top=m.offsetTop;}
    st.style.setProperty('--drop',Math.ceil(top+h*k+24)+'px'); // paper starts fully above the slot
  });};
  // Fit once right away (does not depend on fonts), again on load, and once more when fonts settle (or after 2.5 s at most).
  const safe=()=>{try{run();}catch(e){}};
  safe(); window.addEventListener('load',safe);
  const fonts=document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve();
  Promise.race([fonts,new Promise(r=>setTimeout(r,2500))]).then(()=>{safe();if(!window.__live)document.getAnimations().forEach(a=>a.pause());window.__ready=true;});
  window.__seek=(ms)=>{document.getAnimations().forEach(a=>{a.pause();a.currentTime=ms;});};
})();`;

function doc(deck: Deck, inner: string, autoplay: boolean): string {
  const { width, height } = FORMATS[deck.format];
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="only light"><style>${fontFaces()}${BASE_CSS}${APP_ICON_CSS}</style></head>
<body><div class="stagebox ${deck.format}" style="--W:${width}px;--H:${height}px">${inner}</div>
<script>${FIT_SCRIPT}${autoplay ? "" : ""}</script></body></html>`;
}

export const SLIDE_SETTLE_MS = 4500;
export const DEFAULT_SCENE_SECONDS = 3.4;

/** A single carousel slide as a full document (also used for live preview). */
export function buildSlideDoc(deck: Deck, index: number): string {
  const s = deck.slides[index];
  return doc(deck, slideHtml(s, deck, { index, total: deck.slides.length, reel: deck.format === "reel" }), true);
}

/** The whole reel: every slide is a scene on one absolute timeline. */
export function buildReelDoc(deck: Deck): { html: string; durationSec: number } {
  let t = 0;
  const scenes = deck.slides.map((s, i) => {
    const len = Math.max(1.8, s.seconds ?? DEFAULT_SCENE_SECONDS);
    const html = slideHtml(s, deck, { index: i, total: deck.slides.length, reel: true, startSec: t, sceneEnd: t + len });
    t += len;
    return html;
  });
  return { html: doc(deck, scenes.join(""), true), durationSec: t + 0.8 };
}
