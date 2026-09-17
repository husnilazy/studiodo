import { drawImageCover, loadImage } from "./output";
import { OUTPUT_PRESETS } from "./templateStore";
import type { CameraFilter } from "./sessionStore";
import { FILTER_CSS } from "./sessionStore";
import type { StripLayout, StripVisualTemplate } from "./boothConfigStore";

export interface StripRenderOptions {
  accentColor: string;
  stripLayout: StripLayout;
  stripTemplate: StripVisualTemplate;
  outputPreset: string;
  filter: CameraFilter;
}

interface Slot {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
}

function seededRandom(seed: number) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

// ---------- Layouts: menghitung posisi tiap foto di canvas ----------

function layoutSlots(layout: StripLayout, count: number, width: number, height: number): Slot[] {
  const pad = Math.round(Math.min(width, height) * 0.035);

  switch (layout) {
    case "classic-vertical": {
      // Strip klasik: 1 kolom, foto ditumpuk vertikal.
      const rows = Math.max(1, count);
      const photoWidth = width - pad * 2;
      const photoHeight = (height - pad * (rows + 1)) / rows;
      return Array.from({ length: count }, (_, i) => ({
        x: pad,
        y: pad + i * (photoHeight + pad),
        w: photoWidth,
        h: photoHeight,
      }));
    }
    case "classic-3cut": {
      // Gaya photobooth Korea: selalu 3 foto, 1 kolom.
      const n = Math.min(3, Math.max(1, count));
      const photoWidth = width - pad * 2;
      const photoHeight = (height - pad * (n + 1)) / n;
      return Array.from({ length: n }, (_, i) => ({
        x: pad,
        y: pad + i * (photoHeight + pad),
        w: photoWidth,
        h: photoHeight,
      }));
    }
    case "grid-2x2": {
      const n = Math.min(4, Math.max(1, count));
      const columns = 2;
      const rows = 2;
      const photoWidth = (width - pad * (columns + 1)) / columns;
      const photoHeight = (height - pad * (rows + 1)) / rows;
      return Array.from({ length: n }, (_, i) => {
        const column = i % columns;
        const row = Math.floor(i / columns);
        return { x: pad + column * (photoWidth + pad), y: pad + row * (photoHeight + pad), w: photoWidth, h: photoHeight };
      });
    }
    case "4r":
    case "grid-2x3": {
      const columns = 2;
      const rows = Math.max(1, Math.ceil(count / columns));
      const photoWidth = (width - pad * (columns + 1)) / columns;
      const photoHeight = (height - pad * (rows + 1)) / rows;
      return Array.from({ length: count }, (_, i) => {
        const column = i % columns;
        const row = Math.floor(i / columns);
        return { x: pad + column * (photoWidth + pad), y: pad + row * (photoHeight + pad), w: photoWidth, h: photoHeight };
      });
    }
    case "wide-filmstrip": {
      // Semua foto sejajar dalam satu baris memanjang, gaya klise film.
      const photoHeight = height - pad * 2;
      const photoWidth = (width - pad * (count + 1)) / Math.max(1, count);
      return Array.from({ length: count }, (_, i) => ({
        x: pad + i * (photoWidth + pad),
        y: pad,
        w: photoWidth,
        h: photoHeight,
      }));
    }
    case "polaroid": {
      // Kartu polaroid tersebar, sedikit dirotasi, border bawah lebih tebal.
      const columns = count <= 2 ? 1 : 2;
      const rows = Math.max(1, Math.ceil(count / columns));
      const cardWidth = (width - pad * (columns + 1)) / columns;
      const cardHeight = (height - pad * (rows + 1)) / rows;
      const inset = cardWidth * 0.08;
      const bottomExtra = cardHeight * 0.16;
      return Array.from({ length: count }, (_, i) => {
        const column = i % columns;
        const row = Math.floor(i / columns);
        return {
          x: pad + column * (cardWidth + pad) + inset,
          y: pad + row * (cardHeight + pad) + inset,
          w: cardWidth - inset * 2,
          h: cardHeight - inset * 2 - bottomExtra,
        };
      });
    }
    default:
      return layoutSlots("classic-vertical", count, width, height);
  }
}

// ---------- Visual templates: background + border di sekitar tiap slot ----------

function paintBackground(ctx: CanvasRenderingContext2D, template: StripVisualTemplate, width: number, height: number, accentColor: string) {
  switch (template) {
    case "gradient": {
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "#ffffff");
      gradient.addColorStop(1, `${accentColor}22`);
      ctx.fillStyle = gradient;
      break;
    }
    case "pastel-pop": {
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, "#ffd9ec");
      gradient.addColorStop(0.5, "#e0d4ff");
      gradient.addColorStop(1, "#d0f4ea");
      ctx.fillStyle = gradient;
      break;
    }
    case "sunset": {
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "#ff9a6b");
      gradient.addColorStop(0.55, "#ff6b9a");
      gradient.addColorStop(1, "#6b5bff");
      ctx.fillStyle = gradient;
      break;
    }
    case "neon-glow":
      ctx.fillStyle = "#0a0a12";
      break;
    case "film-noir":
      ctx.fillStyle = "#111111";
      break;
    case "retro-cream":
      ctx.fillStyle = "#f3e6d0";
      break;
    case "confetti":
      ctx.fillStyle = "#ffffff";
      break;
    case "mint-fresh": {
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "#e3fbf1");
      gradient.addColorStop(1, "#bdf0dc");
      ctx.fillStyle = gradient;
      break;
    }
    case "bubblegum": {
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, "#ffd1f0");
      gradient.addColorStop(1, "#d6c8ff");
      ctx.fillStyle = gradient;
      break;
    }
    case "solid":
    default:
      ctx.fillStyle = "#ffffff";
      break;
  }
  ctx.fillRect(0, 0, width, height);

  if (template === "confetti") {
    const random = seededRandom(42);
    const colors = ["#FF6B9A", "#7C3AED", "#22D3EE", "#FBBF24", "#34D399"];
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = colors[i % colors.length];
      const x = random() * width;
      const y = random() * height;
      const size = 4 + random() * 8;
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function paintSlotFrame(ctx: CanvasRenderingContext2D, template: StripVisualTemplate, slot: Slot, accentColor: string) {
  switch (template) {
    case "neon-glow":
      ctx.save();
      ctx.shadowColor = accentColor;
      ctx.shadowBlur = 24;
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 4;
      ctx.strokeRect(slot.x, slot.y, slot.w, slot.h);
      ctx.restore();
      break;
    case "film-noir":
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.strokeRect(slot.x + 1.5, slot.y + 1.5, slot.w - 3, slot.h - 3);
      break;
    case "retro-cream":
      ctx.strokeStyle = "#8a6a45";
      ctx.lineWidth = 3;
      ctx.strokeRect(slot.x + 1.5, slot.y + 1.5, slot.w - 3, slot.h - 3);
      break;
    default:
      break;
  }
}

function footerAccent(ctx: CanvasRenderingContext2D, template: StripVisualTemplate, width: number, height: number, accentColor: string) {
  const barHeight = Math.round(height * 0.0035) + 4;
  ctx.fillStyle = template === "film-noir" || template === "neon-glow" ? "#ffffff" : accentColor;
  ctx.fillRect(0, height - barHeight, width, barHeight);
}

/**
 * Render strip foto ke canvas sesuai kombinasi layout (susunan foto) dan
 * visual template (background/border) yang dipilih admin.
 */
export async function renderPhotoStrip(photoUrls: string[], canvas: HTMLCanvasElement, options: StripRenderOptions) {
  const preset = OUTPUT_PRESETS[options.outputPreset as keyof typeof OUTPUT_PRESETS] ?? OUTPUT_PRESETS["4r"];
  const width = preset.width;
  const height = preset.height;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak tersedia");

  paintBackground(ctx, options.stripTemplate, width, height, options.accentColor);

  const slots = layoutSlots(options.stripLayout, photoUrls.length, width, height);
  const images = await Promise.all(photoUrls.slice(0, slots.length).map(loadImage));

  for (let i = 0; i < slots.length; i++) {
    const image = images[i];
    if (!image) continue;
    const slot = slots[i];
    ctx.save();
    if (options.stripLayout === "polaroid") {
      // Kartu putih di belakang tiap foto (efek polaroid), sedikit dirotasi.
      const rotation = (i % 2 === 0 ? -1 : 1) * (2 + (i % 3));
      const cx = slot.x + slot.w / 2;
      const cy = slot.y + slot.h / 2;
      ctx.translate(cx, cy);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
      const cardPad = slot.w * 0.06;
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "rgba(0,0,0,0.25)";
      ctx.shadowBlur = 14;
      ctx.fillRect(slot.x - cardPad, slot.y - cardPad, slot.w + cardPad * 2, slot.h + cardPad * 2.6);
      ctx.shadowBlur = 0;
    }
    ctx.filter = FILTER_CSS[options.filter] ?? "none";
    drawImageCover(ctx, image, slot.x, slot.y, slot.w, slot.h);
    ctx.filter = "none";
    paintSlotFrame(ctx, options.stripTemplate, slot, options.accentColor);
    ctx.restore();
  }

  footerAccent(ctx, options.stripTemplate, width, height, options.accentColor);
}

export const STRIP_LAYOUT_LABELS: Record<StripLayout, string> = {
  "classic-vertical": "Classic Vertical — 1 kolom ditumpuk",
  "classic-3cut": "3-Cut — gaya photobooth Korea",
  "grid-2x2": "Grid 2×2",
  "grid-2x3": "Grid 2×3",
  "wide-filmstrip": "Wide Filmstrip — 1 baris memanjang",
  polaroid: "Polaroid — kartu tersebar",
  "4r": "4R Grid (default lama) — sama seperti Grid 2×3",
};

export const STRIP_TEMPLATE_LABELS: Record<StripVisualTemplate, string> = {
  solid: "Solid — putih polos",
  gradient: "Gradient — putih ke aksen",
  "pastel-pop": "Pastel Pop",
  sunset: "Sunset",
  "neon-glow": "Neon Glow",
  "film-noir": "Film Noir",
  "retro-cream": "Retro Cream",
  confetti: "Confetti",
  "mint-fresh": "Mint Fresh",
  bubblegum: "Bubblegum",
};
