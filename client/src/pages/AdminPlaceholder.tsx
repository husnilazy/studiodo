import { useEffect, useRef, useState } from "react";
import { useBoothConfig, type BoothConfig } from "@/lib/boothConfigStore";
import { OUTPUT_PRESETS, useTemplateLibrary, type LocalTemplate, type OutputPreset, type TemplateCategory } from "@/lib/templateStore";
import type { Orientation } from "@/lib/sessionStore";
import TemplateEditor from "@/components/TemplateEditor";
import { useStickerLibrary } from "@/lib/stickerStore";
import { api } from "@/lib/api";
import { checkTetherBridge, type TetherBridgeHealth } from "@/lib/camera";
import { renderPhotoStrip, STRIP_LAYOUT_LABELS, STRIP_TEMPLATE_LABELS } from "@/lib/stripRenderer";
import { Link } from "wouter";

const inputClass =
  "mt-1 w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm outline-none focus:border-accent";
const sectionClass = "rounded-2xl border border-white/10 bg-ink-900/70 p-5";
type AdminSection = "kiosk" | "camera" | "frames" | "payments" | "printing";
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
    <aside className="lg:sticky lg:top-6 lg:self-start">
      <div className="overflow-hidden rounded-2xl border border-accent/30 bg-black/60 shadow-2xl shadow-black/30">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <p className="eyebrow">LIVE PREVIEW</p>
            <h2 className="font-display text-lg font-semibold">Kiosk Preview</h2>
          </div>
          <span className="rounded-full border border-emerald-300/30 px-2 py-1 text-[10px] text-emerald-200">Draft</span>
        </div>
        <div className="border-b border-white/10 p-3">
          <p className="mb-2 text-[11px] uppercase tracking-[0.16em] text-white/40">Rasio layar</p>
          <div className="grid grid-cols-3 gap-2">
            {(["portrait", "landscape", "square"] as const).map((value) => (
              <button key={value} type="button" onClick={() => setRatio(value)} className={`rounded-lg border px-2 py-2 text-xs ${ratio === value ? "border-accent bg-accent/15 text-white" : "border-white/10 text-white/50"}`}>
                {value === "portrait" ? "Portrait" : value === "landscape" ? "Landscape" : "Square"}
              </button>
            ))}
          </div>
          <p className="mb-2 mt-3 text-[11px] uppercase tracking-[0.16em] text-white/40">Ukuran tombol</p>
          <div className="grid grid-cols-3 gap-2">
            {(["small", "medium", "large"] as const).map((value) => (
              <button key={value} type="button" onClick={() => setButtonSize(value)} className={`rounded-lg border px-2 py-2 text-xs ${buttonSize === value ? "border-accent bg-accent/15 text-white" : "border-white/10 text-white/50"}`}>
                {value === "small" ? "Kecil" : value === "medium" ? "Normal" : "Besar"}
              </button>
            ))}
          </div>
        </div>
        <div className="border-b border-white/10 p-3">
          <p className="mb-2 text-[11px] uppercase tracking-[0.16em] text-white/40">Alur customer</p>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {previewStages.map((item, index) => (
              <button key={item.value} type="button" onClick={() => setStage(item.value)} className={`min-w-14 rounded-lg border px-2 py-2 text-[10px] ${stage === item.value ? "border-accent bg-accent/15 text-white" : "border-white/10 text-white/45"}`}>
                <span className="block text-[9px] text-white/35">0{index + 1}</span>
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className={`mx-auto my-5 flex ${previewFrame} w-[calc(100%-28px)] max-w-[440px] flex-col overflow-hidden border border-white/15 bg-[var(--kiosk-background)] shadow-2xl shadow-black/40`} style={{ color: config.textColor, fontFamily: config.fontFamily }}>
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-[9px] text-white/45">
            <span>{config.brandName || "STUDIODO"}</span><span>{stageInfo.label}</span>
          </div>
          <div className={`flex min-h-0 flex-1 flex-col items-center justify-center px-4 text-center ${compact ? "gap-3" : "gap-5"}`}>
            {stage === "idle" && <><span className="text-[9px] uppercase tracking-[0.2em] text-accent">{config.tagline}</span><h3 className="font-display text-2xl font-bold">{config.idleHeadline}</h3><p className="text-[10px] text-white/50">{config.idleSubheadline}</p><button type="button" style={previewButton} className={`${buttonPadding} font-semibold`}>{config.idleStartText}</button></>}
            {stage === "packages" && <><p className="text-[9px] uppercase tracking-[0.2em] text-accent">01 / SELECT YOUR MOMENT</p><h3 className="font-display text-xl font-bold">{config.packageHeadline}</h3><div className="w-full space-y-2"><div className="rounded-lg border border-white/10 p-2 text-left"><p className="text-xs font-semibold">Basic</p><p className="mt-1 text-[9px] text-white/45">3 foto · Rp 50.000</p></div><button type="button" style={previewButton} className={`w-full ${buttonPadding} font-semibold`}>Pilih paket</button></div></>}
            {stage === "payment" && <><p className="text-[9px] uppercase tracking-[0.2em] text-accent">03 / SECURE CHECKOUT</p><h3 className="font-display text-xl font-bold">{config.paymentHeadline}</h3><div className="rounded-lg border border-white/10 px-5 py-4 text-[10px] text-white/55">QRIS PREVIEW</div><button type="button" style={previewButton} className={`${buttonPadding} font-semibold`}>Saya sudah bayar</button></>}
            {stage === "capture" && <><p className="text-[9px] uppercase tracking-[0.2em] text-accent">PHOTO SESSION</p><h3 className="font-display text-xl font-bold">{config.captureHeadline}</h3><div className="flex w-full flex-1 items-center justify-center rounded-lg bg-black/70 text-2xl">📷</div><p className="text-[10px] text-white/50">Ikuti countdown, lalu tekan tombol capture.</p><button type="button" style={previewButton} className={`${buttonPadding} font-semibold`}>Ambil foto</button></>}
            {stage === "preview" && <><p className="text-[9px] uppercase tracking-[0.2em] text-accent">04 / REVIEW</p><h3 className="font-display text-xl font-bold">{config.previewHeadline}</h3><div className="grid w-full flex-1 grid-cols-2 gap-1 rounded-lg bg-white/10 p-2"><div className="rounded bg-white/15" /><div className="rounded bg-white/15" /><div className="rounded bg-white/15" /><div className="rounded bg-white/15" /></div><button type="button" style={previewButton} className={`${buttonPadding} font-semibold`}>Edit hasil</button></>}
            {stage === "frame" && <><p className="text-[9px] uppercase tracking-[0.2em] text-accent">05 / FRAME</p><h3 className="font-display text-xl font-bold">{config.frameHeadline}</h3><div className="flex w-1/2 flex-1 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-[10px] text-white/40">Frame PNG</div><button type="button" style={previewButton} className={`${buttonPadding} font-semibold`}>Pilih frame</button></>}
            {stage === "result" && <><p className="text-[9px] uppercase tracking-[0.2em] text-accent">06 / COMPLETE</p><h3 className="font-display text-xl font-bold">{config.resultHeadline}</h3><div className="flex w-1/2 flex-1 items-center justify-center rounded-lg bg-white/10 text-[10px] text-white/40">HASIL FOTO</div><button type="button" style={previewButton} className={`${buttonPadding} font-semibold`}>Download hasil</button></>}
          </div>
          <div className="border-t border-white/10 px-3 py-2 text-center text-[9px] text-white/35">{stageInfo.hint}</div>
        </div>
      </div>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm text-white/60">{label}</span>
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

function AdminLiveView({ bridgeUrl, enabled }: { bridgeUrl: string; enabled: boolean }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !bridgeUrl) {
      setImageUrl(null);
      return;
    }
    const controller = new AbortController();
    let currentUrl: string | null = null;
    const refresh = async () => {
      while (!controller.signal.aborted) {
        try {
          const response = await fetch(`${bridgeUrl.replace(/\/$/, "")}/liveview.jpg?ts=${Date.now()}`, { cache: "no-store", signal: controller.signal });
          if (!response.ok) throw new Error(`Live view status ${response.status}`);
          const nextUrl = URL.createObjectURL(await response.blob());
          if (currentUrl) URL.revokeObjectURL(currentUrl);
          currentUrl = nextUrl;
          setImageUrl(nextUrl);
        } catch (error) {
          if (!controller.signal.aborted) console.error("Live view admin gagal diperbarui", error);
        }
        await new Promise((resolve) => window.setTimeout(resolve, 500));
      }
    };
    refresh();
    return () => {
      controller.abort();
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      setImageUrl(null);
    };
  }, [bridgeUrl, enabled]);

  return (
    <section className={sectionClass}>
      <div className="flex items-center justify-between gap-3">
        <div><p className="eyebrow">CAMERA MONITOR</p><h2 className="font-display text-xl font-semibold">Live view</h2></div>
        {enabled && <span className="rounded-full border border-emerald-300/30 px-2 py-1 text-[10px] text-emerald-200">LIVE</span>}
      </div>
      <div className="mt-4 flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/50">
        {enabled && imageUrl ? <img src={imageUrl} alt="Live view kamera" className="h-full w-full object-contain" /> : <p className="px-5 text-center text-xs text-white/35">Aktifkan mode tether dan pastikan bridge kamera terhubung untuk melihat live view.</p>}
      </div>
      <p className="mt-3 text-xs text-white/40">Preview ini hanya memantau kamera. Pengambilan foto tetap dilakukan dari sesi kiosk.</p>
    </section>
  );
}

export default function AdminPlaceholder() {
  const { config, update, reset } = useBoothConfig();
  const { templates, addTemplate, updateTemplate, removeTemplate } = useTemplateLibrary();
  const { stickers, addSticker, removeSticker } = useStickerLibrary();
  const [saved, setSaved] = useState(false);
  const [paymentSaved, setPaymentSaved] = useState(false);
  const [paymentConfig, setPaymentConfig] = useState({ secretKey: "", webhookToken: "" });
  const [paymentStatus, setPaymentStatus] = useState({ hasSecretKey: false, hasWebhookToken: false, demoMode: false, cashPaymentEnabled: false });
  const [cashPaymentSaved, setCashPaymentSaved] = useState(false);
  const [cashInvoiceDraft, setCashInvoiceDraft] = useState({ amount: "", customerName: "" });
  const [cashInvoice, setCashInvoice] = useState<any | null>(null);
  const [cashInvoiceError, setCashInvoiceError] = useState<string | null>(null);
  const [templateDraft, setTemplateDraft] = useState<LocalTemplate | null>(null);
  const [packages, setPackages] = useState<any[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [voucherDraft, setVoucherDraft] = useState({ code: "", discountType: "percent", discountValue: "10", maxUses: "", startsAt: "", expiresAt: "" });
  const [editingVoucherId, setEditingVoucherId] = useState<string | null>(null);
  const [editingVoucher, setEditingVoucher] = useState<Record<string, string>>({});
  const [packageDraft, setPackageDraft] = useState({ name: "", price: "50000", photoCount: 3, hasGif: false, hasVideo: false });
  const [extraDrafts, setExtraDrafts] = useState<Record<string, { name: string; price: string }>>({});
  const [bridgeHealth, setBridgeHealth] = useState<TetherBridgeHealth | null>(null);
  const [bridgeChecking, setBridgeChecking] = useState(false);
  const [printers, setPrinters] = useState<{ name: string; displayName: string; isDefault: boolean }[]>([]);
  const [printersError, setPrintersError] = useState<string | null>(null);
  const [testPrintStatus, setTestPrintStatus] = useState<"idle" | "printing" | "ok" | "error">("idle");
  const [testPrintError, setTestPrintError] = useState<string | null>(null);
  const [additionalPrintSaved, setAdditionalPrintSaved] = useState(false);
  const [additionalPrintConfig, setAdditionalPrintConfig] = useState({ enabled: true, label: "Tambah print 4R", price: 15000, max: 5 });
  const [activeSection, setActiveSection] = useState<AdminSection>("kiosk");
  const stripPreviewRef = useRef<HTMLCanvasElement>(null);

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
  const set = <K extends keyof BoothConfig>(key: K, value: BoothConfig[K]) => {
    update({ [key]: value } as Partial<BoothConfig>);
    setSaved(false);
  };
  const readMedia = (file: File, key: "idleCoverUrl" | "idleBannerUrl") => {
    const reader = new FileReader();
    reader.onload = () => set(key, String(reader.result));
    reader.readAsDataURL(file);
  };

  const checkBridgeNow = async () => {
    if (config.cameraMode !== "tether" || !config.tetherBridgeUrl) {
      setBridgeHealth(null);
      return;
    }
    setBridgeChecking(true);
    const result = await checkTetherBridge(config.tetherBridgeUrl);
    setBridgeHealth(result);
    setBridgeChecking(false);
  };
  useEffect(() => {
    checkBridgeNow();
    if (config.cameraMode !== "tether" || !config.tetherBridgeUrl) return;
    const interval = setInterval(checkBridgeNow, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.cameraMode, config.tetherBridgeUrl]);

  useEffect(() => {
    if (!window.studiodo?.listPrinters) return;
    window.studiodo.listPrinters().then((result) => {
      if (result.ok) {
        setPrinters(result.printers);
        if (!config.printerName) {
          const epsonPrinter = result.printers.find((printer) => /epson.*l8050|l8050.*epson/i.test(`${printer.name} ${printer.displayName}`));
          if (epsonPrinter) set("printerName", epsonPrinter.name);
        }
      }
      else setPrintersError(result.error ?? "Gagal membaca daftar printer");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const result = await window.studiodo.printImage({ dataUrl, printerName: config.printerName, copies: 1 });
    if (result.ok) setTestPrintStatus("ok");
    else {
      setTestPrintStatus("error");
      setTestPrintError(result.error ?? "Print gagal");
    }
  };

  const refreshPackages = () => api.getPackagesAll().then(setPackages).catch((error) => console.error("Gagal memuat paket", error));
  useEffect(() => { refreshPackages(); }, []);
  const refreshVouchers = () => api.getVouchers().then(setVouchers).catch((error) => console.error("Gagal memuat voucher", error));
  useEffect(() => { refreshVouchers(); }, []);
  useEffect(() => {
    api.getPaymentConfig().then(setPaymentStatus).catch((error) => console.error("Gagal memuat konfigurasi pembayaran", error));
  }, []);
  useEffect(() => {
    api.getPrintingConfig().then(setAdditionalPrintConfig).catch((error) => console.error("Gagal memuat konfigurasi print tambahan", error));
  }, []);

  const savePaymentConfig = async () => {
    await api.updatePaymentConfig(paymentConfig);
    setPaymentConfig({ secretKey: "", webhookToken: "" });
    setPaymentSaved(true);
    setPaymentStatus((state) => ({
      ...state,
      hasSecretKey: Boolean(paymentConfig.secretKey.trim()) || state.hasSecretKey,
      hasWebhookToken: Boolean(paymentConfig.webhookToken.trim()) || state.hasWebhookToken,
    }));
  };

  const toggleCashPayment = async (enabled: boolean) => {
    const result = await api.updateCashPaymentConfig(enabled);
    setPaymentStatus((state) => ({ ...state, cashPaymentEnabled: result.enabled }));
    setCashPaymentSaved(true);
    window.setTimeout(() => setCashPaymentSaved(false), 1800);
  };

  const generateCashInvoice = async () => {
    setCashInvoiceError(null);
    try {
      const invoice = await api.createCashVoucher({ amount: Number(cashInvoiceDraft.amount), customerName: cashInvoiceDraft.customerName });
      setCashInvoice(invoice);
      setCashInvoiceDraft({ amount: "", customerName: "" });
    } catch (error) {
      setCashInvoiceError(error instanceof Error ? error.message : "Gagal membuat invoice cash");
    }
  };

  const printCashInvoice = () => {
    if (!cashInvoice) return;
    const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character] ?? character));
    const printWindow = window.open("", "studiodo-cash-invoice", "width=420,height=620");
    if (!printWindow) return;
    printWindow.document.write(`<html><head><title>${escapeHtml(cashInvoice.invoiceNumber)}</title><style>body{font-family:Arial,sans-serif;width:72mm;margin:0 auto;padding:8mm 4mm;color:#111}h1{text-align:center;font-size:18px;margin:0 0 8px}p{margin:5px 0;font-size:12px}.code{font-size:20px;font-weight:bold;letter-spacing:2px;text-align:center;border:1px dashed #111;padding:10px 4px;margin:14px 0}.total{font-size:16px;font-weight:bold;border-top:1px solid #111;padding-top:8px}</style></head><body><h1>STUDIODO</h1><p style="text-align:center">Invoice Pembayaran Cash</p><p>No: ${escapeHtml(cashInvoice.invoiceNumber)}</p><p>Customer: ${escapeHtml(cashInvoice.customerName || "-")}</p><p class="total">Total: Rp ${Number(cashInvoice.cashAmount).toLocaleString("id-ID")}</p><div class="code">${escapeHtml(cashInvoice.code)}</div><p style="text-align:center">Berikan kode ini ke customer untuk memulai sesi.</p></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };
  const saveAdditionalPrintConfig = async () => {
    const savedConfig = await api.updatePrintingConfig(additionalPrintConfig);
    setAdditionalPrintConfig(savedConfig);
    setAdditionalPrintSaved(true);
    window.setTimeout(() => setAdditionalPrintSaved(false), 1800);
  };

  const createPackage = async () => {
    if (!packageDraft.name.trim()) return;
    await api.createPackage({ ...packageDraft, price: packageDraft.price, sortOrder: packages.length + 1, extraPrints: [] });
    setPackageDraft({ name: "", price: "50000", photoCount: 3, hasGif: false, hasVideo: false });
    refreshPackages();
  };

  const addExtra = async (pkg: any) => {
    const draft = extraDrafts[pkg.id];
    if (!draft?.name.trim()) return;
    const extraPrints = [...(pkg.extraPrints ?? []), { id: crypto.randomUUID(), name: draft.name, price: Number(draft.price) || 0 }];
    await api.updatePackage(pkg.id, { extraPrints });
    setExtraDrafts((state) => ({ ...state, [pkg.id]: { name: "", price: "0" } }));
    refreshPackages();
  };

  const createVoucher = async () => {
    if (!voucherDraft.code.trim()) return;
    await api.createVoucher({
      ...voucherDraft,
      maxUses: voucherDraft.maxUses || null,
      active: true,
    });
    setVoucherDraft({ code: "", discountType: "percent", discountValue: "10", maxUses: "", startsAt: "", expiresAt: "" });
    refreshVouchers();
  };

  const beginVoucherEdit = (voucher: any) => {
    setEditingVoucherId(voucher.id);
    setEditingVoucher({
      code: voucher.code,
      discountType: voucher.discountType,
      discountValue: String(voucher.discountValue),
      maxUses: voucher.maxUses == null ? "" : String(voucher.maxUses),
      startsAt: voucher.startsAt ? String(voucher.startsAt).slice(0, 16) : "",
      expiresAt: voucher.expiresAt ? String(voucher.expiresAt).slice(0, 16) : "",
    });
  };

  const saveVoucherEdit = async () => {
    if (!editingVoucherId) return;
    await api.updateVoucher(editingVoucherId, { ...editingVoucher, maxUses: editingVoucher.maxUses || null });
    setEditingVoucherId(null);
    refreshVouchers();
  };

  const addPngTemplate = (file: File) => {
    if (!file.type.includes("png")) return;
    const reader = new FileReader();
    reader.onload = () => setTemplateDraft({
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
    });
    reader.readAsDataURL(file);
  };

  const saveTemplate = async () => {
    if (!templateDraft) return;
    addTemplate(templateDraft);
    try {
      await api.createFrame(templateDraft);
    } catch (error) {
      console.error("Gagal menyimpan frame ke server", error);
    }
    setTemplateDraft(null);
  };

  const uploadSticker = (file: File) => {
    if (!file.type.includes("png")) return;
    const reader = new FileReader();
    reader.onload = () => addSticker({
      id: crypto.randomUUID(),
      name: file.name.replace(/\.png$/i, ""),
      category: "custom",
      dataUrl: String(reader.result),
    });
    reader.readAsDataURL(file);
  };

  const panelClass = (section: AdminSection, extra = "") => `${sectionClass} ${activeSection === section ? "" : "hidden"} ${extra}`;

  return (
    <div className="h-full overflow-y-auto px-6 py-8 text-[var(--kiosk-text)] md:px-10">
      <div className="mx-auto max-w-[1500px]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-accent">STUDIODO Control Center</p>
            <h1 className="mt-2 font-display text-4xl font-bold">Kustomisasi Kiosk</h1>
            <p className="mt-2 max-w-2xl text-[var(--kiosk-muted)]">
              Semua perubahan tersimpan lokal di booth ini dan langsung terlihat di layar kiosk.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/customers" className="border border-white/15 px-4 py-2 text-sm text-white/70 hover:text-white">
              Customer
            </Link>
            <button onClick={reset} className="border border-white/15 px-4 py-2 text-sm text-white/60 hover:text-white">
              Reset default
            </button>
            <button onClick={() => setSaved(true)} className="bg-accent px-5 py-2 text-sm font-semibold">
              {saved ? "Tersimpan" : "Simpan tampilan"}
            </button>
          </div>
        </div>

        <nav className="mt-8 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-black/25 p-2 sm:grid-cols-5" aria-label="Kategori pengaturan admin">
          {[
            ["kiosk", "Tampilan kiosk", "Branding, idle screen, gaya UI"],
            ["camera", "Kamera", "Capture, tether, live view"],
            ["frames", "Frame & output", "Template, stiker, layout"],
            ["payments", "Paket & pembayaran", "Paket, voucher, QRIS"],
            ["printing", "Printer", "Cetak otomatis dan printer"],
          ].map(([value, label, description]) => (
            <button
              key={value}
              type="button"
              onClick={() => setActiveSection(value as AdminSection)}
              className={`rounded-xl px-3 py-3 text-left transition ${activeSection === value ? "bg-accent text-white shadow-lg shadow-accent/20" : "text-white/55 hover:bg-white/5 hover:text-white"}`}
            >
              <span className="block text-sm font-semibold">{label}</span>
              <span className={`mt-1 block text-[11px] ${activeSection === value ? "text-white/75" : "text-white/35"}`}>{description}</span>
            </button>
          ))}
        </nav>

        <div className="mt-5 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_500px] xl:gap-8">
          <div className="grid items-start gap-5 lg:grid-cols-2">
          <section className={panelClass("payments", "lg:col-span-2")}>
            <h2 className="font-display text-xl font-semibold">Paket & Extra Cetak</h2>
            <div className="mt-4 grid gap-2 md:grid-cols-[1fr_140px_100px_auto_auto_auto]">
              <input className={inputClass} placeholder="Nama paket" value={packageDraft.name} onChange={(e) => setPackageDraft({ ...packageDraft, name: e.target.value })} />
              <input className={inputClass} type="number" placeholder="Harga" value={packageDraft.price} onChange={(e) => setPackageDraft({ ...packageDraft, price: e.target.value })} />
              <input className={inputClass} type="number" min={1} max={10} placeholder="Foto (maks 10)" value={packageDraft.photoCount} onChange={(e) => setPackageDraft({ ...packageDraft, photoCount: Math.max(1, Math.min(10, Number(e.target.value))) })} />
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={packageDraft.hasGif} onChange={(e) => setPackageDraft({ ...packageDraft, hasGif: e.target.checked })} /> GIF</label>
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={packageDraft.hasVideo} onChange={(e) => setPackageDraft({ ...packageDraft, hasVideo: e.target.checked })} /> Video</label>
              <button onClick={createPackage} className="bg-accent px-4 py-2 text-sm font-semibold">Tambah</button>
            </div>
            <div className="mt-5 space-y-3">
              {packages.map((pkg) => (
                <div key={pkg.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><p className="font-semibold">{pkg.name}</p><p className="text-xs text-white/50">Rp {Number(pkg.price).toLocaleString("id-ID")} · {pkg.photoCount} foto {pkg.hasGif ? "· GIF" : ""} {pkg.hasVideo ? "· Video" : ""}</p></div>
                    <button onClick={async () => { await api.deletePackage(pkg.id); refreshPackages(); }} className="text-xs text-red-300">Hapus paket</button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(pkg.extraPrints ?? []).map((extra: { id: string; name: string; price: number }) => <span key={extra.id} className="rounded-full border border-accent/30 px-3 py-1 text-xs">{extra.name} +Rp {Number(extra.price).toLocaleString("id-ID")}</span>)}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <label className="flex items-center gap-2 text-xs text-white/60">Jumlah foto
                      <input className={`${inputClass} mt-0 w-20`} type="number" min={1} max={10} value={pkg.photoCount} onChange={async (event) => { const photoCount = Math.max(1, Math.min(10, Number(event.target.value))); await api.updatePackage(pkg.id, { photoCount }); refreshPackages(); }} />
                    </label>
                    <input className={inputClass} placeholder="Nama extra cetak" value={extraDrafts[pkg.id]?.name ?? ""} onChange={(e) => setExtraDrafts((state) => ({ ...state, [pkg.id]: { name: e.target.value, price: state[pkg.id]?.price ?? "0" } }))} />
                    <input className={`${inputClass} max-w-32`} type="number" placeholder="Biaya" value={extraDrafts[pkg.id]?.price ?? "0"} onChange={(e) => setExtraDrafts((state) => ({ ...state, [pkg.id]: { name: state[pkg.id]?.name ?? "", price: e.target.value } }))} />
                    <button onClick={() => addExtra(pkg)} className="border border-white/20 px-3 text-sm">Tambah extra</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className={panelClass("kiosk", "lg:col-span-2")}>
            <h2 className="font-display text-xl font-semibold">Idle Screen & Pop-up Banner</h2>
            <p className="mt-1 text-sm text-[var(--kiosk-muted)]">Atur tampilan default branding, cover foto/video, dan banner promo saat kiosk menunggu.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Cover idle (gambar / video)">
                <input className={inputClass} type="file" accept="image/*,video/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) { set("idleCoverType", file.type.startsWith("video/") ? "video" : "image"); readMedia(file, "idleCoverUrl"); } }} />
                <div className="mt-2 flex gap-2">
                  <button onClick={() => set("idleCoverUrl", null)} className="text-xs text-red-300">Hapus cover</button>
                  <span className="text-xs text-white/40">{config.idleCoverUrl ? `Cover ${config.idleCoverType} aktif` : "Cover default gradient"}</span>
                </div>
              </Field>
              <Field label="Pop-up / banner promo">
                <input className={inputClass} type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) readMedia(file, "idleBannerUrl"); }} />
                <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={config.idleBannerEnabled} onChange={(event) => set("idleBannerEnabled", event.target.checked)} /> Tampilkan banner</label>
              </Field>
            </div>
          </section>
          <section className={panelClass("payments", "lg:col-span-2")}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="eyebrow">PROMO CONTROL</p>
                <h2 className="font-display text-xl font-semibold">Voucher & Diskon</h2>
                <p className="mt-1 text-sm text-[var(--kiosk-muted)]">Kelola kode, nilai diskon, kuota, periode aktif, dan penggunaan.</p>
              </div>
              <span className="rounded-full border border-accent/30 px-3 py-1 text-xs text-accent">{vouchers.length} voucher</span>
            </div>
            <div className="mt-5 rounded-2xl border border-accent/20 bg-accent/[0.04] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Buat voucher baru</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Kode voucher"><input className={inputClass} placeholder="HEMAT50" value={voucherDraft.code} onChange={(e) => setVoucherDraft({ ...voucherDraft, code: e.target.value.toUpperCase() })} /></Field>
                <Field label="Jenis diskon"><select className={inputClass} value={voucherDraft.discountType} onChange={(e) => setVoucherDraft({ ...voucherDraft, discountType: e.target.value })}><option value="percent">Persen (%)</option><option value="fixed">Potongan Rp</option><option value="free">Gratis</option></select></Field>
                <Field label="Nilai diskon"><input className={inputClass} type="number" min={0} placeholder="10" value={voucherDraft.discountValue} onChange={(e) => setVoucherDraft({ ...voucherDraft, discountValue: e.target.value })} /></Field>
                <Field label="Kuota penggunaan"><input className={inputClass} type="number" min={1} placeholder="Tanpa batas" value={voucherDraft.maxUses} onChange={(e) => setVoucherDraft({ ...voucherDraft, maxUses: e.target.value })} /></Field>
                <Field label="Mulai aktif"><input className={inputClass} type="datetime-local" value={voucherDraft.startsAt} onChange={(e) => setVoucherDraft({ ...voucherDraft, startsAt: e.target.value })} /></Field>
                <Field label="Berakhir"><input className={inputClass} type="datetime-local" value={voucherDraft.expiresAt} onChange={(e) => setVoucherDraft({ ...voucherDraft, expiresAt: e.target.value })} /></Field>
              </div>
              <button onClick={createVoucher} disabled={!voucherDraft.code.trim()} className="mt-4 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">+ Tambah voucher</button>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {vouchers.map((voucher) => (
                <div key={voucher.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  {editingVoucherId === voucher.id ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Kode"><input className={inputClass} value={editingVoucher.code ?? ""} onChange={(e) => setEditingVoucher({ ...editingVoucher, code: e.target.value.toUpperCase() })} /></Field>
                      <Field label="Jenis"><select className={inputClass} value={editingVoucher.discountType ?? "percent"} onChange={(e) => setEditingVoucher({ ...editingVoucher, discountType: e.target.value })}><option value="percent">Persen</option><option value="fixed">Nominal</option><option value="free">Gratis</option></select></Field>
                      <Field label="Nilai"><input className={inputClass} type="number" value={editingVoucher.discountValue ?? "0"} onChange={(e) => setEditingVoucher({ ...editingVoucher, discountValue: e.target.value })} /></Field>
                      <Field label="Kuota"><input className={inputClass} type="number" placeholder="Tanpa batas" value={editingVoucher.maxUses ?? ""} onChange={(e) => setEditingVoucher({ ...editingVoucher, maxUses: e.target.value })} /></Field>
                      <Field label="Mulai aktif"><input className={inputClass} type="datetime-local" value={editingVoucher.startsAt ?? ""} onChange={(e) => setEditingVoucher({ ...editingVoucher, startsAt: e.target.value })} /></Field>
                      <Field label="Berakhir"><input className={inputClass} type="datetime-local" value={editingVoucher.expiresAt ?? ""} onChange={(e) => setEditingVoucher({ ...editingVoucher, expiresAt: e.target.value })} /></Field>
                      <div className="flex gap-2 sm:col-span-2"><button onClick={saveVoucherEdit} className="rounded-xl bg-accent px-4 py-2 text-xs font-semibold">Simpan perubahan</button><button onClick={() => setEditingVoucherId(null)} className="rounded-xl border border-white/15 px-4 py-2 text-xs">Batal</button></div>
                    </div>
                  ) : <div className="flex items-start justify-between gap-3">
                    <div><p className="font-semibold tracking-[0.16em] text-accent">{voucher.code}</p><p className="mt-1 text-lg font-semibold">{voucher.discountType === "percent" ? `${voucher.discountValue}%` : voucher.discountType === "free" ? "Gratis" : `Rp ${Number(voucher.discountValue).toLocaleString("id-ID")}`}</p><p className="mt-1 text-xs text-white/45">Dipakai {voucher.usedCount}{voucher.maxUses === null ? " · Tanpa batas" : ` dari ${voucher.maxUses}`} · {voucher.startsAt ? new Date(voucher.startsAt).toLocaleDateString("id-ID") : "Mulai sekarang"}</p></div>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${voucher.active ? "bg-emerald-400/15 text-emerald-200" : "bg-white/10 text-white/50"}`}>{voucher.active ? "Aktif" : "Nonaktif"}</span>
                  </div>}
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                    <button onClick={() => beginVoucherEdit(voucher)} className="rounded-full border border-white/15 px-3 py-1 text-xs">Edit</button>
                    <button onClick={async () => { await api.updateVoucher(voucher.id, { active: !voucher.active }); refreshVouchers(); }} className="rounded-full border border-white/15 px-3 py-1 text-xs">{voucher.active ? "Nonaktifkan" : "Aktifkan"}</button>
                    <button onClick={async () => { await api.deleteVoucher(voucher.id); refreshVouchers(); }} className="text-xs text-red-300">Hapus</button>
                  </div>
                </div>
              ))}
              {vouchers.length === 0 && <p className="text-sm text-white/40">Belum ada voucher. Buat promo pertama untuk customer.</p>}
            </div>
          </section>
          <section className={panelClass("payments", "lg:col-span-2")}>
            <h2 className="font-display text-xl font-semibold">Pembayaran QRIS Xendit</h2>
            <p className="mt-1 text-sm text-[var(--kiosk-muted)]">
              Kredensial disimpan di server dan tidak pernah dikirim kembali ke kiosk.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label={`Xendit Secret Key${paymentStatus.hasSecretKey ? " (sudah tersimpan, isi untuk mengganti)" : ""}`}>
                <input className={inputClass} type="password" value={paymentConfig.secretKey} onChange={(e) => setPaymentConfig({ ...paymentConfig, secretKey: e.target.value })} placeholder="xnd_production_..." autoComplete="new-password" />
              </Field>
              <Field label={`Xendit Webhook Token${paymentStatus.hasWebhookToken ? " (sudah tersimpan, isi untuk mengganti)" : ""}`}>
                <input className={inputClass} type="password" value={paymentConfig.webhookToken} onChange={(e) => setPaymentConfig({ ...paymentConfig, webhookToken: e.target.value })} placeholder="Webhook token" autoComplete="new-password" />
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button onClick={savePaymentConfig} className="bg-accent px-4 py-2 text-sm font-semibold">
                {paymentSaved ? "Tersimpan" : "Simpan API Xendit"}
              </button>
              <span className="text-xs text-white/50">
                {paymentStatus.demoMode ? "Mode demo aktif dari PAYMENT_DEMO_MODE." : paymentStatus.hasSecretKey ? "Mode Xendit aktif." : "Belum ada Secret Key; pembayaran belum siap."}
              </span>
            </div>
            <div className="mt-6 border-t border-white/10 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h3 className="font-display text-lg font-semibold">Pembayaran Cash</h3><p className="mt-1 text-xs text-white/45">Admin menerima uang cash, lalu membuat invoice dan kode sekali pakai.</p></div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={paymentStatus.cashPaymentEnabled} onChange={(event) => toggleCashPayment(event.target.checked)} /> Aktifkan cash {cashPaymentSaved && <span className="text-emerald-300">Tersimpan</span>}</label>
              </div>
              {paymentStatus.cashPaymentEnabled && <>
                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <Field label="Nominal diterima"><input className={inputClass} type="number" min={1} placeholder="50000" value={cashInvoiceDraft.amount} onChange={(event) => setCashInvoiceDraft({ ...cashInvoiceDraft, amount: event.target.value })} /></Field>
                  <Field label="Nama customer (opsional)"><input className={inputClass} placeholder="Nama customer" value={cashInvoiceDraft.customerName} onChange={(event) => setCashInvoiceDraft({ ...cashInvoiceDraft, customerName: event.target.value })} /></Field>
                  <button type="button" onClick={generateCashInvoice} disabled={!cashInvoiceDraft.amount} className="mt-1 self-end rounded-xl bg-accent px-4 py-2 text-sm font-semibold disabled:opacity-40">Generate invoice</button>
                </div>
                {cashInvoiceError && <p className="mt-3 text-xs text-red-300">{cashInvoiceError}</p>}
                {cashInvoice && <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-4"><div><p className="text-xs text-white/45">{cashInvoice.invoiceNumber}</p><p className="mt-1 text-2xl font-bold tracking-[0.16em] text-emerald-200">{cashInvoice.code}</p><p className="mt-1 text-sm">Rp {Number(cashInvoice.cashAmount).toLocaleString("id-ID")} · {cashInvoice.customerName || "Tanpa nama"}</p></div><button type="button" onClick={printCashInvoice} className="rounded-xl border border-white/20 px-4 py-2 text-sm hover:border-accent">Print struk kecil</button></div>}
              </>}
            </div>
          </section>
          <section className={panelClass("kiosk")}>
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
                {config.logoUrl && <img src={config.logoUrl} className="mt-3 h-16 w-auto rounded-lg bg-white/10 p-2 object-contain" />}
              </Field>
              <Field label={`Ukuran logo (${config.logoScale}%)`}>
                <input type="range" min={60} max={180} value={config.logoScale} onChange={(e) => set("logoScale", Number(e.target.value))} className="mt-3 w-full accent-[var(--accent)]" />
              </Field>
            </div>
          </section>
          <section className={panelClass("frames")}>
            <h2 className="font-display text-xl font-semibold">Output & Capture</h2>
            <div className="mt-4 space-y-4">
              <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={config.outputPresetEnabled} onChange={(event) => set("outputPresetEnabled", event.target.checked)} /><span>Aktifkan pilihan ukuran output (4R, 2R, A4)</span></label>
              <Field label="Maksimal foto dalam satu sesi">
                <input type="number" min={1} max={50} className={inputClass} value={config.maxPhotosPerSession} onChange={(event) => set("maxPhotosPerSession", Math.max(1, Math.min(50, Number(event.target.value))))} />
              </Field>
              <p className="text-xs text-white/45">Jumlah foto paket tetap menjadi default; nilai ini menjadi batas maksimal agar sesi tidak melebihi kuota capture admin.</p>
            </div>
          </section>

          <section className={panelClass("frames", "lg:col-span-2")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold">Frame PNG & Template</h2>
                <p className="mt-1 text-sm text-[var(--kiosk-muted)]">Upload frame transparan, kategorikan, dan tentukan ukuran output.</p>
              </div>
              <label className="cursor-pointer bg-accent px-4 py-2 text-sm font-semibold">
                Upload PNG
                <input type="file" accept="image/png" className="hidden" onChange={(event) => event.target.files?.[0] && addPngTemplate(event.target.files[0])} />
              </label>
            </div>
            {templateDraft && (
              <div className="mt-5 grid gap-4 rounded-xl border border-accent/40 bg-black/20 p-4 md:grid-cols-[160px_1fr]">
                <div className="md:col-span-2">
                  <TemplateEditor template={templateDraft} onChange={(patch) => setTemplateDraft({ ...templateDraft, ...patch })} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2 md:col-span-2">
                  <Field label="Nama template"><input className={inputClass} value={templateDraft.name} onChange={(e) => setTemplateDraft({ ...templateDraft, name: e.target.value })} /></Field>
                  <Field label="Kategori">
                    <select className={inputClass} value={templateDraft.category} onChange={(e) => setTemplateDraft({ ...templateDraft, category: e.target.value as TemplateCategory })}>
                      {["custom", "minimal", "wedding", "birthday", "corporate", "seasonal"].map((value) => <option key={value}>{value}</option>)}
                    </select>
                  </Field>
                  <Field label="Style / tema"><input className={inputClass} value={templateDraft.style} onChange={(e) => setTemplateDraft({ ...templateDraft, style: e.target.value })} placeholder="Contoh: Neon Glow" /></Field>
                  <Field label="Orientasi">
                    <select className={inputClass} value={templateDraft.orientation} onChange={(e) => setTemplateDraft({ ...templateDraft, orientation: e.target.value as Orientation })}>
                      <option value="portrait">Portrait</option><option value="landscape">Landscape</option>
                    </select>
                  </Field>
                  <Field label="Ukuran output">
                    <select className={inputClass} value={templateDraft.outputPreset} onChange={(e) => {
                      const outputPreset = e.target.value as OutputPreset;
                      const preset = outputPreset === "custom" ? { width: 1200, height: 1800 } : OUTPUT_PRESETS[outputPreset];
                      setTemplateDraft({ ...templateDraft, outputPreset, canvasWidth: preset.width, canvasHeight: preset.height });
                    }}>
                      {Object.entries(OUTPUT_PRESETS).map(([value, preset]) => <option key={value} value={value}>{preset.label}</option>)}
                    </select>
                  </Field>
                  <div className="flex items-end gap-2">
                    <button onClick={saveTemplate} className="bg-accent px-4 py-2 text-sm font-semibold">Simpan template</button>
                    <button onClick={() => setTemplateDraft(null)} className="border border-white/20 px-4 py-2 text-sm">Batal</button>
                  </div>
                </div>
              </div>
            )}
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {templates.map((template) => (
                <div key={template.id} className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
                  <img src={template.frameDataUrl} className="h-40 w-full object-contain" />
                  <div className="p-3">
                    <p className="font-semibold">{template.name}</p>
                    <p className="text-xs text-[var(--kiosk-muted)]">{template.category} · {template.style} · {template.outputPreset}</p>
                    <p className="mt-3 text-xs font-semibold text-white/60">Posisi slot (persen)</p>
                    <div className="mt-2 space-y-2">
                      {template.slots.map((slot, index) => (
                        <div key={index} className="grid grid-cols-4 gap-1">
                          {(["x", "y", "w", "h"] as const).map((key) => (
                            <input
                              key={key}
                              type="number"
                              min={0}
                              max={1}
                              step={0.01}
                              aria-label={`Slot ${index + 1} ${key}`}
                              className="w-full rounded border border-white/10 bg-black/30 px-1 py-1 text-xs"
                              value={slot[key]}
                              onChange={(event) => {
                                const slots = template.slots.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, [key]: Number(event.target.value) } : item,
                                );
                                updateTemplate(template.id, { slots });
                              }}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                    <button onClick={() => removeTemplate(template.id)} className="mt-2 text-xs text-red-300">Hapus</button>
                  </div>
                </div>
              ))}
              {templates.length === 0 && <p className="text-sm text-[var(--kiosk-muted)]">Belum ada template lokal.</p>}
            </div>
          </section>

          <section className={panelClass("frames", "lg:col-span-2")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold">Stiker PNG</h2>
                <p className="mt-1 text-sm text-[var(--kiosk-muted)]">Upload stiker transparan yang bisa dipilih customer saat preview.</p>
              </div>
              <label className="cursor-pointer bg-accent px-4 py-2 text-sm font-semibold">
                Upload stiker
                <input type="file" accept="image/png" className="hidden" onChange={(event) => event.target.files?.[0] && uploadSticker(event.target.files[0])} />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              {stickers.map((sticker) => (
                <div key={sticker.id} className="w-24 rounded-lg border border-white/10 bg-black/20 p-2 text-center">
                  <img src={sticker.dataUrl} className="h-16 w-full object-contain" />
                  <p className="mt-1 truncate text-xs">{sticker.name}</p>
                  <button onClick={() => removeSticker(sticker.id)} className="mt-1 text-xs text-red-300">Hapus</button>
                </div>
              ))}
              {stickers.length === 0 && <p className="text-sm text-[var(--kiosk-muted)]">Belum ada stiker.</p>}
            </div>
          </section>

          <section className={panelClass("frames", "lg:col-span-2")}>
            <h2 className="font-display text-xl font-semibold">Layout & Visual Strip</h2>
            <p className="mt-1 text-sm text-[var(--kiosk-muted)]">Susunan foto (layout) dan tema warna/border (visual template) dipakai di halaman Hasil dan saat cetak.</p>
            <div className="mt-4 grid gap-5 md:grid-cols-[280px_1fr]">
              <div className="mx-auto w-full max-w-[220px]">
                <canvas ref={stripPreviewRef} className="w-full rounded-xl border border-white/10 shadow-lg" />
                <p className="mt-2 text-center text-xs text-white/40">Live preview (foto contoh)</p>
              </div>
              <div className="space-y-4">
                <Field label="Layout foto">
                  <select className={inputClass} value={config.stripLayout} onChange={(e) => set("stripLayout", e.target.value as BoothConfig["stripLayout"])}>
                    {Object.entries(STRIP_LAYOUT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
                <Field label="Visual template">
                  <select className={inputClass} value={config.stripTemplate} onChange={(e) => set("stripTemplate", e.target.value as BoothConfig["stripTemplate"])}>
                    {Object.entries(STRIP_TEMPLATE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
                <p className="text-xs text-white/45">Warna aksen di visual template (Neon Glow, gradient, footer bar) mengikuti "Warna aksen" di bawah.</p>
              </div>
            </div>
          </section>

          <section className={panelClass("kiosk")}>
            <h2 className="font-display text-xl font-semibold">Warna & Tipografi</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <ColorField label="Warna aksen" value={config.accentColor} onChange={(v) => set("accentColor", v)} />
              <ColorField label="Background kiosk" value={config.backgroundColor} onChange={(v) => set("backgroundColor", v)} />
              <ColorField label="Gradient mulai" value={config.backgroundGradientStart} onChange={(v) => set("backgroundGradientStart", v)} />
              <ColorField label="Gradient akhir" value={config.backgroundGradientEnd} onChange={(v) => set("backgroundGradientEnd", v)} />
              <ColorField label="Surface kartu" value={config.surfaceColor} onChange={(v) => set("surfaceColor", v)} />
              <ColorField label="Warna teks" value={config.textColor} onChange={(v) => set("textColor", v)} />
              <ColorField label="Teks sekunder" value={config.mutedTextColor} onChange={(v) => set("mutedTextColor", v)} />
              <Field label="Font display">
                <select className={inputClass} value={config.fontFamily} onChange={(e) => set("fontFamily", e.target.value)}>
                  <option>Space Grotesk</option>
                  <option>Inter</option>
                  <option>DM Sans</option>
                  <option>Playfair Display</option>
                  <option>Montserrat</option>
                </select>
              </Field>
            </div>
          </section>

          <section className={panelClass("kiosk")}>
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
                <span className="text-sm text-white/70">Aktifkan animasi dan transisi</span>
              </label>
              <label className="flex items-center gap-3 sm:col-span-2">
                <input type="checkbox" checked={config.backgroundGradientEnabled} onChange={(e) => set("backgroundGradientEnabled", e.target.checked)} />
                <span className="text-sm text-white/70">Aktifkan gradient background</span>
              </label>
              <Field label={`Ukuran virtual keyboard (${config.keyboardScale}%)`}>
                <input type="range" min={80} max={140} value={config.keyboardScale} onChange={(e) => set("keyboardScale", Number(e.target.value))} className="mt-3 w-full accent-[var(--accent)]" />
              </Field>
            </div>
            <div className="mt-5 rounded-xl border border-white/10 p-4" style={{ backgroundColor: "var(--kiosk-surface)" }}>
              <p className="text-sm text-[var(--kiosk-muted)]">Live preview</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button className="bg-accent px-5 py-2 font-semibold">Tombol utama</button>
                <button className="border border-white/20 px-5 py-2">Tombol sekunder</button>
              </div>
            </div>
          </section>

          <section className={panelClass("camera")}>
            <h2 className="font-display text-xl font-semibold">Sesi Foto & Kamera</h2>
            <div className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Countdown (detik)">
                  <input type="number" min={1} max={15} className={inputClass} value={config.countdownSeconds} onChange={(e) => set("countdownSeconds", Math.max(1, Number(e.target.value)))} />
                </Field>
                <Field label="Capture vibe">
                  <select className={inputClass} value={config.captureVibe} onChange={(e) => set("captureVibe", e.target.value as BoothConfig["captureVibe"])}>
                    {["Electric", "Cotton Candy", "Ocean", "Sunset", "Mono"].map((v) => <option key={v}>{v}</option>)}
                  </select>
                </Field>
              </div>
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={config.beepEnabled} onChange={(e) => set("beepEnabled", e.target.checked)} />
                <span className="text-sm text-white/70">Suara beep countdown</span>
              </label>
              <Field label="Mode kamera">
                <select className={inputClass} value={config.cameraMode} onChange={(e) => set("cameraMode", e.target.value as BoothConfig["cameraMode"])}>
                  <option value="webcam">Webcam / virtual camera</option>
                  <option value="tether">Canon DSLR / tether bridge</option>
                </select>
              </Field>
              {config.cameraMode === "tether" && (
                <Field label="URL tether bridge">
                  <div className="flex gap-2">
                    <input className={`${inputClass} flex-1`} value={config.tetherBridgeUrl} onChange={(e) => set("tetherBridgeUrl", e.target.value)} placeholder="http://127.0.0.1:5510" />
                    <button type="button" onClick={checkBridgeNow} className="mt-1 shrink-0 rounded-lg border border-white/15 px-3 text-xs text-white/60 hover:text-white">
                      {bridgeChecking ? "Cek..." : "Cek koneksi"}
                    </button>
                  </div>
                  <p className="mt-2 text-xs">
                    {bridgeHealth === null ? (
                      <span className="text-white/40">Bridge default: electron/digicam-bridge.cjs di port 5510, meneruskan ke digiCamControl (port 5513). Pastikan digiCamControl sudah berjalan dengan webserver aktif.</span>
                    ) : bridgeHealth.ok && bridgeHealth.digicamReachable ? (
                      <span className="text-emerald-300">● Bridge aktif, digiCamControl terhubung ({bridgeHealth.digicamUrl})</span>
                    ) : bridgeHealth.ok ? (
                      <span className="text-amber-300">● Bridge aktif, tapi digiCamControl tidak terjangkau di {bridgeHealth.digicamUrl}. Pastikan digiCamControl sudah dibuka dan webserver-nya aktif (File &gt; Settings &gt; Webserver).</span>
                    ) : (
                      <span className="text-red-300">● Bridge tidak terjangkau: {bridgeHealth.error}</span>
                    )}
                  </p>
                </Field>
              )}
            </div>
          </section>
          {activeSection === "camera" && <AdminLiveView bridgeUrl={config.tetherBridgeUrl} enabled={config.cameraMode === "tether" && Boolean(bridgeHealth?.ok && bridgeHealth.digicamReachable)} />}

          <section className={panelClass("printing")}>
            <h2 className="font-display text-xl font-semibold">Cetak Otomatis</h2>
            <p className="mt-1 text-sm text-[var(--kiosk-muted)]">Strip hasil selalu dicetak di ukuran 4R (10.2 × 15.2 cm), terpisah dari ukuran output digital yang dipilih customer.</p>
            <div className="mt-4 space-y-4">
              <label className="flex items-center gap-3 border-b border-white/10 pb-4">
                <input type="checkbox" checked={config.offlineModeEnabled} onChange={(e) => set("offlineModeEnabled", e.target.checked)} />
                <span className="text-sm text-white/70">Izinkan Offline Mode (paket terakhir, bayar manual, foto dan print lokal)</span>
              </label>
              <div className="border-b border-white/10 pb-4">
                <p className="text-sm font-semibold">Additional Print</p>
                <p className="mt-1 text-xs text-white/45">Customer dapat membeli lembar 4R tambahan dari halaman hasil setelah sesi utama lunas.</p>
                <label className="mt-3 flex items-center gap-3">
                  <input type="checkbox" checked={additionalPrintConfig.enabled} onChange={(e) => setAdditionalPrintConfig({ ...additionalPrintConfig, enabled: e.target.checked })} />
                  <span className="text-sm text-white/70">Aktifkan pembelian print tambahan</span>
                </label>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <Field label="Label customer"><input className={inputClass} value={additionalPrintConfig.label} onChange={(e) => setAdditionalPrintConfig({ ...additionalPrintConfig, label: e.target.value })} /></Field>
                  <Field label="Harga per lembar"><input className={inputClass} type="number" min={0} value={additionalPrintConfig.price} onChange={(e) => setAdditionalPrintConfig({ ...additionalPrintConfig, price: Math.max(0, Number(e.target.value) || 0) })} /></Field>
                  <Field label="Maksimal per transaksi"><input className={inputClass} type="number" min={1} max={20} value={additionalPrintConfig.max} onChange={(e) => setAdditionalPrintConfig({ ...additionalPrintConfig, max: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} /></Field>
                </div>
                <button type="button" onClick={saveAdditionalPrintConfig} className="mt-3 rounded-xl bg-accent px-4 py-2 text-sm font-semibold">{additionalPrintSaved ? "Tersimpan" : "Simpan additional print"}</button>
              </div>
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={config.autoPrintEnabled} onChange={(e) => set("autoPrintEnabled", e.target.checked)} />
                <span className="text-sm text-white/70">Cetak otomatis begitu hasil selesai dirender (tanpa perlu tekan tombol Print)</span>
              </label>
              <Field label="Printer">
                <select className={inputClass} value={config.printerName ?? ""} onChange={(e) => set("printerName", e.target.value || null)}>
                  <option value="">Printer default sistem</option>
                  {printers.map((printer) => (
                    <option key={printer.name} value={printer.name}>
                      {printer.displayName || printer.name}{printer.isDefault ? " (default)" : ""}
                    </option>
                  ))}
                </select>
                {printersError && <p className="mt-1 text-xs text-red-300">{printersError}</p>}
                {!window.studiodo?.listPrinters && <p className="mt-1 text-xs text-white/40">Daftar printer hanya bisa dibaca dari aplikasi desktop STUDIODO (Electron).</p>}
              </Field>
              <Field label="Jumlah salinan per sesi">
                <input type="number" min={1} max={10} className={inputClass} value={config.printCopies} onChange={(e) => set("printCopies", Math.max(1, Math.min(10, Number(e.target.value))))} />
              </Field>
              <div className="flex items-center gap-3">
                <button type="button" onClick={runTestPrint} disabled={testPrintStatus === "printing"} className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:border-accent disabled:opacity-50">
                  {testPrintStatus === "printing" ? "Mencetak..." : "Test print"}
                </button>
                {testPrintStatus === "ok" && <span className="text-xs text-emerald-300">● Terkirim ke printer</span>}
                {testPrintStatus === "error" && <span className="text-xs text-red-300">● {testPrintError}</span>}
              </div>
            </div>
          </section>
          </div>
          {activeSection === "kiosk" && <KioskPreview config={config} />}
        </div>
      </div>
    </div>
  );
}
