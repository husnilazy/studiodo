import type { NextFunction, Request, Response } from "express";
import { verifyAdminToken } from "../lib/jwt.js";

export function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    return res.status(401).json({ error: "Sesi admin tidak valid atau kedaluwarsa, silakan login ulang", code: "admin_auth_required" });
  }

  try {
    const { adminId, tenantId } = verifyAdminToken(token);
    req.adminId = adminId;
    req.tenantId = tenantId;
    next();
  } catch {
    return res.status(401).json({ error: "Sesi admin tidak valid atau kedaluwarsa, silakan login ulang", code: "admin_auth_required" });
  }
}
