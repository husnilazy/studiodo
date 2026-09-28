import type { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";
import { eq, isNull, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { kioskKeys } from "../db/schema.js";

function hashKey(rawKey: string) {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

export async function requireKioskAuth(req: Request, res: Response, next: NextFunction) {
  const rawKey = String(req.headers["x-kiosk-key"] ?? "");
  if (!rawKey) {
    return res.status(401).json({ error: "Kiosk belum di-pairing. Isi kiosk API key lewat layar Setup.", code: "kiosk_auth_required" });
  }

  const keyHash = hashKey(rawKey);
  const [row] = await db
    .select({ id: kioskKeys.id, tenantId: kioskKeys.tenantId, boundDeviceId: kioskKeys.boundDeviceId })
    .from(kioskKeys)
    .where(and(eq(kioskKeys.keyHash, keyHash), isNull(kioskKeys.revokedAt)));

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
  db.update(kioskKeys).set({ lastUsedAt: new Date() }).where(eq(kioskKeys.id, row.id)).catch(() => undefined);
  next();
}
