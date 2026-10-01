import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { useKioskSession } from "@/lib/sessionStore";
import { useBoothConfig } from "@/lib/boothConfigStore";
import { getNextRoute, getPreviousRoute } from "@/lib/kioskFlow";
import { OUTPUT_PRESETS, useTemplateLibrary, type LocalTemplate } from "@/lib/templateStore";
import { useFrameCategories, hydrateFrameCategoriesFromServer } from "@/lib/frameCategoryStore";
import { isBrowserOnline, isOfflineSessionId } from "@/lib/offlineStore";
import { ScreenLayoutBoundary } from "@/lib/screenBuilder/ScreenLayoutBoundary";
import Positionable from "@/components/Positionable";
import StepProgress from "@/components/kiosk/StepProgress";
import { BackButton, ScreenTitle, Spinner } from "@/components/kiosk/KioskUI";
import { Icon } from "@/components/kiosk/Icons";

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
  // Category filter chip ("__all__" = every frame). The old two-step "pick a category, then swipe a carousel"
  // flow confused customers; everything is on one screen now.
  const [activeCategory, setActiveCategory] = useState<string>("__all__");
  const [retryKey, setRetryKey] = useState(0);

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
  }, [orientation, retryKey]);

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

  const visibleFrames = activeCategory === "__all__" ? options : categoryGroups.find((g) => g.key === activeCategory)?.items ?? [];
  const selected = options.find((option) => option.id === selectedId);
  const noFrameSelected = selectedId === "__none__";

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

  // Frames are chosen BEFORE the photos are taken, so there is nothing to show inside the photo windows yet.
  // Draw numbered placeholder tiles exactly where the real slots are, so the customer sees where each photo will land.
  const renderPreview = (frame: FrameOption) => {
    const ratio = frame.canvasWidth && frame.canvasHeight ? `${frame.canvasWidth} / ${frame.canvasHeight}` : "2 / 3";
    return (
      <div className="relative w-full overflow-hidden rounded-xl bg-white shadow-md ring-1 ring-black/5" style={{ aspectRatio: ratio }}>
        {frame.slots && frame.slots.length > 0 ? (
          frame.slots.map((slot, i) => (
            <div key={i} className="absolute flex items-center justify-center overflow-hidden bg-gradient-to-br from-accent/20 to-[#ffc8de]/60 text-accent/60" style={{ left: `${slot.x * 100}%`, top: `${slot.y * 100}%`, width: `${slot.w * 100}%`, height: `${slot.h * 100}%` }}>
              {photoUrls[i] ? <img src={photoUrls[i]} alt="" className="h-full w-full object-cover" /> : <Icon name="camera" className="h-6 w-6" />}
            </div>
          ))
        ) : (
          <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-2 bg-slate-100 p-2">
            {[0, 1, 2, 3].map((i) => <div key={i} className="flex items-center justify-center rounded-md bg-gradient-to-br from-accent/20 to-[#ffc8de]/60 text-accent/60">{photoUrls[i] ? <img src={photoUrls[i]} alt="" className="h-full w-full object-cover" /> : <Icon name="camera" className="h-5 w-5" />}</div>)}
          </div>
        )}
        <img src={frame.imageUrl} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-fill" draggable={false} />
      </div>
    );
  };

  return (
    <ScreenLayoutBoundary screenKey="frame">
      <div className="kinetic-page relative flex h-full min-h-0 w-full flex-col">
        <StepProgress current="frame" />
        <div className="shrink-0 px-6 pb-3 pt-20 md:px-10">
          <ScreenTitle title="Pilih Frame" subtitle="Frame adalah bingkai fotomu. Opsional, kamu juga bisa lanjut tanpa frame." hint="Ketuk satu frame, lalu tekan “Lanjut”" />
        </div>

        {loading && (
          <div className="flex flex-1 items-center justify-center gap-3 text-muted">
            <Spinner />
            <span>Memuat frame…</span>
          </div>
        )}

        {!loading && loadError && (
          <div className="flex min-h-0 flex-1 items-center justify-center px-6">
            <div className="max-w-lg rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5 text-center text-sm text-amber-700">
              <p className="font-semibold">Frame belum dapat dimuat.</p>
              <p className="mt-1">{loadError}. Kamu bisa mencoba lagi, atau lanjut tanpa frame.</p>
              <button type="button" onClick={() => setRetryKey((k) => k + 1)} className="k-btn mt-3">
                <Icon name="refresh" className="h-4 w-4" />
                Coba lagi
              </button>
            </div>
          </div>
        )}

        {!loading && !loadError && (
          <>
            {/* Category chips */}
            {categoryGroups.length > 1 && (
              <div className="flex shrink-0 justify-center gap-2 overflow-x-auto px-6 pb-3">
                {[{ key: "__all__", label: `Semua (${options.length})` }, ...categoryGroups.map((g) => ({ key: g.key, label: `${g.label} (${g.items.length})` }))].map((chip) => (
                  <button key={chip.key} type="button" onClick={() => setActiveCategory(chip.key)} className={`k-chip shrink-0 !px-5 !py-2.5 !text-sm ${activeCategory === chip.key ? "!border-transparent !bg-fg !text-canvas" : ""}`}>
                    {chip.label}
                  </button>
                ))}
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 md:px-10">
              {options.length === 0 && (
                <div className="glass-panel mx-auto mt-6 flex max-w-md flex-col items-center gap-3 rounded-3xl p-8 text-center">
                  <Icon name="frame" className="h-8 w-8 text-accent" />
                  <p className="font-display text-xl font-semibold">Belum ada frame</p>
                  <p className="text-sm text-muted">Kamu tetap bisa berfoto tanpa frame.</p>
                </div>
              )}
              <div className="mx-auto grid max-w-[1400px] justify-center gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 12rem), 17rem))" }}>
                {visibleFrames.map((frame, i) => {
                  const active = selectedId === frame.id;
                  return (
                    <motion.button
                      key={frame.id}
                      type="button"
                      onClick={() => setSelectedId(frame.id)}
                      aria-pressed={active}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i, 8) * 0.04 }}
                      className={`glass-panel relative flex flex-col gap-3 rounded-3xl p-3 text-left transition ${active ? "!border-accent shadow-[0_0_0_3px_var(--accent)]" : "hover:border-accent/50"}`}
                    >
                      {renderPreview(frame)}
                      <span className="truncate px-1 text-center text-sm font-semibold">{frame.name}</span>
                      {active && (
                        <span className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-accent text-on-accent shadow-lg animate-pop-in"><Icon name="check" className="h-4 w-4" strokeWidth={3} /></span>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Action bar: always visible, so "what do I press now?" is never a question */}
        <div className="glass-panel shrink-0 rounded-none border-x-0 border-b-0 px-6 py-4 md:px-10">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3">
            <BackButton onClick={() => navigate(getPreviousRoute("frame", kioskFlow))} />
            <p className="hidden min-w-0 flex-1 truncate text-center text-sm text-muted xl:block">
              {noFrameSelected ? "Tanpa frame" : selected ? <>Dipilih: <strong className="text-fg">{selected.name}</strong></> : "Belum ada frame dipilih"}
            </p>
            <div className="flex items-center gap-3">
              <Positionable id="no-frame-button" type="system-button" label="Lanjut tanpa frame">
                <button type="button" onClick={() => choose(true)} className="k-btn">Tanpa frame</button>
              </Positionable>
              <Positionable id="next-button" type="system-button" label="Tombol Lanjut">
                <button type="button" onClick={() => choose()} disabled={!selected && !noFrameSelected} className="k-btn k-btn-accent k-btn-lg">
                  Lanjut
                  <Icon name="arrow-right" className="h-5 w-5" />
                </button>
              </Positionable>
            </div>
          </div>
        </div>
      </div>
    </ScreenLayoutBoundary>
  );
}
