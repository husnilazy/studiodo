import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { creators } from "../db/schema.js";
import { verifyCreatorToken } from "../lib/jwt.js";

export async function requireCreatorAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const fail = () => res.status(401).json({ error: "Sesi kreator tidak valid atau kedaluwarsa, silakan masuk lagi", code: "creator_auth_required" });
  if (!token) return fail();
  try {
    const { creatorId } = verifyCreatorToken(token);
    // A suspended creator must lose access immediately, not when the 12h token expires.
    const [row] = await db.select({ status: creators.status }).from(creators).where(eq(creators.id, creatorId));
    if (!row || row.status !== "active") return fail();
    req.creatorId = creatorId;
    next();
  } catch {
    return fail();
  }
}
