import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { api } from "@/lib/api";
import { useKioskSession } from "@/lib/sessionStore";
import { useBoothConfig } from "@/lib/boothConfigStore";
import { getNextRoute, getPreviousRoute } from "@/lib/kioskFlow";
import { OUTPUT_PRESETS, useTemplateLibrary, type LocalTemplate } from "@/lib/templateStore";
import { useFrameCategories, hydrateFrameCategoriesFromServer } from "@/lib/frameCategoryStore";
import { isBrowserOnline, isOfflineSessionId } from "@/lib/offlineStore";
import { ScreenLayoutBoundary } from "@/lib/screenBuilder/ScreenLayoutBoundary";
import Positionable from "@/components/Positionable";

interface FrameOption {
  id: string;
  kind: "template" | "overlay";
  name: string;
  imageUrl: string;
  category?: string;
  slots?: LocalTemplate["slots"];
  canvasWidth?: number;
  canvasHeight?: number;
}

export default function PilihFrame() {
  const [, navigate] = useLocation();
  const { orientation, photoUrls, setFrameId, setSelectedTemplateId, setSelectedTemplateData, outputPreset, sessionId } = useKioskSession();
  const kioskFlow = useBoothConfig((s) => s.config.kioskFlow);
  const localTemplates = useTemplateLibrary((state) => state.templates);
  // The category list an admin builds in Kelola Frame (Admin → Kelola Frame →
  // "+ Kategori baru…") — read from the same shared store so a category
  // created there groups and labels correctly here too, instead of every
  // frame outside the old hardcoded six silently collapsing into "Custom".
  const { categories: knownCategories } = useFrameCategories();
  const categoryLabel = (key: string) => knownCategories.find((category) => category.key === key)?.label ?? key;
  const [frames, setFrames] = useState<FrameOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // "__none__" = explicitly chose no frame; null = nothing chosen yet
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Category-first browsing: null = showing the category list; a category
  // key (or "__all__") = showing that category's swipeable carousel.
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    const loadFrames = async () => {
      try {
        const result = await api.getFrames(orientation);
        if (!cancelled) setFrames(result ?? []);
      } catch (error) {
        if (!cancelled) {
          setFrames([]);
          setLoadError(error instanceof Error ? error.message : "Frame gagal dimuat");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadFrames();
    return () => {
      cancelled = true;
    };
  }, [orientation]);

  // Refreshed on every visit to this screen, same as the frames themselves
  // above — a category made in Kelola Frame on the admin's own device used to
  // never reach this kiosk (categories lived only in that browser's
  // localStorage), so a frame tagged with a brand-new category silently fell
  // back to "Custom" here. Errors are swallowed: worst case this kiosk keeps
  // using its last-known/default category list, not a broken frame screen.
  useEffect(() => { hydrateFrameCategoriesFromServer(); }, []);

  const options = useMemo(() => {
    const serverIds = new Set(frames.map((frame) => frame.id));
    return [
      ...frames,
      ...localTemplates
        .filter((template) => !serverIds.has(template.id))
        .map((template) => ({ id: template.id, kind: "template" as const, name: `${template.name} · ${template.orientation}`, imageUrl: template.frameDataUrl, category: template.category, slots: template.slots, canvasWidth: template.canvasWidth, canvasHeight: template.canvasHeight })),
    ];
  }, [frames, localTemplates, orientation]);

  // Overlays have no category of their own (frame_overlays has never had that
  // column) — grouped under "custom" alongside uncategorized templates
  // rather than inventing a whole separate "Lainnya" bucket for one kind.
  const categoryGroups = useMemo(() => {
    const groups = new Map<string, FrameOption[]>();
    for (const option of options) {
      const key = option.category && knownCategories.some((category) => category.key === option.category) ? option.category : "custom";
      const list = groups.get(key) ?? [];
      list.push(option);
      groups.set(key, list);
    }
    return knownCategories
      .filter((category) => groups.has(category.key))
      .map((category) => ({ key: category.key, label: category.label, items: groups.get(category.key)! }));
  }, [options, knownCategories]);

  const activeItems = activeCategory === "__all__" ? options : categoryGroups.find((g) => g.key === activeCategory)?.items ?? [];
  const carouselFrame = activeItems[carouselIndex];

  // The carousel's current frame IS the live selection — Positionable's next
  // button just confirms whatever's showing, no separate "pilih" tap on a
  // thumbnail first.
  useEffect(() => {
    if (activeCategory && activeCategory !== "__none__" && carouselFrame) setSelectedId(carouselFrame.id);
  }, [activeCategory, carouselFrame]);

  const selected = options.find((option) => option.id === selectedId);
  const noFrameSelected = selectedId === "__none__";

  const openCategory = (key: string) => {
    setActiveCategory(key);
    setCarouselIndex(0);
  };

  const swipe = (direction: 1 | -1) => {
    if (activeItems.length === 0) return;
    setCarouselIndex((current) => Math.max(0, Math.min(activeItems.length - 1, current + direction)));
  };

  const onDragEnd = (_event: unknown, info: PanInfo) => {
    const SWIPE_THRESHOLD = 60;
    if (info.offset.x <= -SWIPE_THRESHOLD) swipe(1);
    else if (info.offset.x >= SWIPE_THRESHOLD) swipe(-1);
  };

  const choose = (forceNoFrame = false) => {
    const useNoFrame = forceNoFrame || noFrameSelected;
    const resolvedSelected = useNoFrame ? undefined : selected;
    const localTemplate = resolvedSelected?.kind === "template" && !frames.some((frame) => frame.id === resolvedSelected?.id)
      ? localTemplates.find((template) => template.id === selectedId)
      : undefined;
    setFrameId(resolvedSelected?.id ?? null);
    setSelectedTemplateId(localTemplate?.id ?? null);
    if (localTemplate) {
      setSelectedTemplateData(localTemplate);
    } else if (resolvedSelected?.kind === "template" && resolvedSelected.slots) {
      const preset = OUTPUT_PRESETS[outputPreset as keyof typeof OUTPUT_PRESETS] ?? OUTPUT_PRESETS["4r"];
      setSelectedTemplateData({
        id: resolvedSelected.id,
        name: resolvedSelected.name,
        category: "custom",
        style: "Server template",
        orientation,
        outputPreset: outputPreset as LocalTemplate["outputPreset"],
        canvasWidth: resolvedSelected.canvasWidth ?? preset.width,
        canvasHeight: resolvedSelected.canvasHeight ?? preset.height,
        frameDataUrl: resolvedSelected.imageUrl,
        slots: resolvedSelected.slots,
      });
      setSelectedTemplateId(resolvedSelected.id);
    } else {
      setSelectedTemplateData(null);
    }
    // Navigate immediately — everything the next screens need (frame id,
    // template data) is already in the local session store above. Persisting
    // the choice to the server is just for admin/record-keeping, so it
    // shouldn't hold up the customer waiting on a Neon/tunnel round-trip
    // before the "pilih frame" tap visibly does anything.
    if (sessionId && isBrowserOnline() && !isOfflineSessionId(sessionId)) {
      api.patchSession(sessionId, { frameId: resolvedSelected?.id ?? null, layout: outputPreset })
        .catch((error) => console.warn("Gagal menyimpan pilihan frame ke server", error));
    }
    navigate(getNextRoute("frame", kioskFlow));
  };

  const renderPreview = (frame: FrameOption | undefined, size: "list" | "hero") => (
    <div className={`relative aspect-[2/3] h-full w-full overflow-hidden rounded-xl bg-white shadow-2xl shadow-accent/20 ${size === "hero" ? "p-3" : ""}`}>
      <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-2 bg-slate-200 p-2">
        {photoUrls.slice(0, 4).map((url, index) => <img key={`${url}-${index}`} src={url} className="h-full w-full object-cover" />)}
      </div>
      {frame && <img src={frame.imageUrl} className="pointer-events-none absolute inset-0 h-full w-full object-fill" draggable={false} />}
    </div>
  );

  return (
    <ScreenLayoutBoundary screenKey="frame">
    <div className="kinetic-page relative flex h-full flex-col overflow-hidden">
      <header className="shrink-0 px-6 pt-5 md:px-10">
        <div className="flex items-start justify-between gap-4">
          <Positionable id="heading" type="text" label="Judul">
            <div>
              <span className="eyebrow">02 / CHOOSE YOUR STYLE</span>
              <h1 className="mt-1 font-display text-3xl font-bold md:text-4xl">Pilih Frame</h1>
              <p className="mt-1 text-sm text-white/50">Frame opsional — kamu bisa lanjut langsung tanpa frame.</p>
            </div>
          </Positionable>
          <Positionable id="back-button" type="system-button" label="Tombol Kembali">
            <button
              onClick={() => (activeCategory ? setActiveCategory(null) : navigate(getPreviousRoute("frame", kioskFlow)))}
              className="flex shrink-0 items-center gap-1.5 rounded-2xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/70 transition hover:border-white/35 hover:bg-white/[0.08] hover:text-white"
            >
              <span className="text-base leading-none">←</span> {activeCategory ? "Kategori lain" : "Kembali"}
            </button>
          </Positionable>
        </div>
      </header>

      {loading && (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-white/50">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-accent" />
          <span>Memuat frame...</span>
        </div>
      )}

      {!loading && loadError && (
        <div className="mx-auto mt-8 max-w-lg rounded-2xl border border-amber-300/30 bg-amber-300/10 p-5 text-center text-sm text-amber-100">
          <p>Frame belum dapat dimuat: {loadError}</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-3 rounded-xl border border-amber-200/30 px-3 py-2 font-semibold hover:bg-amber-200/10">
            Muat ulang
          </button>
        </div>
      )}

      {/* --- Category list (centered) --- */}
      {!loading && !loadError && !activeCategory && (
        <div className="mx-auto flex w-full max-w-3xl min-h-0 flex-1 flex-col items-center justify-start gap-6 overflow-y-auto px-6 py-8">
          <div className="grid w-full grid-cols-2 gap-4 sm:grid-cols-3">
            {categoryGroups.map((group) => (
              <motion.button
                key={group.key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => openCategory(group.key)}
                className="group relative aspect-[3/4] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] transition hover:border-accent/60 hover:shadow-lg hover:shadow-accent/20"
              >
                <img src={group.items[0]?.imageUrl} className="h-full w-full object-cover opacity-70 transition group-hover:scale-105 group-hover:opacity-90" />
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/45 backdrop-blur-[1px]">
                  <span className="font-display text-xl font-bold">{group.label}</span>
                  <span className="mt-1 text-xs text-white/60">{group.items.length} frame</span>
                </div>
              </motion.button>
            ))}
            {options.length > 0 && (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => openCategory("__all__")}
                className="group relative flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-white/20 bg-white/[0.03] transition hover:border-white/45 hover:bg-white/[0.06]"
              >
                <span className="text-2xl opacity-60">⊞</span>
                <span className="font-display text-lg font-semibold">Semua frame</span>
                <span className="text-xs text-white/50">{options.length} frame</span>
              </motion.button>
            )}
          </div>

          {options.length === 0 && <p className="text-center text-sm text-white/50">Belum ada frame tersedia untuk sesi ini.</p>}

          <Positionable id="next-button" type="system-button" label="Lanjut tanpa frame">
            <button onClick={() => choose(true)} className="rounded-2xl border border-white/15 px-6 py-3 text-sm text-white/60 transition hover:border-white/35 hover:text-white/90">
              Lanjut tanpa frame →
            </button>
          </Positionable>
        </div>
      )}

      {/* --- Swipeable carousel for the chosen category --- */}
      {!loading && !loadError && activeCategory && (
        <div className="mx-auto flex w-full max-w-xl min-h-0 flex-1 flex-col items-center gap-3 px-6 py-4">
          <div className="shrink-0 text-center">
            <span className="eyebrow">{activeCategory === "__all__" ? "SEMUA FRAME" : categoryLabel(activeCategory ?? "").toUpperCase()}</span>
            <p className="mt-1 text-sm text-white/50">Geser kiri/kanan untuk lihat pilihan lain.</p>
          </div>

          {/* min-h-0 lets this row shrink below its content's natural size —
              without it, a flex item defaults to min-height:auto, so on a
              short/small kiosk screen the hero card below could push the
              "Pilih frame ini" button (and the whole card, hint, dots...)
              past the bottom edge with nothing scrollable to reach it. */}
          <div className="relative flex w-full min-h-0 flex-1 items-center justify-center">
            <button
              type="button"
              onClick={() => swipe(-1)}
              disabled={carouselIndex === 0}
              className="absolute left-0 z-20 flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-white/20 bg-black/60 text-3xl text-white shadow-lg backdrop-blur-sm transition hover:border-accent/60 hover:bg-black/80 disabled:opacity-20 sm:left-2"
              aria-label="Frame sebelumnya"
            >
              ‹
            </button>

            {/* Coverflow: the next/previous frame peeks in blurred and dimmed
                behind the active card, pulled underneath it with a negative
                margin — a visual hint there's more to swipe through without
                needing extra copy. */}
            <div className="flex h-full w-full items-center justify-center overflow-hidden py-2">
              <div className="z-0 hidden h-full max-w-[9rem] shrink-0 scale-90 opacity-35 blur-[3px] transition-all duration-300 sm:block" style={{ marginRight: "-2.5rem", width: "34%" }}>
                {activeItems[carouselIndex - 1] ? renderPreview(activeItems[carouselIndex - 1], "list") : <div className="aspect-[2/3]" />}
              </div>

              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={carouselFrame?.id ?? "empty"}
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.6}
                  onDragEnd={onDragEnd}
                  initial={{ opacity: 0, x: 40, scale: 0.96 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -40, scale: 0.96 }}
                  transition={{ duration: 0.2 }}
                  className="relative z-10 mx-auto h-full shrink-0 cursor-grab rounded-2xl active:cursor-grabbing"
                  style={{
                    // Height-driven instead of width-driven: this card's size
                    // is capped by whatever vertical space this row actually
                    // has (h-full, from the flex-1 row above), with width
                    // following the 2:3 photo-strip ratio and only capped by
                    // max-width so it never gets absurdly wide on a landscape
                    // kiosk screen.
                    aspectRatio: "2 / 3",
                    maxWidth: "min(72vw, 22rem)",
                    boxShadow: "0 0 0 3px var(--accent), 0 0 55px 8px color-mix(in srgb, var(--accent) 55%, transparent)",
                  }}
                >
                  {renderPreview(carouselFrame, "hero")}
                </motion.div>
              </AnimatePresence>

              <div className="z-0 hidden h-full max-w-[9rem] shrink-0 scale-90 opacity-35 blur-[3px] transition-all duration-300 sm:block" style={{ marginLeft: "-2.5rem", width: "34%" }}>
                {activeItems[carouselIndex + 1] ? renderPreview(activeItems[carouselIndex + 1], "list") : <div className="aspect-[2/3]" />}
              </div>
            </div>

            <button
              type="button"
              onClick={() => swipe(1)}
              disabled={carouselIndex >= activeItems.length - 1}
              className="absolute right-0 z-20 flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-white/20 bg-black/60 text-3xl text-white shadow-lg backdrop-blur-sm transition hover:border-accent/60 hover:bg-black/80 disabled:opacity-20 sm:right-2"
              aria-label="Frame selanjutnya"
            >
              ›
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {activeItems.map((_, index) => (
              <button
                key={index}
                onClick={() => setCarouselIndex(index)}
                className={`h-1.5 rounded-full transition-all ${index === carouselIndex ? "w-6 bg-accent" : "w-1.5 bg-white/25 hover:bg-white/40"}`}
                aria-label={`Frame ${index + 1}`}
              />
            ))}
          </div>
          <p className="text-center text-sm font-semibold text-white/70">{carouselFrame?.name}</p>

          <Positionable id="next-button" type="system-button" label="Tombol Lanjut">
            <button
              onClick={() => choose()}
              className="kinetic-button w-full max-w-[min(85vw,26rem)] rounded-2xl bg-accent px-5 py-4 font-display text-xl font-bold"
            >
              Pilih frame ini <span className="ml-1">→</span>
            </button>
          </Positionable>
          <button onClick={() => choose(true)} className="rounded-2xl border border-white/15 px-6 py-3 text-sm text-white/60 transition hover:border-white/35 hover:text-white/90">
            Lanjut tanpa frame
          </button>
        </div>
      )}
    </div>
    </ScreenLayoutBoundary>
  );
}
