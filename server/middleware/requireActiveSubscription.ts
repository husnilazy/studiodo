import type { NextFunction, Request, Response } from "express";
import { getKeyLock, lockMessage } from "../lib/license.js";

// Must run AFTER requireKioskAuth (needs req.kioskKeyId already set). Deliberately a
// separate middleware rather than folded into requireKioskAuth, so it can be applied
// only to routes that start a NEW transaction (create session, initiate payment) —
// a blanket block on every kiosk route would also break the config/branding/heartbeat
// requests the locked screen itself needs to render correctly.
//
// The licence is per booth (kiosk key), so one expired booth never blocks the others.
export async function requireActiveSubscription(req: Request, res: Response, next: NextFunction) {
  const lock = await getKeyLock(req.kioskKeyId!);
  if (lock.locked) {
    return res.status(403).json({
      error: lockMessage(lock.reason),
      code: "subscription_locked",
      reason: lock.reason,
    });
  }
  next();
}
