import type { NextFunction, Request, Response } from "express";
import { blocksWrite, verifyAdminToken } from "../lib/jwt.js";
import { isSessionCurrent } from "../lib/sessionGuard.js";

export async function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    return res.status(401).json({ error: "Sesi admin tidak valid atau kedaluwarsa, silakan login ulang", code: "admin_auth_required" });
  }

  try {
    const claims = verifyAdminToken(token);
    const { adminId, tenantId, pv } = claims;
    if (blocksWrite(claims, req.method)) return res.status(403).json({ error: "Mode lihat saja: perubahan tidak diizinkan saat Anda melihat sebagai tenant.", code: "read_only_session" });
    // A password change/reset revokes every token issued before it (lib/sessionGuard.ts).
    if (!(await isSessionCurrent("admin", adminId, pv))) throw new Error("sesi dicabut");
    req.adminId = adminId;
    req.tenantId = tenantId;
    next();
  } catch {
    return res.status(401).json({ error: "Sesi admin tidak valid atau kedaluwarsa, silakan login ulang", code: "admin_auth_required" });
  }
}
