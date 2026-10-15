import { useEffect, useRef, useState } from "react";

/**
 * Width actually available to a preview, capped at `maxWidth`. Previews render a fixed-size page and scale it down, so the scale has
 * to come from the real container width (a `max-width:100%` box shrinks but leaves the scaled page overflowing and cropped).
 * Attach the returned ref to a block element that takes the full available width (`w-full`, with `maxWidth` set).
 */
export function useFitWidth<T extends HTMLElement>(maxWidth: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(maxWidth);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(120, Math.min(maxWidth, Math.floor(el.clientWidth) || maxWidth)));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxWidth]);
  return [ref, width] as const;
}
