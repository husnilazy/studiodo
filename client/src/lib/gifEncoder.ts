import { GIFEncoder, quantize, applyPalette } from "gifenc";

export interface GifFrame {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Encode a sequence of RGBA frames (e.g. from canvas getImageData) into a
 * real animated GIF blob — used for the "GIF" package output, which used to
 * be a .webm video mislabeled as a gif (video elements can't even play a
 * genuine .gif, so that couldn't have been swapped in without this).
 */
export function encodeGif(frames: GifFrame[], delayMs: number): Blob {
  const gif = GIFEncoder();
  for (const frame of frames) {
    const palette = quantize(frame.data, 256);
    const index = applyPalette(frame.data, palette);
    gif.writeFrame(index, frame.width, frame.height, { palette, delay: delayMs });
  }
  gif.finish();
  return new Blob([gif.bytes().slice().buffer], { type: "image/gif" });
}

/** Same output as encodeGif, but hands control back to the browser between frames so the UI (spinners, taps) keeps
 *  animating while a long GIF is built — quantizing many large frames in one synchronous loop froze the whole kiosk. */
export async function encodeGifAsync(frames: GifFrame[], delayMs: number): Promise<Blob> {
  const gif = GIFEncoder();
  for (const frame of frames) {
    const palette = quantize(frame.data, 256);
    const index = applyPalette(frame.data, palette);
    gif.writeFrame(index, frame.width, frame.height, { palette, delay: delayMs });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  gif.finish();
  return new Blob([gif.bytes().slice().buffer], { type: "image/gif" });
}
