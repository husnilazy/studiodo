import type { NextFunction, Request, Response } from "express";
import { verifySuperadminToken } from "../lib/jwt.js";

export function requireSuperadminAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    return res.status(401).json({ error: "Sesi superadmin tidak valid atau kedaluwarsa, silakan login ulang", code: "superadmin_auth_required" });
  }

  try {
    const { superadminId } = verifySuperadminToken(token);
    req.superadminId = superadminId;
    next();
  } catch {
    return res.status(401).json({ error: "Sesi superadmin tidak valid atau kedaluwarsa, silakan login ulang", code: "superadmin_auth_required" });
  }
}
