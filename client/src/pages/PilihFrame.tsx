import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { useKioskSession } from "@/lib/sessionStore";
import { OUTPUT_PRESETS, useTemplateLibrary, type LocalTemplate } from "@/lib/templateStore";

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
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    api.getFrames(orientation).then(setFrames).catch(() => setFrames([])).finally(() => setLoading(false));
  }, [orientation]);

  const options = useMemo(() => {
    const serverIds = new Set(frames.map((frame) => frame.id));
    return [
      ...frames,
      ...localTemplates
        .filter((template) => !serverIds.has(template.id))
        .map((template) => ({ id: template.id, kind: "template" as const, name: `${template.name} · ${template.orientation}`, imageUrl: template.frameDataUrl, slots: template.slots })),
    ];
  }, [frames, localTemplates, orientation]);

  const selected = options.find((option) => option.id === selectedId);

  const choose = async () => {
    const localTemplate = selected?.kind === "template" && !frames.some((frame) => frame.id === selected?.id)
      ? localTemplates.find((template) => template.id === selectedId)
      : undefined;
    setFrameId(selected?.id ?? null);
    setSelectedTemplateId(localTemplate?.id ?? null);
    if (localTemplate) {
      setSelectedTemplateData(localTemplate);
    } else if (selected?.kind === "template" && selected.slots) {
      const preset = OUTPUT_PRESETS[outputPreset as keyof typeof OUTPUT_PRESETS] ?? OUTPUT_PRESETS["4r"];
      setSelectedTemplateData({
        id: selected.id,
        name: selected.name,
        category: "custom",
        style: "Server template",
        orientation,
        outputPreset: outputPreset as LocalTemplate["outputPreset"],
        canvasWidth: selected.canvasWidth ?? preset.width,
        canvasHeight: selected.canvasHeight ?? preset.height,
        frameDataUrl: selected.imageUrl,
        slots: selected.slots,
      });
      setSelectedTemplateId(selected.id);
    } else {
      setSelectedTemplateData(null);
    }
    if (sessionId) await api.patchSession(sessionId, { frameId: selected?.id ?? null, layout: outputPreset });
    navigate(photoUrls.length > 0 ? "/hasil" : "/sesi-foto");
  };

  return (
    <div className="kinetic-page flex h-full flex-col overflow-hidden">
      <header className="shrink-0 px-6 pt-4 md:px-10">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate("/preview")} className="text-sm text-white/60 hover:text-white">← Kembali</button>
          <div className="eyebrow mb-0 hidden md:block">FILTER <span className="text-white/40">→</span> LAYOUT <span className="text-white/40">→</span> BACKGROUND <span className="text-white/40">→</span> STICKER <span className="text-white/40">→</span> <b className="text-white">FRAME</b> <span className="text-white/40">→</span> REVIEW</div>
          <span className="rounded-full border border-accent/50 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent">05 / 06</span>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 gap-5 p-5 md:grid-cols-[minmax(280px,1fr)_380px] md:p-8">
        <section className="flex min-h-0 flex-col items-center justify-center rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
          <div className="mb-4 text-center"><span className="eyebrow">LIVE COMPOSITION</span><h2 className="font-display text-3xl font-bold">Preview frame</h2></div>
          <motion.div className="relative aspect-[2/3] h-[min(66vh,620px)] overflow-hidden rounded-xl bg-white p-3 shadow-2xl shadow-accent/20">
            <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-2 bg-slate-200 p-2">
              {photoUrls.slice(0, 4).map((url, index) => <img key={`${url}-${index}`} src={url} className="h-full w-full object-cover" />)}
            </div>
            {selected?.imageUrl && <img src={selected.imageUrl} className="pointer-events-none absolute inset-0 h-full w-full object-fill" />}
          </motion.div>
          <p className="mt-4 text-center text-sm text-white/50">{selected ? selected.name : "Pilih frame di panel kanan"}</p>
        </section>

        <aside className="kinetic-card flex min-h-0 flex-col rounded-[2rem] border border-white/10 bg-ink-800/70 p-5">
          <div className="flex items-end justify-between"><div><span className="eyebrow">CURATED LIBRARY</span><h2 className="font-display text-3xl font-bold">Pilih Frame</h2></div><span className="text-xs text-white/40">{options.length} style</span></div>
          <p className="mt-2 text-sm text-white/50">Ketuk frame yang paling kamu suka. Pengeditan foto tersedia setelah sesi selesai.</p>
          <div className="mt-5 grid min-h-0 flex-1 grid-cols-3 gap-3 overflow-y-auto pr-1">
            {loading && <p className="col-span-3 text-sm text-white/50">Memuat frame...</p>}
            {!loading && options.length === 0 && <button onClick={() => setSelectedId(null)} className="col-span-3 rounded-2xl border border-dashed border-white/20 p-5 text-sm text-white/50">Tanpa frame</button>}
            {options.map((frame) => <button key={frame.id} onClick={() => setSelectedId(frame.id)} className={`group relative aspect-[2/3] overflow-hidden rounded-xl border-2 bg-white/10 transition ${selectedId === frame.id ? "border-accent shadow-lg shadow-accent/30" : "border-white/10 hover:border-white/50"}`}><img src={frame.imageUrl} className="h-full w-full object-cover transition group-hover:scale-105" /><span className="absolute inset-x-0 bottom-0 truncate bg-black/65 px-1 py-1 text-[10px]">{frame.name}</span>{selectedId === frame.id && <span className="absolute right-1 top-1 rounded-full bg-accent px-1.5 py-0.5 text-[10px]">✓</span>}</button>)}
          </div>
          <button onClick={choose} className="kinetic-button mt-5 w-full rounded-2xl bg-accent px-5 py-4 font-display text-xl font-bold">Selanjutnya <span className="ml-2">→</span></button>
        </aside>
      </main>
    </div>
  );
}
