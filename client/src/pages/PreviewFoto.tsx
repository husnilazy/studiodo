import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useKioskSession } from "@/lib/sessionStore";
import { renderTemplate } from "@/lib/output";
import { useTemplateLibrary } from "@/lib/templateStore";
import { useStickerLibrary } from "@/lib/stickerStore";
import type { PhotoSticker, CameraFilter } from "@/lib/sessionStore";
import { FILTER_LABELS, FILTER_CSS } from "@/lib/sessionStore";

export default function PreviewFoto() {
  const [, navigate] = useLocation();
  const { photoUrls, selectedTemplateId, selectedTemplateData, filter, setFilter, colorCorrection, setColorCorrection, photoStickers, setPhotoStickers, templatePhotoMap, setTemplatePhotoMap, setCurrentSlot, incrementRetake, retakeCounts } = useKioskSession();
  const storedTemplate = useTemplateLibrary((state) => state.templates.find((item) => item.id === selectedTemplateId));
  const template = selectedTemplateData ?? storedTemplate;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedPhoto, setSelectedPhoto] = useState(0);
  const stickers = useStickerLibrary((state) => state.stickers);
  const [editing, setEditing] = useState(false);
  const [draggingSticker, setDraggingSticker] = useState<string | null>(null);
  const [draggedPhoto, setDraggedPhoto] = useState<number | null>(null);

  useEffect(() => {
    if (!template || !canvasRef.current || photoUrls.length === 0) return;
    renderTemplate(photoUrls, template, canvasRef.current, [], {}, filter, templatePhotoMap, colorCorrection).catch((error) => console.error("Preview template gagal", error));
  }, [photoUrls, template, filter, templatePhotoMap, colorCorrection]);

  const updateSticker = (sticker: PhotoSticker) =>
    setPhotoStickers(photoStickers.map((item) => item.stickerId === sticker.stickerId ? sticker : item));

  const addSticker = (stickerId: string) =>
    setPhotoStickers([...photoStickers, { stickerId, x: 0.5, y: 0.5, scale: 1 }]);

  const moveSticker = (event: React.PointerEvent<HTMLDivElement>, sticker: PhotoSticker) => {
    if (draggingSticker !== sticker.stickerId) return;
    const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!bounds) return;
    updateSticker({ ...sticker, x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) });
  };

  const redo = (slot: number) => {
    if (!incrementRetake(slot)) return;
    setCurrentSlot(slot);
    navigate("/sesi-foto");
  };

  return (
    <div className="kinetic-page h-full overflow-y-auto px-4 py-6 sm:px-8 lg:px-12">
      <header className="sticky top-0 z-20 mx-auto flex w-full max-w-7xl items-end justify-between gap-4 bg-[var(--kiosk-background)]/95 py-3 backdrop-blur-xl">
        <div>
          <span className="eyebrow">04 / YOUR CAPTURE GALLERY</span>
          <h2 className="mt-2 font-display text-4xl font-bold sm:text-6xl">Momenmu, siap diedit.</h2>
          <p className="mt-2 text-white/50">Pilih foto untuk retake atau gunakan sebagai bagian dari frame.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden rounded-full border border-accent/30 bg-accent/10 px-4 py-2 text-sm text-accent sm:block">{photoUrls.length} foto</span>
          <button onClick={() => navigate("/hasil")} className="rounded-xl bg-accent px-4 py-3 text-sm font-semibold shadow-lg shadow-accent/20 sm:px-6">Lanjut ke hasil →</button>
        </div>
      </header>

      <div className="mx-auto mt-8 grid max-w-7xl gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="glass-panel rounded-[2rem] p-5 sm:p-7">
          <div className="mb-5 flex items-center justify-between">
            <div><span className="eyebrow">CAPTURED</span><h3 className="font-display text-2xl font-semibold">Galeri jepretan</h3></div>
            <button onClick={() => redo(selectedPhoto)} disabled={(retakeCounts[selectedPhoto] ?? 0) >= 3} className="rounded-xl border border-white/15 px-3 py-2 text-xs text-white/70 hover:border-accent hover:text-white disabled:opacity-40">Ulangi foto</button>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {photoUrls.map((url, index) => (
              <button key={`${url}-${index}`} draggable onDragStart={() => setDraggedPhoto(index)} onDragEnd={() => setDraggedPhoto(null)} onClick={() => setSelectedPhoto(index)} className={`group relative aspect-[3/4] overflow-hidden rounded-2xl border-2 bg-black/30 text-left transition hover:-translate-y-1 ${selectedPhoto === index ? "border-accent shadow-xl shadow-accent/20" : "border-white/10 hover:border-white/30"}`}>
                <img src={url} alt={`Hasil foto ${index + 1}`} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" style={{ filter: `${FILTER_CSS[filter]} brightness(${colorCorrection.brightness}%) contrast(${colorCorrection.contrast}%) saturate(${colorCorrection.saturation}%)` }} />
                <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-1 text-xs font-semibold">{String(index + 1).padStart(2, "0")}</span>
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-8 text-xs text-white/80">Klik untuk pilih</span>
              </button>
            ))}
          </div>
        </section>

        <aside className="space-y-5">
          {template && (
            <div className="glass-panel rounded-[2rem] p-5">
              <div className="mb-3"><span className="eyebrow">LIVE COMPOSITION</span><h3 className="font-display text-2xl font-semibold">{template.name}</h3></div>
              <div className="relative flex justify-center rounded-2xl bg-black/30 p-3">
                <canvas ref={canvasRef} className="max-h-[52vh] max-w-full rounded-xl object-contain" />
                {editing && photoStickers.map((sticker) => {
                  const asset = stickers.find((item) => item.id === sticker.stickerId);
                  if (!asset) return null;
                  return <div key={sticker.stickerId} className="absolute h-12 w-12 touch-none cursor-move" style={{ left: `${sticker.x * 100}%`, top: `${sticker.y * 100}%`, transform: "translate(-50%, -50%)" }} onPointerDown={() => setDraggingSticker(sticker.stickerId)} onPointerMove={(event) => moveSticker(event, sticker)} onPointerUp={() => setDraggingSticker(null)}><img src={asset.dataUrl} className="h-full w-full object-contain" /></div>;
                })}
              </div>
            </div>
          )}

          {template && (
            <div className="glass-panel rounded-[2rem] p-5">
              <div className="mb-4"><span className="eyebrow">FRAME MAPPING</span><h3 className="font-display text-xl font-semibold">Atur foto dalam slot</h3></div>
              <p className="mb-3 text-xs text-white/45">Seret foto dari galeri ke slot frame.</p>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                {template.slots.map((_, slotIndex) => (
                  <div key={slotIndex} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggedPhoto === null) return; setTemplatePhotoMap({ ...templatePhotoMap, [slotIndex]: draggedPhoto }); setDraggedPhoto(null); }} className="flex items-center gap-3 rounded-xl border border-dashed border-white/20 bg-white/[0.04] p-2 transition hover:border-accent hover:bg-accent/10">
                    <span className="text-xs uppercase tracking-wider text-white/40">Slot {slotIndex + 1}</span>
                    {(() => { const photoIndex = templatePhotoMap[slotIndex] ?? Math.min(slotIndex, photoUrls.length - 1); return photoUrls[photoIndex] ? <img src={photoUrls[photoIndex]} alt={`Slot ${slotIndex + 1}`} className="h-12 w-10 rounded-lg object-cover" /> : null; })()}
                    <span className="text-xs text-white/45">Lepaskan foto di sini</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      <div className="mx-auto mt-6 flex max-w-7xl flex-wrap items-center justify-center gap-2 rounded-[2rem] border border-white/10 bg-black/20 p-4">
        {photoUrls.map((url, index) => (
          <button key={`${url}-mini`} onClick={() => setSelectedPhoto(index)} className={`h-16 w-12 overflow-hidden rounded-lg border-2 ${selectedPhoto === index ? "border-accent" : "border-white/15"}`}>
            <img src={url} className="h-full w-full object-cover" style={{ filter: FILTER_CSS[filter] }} />
          </button>
        ))}
        <div
          className="flex max-w-3xl flex-wrap justify-center gap-2 rounded-2xl border border-accent/30 bg-accent/5 p-3"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            const droppedFilter = event.dataTransfer.getData("filter") as CameraFilter;
            if (droppedFilter) setFilter(droppedFilter);
          }}
        >
          {(Object.keys(FILTER_LABELS) as CameraFilter[]).map((key) => (
            <button
              key={key}
              draggable
              onDragStart={(event) => event.dataTransfer.setData("filter", key)}
              onClick={() => setFilter(key)}
              className={`group w-20 rounded-xl border p-1.5 transition hover:-translate-y-1 ${filter === key ? "border-accent bg-accent/15 shadow-lg shadow-accent/20" : "border-white/10 bg-white/5 hover:border-white/30"}`}
            >
              <img src={photoUrls[selectedPhoto]} className="h-12 w-full rounded-lg object-cover" style={{ filter: FILTER_CSS[key] }} />
              <span className="mt-1 block text-[10px]">{FILTER_LABELS[key]}</span>
            </button>
          ))}
        </div>
        <section className="mx-auto mt-4 grid max-w-7xl gap-3 rounded-[2rem] border border-white/10 bg-black/20 p-4 sm:grid-cols-3">
          {(["brightness", "contrast", "saturation"] as const).map((key) => <label key={key} className="text-xs uppercase tracking-wider text-white/50">{key}<input type="range" min={50} max={150} value={colorCorrection[key]} onChange={(event) => setColorCorrection({ ...colorCorrection, [key]: Number(event.target.value) })} className="mt-2 w-full accent-[var(--accent)]" /></label>)}
        </section>
        {template && stickers.length > 0 && (
          <button onClick={() => setEditing((value) => !value)} className="rounded-lg border border-white/15 px-3 py-2 text-sm">
            {editing ? "Tutup stiker" : "Tambah stiker"}
          </button>
        )}
      </div>
      {editing && (
        <div className="flex max-w-2xl flex-wrap justify-center gap-3 rounded-xl border border-white/10 bg-black/30 p-3">
          {stickers.map((sticker) => (
            <button key={sticker.id} onClick={() => addSticker(sticker.id)} className="h-14 w-14 rounded-lg border border-white/15 bg-white/5 p-2 hover:border-accent">
              <img src={sticker.dataUrl} className="h-full w-full object-contain" />
            </button>
          ))}
        </div>
      )}

    </div>
  );
}
