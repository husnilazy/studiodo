import { create } from "zustand";

export type AdminToastType = "success" | "error" | "info";

export interface AdminToast {
  id: string;
  type: AdminToastType;
  title: string;
  sub?: string;
}

interface ToastState {
  toasts: AdminToast[];
  push: (toast: Omit<AdminToast, "id">, durationMs?: number) => string;
  dismiss: (id: string) => void;
}

const DEFAULT_DURATION_MS = 4200;

// Ephemeral UI state only — no persist middleware. Modeled on
// NetworkToast.tsx's proven shape (capped stack, auto-dismiss timer) but
// decoupled from useOfflineStore so any admin page can push a toast.
export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (toast, durationMs = DEFAULT_DURATION_MS) => {
    const id = crypto.randomUUID();
    set((state) => ({ toasts: [...state.toasts.slice(-2), { ...toast, id }] }));
    setTimeout(() => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })), durationMs);
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

// Plain-function wrapper so call sites outside a component (async handlers,
// event callbacks) can push a toast without needing the hook.
export function pushToast(toast: Omit<AdminToast, "id">, durationMs?: number) {
  return useToastStore.getState().push(toast, durationMs);
}
