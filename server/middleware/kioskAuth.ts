import type { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";
import { eq, isNull, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { kioskKeys } from "../db/schema.js";

function hashKey(rawKey: string) {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

// Every kiosk request used to pay a Postgres round-trip (key lookup) plus a second one (the "last used" write) before the
// route even started — against a remote/cold Neon database that alone was a large part of every screen's load time.
// The lookup result is cached briefly in-process; revoke / reset-device clear it immediately (see kioskKeys.ts), so the
// short TTL is only the safety net for changes made some other way.
type KeyRow = { id: string; tenantId: string; boundDeviceId: string | null };
const KEY_CACHE_TTL_MS = 30_000;
const LAST_USED_WRITE_INTERVAL_MS = 60_000;
const keyCache = new Map<string, { row: KeyRow; expires: number }>();
const lastUsedWrittenAt = new Map<string, number>();

export function clearKioskAuthCache() {
  keyCache.clear();
}

export async function requireKioskAuth(req: Request, res: Response, next: NextFunction) {
  const rawKey = String(req.headers["x-kiosk-key"] ?? "");
  if (!rawKey) {
    return res.status(401).json({ error: "Kiosk belum di-pairing. Isi kiosk API key lewat layar Setup.", code: "kiosk_auth_required" });
  }

  const keyHash = hashKey(rawKey);
  let row: KeyRow | undefined;
  const cached = keyCache.get(keyHash);
  if (cached && cached.expires > Date.now()) {
    row = cached.row;
  } else {
    [row] = await db
      .select({ id: kioskKeys.id, tenantId: kioskKeys.tenantId, boundDeviceId: kioskKeys.boundDeviceId })
      .from(kioskKeys)
      .where(and(eq(kioskKeys.keyHash, keyHash), isNull(kioskKeys.revokedAt)));
    if (row) keyCache.set(keyHash, { row, expires: Date.now() + KEY_CACHE_TTL_MS });
    else keyCache.delete(keyHash);
  }

  if (!row) {
    return res.status(401).json({ error: "Kiosk API key tidak valid atau sudah dicabut.", code: "kiosk_auth_required" });
  }

  // Device lock — 1 kiosk key = 1 physical device. A kiosk build old enough to
  // not send this header at all gets a pass (nothing to compare), so upgrading
  // never bricks an already-paired install; but once a device id IS on record,
  // every request must match it.
  const deviceId = String(req.headers["x-device-id"] ?? "").slice(0, 128) || null;
  if (deviceId) {
    if (!row.boundDeviceId) {
      await db.update(kioskKeys).set({ boundDeviceId: deviceId, boundAt: new Date() }).where(eq(kioskKeys.id, row.id));
      row.boundDeviceId = deviceId;
    } else if (row.boundDeviceId !== deviceId) {
      return res.status(403).json({
        error: "Kiosk key ini sudah terpasang di device lain. Minta admin reset device dari dashboard Kiosk untuk memindahkannya ke device ini.",
        code: "kiosk_device_mismatch",
      });
    }
  }

  req.tenantId = row.tenantId;
  req.kioskKeyId = row.id;
  // Fire-and-forget — a failed "last used" bump must never block the kiosk request.
  // At most once a minute per key: "last used" only feeds the online/offline indicator, which works at that granularity.
  const now = Date.now();
  if (now - (lastUsedWrittenAt.get(row.id) ?? 0) >= LAST_USED_WRITE_INTERVAL_MS) {
    lastUsedWrittenAt.set(row.id, now);
    db.update(kioskKeys).set({ lastUsedAt: new Date() }).where(eq(kioskKeys.id, row.id)).catch(() => undefined);
  }
  next();
}
