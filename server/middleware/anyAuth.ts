import type { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { kioskKeys } from "../db/schema.js";
import { verifyAdminToken } from "../lib/jwt.js";

function hashKey(rawKey: string) {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

/**
 * Some settings (e.g. current Xendit/printing config) are read both by the
 * kiosk at runtime and by an admin browsing the dashboard from a machine that
 * has never been kiosk-paired — this accepts either credential and resolves
 * tenantId from whichever one is present, admin token first.
 */
export async function requireAnyAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (bearer) {
    try {
      const { adminId, tenantId } = verifyAdminToken(bearer);
      req.adminId = adminId;
      req.tenantId = tenantId;
      return next();
    } catch {
      // fall through to kiosk-key check
    }
  }

  const rawKey = String(req.headers["x-kiosk-key"] ?? "");
  if (rawKey) {
    const [row] = await db
      .select({ id: kioskKeys.id, tenantId: kioskKeys.tenantId })
      .from(kioskKeys)
      .where(and(eq(kioskKeys.keyHash, hashKey(rawKey)), isNull(kioskKeys.revokedAt)));
    if (row) {
      req.tenantId = row.tenantId;
      db.update(kioskKeys).set({ lastUsedAt: new Date() }).where(eq(kioskKeys.id, row.id)).catch(() => undefined);
      return next();
    }
  }

  return res.status(401).json({ error: "Butuh login admin atau kiosk yang sudah di-pairing", code: "any_auth_required" });
}
