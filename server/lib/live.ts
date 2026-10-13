// Live booth monitor: turns "what is each booth doing right now" into something an owner can scan at a glance.
// Booths do not report their screen to the server; the stage is inferred from the session row the kiosk keeps updating.

export type SessionStage = "payment" | "capture" | "review";
export type BoothState = "locked" | "offline" | "payment" | "capture" | "review" | "idle";

/** A session older than this without finishing is a customer who walked away, not a session in progress. */
export const ACTIVE_SESSION_WINDOW_MS = 45 * 60 * 1000;
/** Same threshold as the kiosk list: no heartbeat / request for this long = offline. */
export const BOOTH_ONLINE_WINDOW_MS = 10 * 60 * 1000;

export interface LiveSessionInput {
  paymentStatus: string;
  completedAt: Date | null;
  createdAt: Date;
  photoCount: number;
  packagePhotoCount: number | null;
}

/** The step a still-open session is at, or null when it is not in progress (finished, failed, expired, or walked away). */
export function sessionStage(s: LiveSessionInput, now = Date.now()): SessionStage | null {
  if (s.completedAt) return null;
  if (now - new Date(s.createdAt).getTime() > ACTIVE_SESSION_WINDOW_MS) return null;
  if (s.paymentStatus === "pending") return "payment";
  if (s.paymentStatus !== "success") return null;
  const needed = s.packagePhotoCount ?? 0;
  return needed > 0 && s.photoCount >= needed ? "review" : "capture";
}

export function boothState(input: { locked: boolean; lastUsedAt: Date | null; stage: SessionStage | null }, now = Date.now()): BoothState {
  if (input.locked) return "locked";
  if (!input.lastUsedAt || now - new Date(input.lastUsedAt).getTime() >= BOOTH_ONLINE_WINDOW_MS) return "offline";
  return input.stage ?? "idle";
}

/** Midnight at the start of today in Indonesia (WIB, UTC+7, no DST) as a UTC instant. */
export function startOfTodayWib(now = Date.now()): Date {
  const wib = new Date(now + 7 * 60 * 60 * 1000);
  return new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()) - 7 * 60 * 60 * 1000);
}
