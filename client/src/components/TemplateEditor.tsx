import { useEffect, useRef, useState } from "react";
import type { LocalTemplate, TemplateSlot } from "@/lib/templateStore";

type EditorMode = "slots" | "guide";

interface Props {
  template: LocalTemplate;
  onChange: (patch: Partial<LocalTemplate>) => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
// "free" (no locked aspectRatio) is the default now — a slot used to always
// be pinned to whatever ratio it was created with (4:3), so dragging the
// resize handle only ever moved the width and silently recomputed height to
// match that ratio, ignoring vertical drag entirely. That's what made resize
// feel rigid/non-proportional: the handle didn't track the cursor on the
// y-axis at all unless you happened to want exactly that locked shape.
const SLOT_RATIOS: { label: string; value: number | null }[] = [
  { label: "Bebas", value: null },
  { label: "4:3", value: 4 / 3 },
  { label: "16:9", value: 16 / 9 },
  { label: "1:1", value: 1 },
  { label: "3:4", value: 3 / 4 },
  { label: "9:16", value: 9 / 16 },
];

export default function TemplateEditor({ template, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selected, setSelected] = useState(0);
  const [mode, setMode] = useState<EditorMode>("slots");
  const [drag, setDrag] = useState<{ x: number; y: number; slot: TemplateSlot; resizing: boolean } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      canvas.width = 600;
      canvas.height = Math.round(600 * template.canvasHeight / template.canvasWidth);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      template.slots.forEach((slot, index) => {
        const x = slot.x * canvas.width;
        const y = slot.y * canvas.height;
        const w = slot.w * canvas.width;
        const h = slot.h * canvas.height;
        ctx.fillStyle = mode === "guide" ? "rgba(40, 255, 100, .2)" : "rgba(124, 58, 237, .2)";
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = index === selected ? "#ffffff" : "#7c3aed";
        ctx.lineWidth = index === selected ? 4 : 2;
        ctx.setLineDash(index === selected ? [] : [6, 6]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        if (index === selected) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(x + w - 16, y + h - 16, 16, 16);
          ctx.strokeStyle = "#7c3aed";
          ctx.strokeRect(x + w - 16, y + h - 16, 16, 16);
        }
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 16px sans-serif";
        ctx.fillText(String(index + 1), x + 8, y + 22);
      });
    };
    image.src = template.frameDataUrl;
  }, [template, selected, mode]);

  const pointerPosition = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: clamp((event.clientX - bounds.left) / bounds.width, 0, 1),
      y: clamp((event.clientY - bounds.top) / bounds.height, 0, 1),
    };
  };

  const startDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = pointerPosition(event);
    const index = template.slots.findIndex((slot) => point.x >= slot.x && point.x <= slot.x + slot.w && point.y >= slot.y && point.y <= slot.y + slot.h);
    if (index < 0) return;
    setSelected(index);
    const slot = template.slots[index];
    const resizing = point.x > slot.x + slot.w - 0.055 && point.y > slot.y + slot.h - 0.055;
    setDrag({ ...point, slot, resizing });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drag) return;
    const point = pointerPosition(event);
    const dx = point.x - drag.x;
    const dy = point.y - drag.y;
    let next: TemplateSlot;
    if (drag.resizing) {
      const newW = clamp(drag.slot.w + dx, 0.05, 1 - drag.slot.x);
      if (drag.slot.aspectRatio) {
        // Ratio locked (via the dropdown) — height still follows width so the
        // shape stays fixed, exactly as before.
        const newH = Math.min((newW * template.canvasWidth / template.canvasHeight) / drag.slot.aspectRatio, 1 - drag.slot.y);
        next = { ...drag.slot, w: newW, h: newH };
      } else {
        // Free resize — width and height each track the cursor's own axis
        // independently, so a diagonal drag actually resizes diagonally.
        const newH = clamp(drag.slot.h + dy, 0.05, 1 - drag.slot.y);
        next = { ...drag.slot, w: newW, h: newH };
      }
    } else {
      next = {
        ...drag.slot,
        x: clamp(drag.slot.x + dx, 0, 1 - drag.slot.w),
        y: clamp(drag.slot.y + dy, 0, 1 - drag.slot.h),
      };
    }
    onChange({ slots: template.slots.map((slot, index) => index === selected ? next : slot) });
  };

  const finishDrag = () => setDrag(null);

  const selectedSlot = template.slots[selected];
  const setRatio = (ratio: number | null) => {
    if (!selectedSlot) return;
    if (ratio === null) {
      // "Bebas" — unlock the shape without moving/resizing it; the next
      // resize drag will then move width and height independently.
      onChange({ slots: template.slots.map((slot, index) => index === selected ? { ...slot, aspectRatio: undefined } : slot) });
      return;
    }
    const width = Math.min(selectedSlot.w, 1 - selectedSlot.x);
    const height = Math.min((width * template.canvasWidth / template.canvasHeight) / ratio, 1 - selectedSlot.y);
    onChange({ slots: template.slots.map((slot, index) => index === selected ? { ...slot, w: width, h: height, aspectRatio: ratio } : slot) });
  };

  const addSlot = () => {
    const width = Math.min(0.4, 1);
    const height = Math.min(width * template.canvasWidth / template.canvasHeight, 1);
    const columns = Math.max(1, Math.ceil(Math.sqrt(template.slots.length + 1)));
    const index = template.slots.length;
    const x = Math.min(1 - width, (index % columns) * (width + 0.02));
    const y = Math.min(1 - height, Math.floor(index / columns) * (height + 0.02));
    // No aspectRatio here — new slots start freely resizable; a preset ratio
    // is opt-in via the "Rasio slot" dropdown below, not the default.
    onChange({ slots: [...template.slots, { x, y, w: width, h: height }] });
    setSelected(index);
  };

  const deleteSelectedSlot = () => {
    if (template.slots.length <= 1) return;
    const nextSlots = template.slots.filter((_, index) => index !== selected);
    onChange({ slots: nextSlots });
    setSelected(Math.min(selected, nextSlots.length - 1));
  };

  const removeGreenScreen = () => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let index = 0; index < pixels.data.length; index += 4) {
        const r = pixels.data[index];
        const g = pixels.data[index + 1];
        const b = pixels.data[index + 2];
        const isGreen = g > 70 && g > r * 1.18 && g > b * 1.12 && g - r > 28 && g - b > 18;
        if (isGreen) pixels.data[index + 3] = 0;
      }
      ctx.putImageData(pixels, 0, 0);
      onChange({ frameDataUrl: canvas.toDataURL("image/png") });
      setMode("slots");
    };
    image.src = template.frameDataUrl;
  };

  const detectGreenSlots = () => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const size = 120;
      const offscreen = document.createElement("canvas");
      offscreen.width = size;
      offscreen.height = Math.round(size * template.canvasHeight / template.canvasWidth);
      const ctx = offscreen.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(image, 0, 0, offscreen.width, offscreen.height);
      const { width, height } = offscreen;
      const pixels = ctx.getImageData(0, 0, width, height).data;
      const visited = new Uint8Array(width * height);
      const slots: TemplateSlot[] = [];
      const isGreen = (x: number, y: number) => {
        const offset = (y * width + x) * 4;
        const r = pixels[offset];
        const g = pixels[offset + 1];
        const b = pixels[offset + 2];
        return g > 80 && g > r * 1.25 && g > b * 1.15;
      };
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const start = y * width + x;
          if (visited[start] || !isGreen(x, y)) continue;
          const queue = [[x, y]];
          visited[start] = 1;
          let minX = x; let maxX = x; let minY = y; let maxY = y; let area = 0;
          while (queue.length) {
            const [cx, cy] = queue.pop()!;
            area += 1;
            minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
            minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
            for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
              if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
              const index = ny * width + nx;
              if (!visited[index] && isGreen(nx, ny)) {
                visited[index] = 1;
                queue.push([nx, ny]);
              }
            }
          }
          if (area > width * height * 0.015) {
            slots.push({ x: minX / width, y: minY / height, w: (maxX - minX + 1) / width, h: (maxY - minY + 1) / height });
          }
        }
      }
      if (slots.length > 0) onChange({ slots: slots.sort((a, b) => a.y - b.y || a.x - b.x) });
    };
    image.src = template.frameDataUrl;
  };

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(260px,1fr)_220px]">
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/40 p-3">
        <canvas
          ref={canvasRef}
          className="mx-auto max-h-[52vh] w-auto max-w-full touch-none cursor-move rounded-lg"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
        />
        <p className="mt-2 text-center text-xs text-white/45">Drag slot untuk memindahkan. Drag sudut kanan bawah untuk resize.</p>
      </div>
      <div className="space-y-3">
        <div className="flex rounded-lg border border-white/10 p-1">
          <button onClick={() => setMode("slots")} className={`flex-1 px-2 py-1 text-xs ${mode === "slots" ? "bg-accent" : "text-white/50"}`}>Slot foto</button>
          <button onClick={() => setMode("guide")} className={`flex-1 px-2 py-1 text-xs ${mode === "guide" ? "bg-accent" : "text-white/50"}`}>Green guide</button>
        </div>
        <button onClick={detectGreenSlots} className="w-full border border-green-400/30 bg-green-400/10 px-3 py-2 text-xs text-green-100 hover:bg-green-400/20">
          Deteksi area hijau otomatis
        </button>
        <button onClick={removeGreenScreen} className="w-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-100 hover:bg-emerald-400/20">
          Hapus green screen dari template
        </button>
        <button onClick={addSlot} className="w-full border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-accent hover:bg-accent/20">
          + Tambah slot
        </button>
        <label className="block text-xs text-white/60">Slot aktif
          <select className="mt-1 w-full rounded border border-white/15 bg-black/30 px-2 py-2" value={selected} onChange={(e) => setSelected(Number(e.target.value))}>
            {template.slots.map((_, index) => <option key={index} value={index}>Foto {index + 1}</option>)}
          </select>
        </label>
        {selectedSlot && (
          <>
            <label className="block text-xs text-white/60">Rasio slot
              <select className="mt-1 w-full rounded border border-white/15 bg-black/30 px-2 py-2" value={selectedSlot.aspectRatio ?? "free"} onChange={(event) => setRatio(event.target.value === "free" ? null : Number(event.target.value))}>
                {SLOT_RATIOS.map((ratio) => <option key={ratio.label} value={ratio.value ?? "free"}>{ratio.label}</option>)}
              </select>
            </label>
            <p className="rounded-lg border border-accent/20 bg-accent/10 p-2 text-[11px] text-accent/80">Ukuran dan posisi diatur langsung pada preview agar nyaman seperti editor shape.</p>
            <button type="button" onClick={deleteSelectedSlot} disabled={template.slots.length <= 1} className="w-full rounded border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-200 hover:bg-red-400/20 disabled:cursor-not-allowed disabled:opacity-40">
              Hapus slot foto
            </button>
            {template.slots.length <= 1 && <p className="text-[10px] text-white/35">Minimal satu slot harus tersisa.</p>}
          </>
        )}
        {mode === "guide" && (
          <p className="rounded-lg border border-green-400/20 bg-green-400/10 p-3 text-xs text-green-100">
            Gunakan area hijau sebagai panduan lubang foto pada frame. Atur posisi dan ukuran slot sampai menutup area kosong desain.
          </p>
        )}
      </div>
    </div>
  );
}
