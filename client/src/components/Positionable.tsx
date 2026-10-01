import { useEffect, useRef, type ReactNode } from "react";
import { usePositionableContext } from "@/lib/screenBuilder/PositionableContext";
import type { ElementType, LayoutElement } from "@/lib/screenBuilder/types";

interface Props {
  id: string;
  type: ElementType;
  label: string;
  children: ReactNode;
  className?: string;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function rectToPct(rect: DOMRect, canvasRect: DOMRect) {
  return {
    xPct: canvasRect.width ? ((rect.left - canvasRect.left) / canvasRect.width) * 100 : 0,
    yPct: canvasRect.height ? ((rect.top - canvasRect.top) / canvasRect.height) * 100 : 0,
    widthPct: canvasRect.width ? (rect.width / canvasRect.width) * 100 : 20,
    heightPct: canvasRect.height ? (rect.height / canvasRect.height) * 100 : 10,
  };
}

/**
 * Wraps one kiosk-screen element so its position/size can be overridden by the
 * WYSIWYG builder (Fase 5a). Outside any PositionableProvider, or with no saved
 * override, this is a pure passthrough — zero behavior/markup change from before
 * this feature existed. That's the property that makes it safe to add to a page
 * that's already live.
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
  } | null>(null);

  useEffect(() => {
    if (!ctx) return;
    ctx.register({ id, type, label });
    return () => ctx.unregister(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, id, type, label]);

  if (!ctx) return <>{children}</>;

  const override = ctx.overrides[id];
  const style = override
    ? {
        position: "absolute" as const,
        left: `${override.xPct}%`,
        top: `${override.yPct}%`,
        width: `${override.widthPct}%`,
        height: `${override.heightPct}%`,
        zIndex: override.zIndex,
        ...(override.fontSizeVw ? { fontSize: `${override.fontSizeVw}vw` } : {}),
      }
    : undefined;

  if (!ctx.editMode) {
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
    const base = override ?? { id, type, zIndex: 0, ...rectToPct(node.getBoundingClientRect(), canvasRect) };
    if (!override) ctx.updateOverride(id, base);
    dragState.current = { mode, startX: event.clientX, startY: event.clientY, base, canvasRect };
    (event.target as Element).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragState.current;
    if (!drag) return;
    const dxPct = drag.canvasRect.width ? ((event.clientX - drag.startX) / drag.canvasRect.width) * 100 : 0;
    const dyPct = drag.canvasRect.height ? ((event.clientY - drag.startY) / drag.canvasRect.height) * 100 : 0;
    if (drag.mode === "move") {
      ctx.updateOverride(id, {
        xPct: clamp(drag.base.xPct + dxPct, 0, 100 - drag.base.widthPct),
        yPct: clamp(drag.base.yPct + dyPct, 0, 100 - drag.base.heightPct),
      });
    } else {
      ctx.updateOverride(id, {
        widthPct: clamp(drag.base.widthPct + dxPct, 4, 100 - drag.base.xPct),
        heightPct: clamp(drag.base.heightPct + dyPct, 4, 100 - drag.base.yPct),
      });
    }
  };

  const endDrag = () => { dragState.current = null; };

  return (
    <div
      ref={wrapperRef}
      style={style ?? { position: "relative" }}
      className={`${isSelected ? "outline outline-2 outline-offset-2 outline-accent" : "outline outline-1 outline-dashed outline-fg/25 hover:outline-fg/50"} cursor-move ${className ?? ""}`}
      onPointerDown={(event) => beginDrag(event, "move")}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      // stopPropagation on pointerdown only stops THAT event from bubbling —
      // the native click event a plain (non-drag) click still fires afterward
      // is a separate dispatch, and was reaching the canvas's onClick (which
      // deselects everything), undoing the selection beginDrag just made in
      // the same gesture. That made simple click-to-select never stick — you
      // had to catch it mid-drag, which made the resize handle (only rendered
      // once isSelected) basically unreachable by clicking.
      onClick={(event) => event.stopPropagation()}
    >
      {/* pointer-events-none is load-bearing: this mounts the REAL page
          component for true WYSIWYG fidelity, so its buttons/links carry their
          real onClick (real navigate()) — without this, dragging or even just
          clicking to select in the editor can fire that handler and navigate
          the whole admin app away mid-edit (confirmed happening without it). */}
      <div className="pointer-events-none">{children}</div>
      {isSelected && (
        <div
          onPointerDown={(event) => beginDrag(event, "resize")}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          // The canvas itself is rendered at `ctx.scale` (often well under 1x
          // to fit a real 1080x1920 kiosk screen into an editor panel), which
          // shrinks this handle right along with it since it lives inside that
          // scaled subtree — at the old fixed small canvas size this rendered
          // at only a few screen pixels, effectively unclickable. Countering
          // with the inverse scale keeps it a constant, grabbable size; capped
          // at 1 so zooming further IN never shrinks it below its base size.
          className="absolute -bottom-2.5 -right-2.5 h-5 w-5 cursor-nwse-resize rounded-full border-2 border-white bg-accent shadow-lg shadow-black/40"
          style={{ transform: `scale(${Math.max(1, 1 / (ctx.scale || 1))})` }}
        />
      )}
    </div>
  );
}
