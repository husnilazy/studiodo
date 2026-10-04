import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "@/lib/api";
import { OUTPUT_PRESETS, useTemplateLibrary, type LocalTemplate, type OutputPreset } from "@/lib/templateStore";
import { useFrameCategories, hydrateFrameCategoriesFromServer } from "@/lib/frameCategoryStore";
import type { Orientation } from "@/lib/sessionStore";
import TemplateEditor from "@/components/TemplateEditor";
import { useStickerLibrary } from "@/lib/stickerStore";
import { fileToDataUrl } from "@/lib/imageDownscale";
import { useBoothConfig, type BoothConfig } from "@/lib/boothConfigStore";
import { renderPhotoStrip, STRIP_LAYOUT_LABELS, STRIP_TEMPLATE_LABELS } from "@/lib/stripRenderer";
import { panel, panelAccent, inputClass } from "@/lib/adminUi";
import { pushToast } from "@/lib/toastStore";
import Spinner from "@/components/Spinner";
import StopMotionFramePanel from "@/components/StopMotionFramePanel";

// Reused by the batch-draft editor and the single-template editor. Used to be
// a bare native <select> (the exact "old-fashioned app" look the admin called
// out) with "+ Kategori baru…" as a special option that revealed a separate
// input below it. Now a proper custom dropdown matching the rest of the
// admin's dark styling, with "+ Kategori baru…" as an inline row inside the
// same panel instead of a layout-shifting element bolted underneath.
// Registers into the shared category store (frameCategoryStore.ts), which
// PilihFrame.tsx also reads from, so a freshly-added category groups and
// labels correctly on the kiosk too.
function CategoryPicker({ value, onChange }: { value: string; onChange: (category: string) => void }) {
  const { categories, addCategory } = useFrameCategories();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setAdding(false);
        setNewLabel("");
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const currentLabel = categories.find((category) => category.key === value)?.label ?? value;

  const commitNew = () => {
    if (!newLabel.trim()) { setAdding(false); return; }
    const created = addCategory(newLabel);
    onChange(created.key);
    setNewLabel("");
    setAdding(false);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`mt-1 flex w-full items-center justify-between gap-2 rounded-xl border bg-black/30 px-3 py-2 text-left text-sm text-white transition ${open ? "border-accent" : "border-fg/10 hover:border-fg/25"}`}
      >
        <span className="truncate">{currentLabel || "Pilih kategori"}</span>
        <span className={`shrink-0 text-fg/40 transition-transform duration-200 ${open ? "-rotate-180" : ""}`}>⌄</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 origin-top overflow-hidden rounded-xl border border-white/10 bg-[#1c1720] shadow-2xl shadow-black/50 backdrop-blur-xl"
          >
            <div className="max-h-56 space-y-0.5 overflow-y-auto p-1.5">
              {categories.map((category) => (
                <button
                  key={category.key}
                  type="button"
                  onClick={() => { onChange(category.key); setOpen(false); }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${category.key === value ? "bg-accent/20 text-fg" : "text-fg/70 hover:bg-fg/5 hover:text-fg"}`}
                >
                  {category.label}
                  {category.key === value && <span className="text-accent">✓</span>}
                </button>
              ))}
            </div>
            <div className="border-t border-fg/10 p-1.5">
              {adding ? (
                <div className="flex gap-1.5 p-0.5">
                  <input
                    autoFocus
                    value={newLabel}
                    onChange={(event) => setNewLabel(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") { event.preventDefault(); commitNew(); }
                      if (event.key === "Escape") { setAdding(false); setNewLabel(""); }
                    }}
                    placeholder="Nama kategori baru"
                    className="min-w-0 flex-1 rounded-lg border border-accent/40 bg-black/30 px-2.5 py-1.5 text-sm text-white outline-none"
                  />
                  <button type="button" onClick={commitNew} className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold">Tambah</button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-accent transition hover:bg-accent/10"
                >
                  <span className="text-base leading-none">+</span> Kategori baru…
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function FrameManagement() {
  const { templates, addTemplate, removeTemplate } = useTemplateLibrary();
  const { stickers, addSticker, removeSticker } = useStickerLibrary();
  const { config, update } = useBoothConfig();
  const set = <K extends keyof BoothConfig>(key: K, value: BoothConfig[K]) => update({ [key]: value } as Partial<BoothConfig>);
  const stripPreviewRef = useRef<HTMLCanvasElement>(null);
  const [serverFrames, setServerFrames] = useState<LocalTemplate[]>([]);
  const [drafts, setDrafts] = useState<LocalTemplate[]>([]);
  const [savingDrafts, setSavingDrafts] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<LocalTemplate | null>(null);

  const refreshServerFrames = async () => {
    try {
      const results = await Promise.all([api.getFrames("portrait"), api.getFrames("landscape")]);
      const unique = new Map<string, LocalTemplate>();
      results.flatMap((result) => result ?? []).filter((frame) => frame.kind === "template").forEach((frame) => unique.set(frame.id, {
        id: frame.id,
        name: frame.name,
        category: frame.category ?? "custom",
        style: frame.style ?? "Server template",
        orientation: frame.orientation === "landscape" ? "landscape" : "portrait",
        outputPreset: frame.outputPreset ?? "4r",
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

  // Hydrate the tenant-wide category list from the server on load, so this
  // admin session sees categories added from any device, not just this browser.
  useEffect(() => { hydrateFrameCategoriesFromServer(); }, []);

  useEffect(() => {
    const canvas = stripPreviewRef.current;
    if (!canvas) return;
    const placeholderPhotos = ["#f472b6", "#60a5fa", "#34d399", "#fbbf24", "#a78bfa", "#f87171"].map((color) => {
      const c = document.createElement("canvas");
      c.width = 400;
      c.height = 300;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "bold 48px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("📷", c.width / 2, c.height / 2);
      return c.toDataURL("image/jpeg", 0.8);
    });
    const photoCount = config.stripLayout === "classic-3cut" ? 3 : config.stripLayout === "grid-2x2" ? 4 : 6;
    renderPhotoStrip(placeholderPhotos.slice(0, photoCount), canvas, {
      accentColor: config.accentColor,
      stripLayout: config.stripLayout,
      stripTemplate: config.stripTemplate,
      outputPreset: "4r",
      filter: "normal",
    }).catch((error) => console.error("Gagal render preview strip", error));
  }, [config.stripLayout, config.stripTemplate, config.accentColor]);

  const readFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files).filter((file) => file.type === "image/png")) {
      try {
        const frameDataUrl = await fileToDataUrl(file);
        setDrafts((current) => [...current, {
          id: crypto.randomUUID(),
          name: file.name.replace(/\.png$/i, ""),
          category: "custom",
          style: "Custom",
          orientation: "portrait",
          outputPreset: "4r",
          frameDataUrl,
          canvasWidth: OUTPUT_PRESETS["4r"].width,
          canvasHeight: OUTPUT_PRESETS["4r"].height,
          slots: [
            { x: 0.1, y: 0.08, w: 0.4, h: 0.4 * OUTPUT_PRESETS["4r"].width / OUTPUT_PRESETS["4r"].height / (4 / 3) },
            { x: 0.5, y: 0.08, w: 0.4, h: 0.4 * OUTPUT_PRESETS["4r"].width / OUTPUT_PRESETS["4r"].height / (4 / 3) },
            { x: 0.1, y: 0.5, w: 0.4, h: 0.4 * OUTPUT_PRESETS["4r"].width / OUTPUT_PRESETS["4r"].height / (4 / 3) },
          ],
        }]);
      } catch (error) {
        console.error("Gagal memproses gambar frame", file.name, error);
        pushToast({ type: "error", title: "Gagal membaca file", sub: `"${file.name}" bukan gambar PNG yang valid.` });
      }
    }
  };

  const patchDraft = (id: string, patch: Partial<LocalTemplate>) =>
    setDrafts((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));

  const saveDrafts = async () => {
    setSavingDrafts(true);
    try {
      for (const template of drafts) {
        await api.createFrame(template);
        addTemplate(template);
      }
      setDrafts([]);
      await refreshServerFrames();
      pushToast({ type: "success", title: "Semua frame berhasil disimpan" });
    } catch (error) {
      console.error("Gagal menyimpan batch frame", error);
      pushToast({ type: "error", title: "Sebagian frame gagal disimpan", sub: error instanceof Error ? error.message : "Periksa koneksi server." });
    } finally {
      setSavingDrafts(false);
    }
  };

  const saveEditedTemplate = async () => {
    if (!editingTemplate) return;
    setSavingEdit(true);
    try {
      await api.updateFrame(editingTemplate.id, {
        name: editingTemplate.name,
        category: editingTemplate.category,
        style: editingTemplate.style,
        orientation: editingTemplate.orientation,
        outputPreset: editingTemplate.outputPreset,
        frameImageUrl: editingTemplate.frameDataUrl,
        slots: editingTemplate.slots,
        canvasWidth: editingTemplate.canvasWidth,
        canvasHeight: editingTemplate.canvasHeight,
      });
      await refreshServerFrames();
      setEditingTemplate(null);
      pushToast({ type: "success", title: "Frame berhasil diperbarui" });
    } catch (error) {
      console.error("Gagal memperbarui frame", error);
      pushToast({ type: "error", title: "Frame gagal diperbarui", sub: "Periksa koneksi server." });
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteTemplate = async (id: string) => {
    setDeletingId(id);
    try {
      await api.deleteFrame(id);
      removeTemplate(id);
      setServerFrames((current) => current.filter((template) => template.id !== id));
      pushToast({ type: "success", title: "Frame berhasil dihapus dari server" });
    } catch (error) {
      console.error("Gagal hapus frame dari server", error);
      removeTemplate(id);
      setServerFrames((current) => current.filter((template) => template.id !== id));
      pushToast({ type: "info", title: "Frame dihapus lokal", sub: "Server tidak terjangkau — akan tetap hilang dari daftar ini." });
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
  const { categories: knownCategories } = useFrameCategories();
  // Grouped in the same order as the category registry, with anything tagged
  // by a category that's since fallen out of that list (e.g. an older frame
  // from before this feature) collected into "Lainnya" instead of vanishing.
  const groupedTemplates = useMemo(() => {
    const groups = new Map<string, LocalTemplate[]>();
    for (const template of publishedTemplates) {
      const key = template.category || "custom";
      groups.set(key, [...(groups.get(key) ?? []), template]);
    }
    const ordered = knownCategories
      .filter((category) => groups.has(category.key))
      .map((category) => ({ key: category.key, label: category.label, items: groups.get(category.key)! }));
    const known = new Set(knownCategories.map((category) => category.key));
    const rest = [...groups.entries()].filter(([key]) => !known.has(key));
    if (rest.length > 0) {
      ordered.push({ key: "__other__", label: "Lainnya", items: rest.flatMap(([, items]) => items) });
    }
    return ordered;
  }, [publishedTemplates, knownCategories]);

  // "Semua" by default; picking a pill narrows the Published Library render
  // below to just that group, so finding a category no longer means scrolling
  // past every group before it. Resets to "Semua" if the active filter's
  // category no longer has any frames (e.g. its last frame was deleted).
  const [categoryFilter, setCategoryFilter] = useState("__all__");
  useEffect(() => {
    if (categoryFilter !== "__all__" && !groupedTemplates.some((group) => group.key === categoryFilter)) {
      setCategoryFilter("__all__");
    }
  }, [categoryFilter, groupedTemplates]);
  const visibleGroups = categoryFilter === "__all__" ? groupedTemplates : groupedTemplates.filter((group) => group.key === categoryFilter);

  return (
    <div className="h-full overflow-y-auto bg-[var(--kiosk-background)] px-5 py-8 text-[var(--kiosk-text)] md:px-10">
      <header className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin" className="text-sm text-fg/45 hover:text-fg">← Admin OS</Link>
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

      {drafts.length > 0 && (
        <section className={`mx-auto mt-8 max-w-7xl ${panelAccent} md:p-7`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow">BATCH QUEUE</p>
              <h2 className="font-display text-2xl font-semibold">{drafts.length} frame siap diatur</h2>
            </div>
            <button onClick={saveDrafts} disabled={savingDrafts} className="flex items-center gap-2 rounded-xl bg-accent px-5 py-3 font-semibold shadow-lg shadow-accent/20 disabled:opacity-50">
              {savingDrafts && <Spinner size="sm" />}
              {savingDrafts ? "Menyimpan…" : "Simpan semua frame"}
            </button>
          </div>
          <div className="mt-5 space-y-5">
            {drafts.map((template) => (
              <article key={template.id} className="rounded-2xl border border-fg/10 bg-fg/5 p-4">
                <div className="grid gap-4 lg:grid-cols-[minmax(260px,1fr)_320px]">
                  <TemplateEditor template={template} onChange={(patch) => patchDraft(template.id, patch)} />
                  <div className="space-y-3">
                    <label className="block text-sm text-fg/55">
                      Nama frame
                      <input value={template.name} onChange={(event) => patchDraft(template.id, { name: event.target.value })} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white" />
                    </label>
                    <label className="block text-sm text-fg/55">
                      Kategori
                      <CategoryPicker value={template.category} onChange={(category) => patchDraft(template.id, { category })} />
                    </label>
                    <label className="block text-sm text-fg/55">
                      Style / warna
                      <input value={template.style} onChange={(event) => patchDraft(template.id, { style: event.target.value })} placeholder="Contoh: Pastel pink, gold" className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white" />
                    </label>
                    <label className="block text-sm text-fg/55">
                      Orientasi
                      <select value={template.orientation} onChange={(event) => patchDraft(template.id, { orientation: event.target.value as Orientation })} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white">
                        <option value="portrait">Portrait</option>
                        <option value="landscape">Landscape</option>
                      </select>
                    </label>
                    <label className="block text-sm text-fg/55">
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

      {editingTemplate && (
        <section className={`mx-auto mt-8 max-w-7xl ${panelAccent} md:p-7`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="eyebrow">EDIT FRAME</p><h2 className="font-display text-2xl font-semibold">Edit {editingTemplate.name}</h2></div>
            <div className="flex gap-2"><button onClick={() => setEditingTemplate(null)} className="rounded-xl border border-fg/15 px-4 py-2 text-sm text-fg/60">Batal</button><button onClick={saveEditedTemplate} disabled={savingEdit} className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold disabled:opacity-50">{savingEdit && <Spinner size="sm" />}{savingEdit ? "Menyimpan…" : "Simpan perubahan"}</button></div>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(260px,1fr)_320px]">
            <TemplateEditor template={editingTemplate} onChange={(patch) => setEditingTemplate((current) => current ? { ...current, ...patch } : current)} />
            <div className="space-y-3">
              <label className="block text-sm text-fg/55">Nama frame<input value={editingTemplate.name} onChange={(event) => setEditingTemplate({ ...editingTemplate, name: event.target.value })} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white" /></label>
              <label className="block text-sm text-fg/55">Kategori<CategoryPicker value={editingTemplate.category} onChange={(category) => setEditingTemplate({ ...editingTemplate, category })} /></label>
              <label className="block text-sm text-fg/55">Style / warna<input value={editingTemplate.style} onChange={(event) => setEditingTemplate({ ...editingTemplate, style: event.target.value })} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white" /></label>
              <label className="block text-sm text-fg/55">Orientasi<select value={editingTemplate.orientation} onChange={(event) => setEditingTemplate({ ...editingTemplate, orientation: event.target.value as Orientation })} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
              <label className="block text-sm text-fg/55">Resize / output<select value={editingTemplate.outputPreset} onChange={(event) => { const outputPreset = event.target.value as OutputPreset; const preset = outputPreset === "custom" ? null : OUTPUT_PRESETS[outputPreset]; setEditingTemplate({ ...editingTemplate, outputPreset, ...(preset ? { canvasWidth: preset.width, canvasHeight: preset.height } : {}) }); }} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white">{Object.entries(OUTPUT_PRESETS).map(([value, preset]) => <option key={value} value={value}>{preset.label}</option>)}</select></label>
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto mt-8 max-w-7xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="eyebrow">PUBLISHED LIBRARY</p>
            <h2 className="font-display text-3xl font-semibold">Frame aktif</h2>
          </div>
          <span className="rounded-full border border-fg/15 px-3 py-1 text-sm text-fg/45">{publishedTemplates.length} frame</span>
        </div>
        {groupedTemplates.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCategoryFilter("__all__")}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${categoryFilter === "__all__" ? "border-accent bg-accent/15 text-fg" : "border-fg/15 text-fg/55 hover:border-fg/35 hover:text-fg"}`}
            >
              Semua <span className="text-fg/40">({publishedTemplates.length})</span>
            </button>
            {groupedTemplates.map((group) => (
              <button
                key={group.key}
                type="button"
                onClick={() => setCategoryFilter(group.key)}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${categoryFilter === group.key ? "border-accent bg-accent/15 text-fg" : "border-fg/15 text-fg/55 hover:border-fg/35 hover:text-fg"}`}
              >
                {group.label} <span className="text-fg/40">({group.items.length})</span>
              </button>
            ))}
          </div>
        )}
        <div className="space-y-8">
          {visibleGroups.map((group) => (
            <div key={group.key}>
              <div className="mb-3 flex items-center gap-2">
                <h3 className="font-display text-lg font-semibold">{group.label}</h3>
                <span className="rounded-full border border-fg/10 px-2 py-0.5 text-xs text-fg/40">{group.items.length}</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {group.items.map((template) => (
                  <article key={template.id} className="group overflow-hidden rounded-2xl border border-fg/10 bg-fg/[0.04] transition hover:border-fg/25">
                    <div className="relative h-56 overflow-hidden bg-black/30">
                      <img src={template.frameDataUrl} alt={template.name} className="h-full w-full object-contain transition group-hover:scale-[1.02]" />
                      <div className="absolute inset-0 flex items-end justify-end bg-gradient-to-t from-black/70 to-transparent p-3 opacity-0 transition group-hover:opacity-100">
                        <button onClick={() => setEditingTemplate(template)} className="mr-2 rounded-xl border border-accent/40 bg-accent/25 px-3 py-1.5 text-xs font-semibold text-accent backdrop-blur-sm hover:bg-accent/50">
                          Edit frame
                        </button>
                        <button
                          onClick={() => deleteTemplate(template.id)}
                          disabled={deletingId === template.id}
                          className="flex items-center gap-1.5 rounded-xl border border-red-400/40 bg-red-500/25 px-3 py-1.5 text-xs font-semibold text-red-200 backdrop-blur-sm hover:bg-red-500/50 disabled:opacity-50"
                        >
                          {deletingId === template.id && <Spinner size="sm" />}
                          {deletingId === template.id ? "Menghapus…" : "🗑 Hapus frame"}
                        </button>
                      </div>
                    </div>
                    <div className="p-4">
                      <h3 className="font-semibold">{template.name}</h3>
                      <p className="mt-1 text-xs text-fg/45">{template.category} · {template.style}</p>
                      <p className="mt-0.5 text-xs text-fg/25">{template.orientation} · {template.outputPreset?.toUpperCase()} · {template.slots.length} slot</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
          {publishedTemplates.length === 0 && (
            <div className="col-span-full flex flex-col items-center gap-4 rounded-2xl border border-dashed border-fg/15 py-20 text-center">
              <span className="text-6xl opacity-20">🖼</span>
              <div>
                <p className="font-semibold text-fg/50">Belum ada frame</p>
                <p className="mt-1 text-sm text-fg/30">Upload batch PNG di atas untuk mulai menambah frame kiosk.</p>
              </div>
            </div>
          )}
        </div>
      </section>

      <StopMotionFramePanel />

      <section className={`mx-auto mt-8 max-w-7xl ${panel} md:p-7`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="eyebrow">STIKER KHUSUS BOOTH</p><h2 className="font-display text-3xl font-semibold">Stiker milik booth</h2><p className="mt-1 text-sm text-fg/55">Paket emoji, lencana teks, dan bentuk sudah otomatis ada di editor foto kiosk. Di sini kamu bisa menambah stiker sendiri (logo, maskot, PNG transparan) yang muncul di kategori “Milik booth”.</p></div>
          <label className="k-btn k-btn-accent cursor-pointer !min-h-0 !py-2.5 !text-sm">Upload stiker<input type="file" accept="image/*" multiple className="hidden" onChange={(event) => Array.from(event.target.files ?? []).forEach(uploadSticker)} /></label>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-6 lg:grid-cols-8">
          {stickers.map((sticker) => <div key={sticker.id} className="group relative rounded-xl border border-fg/10 bg-fg/5 p-2"><img src={sticker.dataUrl} alt={sticker.name} className="h-20 w-full object-contain" /><button type="button" onClick={() => removeSticker(sticker.id)} className="absolute right-1 top-1 rounded bg-red-500/80 px-1.5 py-1 text-[10px] opacity-0 transition group-hover:opacity-100">Hapus</button><p className="mt-1 truncate text-center text-[10px] text-fg/50">{sticker.name}</p></div>)}
          {stickers.length === 0 && <p className="col-span-full py-8 text-center text-sm text-fg/40">Belum ada stiker khusus. Upload PNG transparan jika ingin menambah logo atau maskot booth.</p>}
        </div>
      </section>

      <section className={`mx-auto mt-8 max-w-7xl ${panel} md:p-7`}>
        <p className="eyebrow">CAPTURE OUTPUT</p>
        <h2 className="font-display text-2xl font-semibold">Output & Capture</h2>
        <div className="mt-4 space-y-4">
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={config.outputPresetEnabled} onChange={(event) => set("outputPresetEnabled", event.target.checked)} /><span>Aktifkan pilihan ukuran output (4R, 2R, A4)</span></label>
          <label className="block max-w-xs text-sm text-fg/60">
            Maksimal foto dalam satu sesi
            <input type="number" min={1} max={50} className={inputClass} value={config.maxPhotosPerSession} onChange={(event) => set("maxPhotosPerSession", Math.max(1, Math.min(50, Number(event.target.value))))} />
          </label>
          <p className="text-xs text-fg/45">Jumlah foto paket tetap menjadi default; nilai ini menjadi batas maksimal agar sesi tidak melebihi kuota capture admin.</p>
        </div>
      </section>

      <section className={`mx-auto mt-8 max-w-7xl ${panel} md:p-7`}>
        <p className="eyebrow">PRINT LAYOUT</p>
        <h2 className="font-display text-2xl font-semibold">Layout & Visual Strip</h2>
        <p className="mt-1 text-sm text-fg/45">Susunan foto (layout) dan tema warna/border (visual template) dipakai di halaman Hasil dan saat cetak.</p>
        <div className="mt-4 grid gap-5 md:grid-cols-[280px_1fr]">
          <div className="mx-auto w-full max-w-[220px]">
            <canvas ref={stripPreviewRef} className="w-full rounded-xl border border-fg/10 shadow-lg" />
            <p className="mt-2 text-center text-xs text-fg/40">Live preview (foto contoh)</p>
          </div>
          <div className="space-y-4">
            <label className="block text-sm text-fg/60">
              Layout foto
              <select className={inputClass} value={config.stripLayout} onChange={(e) => set("stripLayout", e.target.value as BoothConfig["stripLayout"])}>
                {Object.entries(STRIP_LAYOUT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="block text-sm text-fg/60">
              Visual template
              <select className={inputClass} value={config.stripTemplate} onChange={(e) => set("stripTemplate", e.target.value as BoothConfig["stripTemplate"])}>
                {Object.entries(STRIP_TEMPLATE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <p className="text-xs text-fg/45">Warna aksen di visual template (Neon Glow, gradient, footer bar) mengikuti warna aksen di Kustomisasi Kiosk.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
