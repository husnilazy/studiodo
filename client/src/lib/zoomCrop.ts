// Digital zoom for the capture screen. The live view is scaled with CSS; the saved photo has to match what the customer
// framed, so the captured image is cropped to the same centered region (1 / zoom of the width and height).

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 3;
export const ZOOM_STEP = 0.25;

export function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value / ZOOM_STEP) * ZOOM_STEP));
}

/** Centered crop of an image blob. Returns the original blob when zoom <= 1 or the crop is not possible. */
export async function cropBlobCenter(blob: Blob, zoom: number, quality = 0.92): Promise<Blob> {
  if (zoom <= 1.001) return blob;
  try {
    const bitmap = await createImageBitmap(blob);
    const width = Math.max(1, Math.round(bitmap.width / zoom));
    const height = Math.max(1, Math.round(bitmap.height / zoom));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return blob;
    }
    ctx.drawImage(bitmap, Math.round((bitmap.width - width) / 2), Math.round((bitmap.height - height) / 2), width, height, 0, 0, width, height);
    bitmap.close();
    return await new Promise<Blob>((resolve) => canvas.toBlob((cropped) => resolve(cropped ?? blob), "image/jpeg", quality));
  } catch {
    return blob;
  }
}
