import { api } from "./api";

// Frame list per orientation, kept in memory for the life of the kiosk window. The picker used to fetch it cold on every
// visit and show a spinner each time; now the list is warmed in the background right after boot (see App.tsx) and the
// screen shows the last copy instantly while a fresh one loads underneath (stale-while-revalidate).
const cache = new Map<string, any[]>();
const inFlight = new Map<string, Promise<any[]>>();

export function peekFrames(orientation: string): any[] | undefined {
  return cache.get(orientation);
}

export function fetchFrames(orientation: string): Promise<any[]> {
  const pending = inFlight.get(orientation);
  if (pending) return pending;
  const promise = api.getFrames(orientation)
    .then((result) => {
      const frames = result ?? [];
      cache.set(orientation, frames);
      return frames;
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
