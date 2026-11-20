import { create } from "zustand";
import { getApiBaseUrl } from "./apiConfig";
import { api } from "./api";
import { useKioskSession } from "./sessionStore";

const PACKAGE_CACHE_KEY = "studiodo-offline-packages";
const PUBLIC_BASE_KEY = "studiodo-public-base-url";
const PING_INTERVAL_MS = 15_000; // re-check every 15s

// ─── IndexedDB-backed offline queue ─────────────────────────────────────────
// Sessions/photos/strips created while offline are queued here as real Blobs
// (not base64 in localStorage) so a handful of full-resolution captures don't
// blow past localStorage's ~5-10MB quota.

const DB_NAME = "studiodo-offline";
const DB_VERSION = 2;
const STORE_SESSIONS = "pendingSessions";
const STORE_PHOTOS = "pendingPhotos";
const STORE_STRIPS = "pendingStrips";
const STORE_OPS = "pendingOps"; // small session updates made while offline (frame choice, customer details, event-free mark)
const STORE_KV = "kv"; // offline copies of things fetched while online (frame list, frame images)

export interface PendingSessionMeta {
  offlineId: string;
  packageId?: string;
  orientation: string;
  selectedExtras: { id: string; name: string; price: number }[];
  printQty?: number;
  /** Set the moment the server created the real session: a retry after a crash must not create a second one. */
  realId?: string;
  createdAt: number;
}

export type PendingOpKind = "patch" | "eventFree" | "customer";
export interface PendingOp {
  id: string;
  sessionId: string;
  kind: PendingOpKind;
  payload: Record<string, unknown>;
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
      if (!db.objectStoreNames.contains(STORE_OPS)) db.createObjectStore(STORE_OPS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE_KV)) db.createObjectStore(STORE_KV, { keyPath: "key" });
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
  pendingOpCount: number;
  /** The offline queue could not save something (storage full / unavailable): the crew must know. */
  queueFailed: boolean;
  storageLow: boolean;

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
  pendingOpCount: 0,
  queueFailed: false,
  storageLow: false,

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
    const [sessions, photos, strips, ops] = await Promise.all([
      getAllRecords<PendingSessionMeta>(STORE_SESSIONS),
      getAllRecords<PendingPhoto>(STORE_PHOTOS),
      getAllRecords<PendingStrip>(STORE_STRIPS),
      getAllRecords<PendingOp>(STORE_OPS),
    ]);
    useOfflineStore.setState({
      // a session the server already created (kept only until its photos are remapped) is not "pending" for the crew
      pendingSessionCount: sessions.filter((s) => !s.realId).length,
      pendingPhotoCount: photos.length,
      pendingStripCount: strips.length,
      pendingOpCount: ops.length,
    });
  } catch {
    // IndexedDB unavailable (private mode, locked-down profile, etc.) — the
    // offline queue simply won't persist; nothing else to do about it here.
  }
}

void refreshPendingCounts();

/** Saves to the queue; if that fails (storage full / blocked) the kiosk shows a crew warning instead of failing silently. */
async function queuePut<T>(storeName: string, record: T) {
  try {
    await putRecord(storeName, record);
  } catch (error) {
    useOfflineStore.setState({ queueFailed: true });
    console.error("Antrean offline gagal menyimpan data (penyimpanan penuh atau tidak tersedia)", error);
    throw error;
  }
}

// Ask the browser not to evict the queue under storage pressure, and watch free space while anything is waiting to sync.
if (typeof navigator !== "undefined" && navigator.storage?.persist) void navigator.storage.persist().catch(() => undefined);
async function checkStorage() {
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.quota && est.usage !== undefined) useOfflineStore.setState({ storageLow: est.usage / est.quota > 0.85 });
  } catch { /* not available: nothing to warn about */ }
}

// Offline copies of small things fetched while online (key/value, JSON or Blob).
export async function kvGet<T>(key: string): Promise<T | undefined> {
  try { return (await runTx<{ key: string; value: T } | undefined>(STORE_KV, "readonly", (store) => store.get(key) as IDBRequest<{ key: string; value: T } | undefined>))?.value; } catch { return undefined; }
}
export async function kvPut(key: string, value: unknown) {
  try { await putRecord(STORE_KV, { key, value }); } catch { /* a cache that cannot be written is simply absent */ }
}

// ─── Public queue API ────────────────────────────────────────────────────────

export function createOfflineSessionId() {
  return `offline-${crypto.randomUUID()}`;
}

export function isOfflineSessionId(id: string | null | undefined): boolean {
  return !!id && id.startsWith("offline-");
}

export async function addPendingSession(meta: Omit<PendingSessionMeta, "createdAt">) {
  await queuePut(STORE_SESSIONS, { ...meta, createdAt: Date.now() });
  await refreshPendingCounts();
}

export async function addPendingPhoto(sessionId: string, slotIndex: number, blob: Blob) {
  const entry: PendingPhoto = { id: crypto.randomUUID(), sessionId, slotIndex, blob, createdAt: Date.now() };
  await queuePut(STORE_PHOTOS, entry);
  void checkStorage();
  await refreshPendingCounts();
}

export async function addPendingStrip(sessionId: string, blob: Blob, shareUrl: string) {
  // put() overwrites any strip already queued for this session — only the
  // latest render (e.g. a retry after editing stickers) is worth keeping.
  await queuePut(STORE_STRIPS, { sessionId, blob, shareUrl, createdAt: Date.now() });
  await refreshPendingCounts();
}

/**
 * Sends a small session update (frame choice, customer details, event-free mark) now when online; otherwise — or if the
 * request fails — keeps it in the queue so it reaches the server once the session exists there and the network is back.
 * Resolves true when it was sent, false when it was queued.
 */
export async function sendSessionOp(sessionId: string, kind: PendingOpKind, payload: Record<string, unknown>): Promise<boolean> {
  const run = () => (kind === "patch" ? api.patchSession(sessionId, payload) : kind === "eventFree" ? api.markEventFree(sessionId, payload.eventName as string | undefined) : api.updateCustomer(sessionId, payload as Parameters<typeof api.updateCustomer>[1]));
  if (isBrowserOnline() && !isOfflineSessionId(sessionId)) {
    try { await run(); return true; } catch (error) { console.warn("Perubahan sesi ditunda untuk sinkronisasi", kind, error); }
  }
  await queuePut(STORE_OPS, { id: crypto.randomUUID(), sessionId, kind, payload, createdAt: Date.now() } satisfies PendingOp);
  await refreshPendingCounts();
  return false;
}

// ─── Sync pending sessions/photos/strips when back online ──────────────────
// Slot clips and the combined gif/video are deliberately NOT queued here —
// they're bonus outputs, not required for the printed strip, admin records,
// or the customer's gallery link, and re-queuing full video blobs would risk
// the IndexedDB quota that photos/strips already need.

let _syncing = false;

// Per-record retry backoff. A record that keeps failing for a reason that won't fix itself (a misconfigured storage
// target, a rejected file) used to be re-sent in full every 15s forever, hammering the server — with several photos
// queued that was enough to starve real customer requests. Now each failure doubles the wait (15s → 30s → … max 10 min).
const retryState = new Map<string, { attempts: number; nextAt: number }>();
const RETRY_BASE_MS = 15_000;
const RETRY_MAX_MS = 10 * 60_000;
const dueForRetry = (key: string) => (retryState.get(key)?.nextAt ?? 0) <= Date.now();
const noteFailure = (key: string) => {
  const attempts = (retryState.get(key)?.attempts ?? 0) + 1;
  retryState.set(key, { attempts, nextAt: Date.now() + Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (attempts - 1)) });
};
const noteSuccess = (key: string) => { retryState.delete(key); };

export async function syncOfflineData() {
  if (_syncing) return;
  const { pendingSessionCount, pendingPhotoCount, pendingStripCount, pendingOpCount } = useOfflineStore.getState();
  // (a session kept only so late photos can be remapped has realId set and is not counted, but still gets its cleanup pass)
  if (pendingSessionCount === 0 && pendingPhotoCount === 0 && pendingStripCount === 0 && pendingOpCount === 0) {
    const kept = await getAllRecords<PendingSessionMeta>(STORE_SESSIONS).catch(() => []);
    if (kept.length === 0) return;
  }

  _syncing = true;
  useOfflineStore.getState().setSyncInProgress(true);
  try {
    // 1. Turn queued offline sessions into real server sessions, then repoint
    //    any photos/strip already queued under the old client-only id.
    const sessions = await getAllRecords<PendingSessionMeta>(STORE_SESSIONS);
    for (const meta of sessions) {
      if (meta.realId) continue; // already created on the server; only waiting for its cleanup pass below
      if (!dueForRetry(`s:${meta.offlineId}`)) continue;
      try {
        const real = await api.createSession({ packageId: meta.packageId, orientation: meta.orientation, selectedExtras: meta.selectedExtras, printQty: meta.printQty, offline: true });
        if (!real?.id) continue;
        // Write the server id down FIRST: if the app dies right after this, the retry must not create a second session.
        meta.realId = real.id;
        await putRecord(STORE_SESSIONS, meta);
        await remapSessionId(meta.offlineId, real.id);
        // If this offline session is still the kiosk's active session (the customer hasn't finished yet), point it at the
        // real id so later calls (customer save, additional print, strip upload) target a session that exists server-side.
        if (useKioskSession.getState().sessionId === meta.offlineId) {
          useKioskSession.getState().setSessionId(real.id);
        }
      } catch (err) {
        noteFailure(`s:${meta.offlineId}`);
        console.warn("[offline-sync] Gagal membuat sesi server untuk", meta.offlineId, err);
        // leave it queued, retried on the next sync pass
      }
    }

    // 1b. Late arrivals: a photo/strip/update queued under the old id while the id was being swapped is remapped on every
    //     pass, and the old record is dropped only when nothing references it any more (and it is not the active session).
    const created = (await getAllRecords<PendingSessionMeta>(STORE_SESSIONS)).filter((m) => m.realId);
    for (const meta of created) {
      await remapSessionId(meta.offlineId, meta.realId!);
      if (useKioskSession.getState().sessionId === meta.offlineId) { useKioskSession.getState().setSessionId(meta.realId!); continue; }
      if (Date.now() - meta.createdAt < 10 * 60_000) continue;
      const [photos, strips, ops] = await Promise.all([getAllRecords<PendingPhoto>(STORE_PHOTOS), getAllRecords<PendingStrip>(STORE_STRIPS), getAllRecords<PendingOp>(STORE_OPS)]);
      const stillUsed = photos.some((x) => x.sessionId === meta.offlineId) || strips.some((x) => x.sessionId === meta.offlineId) || ops.some((x) => x.sessionId === meta.offlineId);
      if (!stillUsed) await deleteRecord(STORE_SESSIONS, meta.offlineId);
    }

    // 1c. Small updates made offline (frame choice, customer details, event-free mark), once their session exists server-side.
    const queuedOps = (await getAllRecords<PendingOp>(STORE_OPS)).sort((a, b) => a.createdAt - b.createdAt);
    for (const op of queuedOps) {
      if (isOfflineSessionId(op.sessionId)) continue;
      if (!dueForRetry(`o:${op.id}`)) continue;
      try {
        if (op.kind === "patch") await api.patchSession(op.sessionId, op.payload);
        else if (op.kind === "eventFree") await api.markEventFree(op.sessionId, op.payload.eventName as string | undefined);
        else await api.updateCustomer(op.sessionId, op.payload as Parameters<typeof api.updateCustomer>[1]);
        await deleteRecord(STORE_OPS, op.id);
        noteSuccess(`o:${op.id}`);
      } catch (err) {
        noteFailure(`o:${op.id}`);
        console.warn("[offline-sync] Gagal mengirim perubahan sesi", op.kind, err);
      }
    }

    // 2. Upload photos for any session that now has a real (non-offline) id.
    const photos = await getAllRecords<PendingPhoto>(STORE_PHOTOS);
    for (const photo of photos) {
      if (isOfflineSessionId(photo.sessionId)) continue; // its session still failed to create above
      if (!dueForRetry(`p:${photo.id}`)) continue;
      try {
        await api.uploadPhoto(photo.sessionId, photo.slotIndex, photo.blob);
        await deleteRecord(STORE_PHOTOS, photo.id);
        noteSuccess(`p:${photo.id}`);
      } catch (err) {
        noteFailure(`p:${photo.id}`);
        console.warn("[offline-sync] Gagal upload foto", photo.id, err);
      }
    }

    // 3. Upload the composited strip and finalize the session.
    const strips = await getAllRecords<PendingStrip>(STORE_STRIPS);
    for (const strip of strips) {
      if (isOfflineSessionId(strip.sessionId)) continue;
      if (!dueForRetry(`t:${strip.sessionId}`)) continue;
      try {
        const stripSession = await api.uploadStrip(strip.sessionId, strip.blob);
        if (!stripSession) throw new Error("Upload strip gagal");
        // shareUrl not sent — server always computes its own from PUBLIC_BASE_URL (see sessions.ts /finalize).
        await api.finalizeSession(strip.sessionId, { stripUrl: stripSession.stripUrl });
        await deleteRecord(STORE_STRIPS, strip.sessionId);
        noteSuccess(`t:${strip.sessionId}`);
      } catch (err) {
        noteFailure(`t:${strip.sessionId}`);
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
  const ops = await getAllRecords<PendingOp>(STORE_OPS);
  for (const op of ops) {
    if (op.sessionId === oldId) await putRecord(STORE_OPS, { ...op, sessionId: newId });
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

  const onOnline = () => updateStatus("online");
  const onOffline = () => updateStatus("offline");
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);

  // Periodic ping — doubles as the retry loop for anything still queued
  // (syncOfflineData no-ops immediately once the queue is empty).
  const interval = setInterval(() => updateStatus(), PING_INTERVAL_MS);

  // Initial check
  updateStatus();

  return () => {
    clearInterval(interval);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
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

/** The public address galleries live at (QR links). Remembered while online so an offline kiosk never falls back to file://. */
export function readCachedPublicBaseUrl(): string | null {
  try { return localStorage.getItem(PUBLIC_BASE_KEY); } catch { return null; }
}
export function cachePublicBaseUrl(url: string) {
  try { localStorage.setItem(PUBLIC_BASE_KEY, url); } catch { /* ignore */ }
}

export function cachePackages<T>(packages: T[]) {
  try { localStorage.setItem(PACKAGE_CACHE_KEY, JSON.stringify(packages)); } catch { /* ignore */ }
}
