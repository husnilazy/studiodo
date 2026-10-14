import type { Request } from "express";
import crypto from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { kioskKeys } from "../db/schema.js";
import { clientIp } from "./clientIp.js";
import { checkDeviceAccess, createAuthThrottle } from "./deviceLock.js";

// One place that turns the kiosk's credentials (x-kiosk-key + x-device-id + x-device-token) into an authenticated booth.
// Both requireKioskAuth and requireAnyAuth go through it, so a route can never accept "the key alone" by using the
// looser middleware (that used to be possible: requireAnyAuth skipped the device check entirely).

export type KeyRow = { id: string; tenantId: string; boundDeviceId: string | null; deviceTokenHash: string | null; trialStartedAt: Date | null; licenseType: string };

export type KioskAccessResult =
  | { ok: true; row: KeyRow }
  | { ok: false; status: 401 | 403 | 429; code: string; error: string };

const KEY_CACHE_TTL_MS = 30_000;
const keyCache = new Map<string, { row: KeyRow; expires: number }>();
// 60 rejected attempts per minute per IP; legitimate kiosks are rejected rarely (and at most once per screen load).
const throttle = createAuthThrottle({ max: 60, windowMs: 60_000 });

export function clearKioskAuthCache() {
  keyCache.clear();
}

export const hashKey = (rawKey: string) => crypto.createHash("sha256").update(rawKey).digest("hex");

export async function authenticateKiosk(req: Request): Promise<KioskAccessResult> {
  const ip = clientIp(req);
  if (throttle.blocked(ip)) return { ok: false, status: 429, code: "too_many_attempts", error: "Terlalu banyak percobaan gagal. Coba lagi sebentar lagi." };
  const reject = <T extends KioskAccessResult>(r: T): T => { throttle.fail(ip); return r; };

  const rawKey = String(req.headers["x-kiosk-key"] ?? "");
  if (!rawKey) return { ok: false, status: 401, code: "kiosk_auth_required", error: "Kiosk belum di-pairing. Isi kiosk API key lewat layar Setup." };

  const keyHash = hashKey(rawKey);
  let row: KeyRow | undefined;
  const cached = keyCache.get(keyHash);
  if (cached && cached.expires > Date.now()) {
    row = cached.row;
  } else {
    [row] = await db
      .select({ id: kioskKeys.id, tenantId: kioskKeys.tenantId, boundDeviceId: kioskKeys.boundDeviceId, deviceTokenHash: kioskKeys.deviceTokenHash, trialStartedAt: kioskKeys.trialStartedAt, licenseType: kioskKeys.licenseType })
      .from(kioskKeys)
      .where(and(eq(kioskKeys.keyHash, keyHash), isNull(kioskKeys.revokedAt)));
    if (row) keyCache.set(keyHash, { row, expires: Date.now() + KEY_CACHE_TTL_MS });
    else keyCache.delete(keyHash);
  }
  if (!row) return reject({ ok: false, status: 401, code: "kiosk_auth_required", error: "Kiosk API key tidak valid atau sudah dicabut." });

  const deviceId = String(req.headers["x-device-id"] ?? "").slice(0, 128) || null;
  const deviceToken = String(req.headers["x-device-token"] ?? "").slice(0, 200) || null;
  const verdict = checkDeviceAccess(row, deviceId, deviceToken);
  if (!verdict.ok) return reject({ ok: false, status: verdict.status, code: verdict.code, error: verdict.error });
  return { ok: true, row };
}
