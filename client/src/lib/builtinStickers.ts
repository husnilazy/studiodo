import type { PhotoSticker } from "./sessionStore";
import type { Sticker } from "./stickerStore";

// Built-in sticker pack. Nothing here is a stored asset: every sticker is drawn on a canvas the first time it is
// needed (and cached), so the pack costs no bundle size, works offline, and — because the editor preview and the
// final print both use the exact same data URL — what the customer sees is what gets printed.
//
// Sticker ids:  "emoji:😀"   "text:WOW!|pink"   "shape:heart|#ff4d8d"   <uuid> = a tenant-uploaded PNG from the library.

export interface StickerCategory {
  key: string;
  label: string;
  items: string[]; // sticker ids
}

const emojis = (chars: string) => Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(chars), (s) => `emoji:${s.segment}`);

const TEXT_BADGES: [string, string][] = [
  ["WOW!", "pink"], ["LOVE", "red"], ["HAPPY", "amber"], ["BFF", "indigo"], ["SQUAD", "mint"], ["XOXO", "pink"],
  ["SELFIE", "sky"], ["CHEESE!", "amber"], ["YEAY!", "mint"], ["MOOD", "ink"], ["GOALS", "indigo"], ["#BESTDAY", "red"],
];
const SHAPES: [string, string][] = [
  ["heart", "#ff4d8d"], ["heart", "#ff7a59"], ["star", "#ffc533"], ["star", "#6c6cf5"], ["sparkle", "#ffd23f"], ["sparkle", "#4fd6c1"],
  ["burst", "#ff5d73"], ["burst", "#6c6cf5"], ["bubble", "#ffffff"], ["bubble", "#ffd9ec"],
];

export const BUILTIN_CATEGORIES: StickerCategory[] = [
  { key: "wajah", label: "Wajah", items: emojis("😀😁😂🤣😊😇🥰😍🤩😘😜🤪😎🥳🤗🤭😴🥺😭😱🤯😈🤠🥹") },
  { key: "cinta", label: "Cinta", items: emojis("❤️🧡💛💚💙💜🩷💖💗💕💞💘💝😻💋🫶🌹💐💍👩‍❤️‍👨") },
  { key: "pesta", label: "Pesta", items: emojis("🎉🎊🎈🎂🎁🍾🥂🪩🎶🎤🎸🪅✨🎆🎇🧁") },
  { key: "gaya", label: "Gaya", items: emojis("👑🕶️🎀🧢🎩💄💎🌈👓💅🧣🎓👒🩴🪭🪄") },
  { key: "alam", label: "Alam", items: emojis("🌸🌺🌻🌼🌟⭐☀️🌙🔥🍀🌴🦋🐝🌊❄️⛄") },
  { key: "hewan", label: "Hewan", items: emojis("🐶🐱🐰🐻🐼🦄🐥🐷🐸🦊🐨🦁🐯🐙🐬🦖") },
  { key: "makan", label: "Makanan", items: emojis("🍓🍕🍔🍟🍩🍦🧋🍉🍒🍑🥑🌮🍫🍿🍪☕") },
  { key: "gestur", label: "Gestur", items: emojis("👍✌️🤞🤟👌🙌👏💪🙏👋🫰💯🔥🎯🏆🥇") },
  { key: "teks", label: "Teks", items: TEXT_BADGES.map(([t, c]) => `text:${t}|${c}`) },
  { key: "bentuk", label: "Bentuk", items: SHAPES.map(([s, c]) => `shape:${s}|${c}`) },
];

const cache = new Map<string, string>();

function makeCanvas(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak tersedia");
  return { canvas, ctx };
}

function emojiToDataUrl(char: string) {
  const SIZE = 256;
  const { canvas, ctx } = makeCanvas(SIZE, SIZE);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let fontSize = 200;
  ctx.font = `${fontSize}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
  const width = ctx.measureText(char).width;
  if (width > SIZE * 0.94) {
    fontSize = Math.floor((fontSize * SIZE * 0.94) / width);
    ctx.font = `${fontSize}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
  }
  ctx.fillText(char, SIZE / 2, SIZE / 2 + fontSize * 0.06);
  return canvas.toDataURL("image/png");
}

const BADGE_COLORS: Record<string, [string, string, string]> = {
  pink: ["#ff6fb1", "#ff3d8b", "#ffffff"],
  red: ["#ff6b6b", "#e11d48", "#ffffff"],
  amber: ["#ffd34d", "#ff9f1c", "#3b2400"],
  indigo: ["#7c83ff", "#4f4fe8", "#ffffff"],
  mint: ["#6ee7c8", "#14b8a6", "#04332c"],
  sky: ["#7dd3fc", "#0ea5e9", "#05293d"],
  ink: ["#3b4260", "#0b1020", "#ffffff"],
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function textBadgeToDataUrl(label: string, colorKey: string) {
  const W = 512;
  const H = 256;
  const { canvas, ctx } = makeCanvas(W, H);
  const [c1, c2, ink] = BADGE_COLORS[colorKey] ?? BADGE_COLORS.pink;
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  roundRect(ctx, 24, 44, W - 48, H - 88, 56);
  const g = ctx.createLinearGradient(0, 44, 0, H - 44);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 10;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let size = 118;
  const family = `"Sora Variable","Plus Jakarta Sans","Segoe UI",sans-serif`;
  ctx.font = `800 ${size}px ${family}`;
  const maxWidth = W - 130;
  const measured = ctx.measureText(label).width;
  if (measured > maxWidth) {
    size = Math.floor((size * maxWidth) / measured);
    ctx.font = `800 ${size}px ${family}`;
  }
  ctx.fillText(label, W / 2, H / 2 + 4);
  return canvas.toDataURL("image/png");
}

function shapePath(kind: string, cx: number, cy: number, r: number): Path2D {
  const p = new Path2D();
  if (kind === "heart") {
    const w = r * 1.9;
    const top = cy - r * 0.75;
    p.moveTo(cx, cy + r * 0.95);
    p.bezierCurveTo(cx - w * 0.72, cy + r * 0.2, cx - w * 0.55, top - r * 0.35, cx, top + r * 0.3);
    p.bezierCurveTo(cx + w * 0.55, top - r * 0.35, cx + w * 0.72, cy + r * 0.2, cx, cy + r * 0.95);
    p.closePath();
  } else if (kind === "star") {
    for (let i = 0; i < 10; i += 1) {
      const rad = i % 2 === 0 ? r : r * 0.45;
      const a = (Math.PI / 5) * i - Math.PI / 2;
      const x = cx + Math.cos(a) * rad;
      const y = cy + Math.sin(a) * rad;
      if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
    }
    p.closePath();
  } else if (kind === "sparkle") {
    p.moveTo(cx, cy - r);
    p.quadraticCurveTo(cx + r * 0.14, cy - r * 0.14, cx + r, cy);
    p.quadraticCurveTo(cx + r * 0.14, cy + r * 0.14, cx, cy + r);
    p.quadraticCurveTo(cx - r * 0.14, cy + r * 0.14, cx - r, cy);
    p.quadraticCurveTo(cx - r * 0.14, cy - r * 0.14, cx, cy - r);
    p.closePath();
  } else if (kind === "burst") {
    const spikes = 14;
    for (let i = 0; i < spikes * 2; i += 1) {
      const rad = i % 2 === 0 ? r : r * 0.74;
      const a = (Math.PI / spikes) * i;
      const x = cx + Math.cos(a) * rad;
      const y = cy + Math.sin(a) * rad;
      if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
    }
    p.closePath();
  } else {
    // speech bubble
    const w = r * 1.9;
    const h = r * 1.35;
    const x = cx - w / 2;
    const y = cy - h / 2 - r * 0.15;
    const rr = r * 0.4;
    p.moveTo(x + rr, y);
    p.arcTo(x + w, y, x + w, y + h, rr);
    p.arcTo(x + w, y + h, x, y + h, rr);
    p.lineTo(cx - r * 0.1, y + h);
    p.lineTo(cx - r * 0.55, y + h + r * 0.55);
    p.lineTo(cx - r * 0.5, y + h);
    p.arcTo(x, y + h, x, y, rr);
    p.arcTo(x, y, x + w, y, rr);
    p.closePath();
  }
  return p;
}

function shapeToDataUrl(kind: string, color: string) {
  const SIZE = 256;
  const { canvas, ctx } = makeCanvas(SIZE, SIZE);
  const path = shapePath(kind, SIZE / 2, SIZE / 2, SIZE * 0.38);
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 6;
  ctx.lineJoin = "round";
  ctx.lineWidth = 16;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke(path);
  ctx.shadowColor = "transparent";
  ctx.fillStyle = color;
  ctx.fill(path);
  // soft highlight so flat shapes read as glossy stickers
  ctx.save();
  ctx.clip(path);
  const gloss = ctx.createLinearGradient(0, 0, 0, SIZE);
  gloss.addColorStop(0, "rgba(255,255,255,0.45)");
  gloss.addColorStop(0.5, "rgba(255,255,255,0)");
  ctx.fillStyle = gloss;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.restore();
  return canvas.toDataURL("image/png");
}

/** Data URL for a sticker id, or null when it can't be resolved (e.g. a custom sticker that was deleted). */
export function resolveStickerDataUrl(id: string, library: Sticker[]): string | null {
  const hit = cache.get(id);
  if (hit) return hit;
  let url: string | null = null;
  if (id.startsWith("emoji:")) url = emojiToDataUrl(id.slice(6));
  else if (id.startsWith("text:")) {
    const [label, color] = id.slice(5).split("|");
    url = textBadgeToDataUrl(label, color ?? "pink");
  } else if (id.startsWith("shape:")) {
    const [kind, color] = id.slice(6).split("|");
    url = shapeToDataUrl(kind, color ?? "#ff4d8d");
  } else {
    return library.find((s) => s.id === id)?.dataUrl ?? null; // custom uploads are already data URLs; no cache needed
  }
  cache.set(id, url);
  return url;
}

/** The asset map renderTemplate() expects, for exactly the stickers placed in this session. */
export function buildStickerAssets(placed: PhotoSticker[], library: Sticker[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const sticker of placed) {
    if (out[sticker.stickerId]) continue;
    const url = resolveStickerDataUrl(sticker.stickerId, library);
    if (url) out[sticker.stickerId] = url;
  }
  return out;
}
