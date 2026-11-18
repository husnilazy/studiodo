import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Icon } from "@/components/kiosk/Icons";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "@/lib/api";
import { OUTPUT_PRESETS, orientCanvas, presetSize, useTemplateLibrary, type LocalTemplate, type OutputPreset } from "@/lib/templateStore";
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
import Select from "@/components/Select";

// Reused by the batch-draft editor and the single-template editor. Used to be
// a bare native <Select> (the exact "old-fashioned app" look the admin called
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

const fieldClass = "mt-1 w-full rounded-xl border border-fg/10 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-accent";

/** Little page-shaped icon so "Portrait" / "Landscape" read at a glance. */
function OrientationGlyph({ orientation, className = "" }: { orientation: Orientation; className?: string }) {
  return <span className={`inline-block shrink-0 rounded-[3px] border-2 border-current ${className}`} style={orientation === "landscape" ? { width: 18, height: 12 } : { width: 12, height: 18 }} />;
}

function OrientationToggle({ value, onChange }: { value: Orientation; onChange: (orientation: Orientation) => void }) {
  return (
    <div className="mt-1 grid grid-cols-2 gap-1 rounded-xl border border-fg/10 bg-black/30 p-1">
      {(["portrait", "landscape"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={value === option}
          className={`flex items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${value === option ? "bg-accent text-white shadow" : "text-fg/55 hover:bg-fg/10 hover:text-fg"}`}
        >
          <OrientationGlyph orientation={option} />
          {option === "portrait" ? "Portrait" : "Landscape"}
        </button>
      ))}
    </div>
  );
}

// One form for both the upload queue and the edit pop-up. Orientation and output size are tied together here: picking
// "Landscape" turns the canvas sideways (1200×1800 → 1800×1200), picking a size keeps the chosen orientation. Before,
// the two were independent, so a "landscape" frame kept a portrait canvas and rendered/printed squashed.
function FrameDetailsForm({ template, onChange }: { template: LocalTemplate; onChange: (patch: Partial<LocalTemplate>) => void }) {
  const setOrientation = (orientation: Orientation) => {
    const canvas = orientCanvas(template.canvasWidth, template.canvasHeight, orientation);
    onChange({ orientation, canvasWidth: canvas.width, canvasHeight: canvas.height });
  };
  const setPreset = (outputPreset: OutputPreset) => {
    if (outputPreset === "custom") { onChange({ outputPreset }); return; }
    const size = presetSize(outputPreset, template.orientation);
    onChange({ outputPreset, canvasWidth: size.width, canvasHeight: size.height });
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1fr_1.2fr_1.2fr]">
      <label className="block text-xs font-medium text-fg/55">Nama frame
        <input value={template.name} onChange={(event) => onChange({ name: event.target.value })} className={fieldClass} />
      </label>
      <label className="block text-xs font-medium text-fg/55">Kategori
        <CategoryPicker value={template.category} onChange={(category) => onChange({ category })} />
      </label>
      <label className="block text-xs font-medium text-fg/55">Style / warna
        <input value={template.style} onChange={(event) => onChange({ style: event.target.value })} placeholder="Pastel pink, gold…" className={fieldClass} />
      </label>
      <div className="block text-xs font-medium text-fg/55">Orientasi
        <OrientationToggle value={template.orientation} onChange={setOrientation} />
      </div>
      <label className="block text-xs font-medium text-fg/55">Ukuran cetak
        <Select value={template.outputPreset} onChange={(event) => setPreset(event.target.value as OutputPreset)} className={fieldClass}>
          {Object.entries(OUTPUT_PRESETS).map(([value, preset]) => <option key={value} value={value}>{preset.label}</option>)}
        </Select>
        <span className="mt-1 block text-[11px] text-fg/35">Kanvas {template.canvasWidth} × {template.canvasHeight} px</span>
      </label>
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
        // The PNG's own shape decides the orientation, so a wide design is never silently saved as a portrait frame.
        const bitmap = await createImageBitmap(file);
        const orientation: Orientation = bitmap.width > bitmap.height ? "landscape" : "portrait";
        bitmap.close();
        const size = presetSize("4r", orientation);
        const slotH = 0.4 * size.width / size.height / (4 / 3);
        setDrafts((current) => [...current, {
          id: crypto.randomUUID(),
          name: file.name.replace(/\.png$/i, ""),
          category: "custom",
          style: "Custom",
          orientation,
          outputPreset: "4r",
          frameDataUrl,
          canvasWidth: size.width,
          canvasHeight: size.height,
          slots: orientation === "landscape"
            ? [
                { x: 0.08, y: (1 - slotH) / 2, w: 0.4, h: slotH },
                { x: 0.52, y: (1 - slotH) / 2, w: 0.4, h: slotH },
              ]
            : [
                { x: 0.1, y: 0.08, w: 0.4, h: slotH },
                { x: 0.5, y: 0.08, w: 0.4, h: slotH },
                { x: 0.1, y: 0.5, w: 0.4, h: slotH },
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
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"frames" | "stopmotion" | "stickers" | "output">("frames");
  useEffect(() => {
    if (categoryFilter !== "__all__" && !groupedTemplates.some((group) => group.key === categoryFilter)) {
      setCategoryFilter("__all__");
    }
  }, [categoryFilter, groupedTemplates]);
  const searchTerm = search.trim().toLowerCase();
  const [orientationFilter, setOrientationFilter] = useState<"all" | Orientation>("all");
  const orientationCounts = useMemo(() => ({
    all: publishedTemplates.length,
    portrait: publishedTemplates.filter((template) => template.orientation !== "landscape").length,
    landscape: publishedTemplates.filter((template) => template.orientation === "landscape").length,
  }), [publishedTemplates]);
  const visibleTemplates = useMemo(() => {
    let pool = categoryFilter === "__all__" ? publishedTemplates : (groupedTemplates.find((group) => group.key === categoryFilter)?.items ?? []);
    if (orientationFilter !== "all") pool = pool.filter((template) => (template.orientation === "landscape" ? "landscape" : "portrait") === orientationFilter);
    if (!searchTerm) return pool;
    return pool.filter((template) => `${template.name} ${template.style} ${template.category}`.toLowerCase().includes(searchTerm));
  }, [publishedTemplates, groupedTemplates, categoryFilter, orientationFilter, searchTerm]);
  const TABS = [
    { id: "frames", label: "Frame", count: publishedTemplates.length },
    { id: "stopmotion", label: "Stop Motion" },
    { id: "stickers", label: "Stiker", count: stickers.length },
    { id: "output", label: "Output & Layout" },
  ] as const;

  return (
    <div className="h-full overflow-y-auto bg-[var(--kiosk-background)] px-5 py-8 text-[var(--kiosk-text)] md:px-10">
      <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/admin" className="inline-flex items-center gap-2 rounded-full border border-fg/15 bg-surface px-4 py-2 text-sm font-semibold text-fg/80 shadow-sm transition hover:border-accent hover:text-fg"><Icon name="arrow-left" className="h-4 w-4" />Kembali ke Admin</Link>
          <h1 className="mt-2 font-display text-3xl font-bold md:text-4xl">Manajemen Frame</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--kiosk-muted)]">Kelola frame, stop motion, stiker, dan output strip dalam satu tempat.</p>
        </div>
        <label className="cursor-pointer rounded-2xl bg-accent px-5 py-3 font-semibold shadow-lg shadow-accent/20">
          + Upload batch PNG
          <input type="file" accept="image/png" multiple className="hidden" onChange={(event) => { setTab("frames"); readFiles(event.target.files); event.target.value = ""; }} />
        </label>
      </header>

      <nav className="sticky top-0 z-20 -mx-5 mt-5 border-b border-fg/10 bg-[var(--kiosk-background)]/90 px-5 backdrop-blur md:-mx-10 md:px-10">
        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto">
          {TABS.map((item) => (
            <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`relative shrink-0 px-4 py-3 text-sm font-semibold transition ${tab === item.id ? "text-fg" : "text-fg/50 hover:text-fg"}`}>
              {item.label}{"count" in item && <span className="ml-1.5 rounded-full bg-fg/10 px-2 py-0.5 text-[11px] font-medium text-fg/60">{item.count}</span>}
              {tab === item.id && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-accent" />}
            </button>
          ))}
        </div>
      </nav>

      {tab === "frames" && drafts.length > 0 && (
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
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-sm font-semibold"><OrientationGlyph orientation={template.orientation} className="text-accent" />{template.name || "Frame baru"}</p>
                  <button onClick={() => setDrafts((current) => current.filter((item) => item.id !== template.id))} className="text-xs text-red-300 hover:text-red-100">Hapus dari antrean</button>
                </div>
                <FrameDetailsForm template={template} onChange={(patch) => patchDraft(template.id, patch)} />
                <TemplateEditor template={template} onChange={(patch) => patchDraft(template.id, patch)} />
              </article>
            ))}
          </div>
        </section>
      )}

      {editingTemplate && (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:p-8">
        <section className={`w-full max-w-6xl ${panelAccent} !bg-[var(--kiosk-background)] md:p-7`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="eyebrow">EDIT FRAME</p><h2 className="font-display text-2xl font-semibold">Edit {editingTemplate.name}</h2></div>
            <div className="flex gap-2"><button onClick={() => setEditingTemplate(null)} className="rounded-xl border border-fg/15 px-4 py-2 text-sm text-fg/60">Batal</button><button onClick={saveEditedTemplate} disabled={savingEdit} className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold disabled:opacity-50">{savingEdit && <Spinner size="sm" />}{savingEdit ? "Menyimpan…" : "Simpan perubahan"}</button></div>
          </div>
          <div className="mt-5">
            <FrameDetailsForm template={editingTemplate} onChange={(patch) => setEditingTemplate((current) => current ? { ...current, ...patch } : current)} />
            <TemplateEditor template={editingTemplate} onChange={(patch) => setEditingTemplate((current) => current ? { ...current, ...patch } : current)} />
          </div>
        </section>
        </div>
      )}

      {tab === "frames" && <section className="mx-auto mt-6 max-w-7xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="eyebrow">PUBLISHED LIBRARY</p>
            <h2 className="font-display text-3xl font-semibold">Frame aktif</h2>
          </div>
          <span className="rounded-full border border-fg/15 px-3 py-1 text-sm text-fg/45">{publishedTemplates.length} frame</span>
        </div>
        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          {/* Category rail: stays beside the grid instead of stacking above it, so other tabs/sections are never pushed off-screen. */}
          <aside className="lg:sticky lg:top-16 lg:self-start">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari frame…" className="mb-3 w-full rounded-xl border border-fg/15 bg-fg/[0.05] px-3 py-2 text-sm outline-none focus:border-accent" />
            <div className="flex gap-1.5 overflow-x-auto pb-1 lg:max-h-[calc(100vh-190px)] lg:flex-col lg:overflow-y-auto lg:overflow-x-visible">
              {[{ key: "__all__", label: "Semua", count: publishedTemplates.length }, ...groupedTemplates.map((group) => ({ key: group.key, label: group.label, count: group.items.length }))].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setCategoryFilter(item.key)}
                  className={`flex shrink-0 items-center justify-between gap-3 rounded-xl border px-3.5 py-2 text-left text-sm font-medium transition ${categoryFilter === item.key ? "border-accent bg-accent/15 text-fg" : "border-transparent text-fg/55 hover:bg-fg/[0.06] hover:text-fg"}`}
                >
                  <span className="truncate">{item.label}</span>
                  <span className="text-xs text-fg/40">{item.count}</span>
                </button>
              ))}
            </div>
          </aside>
          <div>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {([["all", "Semua"], ["portrait", "Portrait"], ["landscape", "Landscape"]] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setOrientationFilter(key)}
                  className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${orientationFilter === key ? "border-accent bg-accent/15 text-fg" : "border-fg/10 text-fg/55 hover:border-fg/25 hover:text-fg"}`}
                >
                  {key !== "all" && <OrientationGlyph orientation={key} />}
                  {label}
                  <span className="text-xs text-fg/40">{orientationCounts[key]}</span>
                </button>
              ))}
            </div>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
              {visibleTemplates.map((template) => (
                <article key={template.id} className="group overflow-hidden rounded-2xl border border-fg/10 bg-fg/[0.04] transition hover:border-fg/25">
                  <div className={`relative overflow-hidden bg-black/30 ${template.orientation === "landscape" ? "aspect-[4/3]" : "aspect-[3/4]"}`}>
                    <img src={template.frameDataUrl} alt={template.name} loading="lazy" decoding="async" className="h-full w-full object-contain transition group-hover:scale-[1.02]" />
                    <span className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/85 backdrop-blur-sm">
                      <OrientationGlyph orientation={template.orientation === "landscape" ? "landscape" : "portrait"} className="!border-[1.5px]" />
                      {template.orientation === "landscape" ? "Landscape" : "Portrait"}
                    </span>
                    <div className="absolute inset-0 flex items-end justify-end gap-2 bg-gradient-to-t from-black/70 to-transparent p-3 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
                      <button onClick={() => setEditingTemplate(template)} className="rounded-xl border border-accent/40 bg-accent/25 px-3 py-1.5 text-xs font-semibold text-accent backdrop-blur-sm hover:bg-accent/50">Edit</button>
                      <button
                        onClick={() => { if (window.confirm(`Hapus frame "${template.name}"?`)) deleteTemplate(template.id); }}
                        disabled={deletingId === template.id}
                        className="flex items-center gap-1.5 rounded-xl border border-red-400/40 bg-red-500/25 px-3 py-1.5 text-xs font-semibold text-red-200 backdrop-blur-sm hover:bg-red-500/50 disabled:opacity-50"
                      >
                        {deletingId === template.id && <Spinner size="sm" />}
                        {deletingId === template.id ? "Menghapus…" : "Hapus"}
                      </button>
                    </div>
                  </div>
                  <div className="p-3">
                    <h3 className="truncate text-sm font-semibold">{template.name}</h3>
                    <p className="mt-0.5 truncate text-xs text-fg/45">{template.style}</p>
                    <p className="mt-0.5 text-[11px] text-fg/30">{template.orientation} · {template.outputPreset?.toUpperCase()} · {template.slots.length} slot</p>
                  </div>
                </article>
              ))}
            </div>
            {visibleTemplates.length === 0 && (
              <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-fg/15 py-20 text-center">
                <span className="text-6xl opacity-20">🖼</span>
                <div>
                  <p className="font-semibold text-fg/50">{publishedTemplates.length === 0 ? "Belum ada frame" : "Tidak ada frame yang cocok"}</p>
                  <p className="mt-1 text-sm text-fg/30">{publishedTemplates.length === 0 ? "Upload batch PNG di kanan atas untuk mulai menambah frame kiosk." : "Coba kategori lain atau ubah kata pencarian."}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>}

      {tab === "stopmotion" && <StopMotionFramePanel />}

      {tab === "stickers" && <section className={`mx-auto mt-6 max-w-7xl ${panel} md:p-7`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="eyebrow">STIKER KHUSUS BOOTH</p><h2 className="font-display text-3xl font-semibold">Stiker milik booth</h2><p className="mt-1 text-sm text-fg/55">Paket emoji, lencana teks, dan bentuk sudah otomatis ada di editor foto kiosk. Di sini kamu bisa menambah stiker sendiri (logo, maskot, PNG transparan) yang muncul di kategori “Milik booth”.</p></div>
          <label className="k-btn k-btn-accent cursor-pointer !min-h-0 !py-2.5 !text-sm">Upload stiker<input type="file" accept="image/*" multiple className="hidden" onChange={(event) => Array.from(event.target.files ?? []).forEach(uploadSticker)} /></label>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-6 lg:grid-cols-8">
          {stickers.map((sticker) => <div key={sticker.id} className="group relative rounded-xl border border-fg/10 bg-fg/5 p-2"><img src={sticker.dataUrl} alt={sticker.name} className="h-20 w-full object-contain" /><button type="button" onClick={() => removeSticker(sticker.id)} className="absolute right-1 top-1 rounded bg-red-500/80 px-1.5 py-1 text-[10px] opacity-0 transition group-hover:opacity-100">Hapus</button><p className="mt-1 truncate text-center text-[10px] text-fg/50">{sticker.name}</p></div>)}
          {stickers.length === 0 && <p className="col-span-full py-8 text-center text-sm text-fg/40">Belum ada stiker khusus. Upload PNG transparan jika ingin menambah logo atau maskot booth.</p>}
        </div>
      </section>}

      {tab === "output" && <div className="mx-auto mt-6 grid max-w-7xl items-start gap-5 lg:grid-cols-2">
      <section className={`${panel} md:p-7`}>
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

      <section className={`${panel} md:p-7`}>
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
              <Select className={inputClass} value={config.stripLayout} onChange={(e) => set("stripLayout", e.target.value as BoothConfig["stripLayout"])}>
                {Object.entries(STRIP_LAYOUT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </label>
            <label className="block text-sm text-fg/60">
              Visual template
              <Select className={inputClass} value={config.stripTemplate} onChange={(e) => set("stripTemplate", e.target.value as BoothConfig["stripTemplate"])}>
                {Object.entries(STRIP_TEMPLATE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </label>
            <p className="text-xs text-fg/45">Warna aksen di visual template (Neon Glow, gradient, footer bar) mengikuti warna aksen di Kustomisasi Kiosk.</p>
          </div>
        </div>
      </section>
      </div>}
    </div>
  );
}
