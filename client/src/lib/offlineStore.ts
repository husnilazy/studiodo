import { create } from "zustand";
import { getApiBaseUrl } from "./apiConfig";
import { api } from "./api";
import { useKioskSession } from "./sessionStore";

const PACKAGE_CACHE_KEY = "studiodo-offline-packages";
const PING_INTERVAL_MS = 15_000; // re-check every 15s

// ─── IndexedDB-backed offline queue ─────────────────────────────────────────
// Sessions/photos/strips created while offline are queued here as real Blobs
// (not base64 in localStorage) so a handful of full-resolution captures don't
// blow past localStorage's ~5-10MB quota.

const DB_NAME = "studiodo-offline";
const DB_VERSION = 1;
const STORE_SESSIONS = "pendingSessions";
const STORE_PHOTOS = "pendingPhotos";
const STORE_STRIPS = "pendingStrips";

export interface PendingSessionMeta {
  offlineId: string;
  packageId?: string;
  orientation: string;
  selectedExtras: { id: string; name: string; price: number }[];
  createdAt: number;
}

export interface PendingPhoto {
  id: string;
  sessionId: string;
  slotIndex: number;
  blob: Blob;
  createdAt: number;
}

export interface PendingStrip {
  sessionId: string;
  blob: Blob;
  shareUrl: string;
  createdAt: number;
}

let _dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) db.createObjectStore(STORE_SESSIONS, { keyPath: "offlineId" });
      if (!db.objectStoreNames.contains(STORE_PHOTOS)) db.createObjectStore(STORE_PHOTOS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE_STRIPS)) db.createObjectStore(STORE_STRIPS, { keyPath: "sessionId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function runTx<T>(storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const store = db.transaction(storeName, mode).objectStore(storeName);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

const getAllRecords = <T>(storeName: string) => runTx<T[]>(storeName, "readonly", (store) => store.getAll() as IDBRequest<T[]>);
const putRecord = <T>(storeName: string, record: T) => runTx(storeName, "readwrite", (store) => store.put(record));
const deleteRecord = (storeName: string, key: IDBValidKey) => runTx(storeName, "readwrite", (store) => store.delete(key));

// ─── Zustand store (reactive mirror for UI — the Blobs themselves stay in
// IndexedDB, only counts live here) ─────────────────────────────────────────

interface OfflineState {
  isOnline: boolean;
  syncInProgress: boolean;
  lastOnlineAt: number | null;
  lastOfflineAt: number | null;
  pendingSessionCount: number;
  pendingPhotoCount: number;
  pendingStripCount: number;

  setOnline: (value: boolean) => void;
  setSyncInProgress: (v: boolean) => void;
}

export const useOfflineStore = create<OfflineState>((set, get) => ({
  isOnline: navigator.onLine,
  syncInProgress: false,
  lastOnlineAt: null,
  lastOfflineAt: null,
  pendingSessionCount: 0,
  pendingPhotoCount: 0,
  pendingStripCount: 0,

  setOnline: (isOnline) => {
    const prev = get().isOnline;
    if (prev === isOnline) return;
    set({
      isOnline,
      lastOnlineAt: isOnline ? Date.now() : get().lastOnlineAt,
      lastOfflineAt: !isOnline ? Date.now() : get().lastOfflineAt,
    });
  },

  setSyncInProgress: (v) => set({ syncInProgress: v }),
}));

async function refreshPendingCounts() {
  try {
    const [sessions, photos, strips] = await Promise.all([
      getAllRecords<PendingSessionMeta>(STORE_SESSIONS),
      getAllRecords<PendingPhoto>(STORE_PHOTOS),
      getAllRecords<PendingStrip>(STORE_STRIPS),
    ]);
    useOfflineStore.setState({
      pendingSessionCount: sessions.length,
      pendingPhotoCount: photos.length,
      pendingStripCount: strips.length,
    });
  } catch {
    // IndexedDB unavailable (private mode, locked-down profile, etc.) — the
    // offline queue simply won't persist; nothing else to do about it here.
  }
}

void refreshPendingCounts();

// ─── Public queue API ────────────────────────────────────────────────────────

export function createOfflineSessionId() {
  return `offline-${crypto.randomUUID()}`;
}

export function isOfflineSessionId(id: string | null | undefined): boolean {
  return !!id && id.startsWith("offline-");
}

export async function addPendingSession(meta: Omit<PendingSessionMeta, "createdAt">) {
  await putRecord(STORE_SESSIONS, { ...meta, createdAt: Date.now() });
  await refreshPendingCounts();
}

export async function addPendingPhoto(sessionId: string, slotIndex: number, blob: Blob) {
  const entry: PendingPhoto = { id: crypto.randomUUID(), sessionId, slotIndex, blob, createdAt: Date.now() };
  await putRecord(STORE_PHOTOS, entry);
  await refreshPendingCounts();
}

export async function addPendingStrip(sessionId: string, blob: Blob, shareUrl: string) {
  // put() overwrites any strip already queued for this session — only the
  // latest render (e.g. a retry after editing stickers) is worth keeping.
  await putRecord(STORE_STRIPS, { sessionId, blob, shareUrl, createdAt: Date.now() });
  await refreshPendingCounts();
}

// ─── Sync pending sessions/photos/strips when back online ──────────────────
// Slot clips and the combined gif/video are deliberately NOT queued here —
// they're bonus outputs, not required for the printed strip, admin records,
// or the customer's gallery link, and re-queuing full video blobs would risk
// the IndexedDB quota that photos/strips already need.

let _syncing = false;

export async function syncOfflineData() {
  if (_syncing) return;
  const { pendingSessionCount, pendingPhotoCount, pendingStripCount } = useOfflineStore.getState();
  if (pendingSessionCount === 0 && pendingPhotoCount === 0 && pendingStripCount === 0) return;

  _syncing = true;
  useOfflineStore.getState().setSyncInProgress(true);
  try {
    // 1. Turn queued offline sessions into real server sessions, then repoint
    //    any photos/strip already queued under the old client-only id.
    const sessions = await getAllRecords<PendingSessionMeta>(STORE_SESSIONS);
    for (const meta of sessions) {
      try {
        const real = await api.createSession({ packageId: meta.packageId, orientation: meta.orientation, selectedExtras: meta.selectedExtras });
        if (!real?.id) continue;
        await remapSessionId(meta.offlineId, real.id);
        await deleteRecord(STORE_SESSIONS, meta.offlineId);
        // If this offline session is still the kiosk's active session (the
        // customer hasn't finished yet), point it at the real id so later
        // calls (customer save, additional print, strip upload) target a
        // session that actually exists server-side.
        if (useKioskSession.getState().sessionId === meta.offlineId) {
          useKioskSession.getState().setSessionId(real.id);
        }
      } catch (err) {
        console.warn("[offline-sync] Gagal membuat sesi server untuk", meta.offlineId, err);
        // leave it queued — retried on the next sync pass
      }
    }

    // 2. Upload photos for any session that now has a real (non-offline) id.
    const photos = await getAllRecords<PendingPhoto>(STORE_PHOTOS);
    for (const photo of photos) {
      if (isOfflineSessionId(photo.sessionId)) continue; // its session still failed to create above
      try {
        await api.uploadPhoto(photo.sessionId, photo.slotIndex, photo.blob);
        await deleteRecord(STORE_PHOTOS, photo.id);
      } catch (err) {
        console.warn("[offline-sync] Gagal upload foto", photo.id, err);
      }
    }

    // 3. Upload the composited strip and finalize the session.
    const strips = await getAllRecords<PendingStrip>(STORE_STRIPS);
    for (const strip of strips) {
      if (isOfflineSessionId(strip.sessionId)) continue;
      try {
        const stripSession = await api.uploadStrip(strip.sessionId, strip.blob);
        if (!stripSession) throw new Error("Upload strip gagal");
        // shareUrl not sent — server always computes its own from PUBLIC_BASE_URL (see sessions.ts /finalize).
        await api.finalizeSession(strip.sessionId, { stripUrl: stripSession.stripUrl });
        await deleteRecord(STORE_STRIPS, strip.sessionId);
      } catch (err) {
        console.warn("[offline-sync] Gagal upload strip/finalize", strip.sessionId, err);
      }
    }
  } finally {
    await refreshPendingCounts();
    useOfflineStore.getState().setSyncInProgress(false);
    _syncing = false;
  }
}

async function remapSessionId(oldId: string, newId: string) {
  const photos = await getAllRecords<PendingPhoto>(STORE_PHOTOS);
  for (const photo of photos) {
    if (photo.sessionId !== oldId) continue;
    await putRecord(STORE_PHOTOS, { ...photo, sessionId: newId });
  }
  const strip = await runTx<PendingStrip | undefined>(STORE_STRIPS, "readonly", (store) => store.get(oldId) as IDBRequest<PendingStrip | undefined>);
  if (strip) {
    await deleteRecord(STORE_STRIPS, oldId);
    await putRecord(STORE_STRIPS, { ...strip, sessionId: newId });
  }
}

// ─── Network monitor (singleton, call once at app start) ──────────────────────

let _monitorStarted = false;

async function pingServer(): Promise<boolean> {
  try {
    // Ping whatever API base is currently configured (same-origin "/api" in
    // dev, or the paired tenant's remote URL once a kiosk is set up) — this
    // must not be hardcoded to a relative path now that the API isn't
    // necessarily same-origin.
    const res = await fetch(`${getApiBaseUrl()}/health`, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(4000) });
    return res.ok || res.status === 405; // 405 = method not allowed but server reachable
  } catch {
    return false;
  }
}

export function startNetworkMonitor() {
  if (_monitorStarted) return;
  _monitorStarted = true;

  const updateStatus = async (fromEvent?: "online" | "offline") => {
    if (fromEvent === "offline") {
      useOfflineStore.getState().setOnline(false);
      return;
    }
    // For "online" event or periodic check, do a real HTTP ping to confirm
    const reachable = await pingServer();
    useOfflineStore.getState().setOnline(reachable);
    if (reachable) void syncOfflineData();
  };

  window.addEventListener("online", () => updateStatus("online"));
  window.addEventListener("offline", () => updateStatus("offline"));

  // Periodic ping — doubles as the retry loop for anything still queued
  // (syncOfflineData no-ops immediately once the queue is empty).
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
