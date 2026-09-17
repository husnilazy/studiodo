import { useEffect, useState } from "react";
import { Link } from "wouter";
import { api } from "@/lib/api";
import { OUTPUT_PRESETS, useTemplateLibrary, type LocalTemplate, type OutputPreset, type TemplateCategory } from "@/lib/templateStore";
import type { Orientation } from "@/lib/sessionStore";
import TemplateEditor from "@/components/TemplateEditor";
import { useStickerLibrary } from "@/lib/stickerStore";

const categories: TemplateCategory[] = ["custom", "minimal", "wedding", "birthday", "corporate", "seasonal"];

export default function FrameManagement() {
  const { templates, addTemplate, removeTemplate } = useTemplateLibrary();
  const { stickers, addSticker, removeSticker } = useStickerLibrary();
  const [serverFrames, setServerFrames] = useState<LocalTemplate[]>([]);
  const [drafts, setDrafts] = useState<LocalTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refreshServerFrames = async () => {
    try {
      const results = await Promise.all([api.getFrames("portrait"), api.getFrames("landscape")]);
      const unique = new Map<string, LocalTemplate>();
      results.flat().filter((frame) => frame.kind === "template").forEach((frame) => unique.set(frame.id, {
        id: frame.id,
        name: frame.name,
        category: "custom",
        style: "Server template",
        orientation: frame.orientation === "landscape" ? "landscape" : "portrait",
        outputPreset: "4r",
        frameDataUrl: frame.imageUrl,
        canvasWidth: frame.canvasWidth ?? OUTPUT_PRESETS["4r"].width,
        canvasHeight: frame.canvasHeight ?? OUTPUT_PRESETS["4r"].height,
        slots: frame.slots ?? [],
      }));
      setServerFrames([...unique.values()]);
    } catch (error) {
      console.error("Gagal memuat frame server", error);
    }
  };

  useEffect(() => { refreshServerFrames(); }, []);

  const readFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).filter((file) => file.type === "image/png").forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => setDrafts((current) => [...current, {
        id: crypto.randomUUID(),
        name: file.name.replace(/\.png$/i, ""),
        category: "custom",
        style: "Custom",
        orientation: "portrait",
        outputPreset: "4r",
        frameDataUrl: String(reader.result),
        canvasWidth: OUTPUT_PRESETS["4r"].width,
        canvasHeight: OUTPUT_PRESETS["4r"].height,
        slots: [
          { x: 0.1, y: 0.08, w: 0.4, h: 0.4 * OUTPUT_PRESETS["4r"].width / OUTPUT_PRESETS["4r"].height / (4 / 3) },
          { x: 0.5, y: 0.08, w: 0.4, h: 0.4 * OUTPUT_PRESETS["4r"].width / OUTPUT_PRESETS["4r"].height / (4 / 3) },
          { x: 0.1, y: 0.5, w: 0.4, h: 0.4 * OUTPUT_PRESETS["4r"].width / OUTPUT_PRESETS["4r"].height / (4 / 3) },
        ],
      }]);
      reader.readAsDataURL(file);
    });
  };

  const patchDraft = (id: string, patch: Partial<LocalTemplate>) =>
    setDrafts((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));

  const saveDrafts = async () => {
    setSaving(true);
    setMessage("");
    try {
      for (const template of drafts) {
        addTemplate(template);
        await api.createFrame(template);
      }
      setDrafts([]);
      await refreshServerFrames();
      setMessage("Semua frame berhasil disimpan.");
    } catch (error) {
      console.error("Gagal menyimpan batch frame", error);
      setMessage("Sebagian frame gagal disimpan. Periksa koneksi server.");
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async (id: string) => {
    setDeletingId(id);
    setMessage("");
    try {
      await api.deleteFrame(id);
      removeTemplate(id);
      setServerFrames((current) => current.filter((template) => template.id !== id));
      setMessage("Frame berhasil dihapus dari server.");
    } catch (error) {
      console.error("Gagal hapus frame dari server", error);
      removeTemplate(id);
      setServerFrames((current) => current.filter((template) => template.id !== id));
      setMessage("Frame dihapus lokal (server tidak terjangkau).");
    } finally {
      setDeletingId(null);
    }
  };

  const updatePreset = (template: LocalTemplate, outputPreset: OutputPreset) => {
    if (outputPreset === "custom") {
      patchDraft(template.id, { outputPreset });
      return;
    }
    const preset = OUTPUT_PRESETS[outputPreset];
    patchDraft(template.id, { outputPreset, canvasWidth: preset.width, canvasHeight: preset.height });
  };

  const uploadSticker = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => addSticker({ id: crypto.randomUUID(), name: file.name.replace(/\.[^.]+$/, ""), category: "uploaded", dataUrl: String(reader.result) });
    reader.readAsDataURL(file);
  };

  const publishedTemplates = [...serverFrames, ...templates.filter((template) => !serverFrames.some((serverTemplate) => serverTemplate.id === template.id))];

  return (
    <div className="h-full overflow-y-auto bg-[var(--kiosk-background)] px-5 py-8 text-[var(--kiosk-text)] md:px-10">
      <header className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin" className="text-sm text-white/45 hover:text-white">← Admin OS</Link>
          <p className="eyebrow mt-6">ADMIN / FRAME STUDIO</p>
          <h1 className="mt-2 font-display text-4xl font-bold md:text-6xl">Manajemen Frame</h1>
          <p className="mt-2 max-w-2xl text-[var(--kiosk-muted)]">
            Upload banyak PNG sekaligus, atur kategori, warna style, ukuran output, dan sesuaikan lubang foto langsung di preview.
          </p>
        </div>
        <label className="cursor-pointer rounded-2xl bg-accent px-5 py-3 font-semibold shadow-lg shadow-accent/20">
          Upload batch PNG
          <input type="file" accept="image/png" multiple className="hidden" onChange={(event) => readFiles(event.target.files)} />
        </label>
      </header>

      {message && (
        <p className={`mx-auto mt-5 max-w-7xl rounded-xl border px-4 py-3 text-sm ${
          message.includes("gagal") || message.includes("tidak") || message.includes("lokal")
            ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
            : "border-accent/30 bg-accent/10 text-accent"
        }`}>
          {message}
        </p>
      )}

      {drafts.length > 0 && (
        <section className="mx-auto mt-8 max-w-7xl rounded-[2rem] border border-accent/30 bg-white/[0.04] p-5 md:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow">BATCH QUEUE</p>
              <h2 className="font-display text-2xl font-semibold">{drafts.length} frame siap diatur</h2>
            </div>
            <button onClick={saveDrafts} disabled={saving} className="rounded-xl bg-accent px-5 py-3 font-semibold shadow-lg shadow-accent/20 disabled:opacity-50">
              {saving ? "Menyimpan..." : "Simpan semua frame"}
            </button>
          </div>
          <div className="mt-5 space-y-5">
            {drafts.map((template) => (
              <article key={template.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="grid gap-4 lg:grid-cols-[minmax(260px,1fr)_320px]">
                  <TemplateEditor template={template} onChange={(patch) => patchDraft(template.id, patch)} />
                  <div className="space-y-3">
                    <label className="block text-sm text-white/55">
                      Nama frame
                      <input value={template.name} onChange={(event) => patchDraft(template.id, { name: event.target.value })} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white" />
                    </label>
                    <label className="block text-sm text-white/55">
                      Kategori
                      <select value={template.category} onChange={(event) => patchDraft(template.id, { category: event.target.value as TemplateCategory })} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white">
                        {categories.map((category) => <option key={category}>{category}</option>)}
                      </select>
                    </label>
                    <label className="block text-sm text-white/55">
                      Style / warna
                      <input value={template.style} onChange={(event) => patchDraft(template.id, { style: event.target.value })} placeholder="Contoh: Pastel pink, gold" className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white" />
                    </label>
                    <label className="block text-sm text-white/55">
                      Orientasi
                      <select value={template.orientation} onChange={(event) => patchDraft(template.id, { orientation: event.target.value as Orientation })} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white">
                        <option value="portrait">Portrait</option>
                        <option value="landscape">Landscape</option>
                      </select>
                    </label>
                    <label className="block text-sm text-white/55">
                      Resize / output
                      <select value={template.outputPreset} onChange={(event) => updatePreset(template, event.target.value as OutputPreset)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white">
                        {Object.entries(OUTPUT_PRESETS).map(([value, preset]) => <option key={value} value={value}>{preset.label}</option>)}
                      </select>
                    </label>
                    <button onClick={() => setDrafts((current) => current.filter((item) => item.id !== template.id))} className="text-sm text-red-300 hover:text-red-100">
                      Hapus dari antrean
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto mt-8 max-w-7xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="eyebrow">PUBLISHED LIBRARY</p>
            <h2 className="font-display text-3xl font-semibold">Frame aktif</h2>
          </div>
          <span className="rounded-full border border-white/15 px-3 py-1 text-sm text-white/45">{publishedTemplates.length} frame</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {publishedTemplates.map((template) => (
            <article key={template.id} className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] transition hover:border-white/25">
              <div className="relative h-56 overflow-hidden bg-black/30">
                <img src={template.frameDataUrl} alt={template.name} className="h-full w-full object-contain transition group-hover:scale-[1.02]" />
                <div className="absolute inset-0 flex items-end justify-end bg-gradient-to-t from-black/70 to-transparent p-3 opacity-0 transition group-hover:opacity-100">
                  <button
                    onClick={() => deleteTemplate(template.id)}
                    disabled={deletingId === template.id}
                    className="rounded-xl border border-red-400/40 bg-red-500/25 px-3 py-1.5 text-xs font-semibold text-red-200 backdrop-blur-sm hover:bg-red-500/50 disabled:opacity-50"
                  >
                    {deletingId === template.id ? "Menghapus..." : "🗑 Hapus frame"}
                  </button>
                </div>
              </div>
              <div className="p-4">
                <h3 className="font-semibold">{template.name}</h3>
                <p className="mt-1 text-xs text-white/45">{template.category} · {template.style}</p>
                <p className="mt-0.5 text-xs text-white/25">{template.orientation} · {template.outputPreset?.toUpperCase()} · {template.slots.length} slot</p>
              </div>
            </article>
          ))}
          {publishedTemplates.length === 0 && (
            <div className="col-span-full flex flex-col items-center gap-4 rounded-2xl border border-dashed border-white/15 py-20 text-center">
              <span className="text-6xl opacity-20">🖼</span>
              <div>
                <p className="font-semibold text-white/50">Belum ada frame</p>
                <p className="mt-1 text-sm text-white/30">Upload batch PNG di atas untuk mulai menambah frame kiosk.</p>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-7xl rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 md:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="eyebrow">STICKER LIBRARY</p><h2 className="font-display text-3xl font-semibold">Stiker lucu</h2><p className="mt-1 text-sm text-white/45">Stiker yang diupload akan langsung tersedia di editor foto kiosk.</p></div>
          <label className="cursor-pointer rounded-xl bg-accent px-4 py-3 text-sm font-semibold">Upload stiker<input type="file" accept="image/*" multiple className="hidden" onChange={(event) => Array.from(event.target.files ?? []).forEach(uploadSticker)} /></label>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-6 lg:grid-cols-8">
          {stickers.map((sticker) => <div key={sticker.id} className="group relative rounded-xl border border-white/10 bg-black/20 p-2"><img src={sticker.dataUrl} alt={sticker.name} className="h-20 w-full object-contain" /><button type="button" onClick={() => removeSticker(sticker.id)} className="absolute right-1 top-1 rounded bg-red-500/80 px-1.5 py-1 text-[10px] opacity-0 transition group-hover:opacity-100">Hapus</button><p className="mt-1 truncate text-center text-[10px] text-white/50">{sticker.name}</p></div>)}
          {stickers.length === 0 && <p className="col-span-full py-8 text-center text-sm text-white/40">Belum ada stiker. Upload PNG atau gambar transparan untuk dipakai customer.</p>}
        </div>
      </section>
    </div>
  );
}
