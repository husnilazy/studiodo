// Screenshots are shrunk in the browser before they are sent: a phone or 4K screenshot can be many MB, while the server accepts at most
// 4 MB per picture (and Vercel 4.5 MB per request). GIFs are sent as they are (shrinking would flatten the animation).

const MAX_SIDE = 1600;
const MAX_BYTES = 3.6 * 1024 * 1024;

export async function shrinkImage(file: File): Promise<File> {
  if (!/^image\//.test(file.type)) throw new Error("File harus berupa gambar (PNG, JPG, WebP, atau GIF).");
  if (file.type === "image/gif") {
    if (file.size > MAX_BYTES) throw new Error("GIF terlalu besar (maksimal 3,5 MB).");
    return file;
  }
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error("Gambar tidak bisa dibaca. Coba format PNG atau JPG."); }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const g = canvas.getContext("2d");
  if (!g) throw new Error("Gambar tidak bisa diproses di browser ini.");
  g.fillStyle = "#fff"; // JPEG has no transparency
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  for (const quality of [0.85, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= MAX_BYTES) return new File([blob], (file.name || "gambar").replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  }
  throw new Error("Gambar masih terlalu besar. Potong atau perkecil dulu.");
}

/** Pictures pasted from the clipboard (e.g. Win+Shift+S then Ctrl+V) or dropped onto the chat. */
export function imagesFrom(data: DataTransfer | null): File[] {
  return Array.from(data?.files ?? []).filter((f) => f.type.startsWith("image/"));
}
