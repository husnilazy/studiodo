import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { usePositionableContext } from "@/lib/screenBuilder/PositionableContext";
import { isCustomId, type ElementType, type LayoutElement } from "@/lib/screenBuilder/types";

interface Props {
  id: string;
  type: ElementType;
  label: string;
  children: ReactNode;
  className?: string;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const SNAP_PCT = 1.2;

function measure(rect: DOMRect, canvasRect: DOMRect) {
  return {
    xPct: canvasRect.width ? ((rect.left - canvasRect.left) / canvasRect.width) * 100 : 0,
    yPct: canvasRect.height ? ((rect.top - canvasRect.top) / canvasRect.height) * 100 : 0,
    widthPct: canvasRect.width ? (rect.width / canvasRect.width) * 100 : 20,
    heightPct: canvasRect.height ? (rect.height / canvasRect.height) * 100 : 10,
  };
}

/** Snaps one axis: the element's centre to the middle of the screen, or its edges to the screen edges. */
function snapAxis(start: number, size: number): { value: number; snapped: boolean } {
  const centre = start + size / 2;
  if (Math.abs(centre - 50) < SNAP_PCT) return { value: 50 - size / 2, snapped: true };
  if (Math.abs(start) < SNAP_PCT) return { value: 0, snapped: false };
  if (Math.abs(start + size - 100) < SNAP_PCT) return { value: 100 - size, snapped: false };
  return { value: start, snapped: false };
}

function useViewport() {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

/**
 * Wraps one kiosk-screen element so the screen builder can move/scale it. Outside any provider, or with no saved
 * override, this is a pure passthrough — zero change to a page that was never customised.
 *
 * Elements the page draws itself are positioned and SCALED (never given a fixed width/height, which used to squash
 * their text into a tiny box); custom elements added in the builder keep an explicit box.
 */
export default function Positionable({ id, type, label, children, className }: Props) {
  const ctx = usePositionableContext();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    mode: "move" | "resize";
    startX: number;
    startY: number;
    base: LayoutElement;
    canvasRect: DOMRect;
    startWidthPx: number;
  } | null>(null);

  // Saved positions are % of the SCREEN. An absolutely positioned element, though, is placed relative to its nearest
  // positioned ancestor — which on most screens is some inner column, not the screen — so the same % landed in a
  // different place than where it was dragged. The ancestor's offset from the screen's corner is measured and
  // subtracted, which makes the % mean the same thing in the editor, on the kiosk, and at any screen size.
  const viewport = useViewport();
  const [origin, setOrigin] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    const parent = wrapperRef.current?.offsetParent as HTMLElement | null;
    const next = parent && parent !== document.body ? (() => { const box = parent.getBoundingClientRect(); return { left: box.left + parent.clientLeft, top: box.top + parent.clientTop }; })() : { left: 0, top: 0 };
    setOrigin((current) => (Math.abs(current.left - next.left) < 0.5 && Math.abs(current.top - next.top) < 0.5 ? current : next));
  });

  useEffect(() => {
    if (!ctx) return;
    ctx.register({ id, type, label });
    return () => ctx.unregister(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, id, type, label]);

  if (!ctx) return <>{children}</>;

  const override = ctx.overrides[id];
  const custom = isCustomId(id);

  const style: CSSProperties | undefined = override
    ? custom
      ? {
          position: "absolute",
          left: (override.xPct / 100) * viewport.width - origin.left,
          top: (override.yPct / 100) * viewport.height - origin.top,
          width: (override.widthPct / 100) * viewport.width,
          height: (override.heightPct / 100) * viewport.height,
          zIndex: override.zIndex,
          opacity: override.opacity !== undefined ? override.opacity / 100 : undefined,
          transform: override.rotation ? `rotate(${override.rotation}deg)` : undefined,
        }
      : {
          position: "absolute",
          left: (override.xPct / 100) * viewport.width - origin.left,
          top: (override.yPct / 100) * viewport.height - origin.top,
          width: "max-content",
          maxWidth: viewport.width,
          zIndex: override.zIndex,
          transform: override.scale && override.scale !== 1 ? `scale(${override.scale})` : undefined,
          transformOrigin: "top left",
          opacity: override.opacity !== undefined ? override.opacity / 100 : undefined,
          ...(override.fontSizeVw ? { fontSize: `${override.fontSizeVw}vw` } : {}),
        }
    : undefined;

  if (!ctx.editMode) {
    if (override?.hidden) return null;
    if (!override) return <>{children}</>;
    return <div style={style} className={className}>{children}</div>;
  }

  const isSelected = ctx.selectedId === id;

  const beginDrag = (event: React.PointerEvent, mode: "move" | "resize") => {
    event.stopPropagation();
    ctx.select(id);
    const canvas = ctx.canvasRef?.current;
    const node = wrapperRef.current;
    if (!canvas || !node) return;
    const canvasRect = canvas.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const base: LayoutElement = override ?? { id, type, zIndex: 0, ...measure(nodeRect, canvasRect) };
    if (!override) ctx.updateOverride(id, base);
    dragState.current = { mode, startX: event.clientX, startY: event.clientY, base, canvasRect, startWidthPx: nodeRect.width };
    (event.target as Element).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragState.current;
    const node = wrapperRef.current;
    if (!drag || !node) return;
    const dxPx = event.clientX - drag.startX;
    const dyPx = event.clientY - drag.startY;
    const dxPct = drag.canvasRect.width ? (dxPx / drag.canvasRect.width) * 100 : 0;
    const dyPct = drag.canvasRect.height ? (dyPx / drag.canvasRect.height) * 100 : 0;

    if (drag.mode === "move") {
      // Size on screen (includes any scale/rotation) decides where "centred" and "touching the edge" are.
      const size = measure(node.getBoundingClientRect(), drag.canvasRect);
      const rawX = drag.base.xPct + dxPct;
      const rawY = drag.base.yPct + dyPct;
      const x = snapAxis(rawX, size.widthPct);
      const y = snapAxis(rawY, size.heightPct);
      ctx.setGuides({ x: x.snapped, y: y.snapped });
      ctx.updateOverride(id, { xPct: clamp(x.value, -20, 100 - size.widthPct * 0.2), yPct: clamp(y.value, -20, 100 - size.heightPct * 0.2) });
      return;
    }

    if (custom) {
      ctx.updateOverride(id, {
        widthPct: clamp(drag.base.widthPct + dxPct, 3, 150),
        heightPct: clamp(drag.base.heightPct + dyPct, 2, 150),
      });
    } else {
      const baseScale = drag.base.scale ?? 1;
      const ratio = drag.startWidthPx > 0 ? (drag.startWidthPx + dxPx) / drag.startWidthPx : 1;
      ctx.updateOverride(id, { scale: Math.round(clamp(baseScale * ratio, 0.3, 4) * 100) / 100 });
    }
  };

  const endDrag = () => {
    dragState.current = null;
    ctx.setGuides(null);
  };

  const hidden = Boolean(override?.hidden);

  return (
    <div
      ref={wrapperRef}
      data-builder-id={id}
      style={{ ...(style ?? { position: "relative" }), ...(hidden ? { opacity: 0.25 } : null) }}
      className={`${isSelected ? "outline outline-2 outline-offset-2 outline-accent" : "outline outline-1 outline-dashed outline-fg/25 hover:outline-accent/60"} cursor-move touch-none ${className ?? ""}`}
      onPointerDown={(event) => beginDrag(event, "move")}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      // A plain click fires a separate native click event after pointerdown; without this it reaches the canvas's own
      // onClick (which deselects everything) and undoes the selection the same gesture just made.
      onClick={(event) => event.stopPropagation()}
    >
      {/* pointer-events-none is load-bearing: the REAL page component is mounted here, so its buttons carry real
          onClick handlers (navigate …) — dragging or clicking to select must never trigger them. */}
      <div className="pointer-events-none h-full w-full">{children}</div>
      {isSelected && (
        <>
          <span
            className="pointer-events-none absolute left-0 whitespace-nowrap rounded-md bg-accent px-2 py-0.5 text-[11px] font-semibold text-white shadow"
            style={{ bottom: "100%", marginBottom: 6, transform: `scale(${Math.max(1, 1 / (ctx.scale || 1))})`, transformOrigin: "bottom left" }}
          >
            {label}
          </span>
          <div
            data-builder-handle
            onPointerDown={(event) => beginDrag(event, "resize")}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            // Counter-scaled so the handle stays a constant, grabbable size however far the canvas is zoomed out.
            className="absolute -bottom-2.5 -right-2.5 h-5 w-5 cursor-nwse-resize rounded-full border-2 border-white bg-accent shadow-lg shadow-black/40"
            style={{ transform: `scale(${Math.max(1, 1 / (ctx.scale || 1))})` }}
          />
        </>
      )}
    </div>
  );
}
