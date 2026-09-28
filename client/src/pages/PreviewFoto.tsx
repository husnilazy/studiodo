import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useKioskSession } from "@/lib/sessionStore";
import { renderTemplate } from "@/lib/output";
import { useTemplateLibrary } from "@/lib/templateStore";
import { useStickerLibrary } from "@/lib/stickerStore";
import { api } from "@/lib/api";
import type { PhotoSticker, CameraFilter } from "@/lib/sessionStore";
import { FILTER_LABELS, FILTER_CSS, composeFilterCss } from "@/lib/sessionStore";
import { useBoothConfig } from "@/lib/boothConfigStore";
import { getNextRoute } from "@/lib/kioskFlow";
import { ScreenLayoutBoundary } from "@/lib/screenBuilder/ScreenLayoutBoundary";
import Positionable from "@/components/Positionable";
import ZoomableImageModal from "@/components/ZoomableImageModal";

type IconProps = { className?: string };
const IconGallery = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="8.5" cy="9.5" r="1.5" /><path strokeLinecap="round" strokeLinejoin="round" d="m4 17 4.5-4.5a1.8 1.8 0 0 1 2.5 0L15 16.5M14 13.5l1.6-1.6a1.8 1.8 0 0 1 2.5 0L21 14.5" /></svg>
);
const IconFrame = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><rect x="4" y="3" width="16" height="18" rx="2.5" /><path strokeLinecap="round" d="M4 9h16M9 3v6" /></svg>
);
const IconRefresh = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 12a8 8 0 0 1 13.66-5.66L20 8.5M20 12a8 8 0 0 1-13.66 5.66L4 15.5M20 4v4.5h-4.5M4 20v-4.5h4.5" /></svg>
);
const IconFilter = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16M7 12h10M10 19h4" /></svg>
);
const IconSliders = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" d="M5 6h14M5 12h14M5 18h14" /><circle cx="9" cy="6" r="1.8" fill="currentColor" stroke="none" /><circle cx="16" cy="12" r="1.8" fill="currentColor" stroke="none" /><circle cx="10" cy="18" r="1.8" fill="currentColor" stroke="none" /></svg>
);
const IconSticker = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3a9 9 0 1 0 9 9c0-.5-.03-1-.1-1.5H15a3.5 3.5 0 0 1-3.5-3.5V3.1c-.5-.07-1-.1-1.5-.1Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M14.5 3.5c.4 2.6 2.4 4.6 5 5" /></svg>
);
const IconZoomIn = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><circle cx="10.5" cy="10.5" r="6.5" /><path strokeLinecap="round" d="M10.5 8v5M8 10.5h5M20 20l-4.3-4.3" /></svg>
);

export default function PreviewFoto() {
  const [, navigate] = useLocation();
  const { photoUrls, orientation, selectedTemplateId, selectedTemplateData, setSelectedTemplateId, setSelectedTemplateData, filter, setFilter, colorCorrection, setColorCorrection, photoStickers, setPhotoStickers, templatePhotoMap, setTemplatePhotoMap, setCurrentSlot, incrementRetake, retakeCounts, outputMirrored, setOutputMirrored } = useKioskSession();
  const kioskFlow = useBoothConfig((s) => s.config.kioskFlow);
  const storedTemplate = useTemplateLibrary((state) => state.templates.find((item) => item.id === selectedTemplateId));
  const template = selectedTemplateData ?? storedTemplate;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedPhoto, setSelectedPhoto] = useState(0);
  const stickers = useStickerLibrary((state) => state.stickers);
  const [editing, setEditing] = useState(false);
  const [draggingSticker, setDraggingSticker] = useState<string | null>(null);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  const resizeStateRef = useRef<{ id: string; startY: number; startScale: number } | null>(null);
  const [draggedPhoto, setDraggedPhoto] = useState<number | null>(null);
  const stickerAssets = Object.fromEntries(stickers.map((sticker) => [sticker.id, sticker.dataUrl]));

  // The canvas used to size itself via max-h/max-w + object-contain, which
  // usually leaves empty space on one axis (the padded box around it rarely
  // matches the template's exact aspect ratio) — sticker x/y percentages were
  // computed against that whole padded box, so a sticker dropped "in the
  // corner" didn't actually land in the corner of the rendered template, and
  // dragging felt disconnected from where the sticker visually was. Measuring
  // the box and giving the canvas (and the sticker overlay layer) that exact
  // fitted size instead makes on-screen position match the composited output.
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const [canvasBox, setCanvasBox] = useState<{ width: number; height: number } | null>(null);
  const [serverTemplates, setServerTemplates] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"filter" | "color" | "sticker">("filter");
  // Snapshot (not a live canvas reference) so the zoom modal can show it full-
  // screen independent of this small preview box's own size/lifecycle. The
  // canvas already renders at the template's full native resolution
  // regardless of its tiny on-screen CSS size (see renderTemplate in
  // client/src/lib/output.ts), so this capture is already "HD" — no need to
  // re-render bigger for the zoomed view.
  const [zoomSnapshot, setZoomSnapshot] = useState<string | null>(null);
  const openZoom = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setZoomSnapshot(canvas.toDataURL("image/png"));
  };

  // Native scroll-snap for the big photo viewer — far more reliable on a
  // touchscreen than a JS drag/carousel library, and it tracks which photo is
  // centered so the rest of the panel (filter preview, retake, slot tap-to-
  // assign) always acts on the one the customer is actually looking at.
  const galleryScrollRef = useRef<HTMLDivElement>(null);
  const galleryItemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const scrollToPhoto = (index: number) => {
    galleryItemRefs.current[index]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    setSelectedPhoto(index);
  };
  const handleGalleryScroll = () => {
    const container = galleryScrollRef.current;
    if (!container) return;
    // At either end, the first/last card can't be scrolled to true center
    // (there's nothing left to scroll past it) — the "closest to center"
    // math below would then undershoot by one card, so the prev/next
    // buttons never actually seem to reach the last photo. Clamp instead.
    const maxScrollLeft = container.scrollWidth - container.clientWidth;
    if (maxScrollLeft <= 0) return;
    if (container.scrollLeft >= maxScrollLeft - 1) {
      setSelectedPhoto(galleryItemRefs.current.length - 1);
      return;
    }
    if (container.scrollLeft <= 1) {
      setSelectedPhoto(0);
      return;
    }
    const center = container.scrollLeft + container.clientWidth / 2;
    let closest = 0;
    let closestDist = Infinity;
    galleryItemRefs.current.forEach((el, index) => {
      if (!el) return;
      const itemCenter = el.offsetLeft + el.offsetWidth / 2;
      const dist = Math.abs(itemCenter - center);
      if (dist < closestDist) { closestDist = dist; closest = index; }
    });
    setSelectedPhoto(closest);
  };

  useEffect(() => {
    api.getFrames(orientation).then((frames) => setServerTemplates((frames ?? []).filter((frame) => frame.kind === "template"))).catch(() => setServerTemplates([]));
  }, [orientation]);

  const availableTemplates = [
    ...serverTemplates.map((frame) => ({
      id: frame.id,
      name: frame.name,
      orientation,
      outputPreset: "4r" as const,
      canvasWidth: frame.canvasWidth ?? 1200,
      canvasHeight: frame.canvasHeight ?? 1800,
      frameDataUrl: frame.imageUrl,
      slots: frame.slots ?? [],
      category: "custom" as const,
      style: "Server template",
    })),
    ...useTemplateLibrary.getState().templates.filter((item) => item.orientation === orientation),
  ];

  const selectTemplate = (id: string) => {
    const next = availableTemplates.find((item) => item.id === id);
    if (!next) return;
    setSelectedTemplateId(next.id);
    setSelectedTemplateData(next);
    setTemplatePhotoMap({});
  };

  // Prev/next instead of a horizontal-scrolling chip list — real tenants can
  // have 20+ frames (often named after their raw uploaded filename, e.g.
  // "Black and White Creative Photostrip Newspaper Photo Collage (1)-no-bg"),
  // which made that row either unreadable or, before it was capped, wide
  // enough to blow out the whole layout. A single current name + two arrows
  // is also just shorter, which matters here — this aside is tight on
  // vertical space already.
  const currentTemplateIndex = availableTemplates.findIndex((item) => item.id === selectedTemplateId);
  const goToFrame = (delta: 1 | -1) => {
    if (availableTemplates.length === 0) return;
    const base = currentTemplateIndex === -1 ? 0 : currentTemplateIndex;
    const next = (base + delta + availableTemplates.length) % availableTemplates.length;
    selectTemplate(availableTemplates[next].id);
  };

  useEffect(() => {
    if (!template || !canvasRef.current || photoUrls.length === 0) return;
    renderTemplate(photoUrls, template, canvasRef.current, photoStickers, stickerAssets, filter, templatePhotoMap, colorCorrection, outputMirrored).catch((error) => console.error("Preview template gagal", error));
  }, [photoUrls, template, filter, templatePhotoMap, colorCorrection, photoStickers, stickers, outputMirrored]);

  useEffect(() => {
    const container = previewBoxRef.current;
    if (!container || !template) return;
    const ratio = template.canvasWidth / template.canvasHeight;
    const compute = () => {
      const { width: containerWidth, height: containerHeight } = container.getBoundingClientRect();
      if (!containerWidth || !containerHeight) return;
      let width = containerWidth;
      let height = width / ratio;
      if (height > containerHeight) {
        height = containerHeight;
        width = height * ratio;
      }
      setCanvasBox((prev) => (prev && Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5) ? prev : { width, height });
    };
    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(container);
    return () => observer.disconnect();
  }, [template?.canvasWidth, template?.canvasHeight]);

  // Keyed by `id` (the placement), not `stickerId` (the library asset) — two
  // placed copies of the same sticker used to share a stickerId and collide
  // whenever one was moved, since the old match-by-stickerId update touched
  // every instance of that asset at once instead of just the one being dragged.
  const updateSticker = (sticker: PhotoSticker) =>
    setPhotoStickers(photoStickers.map((item) => item.id === sticker.id ? sticker : item));

  const addSticker = (stickerId: string) => {
    const id = crypto.randomUUID();
    setPhotoStickers([...photoStickers, { id, stickerId, x: 0.5, y: 0.5, scale: 1 }]);
    setSelectedStickerId(id);
  };

  const removeSticker = (id: string) => {
    setPhotoStickers(photoStickers.filter((item) => item.id !== id));
    setSelectedStickerId((current) => (current === id ? null : current));
  };

  const moveSticker = (event: React.PointerEvent<HTMLDivElement>, sticker: PhotoSticker) => {
    if (draggingSticker !== sticker.id) return;
    const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!bounds) return;
    updateSticker({ ...sticker, x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) });
  };

  // Freely resizable — drag the handle down to grow, up to shrink. Dragging
  // (not pinch) because most of this kiosk's touch surface only ever sees
  // one contact point at a time; a corner handle works the same with a mouse
  // for admin/browser testing.
  const startResizeSticker = (event: React.PointerEvent<HTMLDivElement>, sticker: PhotoSticker) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeStateRef.current = { id: sticker.id, startY: event.clientY, startScale: sticker.scale };
  };

  const resizeSticker = (event: React.PointerEvent<HTMLDivElement>, sticker: PhotoSticker) => {
    const state = resizeStateRef.current;
    if (!state || state.id !== sticker.id) return;
    const dy = event.clientY - state.startY;
    updateSticker({ ...sticker, scale: Math.max(0.4, Math.min(3, state.startScale + dy / 120)) });
  };

  const finishResizeSticker = () => { resizeStateRef.current = null; };

  const redo = (slot: number) => {
    if (!incrementRetake(slot)) return;
    setCurrentSlot(slot);
    navigate("/sesi-foto");
  };

  // Tap-to-assign: tap a photo in the gallery to select it, then tap a slot
  // to drop it there — a touchscreen kiosk has no mouse, so relying only on
  // native HTML5 drag (which barely works with touch at all) left this
  // feature effectively unusable. Dragging (mouse/desktop testing) still works
  // exactly as before.
  const assignPhotoToSlot = (slotIndex: number) => {
    const photoIndex = draggedPhoto ?? selectedPhoto;
    setTemplatePhotoMap({ ...templatePhotoMap, [slotIndex]: photoIndex });
    setDraggedPhoto(null);
  };

  return (
    <ScreenLayoutBoundary screenKey="preview">
    <div className="kinetic-page relative flex h-full min-h-0 flex-col overflow-hidden px-4 py-4 sm:px-8">
      {/* max-w-[…px] (not Tailwind's max-w-7xl) on purpose — this kiosk scales
          its root font-size with viewport size (see index.css), so an rem-based
          max-width scales right along with a big screen instead of actually
          capping anything: at the kiosk's max scale, max-w-7xl (80rem) is over
          2000px wide, wider than the real screen this was reported on. A raw
          px value stays a real, constant cap regardless of that scaling. */}
      <header className="mx-auto flex w-full max-w-[1400px] shrink-0 items-end justify-between gap-4 py-2">
        {/* Smaller than the usual kiosk hero heading on purpose — this is a
            working/editing screen (gallery + live composition need most of
            the vertical space), not a "moment" screen like Idle or Hasil.
            At this app's largest root-font scale (see index.css), the old
            text-6xl heading alone measured out to a ~284px header on a
            1400×900 window, which is most of what should have gone to the
            actually-functional panels below it. */}
        <Positionable id="heading" type="text" label="Judul">
          <div>
            <span className="eyebrow">04 / YOUR CAPTURE GALLERY</span>
            <h2 className="mt-1 font-display text-2xl font-bold sm:text-4xl">Momenmu, siap diedit.</h2>
            <p className="mt-1 text-sm text-white/50">Geser untuk lihat tiap foto, ketuk slot di kanan untuk pasang ke frame.</p>
          </div>
        </Positionable>
        <div className="flex items-center gap-2">
          <span className="hidden rounded-full border border-accent/30 bg-accent/10 px-4 py-2 text-sm text-accent sm:block">{photoUrls.length} foto</span>
          <Positionable id="next-button" type="system-button" label="Tombol Lanjut">
            <button onClick={() => navigate(getNextRoute("preview", kioskFlow))} className="rounded-xl bg-accent px-4 py-3 text-sm font-semibold shadow-lg shadow-accent/20 sm:px-6">Lanjut ke hasil →</button>
          </Positionable>
        </div>
      </header>

      {/* 3fr/2fr (not a fixed 360px aside) so the gallery can't keep growing
          on a wide screen while the aside stays pinned to one width — that
          left the gallery feeling oversized/dominant and the composition
          panel comparatively squeezed. Both now grow together, staying in
          the same proportion at any width. Same max-w-[…px] reasoning as
          the header above.
          `minmax(0, …fr)` on BOTH tracks, not plain `3fr 2fr` — a bare `fr`
          track's minimum size defaults to its content's min-content width,
          so one long unwrapped string anywhere inside (e.g. an admin frame
          literally named after its uploaded filename, "Black and White
          Creative Photostrip Newspaper Photo Collage (1)-no-bg") forces
          that whole column — and with it the row, and the toggle content
          sitting inside it — wider than the viewport. This is what actually
          broke the layout after the first balance pass; `minmax(0, …)` is
          what the removed `minmax(0,1fr)` was doing before, just now on
          both sides. `min-w-0` on both grid children is the same guard
          applied at the item level, belt-and-suspenders.

          `lg:grid-rows-[minmax(0,1fr)]` is the height equivalent of that
          same fix, and MUST stay `lg:`-scoped: without it, this row sized
          itself to `auto` (as tall as its content wants), and since the
          aside's own content (title+toggle+frame-switcher+canvas+slot row)
          genuinely needs more height than the gallery card naturally does,
          the aside's height got pinned to the *shorter* gallery's natural
          height while its own `overflow: visible` let the excess spill out
          and overlap whatever rendered below (the Filter panel) — the exact
          "amburadul" / "frame photo tidak keliatan" / slots "menyebar
          kemana-mana" bug report. Forcing the row to be exactly this
          container's available height (not content-sized) means both
          columns get the same real, definite height to stretch into.
          The `lg:` prefix is load-bearing, not decorative — below that
          breakpoint the grid drops to its default single column, so gallery
          and aside become two STACKED rows instead of one shared row. An
          unscoped `minmax(0,1fr)` row then applies to whichever of the two
          items lands in the *explicit* row while the other gets its own
          separate implicit `auto` row — and since `minmax(0, …)` permits
          shrinking all the way to 0, that explicit row gets squeezed to
          0px (visually overlapping the next row) the moment the implicit
          row's content is tall enough to claim the rest of the space. Tried
          this unscoped first; confirmed via `getComputedStyle(...).
          gridTemplateRows` showing a literal `"0px 660px"` before adding
          `lg:`. */}
      <div className="mx-auto mt-4 grid min-h-0 w-full max-w-[1400px] flex-1 gap-4 lg:grid-rows-[minmax(0,1fr)] lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="glass-panel flex min-h-0 min-w-0 flex-col rounded-[2rem] p-5 sm:p-7">
          <div className="mb-4 flex shrink-0 items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent"><IconGallery className="h-[18px] w-[18px]" /></span>
              <div><span className="eyebrow">CAPTURED</span><h3 className="font-display text-2xl font-semibold">Galeri jepretan</h3></div>
            </div>
            <button onClick={() => redo(selectedPhoto)} disabled={(retakeCounts[selectedPhoto] ?? 0) >= 3} className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-xs text-white/70 hover:border-accent hover:text-white disabled:opacity-40">
              <IconRefresh className="h-3.5 w-3.5" /> Ulangi foto {selectedPhoto + 1}
            </button>
          </div>

          {/* Card strip — ~2 photos shown large at a time (plus a peek of the
              next), native swipe (scroll-snap) between them, with explicit
              prev/next arrows so it isn't swipe-only and no one gets stuck
              not realizing there's more than one photo to look through. */}
          <div className="relative flex min-h-0 flex-1 items-center">
            <button
              type="button"
              onClick={() => scrollToPhoto(Math.max(0, selectedPhoto - 1))}
              disabled={selectedPhoto === 0}
              className="absolute left-0 z-20 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-white/20 bg-black/60 text-2xl text-white shadow-lg backdrop-blur-sm transition hover:border-accent/60 hover:bg-black/80 disabled:opacity-20"
              aria-label="Foto sebelumnya"
            >
              ‹
            </button>

            <div
              ref={galleryScrollRef}
              onScroll={handleGalleryScroll}
              className="flex w-full snap-x snap-mandatory items-center gap-4 overflow-x-auto scroll-smooth px-14 py-2"
            >
              {photoUrls.map((url, index) => (
                <button
                  key={`${url}-${index}`}
                  ref={(el) => { galleryItemRefs.current[index] = el; }}
                  draggable
                  onDragStart={() => setDraggedPhoto(index)}
                  onDragEnd={() => setDraggedPhoto(null)}
                  onClick={() => setSelectedPhoto(index)}
                  style={{ width: "min(46%, 260px)" }}
                  className={`group relative shrink-0 snap-center overflow-hidden rounded-2xl border-2 bg-black/30 text-left transition ${orientation === "landscape" ? "aspect-[4/3]" : "aspect-[3/4]"} ${selectedPhoto === index ? "border-accent shadow-xl shadow-accent/20" : "border-white/10 hover:border-white/30"}`}
                >
                  <img src={url} alt={`Hasil foto ${index + 1}`} className="h-full w-full object-cover" style={{ filter: composeFilterCss(filter, colorCorrection), transform: outputMirrored ? "scaleX(-1)" : undefined }} />
                  <span className="absolute left-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-xs font-semibold">{String(index + 1).padStart(2, "0")}</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => scrollToPhoto(Math.min(photoUrls.length - 1, selectedPhoto + 1))}
              disabled={selectedPhoto === photoUrls.length - 1}
              className="absolute right-0 z-20 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-white/20 bg-black/60 text-2xl text-white shadow-lg backdrop-blur-sm transition hover:border-accent/60 hover:bg-black/80 disabled:opacity-20"
              aria-label="Foto selanjutnya"
            >
              ›
            </button>
          </div>

          {photoUrls.length > 1 && (
            <div className="mt-3 flex shrink-0 items-center justify-center gap-2">
              {photoUrls.map((_, index) => (
                <button
                  key={index}
                  onClick={() => scrollToPhoto(index)}
                  className={`h-2 rounded-full transition-all ${selectedPhoto === index ? "w-6 bg-accent" : "w-2 bg-white/25 hover:bg-white/40"}`}
                  aria-label={`Foto ${index + 1}`}
                />
              ))}
            </div>
          )}
        </section>

        {template && (
          // overflow-y-auto as a fallback for a genuinely too-short window
          // (e.g. a laptop testing the kiosk in a small browser) — with the
          // grid-row height fix above this shouldn't normally need to
          // scroll, but silently overlapping the section below it (the old
          // behavior) is worse than an occasional scrollbar.
          <aside className="glass-panel flex min-h-0 min-w-0 flex-col overflow-y-auto rounded-[2rem] p-4">
            <div className="mb-2 flex shrink-0 items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent"><IconFrame className="h-4 w-4" /></span>
              <div className="min-w-0"><span className="eyebrow">LIVE COMPOSITION</span><h3 className="truncate font-display text-lg font-semibold">{template.name}</h3></div>
            </div>

            {/* Live view is mirrored for a natural "look in the mirror" pose,
                but the camera always saves the true (unflipped) frame —
                without a way to flip it back at composite time, the printed
                result looked backwards compared to what the customer posed
                for (the exact complaint that prompted this control). Its own
                row (not squeezed beside the title) so it can't collide with
                "LIVE COMPOSITION" wrapping to two lines in this narrow column. */}
            <div className="mb-2 flex shrink-0 items-center justify-between gap-2 rounded-xl bg-white/[0.03] p-1">
              <span className="pl-2 text-xs font-medium text-white/40">Arah hasil</span>
              <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setOutputMirrored(true)}
                  className={`rounded-full px-2.5 py-1 transition ${outputMirrored ? "bg-accent text-white" : "text-white/50 hover:text-white"}`}
                >
                  Mirror
                </button>
                <button
                  type="button"
                  onClick={() => setOutputMirrored(false)}
                  className={`rounded-full px-2.5 py-1 transition ${!outputMirrored ? "bg-accent text-white" : "text-white/50 hover:text-white"}`}
                >
                  Asli
                </button>
              </div>
            </div>

            {availableTemplates.length > 1 && (
              // A horizontal-scrolling chip per frame used to live here —
              // fine for two or three frames, but a real tenant can easily
              // have 20+ (often named after a raw uploaded filename), which
              // either made this row unreadable or, capped, still took a
              // whole extra section's worth of height in an aside that's
              // already tight on vertical space. Prev/next + the current
              // name is shorter and scales to any number of frames the same way.
              <div className="mb-2 flex shrink-0 items-center justify-between gap-2 border-t border-white/[0.06] pt-2">
                <button
                  type="button"
                  onClick={() => goToFrame(-1)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-base text-white/70 transition hover:border-accent/60 hover:text-white"
                  aria-label="Frame sebelumnya"
                >
                  ‹
                </button>
                <div className="min-w-0 flex-1 text-center">
                  <p className="text-[0.5625rem] font-medium uppercase tracking-wider text-white/40">Ganti frame</p>
                  <p className="truncate text-xs font-semibold" title={template.name}>{template.name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => goToFrame(1)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-base text-white/70 transition hover:border-accent/60 hover:text-white"
                  aria-label="Frame selanjutnya"
                >
                  ›
                </button>
              </div>
            )}

            {/* min-h-[…] (a real floor), not min-h-0 — this is the whole
                point of the panel, and it was consistently losing the fight
                for space against everything stacked around it (title,
                mirror toggle, frame switcher, slot row all being
                shrink-0/fixed while this alone was the "whatever's left"
                flexible one) — measured as low as 35px tall in practice.
                Guaranteeing it real minimum room means the *other* stuff
                scrolls (aside has overflow-y-auto) before this does. */}
            <div ref={previewBoxRef} className="relative flex min-h-[220px] flex-1 items-center justify-center rounded-2xl bg-black/30 p-3" onPointerDown={() => setSelectedStickerId(null)}>
              {template && (
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={openZoom}
                  aria-label="Perbesar preview frame"
                  className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white/80 shadow-lg backdrop-blur-sm transition hover:border-accent/60 hover:text-white"
                >
                  <IconZoomIn className="h-[18px] w-[18px]" />
                </button>
              )}
              <div className="relative" style={{ width: canvasBox?.width, height: canvasBox?.height }}>
                <canvas ref={canvasRef} className="h-full w-full rounded-xl" />
                {editing && photoStickers.map((sticker) => {
                  const asset = stickers.find((item) => item.id === sticker.stickerId);
                  if (!asset) return null;
                  const isSelected = selectedStickerId === sticker.id;
                  return (
                  <div
                    key={sticker.id}
                    // min(..., 44px) — a tiny sticker (low scale) would otherwise
                    // give a touch target far smaller than a finger, making it
                    // hard to grab, select, or hit the delete/resize handles.
                    className="absolute flex aspect-square min-h-11 min-w-11 touch-none items-center justify-center"
                    style={{ left: `${sticker.x * 100}%`, top: `${sticker.y * 100}%`, width: `${16 * sticker.scale}%`, transform: "translate(-50%, -50%)" }}
                    onPointerDown={(event) => { event.stopPropagation(); setSelectedStickerId(sticker.id); setDraggingSticker(sticker.id); event.currentTarget.setPointerCapture(event.pointerId); }}
                    onPointerMove={(event) => moveSticker(event, sticker)}
                    onPointerUp={() => setDraggingSticker(null)}
                  >
                    <img src={asset.dataUrl} draggable={false} className="pointer-events-none h-full w-full cursor-move object-contain" style={{ outline: isSelected ? "2px dashed var(--accent)" : undefined, outlineOffset: 4 }} />
                    {isSelected && (
                      <>
                        <button
                          type="button"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => { event.stopPropagation(); removeSticker(sticker.id); }}
                          className="absolute -right-3 -top-3 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-red-500 text-sm font-bold text-white shadow-lg"
                          aria-label="Hapus stiker"
                        >×</button>
                        <div
                          onPointerDown={(event) => startResizeSticker(event, sticker)}
                          onPointerMove={(event) => resizeSticker(event, sticker)}
                          onPointerUp={finishResizeSticker}
                          className="absolute -bottom-3 -right-3 h-7 w-7 cursor-nwse-resize touch-none rounded-full border-2 border-white bg-accent shadow-lg"
                          aria-label="Ubah ukuran stiker"
                        />
                      </>
                    )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Shrunk (shorter hint, smaller slot cells) — this row was the
                single biggest thing squeezing the canvas above it, and it's
                the least important part of this panel to see at full size. */}
            <div className="mt-2 shrink-0 border-t border-white/[0.06] pt-2">
              <p className="mb-1.5 truncate text-[0.6875rem] text-white/45">
                {activeTab === "sticker" ? "Geser stiker, ketuk × untuk hapus." : "Ketuk foto lalu ketuk slot untuk pasang."}
              </p>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {template.slots.map((_, slotIndex) => {
                  const photoIndex = templatePhotoMap[slotIndex] ?? Math.min(slotIndex, photoUrls.length - 1);
                  const photoForSlot = photoUrls[photoIndex];
                  return (
                    <button
                      key={slotIndex}
                      type="button"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => assignPhotoToSlot(slotIndex)}
                      onClick={() => assignPhotoToSlot(slotIndex)}
                      className="flex w-12 shrink-0 flex-col items-center gap-1 rounded-lg border border-dashed border-white/20 bg-white/[0.04] p-1 transition hover:border-accent hover:bg-accent/10"
                    >
                      <span className="text-[0.5625rem] text-white/40">{slotIndex + 1}</span>
                      {photoForSlot ? <img src={photoForSlot} alt={`Slot ${slotIndex + 1}`} className="h-8 w-full rounded-md object-cover" /> : <span className="flex h-8 w-full items-center justify-center rounded-md bg-white/5 text-white/30">–</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Smaller footprint overall — this panel used to take a full extra
          "section's worth" of vertical space (large tabs, tall filter
          thumbnails, generous min-height) below an already-tall grid row,
          which is the other half of why this screen felt cramped/oversized. */}
      <div className="mx-auto mt-3 w-full max-w-[1400px] shrink-0 rounded-[2rem] border border-white/10 bg-black/20 p-3">
        <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
          <button onClick={() => setActiveTab("filter")} className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition ${activeTab === "filter" ? "bg-white text-black" : "bg-white/10 text-white/60 hover:bg-white/20"}`}><IconFilter className="h-3.5 w-3.5" /> Filter</button>
          <button onClick={() => setActiveTab("color")} className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition ${activeTab === "color" ? "bg-white text-black" : "bg-white/10 text-white/60 hover:bg-white/20"}`}><IconSliders className="h-3.5 w-3.5" /> Koreksi Warna</button>
          {template && stickers.length > 0 && <button onClick={() => { setActiveTab("sticker"); setEditing(true); }} className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition ${activeTab === "sticker" ? "bg-white text-black" : "bg-white/10 text-white/60 hover:bg-white/20"}`}><IconSticker className="h-3.5 w-3.5" /> Stiker</button>}
        </div>

        <div className="min-h-[96px]">
          {activeTab === "filter" && (
            <div className="mx-auto flex max-w-3xl snap-x snap-mandatory gap-2 overflow-x-auto rounded-2xl border border-accent/30 bg-accent/5 p-2">
              {(Object.keys(FILTER_LABELS) as CameraFilter[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`group w-16 shrink-0 snap-center rounded-xl border p-1 transition ${filter === key ? "border-accent bg-accent/15 shadow-lg shadow-accent/20" : "border-white/10 bg-white/5 hover:border-white/30"}`}
                >
                  <img src={photoUrls[selectedPhoto]} className="h-9 w-full rounded-lg object-cover" style={{ filter: FILTER_CSS[key] }} />
                  <span className="mt-1 block text-center text-[0.625rem]">{FILTER_LABELS[key]}</span>
                </button>
              ))}
            </div>
          )}

          {activeTab === "color" && (
            <section className="mx-auto max-w-3xl grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 sm:grid-cols-3">
              {(["brightness", "contrast", "saturation"] as const).map((key) => (
                <label key={key} className="text-xs uppercase tracking-wider text-white/60">
                  <span className="flex justify-between mb-2"><span>{key}</span><span className="text-white/40">{colorCorrection[key]}%</span></span>
                  <input type="range" min={50} max={150} value={colorCorrection[key]} onChange={(event) => setColorCorrection({ ...colorCorrection, [key]: Number(event.target.value) })} className="w-full accent-[var(--accent)]" />
                </label>
              ))}
              <button
                type="button"
                onClick={() => setColorCorrection({ brightness: 100, contrast: 100, saturation: 100 })}
                className="col-span-full justify-self-center rounded-xl border border-white/15 px-4 py-2 text-xs text-white/60 hover:border-accent hover:text-white"
              >
                Reset koreksi warna
              </button>
            </section>
          )}

          {activeTab === "sticker" && template && (
            <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-2 rounded-2xl border border-white/10 bg-black/30 p-3">
              {stickers.map((sticker) => (
                <button key={sticker.id} onClick={() => addSticker(sticker.id)} className="h-14 w-14 rounded-xl border border-white/15 bg-white/5 p-2 transition hover:-translate-y-1 hover:border-accent hover:shadow-lg">
                  <img src={sticker.dataUrl} className="h-full w-full object-contain" />
                </button>
              ))}
              {stickers.length === 0 && <p className="text-sm text-white/40">Belum ada stiker di library</p>}
            </div>
          )}
        </div>
      </div>

    </div>
    {zoomSnapshot && (
      <ZoomableImageModal src={zoomSnapshot} alt={template?.name ?? "Preview frame"} onClose={() => setZoomSnapshot(null)} />
    )}
    </ScreenLayoutBoundary>
  );
}
