import type { NextFunction, Request, Response } from "express";
import { verifySuperadminToken } from "../lib/jwt.js";
import { isSessionCurrent } from "../lib/sessionGuard.js";

export async function requireSuperadminAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    return res.status(401).json({ error: "Sesi superadmin tidak valid atau kedaluwarsa, silakan login ulang", code: "superadmin_auth_required" });
  }

  try {
    const { superadminId, pv } = verifySuperadminToken(token);
    if (!(await isSessionCurrent("superadmin", superadminId, pv))) throw new Error("sesi dicabut");
    req.superadminId = superadminId;
    next();
  } catch {
    return res.status(401).json({ error: "Sesi superadmin tidak valid atau kedaluwarsa, silakan login ulang", code: "superadmin_auth_required" });
  }
}
