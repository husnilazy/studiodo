import type { NextFunction, Request, Response } from "express";
import { authenticateKiosk } from "../lib/kioskAccess.js";
import { blocksWrite, verifyAdminToken } from "../lib/jwt.js";
import { isSessionCurrent } from "../lib/sessionGuard.js";

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
      const claims = verifyAdminToken(bearer);
      const { adminId, tenantId, pv } = claims;
      if (!(await isSessionCurrent("admin", adminId, pv))) throw new Error("sesi dicabut");
      if (blocksWrite(claims, req.method)) return res.status(403).json({ error: "Mode lihat saja: perubahan tidak diizinkan saat Anda melihat sebagai tenant.", code: "read_only_session" });
      req.adminId = adminId;
      req.tenantId = tenantId;
      return next();
    } catch {
      // fall through to kiosk-key check
    }
  }

  // The kiosk path goes through the same device checks as requireKioskAuth — "the key alone" is never enough.
  if (req.headers["x-kiosk-key"]) {
    const result = await authenticateKiosk(req);
    if (result.ok) {
      req.tenantId = result.row.tenantId;
      req.kioskKeyId = result.row.id;
      return next();
    }
    return res.status(result.status).json({ error: result.error, code: result.code });
  }

  return res.status(401).json({ error: "Butuh login admin atau kiosk yang sudah di-pairing", code: "any_auth_required" });
}
