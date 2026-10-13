import { create } from "zustand";

// Mirror of THIS booth's licence as last reported by the server (heartbeat, or a 403 "subscription_locked" from a
// transaction route). One kiosk key = one booth = one licence, so it is this booth's state, not the whole account's.
//
// The real gate is server-side (server/middleware/requireActiveSubscription.ts); this store only decides when the lock
// SCREEN shows. It fails OPEN on a brand-new install (nothing known yet → not locked), but once the server has said
// something it is remembered across restarts: an offline booth whose trial/subscription runs out keeps locking itself
// at `lockAt` instead of working for free until it next reaches the internet.

export type LockReason = "suspended" | "unpaid" | "trial_expired" | "expired";

export interface LicenseSnapshot {
  locked: boolean;
  reason: LockReason | null;
  message: string | null;
  licenseType: "trial" | "paid" | "unpaid" | null;
  licenseEndsAt: string | null;
  /** ISO time at which the booth locks by itself (end date, plus grace for paid booths). */
  lockAt: string | null;
  daysRemaining: number | null;
  graceDaysRemaining: number | null;
  renewalWhatsapp: string | null;
  renewalCheckoutUrl: string | null;
  /** Where the owner subscribes this booth (website → Booth & langganan). */
  portalUrl: string | null;
}

interface SubscriptionLockState extends LicenseSnapshot {
  /** Re-evaluated periodically so lockAt is honoured while the app just sits there running. */
  now: number;
  setFromHeartbeat: (subscription: Partial<LicenseSnapshot> & { locked: boolean }) => void;
}

const STORAGE_KEY = "studiodo-license-snapshot";

const EMPTY: LicenseSnapshot = {
  locked: false,
  reason: null,
  message: null,
  licenseType: null,
  licenseEndsAt: null,
  lockAt: null,
  daysRemaining: null,
  graceDaysRemaining: null,
  renewalWhatsapp: null,
  renewalCheckoutUrl: null,
  portalUrl: null,
};

function readStored(): LicenseSnapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<LicenseSnapshot>) };
  } catch {
    return EMPTY;
  }
}

function persist(snapshot: LicenseSnapshot) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // storage unavailable — the lock state just won't survive a restart
  }
}

function pick(state: LicenseSnapshot): LicenseSnapshot {
  return {
    locked: state.locked, reason: state.reason, message: state.message, licenseType: state.licenseType,
    licenseEndsAt: state.licenseEndsAt, lockAt: state.lockAt, daysRemaining: state.daysRemaining,
    graceDaysRemaining: state.graceDaysRemaining, renewalWhatsapp: state.renewalWhatsapp,
    renewalCheckoutUrl: state.renewalCheckoutUrl, portalUrl: state.portalUrl,
  };
}

export const useSubscriptionLock = create<SubscriptionLockState>((set, get) => ({
  ...readStored(),
  now: Date.now(),
  setFromHeartbeat: (subscription) => {
    const next: LicenseSnapshot = { ...EMPTY, ...subscription };
    // A sparse update (the 403 path) must not erase what the heartbeat already told us about links and dates.
    const previous = pick(get());
    const merged: LicenseSnapshot = {
      ...next,
      renewalWhatsapp: next.renewalWhatsapp ?? previous.renewalWhatsapp,
      renewalCheckoutUrl: next.renewalCheckoutUrl ?? previous.renewalCheckoutUrl,
      portalUrl: next.portalUrl ?? previous.portalUrl,
    };
    persist(merged);
    set({ ...merged, now: Date.now() });
  },
}));

if (typeof window !== "undefined") {
  window.setInterval(() => useSubscriptionLock.setState({ now: Date.now() }), 30_000);
  // A transaction route answered 403 "subscription_locked" (see lib/api.ts): lock right away instead of waiting for the
  // next heartbeat.
  window.addEventListener("studiodo-subscription-locked", (event) => {
    const detail = (event as CustomEvent<{ reason?: LockReason | null; message?: string | null }>).detail ?? {};
    useSubscriptionLock.getState().setFromHeartbeat({ locked: true, reason: detail.reason ?? "expired", message: detail.message ?? null });
  });
}

/** True when the server said the booth is locked, or its lock time has passed (even while offline). */
export function isLicenseLocked(state: Pick<LicenseSnapshot, "locked" | "lockAt"> & { now: number }): boolean {
  if (state.locked) return true;
  return state.lockAt !== null && state.now >= new Date(state.lockAt).getTime();
}

export function useLicenseLocked(): boolean {
  return useSubscriptionLock((s) => isLicenseLocked(s));
}
