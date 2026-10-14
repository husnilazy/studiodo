import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { kioskKeys } from "../db/schema.js";
import { authenticateKiosk, clearKioskAuthCache } from "../lib/kioskAccess.js";

export { clearKioskAuthCache };

// Every kiosk request used to pay a Postgres round-trip (key lookup) plus a second one (the "last used" write) before the
// route even started. The lookup is cached briefly in lib/kioskAccess.ts (revoke / reset-device / activation clear it
// immediately), and "last used" is written at most once a minute per key.
const LAST_USED_WRITE_INTERVAL_MS = 60_000;
const lastUsedWrittenAt = new Map<string, number>();

/**
 * Authenticates a kiosk request: valid, non-revoked key, from the one computer it was activated on (hardware device id),
 * carrying that computer's secret. See lib/deviceLock.ts for the rules and lib/kioskAccess.ts for the lookup.
 */
export async function requireKioskAuth(req: Request, res: Response, next: NextFunction) {
  const result = await authenticateKiosk(req);
  if (!result.ok) return res.status(result.status).json({ error: result.error, code: result.code });

  const { row } = result;
  req.tenantId = row.tenantId;
  req.kioskKeyId = row.id;
  // Fire-and-forget — a failed "last used" bump must never block the kiosk request.
  const now = Date.now();
  if (now - (lastUsedWrittenAt.get(row.id) ?? 0) >= LAST_USED_WRITE_INTERVAL_MS) {
    lastUsedWrittenAt.set(row.id, now);
    db.update(kioskKeys).set({ lastUsedAt: new Date() }).where(eq(kioskKeys.id, row.id)).catch(() => undefined);
  }
  next();
}
