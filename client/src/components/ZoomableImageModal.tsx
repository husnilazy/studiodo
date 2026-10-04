import { useRef, useState, type ReactNode } from "react";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 320;

function clampScale(scale: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * Fullscreen pinch/wheel-zoom + drag-to-pan viewer for a single snapshot
 * image — no external pinch-zoom lib in this project, so this follows the
 * same hand-rolled pointer-event style already used for sticker drag/resize
 * in PreviewFoto.tsx rather than adding a new dependency for one screen.
 */
export default function ZoomableImageModal({ src, alt, onClose, mirror = false, title, footer }: { src: string; alt: string; onClose: () => void; /** Flip horizontally (match a mirrored live view). */ mirror?: boolean; title?: string; /** Extra actions shown under the picture (e.g. "Ambil ulang"). */ footer?: ReactNode }) {
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  // Active pointers currently down, keyed by pointerId — one entry means
  // "panning", two means "pinching" (distance between them drives scale).
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStateRef = useRef<{ distance: number; scale: number; midpoint: { x: number; y: number } } | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);

  // The image is a plain flex-centered child (no absolute -50%/-50%
  // trick), so at scale 1 / x=0 / y=0 its own center sits exactly at the
  // container's center. That makes "container center" the fixed reference
  // point every coordinate below is measured from — NOT the container's
  // top-left corner — since `transform: translate(x,y) scale(scale)` moves
  // and scales the image relative to that center, not relative to (0,0).
  const relativeToCenter = (clientX: number, clientY: number) => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return null;
    return { x: clientX - box.left - box.width / 2, y: clientY - box.top - box.height / 2 };
  };

  const zoomAt = (clientX: number, clientY: number, factor: number) => {
    const point = relativeToCenter(clientX, clientY);
    if (!point) return;
    setTransform((prev) => {
      const nextScale = clampScale(prev.scale * factor);
      const ratio = nextScale / prev.scale;
      return {
        scale: nextScale,
        x: point.x - (point.x - prev.x) * ratio,
        y: point.y - (point.y - prev.y) * ratio,
      };
    });
  };

  const resetOrZoomTo = (clientX: number, clientY: number) => {
    setTransform((prev) => {
      if (prev.scale > 1.05) return { scale: 1, x: 0, y: 0 };
      const point = relativeToCenter(clientX, clientY);
      if (!point) return { scale: DOUBLE_TAP_SCALE, x: 0, y: 0 };
      return { scale: DOUBLE_TAP_SCALE, x: point.x * (1 - DOUBLE_TAP_SCALE), y: point.y * (1 - DOUBLE_TAP_SCALE) };
    });
  };

  const handleWheel = (event: React.WheelEvent) => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    zoomAt(event.clientX, event.clientY, factor);
  };

  const handlePointerDown = (event: React.PointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      pinchStateRef.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        scale: transform.scale,
        midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
    }
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    const prevPos = pointersRef.current.get(event.pointerId)!;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointersRef.current.size === 2 && pinchStateRef.current) {
      const [a, b] = Array.from(pointersRef.current.values());
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const factor = distance / (pinchStateRef.current.distance || distance);
      const mid = relativeToCenter((a.x + b.x) / 2, (a.y + b.y) / 2);
      if (!mid) return;
      const nextScale = clampScale(pinchStateRef.current.scale * factor);
      setTransform((prev) => ({
        scale: nextScale,
        x: mid.x - (mid.x - prev.x) * (nextScale / prev.scale),
        y: mid.y - (mid.y - prev.y) * (nextScale / prev.scale),
      }));
      return;
    }

    if (pointersRef.current.size === 1) {
      const dx = event.clientX - prevPos.x;
      const dy = event.clientY - prevPos.y;
      setTransform((prev) => (prev.scale > 1 ? { ...prev, x: prev.x + dx, y: prev.y + dy } : prev));
    }
  };

  const endPointer = (event: React.PointerEvent) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchStateRef.current = null;
  };

  const handleClick = (event: React.PointerEvent) => {
    const now = Date.now();
    const last = lastTapRef.current;
    lastTapRef.current = { time: now, x: event.clientX, y: event.clientY };
    if (last && now - last.time < DOUBLE_TAP_MS && Math.hypot(event.clientX - last.x, event.clientY - last.y) < 30) {
      resetOrZoomTo(event.clientX, event.clientY);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/90 backdrop-blur-sm" role="dialog" aria-modal="true">
      <button
        type="button"
        onClick={onClose}
        aria-label="Tutup"
        className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border-2 border-white/20 bg-black/50 text-2xl text-white shadow-lg backdrop-blur-sm transition hover:border-white/50"
      >
        ×
      </button>
      <p className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full bg-black/50 px-4 py-1.5 text-xs font-medium text-white/60">
        {title ? `${title} · ` : ""}Cubit atau scroll untuk zoom · geser untuk lihat detail · tap 2x untuk reset
      </p>
      <div
        ref={containerRef}
        className="relative flex flex-1 touch-none items-center justify-center overflow-hidden"
        onWheel={handleWheel}
        onPointerDown={(event) => { handlePointerDown(event); handleClick(event); }}
        onPointerMove={handlePointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={endPointer}
      >
        {/* Plain flex-centered (not absolute -50%/-50%) so the image's own
            center coincides with the container's center at rest — every
            zoom/pan calculation above is measured from that same fixed
            point, which an absolute-positioning trick here would throw off. */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="max-w-none select-none object-contain"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})${mirror ? " scaleX(-1)" : ""}`,
            transformOrigin: "center",
            width: "min(92vw, 820px)",
            maxHeight: "74vh",
            height: "auto",
          }}
        />
      </div>
      {footer && <div className="relative z-10 flex flex-wrap items-center justify-center gap-3 p-4 pb-6">{footer}</div>}
    </div>
  );
}
