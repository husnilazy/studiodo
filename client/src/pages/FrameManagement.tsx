import { useState } from "react";
import { Link } from "wouter";
import { api } from "@/lib/api";
import { OUTPUT_PRESETS, useTemplateLibrary, type LocalTemplate, type OutputPreset, type TemplateCategory } from "@/lib/templateStore";
import type { Orientation } from "@/lib/sessionStore";
import TemplateEditor from "@/components/TemplateEditor";

const categories: TemplateCategory[] = ["custom", "minimal", "wedding", "birthday", "corporate", "seasonal"];

export default function FrameManagement() {
  const { templates, addTemplate, updateTemplate, removeTemplate } = useTemplateLibrary();
  const [drafts, setDrafts] = useState<LocalTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

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
        slots: [{ x: 0.1, y: 0.08, w: 0.4, h: 0.4 * OUTPUT_PRESETS["4r"].width / OUTPUT_PRESETS["4r"].height / (4 / 3) }, { x: 0.5, y: 0.08, w: 0.4, h: 0.4 * OUTPUT_PRESETS["4r"].width / OUTPUT_PRESETS["4r"].height / (4 / 3) }, { x: 0.1, y: 0.5, w: 0.4, h: 0.4 * OUTPUT_PRESETS["4r"].width / OUTPUT_PRESETS["4r"].height / (4 / 3) }],
      }]);
      reader.readAsDataURL(file);
    });
  };

  const patchDraft = (id: string, patch: Partial<LocalTemplate>) => setDrafts((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));

  const saveDrafts = async () => {
    setSaving(true);
    setMessage("");
    try {
      for (const template of drafts) {
        addTemplate(template);
        await api.createFrame(template);
      }
      setDrafts([]);
      setMessage("Semua frame berhasil disimpan.");
    } catch (error) {
      console.error("Gagal menyimpan batch frame", error);
      setMessage("Sebagian frame gagal disimpan. Periksa koneksi server.");
    } finally {
      setSaving(false);
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

  return (
    <div className="h-full overflow-y-auto bg-[var(--kiosk-background)] px-5 py-8 text-[var(--kiosk-text)] md:px-10">
      <header className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin" className="text-sm text-white/45 hover:text-white">← Admin OS</Link>
          <p className="eyebrow mt-6">ADMIN / FRAME STUDIO</p>
          <h1 className="mt-2 font-display text-4xl font-bold md:text-6xl">Manajemen Frame</h1>
          <p className="mt-2 max-w-2xl text-[var(--kiosk-muted)]">Upload banyak PNG sekaligus, atur kategori, warna style, ukuran output, dan sesuaikan lubang foto langsung di preview.</p>
        </div>
        <label className="cursor-pointer rounded-2xl bg-accent px-5 py-3 font-semibold shadow-lg shadow-accent/20">
          Upload batch PNG
          <input type="file" accept="image/png" multiple className="hidden" onChange={(event) => readFiles(event.target.files)} />
        </label>
      </header>

      {message && <p className="mx-auto mt-5 max-w-7xl rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">{message}</p>}

      {drafts.length > 0 && (
        <section className="mx-auto mt-8 max-w-7xl rounded-[2rem] border border-accent/30 bg-white/[0.04] p-5 md:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="eyebrow">BATCH QUEUE</p><h2 className="font-display text-2xl font-semibold">{drafts.length} frame siap diatur</h2></div>
            <button onClick={saveDrafts} disabled={saving} className="rounded-xl bg-accent px-5 py-3 font-semibold disabled:opacity-50">{saving ? "Menyimpan..." : "Simpan semua frame"}</button>
          </div>
          <div className="mt-5 space-y-5">
            {drafts.map((template) => (
              <article key={template.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="grid gap-4 lg:grid-cols-[minmax(260px,1fr)_320px]">
                  <TemplateEditor template={template} onChange={(patch) => patchDraft(template.id, patch)} />
                  <div className="space-y-3">
                    <label className="block text-sm text-white/55">Nama frame<input value={template.name} onChange={(event) => patchDraft(template.id, { name: event.target.value })} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white" /></label>
                    <label className="block text-sm text-white/55">Kategori<select value={template.category} onChange={(event) => patchDraft(template.id, { category: event.target.value as TemplateCategory })} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white">{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
                    <label className="block text-sm text-white/55">Style / warna<input value={template.style} onChange={(event) => patchDraft(template.id, { style: event.target.value })} placeholder="Contoh: Pastel pink, gold" className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white" /></label>
                    <label className="block text-sm text-white/55">Orientasi<select value={template.orientation} onChange={(event) => patchDraft(template.id, { orientation: event.target.value as Orientation })} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
                    <label className="block text-sm text-white/55">Resize / output<select value={template.outputPreset} onChange={(event) => updatePreset(template, event.target.value as OutputPreset)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white">{Object.entries(OUTPUT_PRESETS).map(([value, preset]) => <option key={value} value={value}>{preset.label}</option>)}</select></label>
                    <button onClick={() => setDrafts((current) => current.filter((item) => item.id !== template.id))} className="text-sm text-red-300">Hapus dari antrean</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto mt-8 max-w-7xl">
        <div className="mb-4 flex items-center justify-between"><div><p className="eyebrow">PUBLISHED LIBRARY</p><h2 className="font-display text-3xl font-semibold">Frame aktif</h2></div><span className="text-sm text-white/45">{templates.length} frame</span></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {templates.map((template) => <article key={template.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]"><img src={template.frameDataUrl} className="h-56 w-full bg-black/30 object-contain" /><div className="p-4"><h3 className="font-semibold">{template.name}</h3><p className="mt-1 text-xs text-white/45">{template.category} · {template.style}</p><button onClick={() => removeTemplate(template.id)} className="mt-3 text-xs text-red-300">Hapus lokal</button></div></article>)}
          {templates.length === 0 && <p className="text-sm text-white/45">Belum ada frame lokal. Upload batch PNG untuk mulai.</p>}
        </div>
      </section>
    </div>
  );
}
