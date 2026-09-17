import { create } from "zustand";

const PACKAGE_CACHE_KEY = "studiodo-offline-packages";
const PING_URL = "/api/health"; // lightweight ping endpoint (falls back gracefully if 404)
const PING_INTERVAL_MS = 15_000; // re-check every 15s

// ─── Pending upload queue ─────────────────────────────────────────────────────

export interface PendingPhoto {
  id: string;
  sessionId: string;
  slotIndex: number;
  blobDataUrl: string; // base64 data URL because Blob can't be persisted to localStorage
  uploadedAt?: number;
}

const PENDING_QUEUE_KEY = "studiodo-pending-uploads";

function readPendingQueue(): PendingPhoto[] {
  try {
    const raw = localStorage.getItem(PENDING_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function savePendingQueue(queue: PendingPhoto[]) {
  try { localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(queue)); } catch { /* storage full */ }
}

// ─── Zustand store ─────────────────────────────────────────────────────────────

interface OfflineState {
  isOnline: boolean;
  pendingPhotos: PendingPhoto[];
  syncInProgress: boolean;
  lastOnlineAt: number | null;
  lastOfflineAt: number | null;

  setOnline: (value: boolean) => void;
  addPendingPhoto: (item: Omit<PendingPhoto, "id">) => void;
  removePendingPhoto: (id: string) => void;
  setSyncInProgress: (v: boolean) => void;
}

export const useOfflineStore = create<OfflineState>((set, get) => ({
  isOnline: navigator.onLine,
  pendingPhotos: readPendingQueue(),
  syncInProgress: false,
  lastOnlineAt: null,
  lastOfflineAt: null,

  setOnline: (isOnline) => {
    const prev = get().isOnline;
    if (prev === isOnline) return;
    set({
      isOnline,
      lastOnlineAt: isOnline ? Date.now() : get().lastOnlineAt,
      lastOfflineAt: !isOnline ? Date.now() : get().lastOfflineAt,
    });
  },

  addPendingPhoto: (item) => {
    const entry: PendingPhoto = { ...item, id: crypto.randomUUID() };
    const next = [...get().pendingPhotos, entry];
    set({ pendingPhotos: next });
    savePendingQueue(next);
  },

  removePendingPhoto: (id) => {
    const next = get().pendingPhotos.filter((p) => p.id !== id);
    set({ pendingPhotos: next });
    savePendingQueue(next);
  },

  setSyncInProgress: (v) => set({ syncInProgress: v }),
}));

// ─── Network monitor (singleton, call once at app start) ──────────────────────

let _monitorStarted = false;

async function pingServer(): Promise<boolean> {
  try {
    const res = await fetch(PING_URL, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(4000) });
    return res.ok || res.status === 405; // 405 = method not allowed but server reachable
  } catch {
    return false;
  }
}

export function startNetworkMonitor() {
  if (_monitorStarted) return;
  _monitorStarted = true;

  const store = useOfflineStore.getState();

  const updateStatus = async (fromEvent?: "online" | "offline") => {
    if (fromEvent === "offline") {
      useOfflineStore.getState().setOnline(false);
      return;
    }
    // For "online" event or periodic check, do a real HTTP ping to confirm
    const reachable = await pingServer();
    useOfflineStore.getState().setOnline(reachable);
  };

  window.addEventListener("online", () => updateStatus("online"));
  window.addEventListener("offline", () => updateStatus("offline"));

  // Periodic ping
  const interval = setInterval(() => updateStatus(), PING_INTERVAL_MS);

  // Initial check
  updateStatus();

  return () => {
    clearInterval(interval);
    window.removeEventListener("online", () => updateStatus("online"));
    window.removeEventListener("offline", () => updateStatus("offline"));
    _monitorStarted = false;
  };
}

// ─── Sync pending photos when back online ─────────────────────────────────────

export async function syncPendingPhotos(uploadFn: (sessionId: string, slotIndex: number, blob: Blob) => Promise<void>) {
  const { pendingPhotos, syncInProgress, setSyncInProgress, removePendingPhoto } = useOfflineStore.getState();
  if (syncInProgress || pendingPhotos.length === 0) return;

  setSyncInProgress(true);
  const toSync = [...pendingPhotos];

  for (const pending of toSync) {
    try {
      // Convert base64 data URL back to Blob
      const res = await fetch(pending.blobDataUrl);
      const blob = await res.blob();
      await uploadFn(pending.sessionId, pending.slotIndex, blob);
      removePendingPhoto(pending.id);
    } catch (err) {
      console.warn("[offline-sync] Gagal sync foto", pending.id, err);
    }
  }
  setSyncInProgress(false);
}

// ─── Legacy compatibility exports (used across existing pages) ─────────────────

export function isBrowserOnline(): boolean {
  return useOfflineStore.getState().isOnline;
}

export function readCachedPackages<T>(): T[] {
  try {
    const value = localStorage.getItem(PACKAGE_CACHE_KEY);
    return value ? (JSON.parse(value) as T[]) : [];
  } catch { return [] as T[]; }
}

export function cachePackages<T>(packages: T[]) {
  try { localStorage.setItem(PACKAGE_CACHE_KEY, JSON.stringify(packages)); } catch { /* ignore */ }
}

export function createOfflineSessionId() {
  return `offline-${crypto.randomUUID()}`;
}