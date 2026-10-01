import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useKioskSession } from "@/lib/sessionStore";
import { drawStickers, renderTemplate } from "@/lib/output";
import { renderPhotoStrip } from "@/lib/stripRenderer";
import { useTemplateLibrary, type LocalTemplate } from "@/lib/templateStore";
import { useStickerLibrary } from "@/lib/stickerStore";
import { BUILTIN_CATEGORIES, buildStickerAssets, resolveStickerDataUrl } from "@/lib/builtinStickers";
import { api } from "@/lib/api";
import type { PhotoSticker, CameraFilter } from "@/lib/sessionStore";
import { FILTER_LABELS, FILTER_CSS, composeFilterCss } from "@/lib/sessionStore";
import { useBoothConfig } from "@/lib/boothConfigStore";
import { getNextRoute } from "@/lib/kioskFlow";
import { ScreenLayoutBoundary } from "@/lib/screenBuilder/ScreenLayoutBoundary";
import Positionable from "@/components/Positionable";
import ZoomableImageModal from "@/components/ZoomableImageModal";
import StepProgress from "@/components/kiosk/StepProgress";
import { Icon } from "@/components/kiosk/Icons";
import { Spinner } from "@/components/kiosk/KioskUI";

type Tab = "stiker" | "filter" | "warna" | "susunan" | "frame";
const MAX_STICKERS = 30;
const STICKER_BASE = 0.16; // fraction of the canvas short side at scale 1 — must match drawStickers() in lib/output.ts
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Interactive overlay that sits exactly on top of the composite canvas. */
function StickerLayer({
  box, stickers, assets, selectedId, onSelect, onGestureStart, onChange, onRemove,
}: {
  box: { width: number; height: number };
  stickers: PhotoSticker[];
  assets: Record<string, string>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onGestureStart: () => void;
  onChange: (sticker: PhotoSticker) => void;
  onRemove: (id: string) => void;
}) {
  const gesture = useRef<null | { kind: "move"; id: string; dx: number; dy: number } | { kind: "handle"; id: string }>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const shortSide = Math.min(box.width, box.height);

  const point = (event: React.PointerEvent) => {
    const rect = layerRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onMove = (event: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const sticker = stickers.find((s) => s.id === g.id);
    if (!sticker) return;
    const p = point(event);
    if (g.kind === "move") {
      onChange({ ...sticker, x: clamp((p.x - g.dx) / box.width, 0.02, 0.98), y: clamp((p.y - g.dy) / box.height, 0.02, 0.98) });
    } else {
      // The corner handle resizes AND rotates in one drag (distance from the centre = size, angle = rotation),
      // the same gesture every sticker editor uses — and it works with a single finger, which is all a kiosk gets.
      const cx = sticker.x * box.width;
      const cy = sticker.y * box.height;
      const dist = Math.hypot(p.x - cx, p.y - cy);
      const halfDiagonal = (shortSide * STICKER_BASE * Math.SQRT2) / 2;
      const angle = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI - 45; // the handle sits at the bottom-right corner (45°)
      onChange({ ...sticker, scale: clamp(dist / halfDiagonal, 0.35, 4), rotation: Math.round(angle / 5) * 5 });
    }
  };

  return (
    <div ref={layerRef} className="absolute inset-0 touch-none" onPointerDown={() => onSelect(null)} onPointerMove={onMove} onPointerUp={() => { gesture.current = null; }} onPointerCancel={() => { gesture.current = null; }}>
      {stickers.map((sticker) => {
        const src = assets[sticker.stickerId];
        if (!src) return null;
        const size = shortSide * STICKER_BASE * sticker.scale;
        const selected = selectedId === sticker.id;
        return (
          <div
            key={sticker.id}
            className="absolute"
            style={{ left: sticker.x * box.width, top: sticker.y * box.height, width: size, height: size, transform: `translate(-50%, -50%) rotate(${sticker.rotation ?? 0}deg)`, zIndex: selected ? 20 : 10, minWidth: 44, minHeight: 44 }}
            onPointerDown={(event) => {
              event.stopPropagation();
              onSelect(sticker.id);
              onGestureStart();
              const p = point(event);
              gesture.current = { kind: "move", id: sticker.id, dx: p.x - sticker.x * box.width, dy: p.y - sticker.y * box.height };
              layerRef.current?.setPointerCapture(event.pointerId);
            }}
          >
            <img src={src} alt="" draggable={false} className={`pointer-events-none h-full w-full select-none object-contain ${selected ? "drop-shadow-[0_0_0_var(--accent)]" : ""}`} style={{ transform: sticker.flip ? "scaleX(-1)" : undefined }} />
            {selected && (
              <>
                <span className="pointer-events-none absolute -inset-1.5 rounded-xl border-2 border-dashed border-accent" />
                <button type="button" aria-label="Hapus stiker" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onRemove(sticker.id); }} className="absolute -left-4 -top-4 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-red-500 text-white shadow-lg" style={{ transform: `rotate(${-(sticker.rotation ?? 0)}deg)` }}>
                  <Icon name="x" className="h-4 w-4" strokeWidth={3} />
                </button>
                <span
                  role="slider"
                  aria-label="Ubah ukuran dan putar"
                  onPointerDown={(event) => { event.stopPropagation(); onGestureStart(); gesture.current = { kind: "handle", id: sticker.id }; layerRef.current?.setPointerCapture(event.pointerId); }}
                  className="absolute -bottom-4 -right-4 flex h-9 w-9 cursor-nwse-resize items-center justify-center rounded-full border-2 border-white bg-accent text-on-accent shadow-lg"
                  style={{ transform: `rotate(${-(sticker.rotation ?? 0)}deg)` }}
                >
                  <Icon name="rotate" className="h-4 w-4" />
                </span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ToolButton({ icon, label, onClick, disabled, danger }: { icon: string; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} className={`flex min-w-[3rem] shrink-0 flex-col items-center gap-0.5 whitespace-nowrap rounded-xl border border-fg/10 bg-fg/5 px-2 py-1.5 text-[0.6rem] font-semibold transition hover:bg-fg/10 disabled:opacity-35 ${danger ? "text-red-500" : "text-fg/80"}`}>
      <Icon name={icon} className="h-4 w-4" />
      {label}
    </button>
  );
}

export default function PreviewFoto() {
  const [, navigate] = useLocation();
  const {
    photoUrls, orientation, selectedTemplateId, selectedTemplateData, setSelectedTemplateId, setSelectedTemplateData, filter, setFilter,
    colorCorrection, setColorCorrection, photoStickers, setPhotoStickers, templatePhotoMap, setTemplatePhotoMap, setCurrentSlot, incrementRetake, retakeCounts,
    outputMirrored, setOutputMirrored, outputPreset,
  } = useKioskSession();
  const config = useBoothConfig((s) => s.config);
  const features = config.features;
  const storedTemplate = useTemplateLibrary((state) => state.templates.find((item) => item.id === selectedTemplateId));
  const template = selectedTemplateData ?? storedTemplate ?? null;
  const library = useStickerLibrary((s) => s.stickers);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number } | null>(null);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const [rendering, setRendering] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState(0);
  const [serverTemplates, setServerTemplates] = useState<LocalTemplate[]>([]);
  const [zoomSnapshot, setZoomSnapshot] = useState<string | null>(null);

  // Which tabs exist follows the tenant's feature switches (these toggles used to do nothing on this screen).
  const tabs = useMemo(() => {
    const list: { key: Tab; label: string; icon: string }[] = [];
    if (features.stickers) list.push({ key: "stiker", label: "Stiker", icon: "smile" });
    if (features.filters) list.push({ key: "filter", label: "Filter", icon: "palette" });
    if (features.advancedPhotoEditor) list.push({ key: "warna", label: "Warna", icon: "sliders" });
    if (template) list.push({ key: "susunan", label: "Susunan", icon: "layers" });
    if (features.frameChoice && template) list.push({ key: "frame", label: "Frame", icon: "frame" });
    return list;
  }, [features.stickers, features.filters, features.advancedPhotoEditor, features.frameChoice, template]);
  const [tab, setTab] = useState<Tab>(features.stickers ? "stiker" : "filter");
  const activeTab = tabs.some((t) => t.key === tab) ? tab : tabs[0]?.key;

  // ---- stickers -------------------------------------------------------------------------------------------
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  const [categoryKey, setCategoryKey] = useState(BUILTIN_CATEGORIES[0].key);
  const history = useRef<PhotoSticker[][]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const assets = useMemo(() => buildStickerAssets(photoStickers, library), [photoStickers, library]);
  const selectedSticker = photoStickers.find((s) => s.id === selectedStickerId) ?? null;

  const pushHistory = useCallback(() => {
    history.current = [...history.current.slice(-29), useKioskSession.getState().photoStickers];
    setCanUndo(true);
  }, []);
  const commit = (next: PhotoSticker[]) => { pushHistory(); setPhotoStickers(next); };
  const undo = () => {
    const prev = history.current.pop();
    if (!prev) return;
    setPhotoStickers(prev);
    setCanUndo(history.current.length > 0);
    setSelectedStickerId(null);
  };
  const patchSelected = (patch: Partial<PhotoSticker>) => { if (selectedSticker) commit(photoStickers.map((s) => (s.id === selectedSticker.id ? { ...s, ...patch } : s))); };

  const addSticker = (stickerId: string) => {
    if (photoStickers.length >= MAX_STICKERS) return;
    // Spread new stickers around the middle instead of stacking them on one spot.
    const n = photoStickers.length;
    const id = crypto.randomUUID();
    const next: PhotoSticker = { id, stickerId, x: clamp(0.5 + ((n % 4) - 1.5) * 0.12, 0.15, 0.85), y: clamp(0.42 + (Math.floor(n / 4) % 3) * 0.1, 0.15, 0.85), scale: 1.3, rotation: 0 };
    commit([...photoStickers, next]);
    setSelectedStickerId(id);
  };
  const removeSticker = (id: string) => { commit(photoStickers.filter((s) => s.id !== id)); setSelectedStickerId(null); };
  const duplicateSelected = () => {
    if (!selectedSticker || photoStickers.length >= MAX_STICKERS) return;
    const id = crypto.randomUUID();
    commit([...photoStickers, { ...selectedSticker, id, x: clamp(selectedSticker.x + 0.07, 0.02, 0.98), y: clamp(selectedSticker.y + 0.07, 0.02, 0.98) }]);
    setSelectedStickerId(id);
  };
  const bringToFront = () => { if (selectedSticker) commit([...photoStickers.filter((s) => s.id !== selectedSticker.id), selectedSticker]); };
  const clearStickers = () => { if (photoStickers.length > 0) { commit([]); setSelectedStickerId(null); } };

  const categories = useMemo(() => (library.length > 0 ? [...BUILTIN_CATEGORIES, { key: "milikmu", label: "Milik booth", items: library.map((s) => s.id) }] : BUILTIN_CATEGORIES), [library]);
  const category = categories.find((c) => c.key === categoryKey) ?? categories[0];

  // ---- frames / templates ---------------------------------------------------------------------------------
  useEffect(() => {
    api.getFrames(orientation)
      .then((frames) => setServerTemplates((frames ?? []).filter((frame) => frame.kind === "template").map((frame) => ({
        id: frame.id, name: frame.name, orientation, outputPreset: "4r" as const, canvasWidth: frame.canvasWidth ?? 1200, canvasHeight: frame.canvasHeight ?? 1800,
        frameDataUrl: frame.imageUrl, slots: frame.slots ?? [], category: "custom" as const, style: "Server template",
      }))))
      .catch(() => setServerTemplates([]));
  }, [orientation]);

  const availableTemplates: LocalTemplate[] = useMemo(() => [...serverTemplates, ...useTemplateLibrary.getState().templates.filter((item) => item.orientation === orientation)], [serverTemplates, orientation]);

  const selectTemplate = (id: string) => {
    const next = availableTemplates.find((item) => item.id === id);
    if (!next) return;
    setSelectedTemplateId(next.id);
    setSelectedTemplateData(next);
    setTemplatePhotoMap({});
  };

  // ---- composite rendering (WITHOUT stickers — the overlay draws them live, drawStickers() bakes them in for export) ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || photoUrls.length === 0) return;
    let cancelled = false;
    setRendering(true);
    (async () => {
      if (template) await renderTemplate(photoUrls, template, canvas, [], {}, filter, templatePhotoMap, colorCorrection, outputMirrored);
      else await renderPhotoStrip(photoUrls, canvas, { accentColor: config.accentColor, stripLayout: config.stripLayout, stripTemplate: config.stripTemplate, outputPreset, filter, mirror: outputMirrored });
      if (!cancelled) { setCanvasSize({ w: canvas.width, h: canvas.height }); setRendering(false); }
    })().catch((error) => { console.error("Preview gagal dirender", error); if (!cancelled) setRendering(false); });
    return () => { cancelled = true; };
  }, [photoUrls, template, filter, templatePhotoMap, colorCorrection, outputMirrored, config.accentColor, config.stripLayout, config.stripTemplate, outputPreset]);

  // Fit the canvas (and the sticker layer on top of it) into the preview area at its exact aspect ratio, so a
  // sticker dropped "in the corner" is in the corner of the real output.
  useEffect(() => {
    const container = previewBoxRef.current;
    if (!container || !canvasSize) return;
    const ratio = canvasSize.w / canvasSize.h;
    const compute = () => {
      const { width: cw, height: ch } = container.getBoundingClientRect();
      if (!cw || !ch) return;
      let width = cw;
      let height = width / ratio;
      if (height > ch) { height = ch; width = height * ratio; }
      setBox((prev) => (prev && Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5 ? prev : { width, height }));
    };
    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(container);
    return () => observer.disconnect();
  }, [canvasSize]);

  const openZoom = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const copy = document.createElement("canvas");
    copy.width = canvas.width;
    copy.height = canvas.height;
    copy.getContext("2d")!.drawImage(canvas, 0, 0);
    await drawStickers(copy, photoStickers, assets);
    setZoomSnapshot(copy.toDataURL("image/png"));
  };

  const redo = (slot: number) => {
    if (!features.retake || !incrementRetake(slot)) return;
    setCurrentSlot(slot);
    navigate("/sesi-foto");
  };

  const goNext = () => navigate(getNextRoute("preview", config.kioskFlow));

  const retakesLeft = 3 - (retakeCounts[selectedPhoto] ?? 0);
  const filterCss = composeFilterCss(filter, colorCorrection);

  return (
    <ScreenLayoutBoundary screenKey="preview">
      <div className="kinetic-page relative flex h-full min-h-0 w-full flex-col">
        <StepProgress current="preview" />

        <header className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-[4.5rem] md:px-8">
          <Positionable id="heading" type="text" label="Judul">
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">{config.previewHeadline || "Percantik fotomu"}</h1>
              <p className="mt-0.5 hidden text-sm text-muted sm:block">Tambahkan stiker atau filter, lalu lanjut. Hasilnya langsung terlihat.</p>
            </div>
          </Positionable>
          <Positionable id="next-button" type="system-button" label="Tombol Lanjut">
            <button type="button" onClick={goNext} className="k-btn k-btn-accent shrink-0">
              Selesai &amp; lanjut
              <Icon name="arrow-right" className="h-5 w-5" />
            </button>
          </Positionable>
        </header>

        <div className="mx-auto grid min-h-0 w-full max-w-[1500px] flex-1 grid-rows-[minmax(0,1.3fr)_minmax(0,1fr)] gap-3 px-4 pb-4 md:px-8 landscape:lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] landscape:lg:grid-rows-1">
          {/* ---------------- canvas ---------------- */}
          <section className="glass-panel relative flex min-h-0 min-w-0 flex-col rounded-[2rem] p-3 md:p-4">
            <div ref={previewBoxRef} className="relative flex min-h-0 flex-1 items-center justify-center rounded-2xl bg-fg/[0.04]" onPointerDown={() => setSelectedStickerId(null)}>
              {rendering && !canvasSize && <Spinner className="h-9 w-9" />}
              <div className="relative shadow-2xl" style={{ width: box?.width, height: box?.height, visibility: box ? "visible" : "hidden" }}>
                <canvas ref={canvasRef} className="h-full w-full rounded-lg bg-white" />
                {rendering && canvasSize && <div className="absolute right-2 top-2 rounded-full bg-black/50 p-1.5"><Spinner className="h-4 w-4 !border-white/30 !border-t-white" /></div>}
                {box && features.stickers && (
                  <StickerLayer
                    box={box}
                    stickers={photoStickers}
                    assets={assets}
                    selectedId={selectedStickerId}
                    onSelect={setSelectedStickerId}
                    onGestureStart={pushHistory}
                    onChange={(sticker) => setPhotoStickers(useKioskSession.getState().photoStickers.map((s) => (s.id === sticker.id ? sticker : s)))}
                    onRemove={removeSticker}
                  />
                )}
              </div>
              <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={openZoom} aria-label="Perbesar preview" className="k-btn absolute right-2 top-2 !min-h-0 !rounded-full !p-2.5">
                <Icon name="zoom" className="h-5 w-5" />
              </button>
            </div>

            {/* Photo strip: pick the photo that Filter / Susunan / Ulangi act on */}
            <div className="mt-2 flex shrink-0 flex-col gap-2">
              <div className="flex min-w-0 gap-2 overflow-x-auto py-0.5">
                {photoUrls.map((url, index) => (
                  <button key={`${url}-${index}`} type="button" onClick={() => setSelectedPhoto(index)} aria-pressed={selectedPhoto === index} className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border-2 transition md:h-14 md:w-14 ${selectedPhoto === index ? "border-accent shadow-md" : "border-transparent opacity-80 hover:opacity-100"}`}>
                    <img src={url} alt={`Foto ${index + 1}`} className="h-full w-full object-cover" style={{ filter: filterCss, transform: outputMirrored ? "scaleX(-1)" : undefined }} />
                    <span className="absolute left-1 top-1 rounded-full bg-black/60 px-1.5 text-[0.6rem] font-bold text-white">{index + 1}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex shrink-0 items-center gap-2" title="Cermin = sama seperti yang kamu lihat di layar saat berfoto">
                  <span className="hidden text-xs font-semibold text-muted sm:inline">Hasil:</span>
                  <div className="inline-flex rounded-full border border-fg/10 bg-canvas/60 p-1 text-xs font-semibold">
                    <button type="button" onClick={() => setOutputMirrored(true)} aria-pressed={outputMirrored} className={`rounded-full px-3.5 py-1.5 ${outputMirrored ? "bg-accent text-on-accent" : "text-muted"}`}>Cermin</button>
                    <button type="button" onClick={() => setOutputMirrored(false)} aria-pressed={!outputMirrored} className={`rounded-full px-3.5 py-1.5 ${!outputMirrored ? "bg-accent text-on-accent" : "text-muted"}`}>Asli</button>
                  </div>
                </div>
                {features.retake && (
                  <button type="button" onClick={() => redo(selectedPhoto)} disabled={retakesLeft <= 0} className="k-btn shrink-0 !min-h-0 !px-4 !py-2.5 !text-sm">
                    <Icon name="refresh" className="h-4 w-4" />
                    Ulangi foto {selectedPhoto + 1}
                    <span className="text-xs text-muted">({Math.max(0, retakesLeft)}x lagi)</span>
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* ---------------- tools ---------------- */}
          <section className="glass-panel flex min-h-0 min-w-0 flex-col rounded-[2rem] p-3 md:p-4">
            <div role="tablist" className="flex shrink-0 gap-1.5 overflow-x-auto pb-2">
              {tabs.map((t) => (
                <button key={t.key} role="tab" aria-selected={activeTab === t.key} type="button" onClick={() => setTab(t.key)} className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition ${activeTab === t.key ? "bg-fg text-canvas shadow-md" : "bg-fg/5 text-muted hover:bg-fg/10"}`}>
                  <Icon name={t.icon} className="h-4 w-4" />
                  {t.label}
                  {t.key === "stiker" && photoStickers.length > 0 && <span className="rounded-full bg-accent px-1.5 text-[0.65rem] text-on-accent">{photoStickers.length}</span>}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {tabs.length === 0 && <p className="p-6 text-center text-muted">Tidak ada alat edit yang aktif. Tekan “Selesai &amp; lanjut”.</p>}

              {/* ---- Stiker ---- */}
              {activeTab === "stiker" && (
                <div className="flex flex-col gap-3">
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {categories.map((c) => (
                      <button key={c.key} type="button" onClick={() => setCategoryKey(c.key)} className={`k-chip shrink-0 !px-4 !py-2 !text-sm ${category.key === c.key ? "!border-transparent !bg-accent/15 !text-accent" : ""}`}>{c.label}</button>
                    ))}
                  </div>
                  <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(4.25rem, 1fr))" }}>
                    {category.items.map((id) => {
                      const src = resolveStickerDataUrl(id, library);
                      if (!src) return null;
                      return (
                        <motion.button key={id} type="button" whileTap={{ scale: 0.88 }} onClick={() => addSticker(id)} className="flex aspect-square items-center justify-center rounded-2xl border border-fg/10 bg-fg/5 p-1.5 transition hover:border-accent/60 hover:bg-accent/10">
                          <img src={src} alt="" draggable={false} className="h-full w-full object-contain" />
                        </motion.button>
                      );
                    })}
                  </div>
                  {photoStickers.length >= MAX_STICKERS && <p className="text-xs font-semibold text-amber-600">Maksimal {MAX_STICKERS} stiker per foto.</p>}
                </div>
              )}

              {/* ---- Filter ---- */}
              {activeTab === "filter" && (
                <div className="flex flex-col gap-4">
                  <p className="text-xs text-muted">Filter berlaku untuk semua foto.</p>
                  <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(5rem, 1fr))" }}>
                    {(Object.keys(FILTER_LABELS) as CameraFilter[]).map((key) => (
                      <button key={key} type="button" onClick={() => setFilter(key)} aria-pressed={filter === key} className={`rounded-2xl border p-1.5 text-center transition ${filter === key ? "border-accent bg-accent/10 shadow-md" : "border-fg/10 bg-fg/5 hover:border-fg/30"}`}>
                        <img src={photoUrls[selectedPhoto]} alt="" className="aspect-square w-full rounded-xl object-cover" style={{ filter: FILTER_CSS[key] }} />
                        <span className="mt-1 block text-xs font-semibold">{FILTER_LABELS[key]}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-2xl bg-fg/5 p-3">
                    <div>
                      <p className="text-sm font-semibold">Arah hasil</p>
                      <p className="text-xs text-muted">Cermin = sama seperti yang kamu lihat di layar saat berfoto.</p>
                    </div>
                    <div className="inline-flex shrink-0 rounded-full border border-fg/10 bg-canvas/60 p-1 text-sm font-semibold">
                      <button type="button" onClick={() => setOutputMirrored(true)} className={`rounded-full px-4 py-1.5 ${outputMirrored ? "bg-accent text-on-accent" : "text-muted"}`}>Cermin</button>
                      <button type="button" onClick={() => setOutputMirrored(false)} className={`rounded-full px-4 py-1.5 ${!outputMirrored ? "bg-accent text-on-accent" : "text-muted"}`}>Asli</button>
                    </div>
                  </div>
                </div>
              )}

              {/* ---- Warna ---- */}
              {activeTab === "warna" && (
                <div className="flex flex-col gap-5 p-1">
                  {([["brightness", "Kecerahan"], ["contrast", "Kontras"], ["saturation", "Warna"]] as const).map(([key, label]) => (
                    <label key={key} className="block">
                      <span className="mb-2 flex justify-between text-sm font-semibold"><span>{label}</span><span className="text-muted">{colorCorrection[key]}%</span></span>
                      <input type="range" min={50} max={150} value={colorCorrection[key]} onChange={(e) => setColorCorrection({ ...colorCorrection, [key]: Number(e.target.value) })} className="h-3 w-full accent-[var(--accent)]" />
                    </label>
                  ))}
                  <button type="button" onClick={() => setColorCorrection({ brightness: 100, contrast: 100, saturation: 100 })} className="k-btn self-start !min-h-0 !py-2.5 !text-sm">
                    <Icon name="refresh" className="h-4 w-4" />
                    Kembalikan semula
                  </button>
                </div>
              )}

              {/* ---- Susunan (slots) ---- */}
              {activeTab === "susunan" && template && (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-muted">Mau menukar posisi foto? Pilih fotonya di bawah kanvas (kiri), lalu ketuk kotak nomor yang kamu inginkan.</p>
                  <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(5rem, 1fr))" }}>
                    {template.slots.map((_, slotIndex) => {
                      const photoIndex = templatePhotoMap[slotIndex] ?? Math.min(slotIndex, photoUrls.length - 1);
                      const photoForSlot = photoUrls[photoIndex];
                      return (
                        <button key={slotIndex} type="button" onClick={() => setTemplatePhotoMap({ ...templatePhotoMap, [slotIndex]: selectedPhoto })} className="rounded-2xl border border-dashed border-fg/25 bg-fg/5 p-1.5 text-center transition hover:border-accent hover:bg-accent/10">
                          <span className="block text-[0.7rem] font-bold text-muted">Kotak {slotIndex + 1}</span>
                          {photoForSlot ? <img src={photoForSlot} alt="" className="mt-1 aspect-square w-full rounded-xl object-cover" /> : <span className="mt-1 flex aspect-square items-center justify-center rounded-xl bg-fg/5 text-muted">–</span>}
                        </button>
                      );
                    })}
                  </div>
                  <button type="button" onClick={() => setTemplatePhotoMap({})} className="k-btn self-start !min-h-0 !py-2.5 !text-sm">Urutkan ulang otomatis</button>
                </div>
              )}

              {/* ---- Frame ---- */}
              {activeTab === "frame" && (
                <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(6rem, 1fr))" }}>
                  {availableTemplates.map((item) => (
                    <button key={item.id} type="button" onClick={() => selectTemplate(item.id)} aria-pressed={template?.id === item.id} className={`rounded-2xl border p-2 text-center transition ${template?.id === item.id ? "border-accent bg-accent/10 shadow-md" : "border-fg/10 bg-fg/5 hover:border-fg/30"}`}>
                      <div className="flex aspect-[2/3] items-center justify-center overflow-hidden rounded-lg bg-white">
                        <img src={item.frameDataUrl} alt="" className="h-full w-full object-contain" />
                      </div>
                      <span className="mt-1.5 block truncate text-xs font-semibold">{item.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Sticker action bar: one scrollable row. Shows the how-to until a sticker is selected. */}
            {features.stickers && activeTab === "stiker" && (
              <div className="mt-2 flex shrink-0 items-center gap-1.5 overflow-x-auto border-t border-fg/10 pt-2">
                {selectedSticker ? (
                  <>
                    <ToolButton icon="minus" label="Kecil" onClick={() => patchSelected({ scale: clamp(selectedSticker.scale / 1.2, 0.35, 4) })} />
                    <ToolButton icon="plus" label="Besar" onClick={() => patchSelected({ scale: clamp(selectedSticker.scale * 1.2, 0.35, 4) })} />
                    <ToolButton icon="undo" label="Putar ←" onClick={() => patchSelected({ rotation: ((selectedSticker.rotation ?? 0) - 15) % 360 })} />
                    <ToolButton icon="rotate" label="Putar →" onClick={() => patchSelected({ rotation: ((selectedSticker.rotation ?? 0) + 15) % 360 })} />
                    <ToolButton icon="mirror" label="Balik" onClick={() => patchSelected({ flip: !selectedSticker.flip })} />
                    <ToolButton icon="copy" label="Gandakan" onClick={duplicateSelected} disabled={photoStickers.length >= MAX_STICKERS} />
                    <ToolButton icon="layers" label="Ke depan" onClick={bringToFront} />
                    <ToolButton icon="trash" label="Hapus" onClick={() => removeSticker(selectedSticker.id)} danger />
                  </>
                ) : (
                  <p className="min-w-0 flex-1 text-xs leading-snug text-muted">{photoStickers.length > 0 ? "Ketuk stiker di foto untuk mengubahnya: geser, atau tarik bulatan biru untuk memperbesar & memutar." : "Ketuk stiker di atas untuk menaruhnya di foto, lalu geser sesukamu."}</p>
                )}
                <div className="ml-auto flex shrink-0 gap-1.5 pl-1.5">
                  <ToolButton icon="undo" label="Urungkan" onClick={undo} disabled={!canUndo} />
                  <ToolButton icon="trash" label="Hapus semua" onClick={clearStickers} disabled={photoStickers.length === 0} danger />
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
      {zoomSnapshot && <ZoomableImageModal src={zoomSnapshot} alt={template?.name ?? "Preview"} onClose={() => setZoomSnapshot(null)} />}
    </ScreenLayoutBoundary>
  );
}
