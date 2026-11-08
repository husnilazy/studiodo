import { useEffect, useRef, useState } from "react";
import { isEventActive, useBoothConfig, type BoothConfig } from "./boothConfigStore";
import { useKioskSession } from "./sessionStore";

/** Minutes a customer has from the moment the payment clears until the photo editing ends (null = no limit). */
export function sessionLimitMinutes(config: BoothConfig): number | null {
  if (isEventActive(config)) return config.eventTimerEnabled ? config.eventSessionTimerMinutes : null;
  return config.sessionTimerMinutes > 0 ? config.sessionTimerMinutes : null;
}

/**
 * Time left in this customer's session (one clock for payment -> frame -> photos -> editing, started by markPaid()).
 * `graceSeconds`: a screen reached after the clock already ran out (e.g. editing after a long photo session) still gets
 * this many seconds from the moment it opens, so the customer is never thrown out of it instantly.
 */
export function useSessionDeadline(graceSeconds = 0): { active: boolean; remainingSeconds: number } {
  const config = useBoothConfig((s) => s.config);
  const startedAt = useKioskSession((s) => s.sessionStartedAt);
  const minutes = sessionLimitMinutes(config);
  const mountedAt = useRef(Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (minutes === null || !startedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [minutes, startedAt]);
  if (minutes === null || !startedAt) return { active: false, remainingSeconds: 0 };
  const real = Math.max(0, Math.ceil((startedAt + minutes * 60_000 - now) / 1000));
  const grace = Math.max(0, Math.ceil((mountedAt.current + graceSeconds * 1000 - now) / 1000));
  return { active: true, remainingSeconds: Math.max(real, grace) };
}

export const formatClock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
