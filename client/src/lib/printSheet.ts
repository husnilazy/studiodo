import { loadImage } from "./output";
import { OUTPUT_PRESETS } from "./templateStore";

// One place that turns a finished picture into the file sent to the printer, so a print made during the session and a
// reprint from Database Foto & Video / the event gallery come out identical.
export function composePrintSheet(source: HTMLCanvasElement | HTMLImageElement) {
  const sourceW = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const sourceH = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  // A landscape picture prints on the same 4R paper turned sideways (1800×1200), instead of being cropped to fill a
  // portrait sheet. The caller tells the printer the same orientation.
  const landscape = sourceW > sourceH;
  const canvas = document.createElement("canvas");
  canvas.width = landscape ? OUTPUT_PRESETS["4r"].height : OUTPUT_PRESETS["4r"].width;
  canvas.height = landscape ? OUTPUT_PRESETS["4r"].width : OUTPUT_PRESETS["4r"].height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas print tidak tersedia");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const scale = Math.max(canvas.width / sourceW, canvas.height / sourceH);
  const width = sourceW * scale;
  const height = sourceH * scale;
  context.drawImage(source, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.95), orientation: landscape ? ("landscape" as const) : ("portrait" as const) };
}

async function fetchAsDataUrl(url: string): Promise<string> {
  // Desktop app: the main process fetches it — a Google Drive file can't be read by the page itself (CORS).
  if (window.studiodo?.fetchImage) {
    const result = await window.studiodo.fetchImage({ url });
    if (!result.ok || !result.dataUrl) throw new Error(result.error ?? "Gambar tidak bisa diambil");
    return result.dataUrl;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Gambar tidak bisa diambil (HTTP ${response.status})`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Gagal membaca gambar"));
    reader.readAsDataURL(blob);
  });
}

/** A saved file (strip or photo) prepared exactly like the print made during the session. */
export async function prepareFileForPrint(url: string) {
  return composePrintSheet(await loadImage(await fetchAsDataUrl(url)));
}
