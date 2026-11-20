import { api } from "./api";
import { kvGet, kvPut } from "./offlineStore";

// Frame list per orientation, kept in memory for the life of the kiosk window. The picker used to fetch it cold on every
// visit and show a spinner each time; now the list is warmed in the background right after boot (see App.tsx) and the
// screen shows the last copy instantly while a fresh one loads underneath (stale-while-revalidate).
//
// Offline: every successful fetch also saves the list and the first frame images into IndexedDB (lib/offlineStore.ts), so a
// kiosk that restarts while the internet is down still has frames to choose from and to draw the strip with.
const cache = new Map<string, any[]>();
const inFlight = new Map<string, Promise<any[]>>();

const MAX_STORED_FRAMES = 24;
const MAX_STORED_IMAGE_BYTES = 6 * 1024 * 1024;
const listKey = (orientation: string) => `frames:${orientation}`;
const imageKey = (url: string) => `frame-img:${url}`;

export function peekFrames(orientation: string): any[] | undefined {
  return cache.get(orientation);
}

async function storeOfflineCopy(orientation: string, frames: any[]) {
  const stored = frames.slice(0, MAX_STORED_FRAMES);
  await kvPut(listKey(orientation), stored);
  for (const frame of stored) {
    const url = frame?.imageUrl;
    if (typeof url !== "string" || url.startsWith("data:") || url.startsWith("blob:")) continue;
    if (await kvGet(imageKey(url))) continue; // already saved
    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) continue;
      const blob = await res.blob();
      if (blob.size <= MAX_STORED_IMAGE_BYTES) await kvPut(imageKey(url), blob);
    } catch {
      // one image that will not download must not stop the rest
    }
  }
}

/** The last frame list saved while online, with images pointing at the saved copies. */
async function loadOfflineCopy(orientation: string): Promise<any[] | undefined> {
  const stored = await kvGet<any[]>(listKey(orientation));
  if (!stored?.length) return undefined;
  return Promise.all(stored.map(async (frame) => {
    const url = frame?.imageUrl;
    if (typeof url !== "string") return frame;
    const blob = await kvGet<Blob>(imageKey(url));
    return blob ? { ...frame, imageUrl: URL.createObjectURL(blob) } : frame;
  }));
}

export function fetchFrames(orientation: string): Promise<any[]> {
  const pending = inFlight.get(orientation);
  if (pending) return pending;
  const promise = api.getFrames(orientation)
    .then((result) => {
      const frames = result ?? [];
      cache.set(orientation, frames);
      void storeOfflineCopy(orientation, frames);
      return frames;
    })
    .catch(async (error) => {
      const offline = await loadOfflineCopy(orientation);
      if (!offline) throw error;
      cache.set(orientation, offline);
      return offline;
    })
    .finally(() => inFlight.delete(orientation));
  inFlight.set(orientation, promise);
  return promise;
}

/** Warm both orientations plus the frame images, so the picker opens with thumbnails already in the HTTP cache. */
export function prefetchFrames() {
  for (const orientation of ["portrait", "landscape"]) {
    fetchFrames(orientation)
      .then((frames) => {
        for (const frame of frames.slice(0, 24)) {
          const url = frame?.imageUrl;
          if (typeof url === "string" && !url.startsWith("data:")) {
            const img = new Image();
            img.decoding = "async";
            img.src = url;
          }
        }
      })
      .catch(() => undefined);
  }
}

/** Forget the cached lists (the offered frames changed, e.g. an event with its own frames started or ended). */
export function clearFramesCache() {
  cache.clear();
}
