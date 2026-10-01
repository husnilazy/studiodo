import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { api } from "@/lib/api";
import { PositionableProvider } from "@/lib/screenBuilder/PositionableContext";
import Positionable from "@/components/Positionable";
import type { LayoutElement, RegisteredElement, ScreenOrientation } from "@/lib/screenBuilder/types";
import { useBoothConfig, applyThemePreset, type BoothConfig } from "@/lib/boothConfigStore";
import { FONT_PAIRINGS } from "@/lib/fontPairings";
import Tutorial from "./Tutorial";
import Idle from "./Idle";
import PilihPaket from "./PilihPaket";
import PilihOrientasi from "./PilihOrientasi";
import Pembayaran from "./Pembayaran";
import PilihFrame from "./PilihFrame";
import SesiFoto from "./SesiFoto";
import PreviewFoto from "./PreviewFoto";
import Hasil from "./Hasil";

// Fase 5a wired up "tutorial" only. Fase 5b (this) adds the rest, following the
// same Positionable pattern proven there — each of these real page components is
// guarded internally (see their own editMode checks) so mounting them here for
// live WYSIWYG preview doesn't trigger real navigation, session creation, camera
// access, or payment side effects.
const SCREEN_COMPONENTS: Partial<Record<string, React.ComponentType>> = {
  idle: Idle,
  tutorial: Tutorial,
  packages: PilihPaket,
  orientation: PilihOrientasi,
  payment: Pembayaran,
  frame: PilihFrame,
  capture: SesiFoto,
  preview: PreviewFoto,
  result: Hasil,
};

const inputClass = "w-20 rounded-lg border border-fg/15 bg-fg/5 px-2 py-1.5 text-sm outline-none focus:border-accent";
const fieldInputClass = "mt-1 w-full rounded-lg border border-fg/15 bg-fg/5 px-2.5 py-2 text-sm outline-none focus:border-accent";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-fg/50">{label}</span>
      {children}
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <div className="mt-1 flex gap-1.5">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-10 shrink-0 rounded-lg bg-transparent" />
        <input className={fieldInputClass.replace("mt-1 ", "")} value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </Field>
  );
}

// Branding was only editable from a separate "Kustomisasi Kiosk" page — an
// admin trying to nudge a logo or accent color while looking at the actual
// WYSIWYG canvas had to keep flipping between two pages to see the effect.
// Same BoothConfig store as that page, so changes here show up there too
// (and vice versa) — this is just a second, canvas-adjacent way to edit it.
function BrandingPanel() {
  const { config, update, reset } = useBoothConfig();
  const set = <K extends keyof BoothConfig>(key: K, value: BoothConfig[K]) => update({ [key]: value } as Partial<BoothConfig>);

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-[10px] uppercase tracking-[.16em] text-fg/35">Logo & Nama</p>
        <div className="space-y-3">
          <Field label="Logo PNG">
            <input className={fieldInputClass} type="file" accept="image/png" onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => set("logoUrl", String(reader.result));
              reader.readAsDataURL(file);
            }} />
            {config.logoUrl && <img src={config.logoUrl} className="mt-2 h-10 w-auto rounded-lg bg-fg/10 p-1.5 object-contain" />}
          </Field>
          <Field label={`Ukuran logo (${config.logoScale}%)`}>
            <input type="range" min={60} max={180} value={config.logoScale} onChange={(e) => set("logoScale", Number(e.target.value))} className="mt-2 w-full accent-[var(--accent)]" />
          </Field>
          <Field label="Nama brand"><input className={fieldInputClass} value={config.brandName} onChange={(e) => set("brandName", e.target.value)} /></Field>
          <Field label="Tagline"><input className={fieldInputClass} value={config.tagline} onChange={(e) => set("tagline", e.target.value)} /></Field>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-[.16em] text-fg/35">Warna & Font</p>
          <button type="button" onClick={() => applyThemePreset(config.themeMode)} className="text-[10px] text-fg/40 underline decoration-dotted hover:text-fg/70">Reset preset</button>
        </div>
        <div className="mb-3 inline-flex rounded-lg border border-fg/15 p-1 text-xs">
          {([["dark", "Gelap"], ["light", "Terang"]] as const).map(([mode, label]) => (
            <button key={mode} type="button" onClick={() => set("themeMode", mode)} className={`rounded px-2.5 py-1 ${config.themeMode === mode ? "bg-accent text-white" : "text-fg/50"}`}>{label}</button>
          ))}
        </div>
        <div className="space-y-3">
          <ColorField label="Warna aksen" value={config.accentColor} onChange={(v) => set("accentColor", v)} />
          <ColorField label="Background" value={config.backgroundColor} onChange={(v) => set("backgroundColor", v)} />
          <ColorField label="Gradient mulai" value={config.backgroundGradientStart} onChange={(v) => set("backgroundGradientStart", v)} />
          <ColorField label="Gradient akhir" value={config.backgroundGradientEnd} onChange={(v) => set("backgroundGradientEnd", v)} />
          <ColorField label="Surface kartu" value={config.surfaceColor} onChange={(v) => set("surfaceColor", v)} />
          <ColorField label="Warna teks" value={config.textColor} onChange={(v) => set("textColor", v)} />
          <ColorField label="Teks sekunder" value={config.mutedTextColor} onChange={(v) => set("mutedTextColor", v)} />
          <Field label="Font pairing">
            <select className={fieldInputClass} value={config.fontPairing} onChange={(e) => set("fontPairing", e.target.value as BoothConfig["fontPairing"])}>
              {Object.entries(FONT_PAIRINGS).map(([key, def]) => <option key={key} value={key}>{def.label}</option>)}
            </select>
          </Field>
        </div>
      </div>

      <button type="button" onClick={reset} className="w-full rounded-lg border border-fg/15 py-2 text-xs text-fg/50 hover:text-fg">Reset semua branding ke default</button>
    </div>
  );
}

export default function ScreenBuilder({ screenKey }: { screenKey: string }) {
  const [orientation, setOrientation] = useState<ScreenOrientation>("portrait");
  const [overrides, setOverrides] = useState<Record<string, LayoutElement>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [registeredElements, setRegisteredElements] = useState<RegisteredElement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [screenBuilderLocked, setScreenBuilderLocked] = useState(false);
  const [planName, setPlanName] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  // Canvas used to be a fixed 360x640px box no matter how big the editor
  // window actually was — tiny to work in, and it also shrank the resize
  // handle down to a few real screen pixels (see Positionable.tsx). Now it
  // fits whatever space is actually available, tracked live via ResizeObserver,
  // with `zoom` layered on top for going in past "fit" for fine adjustments.
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });
  const [zoom, setZoom] = useState(1);
  const [rightTab, setRightTab] = useState<"elemen" | "branding">("elemen");
  // Mirrors `registeredElements` state so callbacks below can read the latest
  // value without needing it in their dependency array — that's what keeps
  // `updateOverride`/`onRegisteredElementsChange` referentially stable across
  // renders. Without that stability, PositionableProvider's memoized context
  // value changes identity every render, which re-triggers every mounted
  // Positionable's registration effect, which calls back in here — an infinite
  // update loop (this bit React caught and threw "Maximum update depth exceeded").
  const registeredElementsRef = useRef<RegisteredElement[]>([]);

  useEffect(() => {
    api.getPlanFeatures().then((result) => {
      if (!result) return;
      setScreenBuilderLocked(!result.screenBuilderEnabled);
      setPlanName(result.planName);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    setLoading(true);
    setSelectedId(null);
    api.getScreenLayout(screenKey, orientation).then((result) => {
      const map: Record<string, LayoutElement> = {};
      for (const el of result?.elements ?? []) map[el.id] = el;
      setOverrides(map);
    }).finally(() => setLoading(false));
  }, [screenKey, orientation]);

  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => { setZoom(1); }, [orientation]);

  // Jumping back to "Elemen" whenever a new element gets selected — otherwise
  // selecting something while parked on the Branding tab looks like nothing
  // happened (the properties never became visible).
  useEffect(() => { if (selectedId) setRightTab("elemen"); }, [selectedId]);

  const handleRegisteredElementsChange = useCallback((elements: RegisteredElement[]) => {
    registeredElementsRef.current = elements;
    setRegisteredElements(elements);
  }, []);

  const updateOverride = useCallback((id: string, patch: Partial<Omit<LayoutElement, "id" | "type">>) => {
    setOverrides((current) => {
      const type = current[id]?.type ?? registeredElementsRef.current.find((el) => el.id === id)?.type ?? "text";
      const base: LayoutElement = current[id] ?? { id, type, xPct: 0, yPct: 0, widthPct: 20, heightPct: 10, zIndex: 0 };
      return { ...current, [id]: { ...base, ...patch } };
    });
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      await api.updateScreenLayout(screenKey, orientation, Object.values(overrides));
      setMessage("Tersimpan.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  const resetDefault = async () => {
    setSaving(true);
    setMessage("");
    try {
      await api.updateScreenLayout(screenKey, orientation, []);
      setOverrides({});
      setSelectedId(null);
      setMessage("Direset ke default.");
    } finally {
      setSaving(false);
    }
  };

  const bringToFront = () => {
    if (!selectedId) return;
    const maxZ = Math.max(0, ...Object.values(overrides).map((el) => el.zIndex));
    updateOverride(selectedId, { zIndex: maxZ + 1 });
  };
  const sendToBack = () => {
    if (!selectedId) return;
    const minZ = Math.min(0, ...Object.values(overrides).map((el) => el.zIndex));
    updateOverride(selectedId, { zIndex: minZ - 1 });
  };
  const fitToCanvas = () => {
    if (!selectedId) return;
    updateOverride(selectedId, { xPct: 0, yPct: 0, widthPct: 100, heightPct: 100 });
  };

  // Everything above this only repositions elements the page's own JSX
  // already wraps in <Positionable> — there was no way to add something that
  // wasn't already coded into that page (a custom logo, an extra line of
  // text). A "custom-" id prefix marks the ones added here instead of
  // corresponding to real page markup — ScreenLayoutBoundary (runtime) and
  // this canvas (editor) both render any override with that prefix as a
  // free-floating image/text layer instead of expecting the page to supply it.
  const addCustomImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const id = `custom-${crypto.randomUUID()}`;
      const element: LayoutElement = { id, type: "image", xPct: 35, yPct: 35, widthPct: 30, heightPct: 20, zIndex: 1000, content: String(reader.result) };
      setOverrides((current) => ({ ...current, [id]: element }));
      setSelectedId(id);
    };
    reader.readAsDataURL(file);
  };

  const addCustomText = () => {
    const id = `custom-${crypto.randomUUID()}`;
    const element: LayoutElement = { id, type: "text", xPct: 35, yPct: 35, widthPct: 30, heightPct: 8, zIndex: 1000, fontSizeVw: 3, content: "Teks baru" };
    setOverrides((current) => ({ ...current, [id]: element }));
    setSelectedId(id);
  };

  const removeCustomElement = (id: string) => {
    setOverrides((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setSelectedId(null);
  };

  const ScreenComponent = SCREEN_COMPONENTS[screenKey];
  // Was `overrides[selectedId]` alone — so clicking an element that had never
  // been dragged/resized yet (no override saved for it) selected it fine on
  // the canvas (outline + resize handle both showed), but the Properties
  // panel on the right still said "Pilih elemen…" as if nothing were
  // selected, because it only recognized elements that already had an
  // override. Falls back to the same default box `updateOverride` uses for a
  // first-time override, so the panel now matches what the canvas shows.
  const selectedRegistered = selectedId ? registeredElements.find((el) => el.id === selectedId) : null;
  const selected = selectedId
    ? overrides[selectedId] ?? (selectedRegistered ? { id: selectedId, type: selectedRegistered.type, xPct: 0, yPct: 0, widthPct: 20, heightPct: 10, zIndex: 0 } : null)
    : null;
  const grouped = {
    sistem: registeredElements.filter((el) => el.type === "system-button" || el.type === "system-steplist"),
    teks: registeredElements.filter((el) => el.type === "text"),
    media: registeredElements.filter((el) => el.type === "image"),
  };

  if (screenBuilderLocked) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[#0b0b10] px-6 text-center text-white">
        <p className="text-xs uppercase tracking-[.16em] text-accent">Screen Builder</p>
        <h1 className="font-display text-2xl font-semibold">Fitur ini tidak termasuk paket kamu saat ini</h1>
        <p className="max-w-md text-sm text-fg/50">
          {planName ? `Paket "${planName}" tidak menyertakan Screen Builder.` : "Screen Builder tidak menyertai paket kamu saat ini."} Kiosk tetap jalan normal dengan tata letak bawaan. Hubungi admin platform untuk upgrade paket kalau butuh kustomisasi layar.
        </p>
        <Link href="/admin" className="mt-2 rounded-xl border border-fg/15 px-5 py-2.5 text-sm text-fg/70 hover:border-accent hover:text-fg">← Kembali ke dashboard</Link>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[#0b0b10] text-white">
      <header className="flex shrink-0 items-center justify-between border-b border-fg/10 px-5 py-3">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-sm text-fg/50 hover:text-fg">← Kembali</Link>
          <div>
            <p className="text-xs uppercase tracking-[.16em] text-accent">Editor WYSIWYG</p>
            <h1 className="font-display text-lg font-semibold capitalize">{screenKey}</h1>
          </div>
          <div className="flex rounded-lg border border-fg/15 p-1 text-xs">
            <button type="button" onClick={() => setOrientation("portrait")} className={`rounded px-3 py-1.5 ${orientation === "portrait" ? "bg-accent" : "text-fg/50"}`}>Portrait</button>
            <button type="button" onClick={() => setOrientation("landscape")} className={`rounded px-3 py-1.5 ${orientation === "landscape" ? "bg-accent" : "text-fg/50"}`}>Landscape</button>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-fg/15 p-1 text-xs">
            <button type="button" onClick={() => setZoom((z) => Math.max(0.4, Math.round((z - 0.15) * 100) / 100))} className="rounded px-2.5 py-1.5 text-fg/60 hover:bg-fg/10 hover:text-fg" title="Zoom out">−</button>
            <button type="button" onClick={() => setZoom(1)} className="min-w-14 rounded px-2 py-1.5 text-fg/60 hover:bg-fg/10 hover:text-fg" title="Reset ke ukuran pas layar">{Math.round(zoom * 100)}%</button>
            <button type="button" onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.15) * 100) / 100))} className="rounded px-2.5 py-1.5 text-fg/60 hover:bg-fg/10 hover:text-fg" title="Zoom in">+</button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={resetDefault} disabled={saving} className="rounded-lg border border-fg/15 px-4 py-2 text-sm text-fg/60 hover:text-fg disabled:opacity-50">Reset ke default</button>
          <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold disabled:opacity-50">{saving ? "Menyimpan…" : "Simpan"}</button>
          {message && <span className="text-xs text-fg/50">{message}</span>}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[220px_1fr_260px]">
        <aside className="overflow-y-auto border-r border-fg/10 p-4">
          <p className="mb-2 text-[10px] uppercase tracking-[.16em] text-fg/35">Tambah elemen</p>
          <div className="mb-5 flex gap-2">
            <label className="flex-1 cursor-pointer rounded-lg border border-dashed border-fg/20 px-2.5 py-2 text-center text-xs text-fg/60 hover:border-accent hover:text-fg">
              + Gambar
              <input type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) addCustomImage(file); event.target.value = ""; }} />
            </label>
            <button type="button" onClick={addCustomText} className="flex-1 rounded-lg border border-dashed border-fg/20 px-2.5 py-2 text-xs text-fg/60 hover:border-accent hover:text-fg">+ Teks</button>
          </div>
          <p className="mb-2 text-[10px] uppercase tracking-[.16em] text-fg/35">Layers</p>
          {(["sistem", "teks", "media"] as const).map((group) => (
            <div key={group} className="mb-4">
              <p className="mb-1 text-[10px] uppercase tracking-wide text-fg/30">{group === "sistem" ? "Sistem" : group === "teks" ? "Teks" : "Gambar & Video"} {grouped[group].length}</p>
              {grouped[group].length === 0 && <p className="text-xs text-fg/25">— kosong —</p>}
              {grouped[group].map((el) => (
                <button
                  key={el.id}
                  type="button"
                  onClick={() => setSelectedId(el.id)}
                  className={`mb-1 block w-full truncate rounded-lg px-2.5 py-1.5 text-left text-xs ${selectedId === el.id ? "bg-accent text-white" : "bg-fg/5 text-fg/60 hover:bg-fg/10"}`}
                >
                  {el.label}
                </button>
              ))}
            </div>
          ))}
        </aside>

        <main ref={canvasWrapRef} className="relative flex min-h-0 items-center justify-center overflow-auto bg-black/40 p-8">
          {loading ? (
            <p className="text-sm text-fg/40">Memuat…</p>
          ) : (
            (() => {
              // Real kiosk pages assume a full-viewport-sized container (lots of
              // `h-full`), so they're mounted at a realistic kiosk resolution
              // (VIRTUAL) and scaled down with CSS transform to fit however much
              // space is actually available (DISPLAY) — canvasRef stays on the
              // *outer* box, so Positionable's drag math (real screen pixels ÷
              // outer box's rendered size) is correct regardless of scale.
              const VIRTUAL = orientation === "portrait" ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
              const virtualAspect = VIRTUAL.width / VIRTUAL.height;
              const availW = Math.max(120, containerSize.width - 16);
              const availH = Math.max(120, containerSize.height - 16);
              const fitScale = availW / availH > virtualAspect ? availH / VIRTUAL.height : availW / VIRTUAL.width;
              const scale = fitScale * zoom;
              const DISPLAY = { width: VIRTUAL.width * scale, height: VIRTUAL.height * scale };
              return (
                <div
                  ref={canvasRef}
                  onClick={() => setSelectedId(null)}
                  className="relative shrink-0 overflow-hidden rounded-2xl border border-fg/15 bg-[var(--kiosk-background,#111)] text-[var(--kiosk-text,#fff)] shadow-2xl"
                  style={{ width: DISPLAY.width, height: DISPLAY.height }}
                >
                  <PositionableProvider
                    editMode
                    overrides={overrides}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    onUpdateOverride={updateOverride}
                    onRegisteredElementsChange={handleRegisteredElementsChange}
                    canvasRef={canvasRef}
                    scale={scale}
                  >
                    <div style={{ width: VIRTUAL.width, height: VIRTUAL.height, transform: `scale(${scale})`, transformOrigin: "top left" }}>
                      {ScreenComponent ? <ScreenComponent /> : <p className="p-8 text-sm text-fg/40">Layar ini belum bisa didesain (Fase 5b).</p>}
                      {Object.values(overrides).filter((el) => el.id.startsWith("custom-")).map((el) => (
                        <Positionable key={el.id} id={el.id} type={el.type} label={el.type === "image" ? "Gambar custom" : "Teks custom"}>
                          {el.type === "image"
                            ? <img src={el.content} alt="" className="h-full w-full object-contain" />
                            : <p className="flex h-full w-full items-center text-fg" style={el.fontSizeVw ? { fontSize: `${el.fontSizeVw}vw` } : undefined}>{el.content}</p>}
                        </Positionable>
                      ))}
                    </div>
                  </PositionableProvider>
                </div>
              );
            })()
          )}
        </main>

        <aside className="overflow-y-auto border-l border-fg/10 p-4">
          <div className="mb-3 flex rounded-lg border border-fg/15 p-1 text-xs">
            <button type="button" onClick={() => setRightTab("elemen")} className={`flex-1 rounded px-2.5 py-1.5 ${rightTab === "elemen" ? "bg-accent text-white" : "text-fg/50 hover:text-fg"}`}>Elemen</button>
            <button type="button" onClick={() => setRightTab("branding")} className={`flex-1 rounded px-2.5 py-1.5 ${rightTab === "branding" ? "bg-accent text-white" : "text-fg/50 hover:text-fg"}`}>Branding</button>
          </div>

          {rightTab === "branding" ? (
            <BrandingPanel />
          ) : !selected ? (
            <p className="text-xs text-fg/30">Pilih elemen di canvas atau panel Layers.</p>
          ) : (
            <div className="space-y-4">
              <p className="text-sm font-semibold">{registeredElements.find((el) => el.id === selected.id)?.label ?? selected.id}</p>
              {selected.id.startsWith("custom-") && selected.type === "text" && (
                <label className="block text-xs text-fg/50">
                  Isi teks
                  <textarea rows={2} className={`${inputClass} mt-1 w-full`} value={selected.content ?? ""} onChange={(e) => updateOverride(selected.id, { content: e.target.value })} />
                </label>
              )}
              {selected.type === "text" && (
                <label className="block text-xs text-fg/50">
                  Ukuran font (vw)
                  <input type="number" min={0.5} step={0.5} className={`${inputClass} mt-1 w-full`} value={selected.fontSizeVw ?? ""} onChange={(e) => updateOverride(selected.id, { fontSizeVw: Number(e.target.value) || undefined })} />
                </label>
              )}
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-fg/50">X %<input type="number" className={inputClass} value={Math.round(selected.xPct)} onChange={(e) => updateOverride(selected.id, { xPct: Number(e.target.value) })} /></label>
                <label className="text-xs text-fg/50">Y %<input type="number" className={inputClass} value={Math.round(selected.yPct)} onChange={(e) => updateOverride(selected.id, { yPct: Number(e.target.value) })} /></label>
                <label className="text-xs text-fg/50">Width %<input type="number" className={inputClass} value={Math.round(selected.widthPct)} onChange={(e) => updateOverride(selected.id, { widthPct: Number(e.target.value) })} /></label>
                <label className="text-xs text-fg/50">Height %<input type="number" className={inputClass} value={Math.round(selected.heightPct)} onChange={(e) => updateOverride(selected.id, { heightPct: Number(e.target.value) })} /></label>
              </div>
              <div>
                <p className="mb-1.5 text-[10px] uppercase tracking-wide text-fg/30">Ke canvas</p>
                <button type="button" onClick={fitToCanvas} className="rounded-lg border border-fg/15 px-3 py-1.5 text-xs hover:border-accent">Fit</button>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={sendToBack} className="flex-1 rounded-lg border border-fg/15 px-3 py-1.5 text-xs hover:border-accent">Ke Belakang</button>
                <button type="button" onClick={bringToFront} className="flex-1 rounded-lg border border-fg/15 px-3 py-1.5 text-xs hover:border-accent">Ke Depan</button>
              </div>
              {selected.id.startsWith("custom-") && (
                <button type="button" onClick={() => removeCustomElement(selected.id)} className="w-full rounded-lg border border-red-400/30 px-3 py-1.5 text-xs text-red-300 hover:bg-red-400/10">Hapus elemen ini</button>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
