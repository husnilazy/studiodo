import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import QRCode from "qrcode";
import { api } from "@/lib/api";
import { useKioskSession } from "@/lib/sessionStore";
import type { CameraFilter } from "@/lib/sessionStore";
import { useBoothConfig } from "@/lib/boothConfigStore";
import type { BoothConfig } from "@/lib/boothConfigStore";
import { renderTemplate } from "@/lib/output";
import { renderPhotoStrip } from "@/lib/stripRenderer";
import { OUTPUT_PRESETS, useTemplateLibrary } from "@/lib/templateStore";
import type { LocalTemplate } from "@/lib/templateStore";
import { useStickerLibrary } from "@/lib/stickerStore";
import VirtualKeyboard from "@/components/VirtualKeyboard";
import { isBrowserOnline } from "@/lib/offlineStore";

function canvasToJpegBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Gagal membuat file strip"));
    }, "image/jpeg", 0.95);
  });
}

// Strip fisik selalu dicetak di 4R, terlepas dari outputPreset digital yang
// dipilih customer — printer booth secara fisik memakai kertas 4R.
async function renderPrintStrip(
  photoUrls: string[],
  template: LocalTemplate | null,
  photoStickers: { stickerId: string; x: number; y: number; scale: number }[],
  stickerAssets: Record<string, string>,
  templatePhotoMap: Record<number, number>,
  colorCorrection: { brightness: number; contrast: number; saturation: number },
  accentColor: string,
  stripLayout: BoothConfig["stripLayout"],
  stripTemplate: BoothConfig["stripTemplate"],
  filter: CameraFilter,
) {
  const sourceCanvas = document.createElement("canvas");
  if (template) {
    await renderTemplate(photoUrls, template, sourceCanvas, photoStickers, stickerAssets, filter, templatePhotoMap, colorCorrection);
  } else {
    await renderPhotoStrip(photoUrls, sourceCanvas, { accentColor, stripLayout, stripTemplate, outputPreset: "4r", filter });
  }

  const printCanvas = document.createElement("canvas");
  printCanvas.width = OUTPUT_PRESETS["4r"].width;
  printCanvas.height = OUTPUT_PRESETS["4r"].height;
  const printContext = printCanvas.getContext("2d");
  if (!printContext) throw new Error("Canvas print tidak tersedia");
  printContext.fillStyle = "#ffffff";
  printContext.fillRect(0, 0, printCanvas.width, printCanvas.height);
  const scale = Math.max(printCanvas.width / sourceCanvas.width, printCanvas.height / sourceCanvas.height);
  const width = sourceCanvas.width * scale;
  const height = sourceCanvas.height * scale;
  printContext.drawImage(sourceCanvas, (printCanvas.width - width) / 2, (printCanvas.height - height) / 2, width, height);
  return printCanvas.toDataURL("image/jpeg", 0.95);
}

export default function Hasil() {
  const [, navigate] = useLocation();
  const { photoUrls, sessionId, selectedTemplateId, selectedTemplateData, outputPreset, filter, colorCorrection, mediaUrls, resetSession, templatePhotoMap } = useKioskSession();
  const storedTemplate = useTemplateLibrary((state) => state.templates.find((item) => item.id === selectedTemplateId));
  const template = selectedTemplateData ?? storedTemplate;
  const { photoStickers } = useKioskSession();
  const stickerList = useStickerLibrary((state) => state.stickers);
  const stickerAssets = useMemo(() => Object.fromEntries(stickerList.map((sticker) => [sticker.id, sticker.dataUrl])), [stickerList]);
  const config = useBoothConfig((s) => s.config);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const additionalQrCanvasRef = useRef<HTMLCanvasElement>(null);
  const [stripDataUrl, setStripDataUrl] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printStatus, setPrintStatus] = useState<"idle" | "ok" | "error">("idle");
  const [printError, setPrintError] = useState<string | null>(null);
  const autoPrintTriggeredRef = useRef(false);
  const [keyboardField, setKeyboardField] = useState<"whatsapp" | "email" | null>(null);
  const [customerSaved, setCustomerSaved] = useState(false);
  const [additionalPrintConfig, setAdditionalPrintConfig] = useState<{ enabled: boolean; label: string; price: number; max: number } | null>(null);
  const [additionalQuantity, setAdditionalQuantity] = useState(1);
  const [additionalPayment, setAdditionalPayment] = useState<"idle" | "starting" | "waiting" | "printing" | "done" | "error">("idle");
  const [additionalQr, setAdditionalQr] = useState<string | null>(null);
  const [additionalError, setAdditionalError] = useState<string | null>(null);
  const additionalPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [stripRendering, setStripRendering] = useState(true);
  const [driveShareUrl, setDriveShareUrl] = useState<string | null>(null);

  useEffect(() => {
    api.getPrintingConfig().then(setAdditionalPrintConfig).catch(() => setAdditionalPrintConfig(null));
    return () => { if (additionalPollRef.current) clearInterval(additionalPollRef.current); };
  }, []);

  useEffect(() => {
    if (additionalQr && additionalQrCanvasRef.current) QRCode.toCanvas(additionalQrCanvasRef.current, additionalQr, { width: 180 });
  }, [additionalQr]);

  useEffect(() => {
    if (!sessionId || photoUrls.length === 0) {
      navigate("/");
      return;
    }
    setStripRendering(true);
    (async () => {
      const canvas = canvasRef.current!;
      if (template) {
        await renderTemplate(photoUrls, template, canvas, photoStickers, stickerAssets, filter, templatePhotoMap, colorCorrection);
      } else {
        await renderPhotoStrip(photoUrls, canvas, { accentColor: config.accentColor, stripLayout: config.stripLayout, stripTemplate: config.stripTemplate, outputPreset, filter });
      }
      setStripDataUrl(canvas.toDataURL("image/jpeg", 0.95));
      setStripRendering(false);
      const shareUrl = `${window.location.origin}/#/share/${sessionId}`;
      setShareUrl(shareUrl);
      if (isBrowserOnline() && !sessionId.startsWith("offline-")) {
        const stripBlob = await canvasToJpegBlob(canvas);
        const stripSession = await api.uploadStrip(sessionId, stripBlob);
        const finalized = await api.finalizeSession(sessionId, { stripUrl: stripSession.stripUrl, shareUrl });
        // Jika pakai Google Drive, gunakan folder URL untuk QR
        const qrTarget = finalized?.driveFolderUrl ?? finalized?.driveLinks?.folderUrl ?? shareUrl;
        setDriveShareUrl(finalized?.driveFolderUrl ?? finalized?.driveLinks?.folderUrl ?? null);
        if (qrCanvasRef.current) QRCode.toCanvas(qrCanvasRef.current, qrTarget, { width: 200, margin: 1, color: { dark: "#000000", light: "#ffffff" } });
      } else {
        if (qrCanvasRef.current) QRCode.toCanvas(qrCanvasRef.current, shareUrl, { width: 200, margin: 1, color: { dark: "#000000", light: "#ffffff" } });
      }
    })();
  }, [sessionId, template, outputPreset, filter, colorCorrection, photoStickers, stickerAssets, templatePhotoMap, config.stripLayout, config.stripTemplate, config.accentColor]);

  const download = () => {
    if (!stripDataUrl) return;
    const a = document.createElement("a");
    a.href = stripDataUrl;
    a.download = `${config.brandName.toLowerCase().replace(/\s+/g, "-")}-strip.jpg`;
    a.click();
  };

  const finish = () => {
    resetSession();
    navigate("/");
  };

  const saveCustomer = async () => {
    if (!sessionId || savingCustomer) return;
    setSavingCustomer(true);
    setCustomerSaved(false);
    try {
      await api.updateCustomer(sessionId, { whatsapp: whatsapp.trim() || undefined, email: email.trim() || undefined, publishConsent: consent });
      setCustomerSaved(true);
    } finally {
      setSavingCustomer(false);
    }
  };

  const printNow = async (copies = config.printCopies) => {
    if (!stripDataUrl || printing) return;
    setPrinting(true);
    setPrintStatus("idle");
    setPrintError(null);
    try {
      if (window.studiodo?.printImage) {
        const printDataUrl = await renderPrintStrip(photoUrls, template ?? null, photoStickers, stickerAssets, templatePhotoMap, colorCorrection, config.accentColor, config.stripLayout, config.stripTemplate, filter);
        const result = await window.studiodo.printImage({
          dataUrl: printDataUrl,
          printerName: config.printerName,
          copies,
        });
        if (result.ok) setPrintStatus("ok");
        else {
          setPrintStatus("error");
          setPrintError(result.error ?? "Print gagal");
        }
      } else {
        // Fallback saat dijalankan di browser biasa (bukan aplikasi desktop STUDIODO)
        window.setTimeout(() => window.print(), 200);
      }
    } catch (error) {
      setPrintStatus("error");
      setPrintError(error instanceof Error ? error.message : "Print gagal");
    } finally {
      setPrinting(false);
    }
  };

  const buyAdditionalPrint = async () => {
    if (!sessionId || !additionalPrintConfig || additionalPayment !== "idle") return;
    setAdditionalPayment("starting");
    setAdditionalError(null);
    try {
      const result = await api.startAdditionalPrint(sessionId, additionalQuantity);
      setAdditionalQr(result.qrString);
      setAdditionalPayment("waiting");
      additionalPollRef.current = setInterval(async () => {
        try {
          const status = await api.getPaymentStatus(sessionId);
          if (status.status === "success" && status.additionalPrintsPending === 0) {
            if (additionalPollRef.current) clearInterval(additionalPollRef.current);
            setAdditionalPayment("printing");
            await printNow(additionalQuantity);
            setAdditionalPayment("done");
          }
        } catch (error) {
          if (additionalPollRef.current) clearInterval(additionalPollRef.current);
          setAdditionalPayment("error");
          setAdditionalError(error instanceof Error ? error.message : "Gagal memeriksa pembayaran.");
        }
      }, 1200);
    } catch (error) {
      setAdditionalPayment("error");
      setAdditionalError(error instanceof Error ? error.message : "Gagal membuat pembayaran print tambahan.");
    }
  };

  // Cetak otomatis begitu strip selesai dirender, kalau diaktifkan admin.
  useEffect(() => {
    if (!config.autoPrintEnabled || !stripDataUrl || autoPrintTriggeredRef.current) return;
    if (!window.studiodo?.printImage) return; // hanya jalan di aplikasi desktop
    autoPrintTriggeredRef.current = true;
    printNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.autoPrintEnabled, stripDataUrl]);


  const keyboardValue = keyboardField === "whatsapp" ? whatsapp : email;
  const updateKeyboardValue = (value: string) => {
    if (keyboardField === "whatsapp") setWhatsapp(value);
    if (keyboardField === "email") setEmail(value.toLowerCase());
  };

  return (
    <div className="kinetic-page h-full overflow-y-auto px-5 py-8 sm:px-10">
      <header className="mx-auto max-w-6xl">
        <span className="eyebrow">06 / YOUR MOMENT</span>
        <h2 className="mt-2 font-display text-4xl font-bold sm:text-6xl">Hasil fotomu sudah siap.</h2>
        <p className="mt-2 text-white/50">Foto final, media, dan QR download ada di sini.</p>
      </header>

      <main className="mx-auto mt-8 grid min-h-0 max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="glass-panel flex min-h-[420px] items-center justify-center overflow-hidden rounded-[2rem] p-5 sm:p-8 lg:max-h-[calc(100vh-220px)]">
          <AnimatePresence mode="wait">
            {stripRendering ? (
              <motion.div
                key="skeleton"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-5"
              >
                {/* Skeleton strip placeholder */}
                <div className="relative flex h-[52vh] w-48 flex-col gap-2 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="flex-1 animate-pulse rounded-xl bg-white/[0.07]"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/20 backdrop-blur-[2px]">
                    <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-accent" />
                    <p className="text-center text-sm font-semibold text-white/70">Menyiapkan hasil foto...</p>
                    <p className="text-xs text-white/40">Sedang merender strip</p>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="canvas"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                <canvas ref={canvasRef} className="max-h-[62vh] max-w-full rounded-2xl border border-white/10 shadow-2xl" />
              </motion.div>
            )}
          </AnimatePresence>
          {/* Hidden canvas always mounted for rendering */}
          {stripRendering && <canvas ref={canvasRef} className="hidden" />}
        </section>
        <aside className="min-w-0 space-y-5 lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto lg:pr-1">
          {/* QR Download Card */}
          <div className="glass-panel overflow-hidden rounded-[2rem] p-5">
            <p className="eyebrow mb-3 text-center">SCAN & DOWNLOAD</p>
            <div className="relative flex justify-center">
              {/* Pulsing ring while rendering */}
              {stripRendering && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-16 w-16 animate-ping rounded-full border-2 border-accent/30" />
                  <div className="absolute h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-accent" />
                </div>
              )}
              {/* QR Code canvas */}
              <div className={`rounded-2xl bg-white p-3 shadow-xl transition-opacity duration-500 ${stripRendering ? "opacity-0" : "opacity-100"}`}>
                <canvas ref={qrCanvasRef} className="block rounded-lg" />
              </div>
            </div>
            {/* Drive or share info */}
            <div className="mt-4 text-center">
              {driveShareUrl ? (
                <>
                  <div className="mb-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-blue-300">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>
                    Tersimpan di Google Drive
                  </div>
                  <p className="text-sm text-white/60">Scan untuk lihat & download semua foto</p>
                </>
              ) : (
                <p className="text-sm text-white/60">Scan untuk download foto di HP kamu</p>
              )}
              {shareUrl && (
                <a
                  href={driveShareUrl ?? shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-white/15 py-2 text-xs text-white/50 transition hover:border-accent/50 hover:text-accent"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  Buka di browser
                </a>
              )}
            </div>
          </div>
          <div className="glass-panel rounded-[2rem] p-5">
          <p className="eyebrow">KIRIM HASIL</p>
          <h3 className="mt-1 font-display text-xl font-semibold">Biodata customer</h3>
          <div className="mt-3 space-y-2">
            <input value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} onFocus={() => setKeyboardField("whatsapp")} placeholder="Nomor WhatsApp" className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-3 outline-none focus:border-accent" />
            <input value={email} onChange={(event) => setEmail(event.target.value)} onFocus={() => setKeyboardField("email")} type="email" placeholder="Email (opsional)" className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-3 outline-none focus:border-accent" />
            <label className="flex gap-2 text-xs text-white/55"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> Izinkan hasil digunakan untuk galeri StudiDo</label>
            <button onClick={saveCustomer} disabled={savingCustomer} className="w-full rounded-xl border border-white/15 px-4 py-3 text-sm hover:border-accent disabled:opacity-50">{savingCustomer ? "Menyimpan..." : "Simpan biodata"}</button>
            {customerSaved && <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200">Biodata berhasil dikirim dan tersimpan.</p>}
          </div>
          </div>
          {additionalPrintConfig?.enabled && (
            <div className="glass-panel rounded-[2rem] p-5">
              <p className="eyebrow">CETAK LAGI</p>
              <h3 className="mt-1 font-display text-xl font-semibold">{additionalPrintConfig.label}</h3>
              <p className="mt-1 text-sm text-white/50">Bayar lagi dengan QRIS, lalu {additionalQuantity} lembar akan langsung dicetak.</p>
              <div className="mt-4 flex items-center gap-3">
                <label className="text-sm text-white/60" htmlFor="additional-print-quantity">Jumlah</label>
                <input id="additional-print-quantity" type="number" min={1} max={additionalPrintConfig.max} value={additionalQuantity} onChange={(event) => setAdditionalQuantity(Math.max(1, Math.min(additionalPrintConfig.max, Number(event.target.value) || 1)))} className="w-20 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-center outline-none focus:border-accent" />
                <span className="text-sm font-semibold text-accent">Rp {(additionalQuantity * additionalPrintConfig.price).toLocaleString("id-ID")}</span>
              </div>
              <button type="button" onClick={buyAdditionalPrint} disabled={additionalPayment !== "idle"} className="mt-4 w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold disabled:opacity-50">
                {additionalPayment === "starting" ? "Menyiapkan QRIS..." : additionalPayment === "waiting" ? "Menunggu pembayaran..." : additionalPayment === "printing" ? "Mencetak..." : additionalPayment === "done" ? "Sudah dicetak" : "Bayar & cetak lagi"}
              </button>
              {additionalPayment === "waiting" && additionalQr && <div className="mt-4 flex justify-center rounded-xl bg-white p-3"><canvas ref={additionalQrCanvasRef} /></div>}
              {additionalPayment === "done" && <p className="mt-3 text-xs text-emerald-300">Pembayaran berhasil. Print tambahan dikirim ke printer.</p>}
              {additionalPayment === "error" && <p className="mt-3 text-xs text-red-300">{additionalError}</p>}
            </div>
          )}
        </aside>
      </main>

      <div className="mx-auto mt-6 flex max-w-6xl flex-wrap items-center justify-center gap-3">
        <button onClick={() => printNow()} disabled={printing} className="rounded-xl bg-accent px-7 py-3 font-semibold shadow-lg shadow-accent/20 disabled:opacity-60">{printing ? "Sedang mencetak..." : "Print Sekarang"}</button>
        <button onClick={download} className="rounded-xl border border-white/20 px-7 py-3 hover:border-accent">Download</button>
        <button onClick={finish} className="rounded-xl border border-white/20 px-7 py-3 hover:border-accent">Selesai</button>
        {printStatus === "ok" && <span className="text-xs text-emerald-300">● Terkirim ke printer (4R)</span>}
        {printStatus === "error" && <span className="text-xs text-red-300">● Print gagal: {printError}</span>}
      </div>

      {mediaUrls.length > 0 && (
        <section className="mx-auto mt-8 max-w-6xl rounded-[2rem] border border-white/10 bg-black/20 p-5">
          <div className="mb-4"><span className="eyebrow">MEDIA MOMENTS</span><h3 className="font-display text-2xl font-semibold">Video & GIF</h3></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mediaUrls.map((mediaUrl, index) => (
          <div key={mediaUrl} className="flex flex-col items-center gap-2">
            <video src={mediaUrl} controls playsInline className="w-full rounded-xl border border-white/10" />
            <a href={mediaUrl} download={`${config.brandName.toLowerCase().replace(/\s+/g, "-")}-clip-${index + 1}.webm`} className="text-sm text-accent">
              Download clip {index + 1}
            </a>
          </div>
          ))}
          </div>
        </section>
      )}
      {keyboardField && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-3 pb-4 backdrop-blur-[2px] sm:p-5 sm:pb-6" onMouseDown={(event) => { if (event.target === event.currentTarget) setKeyboardField(null); }}>
          <div className="w-full max-w-4xl">
            <div className="mb-2 flex items-center justify-between rounded-2xl border border-white/10 bg-ink-950/95 px-4 py-3 text-sm text-white/60">
              <div><span>{keyboardField === "whatsapp" ? "Isi nomor WhatsApp" : "Isi email"}</span><p className="mt-1 max-w-[420px] truncate text-base font-semibold text-white">{keyboardValue || "Belum ada ketikan"}</p></div>
              <button onClick={() => setKeyboardField(null)} className="rounded-lg px-3 py-1 text-white/60 hover:bg-white/10 hover:text-white">Tutup</button>
            </div>
            <VirtualKeyboard value={keyboardValue} onChange={updateKeyboardValue} onClose={() => setKeyboardField(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
