import { useSyncExternalStore } from "react";

// Counts API calls in flight so the admin screens can show a thin progress bar while ANYTHING is loading or saving,
// instead of each panel inventing its own spinner (or showing none). Pure feedback: it never touches the requests.

let inFlight = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Wrap a promise-returning call; the counter goes up now and down when it settles, success or failure. */
export async function tracked<T>(run: () => Promise<T>): Promise<T> {
  inFlight += 1; emit();
  try { return await run(); } finally { inFlight = Math.max(0, inFlight - 1); emit(); }
}

const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
export const useNetBusy = () => useSyncExternalStore(subscribe, () => inFlight > 0, () => false);
