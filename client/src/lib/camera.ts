import type { CameraFilter, Orientation } from "./sessionStore";

export interface TetherCaptureOptions {
  bridgeUrl: string;
  slotIndex: number;
  filter: CameraFilter;
  orientation: Orientation;
}

/**
 * Live view only runs while a session needs it (the camera body overheats if
 * it streams all day). Failures are non-fatal: a bridge that lacks these
 * endpoints (e.g. the old canon-bridge.exe) just keeps whatever live view it has.
 */
export async function startTetherLiveView(bridgeUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${bridgeUrl.replace(/\/$/, "")}/liveview/start`, { method: "POST", signal: AbortSignal.timeout(20000) });
    if (!response.ok) return false;
    const payload = (await response.json()) as { ready?: boolean };
    return Boolean(payload.ready);
  } catch {
    return false;
  }
}

export function stopTetherLiveView(bridgeUrl: string): void {
  // keepalive so the request still goes out when the page is being torn down.
  fetch(`${bridgeUrl.replace(/\/$/, "")}/liveview/stop`, { method: "POST", keepalive: true }).catch(() => {});
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
  /** Display name and UI group from the bridge; older bridges omit them (the admin page has fallbacks). */
  label?: string;
  group?: "exposure" | "focus" | "color" | "output" | string;
  /** false = can only be changed on the camera body (mode dial, lens AF/MF switch). Undefined = assume writable. */
  writable?: boolean;
}
export type CameraProperties = Record<string, CameraPropertyState>;

/**
 * Wakes/prepares the camera for a session that is about to start (native bridge only): keeps it from
 * going to sleep for `holdSeconds` and switches live view on so the first frame is ready when the
 * customer reaches the camera screen. Best effort — never throws; false = camera asleep/off or no support.
 */
export async function prepareTetherCamera(bridgeUrl: string, holdSeconds = 600): Promise<boolean> {
  try {
    const response = await fetch(`${bridgeUrl.replace(/\/$/, "")}/power/prepare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holdSeconds }),
      signal: AbortSignal.timeout(15000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Back to idle: live view off so the sensor cools, and the camera is free to sleep on its own timer. Fire-and-forget. */
export function standbyTetherCamera(bridgeUrl: string): void {
  fetch(`${bridgeUrl.replace(/\/$/, "")}/power/standby`, { method: "POST", keepalive: true }).catch(() => {});
}

/** Nudges manual focus from the screen (native Canon bridge only; live view must be on and the lens set to AF). */
export async function driveTetherFocus(bridgeUrl: string, direction: "near" | "far", step: 1 | 2 | 3): Promise<void> {
  const response = await fetch(`${bridgeUrl.replace(/\/$/, "")}/focus/drive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ direction, step }),
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? `Fokus manual gagal (${response.status})`);
  }
}

/**
 * Re-applies the booth's saved camera preset (ISO/shutter/aperture/…). The camera forgets
 * settings changed over USB when it is power-cycled, so the kiosk pushes the preset again
 * when a session's live view starts. Best effort: never throws, returns the failed names.
 */
export async function applyCameraPreset(bridgeUrl: string, preset: Record<string, string> | undefined): Promise<string[]> {
  if (!preset || Object.keys(preset).length === 0) return [];
  try {
    const results = await setCameraProperties(bridgeUrl, preset);
    return Object.entries(results).filter(([, r]) => !r.ok).map(([name]) => name);
  } catch (error) {
    console.warn("Preset kamera gagal diterapkan", error);
    return Object.keys(preset);
  }
}

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
  /** Undefined from older bridges that don't report it — treat as connected. */
  cameraConnected?: boolean;
  digicamUrl?: string;
  /** Native bridge only: which SDK found the camera ("canon" | "sony"), or "none" while nothing is connected. */
  engine?: string;
  /** Native bridge only: model name reported by the camera. */
  camera?: string;
  /** Native bridge only: "ready", "asleep" (camera slept/was switched off after being connected) or "none". */
  state?: string;
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
    const payload = (await response.json()) as { ok?: boolean; digicamReachable?: boolean; cameraConnected?: boolean; digicamUrl?: string; engine?: string; camera?: string; state?: string; error?: string | null };
    // The native bridge talks to the camera itself — there is no digiCamControl to reach, so "reachable" is just "answered".
    const digicamReachable = payload.engine ? true : payload.digicamReachable;
    return { ok: Boolean(payload.ok), digicamReachable, cameraConnected: payload.cameraConnected, digicamUrl: payload.digicamUrl, engine: payload.engine, camera: payload.camera, state: payload.state, error: payload.error ?? undefined };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Bridge tidak terjangkau" };
  }
}

export interface DetectedCamera {
  url: string;
  /** Human readable, e.g. "Canon EOS 1300D (Canon SDK)". */
  name: string;
  engine: "native" | "digicam";
  health: TetherBridgeHealth;
}

const BRIDGE_CANDIDATES: { url: string; engine: "native" | "digicam" }[] = [
  { url: "http://127.0.0.1:5514", engine: "native" },
  { url: "http://localhost:5510", engine: "digicam" },
];

/** Probes the known bridges on this PC and returns the ones that currently have a camera connected. */
export async function detectTetherCameras(): Promise<DetectedCamera[]> {
  const results = await Promise.all(
    BRIDGE_CANDIDATES.map(async (candidate) => ({ candidate, health: await checkTetherBridge(candidate.url) })),
  );
  return results
    .filter(({ health }) => health.ok && health.cameraConnected !== false && (health.engine ? health.state !== "asleep" && health.engine !== "none" : health.digicamReachable))
    .map(({ candidate, health }) => ({
      url: candidate.url,
      engine: candidate.engine,
      health,
      name: candidate.engine === "native"
        ? `${health.camera || "Kamera"} (${health.engine === "sony" ? "Sony" : "Canon"} SDK)`
        : `Kamera via digiCamControl`,
    }));
}
