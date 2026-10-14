import { api } from "@/lib/api";
import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "wouter";
import { applyThemePreset, useBoothConfig, useConfigSync, type BoothConfig } from "@/lib/boothConfigStore";
import { FONT_PAIRINGS } from "@/lib/fontPairings";
import { THEME_PRESETS } from "@/lib/themePresets";
import { CAPTURE_LAYOUT_LABEL, resolveCaptureLayout, type CaptureLayoutId, IDLE_LAYOUT_LABEL, KIOSK_STYLES, KIOSK_STYLE_IDS, PACKAGE_LAYOUT_LABEL, resolveIdleLayout, resolvePackageLayout, type IdleLayoutId, type KioskStyleId, type PackageLayoutId } from "@/lib/kioskStyles";
import { imageFileToDataUrl } from "@/lib/imageDownscale";
import { inputClass } from "@/lib/adminUi";
import { pushToast } from "@/lib/toastStore";
import { Icon } from "@/components/kiosk/Icons";
import KioskPreviewFrame from "@/components/KioskPreviewFrame";
import type { PreviewStage } from "@/lib/previewMode";

// ---------------------------------------------------------------------------------------------------------------------
// Kustomisasi Kiosk — everything the customer sees: logo, start screen, colours, fonts, buttons and screen texts.
// Edits apply instantly to the live preview on the right, which is the real kiosk app (see KioskPreviewFrame), and are
// saved to the server automatically (boothConfigStore). Only settings that actually change the kiosk are offered here.
// ---------------------------------------------------------------------------------------------------------------------

type TabId = "style" | "identity" | "start" | "colors" | "buttons" | "texts";
const TABS: { id: TabId; label: string; icon: string; stage: PreviewStage; hint: string }[] = [
  { id: "style", label: "Gaya kiosk", icon: "layers", stage: "idle", hint: "Tema & tata letak dari layar awal sampai hasil" },
  { id: "identity", label: "Identitas", icon: "sparkles", stage: "idle", hint: "Logo dan nama brand" },
  { id: "start", label: "Layar awal", icon: "home", stage: "idle", hint: "Tampilan saat kiosk menunggu" },
  { id: "colors", label: "Warna & font", icon: "palette", stage: "packages", hint: "Tema, warna aksen, huruf" },
  { id: "buttons", label: "Tombol & tampilan", icon: "sliders", stage: "packages", hint: "Bentuk, ukuran, animasi" },
  { id: "texts", label: "Teks layar", icon: "layers", stage: "packages", hint: "Judul di tiap langkah" },
];

const ACCENT_SWATCHES = ["#4F4FE8", "#7C3AED", "#DB2777", "#E11D48", "#EA580C", "#CA8A04", "#16A34A", "#0D9488", "#0284C7", "#111827"];

function Card({ title, description, children, action }: { title: string; description?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-3xl border border-fg/10 bg-surface p-5 shadow-glass md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold tracking-tight">{title}</h3>
          {description && <p className="mt-1 max-w-xl text-sm leading-relaxed text-fg/55">{description}</p>}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-medium text-fg/70">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-fg/45">{hint}</span>}
    </label>
  );
}

function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (value: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-4 rounded-2xl border border-fg/10 px-4 py-3 text-left transition hover:border-fg/25">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-fg/50">{hint}</span>}
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${checked ? "bg-accent" : "bg-fg/20"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${checked ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

function Slider({ label, value, min, max, step = 1, unit = "%", onChange, hint }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number) => void; hint?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-fg/70">{label}</span>
        <span className="rounded-lg bg-fg/[0.06] px-2 py-0.5 text-xs font-semibold tabular-nums">{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-2.5 w-full accent-[var(--accent)]" />
      {hint && <p className="mt-1 text-xs text-fg/45">{hint}</p>}
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; preview?: ReactNode }[]; onChange: (value: T) => void }) {
  return (
    <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`flex flex-col items-center gap-3 rounded-2xl border p-3.5 transition ${value === option.value ? "border-accent bg-accent/[0.08]" : "border-fg/10 hover:border-fg/30"}`}
        >
          {option.preview && <span className="flex h-12 items-center justify-center">{option.preview}</span>}
          <span className="text-sm font-semibold">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <div className="mt-1.5 flex items-center gap-2">
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"} onChange={(event) => onChange(event.target.value.toUpperCase())} className="h-10 w-12 shrink-0 cursor-pointer rounded-xl border border-fg/15 bg-transparent p-1" />
        <input className={`${inputClass} !mt-0 font-mono uppercase`} value={value} maxLength={9} onChange={(event) => onChange(event.target.value)} />
      </div>
    </Field>
  );
}

/** Upload box with a preview, replace and remove — shared by logo, cover and banner. */
function MediaPicker({ label, hint, value, kind = "image", accept = "image/*", alpha = false, maxDimension = 1920, onPick, onClear }: {
  label: string; hint?: string; value: string | null; kind?: "image" | "video"; accept?: string; alpha?: boolean; maxDimension?: number;
  onPick: (dataUrl: string, type: "image" | "video") => void; onClear: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const handle = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      if (file.type.startsWith("video/") || /\.(mp4|mov|m4v)$/i.test(file.name)) {
        if (file.size > 120 * 1024 * 1024) throw new Error("Video maksimal 120 MB.");
        // Uploaded to the server, which converts MOV/HEVC to a web-safe MP4 — never kept as a giant data: URI in the browser.
        const { url } = await api.uploadBrandingVideo(file);
        onPick(url, "video");
      } else {
        onPick(await imageFileToDataUrl(file, { maxDimension, keepAlpha: alpha }), "image");
      }
    } catch (error) {
      pushToast({ type: "error", title: "File tidak bisa dipakai", sub: error instanceof Error ? error.message : undefined });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <span className="text-sm font-medium text-fg/70">{label}</span>
      <div className="mt-1.5 flex items-center gap-3 rounded-2xl border border-dashed border-fg/20 p-3">
        <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[repeating-conic-gradient(var(--hairline)_0_25%,transparent_0_50%)] [background-size:14px_14px]">
          {value ? (kind === "video" ? <video src={value} muted className="h-full w-full object-cover" /> : <img src={value} alt="" className="h-full w-full object-contain" />) : <Icon name="image" className="h-6 w-6 text-fg/25" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            <label className="cursor-pointer rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110">
              {busy ? "Memproses…" : value ? "Ganti" : "Pilih file"}
              <input type="file" accept={accept} className="hidden" onChange={(event) => { void handle(event.target.files?.[0]); event.target.value = ""; }} />
            </label>
            {value && <button type="button" onClick={onClear} className="rounded-lg border border-red-400/40 px-3 py-1.5 text-xs font-semibold text-red-500 transition hover:bg-red-400/10">Hapus</button>}
          </div>
          {hint && <p className="mt-1.5 text-xs text-fg/45">{hint}</p>}
        </div>
      </div>
    </div>
  );
}


/** A tiny schematic of a style's idle screen, so the admin can compare looks without opening the preview. */
function StyleThumb({ id }: { id: KioskStyleId }) {
  const pal = KIOSK_STYLES[id].palette;
  const border = id === "playful" ? `2px solid ${pal.textColor}` : id === "minimal" ? `1px solid ${pal.textColor}33` : "1px solid rgba(128,128,128,.25)";
  const btn: React.CSSProperties = { background: pal.accentColor, borderRadius: id === "minimal" ? 2 : 999, boxShadow: id === "playful" ? `2px 2px 0 ${pal.textColor}` : undefined, border: id === "playful" ? `1.5px solid ${pal.textColor}` : undefined };
  const bar = (w: string, h = 6, o = 0.9): React.CSSProperties => ({ width: w, height: h, borderRadius: 3, background: pal.textColor, opacity: o });
  return (
    <div className="relative h-28 w-full overflow-hidden rounded-xl" style={{ background: pal.backgroundColor, border }}>
      {id === "default" && (
        <>
          <span className="absolute -right-4 -top-4 h-14 w-14 rounded-full opacity-40 blur-md" style={{ background: pal.accentColor }} />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5"><div style={bar("46%", 9)} /><div style={bar("30%", 4, 0.4)} /><div className="mt-2 h-4 w-[38%]" style={btn} /></div>
        </>
      )}
      {id === "minimal" && <div className="absolute inset-0 flex flex-col items-start justify-center gap-1.5 px-4"><div style={bar("52%", 9)} /><div style={bar("34%", 4, 0.4)} /><div className="mt-2 h-4 w-[42%]" style={btn} /></div>}
      {id === "immersive" && (
        <>
          <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${pal.accentColor}88, ${pal.backgroundColor} 65%)` }} />
          <div className="absolute inset-x-3 bottom-3 flex flex-col gap-1.5"><div style={{ ...bar("50%", 9), background: "#fff" }} /><div className="h-4 w-full" style={btn} /></div>
        </>
      )}
      {id === "fun" && (
        <>
          <span className="absolute inset-0 opacity-60" style={{ backgroundImage: `radial-gradient(${pal.accentColor}55 2px, transparent 2.5px)`, backgroundSize: "14px 14px" }} />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5"><div style={{ ...bar("50%", 10), background: pal.textColor }} /><div className="mt-1.5 h-5 w-[44%]" style={{ ...btn, background: `linear-gradient(135deg, ${pal.accentColor}, #ff4fa3)`, border: `2px solid ${pal.textColor}`, boxShadow: `0 3px 0 ${pal.textColor}` }} /></div>
          <span className="absolute right-2 top-2 h-4 w-4 rotate-12 rounded-sm" style={{ background: "#ffd23f", border: `1.5px solid ${pal.textColor}` }} />
        </>
      )}
      {id === "fullcam" && (
        <>
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, #3a3d4a, #14151a 70%)" }} />
          <div className="absolute inset-x-3 top-2.5 flex justify-between"><span className="h-3 w-10 rounded-full bg-white/25" /><span className="h-3 w-7 rounded-full bg-white/25" /></div>
          <div className="absolute inset-x-0 bottom-9 flex justify-center gap-1">{[0, 1, 2].map((n) => <span key={n} className="h-7 w-5 rounded-md border border-white/40 bg-white/10" />)}</div>
          <span className="absolute bottom-2.5 left-1/2 h-6 w-6 -translate-x-1/2 rounded-full border-2 border-white/90 bg-white/30" />
        </>
      )}
      {id === "playful" && (
        <>
          <div className="absolute inset-y-0 left-0 w-1/2" style={{ background: pal.accentColor }}>
            <div className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 -rotate-6 rounded-lg" style={{ background: "#fff", border: `2px solid ${pal.textColor}`, boxShadow: `2px 2px 0 ${pal.textColor}` }} />
          </div>
          <div className="absolute inset-y-0 right-0 flex w-1/2 flex-col items-center justify-center gap-1.5"><div style={bar("60%", 8)} /><div className="mt-1.5 h-4 w-[60%]" style={btn} /></div>
        </>
      )}
    </div>
  );
}

function LayoutThumb({ kind, value }: { kind: "idle" | "packages" | "capture"; value: string }) {
  const box = "flex h-12 w-20 items-center justify-center overflow-hidden rounded-md border border-fg/20 bg-fg/[0.04] p-1.5";
  const a = "rounded-[2px] bg-fg/45";
  const acc = "rounded-[2px] bg-accent";
  if (kind === "capture") {
    if (value === "fullscreen") return <span className={`${box} relative !p-0 bg-fg/30`}><i className="absolute bottom-1 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full border border-white bg-white/40" /><i className="absolute inset-x-1.5 top-1 h-1.5 rounded-full bg-white/40" /></span>;
    return <span className={`${box} gap-1`}><i className="h-full w-3 rounded-[2px] bg-fg/20" /><i className="h-full flex-1 rounded-[3px] bg-fg/35" /><i className="h-full w-3 rounded-[2px] bg-fg/20" /></span>;
  }
  if (kind === "idle") {
    if (value === "left") return <span className={`${box} flex-col items-start justify-center gap-1`}><i className={`${a} h-1.5 w-10`} /><i className={`${a} h-1 w-6 opacity-60`} /><i className={`${acc} mt-0.5 h-2 w-8`} /></span>;
    if (value === "fullbleed") return <span className={`${box} flex-col items-start justify-end gap-1 bg-fg/30`}><i className="h-1.5 w-9 rounded-[2px] bg-white" /><i className={`${acc} h-2.5 w-full`} /></span>;
    if (value === "split") return <span className={`${box} gap-1.5`}><i className="h-full w-1/2 rounded-[3px] bg-accent/70" /><span className="flex w-1/2 flex-col items-center gap-1"><i className={`${a} h-1.5 w-full`} /><i className={`${acc} h-2 w-full`} /></span></span>;
    return <span className={`${box} flex-col gap-1`}><i className={`${a} h-1.5 w-10`} /><i className={`${a} h-1 w-6 opacity-60`} /><i className={`${acc} mt-0.5 h-2 w-8`} /></span>;
  }
  if (value === "list") return <span className={`${box} flex-col gap-1`}>{[0, 1, 2].map((n) => <i key={n} className="flex h-2.5 w-full items-center justify-between rounded-[2px] bg-fg/15 px-1"><i className="h-1 w-5 rounded-[1px] bg-fg/50" /><i className="h-1 w-2 rounded-[1px] bg-accent" /></i>)}</span>;
  if (value === "carousel") return <span className={`${box} gap-1`}><i className="h-full w-2 rounded-[2px] bg-fg/15" /><i className="h-full w-9 rounded-[3px] bg-fg/30" /><i className="h-full w-2 rounded-[2px] bg-fg/15" /></span>;
  return <span className={`${box} gap-1`}>{[0, 1, 2].map((n) => <i key={n} className="h-full w-4 rounded-[3px] bg-fg/25" />)}</span>;
}

const SCREEN_TEXTS: { key: keyof BoothConfig; label: string; fallback: string }[] = [
  { key: "packageHeadline", label: "Pilih paket", fallback: "Pilih Paket" },
  { key: "orientationHeadline", label: "Tampilan kamera", fallback: "Tampilan Kamera" },
  { key: "paymentHeadline", label: "Pembayaran", fallback: "Pembayaran" },
  { key: "frameHeadline", label: "Pilih frame", fallback: "Pilih Frame" },
  { key: "captureHeadline", label: "Sesi foto", fallback: "Sesi Foto" },
  { key: "previewHeadline", label: "Edit foto", fallback: "Edit Foto" },
  { key: "resultHeadline", label: "Hasil", fallback: "Hasil Foto" },
];

export default function AdminPlaceholder() {
  const { config, update, reset } = useBoothConfig();
  const syncState = useConfigSync();
  const [tab, setTab] = useState<TabId>("style");
  const [styleWithPalette, setStyleWithPalette] = useState(true);
  const [showAllColors, setShowAllColors] = useState(false);
  const set = <K extends keyof BoothConfig>(key: K, value: BoothConfig[K]) => update({ [key]: value } as Partial<BoothConfig>);
  const activeTab = TABS.find((item) => item.id === tab)!;

  const confirmReset = () => {
    if (window.confirm("Kembalikan SEMUA tampilan kiosk (logo, warna, teks, tombol, kamera & printer) ke bawaan?")) {
      reset();
      pushToast({ type: "success", title: "Kustomisasi dikembalikan ke bawaan" });
    }
  };

  const saving = syncState.status === "saving";
  const failed = syncState.status === "error";

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_390px]">
      <div className="min-w-0 space-y-5">
        {/* Status + quick actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-fg/10 bg-surface px-4 py-3 shadow-glass">
          <span role="status" title={syncState.message} className={`inline-flex items-center gap-2 text-sm font-medium ${failed ? "text-red-500" : saving ? "text-fg/60" : "text-emerald-600"}`}>
            <span className={`h-2 w-2 rounded-full ${failed ? "bg-red-500" : saving ? "animate-pulse bg-amber-500" : "bg-emerald-500"}`} />
            {saving ? "Menyimpan…" : failed ? "Gagal menyimpan ke server — coba lagi" : "Semua perubahan tersimpan & langsung dipakai semua kiosk"}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/admin/screen-builder/idle" className="inline-flex items-center gap-1.5 rounded-xl border border-fg/10 px-3.5 py-2 text-sm font-medium text-fg/70 transition hover:border-accent hover:text-fg">
              <Icon name="layers" className="h-4 w-4" /> Atur posisi elemen
            </Link>
            <button type="button" onClick={confirmReset} className="rounded-xl border border-fg/10 px-3.5 py-2 text-sm font-medium text-fg/60 transition hover:border-red-400/50 hover:text-red-500">Reset ke bawaan</button>
          </div>
        </div>

        {/* Tabs */}
        <nav className="flex gap-1.5 overflow-x-auto rounded-2xl border border-fg/10 bg-surface p-1.5 shadow-glass" aria-label="Bagian kustomisasi">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              aria-current={tab === item.id ? "page" : undefined}
              className={`relative flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${tab === item.id ? "text-white" : "text-fg/60 hover:bg-fg/[0.05] hover:text-fg"}`}
            >
              {tab === item.id && <motion.span layoutId="customizer-tab" className="absolute inset-0 rounded-xl bg-accent shadow-md shadow-accent/25" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <span className="relative flex items-center gap-2"><Icon name={item.icon} className="h-4 w-4" />{item.label}</span>
            </button>
          ))}
        </nav>
        <p className="-mt-2 px-1 text-sm text-fg/50">{activeTab.hint}</p>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }} className="space-y-5">
            {tab === "style" && (
              <>
                <Card title="Gaya kiosk" description="Satu pilihan yang mengubah seluruh tampilan, dari layar awal sampai hasil: bentuk panel, tombol, huruf, dan tata letak. Lihat hasilnya langsung di pratinjau.">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {KIOSK_STYLE_IDS.map((id) => {
                      const def = KIOSK_STYLES[id];
                      const active = (config.kioskStyle ?? "default") === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => update({ kioskStyle: id, idleLayout: "auto", packageLayout: "auto", captureLayout: "auto", ...(styleWithPalette ? { ...def.palette } : {}) })}
                          className={`flex flex-col gap-3 rounded-2xl border p-3 text-left transition ${active ? "border-accent bg-accent/[0.08] ring-2 ring-accent/30" : "border-fg/10 hover:border-fg/30"}`}
                        >
                          <StyleThumb id={id} />
                          <span>
                            <span className="flex items-center gap-2 text-base font-semibold">{def.label}{active && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Aktif</span>}</span>
                            <span className="block text-xs font-medium text-accent">{def.tagline}</span>
                            <span className="mt-1 block text-xs leading-relaxed text-fg/55">{def.description}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-4">
                    <Switch checked={styleWithPalette} onChange={setStyleWithPalette} label="Ikut pasang warna, huruf & bentuk tombol bawaan gaya" hint="Matikan bila ingin mempertahankan warna kamu sendiri dan hanya mengganti tata letak." />
                  </div>
                </Card>
                <Card title="Tata letak layar awal" description="Otomatis mengikuti gaya. Pilih manual bila ingin mencampur, misalnya gaya Minimalis dengan layar awal layar penuh.">
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                    {(["auto", "center", "left", "fullbleed", "split"] as IdleLayoutId[]).map((value) => {
                      const active = (config.idleLayout ?? "auto") === value;
                      const shown = value === "auto" ? resolveIdleLayout(config) : value;
                      return (
                        <button key={value} type="button" aria-pressed={active} onClick={() => set("idleLayout", value)} className={`flex flex-col items-center gap-2 rounded-2xl border p-3 transition ${active ? "border-accent bg-accent/[0.08]" : "border-fg/10 hover:border-fg/30"}`}>
                          <LayoutThumb kind="idle" value={shown} />
                          <span className="text-sm font-semibold">{value === "auto" ? "Otomatis" : IDLE_LAYOUT_LABEL[value]}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-xs text-fg/50">Layar penuh paling bagus dengan cover foto/video (tab Layar awal). Terbelah menampilkan cover di sisi gambar.</p>
                </Card>
                <Card title="Tata letak pilih paket" description="Cara paket ditampilkan ke pelanggan.">
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    {(["auto", "grid", "list", "carousel"] as PackageLayoutId[]).map((value) => {
                      const active = (config.packageLayout ?? "auto") === value;
                      const shown = value === "auto" ? resolvePackageLayout(config) : value;
                      return (
                        <button key={value} type="button" aria-pressed={active} onClick={() => set("packageLayout", value)} className={`flex flex-col items-center gap-2 rounded-2xl border p-3 transition ${active ? "border-accent bg-accent/[0.08]" : "border-fg/10 hover:border-fg/30"}`}>
                          <LayoutThumb kind="packages" value={shown} />
                          <span className="text-sm font-semibold">{value === "auto" ? "Otomatis" : PACKAGE_LAYOUT_LABEL[value]}</span>
                        </button>
                      );
                    })}
                  </div>
                </Card>
                <Card title="Tata letak sesi foto" description="Layar kamera. “Layar penuh” membuat live view memenuhi layar dan semua tombol, galeri jepretan, serta filter melayang transparan di atasnya.">
                  <div className="grid grid-cols-3 gap-2.5">
                    {(["auto", "panels", "fullscreen"] as CaptureLayoutId[]).map((value) => {
                      const active = (config.captureLayout ?? "auto") === value;
                      const shown = value === "auto" ? resolveCaptureLayout(config) : value;
                      return (
                        <button key={value} type="button" aria-pressed={active} onClick={() => set("captureLayout", value)} className={`flex flex-col items-center gap-2 rounded-2xl border p-3 transition ${active ? "border-accent bg-accent/[0.08]" : "border-fg/10 hover:border-fg/30"}`}>
                          <LayoutThumb kind="capture" value={shown} />
                          <span className="text-sm font-semibold">{value === "auto" ? "Otomatis" : CAPTURE_LAYOUT_LABEL[value]}</span>
                        </button>
                      );
                    })}
                  </div>
                </Card>
                <p className="rounded-2xl bg-fg/[0.04] px-4 py-3 text-xs leading-relaxed text-fg/55">Warna, huruf, bentuk tombol, teks, dan posisi elemen tetap bisa diatur satu per satu di tab lain setelah memilih gaya. Gaya hanya titik awal.</p>
              </>
            )}

            {tab === "identity" && (
              <>
                <Card title="Logo" description="Tampil di layar awal kiosk. PNG transparan paling bagus. Kalau logo sudah memuat nama studio, matikan juga judul teks di tab Layar awal.">
                  <div className="grid gap-5 md:grid-cols-2">
                    <MediaPicker label="File logo" hint="PNG / SVG / JPG. Otomatis dikecilkan agar ringan." value={config.logoUrl} accept="image/*" alpha maxDimension={1200} onPick={(dataUrl) => set("logoUrl", dataUrl)} onClear={() => set("logoUrl", null)} />
                    <Slider label="Ukuran logo" value={config.logoScale} min={60} max={180} onChange={(value) => set("logoScale", value)} hint="Berlaku di layar awal." />
                  </div>
                </Card>
                <Card title="Sosial media & kontak" description="Tampil di halaman hasil yang dibuka pelanggan setelah scan QR. Isi link atau cukup username; kosongkan yang tidak dipakai.">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Instagram"><input className={inputClass} placeholder="@studiodo atau https://instagram.com/studiodo" value={config.socialInstagram} onChange={(event) => set("socialInstagram", event.target.value)} /></Field>
                    <Field label="TikTok"><input className={inputClass} placeholder="@studiodo" value={config.socialTiktok} onChange={(event) => set("socialTiktok", event.target.value)} /></Field>
                    <Field label="Facebook"><input className={inputClass} placeholder="studiodo" value={config.socialFacebook} onChange={(event) => set("socialFacebook", event.target.value)} /></Field>
                    <Field label="YouTube"><input className={inputClass} placeholder="@studiodo" value={config.socialYoutube} onChange={(event) => set("socialYoutube", event.target.value)} /></Field>
                    <Field label="WhatsApp"><input className={inputClass} placeholder="0812xxxxxxx" value={config.contactWhatsapp} onChange={(event) => set("contactWhatsapp", event.target.value)} /></Field>
                    <Field label="Website"><input className={inputClass} placeholder="studiodo.id" value={config.websiteUrl} onChange={(event) => set("websiteUrl", event.target.value)} /></Field>
                    <Field label="Hashtag" hint="Ajakan untuk pelanggan saat membagikan hasil, mis. #studiodo."><input className={inputClass} placeholder="#studiodo" value={config.hashtag} onChange={(event) => set("hashtag", event.target.value)} /></Field>
                  </div>
                </Card>
                <Card title="Nama & tagline" description="Dipakai di halaman galeri hasil foto yang dibuka customer lewat QR, dan sebagai teks bawaan bila judul layar awal kosong.">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Nama brand"><input className={inputClass} value={config.brandName} onChange={(event) => set("brandName", event.target.value)} /></Field>
                    <Field label="Tagline"><input className={inputClass} value={config.tagline} onChange={(event) => set("tagline", event.target.value)} /></Field>
                  </div>
                </Card>
              </>
            )}

            {tab === "start" && (
              <>
                <Card title="Teks di layar awal" description="Matikan sakelar kalau kamu hanya ingin logo tanpa tulisan. Teks yang kosong juga tidak ditampilkan.">
                  <div className="space-y-4">
                    <div className="space-y-2.5">
                      <Switch checked={config.idleShowHeadline !== false} onChange={(value) => set("idleShowHeadline", value)} label="Tampilkan judul besar" hint="Tulisan besar di tengah layar (mis. nama studio)." />
                      <input className={`${inputClass} !mt-0 transition ${config.idleShowHeadline === false ? "pointer-events-none opacity-40" : ""}`} placeholder="Judul besar" value={config.idleHeadline} onChange={(event) => set("idleHeadline", event.target.value)} />
                    </div>
                    <div className="space-y-2.5">
                      <Switch checked={config.idleShowSubheadline !== false} onChange={(value) => set("idleShowSubheadline", value)} label="Tampilkan subjudul" hint="Kalimat kecil di bawah judul." />
                      <input className={`${inputClass} !mt-0 transition ${config.idleShowSubheadline === false ? "pointer-events-none opacity-40" : ""}`} placeholder="Subjudul" value={config.idleSubheadline} onChange={(event) => set("idleSubheadline", event.target.value)} />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Teks tombol mulai"><input className={inputClass} value={config.idleStartText} onChange={(event) => set("idleStartText", event.target.value)} /></Field>
                      <Field label="Teks promo" hint="Pita kecil di bawah layar. Kosongkan untuk menyembunyikan."><input className={inputClass} value={config.promoText} onChange={(event) => set("promoText", event.target.value)} /></Field>
                    </div>
                  </div>
                </Card>
                <Card title="Latar & banner">
                  <div className="space-y-5">
                    <div className="grid gap-5 md:grid-cols-2">
                      <MediaPicker label="Cover layar awal (gambar atau video)" hint="Menggantikan latar warna. Video .mp4 / .mov maks 120 MB — otomatis dikompres & diputar tanpa suara." value={config.idleCoverUrl} kind={config.idleCoverType} accept="image/*,video/mp4,video/quicktime,.mp4,.mov" onPick={(dataUrl, type) => { update({ idleCoverUrl: dataUrl, idleCoverType: type }); }} onClear={() => set("idleCoverUrl", null)} />
                      <MediaPicker label="Video logo / branding (animasi)" hint="Klip pendek berulang yang tampil menggantikan logo di layar awal. .mp4 / .mov, diputar tanpa suara." value={config.idleLogoVideoUrl} kind="video" accept="video/mp4,video/quicktime,.mp4,.mov" onPick={(url) => set("idleLogoVideoUrl", url)} onClear={() => set("idleLogoVideoUrl", null)} />
                      <MediaPicker label="Banner promo" hint="Gambar kecil di pojok kanan bawah." value={config.idleBannerUrl} accept="image/*" alpha maxDimension={900} onPick={(dataUrl) => set("idleBannerUrl", dataUrl)} onClear={() => set("idleBannerUrl", null)} />
                    </div>
                    <div className="grid gap-2.5 md:grid-cols-2">
                      <Switch checked={config.idleBannerEnabled} onChange={(value) => set("idleBannerEnabled", value)} label="Tampilkan banner promo" />
                      <Switch checked={config.backgroundGradientEnabled} onChange={(value) => set("backgroundGradientEnabled", value)} label="Latar gradient & bola warna" hint="Tidak berlaku bila ada cover." />
                    </div>
                  </div>
                </Card>
              </>
            )}

            {tab === "colors" && (
              <>
                <Card title="Tema dasar" description="Mulai dari tema terang atau gelap. Memilih tema mengisi ulang semua warna di bawah — setelah itu kamu bebas mengubahnya satu per satu.">
                  <Segmented
                    value={config.themeMode}
                    onChange={(mode) => applyThemePreset(mode)}
                    options={(["light", "dark"] as const).map((mode) => ({
                      value: mode,
                      label: mode === "light" ? "Terang" : "Gelap",
                      preview: (
                        <span className="flex h-11 w-20 items-center justify-center gap-1.5 rounded-xl border border-fg/10" style={{ background: THEME_PRESETS[mode].backgroundColor }}>
                          <span className="h-5 w-5 rounded-md" style={{ background: THEME_PRESETS[mode].surfaceColor, boxShadow: "0 0 0 1px rgba(128,128,128,.25)" }} />
                          <span className="h-5 w-5 rounded-full" style={{ background: THEME_PRESETS[mode].accentColor }} />
                        </span>
                      ),
                    }))}
                  />
                </Card>
                <Card title="Warna aksen" description="Warna tombol utama, penanda langkah, dan sorotan di seluruh kiosk.">
                  <div className="flex flex-wrap items-center gap-2.5">
                    {ACCENT_SWATCHES.map((color) => (
                      <button key={color} type="button" onClick={() => set("accentColor", color)} aria-label={`Aksen ${color}`} className={`h-10 w-10 rounded-full border-2 transition hover:scale-110 ${config.accentColor.toUpperCase() === color ? "border-fg scale-110" : "border-transparent"}`} style={{ background: color, ["--tw-ring-color" as string]: color }} />
                    ))}
                  </div>
                  <div className="mt-4 max-w-xs"><ColorField label="Warna kustom" value={config.accentColor} onChange={(value) => set("accentColor", value)} /></div>
                </Card>
                <Card
                  title="Warna detail"
                  description="Latar, kartu, dan teks."
                  action={<button type="button" onClick={() => setShowAllColors((value) => !value)} className="text-sm font-semibold text-accent hover:underline">{showAllColors ? "Sembunyikan" : "Tampilkan"}</button>}
                >
                  <AnimatePresence initial={false}>
                    {showAllColors && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <ColorField label="Latar kiosk" value={config.backgroundColor} onChange={(value) => set("backgroundColor", value)} />
                          <ColorField label="Kartu & panel" value={config.surfaceColor} onChange={(value) => set("surfaceColor", value)} />
                          <ColorField label="Teks utama" value={config.textColor} onChange={(value) => set("textColor", value)} />
                          <ColorField label="Teks sekunder" value={config.mutedTextColor} onChange={(value) => set("mutedTextColor", value)} />
                          <ColorField label="Gradient — awal" value={config.backgroundGradientStart} onChange={(value) => set("backgroundGradientStart", value)} />
                          <ColorField label="Gradient — akhir" value={config.backgroundGradientEnd} onChange={(value) => set("backgroundGradientEnd", value)} />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {!showAllColors && (
                    <div className="flex gap-2">
                      {[config.backgroundColor, config.surfaceColor, config.textColor, config.mutedTextColor, config.backgroundGradientEnd].map((color, index) => (
                        <span key={index} className="h-8 flex-1 rounded-lg border border-fg/10" style={{ background: color }} />
                      ))}
                    </div>
                  )}
                </Card>
                <Card title="Huruf" description="Pasangan font untuk judul dan teks biasa.">
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {Object.entries(FONT_PAIRINGS).map(([key, definition]) => (
                      <button key={key} type="button" onClick={() => set("fontPairing", key as BoothConfig["fontPairing"])} aria-pressed={config.fontPairing === key} className={`rounded-2xl border p-4 text-left transition ${config.fontPairing === key ? "border-accent bg-accent/[0.08]" : "border-fg/10 hover:border-fg/30"}`}>
                        <span className="block text-2xl font-semibold leading-tight" style={{ fontFamily: `${definition.display}, sans-serif` }}>Abadikan momen</span>
                        <span className="mt-1 block text-sm text-fg/60" style={{ fontFamily: `${definition.body}, sans-serif` }}>Bagikan senyum bersama kami.</span>
                        <span className="mt-2 block text-[11px] font-semibold uppercase tracking-wide text-fg/40">{definition.label}</span>
                      </button>
                    ))}
                  </div>
                </Card>
              </>
            )}

            {tab === "buttons" && (
              <>
                <Card title="Bentuk tombol" description="Berlaku untuk semua tombol di kiosk.">
                  <Segmented
                    value={config.buttonStyle}
                    onChange={(value) => set("buttonStyle", value)}
                    options={([["rounded", "Membulat", "0.875rem"], ["pill", "Kapsul", "9999px"], ["square", "Kotak", "0.375rem"]] as const).map(([value, label, radius]) => ({
                      value,
                      label,
                      preview: <span className="inline-flex h-10 w-24 items-center justify-center bg-accent text-xs font-semibold text-white" style={{ borderRadius: radius }}>Mulai</span>,
                    }))}
                  />
                </Card>
                <Card title="Ukuran tombol" description="Tinggi, jarak dalam, dan huruf pada tombol — besarkan untuk layar sentuh yang jauh dari jangkauan.">
                  <Segmented
                    value={config.buttonSize ?? "medium"}
                    onChange={(value) => set("buttonSize", value)}
                    options={([["small", "Kecil", 0.82], ["medium", "Normal", 1], ["large", "Besar", 1.25]] as const).map(([value, label, scale]) => ({
                      value,
                      label,
                      preview: <span className="inline-flex items-center justify-center rounded-xl bg-accent font-semibold text-white" style={{ height: 34 * scale, width: 78 * scale, fontSize: 12 * scale }}>Mulai</span>,
                    }))}
                  />
                </Card>
                <Card title="Skala tampilan" description="Memperbesar atau memperkecil seluruh tulisan dan elemen kiosk sekaligus. 100% = ukuran otomatis mengikuti layar.">
                  <Slider label="Skala tampilan" value={config.uiScale ?? 100} min={85} max={125} step={5} onChange={(value) => set("uiScale", value)} />
                  <p className="mt-3 rounded-xl bg-fg/[0.04] px-3.5 py-2.5 text-xs text-fg/55">Lihat hasilnya langsung di pratinjau. Jika ada layar yang terlalu penuh, turunkan skala sedikit.</p>
                </Card>
                <Card title="Animasi & keyboard">
                  <div className="space-y-4">
                    <Switch checked={config.animationsEnabled} onChange={(value) => set("animationsEnabled", value)} label="Animasi dan transisi" hint="Matikan bila komputer kiosk terasa berat." />
                    <Slider label="Ukuran keyboard layar" value={config.keyboardScale} min={80} max={140} onChange={(value) => set("keyboardScale", value)} hint="Keyboard virtual di form WhatsApp/email dan voucher." />
                  </div>
                </Card>
              </>
            )}

            {tab === "texts" && (
              <Card title="Judul tiap layar" description="Kosongkan kolom untuk memakai teks bawaan (ditampilkan sebagai contoh di kolom).">
                <div className="grid gap-4 md:grid-cols-2">
                  {SCREEN_TEXTS.map((item) => (
                    <Field key={item.key} label={item.label}>
                      <input className={inputClass} placeholder={item.fallback} value={String(config[item.key] ?? "")} onChange={(event) => set(item.key, event.target.value as never)} />
                    </Field>
                  ))}
                </div>
              </Card>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <KioskPreviewFrame focusStage={activeTab.stage} stickyTop={16} />
    </div>
  );
}
