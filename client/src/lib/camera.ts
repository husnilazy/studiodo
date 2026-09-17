import type { CameraFilter, Orientation } from "./sessionStore";

export interface TetherCaptureOptions {
  bridgeUrl: string;
  slotIndex: number;
  filter: CameraFilter;
  orientation: Orientation;
}

export async function focusTetherCamera(bridgeUrl: string): Promise<void> {
  const response = await fetch(`${bridgeUrl.replace(/\/$/, "")}/focus`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error(`Autofocus kamera gagal (${response.status})`);
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

export interface TetherBridgeHealth {
  ok: boolean;
  digicamReachable?: boolean;
  digicamUrl?: string;
  error?: string;
}

/**
 * Cek status bridge kamera (mis. electron/digicam-bridge.cjs).
 * Dipakai admin panel untuk menampilkan status koneksi live.
 */
export async function checkTetherBridge(bridgeUrl: string): Promise<TetherBridgeHealth> {
  try {
    const response = await fetch(`${bridgeUrl.replace(/\/$/, "")}/health`, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return { ok: false, error: `Bridge merespons status ${response.status}` };
    const payload = (await response.json()) as { ok?: boolean; digicamReachable?: boolean; digicamUrl?: string };
    return { ok: Boolean(payload.ok), digicamReachable: payload.digicamReachable, digicamUrl: payload.digicamUrl };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Bridge tidak terjangkau" };
  }
}
