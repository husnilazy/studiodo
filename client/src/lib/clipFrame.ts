import { loadImage } from "./output";
import { paintBackground, paintSlotFrame, footerAccent, layoutSlots } from "./stripRenderer";
import type { LocalTemplate } from "./templateStore";
import type { StripLayout, StripVisualTemplate } from "./boothConfigStore";

export interface ClipFrameStyle {
  template: LocalTemplate | null;
  accentColor: string;
  stripLayout: StripLayout;
  stripTemplate: StripVisualTemplate;
}

export interface PreparedClipFrameStyle extends ClipFrameStyle {
  frameImage: HTMLImageElement | null;
  // A custom WYSIWYG frame graphic isn't a simple border — it's a mostly
  // opaque canvas with a handful of fully transparent rectangular holes cut
  // out for each still photo (confirmed by sampling a real one: slot centers
  // read alpha 0, everywhere else reads alpha 255). Overlaying the whole
  // thing on a full-bleed video/GIF mostly HIDES the clip behind the opaque
  // parts instead of framing it. The live clip goes into one hole instead —
  // its last slot, by convention — leaving the others as plain background
  // since the actual photos for them don't exist yet this early in the
  // session.
  clipSlot: { x: number; y: number; w: number; h: number } | null;
  // width/height ratio the compositing canvas should use so the slot's
  // normalized rect lines up with the template's own proportions.
  canvasAspect: number | null;
}

// The auto-recorded GIF/video used to be a plain, unbranded clip while the
// still photos went through the same frame/border treatment as the printed
// strip — this is what makes a captured frame match that treatment. Loading
// the template's frame image is async, so it's done once up front rather
// than per-frame (a GIF/video tick fires every ~66-150ms and must stay a
// synchronous canvas draw, or capture stutters).
export async function prepareClipFrameStyle(style: ClipFrameStyle): Promise<PreparedClipFrameStyle> {
  const frameImage = style.template ? await loadImage(style.template.frameDataUrl) : null;
  const clipSlot = style.template?.slots?.length ? style.template.slots[style.template.slots.length - 1] : null;
  const canvasAspect = style.template ? style.template.canvasWidth / style.template.canvasHeight : null;
  return { ...style, frameImage, clipSlot, canvasAspect };
}

// Picks a compositing canvas size for a clip: when a custom template is
// active, keeps ITS aspect ratio (so the normalized slot rect lines up)
// while capping the longer side at `maxSize` for GIF file size / encode
// time; otherwise just scales the camera's own aspect down to fit.
export function pickClipCanvasSize(sourceWidth: number, sourceHeight: number, style: PreparedClipFrameStyle, maxSize: number) {
  const aspect = style.canvasAspect ?? sourceWidth / sourceHeight;
  const width = aspect >= 1 ? maxSize : Math.max(1, Math.round(maxSize * aspect));
  const height = aspect >= 1 ? Math.max(1, Math.round(maxSize / aspect)) : maxSize;
  return { width, height };
}

function drawSourceCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const sw = width / scale;
  const sh = height / scale;
  const sx = (sourceWidth - sw) / 2;
  const sy = (sourceHeight - sh) / 2;
  ctx.drawImage(source, sx, sy, sw, sh, x, y, width, height);
}

// Draws one live frame into `ctx` at (0,0,width,height) with the same
// branding the photo output gets: the tenant's custom WYSIWYG frame overlay
// (clip placed in its own slot hole, matching how a photo fills a slot) when
// one is selected, or — when the booth just uses the default strip look —
// the same background/border/footer accent `renderPhotoStrip` paints around
// each photo, applied here to a single full-bleed "slot" standing in for the
// whole clip.
export function drawClipFrame(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
  style: PreparedClipFrameStyle,
) {
  if (style.frameImage && style.clipSlot) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    const slot = style.clipSlot;
    drawSourceCover(ctx, source, sourceWidth, sourceHeight, slot.x * width, slot.y * height, slot.w * width, slot.h * height);
    ctx.drawImage(style.frameImage, 0, 0, width, height);
    return;
  }

  paintBackground(ctx, style.stripTemplate, width, height, style.accentColor);
  const [slot] = layoutSlots("classic-vertical", 1, width, height);
  drawSourceCover(ctx, source, sourceWidth, sourceHeight, slot.x, slot.y, slot.w, slot.h);
  paintSlotFrame(ctx, style.stripTemplate, slot, style.accentColor);
  footerAccent(ctx, style.stripTemplate, width, height, style.accentColor);
}
