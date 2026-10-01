import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useBoothConfig, type BoothConfig } from "@/lib/boothConfigStore";
import { inputClass, sectionClass } from "@/lib/adminUi";
import { pushToast } from "@/lib/toastStore";
import Spinner from "@/components/Spinner";

type PrinterDraft = Pick<BoothConfig, "offlineModeEnabled" | "autoPrintEnabled" | "printerName" | "printCopies">;
const pickDraft = (config: BoothConfig): PrinterDraft => ({
  offlineModeEnabled: config.offlineModeEnabled,
  autoPrintEnabled: config.autoPrintEnabled,
  printerName: config.printerName,
  printCopies: config.printCopies,
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
    ctx.fillText("4R · 10.2 x 15.2 cm", canvas.width / 2, canvas.height / 2 + 100);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    const result = await window.studiodo.printImage({ dataUrl, printerName: draft.printerName, copies: 1 });
    if (result.ok) setTestPrintStatus("ok");
    else {
      setTestPrintStatus("error");
      setTestPrintError(result.error ?? "Print gagal");
    }
  };

  const saveAdditionalPrintConfig = async () => {
    const savedConfig = await api.updatePrintingConfig(additionalPrintConfig);
    if (savedConfig) setAdditionalPrintConfig(savedConfig);
    setAdditionalPrintSaved(true);
    pushToast({ type: "success", title: "Additional print tersimpan" });
    window.setTimeout(() => setAdditionalPrintSaved(false), 1800);
  };

  return (
    <section className={sectionClass}>
      <h2 className="font-display text-xl font-semibold">Cetak Otomatis</h2>
      <p className="mt-1 text-sm text-[var(--kiosk-muted)]">Strip hasil selalu dicetak di ukuran 4R (10.2 × 15.2 cm), terpisah dari ukuran output digital yang dipilih customer.</p>
      <div className="mt-4 space-y-4">
        <label className="flex items-center gap-3 border-b border-fg/10 pb-4">
          <input type="checkbox" checked={draft.offlineModeEnabled} onChange={(e) => set("offlineModeEnabled", e.target.checked)} />
          <span className="text-sm text-fg/70">Izinkan Offline Mode (paket terakhir, bayar manual, foto dan print lokal)</span>
        </label>
        <div className="border-b border-fg/10 pb-4">
          <p className="text-sm font-semibold">Additional Print</p>
          <p className="mt-1 text-xs text-fg/45">Customer dapat membeli lembar 4R tambahan dari halaman hasil setelah sesi utama lunas.</p>
          <label className="mt-3 flex items-center gap-3">
            <input type="checkbox" checked={additionalPrintConfig.enabled} onChange={(e) => setAdditionalPrintConfig({ ...additionalPrintConfig, enabled: e.target.checked })} />
            <span className="text-sm text-fg/70">Aktifkan pembelian print tambahan</span>
          </label>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="Label customer"><input className={inputClass} value={additionalPrintConfig.label} onChange={(e) => setAdditionalPrintConfig({ ...additionalPrintConfig, label: e.target.value })} /></Field>
            <Field label="Harga per lembar"><input className={inputClass} type="number" min={0} value={additionalPrintConfig.price} onChange={(e) => setAdditionalPrintConfig({ ...additionalPrintConfig, price: Math.max(0, Number(e.target.value) || 0) })} /></Field>
            <Field label="Maksimal per transaksi"><input className={inputClass} type="number" min={1} max={20} value={additionalPrintConfig.max} onChange={(e) => setAdditionalPrintConfig({ ...additionalPrintConfig, max: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} /></Field>
          </div>
          <button type="button" onClick={saveAdditionalPrintConfig} className="mt-3 rounded-xl bg-accent px-4 py-2 text-sm font-semibold">{additionalPrintSaved ? "Tersimpan" : "Simpan additional print"}</button>
        </div>
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={draft.autoPrintEnabled} onChange={(e) => set("autoPrintEnabled", e.target.checked)} />
          <span className="text-sm text-fg/70">Cetak otomatis begitu hasil selesai dirender (tanpa perlu tekan tombol Print)</span>
        </label>
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
        <div className="flex items-center gap-3">
          <button type="button" onClick={runTestPrint} disabled={testPrintStatus === "printing"} className="rounded-xl border border-fg/15 px-4 py-2 text-sm hover:border-accent disabled:opacity-50">
            {testPrintStatus === "printing" ? "Mencetak..." : "Test print"}
          </button>
          {testPrintStatus === "ok" && <span className="text-xs text-emerald-300">● Terkirim ke printer</span>}
          {testPrintStatus === "error" && <span className="text-xs text-red-300">● {testPrintError}</span>}
        </div>
        <div className="flex items-center gap-3 border-t border-fg/10 pt-4">
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving && <Spinner size="sm" />}
            {saving ? "Menyimpan…" : "Simpan"}
          </button>
          {dirty && (
            <button type="button" onClick={cancel} className="text-sm text-fg/50 hover:text-fg">
              Batalkan perubahan
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
