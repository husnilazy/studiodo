import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useBoothConfig, type BoothConfig } from "@/lib/boothConfigStore";
import { inputClass, sectionClass } from "@/lib/adminUi";
import { pushToast } from "@/lib/toastStore";
import Spinner from "@/components/Spinner";
import { PAPER_OPTIONS, printLayoutFromConfig } from "@/lib/printLayout";

type PrinterDraft = Pick<BoothConfig, "offlineModeEnabled" | "autoPrintEnabled" | "printerName" | "printCopies" | "printPaperSize" | "printFit" | "printMarginMm" | "printTwoUp">;
const pickDraft = (config: BoothConfig): PrinterDraft => ({
  offlineModeEnabled: config.offlineModeEnabled,
  autoPrintEnabled: config.autoPrintEnabled,
  printerName: config.printerName,
  printCopies: config.printCopies,
  printPaperSize: config.printPaperSize ?? "4r",
  printFit: config.printFit ?? "cover",
  printMarginMm: config.printMarginMm ?? 0,
  printTwoUp: Boolean(config.printTwoUp),
});

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm text-fg/60">{label}</span>
      {children}
    </label>
  );
}

// Separated out of DeviceSettings.tsx (Fase 11) — see CameraSettings.tsx for why.
export default function PrinterSettings() {
  const { config, update } = useBoothConfig();
  const [draft, setDraft] = useState<PrinterDraft>(() => pickDraft(config));
  const set = <K extends keyof PrinterDraft>(key: K, value: PrinterDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const dirty = (Object.keys(draft) as (keyof PrinterDraft)[]).some((key) => draft[key] !== config[key]);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"print" | "extra" | "guide">("print");

  const save = () => {
    setSaving(true);
    update(draft);
    pushToast({ type: "success", title: "Pengaturan printer tersimpan" });
    setSaving(false);
  };
  const cancel = () => setDraft(pickDraft(config));

  const [printers, setPrinters] = useState<{ name: string; displayName: string; isDefault: boolean }[]>([]);
  const [printersError, setPrintersError] = useState<string | null>(null);
  const [testPrintStatus, setTestPrintStatus] = useState<"idle" | "printing" | "ok" | "error">("idle");
  const [testPrintError, setTestPrintError] = useState<string | null>(null);
  const [additionalPrintSaved, setAdditionalPrintSaved] = useState(false);
  const [additionalPrintConfig, setAdditionalPrintConfig] = useState({ enabled: true, label: "Tambah print 4R", price: 15000, max: 5 });

  useEffect(() => {
    if (!window.studiodo?.listPrinters) return;
    window.studiodo.listPrinters().then((result) => {
      if (result.ok) {
        setPrinters(result.printers);
        if (!config.printerName) {
          const epsonPrinter = result.printers.find((printer) => /epson.*l8050|l8050.*epson/i.test(`${printer.name} ${printer.displayName}`));
          // Hardware autodetect default-fill, not an admin edit — commits
          // straight to the store like before, and mirrors into the draft so
          // the staged form shows it immediately without marking it "dirty".
          if (epsonPrinter) {
            update({ printerName: epsonPrinter.name });
            setDraft((current) => ({ ...current, printerName: epsonPrinter.name }));
          }
        }
      }
      else setPrintersError(result.error ?? "Gagal membaca daftar printer");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.getPrintingConfig().then((result) => { if (result) setAdditionalPrintConfig(result); }).catch((error) => console.error("Gagal memuat konfigurasi print tambahan", error));
  }, []);

  const runTestPrint = async () => {
    if (!window.studiodo?.printImage) {
      setTestPrintStatus("error");
      setTestPrintError("Fitur cetak hanya tersedia di aplikasi desktop STUDIODO (Electron), bukan di browser biasa.");
      return;
    }
    setTestPrintStatus("printing");
    setTestPrintError(null);
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1800;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = config.accentColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 72px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("TEST PRINT", canvas.width / 2, canvas.height / 2 - 40);
    ctx.font = "40px sans-serif";
    ctx.fillText(config.brandName, canvas.width / 2, canvas.height / 2 + 40);
    ctx.font = "28px sans-serif";
    ctx.fillText(`${PAPER_OPTIONS.find((p) => p.id === draft.printPaperSize)?.label ?? "4R"} · ${draft.printFit === "contain" ? "utuh" : "isi penuh"} · margin ${draft.printMarginMm} mm`, canvas.width / 2, canvas.height / 2 + 100);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    const result = await window.studiodo.printImage({ dataUrl, printerName: draft.printerName, copies: 1, ...printLayoutFromConfig(draft) });
    if (result.ok) setTestPrintStatus("ok");
    else {
      setTestPrintStatus("error");
      setTestPrintError(result.error ?? "Print gagal");
    }
  };

  const saveAdditionalPrintConfig = async () => {
    try {
      const savedConfig = await api.updatePrintingConfig(additionalPrintConfig);
      if (savedConfig) setAdditionalPrintConfig(savedConfig);
      setAdditionalPrintSaved(true);
      pushToast({ type: "success", title: "Additional print tersimpan" });
      window.setTimeout(() => setAdditionalPrintSaved(false), 1800);
    } catch (error) {
      pushToast({ type: "error", title: "Gagal menyimpan additional print", sub: error instanceof Error ? error.message : undefined });
    }
  };

  const applyPreset = (preset: Partial<PrinterDraft>, nameMatch: RegExp) => {
    const match = printers.find((printer) => nameMatch.test(`${printer.name} ${printer.displayName}`));
    setDraft((current) => ({ ...current, ...preset, ...(match ? { printerName: match.name } : {}) }));
    pushToast({ type: "success", title: "Preset diterapkan ke form", sub: match ? `Printer terdeteksi: ${match.displayName || match.name}. Klik Simpan.` : "Printer belum terdeteksi di daftar; pilih manual lalu Simpan." });
  };

  const guides = [
    {
      name: "DNP (dye-sub)", models: "DS620, DS820, DS40, QW410, RX1", preset: { printPaperSize: "4r", printFit: "cover", printMarginMm: 0, printTwoUp: false } as Partial<PrinterDraft>, match: /dnp|ds\d{2,3}|qw410|rx1/i,
      steps: ["Pasang driver DNP dari situs resmi, sambungkan USB, dan nyalakan printer.", "Di Windows: Printers & scanners > printer DNP > Printing preferences. Pilih ukuran kertas yang sama dengan media yang terpasang (mis. 4x6 in / 4x6 PR).", "Matikan fitur scaling / fit to page di driver agar gambar tidak diperkecil; aktifkan matte atau glossy sesuai selera.", "Untuk strip 2x6: pakai opsi \"2 inch cut\" di driver, ATAU aktifkan \"2 strip per lembar\" di STUDIODO. Pilih salah satu saja agar tidak tercetak 4 strip.", "Klik Test print. Jika ada tepi putih, set margin 0 dan mode Isi penuh."],
    },
    {
      name: "HiTi (dye-sub)", models: "P525L, P525W, P720L, P750L", preset: { printPaperSize: "4r", printFit: "cover", printMarginMm: 0, printTwoUp: false } as Partial<PrinterDraft>, match: /hiti|p5\d{2}|p7\d{2}/i,
      steps: ["Pasang driver HiTi dan pastikan cartridge pita serta kertas satu set sesuai ukuran (4x6 in).", "Printing preferences: pilih ukuran 4x6 in dan arah Portrait. Matikan scaling bila ada.", "Jika hasil terpotong sedikit di tepi, ganti Fit ke Utuh atau beri margin 1-2 mm.", "Jalankan Test print sebelum event dan cek kertas tidak macet."],
    },
    {
      name: "Epson (inkjet)", models: "L8050, L18050, L805, L1800 (seri L / EcoTank)", preset: { printPaperSize: "4r", printFit: "cover", printMarginMm: 0, printTwoUp: false } as Partial<PrinterDraft>, match: /epson/i,
      steps: ["Pasang driver Epson. Isi kertas foto (mis. Premium Glossy Photo Paper) dengan sisi cetak menghadap yang benar.", "Printing preferences: Paper Size = 4x6 in (atau 4R) dan aktifkan Borderless bila ada; Paper Type = jenis kertas foto; Quality = Photo / High.", "Inkjet butuh waktu kering: ambil hasil setelah selesai, jangan ditumpuk langsung.", "Bila ada tepi putih tipis, pastikan Borderless aktif di driver dan margin STUDIODO = 0. Cek tinta secara berkala (Epson Status Monitor)."],
    },
  ];

  return (
    <div className="flex flex-col items-stretch gap-4">
      <nav className="flex gap-1 self-start rounded-full border border-fg/10 bg-fg/[0.05] p-1" aria-label="Pengaturan printer">
        {([["print", "Cetak"], ["extra", "Print tambahan & Offline"], ["guide", "Panduan printer"]] as const).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${tab === id ? "bg-fg text-canvas shadow-md" : "text-fg/55 hover:text-fg"}`}>{label}</button>
        ))}
      </nav>

      {tab === "print" && (
        <div className="grid items-start gap-5 xl:grid-cols-2">
          <section className={sectionClass}>
            <p className="eyebrow">PRINTER</p>
            <h2 className="font-display text-xl font-semibold">Printer &amp; jumlah cetak</h2>
            <div className="mt-4 space-y-4">
              <Field label="Printer">
                <select className={inputClass} value={draft.printerName ?? ""} onChange={(e) => set("printerName", e.target.value || null)}>
                  <option value="">Printer default sistem</option>
                  {printers.map((printer) => (
                    <option key={printer.name} value={printer.name}>
                      {printer.displayName || printer.name}{printer.isDefault ? " (default)" : ""}
                    </option>
                  ))}
                </select>
                {printersError && <p className="mt-1 text-xs text-red-300">{printersError}</p>}
                {!window.studiodo?.listPrinters && <p className="mt-1 text-xs text-fg/40">Daftar printer hanya bisa dibaca dari aplikasi desktop STUDIODO (Electron).</p>}
              </Field>
              <Field label="Jumlah salinan per sesi">
                <input type="number" min={1} max={10} className={inputClass} value={draft.printCopies} onChange={(e) => set("printCopies", Math.max(1, Math.min(10, Number(e.target.value))))} />
              </Field>
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={draft.autoPrintEnabled} onChange={(e) => set("autoPrintEnabled", e.target.checked)} />
                <span className="text-sm text-fg/70">Cetak otomatis begitu hasil selesai dirender (tanpa perlu tekan tombol Print)</span>
              </label>
              <div className="flex items-center gap-3">
                <button type="button" onClick={runTestPrint} disabled={testPrintStatus === "printing"} className="rounded-xl border border-fg/15 px-4 py-2 text-sm hover:border-accent disabled:opacity-50">
                  {testPrintStatus === "printing" ? "Mencetak..." : "Test print"}
                </button>
                {testPrintStatus === "ok" && <span className="text-xs text-emerald-300">● Terkirim ke printer</span>}
                {testPrintStatus === "error" && <span className="text-xs text-red-300">● {testPrintError}</span>}
              </div>
            </div>
          </section>

          <section className={sectionClass}>
            <p className="eyebrow">TATA LETAK CETAK</p>
            <h2 className="font-display text-xl font-semibold">Ukuran kertas &amp; hasil cetak</h2>
            <p className="mt-1 text-sm text-[var(--kiosk-muted)]">Samakan dengan kertas yang terpasang dan ukuran di Printing preferences driver Windows.</p>
            <div className="mt-4 space-y-4">
              <Field label="Ukuran kertas">
                <select className={inputClass} value={draft.printPaperSize} onChange={(e) => set("printPaperSize", e.target.value as PrinterDraft["printPaperSize"])}>
                  {PAPER_OPTIONS.map((paper) => <option key={paper.id} value={paper.id}>{paper.label} ({paper.size})</option>)}
                </select>
              </Field>
              <div>
                <span className="text-sm text-fg/60">Penyesuaian gambar</span>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {([["cover", "Isi penuh", "Tanpa tepi putih, tepi gambar bisa terpotong."], ["contain", "Utuh", "Seluruh gambar terlihat, bisa ada tepi putih."]] as const).map(([id, label, hint]) => (
                    <button key={id} type="button" onClick={() => set("printFit", id)} className={`rounded-xl border p-3 text-left transition ${draft.printFit === id ? "border-accent bg-accent/10" : "border-fg/15 hover:border-fg/35"}`}>
                      <p className="text-sm font-semibold">{label}</p>
                      <p className="mt-0.5 text-[11px] text-fg/50">{hint}</p>
                    </button>
                  ))}
                </div>
              </div>
              <Field label={`Margin putih: ${draft.printMarginMm} mm${draft.printMarginMm === 0 ? " (tanpa border)" : ""}`}>
                <input type="range" min={0} max={10} step={1} value={draft.printMarginMm} onChange={(e) => set("printMarginMm", Number(e.target.value))} className="mt-2 w-full accent-[var(--accent,#4f46e5)]" />
              </Field>
              <label className="flex items-start gap-3">
                <input type="checkbox" className="mt-1" checked={draft.printTwoUp} onChange={(e) => set("printTwoUp", e.target.checked)} />
                <span className="text-sm text-fg/70">Cetak 2 strip per lembar <span className="block text-xs text-fg/45">Strip dicetak dua kali berdampingan lalu dipotong dua (strip 2x6 di kertas 4R). Jangan dipakai bersamaan dengan "2 inch cut" di driver DNP.</span></span>
              </label>
            </div>
          </section>

          <div className="flex items-center gap-3 xl:col-span-2">
            <button type="button" onClick={save} disabled={saving || !dirty} className="flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">
              {saving && <Spinner size="sm" />}
              {saving ? "Menyimpan…" : "Simpan"}
            </button>
            {dirty && <button type="button" onClick={cancel} className="text-sm text-fg/50 hover:text-fg">Batalkan perubahan</button>}
          </div>
        </div>
      )}

      {tab === "extra" && (
        <div className="grid items-start gap-5 xl:grid-cols-2">
          <section className={sectionClass}>
            <p className="eyebrow">PENJUALAN</p>
            <h2 className="font-display text-xl font-semibold">Additional Print</h2>
            <p className="mt-1 text-sm text-[var(--kiosk-muted)]">Customer dapat membeli lembar 4R tambahan dari halaman hasil setelah sesi utama lunas.</p>
            <label className="mt-4 flex items-center gap-3">
              <input type="checkbox" checked={additionalPrintConfig.enabled} onChange={(e) => setAdditionalPrintConfig({ ...additionalPrintConfig, enabled: e.target.checked })} />
              <span className="text-sm text-fg/70">Aktifkan pembelian print tambahan</span>
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Field label="Label customer"><input className={inputClass} value={additionalPrintConfig.label} onChange={(e) => setAdditionalPrintConfig({ ...additionalPrintConfig, label: e.target.value })} /></Field>
              <Field label="Harga per lembar"><input className={inputClass} type="number" min={0} value={additionalPrintConfig.price} onChange={(e) => setAdditionalPrintConfig({ ...additionalPrintConfig, price: Math.max(0, Number(e.target.value) || 0) })} /></Field>
              <Field label="Maksimal per transaksi"><input className={inputClass} type="number" min={1} max={20} value={additionalPrintConfig.max} onChange={(e) => setAdditionalPrintConfig({ ...additionalPrintConfig, max: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} /></Field>
            </div>
            <button type="button" onClick={saveAdditionalPrintConfig} className="mt-3 rounded-xl bg-accent px-4 py-2 text-sm font-semibold">{additionalPrintSaved ? "Tersimpan" : "Simpan additional print"}</button>
          </section>
          <section className={sectionClass}>
            <p className="eyebrow">OFFLINE</p>
            <h2 className="font-display text-xl font-semibold">Offline Mode</h2>
            <label className="mt-4 flex items-center gap-3">
              <input type="checkbox" checked={draft.offlineModeEnabled} onChange={(e) => set("offlineModeEnabled", e.target.checked)} />
              <span className="text-sm text-fg/70">Izinkan Offline Mode (paket terakhir, bayar manual, foto dan print lokal)</span>
            </label>
            <div className="mt-4 flex items-center gap-3">
              <button type="button" onClick={save} disabled={saving || !dirty} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">Simpan</button>
              {dirty && <button type="button" onClick={cancel} className="text-sm text-fg/50 hover:text-fg">Batalkan perubahan</button>}
            </div>
          </section>
        </div>
      )}

      {tab === "guide" && (
        <section className={sectionClass}>
          <p className="eyebrow">PANDUAN</p>
          <h2 className="font-display text-xl font-semibold">Menyambungkan printer foto</h2>
          <p className="mt-1 text-sm text-[var(--kiosk-muted)]">STUDIODO mencetak lewat driver Windows, jadi printer harus terpasang dulu di Windows. Nama menu bisa sedikit berbeda antar versi driver.</p>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {guides.map((guide) => (
              <details key={guide.name} className="group rounded-2xl border border-fg/10 bg-fg/[0.03] p-4" open={guide.name.startsWith("DNP")}>
                <summary className="cursor-pointer list-none">
                  <p className="text-sm font-semibold">{guide.name}</p>
                  <p className="mt-0.5 text-xs text-fg/45">Contoh model: {guide.models}</p>
                </summary>
                <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-fg/60">
                  {guide.steps.map((step) => <li key={step}>{step}</li>)}
                </ol>
                <button type="button" onClick={() => { applyPreset(guide.preset, guide.match); setTab("print"); }} className="mt-3 rounded-lg border border-fg/15 px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-fg">Terapkan preset {guide.name.split(" ")[0]}</button>
              </details>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-amber-400/25 bg-amber-500/[0.06] p-3 text-xs leading-relaxed text-fg/60">
            <p className="font-semibold text-amber-600">Kalau cetakan bermasalah</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              <li>Printer tidak ada di daftar: cek kabel USB / daya, lalu buka aplikasi desktop STUDIODO (daftar printer tidak terbaca di browser biasa).</li>
              <li>Hasil terpotong atau mengecil: samakan ukuran kertas di sini dengan driver Windows dan matikan scaling di driver.</li>
              <li>Antrean macet: buka Printers &amp; scanners di Windows, hapus job yang menggantung, lalu Test print lagi.</li>
              <li>Preset hanya mengisi form (ukuran kertas, penyesuaian, margin); klik Simpan di tab Cetak agar berlaku.</li>
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
