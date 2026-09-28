import { create } from "zustand";

// Fase 6 — ephemeral (no persist, no localStorage) client-side mirror of whatever
// the last heartbeat reported. Deliberately fails OPEN: default locked:false, and
// only ever flips to true once a heartbeat actually confirms it — this is a UX
// convenience, not the real gate (server/middleware/requireActiveSubscription.ts is
// the actual enforcement point). A cold-boot kiosk briefly shows the normal idle
// screen for the few hundred ms before its first heartbeat resolves, which is fine.
interface SubscriptionLockState {
  locked: boolean;
  graceDaysRemaining: number | null;
  renewalWhatsapp: string | null;
  renewalCheckoutUrl: string | null;
  setFromHeartbeat: (subscription: {
    locked: boolean;
    graceDaysRemaining: number | null;
    renewalWhatsapp: string | null;
    renewalCheckoutUrl: string | null;
  }) => void;
}

export const useSubscriptionLock = create<SubscriptionLockState>((set) => ({
  locked: false,
  graceDaysRemaining: null,
  renewalWhatsapp: null,
  renewalCheckoutUrl: null,
  setFromHeartbeat: (subscription) => set(subscription),
}));
