// Where the kiosk's local pairing config (remote API base URL + kiosk key)
// lives. In Electron this is set once from the "Setup / Pair kiosk ini"
// screen; in a plain browser dev session it falls back to same-origin "/api"
// so `npm run dev` keeps working without any pairing step.
const API_BASE_URL_KEY = "studiodo-api-base-url";
const KIOSK_KEY_KEY = "studiodo-kiosk-key";
const DEVICE_ID_KEY = "studiodo-device-id";

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
  // Keep the device id: a newly issued key should bind to this same computer.
  setKioskKey(null);
}

export function isKioskPaired(): boolean {
  return Boolean(getKioskKey());
}

// A stable per-install fingerprint — generated once, persisted in this profile's
// localStorage, never regenerated. This is what "1 license = 1 device" locks
// against server-side (see server/middleware/kioskAuth.ts): the raw kiosk key
// alone is copyable, but pasting it into a second install produces a *different*
// device id there (that profile has never set one), so the server can tell the
// two apart and refuses the second device until an admin explicitly resets it.
export function getDeviceId(): string {
  const existing = readLocalStorage(DEVICE_ID_KEY);
  if (existing) return existing;
  const generated = crypto.randomUUID();
  writeLocalStorage(DEVICE_ID_KEY, generated);
  return generated;
}
