import type { LocalTemplate } from "./templateStore";
import { composeFilterCss, type CameraFilter, type ColorCorrection, type PhotoSticker } from "./sessionStore";

export function drawImageCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  mirror = false,
) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = (image.naturalHeight - sourceHeight) / 2;
  if (mirror) {
    // Flip only this photo within its own slot (translate to the slot's
    // right edge, then scale -1 so the draw happens "backwards" into it) —
    // the frame artwork and any stickers drawn afterward are untouched, only
    // ever tied to slot position, not the flip.
    ctx.save();
    ctx.translate(x + width, y);
    ctx.scale(-1, 1);
    ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
    ctx.restore();
  } else {
    ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
  }
}

export function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Gagal memuat gambar: ${src}`));
    image.src = src;
  });
}

export async function renderTemplate(
  photos: string[],
  template: LocalTemplate,
  canvas: HTMLCanvasElement,
  stickers: PhotoSticker[] = [],
  stickerAssets: Record<string, string> = {},
  filter: CameraFilter = "normal",
  photoMap: Record<number, number> = {},
  correction: ColorCorrection = { brightness: 100, contrast: 100, saturation: 100 },
  mirror = false,
) {
  canvas.width = template.canvasWidth;
  canvas.height = template.canvasHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak tersedia");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const photoImages = await Promise.all(photos.map(loadImage));
  template.slots.forEach((slot, index) => {
    const image = photoImages[photoMap[index] ?? index];
    if (!image) return;
    ctx.filter = composeFilterCss(filter, correction);
    drawImageCover(ctx, image, slot.x * canvas.width, slot.y * canvas.height, slot.w * canvas.width, slot.h * canvas.height, mirror);
  });
  ctx.filter = "none";

  const frame = await loadImage(template.frameDataUrl);
  ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
  for (const sticker of stickers) {
    const source = stickerAssets[sticker.stickerId];
    if (!source) continue;
    const image = await loadImage(source);
    const size = Math.min(canvas.width, canvas.height) * 0.16 * sticker.scale;
    ctx.drawImage(image, sticker.x * canvas.width - size / 2, sticker.y * canvas.height - size / 2, size, size);
  }
}
