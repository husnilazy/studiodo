import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { useKioskSession } from "@/lib/sessionStore";
import { OUTPUT_PRESETS, useTemplateLibrary, type LocalTemplate } from "@/lib/templateStore";
import { isBrowserOnline } from "@/lib/offlineStore";

interface FrameOption {
  id: string;
  kind: "template" | "overlay";
  name: string;
  imageUrl: string;
  slots?: LocalTemplate["slots"];
  canvasWidth?: number;
  canvasHeight?: number;
}

export default function PilihFrame() {
  const [, navigate] = useLocation();
  const { orientation, photoUrls, setFrameId, setSelectedTemplateId, setSelectedTemplateData, outputPreset, sessionId } = useKioskSession();
  const localTemplates = useTemplateLibrary((state) => state.templates);
  const [frames, setFrames] = useState<FrameOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // "__none__" = explicitly chose no frame; null = nothing chosen yet
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    const loadFrames = async () => {
      try {
        const result = await api.getFrames(orientation);
        if (!cancelled) setFrames(result);
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

  const options = useMemo(() => {
    const serverIds = new Set(frames.map((frame) => frame.id));
    return [
      ...frames,
      ...localTemplates
        .filter((template) => !serverIds.has(template.id))
        .map((template) => ({ id: template.id, kind: "template" as const, name: `${template.name} · ${template.orientation}`, imageUrl: template.frameDataUrl, slots: template.slots, canvasWidth: template.canvasWidth, canvasHeight: template.canvasHeight })),
    ];
  }, [frames, localTemplates, orientation]);

  const selected = options.find((option) => option.id === selectedId);
  const noFrameSelected = selectedId === "__none__";

  const choose = async (forceNoFrame = false) => {
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
    if (sessionId && isBrowserOnline() && !sessionId.startsWith("offline-")) await api.patchSession(sessionId, { frameId: resolvedSelected?.id ?? null, layout: outputPreset });
    navigate("/sesi-foto");
  };

  return (
    <div className="kinetic-page flex h-full flex-col overflow-hidden">
      <header className="shrink-0 px-6 pt-5 md:px-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="eyebrow">02 / CHOOSE YOUR STYLE</span>
            <h1 className="mt-1 font-display text-3xl font-bold md:text-4xl">Pilih Frame</h1>
            <p className="mt-1 text-sm text-white/50">Frame opsional — kamu bisa lanjut langsung tanpa frame.</p>
          </div>
          <button onClick={() => navigate("/bayar")} className="mt-1 shrink-0 text-sm text-white/60 hover:text-white">← Kembali</button>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 gap-5 p-5 md:grid-cols-[minmax(280px,1fr)_380px] md:p-8">
        {/* Left: live preview */}
        <section className="flex min-h-0 flex-col items-center justify-center rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
          <div className="mb-4 text-center"><span className="eyebrow">LIVE COMPOSITION</span><h2 className="font-display text-3xl font-bold">Preview frame</h2></div>
          <motion.div
            key={selectedId ?? "unset"}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.22 }}
            className="relative aspect-[2/3] h-[min(66vh,620px)] overflow-hidden rounded-xl bg-white p-3 shadow-2xl shadow-accent/20"
          >
            <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-2 bg-slate-200 p-2">
              {photoUrls.slice(0, 4).map((url, index) => <img key={`${url}-${index}`} src={url} className="h-full w-full object-cover" />)}
            </div>
            {!noFrameSelected && selected?.imageUrl && <img src={selected.imageUrl} className="pointer-events-none absolute inset-0 h-full w-full object-fill" />}
            {noFrameSelected && (
              <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-4">
                <span className="rounded-full border border-white/30 bg-black/50 px-3 py-1 text-xs text-white/70 backdrop-blur-sm">Tanpa frame</span>
              </div>
            )}
          </motion.div>
          <p className="mt-4 text-center text-sm text-white/50">
            {noFrameSelected ? "Foto polos tanpa bingkai" : selected ? selected.name : "Pilih frame di panel kanan atau lanjut tanpa frame"}
          </p>
        </section>

        {/* Right: frame selector */}
        <aside className="kinetic-card flex min-h-0 flex-col rounded-[2rem] border border-white/10 bg-ink-800/70 p-5">
          <div className="flex items-end justify-between">
            <div><span className="eyebrow">CURATED LIBRARY</span><h2 className="font-display text-3xl font-bold">Pilih Frame</h2></div>
            <span className="text-xs text-white/40">{options.length} style</span>
          </div>
          <p className="mt-2 text-sm text-white/50">Ketuk frame yang paling kamu suka. Pengeditan foto tersedia setelah sesi selesai.</p>

          <div className="mt-5 grid min-h-0 flex-1 grid-cols-3 content-start gap-3 overflow-y-auto pr-1">
            {loading && <p className="col-span-3 text-sm text-white/50">Memuat frame...</p>}
            {!loading && loadError && (
              <div className="col-span-3 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-5 text-sm text-amber-100">
                <p>Frame belum dapat dimuat: {loadError}</p>
                <button type="button" onClick={() => window.location.reload()} className="mt-3 rounded-xl border border-amber-200/30 px-3 py-2 font-semibold hover:bg-amber-200/10">
                  Muat ulang
                </button>
              </div>
            )}

            {/* "Tanpa Frame" card — always visible once loaded */}
            {!loading && (
              <button
                onClick={() => setSelectedId("__none__")}
                className={`group relative flex aspect-[2/3] flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border-2 transition ${
                  noFrameSelected
                    ? "border-accent bg-accent/10 shadow-lg shadow-accent/30"
                    : "border-dashed border-white/25 bg-white/5 hover:border-white/45 hover:bg-white/[0.07]"
                }`}
              >
                <span className="text-lg opacity-50">✕</span>
                <span className="text-[10px] text-white/50 leading-tight text-center px-1">Tanpa<br/>frame</span>
                {noFrameSelected && <span className="absolute right-1 top-1 rounded-full bg-accent px-1.5 py-0.5 text-[10px]">✓</span>}
              </button>
            )}

            {options.map((frame) => (
              <button
                key={frame.id}
                onClick={() => setSelectedId(frame.id)}
                className={`group relative aspect-[2/3] overflow-hidden rounded-xl border-2 bg-white/10 transition ${
                  selectedId === frame.id ? "border-accent shadow-lg shadow-accent/30" : "border-white/10 hover:border-white/50"
                }`}
              >
                <img src={frame.imageUrl} className="h-full w-full object-cover transition group-hover:scale-105" />
                <span className="absolute inset-x-0 bottom-0 truncate bg-black/65 px-1 py-1 text-[10px]">{frame.name}</span>
                {selectedId === frame.id && <span className="absolute right-1 top-1 rounded-full bg-accent px-1.5 py-0.5 text-[10px]">✓</span>}
              </button>
            ))}
          </div>

          {/* CTA area */}
          <div className="mt-5 flex flex-col gap-2">
            {selectedId !== null && (
              <motion.p
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center text-xs text-white/45"
              >
                {noFrameSelected ? "Foto akan dicetak polos tanpa bingkai" : `Frame dipilih: ${selected?.name}`}
              </motion.p>
            )}
            <button
              onClick={() => choose()}
              disabled={selectedId === null}
              className="kinetic-button w-full rounded-2xl bg-accent px-5 py-4 font-display text-xl font-bold disabled:cursor-not-allowed disabled:opacity-35"
            >
              {selectedId === null ? "Pilih frame terlebih dahulu" : <>Selanjutnya <span className="ml-1">→</span></>}
            </button>
            {/* Ghost shortcut to skip frames — visible only when nothing selected yet */}
            {selectedId === null && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={() => choose(true)}
                className="w-full rounded-2xl border border-white/15 px-5 py-3 text-sm text-white/55 transition hover:border-white/35 hover:text-white/90"
              >
                Lanjut tanpa frame
              </motion.button>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
