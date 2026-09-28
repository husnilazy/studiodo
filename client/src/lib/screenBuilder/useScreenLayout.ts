import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { LayoutElement, ScreenOrientation } from "./types";

function currentOrientation(): ScreenOrientation {
  if (typeof window === "undefined") return "portrait";
  return window.innerWidth > window.innerHeight ? "landscape" : "portrait";
}

/**
 * Runtime hook — fetches this tenant's saved position overrides for one kiosk
 * screen and returns them as an id-keyed map ready for PositionableProvider.
 * Empty map (no fetch failure surfaced) means "render everything at its normal
 * in-flow position", which is also the correct behavior while still loading —
 * never block/flash the page waiting on this.
 */
export function useScreenLayoutOverrides(screenKey: string): Record<string, LayoutElement> {
  const [overrides, setOverrides] = useState<Record<string, LayoutElement>>({});

  useEffect(() => {
    let cancelled = false;
    api.getScreenLayout(screenKey, currentOrientation()).then((result) => {
      if (cancelled) return;
      const map: Record<string, LayoutElement> = {};
      for (const element of result?.elements ?? []) map[element.id] = element;
      setOverrides(map);
    }).catch(() => {
      if (!cancelled) setOverrides({});
    });
    return () => { cancelled = true; };
  }, [screenKey]);

  return overrides;
}
