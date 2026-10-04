import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { api } from "@/lib/api";
import { useBoothConfig } from "@/lib/boothConfigStore";
import { imageFileToDataUrl } from "@/lib/imageDownscale";
import { PREVIEW_CONFIG_MESSAGE } from "@/lib/previewMode";
import { isCustomId, type ElementType, type LayoutElement, type RegisteredElement, type ScreenOrientation } from "@/lib/screenBuilder/types";
import { pushToast } from "@/lib/toastStore";
import { Icon } from "@/components/kiosk/Icons";
import { BUILDER_MSG, labelFor } from "./BuilderFrame";

// ---------------------------------------------------------------------------------------------------------------------
// Screen builder: arrange what is on each kiosk screen — move and resize the screen's own elements, hide the optional
// ones, and add your own text, pictures, videos/GIFs and a running logo. The canvas is the REAL kiosk app running in an
// iframe (see BuilderFrame.tsx), so it is exactly what customers see. This page owns the data and the side panels.
// ---------------------------------------------------------------------------------------------------------------------

const SCREENS: { key: string; label: string }[] = [
  { key: "idle", label: "Layar awal" },
  { key: "tutorial", label: "Tutorial" },
  { key: "packages", label: "Pilih paket" },
  { key: "orientation", label: "Tampilan kamera" },
  { key: "payment", label: "Pembayaran" },
  { key: "frame", label: "Pilih frame" },
  { key: "capture", label: "Sesi foto" },
  { key: "preview", label: "Edit foto" },
  { key: "result", label: "Hasil" },
];

const VIRTUAL: Record<ScreenOrientation, { width: number; height: number }> = {
  portrait: { width: 1080, height: 1920 },
  landscape: { width: 1920, height: 1080 },
};

type Layout = Record<string, LayoutElement>;
type Patch = Partial<Omit<LayoutElement, "id" | "type">>;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round1 = (value: number) => Math.round(value * 10) / 10;
const inputClass = "w-full rounded-lg border border-fg/15 bg-surface px-2.5 py-1.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Pictures are shrunk to a sensible size; GIF/SVG are kept byte-for-byte so they stay animated / sharp. */
async function prepareImage(file: File): Promise<{ dataUrl: string; aspect: number }> {
  const keepRaw = file.type === "image/gif" || file.type === "image/svg+xml";
  if (keepRaw && file.size > 6 * 1024 * 1024) throw new Error("GIF/SVG maksimal 6 MB.");
  const dataUrl = keepRaw ? await readAsDataUrl(file) : await imageFileToDataUrl(file, { maxDimension: 1600, keepAlpha: true });
  const aspect = await new Promise<number>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth / Math.max(1, image.naturalHeight));
    image.onerror = () => resolve(1);
    image.src = dataUrl;
  });
  return { dataUrl, aspect };
}

async function prepareVideo(file: File): Promise<{ dataUrl: string; aspect: number }> {
  if (file.size > 8 * 1024 * 1024) throw new Error("Video maksimal 8 MB. Kompres dulu, atau pakai GIF.");
  const dataUrl = await readAsDataUrl(file);
  const aspect = await new Promise<number>((resolve) => {
    const video = document.createElement("video");
    video.onloadedmetadata = () => resolve(video.videoWidth / Math.max(1, video.videoHeight));
    video.onerror = () => resolve(16 / 9);
    video.src = dataUrl;
  });
  return { dataUrl, aspect };
}

// ------------------------------------------------------------------ small UI pieces
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-fg/10 px-4 py-4 last:border-b-0">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[.14em] text-fg/45">{title}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function NumberField({ label, value, onChange, min, max, step = 1, suffix }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; suffix?: string }) {
  return (
    <label className="block text-xs font-medium text-fg/55">
      {label}
      <div className="relative mt-1">
        <input type="number" className={inputClass} value={Number.isFinite(value) ? value : 0} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
        {suffix && <span className="pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 text-xs text-fg/35">{suffix}</span>}
      </div>
    </label>
  );
}

function RangeField({ label, value, min, max, step = 1, suffix = "%", onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => void }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs font-medium text-fg/55">
        <span>{label}</span>
        <span className="rounded-md bg-fg/[0.06] px-1.5 py-0.5 tabular-nums text-fg">{value}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 w-full accent-[var(--accent)]" />
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-fg/10 px-3 py-2 text-left text-sm transition hover:border-fg/25">
      {label}
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? "bg-accent" : "bg-fg/20"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? "left-[18px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

function Choice<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (value: T) => void }) {
  return (
    <div className="inline-flex w-full rounded-lg border border-fg/10 bg-fg/[0.04] p-0.5">
      {options.map((option) => (
        <button key={option.value} type="button" title={option.title} onClick={() => onChange(option.value)} className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition ${value === option.value ? "bg-surface text-fg shadow-sm" : "text-fg/50 hover:text-fg"}`}>{option.label}</button>
      ))}
    </div>
  );
}

function FileButton({ label, accept, onFile, busy }: { label: string; accept: string; onFile: (file: File) => void; busy?: boolean }) {
  return (
    <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-fg/15 px-3 py-2 text-xs font-semibold transition hover:border-accent hover:text-accent">
      {busy ? "Memproses…" : label}
      <input type="file" accept={accept} className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file); event.target.value = ""; }} />
    </label>
  );
}

const ADD_TILES: { id: "text" | "image" | "video" | "logo" | "ticker"; label: string; hint: string; icon: string }[] = [
  { id: "text", label: "Teks", hint: "Tulisan bebas", icon: "layers" },
  { id: "image", label: "Gambar / GIF", hint: "Foto, logo, stiker", icon: "image" },
  { id: "logo", label: "Logo berjalan", hint: "Bergerak terus", icon: "refresh" },
  { id: "ticker", label: "Teks berjalan", hint: "Running text", icon: "sparkles" },
  { id: "video", label: "Video", hint: "Maks 8 MB", icon: "video" },
];

// ------------------------------------------------------------------ the page
export default function ScreenBuilder({ screenKey }: { screenKey: string }) {
  const [, navigate] = useLocation();
  const config = useBoothConfig((state) => state.config);

  const [orientation, setOrientation] = useState<ScreenOrientation>(() => (window.innerWidth > window.innerHeight ? "landscape" : "portrait"));
  const [overrides, setOverrides] = useState<Layout>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [registered, setRegistered] = useState<RegisteredElement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedJson, setSavedJson] = useState("[]");
  const [ready, setReady] = useState(false);
  const [pushTick, setPushTick] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [holder, setHolder] = useState({ width: 800, height: 600 });
  const [locked, setLocked] = useState(false);
  const [planName, setPlanName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [historyTick, setHistoryTick] = useState(0);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const overridesRef = useRef<Layout>({});
  const selectedRef = useRef<string | null>(null);
  const sentConfigRef = useRef<Record<string, unknown>>({});
  const pastRef = useRef<Layout[]>([]);
  const futureRef = useRef<Layout[]>([]);
  const committedRef = useRef<Layout>({});
  const pendingRef = useRef<Layout>({});
  const snapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addRequest = useRef<"image" | "video" | "logo" | null>(null);

  const virtual = VIRTUAL[orientation];
  const fit = Math.min((holder.width - 48) / virtual.width, (holder.height - 48) / virtual.height);
  const scale = Math.max(0.05, fit * zoom);
  const displayWidth = virtual.width * scale;
  const displayHeight = virtual.height * scale;

  const src = useMemo(() => `${window.location.href.split("#")[0].split("?")[0]}?kioskPreview=1&builder=1#/__builder/${screenKey}`, [screenKey]);
  const post = useCallback((message: Record<string, unknown>) => iframeRef.current?.contentWindow?.postMessage(message, "*"), []);

  const layoutJson = useMemo(() => JSON.stringify(Object.values(overrides).sort((a, b) => a.id.localeCompare(b.id))), [overrides]);
  const dirty = !loading && layoutJson !== savedJson;

  // ------------------------------------------------ plan gate + data
  useEffect(() => {
    api.getPlanFeatures().then((result) => {
      if (!result) return;
      setLocked(!result.screenBuilderEnabled);
      setPlanName(result.planName);
    }).catch(() => undefined);
  }, []);

  const serialize = (layout: Layout) => JSON.stringify(Object.values(layout).sort((a, b) => a.id.localeCompare(b.id)));

  const replaceAll = useCallback((next: Layout, options: { markSaved?: boolean; resetHistory?: boolean } = {}) => {
    overridesRef.current = next;
    setOverrides(next);
    if (options.resetHistory) {
      pastRef.current = [];
      futureRef.current = [];
      committedRef.current = next;
      if (snapTimer.current) { clearTimeout(snapTimer.current); snapTimer.current = null; }
      setHistoryTick((tick) => tick + 1);
    }
    if (options.markSaved) setSavedJson(serialize(next));
    setPushTick((tick) => tick + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSelectedId(null);
    selectedRef.current = null;
    api.getScreenLayout(screenKey, orientation).then((result) => {
      if (cancelled) return;
      const map: Layout = {};
      for (const element of result?.elements ?? []) map[element.id] = element;
      replaceAll(map, { markSaved: true, resetHistory: true });
    }).catch(() => {
      if (!cancelled) replaceAll({}, { markSaved: true, resetHistory: true });
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [screenKey, orientation, replaceAll]);

  // ------------------------------------------------ history (undo / redo), coalescing a drag into one step
  const noteChange = useCallback(() => {
    if (snapTimer.current === null) pendingRef.current = committedRef.current;
    else clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(() => {
      snapTimer.current = null;
      if (serialize(pendingRef.current) !== serialize(overridesRef.current)) {
        pastRef.current = [...pastRef.current.slice(-79), pendingRef.current];
        futureRef.current = [];
      }
      committedRef.current = overridesRef.current;
      setHistoryTick((tick) => tick + 1);
    }, 450);
  }, []);

  const flushHistory = () => {
    if (snapTimer.current === null) return;
    clearTimeout(snapTimer.current);
    snapTimer.current = null;
    if (serialize(pendingRef.current) !== serialize(overridesRef.current)) {
      pastRef.current = [...pastRef.current.slice(-79), pendingRef.current];
      futureRef.current = [];
    }
    committedRef.current = overridesRef.current;
  };

  const undo = () => {
    flushHistory();
    const previous = pastRef.current.pop();
    if (!previous) return;
    futureRef.current.push(overridesRef.current);
    committedRef.current = previous;
    replaceAll(previous);
    setHistoryTick((tick) => tick + 1);
  };
  const redo = () => {
    flushHistory();
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push(overridesRef.current);
    committedRef.current = next;
    replaceAll(next);
    setHistoryTick((tick) => tick + 1);
  };
  const canUndo = pastRef.current.length > 0 || snapTimer.current !== null;
  const canRedo = futureRef.current.length > 0;
  void historyTick;

  // ------------------------------------------------ editing
  /** A change that came from the editor panels (the canvas already knows about changes it made itself). */
  const applyPatch = useCallback((id: string, patch: Patch, source: "panel" | "canvas" = "panel") => {
    const current = overridesRef.current[id];
    if (!current) {
      // A page element nobody has moved yet has no position on record — the canvas measures it first.
      if (source === "panel") post({ type: BUILDER_MSG.patch, id, patch });
      else {
        const type = registered.find((item) => item.id === id)?.type ?? "text";
        const next = { ...overridesRef.current, [id]: { id, type, xPct: 0, yPct: 0, widthPct: 20, heightPct: 10, zIndex: 0, ...patch } as LayoutElement };
        overridesRef.current = next;
        setOverrides(next);
        noteChange();
      }
      return;
    }
    const next = { ...overridesRef.current, [id]: { ...current, ...patch } };
    overridesRef.current = next;
    setOverrides(next);
    noteChange();
    if (source === "panel") setPushTick((tick) => tick + 1);
  }, [noteChange, post, registered]);

  const select = (id: string | null) => {
    setSelectedId(id);
    selectedRef.current = id;
    setPushTick((tick) => tick + 1);
  };

  const nextZ = () => Math.max(1000, ...Object.values(overridesRef.current).map((el) => el.zIndex + 1));

  const addElement = (element: LayoutElement) => {
    const next = { ...overridesRef.current, [element.id]: element };
    replaceAll(next);
    noteChange();
    select(element.id);
  };

  const removeElement = (id: string) => {
    if (!isCustomId(id)) return;
    const next = { ...overridesRef.current };
    delete next[id];
    replaceAll(next);
    noteChange();
    if (selectedRef.current === id) select(null);
  };

  const duplicateElement = (id: string) => {
    const source = overridesRef.current[id];
    if (!source || !isCustomId(id)) return;
    const copy: LayoutElement = { ...source, id: `custom-${crypto.randomUUID()}`, xPct: clamp(source.xPct + 3, 0, 90), yPct: clamp(source.yPct + 3, 0, 90), zIndex: nextZ() };
    addElement(copy);
  };

  const sizeFor = (aspect: number, widthPct: number) => {
    const widthPx = (widthPct / 100) * virtual.width;
    return { widthPct, heightPct: round1(((widthPx / aspect) / virtual.height) * 100) };
  };

  const addCustom = async (kind: "text" | "image" | "video" | "logo" | "ticker", file?: File) => {
    const id = `custom-${crypto.randomUUID()}`;
    const portrait = orientation === "portrait";
    const z = nextZ();
    try {
      if (kind === "text") {
        addElement({ id, type: "text", xPct: 10, yPct: 42, widthPct: 80, heightPct: 12, zIndex: z, content: "Teks baru", fontSizeVw: portrait ? 6 : 3.4, bold: true, align: "center" });
      } else if (kind === "ticker") {
        addElement({ id, type: "marquee", xPct: 0, yPct: portrait ? 92 : 90, widthPct: 100, heightPct: portrait ? 5 : 8, zIndex: z, content: "Selamat datang di photobooth kami ✦ Abadikan momenmu", fontSizeVw: portrait ? 3.4 : 1.8, speed: 25, bold: true });
      } else if (file) {
        setUploading(true);
        if (kind === "image") {
          const { dataUrl, aspect } = await prepareImage(file);
          addElement({ id, type: "image", xPct: 25, yPct: 30, ...sizeFor(aspect, 50), zIndex: z, src: dataUrl, fit: "contain" });
        } else if (kind === "video") {
          const { dataUrl, aspect } = await prepareVideo(file);
          addElement({ id, type: "video", xPct: 10, yPct: 30, ...sizeFor(aspect, 80), zIndex: z, src: dataUrl, fit: "cover" });
        } else {
          const { dataUrl } = await prepareImage(file);
          addElement({ id, type: "marquee", xPct: 0, yPct: portrait ? 90 : 86, widthPct: 100, heightPct: portrait ? 7 : 12, zIndex: z, src: dataUrl, speed: 20 });
        }
      }
    } catch (error) {
      pushToast({ type: "error", title: "File tidak bisa dipakai", sub: error instanceof Error ? error.message : undefined });
    } finally {
      setUploading(false);
    }
  };

  const replaceFile = async (id: string, file: File) => {
    const element = overridesRef.current[id];
    if (!element) return;
    try {
      setUploading(true);
      const prepared = element.type === "video" ? await prepareVideo(file) : await prepareImage(file);
      applyPatch(id, { src: prepared.dataUrl });
    } catch (error) {
      pushToast({ type: "error", title: "File tidak bisa dipakai", sub: error instanceof Error ? error.message : undefined });
    } finally {
      setUploading(false);
    }
  };

  const bringToFront = (id: string) => applyPatch(id, { zIndex: Math.max(...Object.values(overridesRef.current).map((el) => el.zIndex), 0) + 1 });
  const sendToBack = (id: string) => applyPatch(id, { zIndex: Math.min(...Object.values(overridesRef.current).map((el) => el.zIndex), 0) - 1 });

  // ------------------------------------------------ messages with the canvas
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as { type?: string; id?: string | null; patch?: Patch; elements?: RegisteredElement[]; key?: string; shift?: boolean; ctrl?: boolean } | null;
      if (!data?.type) return;
      if (data.type === BUILDER_MSG.ready) setReady(true);
      else if (data.type === BUILDER_MSG.select) { setSelectedId(data.id ?? null); selectedRef.current = data.id ?? null; }
      else if (data.type === BUILDER_MSG.update && data.id && data.patch) applyPatch(data.id, data.patch, "canvas");
      else if (data.type === BUILDER_MSG.registered && data.elements) {
        setRegistered((current) => (JSON.stringify(current) === JSON.stringify(data.elements) ? current : data.elements!));
      } else if (data.type === BUILDER_MSG.key && data.key) handleKey(data.key, Boolean(data.shift), Boolean(data.ctrl));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyPatch]);

  useEffect(() => { setReady(false); setRegistered([]); }, [screenKey]);

  useEffect(() => {
    if (ready) return;
    const timer = window.setInterval(() => post({ type: BUILDER_MSG.ping }), 400);
    return () => window.clearInterval(timer);
  }, [ready, post, screenKey]);

  useEffect(() => {
    if (!ready || loading) return;
    post({ type: BUILDER_MSG.state, overrides: overridesRef.current, selectedId: selectedRef.current, scale });
    // pushTick marks editor-originated changes; scale changes with zoom
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, loading, pushTick, scale]);

  // the design (colours, fonts, buttons) shown on the canvas is the live one
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      const last = sentConfigRef.current;
      const patch: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(config)) if (JSON.stringify(last[key]) !== JSON.stringify(value)) patch[key] = value;
      if (Object.keys(patch).length === 0) return;
      sentConfigRef.current = { ...config } as unknown as Record<string, unknown>;
      post({ type: PREVIEW_CONFIG_MESSAGE, config: patch });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [config, ready, post]);
  useEffect(() => { sentConfigRef.current = {}; }, [screenKey]);

  // ------------------------------------------------ keyboard
  const handleKey = (key: string, shift: boolean, ctrl: boolean) => {
    const id = selectedRef.current;
    if (ctrl && key.toLowerCase() === "z") return shift ? redo() : undo();
    if (ctrl && key.toLowerCase() === "y") return redo();
    if (ctrl && key.toLowerCase() === "s") return void save();
    if (!id) return;
    if (ctrl && key.toLowerCase() === "d") return duplicateElement(id);
    if (key === "Delete" || key === "Backspace") return removeElement(id);
    const element = overridesRef.current[id];
    if (!element) return;
    const step = shift ? 2 : 0.25;
    if (key === "ArrowLeft") applyPatch(id, { xPct: round1(element.xPct - step) });
    else if (key === "ArrowRight") applyPatch(id, { xPct: round1(element.xPct + step) });
    else if (key === "ArrowUp") applyPatch(id, { yPct: round1(element.yPct - step) });
    else if (key === "ArrowDown") applyPatch(id, { yPct: round1(element.yPct + step) });
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      handleKey(event.key, event.shiftKey, event.ctrlKey || event.metaKey);
      if (event.ctrlKey || event.metaKey || event.key.startsWith("Arrow") || event.key === "Delete") event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ------------------------------------------------ layout measuring
  useEffect(() => {
    const element = holderRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => setHolder({ width: entries[0].contentRect.width, height: entries[0].contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, [locked]);
  useEffect(() => { setZoom(1); }, [orientation]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // ------------------------------------------------ save / reset / leave
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const result = await api.updateScreenLayout(screenKey, orientation, Object.values(overridesRef.current));
      // The server moved uploaded files into storage: swap our big in-memory copies for the saved URLs.
      const map: Layout = {};
      for (const element of result?.elements ?? Object.values(overridesRef.current)) map[element.id] = element;
      replaceAll(map, { markSaved: true });
      committedRef.current = map;
      pushToast({ type: "success", title: "Tata letak tersimpan", sub: "Langsung dipakai semua kiosk." });
    } catch (error) {
      pushToast({ type: "error", title: "Gagal menyimpan", sub: error instanceof Error ? error.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  const confirmLeave = () => !dirty || window.confirm("Ada perubahan yang belum disimpan. Tinggalkan tanpa menyimpan?");

  const resetDefault = async () => {
    if (!window.confirm("Kembalikan layar ini ke susunan bawaan? Semua elemen tambahan juga dihapus.")) return;
    setSaving(true);
    try {
      await api.updateScreenLayout(screenKey, orientation, []);
      replaceAll({}, { markSaved: true, resetHistory: true });
      select(null);
      pushToast({ type: "success", title: "Dikembalikan ke susunan bawaan" });
    } catch (error) {
      pushToast({ type: "error", title: "Gagal mereset", sub: error instanceof Error ? error.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  // ------------------------------------------------ derived lists
  const customElements = Object.values(overrides).filter((el) => isCustomId(el.id)).sort((a, b) => b.zIndex - a.zIndex);
  const pageElements = registered.filter((item) => !isCustomId(item.id));
  const selected = selectedId ? overrides[selectedId] : undefined;
  const selectedRegistered = selectedId ? registered.find((item) => item.id === selectedId) : undefined;
  const selectedIsCustom = selectedId ? isCustomId(selectedId) : false;
  const selectedLabel = selectedId ? (selectedIsCustom && selected ? labelFor(selected) : selectedRegistered?.label ?? selectedId) : "";
  const canHide = (id: string, type: ElementType) => !isCustomId(id) && (type === "text" || type === "image" || (screenKey === "idle" && id === "cta"));

  if (locked) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-canvas px-6 text-center text-fg">
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-accent">Atur Tampilan Layar</p>
        <h1 className="font-display text-2xl font-semibold">Fitur ini tidak termasuk paket kamu saat ini</h1>
        <p className="max-w-md text-sm text-fg/55">
          {planName ? `Paket "${planName}" tidak menyertakan pengaturan tata letak layar.` : "Pengaturan tata letak layar tidak termasuk paket kamu saat ini."} Kiosk tetap berjalan normal dengan tata letak bawaan. Hubungi admin platform untuk upgrade paket.
        </p>
        <Link href="/admin" className="mt-2 rounded-xl border border-fg/15 px-5 py-2.5 text-sm text-fg/70 hover:border-accent hover:text-fg">← Kembali ke dashboard</Link>
      </div>
    );
  }

  const layerRow = (id: string, label: string, type: ElementType, custom: boolean) => {
    const element = overrides[id];
    const isHidden = Boolean(element?.hidden);
    return (
      <div key={id} className={`group flex items-center gap-1 rounded-lg pr-1 transition ${selectedId === id ? "bg-accent text-white" : "hover:bg-fg/[0.06]"}`}>
        <button type="button" onClick={() => select(id)} className={`flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left text-sm ${isHidden ? "opacity-50" : ""}`}>
          <Icon name={type === "image" ? "image" : type === "video" ? "video" : type === "marquee" ? "refresh" : type === "system-button" ? "check" : "layers"} className="h-4 w-4 shrink-0 opacity-70" />
          <span className="truncate">{label}</span>
        </button>
        {canHide(id, type) && (
          <button type="button" title={isHidden ? "Tampilkan" : "Sembunyikan"} onClick={() => applyPatch(id, { hidden: !isHidden })} className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs ${selectedId === id ? "hover:bg-white/20" : "text-fg/40 hover:bg-fg/10 hover:text-fg"}`}>
            {isHidden ? "◌" : "●"}
          </button>
        )}
        {custom && (
          <button type="button" title="Hapus" onClick={() => removeElement(id)} className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${selectedId === id ? "hover:bg-white/20" : "text-fg/40 hover:bg-red-500/10 hover:text-red-500"}`}>
            <Icon name="trash" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-screen flex-col bg-[var(--kiosk-background)] text-[var(--kiosk-text)]">
      {/* ---------------- top bar */}
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-fg/10 bg-surface px-4 py-2.5">
        <button type="button" onClick={() => { if (confirmLeave()) navigate("/admin"); }} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-fg/60 transition hover:bg-fg/[0.06] hover:text-fg">
          <Icon name="arrow-left" className="h-4 w-4" /> Kembali
        </button>
        <div className="h-6 w-px bg-fg/10" />
        <label className="flex items-center gap-2 text-sm">
          <span className="text-fg/50">Layar</span>
          <select
            value={screenKey}
            onChange={(event) => { if (confirmLeave()) navigate(`/admin/screen-builder/${event.target.value}`); }}
            className="rounded-lg border border-fg/15 bg-surface px-2.5 py-1.5 text-sm font-semibold outline-none focus:border-accent"
          >
            {SCREENS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </label>
        <div className="inline-flex rounded-lg border border-fg/10 bg-fg/[0.04] p-0.5 text-xs font-semibold">
          {(["portrait", "landscape"] as const).map((value) => (
            <button key={value} type="button" onClick={() => { if (value !== orientation && confirmLeave()) setOrientation(value); }} className={`rounded-md px-3 py-1.5 transition ${orientation === value ? "bg-surface text-fg shadow-sm" : "text-fg/50 hover:text-fg"}`}>
              {value === "portrait" ? "Layar tegak" : "Layar lebar"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-0.5 rounded-lg border border-fg/10 bg-fg/[0.04] p-0.5 text-xs font-semibold">
          <button type="button" onClick={() => setZoom((value) => Math.max(0.3, round1(value - 0.1) ))} className="h-7 w-7 rounded-md text-fg/60 hover:bg-surface hover:text-fg" title="Perkecil">−</button>
          <button type="button" onClick={() => setZoom(1)} className="min-w-14 rounded-md px-1 py-1.5 text-fg/60 hover:bg-surface hover:text-fg" title="Pas di layar">{Math.round(scale * 100)}%</button>
          <button type="button" onClick={() => setZoom((value) => Math.min(3, round1(value + 0.1)))} className="h-7 w-7 rounded-md text-fg/60 hover:bg-surface hover:text-fg" title="Perbesar">+</button>
        </div>
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={undo} disabled={!canUndo} title="Urungkan (Ctrl+Z)" className="flex h-8 w-8 items-center justify-center rounded-lg text-fg/60 transition hover:bg-fg/[0.06] hover:text-fg disabled:opacity-30"><Icon name="undo" className="h-4 w-4" /></button>
          <button type="button" onClick={redo} disabled={!canRedo} title="Ulangi (Ctrl+Y)" className="flex h-8 w-8 items-center justify-center rounded-lg text-fg/60 transition hover:bg-fg/[0.06] hover:text-fg disabled:opacity-30"><Icon name="undo" className="h-4 w-4 -scale-x-100" /></button>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className={`flex items-center gap-1.5 text-xs font-medium ${dirty ? "text-amber-600" : "text-emerald-600"}`}>
            <span className={`h-2 w-2 rounded-full ${dirty ? "bg-amber-500" : "bg-emerald-500"}`} />
            {dirty ? "Belum disimpan" : "Tersimpan"}
          </span>
          <button type="button" onClick={resetDefault} disabled={saving} className="rounded-lg border border-fg/15 px-3.5 py-2 text-sm text-fg/60 transition hover:border-red-400/50 hover:text-red-500 disabled:opacity-50">Reset layar</button>
          <button type="button" onClick={save} disabled={saving || !dirty} className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-white shadow-md shadow-accent/25 transition hover:brightness-110 disabled:opacity-50 disabled:shadow-none">{saving ? "Menyimpan…" : "Simpan"}</button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[272px_minmax(0,1fr)_316px]">
        {/* ---------------- left: add + layers */}
        <aside className="flex min-h-0 flex-col overflow-y-auto border-r border-fg/10 bg-surface">
          <Section title="Tambah ke layar">
            <div className="grid grid-cols-2 gap-2">
              {ADD_TILES.map((tile) => {
                const needsFile = tile.id === "image" || tile.id === "video" || tile.id === "logo";
                const accept = tile.id === "video" ? "video/*" : "image/*";
                const body = (
                  <>
                    <Icon name={tile.icon} className="h-5 w-5 text-accent" />
                    <span className="mt-1.5 text-xs font-semibold">{tile.label}</span>
                    <span className="text-[10px] text-fg/45">{tile.hint}</span>
                  </>
                );
                const className = "flex cursor-pointer flex-col items-start rounded-xl border border-fg/10 p-3 text-left transition hover:border-accent hover:bg-accent/[0.04]";
                return needsFile ? (
                  <label key={tile.id} className={className}>
                    {body}
                    <input type="file" accept={accept} className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void addCustom(tile.id, file); event.target.value = ""; }} />
                  </label>
                ) : (
                  <button key={tile.id} type="button" onClick={() => void addCustom(tile.id)} className={className}>{body}</button>
                );
              })}
            </div>
            {uploading && <p className="text-xs text-fg/50">Memproses file…</p>}
          </Section>

          <Section title="Lapisan">
            {customElements.length > 0 && (
              <div className="space-y-0.5">
                <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-fg/35">Tambahan kamu</p>
                {customElements.map((el) => layerRow(el.id, el.type === "text" || el.type === "marquee" ? (el.content?.slice(0, 22) || labelFor(el)) : labelFor(el), el.type, true))}
              </div>
            )}
            <div className="space-y-0.5">
              <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-fg/35">Bawaan layar ini</p>
              {pageElements.length === 0 && <p className="px-1 text-xs text-fg/40">{ready ? "Tidak ada elemen yang bisa diatur." : "Memuat layar…"}</p>}
              {pageElements.map((item) => layerRow(item.id, item.label, item.type, false))}
            </div>
          </Section>

          <div className="mt-auto border-t border-fg/10 px-4 py-3 text-xs leading-relaxed text-fg/45">
            Warna, font, dan logo utama diatur di <Link href="/admin" className="font-semibold text-accent hover:underline">Kustomisasi Kiosk</Link>.
          </div>
        </aside>

        {/* ---------------- center: the real screen */}
        <main className="relative flex min-h-0 flex-col bg-[repeating-conic-gradient(var(--hairline)_0_25%,transparent_0_50%)] [background-size:22px_22px]">
          <div ref={holderRef} className="min-h-0 flex-1 overflow-auto">
            <div className="flex min-h-full min-w-full items-center justify-center p-6">
              <div className="relative shrink-0 rounded-2xl bg-[#10131c] p-2 shadow-2xl ring-1 ring-black/30" style={{ width: displayWidth + 16, height: displayHeight + 16 }}>
                <div className="relative overflow-hidden rounded-xl bg-white" style={{ width: displayWidth, height: displayHeight }}>
                  <iframe
                    key={screenKey}
                    ref={iframeRef}
                    src={src}
                    title="Kanvas layar kiosk"
                    className="absolute left-0 top-0 border-0"
                    style={{ width: virtual.width, height: virtual.height, transform: `scale(${scale})`, transformOrigin: "top left" }}
                  />
                  {(!ready || loading) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-surface/90">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-fg/15 border-t-accent" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="shrink-0 border-t border-fg/10 bg-surface/90 px-4 py-2 text-center text-xs text-fg/50 backdrop-blur">
            Seret untuk memindahkan · tarik titik di pojok untuk mengubah ukuran · panah = geser halus · Ctrl+Z urungkan · garis ungu = rata tengah
          </div>
        </main>

        {/* ---------------- right: properties */}
        <aside className="min-h-0 overflow-y-auto border-l border-fg/10 bg-surface">
          {!selectedId ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent"><Icon name="sliders" className="h-6 w-6" /></span>
              <p className="font-semibold">Pilih sebuah elemen</p>
              <p className="text-sm text-fg/50">Klik elemen di layar atau di daftar lapisan untuk mengatur posisi, ukuran, dan tampilannya.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 border-b border-fg/10 px-4 py-3.5">
                <div className="min-w-0">
                  <p className="truncate font-display text-lg font-semibold leading-tight">{selectedLabel}</p>
                  <p className="text-xs text-fg/45">{selectedIsCustom ? "Elemen tambahan" : "Elemen bawaan layar"}</p>
                </div>
                {selectedIsCustom && (
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => duplicateElement(selectedId)} title="Gandakan (Ctrl+D)" className="flex h-8 w-8 items-center justify-center rounded-lg border border-fg/10 text-fg/60 hover:border-accent hover:text-accent"><Icon name="copy" className="h-4 w-4" /></button>
                    <button type="button" onClick={() => removeElement(selectedId)} title="Hapus (Delete)" className="flex h-8 w-8 items-center justify-center rounded-lg border border-fg/10 text-fg/60 hover:border-red-400 hover:text-red-500"><Icon name="trash" className="h-4 w-4" /></button>
                  </div>
                )}
              </div>

              {selectedIsCustom && selected?.type === "text" && (
                <Section title="Teks">
                  <textarea rows={3} className={inputClass} value={selected.content ?? ""} onChange={(event) => applyPatch(selected.id, { content: event.target.value })} />
                  <RangeField label="Ukuran huruf" value={selected.fontSizeVw ?? 4} min={1} max={16} step={0.5} suffix="" onChange={(value) => applyPatch(selected.id, { fontSizeVw: value })} />
                  <TextStyle el={selected} onChange={(patch) => applyPatch(selected.id, patch)} />
                </Section>
              )}

              {selectedIsCustom && selected?.type === "marquee" && (
                <Section title="Isi yang berjalan">
                  <label className="block text-xs font-medium text-fg/55">
                    Tulisan
                    <input className={`${inputClass} mt-1`} value={selected.content ?? ""} placeholder="(kosong = hanya logo)" onChange={(event) => applyPatch(selected.id, { content: event.target.value })} />
                  </label>
                  <div className="flex items-center gap-2">
                    {selected.src && <img src={selected.src} alt="" className="h-10 w-16 rounded-md border border-fg/10 bg-fg/[0.04] object-contain p-1" />}
                    <FileButton label={selected.src ? "Ganti logo" : "Tambah logo"} accept="image/*" busy={uploading} onFile={(file) => void replaceFile(selected.id, file)} />
                    {selected.src && <button type="button" onClick={() => applyPatch(selected.id, { src: undefined })} className="text-xs text-red-500 hover:underline">Hapus logo</button>}
                  </div>
                  <RangeField label="Kecepatan" value={Math.round(100 - ((clamp(selected.speed ?? 20, 5, 60) - 5) / 55) * 90)} min={10} max={100} suffix="%" onChange={(value) => applyPatch(selected.id, { speed: Math.round((5 + ((100 - value) / 90) * 55) * 10) / 10 })} />
                  <Toggle checked={Boolean(selected.reverse)} onChange={(value) => applyPatch(selected.id, { reverse: value })} label="Berjalan ke kanan" />
                  {selected.content && <RangeField label="Ukuran huruf" value={selected.fontSizeVw ?? 3} min={1} max={10} step={0.2} suffix="" onChange={(value) => applyPatch(selected.id, { fontSizeVw: value })} />}
                  {selected.content && <TextStyle el={selected} onChange={(patch) => applyPatch(selected.id, patch)} hideAlign />}
                </Section>
              )}

              {selectedIsCustom && (selected?.type === "image" || selected?.type === "video") && (
                <Section title={selected.type === "image" ? "Gambar" : "Video"}>
                  <div className="flex items-center gap-2">
                    <FileButton label="Ganti file" accept={selected.type === "video" ? "video/*" : "image/*"} busy={uploading} onFile={(file) => void replaceFile(selected.id, file)} />
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-fg/55">Cara memenuhi kotak</p>
                    <Choice value={selected.fit ?? (selected.type === "video" ? "cover" : "contain")} onChange={(value) => applyPatch(selected.id, { fit: value })} options={[{ value: "contain", label: "Utuh" }, { value: "cover", label: "Penuhi (potong)" }]} />
                  </div>
                  <RangeField label="Sudut membulat" value={selected.radius ?? 0} min={0} max={50} onChange={(value) => applyPatch(selected.id, { radius: value })} />
                </Section>
              )}

              {/* Position + size */}
              <Section title="Posisi">
                <div className="grid grid-cols-2 gap-2">
                  <NumberField label="Kiri (X)" suffix="%" step={0.5} value={round1(selected?.xPct ?? 0)} onChange={(value) => applyPatch(selectedId, { xPct: value })} />
                  <NumberField label="Atas (Y)" suffix="%" step={0.5} value={round1(selected?.yPct ?? 0)} onChange={(value) => applyPatch(selectedId, { yPct: value })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => post({ type: BUILDER_MSG.align, id: selectedId, axis: "x" })} className="rounded-lg border border-fg/15 px-2 py-2 text-xs font-semibold transition hover:border-accent hover:text-accent">Tengah ⟷</button>
                  <button type="button" onClick={() => post({ type: BUILDER_MSG.align, id: selectedId, axis: "y" })} className="rounded-lg border border-fg/15 px-2 py-2 text-xs font-semibold transition hover:border-accent hover:text-accent">Tengah ⟷ (tinggi)</button>
                </div>
                {!selected && <p className="text-xs text-fg/45">Geser elemen sekali di layar agar posisinya bisa diketik di sini.</p>}
              </Section>

              <Section title="Ukuran & tampilan">
                {selectedIsCustom ? (
                  <div className="grid grid-cols-2 gap-2">
                    <NumberField label="Lebar" suffix="%" step={0.5} value={round1(selected?.widthPct ?? 20)} onChange={(value) => applyPatch(selectedId, { widthPct: clamp(value, 2, 150) })} />
                    <NumberField label="Tinggi" suffix="%" step={0.5} value={round1(selected?.heightPct ?? 10)} onChange={(value) => applyPatch(selectedId, { heightPct: clamp(value, 1, 150) })} />
                  </div>
                ) : (
                  <RangeField label="Skala" value={Math.round((selected?.scale ?? 1) * 100)} min={30} max={300} onChange={(value) => applyPatch(selectedId, { scale: value / 100 })} />
                )}
                {selectedIsCustom && <RangeField label="Putar" value={selected?.rotation ?? 0} min={-180} max={180} suffix="°" onChange={(value) => applyPatch(selectedId, { rotation: value })} />}
                <RangeField label="Transparansi" value={100 - (selected?.opacity ?? 100)} min={0} max={100} onChange={(value) => applyPatch(selectedId, { opacity: 100 - value })} />
                {!selectedIsCustom && selectedRegistered && canHide(selectedId, selectedRegistered.type) && (
                  <Toggle checked={!selected?.hidden} onChange={(value) => applyPatch(selectedId, { hidden: !value })} label="Tampilkan di layar" />
                )}
                {!selectedIsCustom && !selected && <p className="text-xs text-fg/45">Geser elemen sekali di layar atau ubah salah satu nilai di atas untuk mulai mengaturnya.</p>}
                {!selectedIsCustom && selected && (
                  <button type="button" onClick={() => { const next = { ...overridesRef.current }; delete next[selectedId]; replaceAll(next); noteChange(); }} className="text-xs text-fg/50 underline decoration-dotted hover:text-fg">Kembalikan ke posisi bawaan</button>
                )}
              </Section>

              {selected && (
                <Section title="Urutan tumpukan">
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => sendToBack(selectedId)} className="rounded-lg border border-fg/15 px-2 py-2 text-xs font-semibold transition hover:border-accent hover:text-accent">Ke belakang</button>
                    <button type="button" onClick={() => bringToFront(selectedId)} className="rounded-lg border border-fg/15 px-2 py-2 text-xs font-semibold transition hover:border-accent hover:text-accent">Ke depan</button>
                  </div>
                </Section>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function TextStyle({ el, onChange, hideAlign = false }: { el: LayoutElement; onChange: (patch: Patch) => void; hideAlign?: boolean }) {
  return (
    <>
      <div className="flex items-center gap-2">
        <input type="color" value={el.color ?? "#000000"} onChange={(event) => onChange({ color: event.target.value })} className="h-9 w-11 cursor-pointer rounded-lg border border-fg/15 bg-transparent p-1" aria-label="Warna teks" />
        <span className="text-xs text-fg/55">{el.color ? el.color.toUpperCase() : "Warna mengikuti tema"}</span>
        {el.color && <button type="button" onClick={() => onChange({ color: undefined })} className="ml-auto text-xs text-fg/50 hover:text-fg hover:underline">ikuti tema</button>}
      </div>
      <Toggle checked={Boolean(el.bold)} onChange={(value) => onChange({ bold: value })} label="Huruf tebal" />
      {!hideAlign && (
        <Choice value={el.align ?? "center"} onChange={(value) => onChange({ align: value })} options={[{ value: "left", label: "Kiri" }, { value: "center", label: "Tengah" }, { value: "right", label: "Kanan" }]} />
      )}
    </>
  );
}
