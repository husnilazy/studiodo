import type { CameraFilter, Orientation } from "./sessionStore";

export interface TetherCaptureOptions {
  bridgeUrl: string;
  slotIndex: number;
  filter: CameraFilter;
  orientation: Orientation;
}

/**
 * Canon EOS Utility/SDK bridge contract:
 * POST {bridgeUrl}/capture with JSON options and return either an image
 * response (image/jpeg) or JSON { dataUrl } / { imageUrl }.
 */
export async function captureFromTether(options: TetherCaptureOptions): Promise<Blob> {
  const response = await fetch(`${options.bridgeUrl.replace(/\/$/, "")}/capture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slotIndex: options.slotIndex,
      filter: options.filter,
      orientation: options.orientation,
    }),
  });

  if (!response.ok) {
    throw new Error(`Bridge kamera gagal (${response.status})`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.startsWith("image/")) {
    return response.blob();
  }

  const payload = (await response.json()) as { dataUrl?: string; imageUrl?: string };
  if (payload.dataUrl) {
    const result = await fetch(payload.dataUrl);
    return result.blob();
  }
  if (payload.imageUrl) {
    const result = await fetch(payload.imageUrl);
    if (!result.ok) throw new Error("Foto dari bridge tidak dapat diunduh");
    return result.blob();
  }

  throw new Error("Respons bridge tidak berisi foto");
}
