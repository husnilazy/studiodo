// Brute-force guard for the login endpoints (single process, in memory — same caveat as before: a multi-instance
// deployment would need a shared store). Escalating: every `maxFailures` wrong passwords start a lockout, and each
// repeat lockout for the same key is longer (5 min → 30 min → 2 h). A key forgets its history after 24 h without
// failures, and a successful login clears it. Used per account (email) and, with a looser limit, per client IP so
// one machine cannot cycle through many accounts.

export const LOCK_STEPS_MS = [5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];
const FORGET_AFTER_MS = 24 * 60 * 60_000;

export interface LockoutInfo {
  key: string;
  /** How many lockouts this key has had (1 = first). */
  lockoutCount: number;
  lockMs: number;
  until: number;
}

interface Entry { failures: number; lockouts: number; lockedUntil: number; lastFailureAt: number }

export function createLoginGuard(opts: { maxFailures: number; now?: () => number }) {
  const now = opts.now ?? Date.now;
  const entries = new Map<string, Entry>();

  const fresh = (key: string): Entry => {
    const e = entries.get(key);
    if (e && now() - e.lastFailureAt > FORGET_AFTER_MS && e.lockedUntil <= now()) { entries.delete(key); }
    return entries.get(key) ?? { failures: 0, lockouts: 0, lockedUntil: 0, lastFailureAt: 0 };
  };

  return {
    /** Milliseconds left on an active lockout (0 = free to try). */
    lockedFor(key: string): number {
      const e = entries.get(key);
      return e && e.lockedUntil > now() ? e.lockedUntil - now() : 0;
    },
    /** Record a wrong password. Returns lockout details when this failure started a lockout. */
    fail(key: string): LockoutInfo | null {
      const e = fresh(key);
      e.failures += 1;
      e.lastFailureAt = now();
      let started: LockoutInfo | null = null;
      if (e.failures >= opts.maxFailures) {
        e.lockouts += 1;
        e.failures = 0;
        const lockMs = LOCK_STEPS_MS[Math.min(e.lockouts, LOCK_STEPS_MS.length) - 1];
        e.lockedUntil = now() + lockMs;
        started = { key, lockoutCount: e.lockouts, lockMs, until: e.lockedUntil };
      }
      entries.set(key, e);
      if (entries.size > 5000) for (const [k, v] of entries) if (v.lockedUntil <= now() && now() - v.lastFailureAt > FORGET_AFTER_MS) entries.delete(k);
      return started;
    },
    succeed(key: string) { entries.delete(key); },
  };
}

export const minutesLabel = (ms: number) => {
  const m = Math.ceil(ms / 60_000);
  return m >= 60 ? `${Math.ceil(m / 60)} jam` : `${m} menit`;
};
