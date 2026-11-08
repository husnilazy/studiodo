import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

const THUMB = 36; // px

/**
 * Rounded "Apple-style" slider: a thick pill track with an accent fill and a big white round thumb you can drag with a finger.
 * The thumb follows the pointer directly (no easing on its position), so it feels attached to the finger; only its size
 * animates while pressed. Works with a mouse, touch and the arrow keys.
 */
export default function AppleSlider({ value, min, max, step = 1, onChange, label, className = "" }: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  label: string;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const ratio = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;

  const fromPointer = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= THUMB) return;
    // The thumb's centre travels between half a thumb from each end, so measure against that usable span.
    const span = rect.width - THUMB;
    const next = Math.max(0, Math.min(1, (clientX - rect.left - THUMB / 2) / span));
    const raw = min + next * (max - min);
    const stepped = Math.round(raw / step) * step;
    const clamped = Math.max(min, Math.min(max, Number(stepped.toFixed(4))));
    if (clamped !== value) onChange(clamped);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    fromPointer(event.clientX);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging) fromPointer(event.clientX);
  };
  const stop = () => setDragging(false);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const big = (max - min) / 10;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") onChange(Math.min(max, value + step));
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") onChange(Math.max(min, value - step));
    else if (event.key === "PageUp") onChange(Math.min(max, value + big));
    else if (event.key === "PageDown") onChange(Math.max(min, value - big));
    else return;
    event.preventDefault();
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onKeyDown={onKeyDown}
      className={`relative flex h-12 w-full cursor-pointer touch-none select-none items-center outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${className}`}
    >
      <div className="relative h-3 w-full rounded-full bg-fg/15">
        <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `calc(${THUMB / 2}px + ${ratio} * (100% - ${THUMB}px))` }} />
      </div>
      <div
        className="pointer-events-none absolute top-1/2 rounded-full bg-white"
        style={{
          width: THUMB,
          height: THUMB,
          left: `calc(${ratio} * (100% - ${THUMB}px))`,
          transform: `translateY(-50%) scale(${dragging ? 1.12 : 1})`,
          transition: "transform 140ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 140ms ease",
          boxShadow: dragging
            ? "0 6px 18px rgba(0,0,0,0.30), 0 0 0 0.5px rgba(0,0,0,0.10)"
            : "0 2px 8px rgba(0,0,0,0.26), 0 0 0 0.5px rgba(0,0,0,0.10)",
        }}
      />
    </div>
  );
}
