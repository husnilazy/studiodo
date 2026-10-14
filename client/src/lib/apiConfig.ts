// Where the kiosk's local pairing config (remote API base URL + kiosk key)
// lives. In Electron this is set once from the "Setup / Pair kiosk ini"
// screen; in a plain browser dev session it falls back to same-origin "/api"
// so `npm run dev` keeps working without any pairing step.
const API_BASE_URL_KEY = "studiodo-api-base-url";
const KIOSK_KEY_KEY = "studiodo-kiosk-key";
const DEVICE_ID_KEY = "studiodo-device-id";
const DEVICE_TOKEN_KEY = "studiodo-device-token"; // browser/dev fallback only: in the Electron app the secret lives in the main process

function readLocalStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // ignore — pairing just has to be redone if storage is unavailable
  }
}

// In dev (npm run dev), the client is served by Vite itself, so a relative
// "/api" correctly proxies to the local server (see client/vite.config.ts).
// A packaged Electron build has no such server — it loads dist-client/index.html
// straight off disk (file://), where a relative "/api" resolves to nowhere.
// VITE_DEFAULT_API_BASE_URL (baked in at build time via client/.env.production)
// gives a production build a real fallback so admin login etc. work the
// instant it's installed, before any kiosk pairing has happened at all —
// pairing (below) only needs to override this for a tenant on a different
// deployment.
const DEFAULT_API_BASE_URL = (import.meta.env.VITE_DEFAULT_API_BASE_URL as string | undefined)?.replace(/\/$/, "") || "/api";

export function getApiBaseUrl(): string {
  const stored = readLocalStorage(API_BASE_URL_KEY);
  return stored ? stored.replace(/\/$/, "") : DEFAULT_API_BASE_URL;
}

export function setApiBaseUrl(url: string | null) {
  writeLocalStorage(API_BASE_URL_KEY, url ? url.trim().replace(/\/$/, "") : null);
}

export function getKioskKey(): string | null {
  return readLocalStorage(KIOSK_KEY_KEY);
}

export function setKioskKey(key: string | null) {
  writeLocalStorage(KIOSK_KEY_KEY, key ? key.trim() : null);
}

export function clearKioskPairing() {
  // Keep the device id: a newly issued key should bind to this same computer. The per-device secret belongs to the old
  // key, so it goes away with it.
  setKioskKey(null);
  void setDeviceToken(null);
}

export function isKioskPaired(): boolean {
  return Boolean(getKioskKey());
}

// ---- device identity -------------------------------------------------------------------------------------------------
// The Electron app reports a hardware-derived id and keeps a per-device secret in its main process / OS keystore (see
// electron/device.cjs). initDeviceIdentity() must finish before the first request (main.tsx awaits it). Outside Electron
// (browser dev, the public web build) there is no hardware id: a random per-profile id is used and no secret exists, so such
// a client can never activate a booth in production (the server checks both).
let identity: { deviceId: string; token: string | null } | null = null;

export async function initDeviceIdentity(): Promise<void> {
  try {
    const result = await window.studiodo?.getDeviceIdentity?.();
    if (result?.deviceId) identity = { deviceId: result.deviceId, token: result.token ?? null };
  } catch {
    // no Electron bridge: stay on the browser fallback
  }
}

/** The id this install sends with every kiosk request: the one bound at activation, else the hardware id, else a random one. */
export function getDeviceId(): string {
  const existing = readLocalStorage(DEVICE_ID_KEY);
  if (existing) return existing;
  const generated = identity?.deviceId ?? crypto.randomUUID();
  writeLocalStorage(DEVICE_ID_KEY, generated);
  return generated;
}

/** What the hardware says this computer is (falls back to the stored id when there is no Electron bridge). */
export function getHardwareDeviceId(): string {
  return identity?.deviceId ?? getDeviceId();
}

/** Remember which id the server bound this install to (activation, or the one-time upgrade of an older pairing). */
export function setBoundDeviceId(id: string) {
  writeLocalStorage(DEVICE_ID_KEY, id);
}

export function getDeviceToken(): string | null {
  return identity ? identity.token : readLocalStorage(DEVICE_TOKEN_KEY);
}

export async function setDeviceToken(token: string | null): Promise<void> {
  if (identity) {
    identity.token = token;
    try {
      if (token) await window.studiodo?.setDeviceToken?.(token);
      else await window.studiodo?.clearDeviceToken?.();
    } catch {
      // the in-memory value still works for this run; the next activation fixes the stored copy
    }
    return;
  }
  writeLocalStorage(DEVICE_TOKEN_KEY, token);
}
