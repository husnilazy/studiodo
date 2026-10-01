import { useRef, useState } from "react";
import { useBoothConfig, applyThemePreset, type BoothConfig } from "@/lib/boothConfigStore";
import { FONT_PAIRINGS } from "@/lib/fontPairings";
import { Link } from "wouter";
import { inputClass, sectionClass } from "@/lib/adminUi";
import { pushToast } from "@/lib/toastStore";

type PreviewStage = "idle" | "packages" | "payment" | "capture" | "preview" | "frame" | "result";

const previewStages: { value: PreviewStage; label: string; hint: string }[] = [
  { value: "idle", label: "Awal", hint: "Customer mulai dari layar pembuka." },
  { value: "packages", label: "Paket", hint: "Customer memilih paket foto." },
  { value: "payment", label: "Bayar", hint: "Customer menyelesaikan pembayaran." },
  { value: "capture", label: "Sesi foto", hint: "Customer mengikuti arahan pengambilan foto." },
  { value: "preview", label: "Edit", hint: "Customer memeriksa dan mengedit hasil." },
  { value: "frame", label: "Frame", hint: "Customer memilih frame favorit." },
  { value: "result", label: "Hasil", hint: "Customer mengunduh atau mencetak hasil." },
];

function KioskPreview({ config }: { config: BoothConfig }) {
  const [stage, setStage] = useState<PreviewStage>("idle");
  const [ratio, setRatio] = useState<"portrait" | "landscape" | "square">("portrait");
  const [buttonSize, setButtonSize] = useState<"small" | "medium" | "large">("medium");
  const stageInfo = previewStages.find((item) => item.value === stage) ?? previewStages[0];
  const buttonRadius = config.buttonStyle === "pill" ? "999px" : config.buttonStyle === "square" ? "4px" : "14px";
  const compact = config.kioskDensity === "compact";
  const previewFrame = ratio === "portrait" ? "aspect-[3/4]" : ratio === "landscape" ? "aspect-[16/10]" : "aspect-square";
  const buttonPadding = buttonSize === "small" ? "px-3 py-1.5 text-[10px]" : buttonSize === "large" ? "px-5 py-3 text-sm" : "px-4 py-2 text-xs";
  const previewButton = { borderRadius: buttonRadius, backgroundColor: config.accentColor, color: config.textColor };

  return (
    <aside className="xl:sticky xl:top-6 xl:self-start">
      <div className="overflow-hidden rounded-2xl border border-accent/30 bg-black/60 shadow-2xl shadow-black/30">
        <div className="flex items-center justify-between border-b border-fg/10 px-4 py-3">
          <div>
            <p className="eyebrow">LIVE PREVIEW</p>
            <h2 className="font-display text-lg font-semibold">Kiosk Preview</h2>
          </div>
          <span className="rounded-full border border-emerald-300/30 px-2 py-1 text-[10px] text-emerald-200">Draft</span>
        </div>
        <div className="border-b border-fg/10 p-3">
          <p className="mb-2 text-[11px] uppercase tracking-[0.16em] text-fg/40">Rasio layar</p>
          <div className="grid grid-cols-3 gap-2">
            {(["portrait", "landscape", "square"] as const).map((value) => (
              <button key={value} type="button" onClick={() => setRatio(value)} className={`rounded-lg border px-2 py-2 text-xs ${ratio === value ? "border-accent bg-accent/15 text-fg" : "border-fg/10 text-fg/50"}`}>
                {value === "portrait" ? "Portrait" : value === "landscape" ? "Landscape" : "Square"}
              </button>
            ))}
          </div>
          <p className="mb-2 mt-3 text-[11px] uppercase tracking-[0.16em] text-fg/40">Ukuran tombol</p>
          <div className="grid grid-cols-3 gap-2">
            {(["small", "medium", "large"] as const).map((value) => (
              <button key={value} type="button" onClick={() => setButtonSize(value)} className={`rounded-lg border px-2 py-2 text-xs ${buttonSize === value ? "border-accent bg-accent/15 text-fg" : "border-fg/10 text-fg/50"}`}>
                {value === "small" ? "Kecil" : value === "medium" ? "Normal" : "Besar"}
              </button>
            ))}
          </div>
        </div>
        <div className="border-b border-fg/10 p-3">
          <p className="mb-2 text-[11px] uppercase tracking-[0.16em] text-fg/40">Alur customer</p>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {previewStages.map((item, index) => (
              <button key={item.value} type="button" onClick={() => setStage(item.value)} className={`min-w-14 rounded-lg border px-2 py-2 text-[10px] ${stage === item.value ? "border-accent bg-accent/15 text-fg" : "border-fg/10 text-fg/45"}`}>
                <span className="block text-[9px] text-fg/35">0{index + 1}</span>
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className={`mx-auto my-5 flex ${previewFrame} w-[calc(100%-28px)] max-w-[440px] flex-col overflow-hidden border border-fg/15 bg-[var(--kiosk-background)] shadow-2xl shadow-black/40`} style={{ color: config.textColor, fontFamily: (FONT_PAIRINGS[config.fontPairing] ?? FONT_PAIRINGS.classic).display }}>
          <div className="flex items-center justify-between border-b border-fg/10 px-3 py-2 text-[9px] text-fg/45">
            <span>{config.brandName || "STUDIODO"}</span><span>{stageInfo.label}</span>
          </div>
          <div className={`flex min-h-0 flex-1 flex-col items-center justify-center px-4 text-center ${compact ? "gap-3" : "gap-5"}`}>
            {stage === "idle" && <><span className="text-[9px] uppercase tracking-[0.2em] text-accent">{config.tagline}</span><h3 className="font-display text-2xl font-bold">{config.idleHeadline}</h3><p className="text-[10px] text-fg/50">{config.idleSubheadline}</p><button type="button" style={previewButton} className={`${buttonPadding} font-semibold`}>{config.idleStartText}</button></>}
            {stage === "packages" && <><p className="text-[9px] uppercase tracking-[0.2em] text-accent">01 / SELECT YOUR MOMENT</p><h3 className="font-display text-xl font-bold">{config.packageHeadline}</h3><div className="w-full space-y-2"><div className="rounded-lg border border-fg/10 p-2 text-left"><p className="text-xs font-semibold">Basic</p><p className="mt-1 text-[9px] text-fg/45">3 foto · Rp 50.000</p></div><button type="button" style={previewButton} className={`w-full ${buttonPadding} font-semibold`}>Pilih paket</button></div></>}
            {stage === "payment" && <><p className="text-[9px] uppercase tracking-[0.2em] text-accent">03 / SECURE CHECKOUT</p><h3 className="font-display text-xl font-bold">{config.paymentHeadline}</h3><div className="rounded-lg border border-fg/10 px-5 py-4 text-[10px] text-fg/55">QRIS PREVIEW</div><button type="button" style={previewButton} className={`${buttonPadding} font-semibold`}>Saya sudah bayar</button></>}
            {stage === "capture" && <><p className="text-[9px] uppercase tracking-[0.2em] text-accent">PHOTO SESSION</p><h3 className="font-display text-xl font-bold">{config.captureHeadline}</h3><div className="flex w-full flex-1 items-center justify-center rounded-lg bg-black/70 text-2xl">📷</div><p className="text-[10px] text-fg/50">Ikuti countdown, lalu tekan tombol capture.</p><button type="button" style={previewButton} className={`${buttonPadding} font-semibold`}>Ambil foto</button></>}
            {stage === "preview" && <><p className="text-[9px] uppercase tracking-[0.2em] text-accent">04 / REVIEW</p><h3 className="font-display text-xl font-bold">{config.previewHeadline}</h3><div className="grid w-full flex-1 grid-cols-2 gap-1 rounded-lg bg-fg/10 p-2"><div className="rounded bg-fg/15" /><div className="rounded bg-fg/15" /><div className="rounded bg-fg/15" /><div className="rounded bg-fg/15" /></div><button type="button" style={previewButton} className={`${buttonPadding} font-semibold`}>Edit hasil</button></>}
            {stage === "frame" && <><p className="text-[9px] uppercase tracking-[0.2em] text-accent">05 / FRAME</p><h3 className="font-display text-xl font-bold">{config.frameHeadline}</h3><div className="flex w-1/2 flex-1 items-center justify-center rounded-lg border border-fg/15 bg-fg/10 text-[10px] text-fg/40">Frame PNG</div><button type="button" style={previewButton} className={`${buttonPadding} font-semibold`}>Pilih frame</button></>}
            {stage === "result" && <><p className="text-[9px] uppercase tracking-[0.2em] text-accent">06 / COMPLETE</p><h3 className="font-display text-xl font-bold">{config.resultHeadline}</h3><div className="flex w-1/2 flex-1 items-center justify-center rounded-lg bg-fg/10 text-[10px] text-fg/40">HASIL FOTO</div><button type="button" style={previewButton} className={`${buttonPadding} font-semibold`}>Download hasil</button></>}
          </div>
          <div className="border-t border-fg/10 px-3 py-2 text-center text-[9px] text-fg/35">{stageInfo.hint}</div>
        </div>
      </div>
    </aside>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm text-fg/60">{label}</span>
      {children}
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="mt-1 flex gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-14 rounded-lg bg-transparent" />
        <input className={inputClass.replace("mt-1 ", "")} value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </Field>
  );
}

// Fase 9: dulu "Control Center" satu halaman ini punya 5 tab (Tampilan kiosk,
// Kamera, Frame & output, Paket & pembayaran, Printer) dicampur jadi satu —
// membingungkan karena "Kustomisasi Kiosk" seharusnya cuma soal branding/
// tampilan, bukan harga atau perangkat fisik. Sekarang halaman ini murni
// branding; Kamera+Printer pindah ke sidebar "Kiosk" (CameraSettings.tsx / PrinterSettings.tsx),
// Paket & pembayaran pindah ke "Finance" (PaymentSettings.tsx), dan Frame &
// output (yang sebagian sudah duplikat dengan FrameManagement.tsx) digabung
// ke "Kelola Frame".
export default function AdminPlaceholder() {
  const { config, update, reset } = useBoothConfig();
  const saveToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Every field applies instantly (the live Kiosk Preview panel needs to
  // reflect edits as they're made, not after a separate "save" step) — but
  // that used to give the admin NO confirmation at all that a change took
  // effect. Debounced so a color-drag or fast typing doesn't spam one toast
  // per keystroke; one confirmation shows up once the admin pauses.
  const set = <K extends keyof BoothConfig>(key: K, value: BoothConfig[K]) => {
    update({ [key]: value } as Partial<BoothConfig>);
    if (saveToastTimer.current) clearTimeout(saveToastTimer.current);
    saveToastTimer.current = setTimeout(() => pushToast({ type: "success", title: "Tampilan tersimpan" }), 700);
  };

  // reset() wipes the ENTIRE booth config, not just the branding fields
  // visible on this tab — it also silently resets Camera/Printer settings
  // the admin can't see from here, so this needs a confirmation.
  const confirmReset = () => {
    if (window.confirm("Reset SEMUA pengaturan kiosk (termasuk kamera & printer) ke default?")) {
      reset();
      pushToast({ type: "success", title: "Pengaturan kiosk direset ke default" });
    }
  };

  const readMedia = (file: File, key: "idleCoverUrl" | "idleBannerUrl") => {
    const reader = new FileReader();
    reader.onload = () => set(key, String(reader.result));
    reader.readAsDataURL(file);
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-8 text-[var(--kiosk-text)] md:px-10">
      <div className="mx-auto max-w-[1500px]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-accent">STUDIODO Control Center</p>
            <h1 className="mt-2 font-display text-4xl font-bold">Kustomisasi Kiosk</h1>
            <p className="mt-2 max-w-2xl text-[var(--kiosk-muted)]">
              Branding, idle screen, dan gaya UI kiosk. Semua perubahan tersimpan lokal di booth ini dan langsung terlihat di layar kiosk.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/customers" className="border border-fg/15 px-4 py-2 text-sm text-fg/70 hover:text-fg">
              Customer
            </Link>
            <button onClick={confirmReset} className="border border-fg/15 px-4 py-2 text-sm text-fg/60 hover:text-fg">
              Reset default
            </button>
          </div>
        </div>

        <div className="mt-8 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_440px] xl:gap-8">
          <div className="flex flex-col items-stretch gap-5">
            <section className={`${sectionClass} lg:col-span-2`}>
              <h2 className="font-display text-xl font-semibold">Idle Screen & Pop-up Banner</h2>
              <p className="mt-1 text-sm text-[var(--kiosk-muted)]">Atur tampilan default branding, cover foto/video, dan banner promo saat kiosk menunggu.</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field label="Cover idle (gambar / video)">
                  <input className={inputClass} type="file" accept="image/*,video/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) { set("idleCoverType", file.type.startsWith("video/") ? "video" : "image"); readMedia(file, "idleCoverUrl"); } }} />
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => set("idleCoverUrl", null)} className="text-xs text-red-300">Hapus cover</button>
                    <span className="text-xs text-fg/40">{config.idleCoverUrl ? `Cover ${config.idleCoverType} aktif` : "Cover default gradient"}</span>
                  </div>
                </Field>
                <Field label="Pop-up / banner promo">
                  <input className={inputClass} type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) readMedia(file, "idleBannerUrl"); }} />
                  <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={config.idleBannerEnabled} onChange={(event) => set("idleBannerEnabled", event.target.checked)} /> Tampilkan banner</label>
                </Field>
              </div>
            </section>

            <section className={sectionClass}>
              <h2 className="font-display text-xl font-semibold">Branding</h2>
              <div className="mt-4 space-y-4">
                <Field label="Nama brand">
                  <input className={inputClass} value={config.brandName} onChange={(e) => set("brandName", e.target.value)} />
                </Field>
                <Field label="Tagline">
                  <input className={inputClass} value={config.tagline} onChange={(e) => set("tagline", e.target.value)} />
                </Field>
                <Field label="Teks promo idle">
                  <input className={inputClass} value={config.promoText} onChange={(e) => set("promoText", e.target.value)} />
                </Field>
                <Field label="Logo PNG">
                  <input className={inputClass} type="file" accept="image/png" onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => set("logoUrl", String(reader.result));
                    reader.readAsDataURL(file);
                  }} />
                  {config.logoUrl && <img src={config.logoUrl} className="mt-3 h-16 w-auto rounded-lg bg-fg/10 p-2 object-contain" />}
                </Field>
                <Field label={`Ukuran logo (${config.logoScale}%)`}>
                  <input type="range" min={60} max={180} value={config.logoScale} onChange={(e) => set("logoScale", Number(e.target.value))} className="mt-3 w-full accent-[var(--accent)]" />
                </Field>
              </div>
            </section>

            <section className={sectionClass}>
              <h2 className="font-display text-xl font-semibold">Warna & Tipografi</h2>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <div className="inline-flex rounded-xl border border-fg/15 p-1">
                  {([["dark", "Gelap (Warm Dark)"], ["light", "Terang (Warm Light)"]] as const).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => set("themeMode", mode)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${config.themeMode === mode ? "bg-accent text-white" : "text-fg/60 hover:text-fg"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => applyThemePreset(config.themeMode)}
                  className="text-xs text-fg/50 underline decoration-dotted hover:text-fg/80"
                >
                  Reset warna ke preset {config.themeMode === "dark" ? "gelap" : "terang"}
                </button>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <ColorField label="Warna aksen" value={config.accentColor} onChange={(v) => set("accentColor", v)} />
                <ColorField label="Background kiosk" value={config.backgroundColor} onChange={(v) => set("backgroundColor", v)} />
                <ColorField label="Gradient mulai" value={config.backgroundGradientStart} onChange={(v) => set("backgroundGradientStart", v)} />
                <ColorField label="Gradient akhir" value={config.backgroundGradientEnd} onChange={(v) => set("backgroundGradientEnd", v)} />
                <ColorField label="Surface kartu" value={config.surfaceColor} onChange={(v) => set("surfaceColor", v)} />
                <ColorField label="Warna teks" value={config.textColor} onChange={(v) => set("textColor", v)} />
                <ColorField label="Teks sekunder" value={config.mutedTextColor} onChange={(v) => set("mutedTextColor", v)} />
                <Field label="Font pairing">
                  <select className={inputClass} value={config.fontPairing} onChange={(e) => set("fontPairing", e.target.value as BoothConfig["fontPairing"])}>
                    {Object.entries(FONT_PAIRINGS).map(([key, def]) => <option key={key} value={key}>{def.label}</option>)}
                  </select>
                </Field>
              </div>
            </section>

            <section className={sectionClass}>
              <h2 className="font-display text-xl font-semibold">Gaya UI Kiosk</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Bentuk tombol">
                  <select className={inputClass} value={config.buttonStyle} onChange={(e) => set("buttonStyle", e.target.value as BoothConfig["buttonStyle"])}>
                    <option value="rounded">Rounded</option>
                    <option value="pill">Pill</option>
                    <option value="square">Square</option>
                  </select>
                </Field>
                <Field label="Kepadatan layout">
                  <select className={inputClass} value={config.kioskDensity} onChange={(e) => set("kioskDensity", e.target.value as BoothConfig["kioskDensity"])}>
                    <option value="comfortable">Comfortable</option>
                    <option value="compact">Compact</option>
                  </select>
                </Field>
                <Field label="Layout per sesi foto">
                  <select className={inputClass} value={config.sessionLayout ?? "immersive"} onChange={(e) => set("sessionLayout", e.target.value as BoothConfig["sessionLayout"])}>
                    <option value="immersive">Immersive — fokus visual</option>
                    <option value="split">Split — kamera + panel kontrol</option>
                    <option value="centered">Centered — fokus tengah</option>
                    <option value="gallery">Gallery — thumbnail dan hasil lebih dominan</option>
                  </select>
                </Field>
                <label className="flex items-center gap-3 sm:col-span-2">
                  <input type="checkbox" checked={config.animationsEnabled} onChange={(e) => set("animationsEnabled", e.target.checked)} />
                  <span className="text-sm text-fg/70">Aktifkan animasi dan transisi</span>
                </label>
                <label className="flex items-center gap-3 sm:col-span-2">
                  <input type="checkbox" checked={config.backgroundGradientEnabled} onChange={(e) => set("backgroundGradientEnabled", e.target.checked)} />
                  <span className="text-sm text-fg/70">Aktifkan gradient background</span>
                </label>
                <Field label={`Ukuran virtual keyboard (${config.keyboardScale}%)`}>
                  <input type="range" min={80} max={140} value={config.keyboardScale} onChange={(e) => set("keyboardScale", Number(e.target.value))} className="mt-3 w-full accent-[var(--accent)]" />
                </Field>
              </div>
              <div className="mt-5 rounded-xl border border-fg/10 p-4" style={{ backgroundColor: "var(--kiosk-surface)" }}>
                <p className="text-sm text-[var(--kiosk-muted)]">Live preview</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button className="bg-accent px-5 py-2 font-semibold">Tombol utama</button>
                  <button className="border border-fg/20 px-5 py-2">Tombol sekunder</button>
                </div>
              </div>
            </section>
          </div>
          <KioskPreview config={config} />
        </div>
      </div>
    </div>
  );
}
