import type { NextFunction, Request, Response } from "express";
import { authenticateKiosk } from "../lib/kioskAccess.js";
import { verifyAdminToken } from "../lib/jwt.js";

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
