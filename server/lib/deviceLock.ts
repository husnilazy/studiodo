import crypto from "node:crypto";

// Pure rules for "one key = one computer". No I/O here so every branch can be unit-tested; the DB work lives in
// lib/kioskAccess.ts and the routes.
//
// The model, strongest part first:
//  1. A key only becomes usable after a tenant admin logs in on the computer and activates it (routes/kioskKeys.ts).
//     Activation binds the computer's hardware-derived id AND mints a per-device secret.
//  2. Every kiosk request must carry the device id; keys with a secret also need the secret (x-device-token).
//  3. Keys bound before activation existed ("legacy": bound, no secret) keep working on their computer until the app
//     upgrades itself and receives a secret.

export type AccessRow = { boundDeviceId: string | null; deviceTokenHash: string | null };

export type AccessVerdict =
  | { ok: true }
  | { ok: false; status: 403; code: "device_required" | "activation_required" | "kiosk_device_mismatch" | "device_token_invalid"; error: string };

const DEVICE_ID = /^[A-Za-z0-9._:-]{8,128}$/;
export const isValidDeviceId = (v: unknown): v is string => typeof v === "string" && DEVICE_ID.test(v);

export const hashDeviceToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
export const newDeviceToken = () => crypto.randomBytes(32).toString("hex");

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Decides whether a request carrying (deviceId, deviceToken) may use this key. */
export function checkDeviceAccess(row: AccessRow, deviceId: string | null, deviceToken: string | null): AccessVerdict {
  if (!deviceId || !isValidDeviceId(deviceId)) {
    return { ok: false, status: 403, code: "device_required", error: "Aplikasi kiosk ini terlalu lama atau tidak mengirim identitas perangkat. Perbarui aplikasi STUDIODO ke versi terbaru." };
  }
  if (!row.boundDeviceId) {
    return { ok: false, status: 403, code: "activation_required", error: "Key ini belum diaktifkan di komputer. Masuk dengan akun tenant di aplikasi, lalu masukkan key untuk mengaktifkannya." };
  }
  if (row.boundDeviceId !== deviceId) {
    return { ok: false, status: 403, code: "kiosk_device_mismatch", error: "Kiosk key ini sudah terpasang di device lain. Minta admin reset device dari dashboard Kiosk untuk memindahkannya ke device ini." };
  }
  if (row.deviceTokenHash) {
    if (!deviceToken || !safeEqualHex(hashDeviceToken(deviceToken), row.deviceTokenHash)) {
      return { ok: false, status: 403, code: "device_token_invalid", error: "Sesi perangkat tidak valid. Aktifkan ulang kiosk ini dengan login akun tenant dan key." };
    }
  }
  return { ok: true };
}

// --- reset allowance -------------------------------------------------------------------------------------------------

/** A tenant may move a key to another computer this many times per window; more than that needs a STUDIODO admin. */
export const MAX_SELF_RESETS = 2;
export const RESET_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function resetAllowance(count: number, windowStart: Date | null, now = Date.now()): { allowed: boolean; nextCount: number; nextWindowStart: Date } {
  const expired = !windowStart || now - windowStart.getTime() > RESET_WINDOW_MS;
  const used = expired ? 0 : count;
  return { allowed: used < MAX_SELF_RESETS, nextCount: used + 1, nextWindowStart: expired ? new Date(now) : (windowStart as Date) };
}

// --- failed-auth throttle ----------------------------------------------------------------------------------------------

/** Counts rejected kiosk authentications per client IP so a script can't hammer the key lookup. In-memory, single process. */
export function createAuthThrottle(opts: { max: number; windowMs: number; now?: () => number }) {
  const now = opts.now ?? Date.now;
  const hits = new Map<string, { n: number; start: number }>();
  return {
    blocked(ip: string): boolean {
      const h = hits.get(ip);
      return !!h && now() - h.start < opts.windowMs && h.n >= opts.max;
    },
    fail(ip: string) {
      const h = hits.get(ip);
      if (!h || now() - h.start >= opts.windowMs) hits.set(ip, { n: 1, start: now() });
      else h.n += 1;
      if (hits.size > 5000) for (const [k, v] of hits) if (now() - v.start >= opts.windowMs) hits.delete(k);
    },
  };
}
