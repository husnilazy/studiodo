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

export interface CameraPropertyState {
  value: string | null;
  choices: string[];
  error?: string;
}
export type CameraProperties = Record<string, CameraPropertyState>;

/**
 * Reads ISO/shutter speed/aperture/white balance off the tethered camera via
 * electron/digicam-bridge.cjs's /properties (digiCamControl only — the
 * separate closed-source canon-bridge.exe doesn't implement this, so a
 * kiosk tethered that way will just get a failed fetch here, handled by the
 * caller same as "bridge doesn't support this").
 */
export async function getCameraProperties(bridgeUrl: string): Promise<CameraProperties> {
  const response = await fetch(`${bridgeUrl.replace(/\/$/, "")}/properties`, { signal: AbortSignal.timeout(6000) });
  if (!response.ok) throw new Error(`Gagal membaca pengaturan kamera (${response.status})`);
  return response.json();
}

/** Only sends the properties present in `values` — the bridge applies each one in turn and reports per-property success/failure (a camera can reject a value the UI's own choice list still listed, e.g. it changed mid-request). */
export async function setCameraProperties(bridgeUrl: string, values: Record<string, string>): Promise<Record<string, { ok: boolean; error?: string }>> {
  const response = await fetch(`${bridgeUrl.replace(/\/$/, "")}/properties`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Gagal mengubah pengaturan kamera (${response.status})`);
  const payload = (await response.json()) as { results?: Record<string, { ok: boolean; error?: string }> };
  return payload.results ?? {};
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
