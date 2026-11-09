import { useRef, useState, type PointerEvent, type WheelEvent } from "react";
import type { PhotoEdit } from "@/lib/sessionStore";

export interface GestureSlot {
  /** Which photo this box shows. */
  photo: number;
  /** The box on the canvas, as fractions (0..1). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Which box of the frame this is (so a plain tap can pick it in the arrange tab). */
  slotIndex?: number;
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 3;
const DEFAULT_EDIT: PhotoEdit = { zoom: 1, rotation: 0, offsetX: 0, offsetY: 0 };
const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));

interface ZoneProps {
  slot: GestureSlot;
  box: { width: number; height: number };
  canvas: { w: number; h: number };
  dim?: { w: number; h: number };
  edit: PhotoEdit;
  selected: boolean;
  onSelect: (photo: number) => void;
  onEdit: (photo: number, edit: PhotoEdit) => void;
  onFirstGesture: () => void;
  onTap?: (slotIndex: number) => void;
}

/** One photo box: drag = move the picture inside the box, pinch / wheel = zoom, double tap = zoom 2x or back to normal. */
function Zone({ slot, box, canvas, dim, edit, selected, onSelect, onEdit, onFirstGesture, onTap }: ZoneProps) {
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const lastTap = useRef(0);
  const moved = useRef(false);
  const [active, setActive] = useState(false);
  // Handlers run many times per second; they must read the newest edit, not the one captured when they were created.
  const editRef = useRef(edit);
  editRef.current = edit;

  /** Screen pixels the picture moves per source pixel, for the current zoom. */
  const geometry = () => {
    const k = box.width / canvas.w;
    const slotW = slot.w * canvas.w;
    const slotH = slot.h * canvas.h;
    const iw = dim?.w ?? 0;
    const ih = dim?.h ?? 0;
    const base = iw && ih ? Math.max(slotW / iw, slotH / ih) : 1;
    const scale = base * editRef.current.zoom;
    const slackX = iw ? Math.max(0, iw - slotW / scale) : 0;
    const slackY = ih ? Math.max(0, ih - slotH / scale) : 0;
    return { k, scale, slackX, slackY };
  };

  const apply = (patch: Partial<PhotoEdit>) => {
    const current = editRef.current;
    const next = { ...current, ...patch };
    next.zoom = clamp(next.zoom, ZOOM_MIN, ZOOM_MAX);
    next.offsetX = clamp(next.offsetX, -1, 1);
    next.offsetY = clamp(next.offsetY, -1, 1);
    editRef.current = next;
    onEdit(slot.photo, next);
  };

  // Dragging the picture right shows more of its left side, so the offset goes down (the mirrored output flips both the
  // picture and the pan direction, which cancel out, so no special case).
  const pan = (dxScreen: number, dyScreen: number) => {
    const { k, scale, slackX, slackY } = geometry();
    if (!k || !scale) return;
    const patch: Partial<PhotoEdit> = {};
    if (slackX > 0) patch.offsetX = editRef.current.offsetX - dxScreen / k / scale / (slackX / 2);
    if (slackY > 0) patch.offsetY = editRef.current.offsetY - dyScreen / k / scale / (slackY / 2);
    if (Object.keys(patch).length) apply(patch);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* pointer already gone */ }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setActive(true);
    onSelect(slot.photo);
    onFirstGesture();
    if (pointers.current.size === 1) moved.current = false;
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: editRef.current.zoom };
      moved.current = true;
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const current = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, current);
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = Array.from(pointers.current.values());
      const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      // The picture follows the pair's midpoint while it is being zoomed.
      const midDx = (current.x - previous.x) / 2;
      const midDy = (current.y - previous.y) / 2;
      apply({ zoom: pinch.current.zoom * (distance / pinch.current.distance) });
      pan(midDx, midDy);
      return;
    }
    const dx = current.x - previous.x;
    const dy = current.y - previous.y;
    if (Math.abs(dx) + Math.abs(dy) > 1.5) moved.current = true;
    pan(dx, dy);
  };

  const release = (event: PointerEvent<HTMLDivElement>) => {
    const wasDown = pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      setActive(false);
      if (wasDown && !moved.current) {
        if (onTap && slot.slotIndex !== undefined) onTap(slot.slotIndex);
        const now = Date.now();
        if (now - lastTap.current < 320) {
          apply(editRef.current.zoom > 1.05 ? { zoom: 1, offsetX: 0, offsetY: 0 } : { zoom: 2 });
          lastTap.current = 0;
        } else lastTap.current = now;
      }
    }
  };

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    onFirstGesture();
    onSelect(slot.photo);
    apply({ zoom: editRef.current.zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08) });
  };

  return (
    <div
      role="group"
      aria-label={`Foto ${slot.photo + 1}: seret untuk menggeser, cubit untuk zoom`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={release}
      onPointerCancel={release}
      onWheel={onWheel}
      className={`absolute touch-none cursor-grab select-none transition-[box-shadow] duration-150 active:cursor-grabbing ${active ? "shadow-[inset_0_0_0_3px_var(--accent)]" : selected ? "shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--accent)_65%,transparent)]" : ""}`}
      style={{ left: `${slot.x * 100}%`, top: `${slot.y * 100}%`, width: `${slot.w * 100}%`, height: `${slot.h * 100}%` }}
    />
  );
}

/** Touch layer over the finished preview: every photo box can be moved and zoomed directly with the fingers. */
export default function PhotoGestureLayer({ slots, box, canvas, dims, edits, selected, onSelect, onEdit, onFirstGesture, onTap }: {
  slots: GestureSlot[];
  box: { width: number; height: number };
  canvas: { w: number; h: number };
  dims: Record<number, { w: number; h: number }>;
  edits: Record<number, PhotoEdit>;
  selected: number;
  onSelect: (photo: number) => void;
  onEdit: (photo: number, edit: PhotoEdit) => void;
  onFirstGesture: () => void;
  onTap?: (slotIndex: number) => void;
}) {
  return (
    <div className="absolute inset-0">
      {slots.map((slot, index) => (
        <Zone
          key={`${index}-${slot.photo}`}
          slot={slot}
          box={box}
          canvas={canvas}
          dim={dims[slot.photo]}
          edit={edits[slot.photo] ?? DEFAULT_EDIT}
          selected={selected === slot.photo}
          onSelect={onSelect}
          onEdit={onEdit}
          onFirstGesture={onFirstGesture}
          onTap={onTap}
        />
      ))}
    </div>
  );
}
