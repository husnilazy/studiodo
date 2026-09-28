import type { NextFunction, Request, Response } from "express";
import { getSubscriptionStatus } from "../lib/subscription.js";

// Must run AFTER requireKioskAuth (needs req.tenantId already set). Deliberately a
// separate middleware rather than folded into requireKioskAuth, so it can be applied
// only to routes that start a NEW transaction (create session, initiate payment) —
// a blanket block on every kiosk route would also break the config/branding/heartbeat
// requests the locked screen itself needs to render correctly.
export async function requireActiveSubscription(req: Request, res: Response, next: NextFunction) {
  const { locked } = await getSubscriptionStatus(req.tenantId!);
  if (locked) {
    return res.status(403).json({
      error: "Langganan tenant ini sudah berakhir dan melewati masa tenggang. Kiosk terkunci sampai diperpanjang.",
      code: "subscription_locked",
    });
  }
  next();
}
