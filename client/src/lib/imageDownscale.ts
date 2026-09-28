// Frame PNGs come straight from admins' design tools (Photoshop/Canva exports),
// which are often 4000px+ on the long edge — far beyond what any output preset
// here needs (A4 tops out at 3508px). Sent raw as a base64 JSON body, a file
// like that blows past the server's request size limit and the save just
// fails. Re-encoding through a canvas at a sane cap keeps frames well under
// that limit while staying sharp enough for print.
const MAX_DIMENSION = 3000;

export async function fileToDataUrl(file: File, maxDimension = MAX_DIMENSION): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context tidak tersedia");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return canvas.toDataURL("image/png");
}
