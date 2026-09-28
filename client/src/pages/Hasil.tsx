import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import QRCode from "qrcode";
import { api } from "@/lib/api";
import { useKioskSession } from "@/lib/sessionStore";
import type { CameraFilter, PhotoSticker } from "@/lib/sessionStore";
import { useBoothConfig } from "@/lib/boothConfigStore";
import type { BoothConfig } from "@/lib/boothConfigStore";
import { renderTemplate } from "@/lib/output";
import { renderPhotoStrip } from "@/lib/stripRenderer";
import { OUTPUT_PRESETS, useTemplateLibrary } from "@/lib/templateStore";
import type { LocalTemplate } from "@/lib/templateStore";
import { useStickerLibrary } from "@/lib/stickerStore";
import VirtualKeyboard from "@/components/VirtualKeyboard";
import { addPendingStrip, isBrowserOnline, isOfflineSessionId } from "@/lib/offlineStore";
import { ScreenLayoutBoundary } from "@/lib/screenBuilder/ScreenLayoutBoundary";
import { usePositionableContext } from "@/lib/screenBuilder/PositionableContext";
import Positionable from "@/components/Positionable";
import Spinner from "@/components/Spinner";

// Small stroke icons used across the redesigned result screen — kept local
// (not a dependency) since each one is only ever this one size/weight here.
type IconProps = { className?: string };
const iconBase = "h-full w-full";
const IconPreview = ({ className }: IconProps) => (
  <svg className={className ?? iconBase} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="4" width="14" height="14" rx="2.5" /><path strokeLinecap="round" strokeLinejoin="round" d="m3 14 3.5-3.5a1.5 1.5 0 0 1 2.1 0L13 15" /><circle cx="12" cy="8.5" r="1.5" /><path strokeLinecap="round" d="M18 8v10.5A2.5 2.5 0 0 1 15.5 21H7" /></svg>
);
const IconScan = ({ className }: IconProps) => (
  <svg className={className ?? iconBase} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" /><path strokeLinecap="round" d="M4 12h16" /></svg>
);
const IconDownload = ({ className }: IconProps) => (
  <svg className={className ?? iconBase} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v11m0 0-4-4m4 4 4-4" /><path strokeLinecap="round" d="M4 17v1.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V17" /></svg>
);
const IconGallery = ({ className }: IconProps) => (
  <svg className={className ?? iconBase} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="8.5" cy="9.5" r="1.5" /><path strokeLinecap="round" strokeLinejoin="round" d="m4 17 4.5-4.5a1.8 1.8 0 0 1 2.5 0L15 16.5M14 13.5l1.6-1.6a1.8 1.8 0 0 1 2.5 0L21 14.5" /></svg>
);
const IconShare = ({ className }: IconProps) => (
  <svg className={className ?? iconBase} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path strokeLinecap="round" d="m8.2 10.8 7.6-4.6M8.2 13.2l7.6 4.6" /></svg>
);
const IconUser = ({ className }: IconProps) => (
  <svg className={className ?? iconBase} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="8" r="3.5" /><path strokeLinecap="round" d="M4.5 20c1-3.8 4-6 7.5-6s6.5 2.2 7.5 6" /></svg>
);
const IconPhone = ({ className }: IconProps) => (
  <svg className={className ?? iconBase} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M6.5 3.5h2.2l1.3 4-2 1.3a11 11 0 0 0 5.2 5.2l1.3-2 4 1.3v2.2c0 1-.9 1.8-1.9 1.6-8-1.3-13-6.3-14.3-14.3-.2-1 .6-1.9 1.6-1.9Z" /></svg>
);
const IconMail = ({ className }: IconProps) => (
  <svg className={className ?? iconBase} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path strokeLinecap="round" strokeLinejoin="round" d="m4 7 8 6 8-6" /></svg>
);
const IconCheck = ({ className }: IconProps) => (
  <svg className={className ?? iconBase} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9.5" /><path strokeLinecap="round" strokeLinejoin="round" d="m8 12.5 2.6 2.6L16.5 9" /></svg>
);
const IconPrinter = ({ className }: IconProps) => (
  <svg className={className ?? iconBase} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M7 8V4h10v4" /><rect x="4" y="8" width="16" height="8" rx="2" /><path strokeLinecap="round" strokeLinejoin="round" d="M7 16h10v5H7z" /></svg>
);
const IconRefresh = ({ className }: IconProps) => (
  <svg className={className ?? iconBase} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4 12a8 8 0 0 1 13.66-5.66L20 8.5M20 12a8 8 0 0 1-13.66 5.66L4 15.5M20 4v4.5h-4.5M4 20v-4.5h4.5" /></svg>
);
const IconPlus = ({ className }: IconProps) => (
  <svg className={className ?? iconBase} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M12 5v14M5 12h14" /></svg>
);
const IconMinus = ({ className }: IconProps) => (
  <svg className={className ?? iconBase} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M5 12h14" /></svg>
);

function ActionRow({ icon, label, sub, onClick, loading, disabled }: { icon: React.ReactNode; label: string; sub: string; onClick: () => void; loading?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left transition hover:border-accent/40 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/70">
        {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <span className="h-[18px] w-[18px]">{icon}</span>}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{label}</span>
        <span className="block truncate text-xs text-white/45">{sub}</span>
      </span>
    </button>
  );
}

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
  photoStickers: PhotoSticker[],
  stickerAssets: Record<string, string>,
  templatePhotoMap: Record<number, number>,
  colorCorrection: { brightness: number; contrast: number; saturation: number },
  accentColor: string,
  stripLayout: BoothConfig["stripLayout"],
  stripTemplate: BoothConfig["stripTemplate"],
  filter: CameraFilter,
  mirror: boolean,
) {
  const sourceCanvas = document.createElement("canvas");
  if (template) {
    await renderTemplate(photoUrls, template, sourceCanvas, photoStickers, stickerAssets, filter, templatePhotoMap, colorCorrection, mirror);
  } else {
    await renderPhotoStrip(photoUrls, sourceCanvas, { accentColor, stripLayout, stripTemplate, outputPreset: "4r", filter, mirror });
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
  const { photoUrls, sessionId, selectedTemplateId, selectedTemplateData, outputPreset, filter, colorCorrection, mediaUrls, slotClipUrls, resetSession, templatePhotoMap, outputMirrored, selectedPackage, setMediaUrl } = useKioskSession();
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
  // "choose" is not shown as a distinct step — it's just "no method picked
  // yet"; picking QRIS re-enters the existing buyAdditionalPrint flow below,
  // picking voucher reveals a code field instead of forcing QRIS as the only
  // way to pay for extra prints.
  const [additionalMode, setAdditionalMode] = useState<"choose" | "voucher" | "qris">("choose");
  const [additionalVoucherCode, setAdditionalVoucherCode] = useState("");
  const [stripRendering, setStripRendering] = useState(true);
  const [driveShareUrl, setDriveShareUrl] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<"pending" | "ok" | "error">("pending");
  const AUTO_RESET_SECONDS = 120;
  const [autoResetSeconds, setAutoResetSeconds] = useState(AUTO_RESET_SECONDS);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [shareCopied, setShareCopied] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  // Combined GIF/video normally arrives via the live SesiFoto session's own
  // store (setMediaUrl, called from combineSlotClips). But that upload is a
  // fire-and-forget background task there — a session that hit the event
  // timer, or a page reload here, can land on this screen before it's done,
  // leaving mediaUrls empty forever with nothing to ever re-check it. This
  // polls the server (same api.getPublicSession ShareGallery.tsx already
  // relies on) as a fallback so the preview doesn't just stay blank.
  const [awaitingMedia, setAwaitingMedia] = useState(false);
  // Set only when the poll below genuinely exhausted its attempts with
  // nothing found — as opposed to "never needed to poll" — so the carousel
  // can say so instead of just quietly having one fewer slide than expected.
  const [mediaFetchFailed, setMediaFetchFailed] = useState(false);
  // Mounted inside the WYSIWYG editor with no real session — sessionId/photoUrls
  // are always empty there, so the redirect-to-idle guard below needs to stand
  // down instead of bouncing the admin out the moment they open the editor.
  const positionable = usePositionableContext();

  useEffect(() => {
    api.getPrintingConfig().then((result) => setAdditionalPrintConfig(result ?? null)).catch(() => setAdditionalPrintConfig(null));
    return () => { if (additionalPollRef.current) clearInterval(additionalPollRef.current); };
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    if (!selectedPackage?.hasGif && !selectedPackage?.hasVideo) return;
    if (mediaUrls.length > 0) return; // already have it from the live session's own store
    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 10;
    setAwaitingMedia(true);
    const poll = async () => {
      if (cancelled) return;
      try {
        const data = await api.getPublicSession(sessionId);
        const urls = [data?.gifUrl, data?.videoUrl].filter(Boolean) as string[];
        if (urls.length > 0) {
          if (!cancelled) {
            urls.forEach((url) => setMediaUrl(url));
            setAwaitingMedia(false);
          }
          return;
        }
      } catch (error) {
        console.warn("Gagal mengambil GIF/video sesi dari server", error);
      }
      attempts += 1;
      if (attempts >= MAX_ATTEMPTS) {
        if (!cancelled) {
          setAwaitingMedia(false);
          setMediaFetchFailed(true);
          console.error("GIF/video sesi tidak pernah muncul di server setelah polling", { sessionId, attempts });
        }
        return;
      }
      if (!cancelled) window.setTimeout(poll, 2000);
    };
    void poll();
    return () => { cancelled = true; };
    // Intentionally only keyed on sessionId — mediaUrls.length is read once
    // up front to decide whether to start polling at all, not to react to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    if (additionalQr && additionalQrCanvasRef.current) QRCode.toCanvas(additionalQrCanvasRef.current, additionalQr, { width: 180 });
  }, [additionalQr]);

  useEffect(() => {
    if (!sessionId || photoUrls.length === 0) {
      if (!positionable?.editMode) navigate("/");
      return;
    }
    setStripRendering(true);
    setUploadStatus("pending");
    (async () => {
      const canvas = canvasRef.current!;
      if (template) {
        await renderTemplate(photoUrls, template, canvas, photoStickers, stickerAssets, filter, templatePhotoMap, colorCorrection, outputMirrored);
      } else {
        await renderPhotoStrip(photoUrls, canvas, { accentColor: config.accentColor, stripLayout: config.stripLayout, stripTemplate: config.stripTemplate, outputPreset, filter, mirror: outputMirrored });
      }
      setStripDataUrl(canvas.toDataURL("image/jpeg", 0.95));
      setStripRendering(false);

      // Draw the QR right away using the origin we're already running on —
      // this must never block on a network call. getPublicConfig only
      // upgrades the URL to the tenant's official public domain (e.g.
      // qr.studiodo.id instead of the kiosk's own origin) and can be slow
      // (a cold-started database can take several seconds to answer), which
      // used to leave the QR canvas blank the whole time it was in flight.
      const originShareUrl = `${window.location.origin}/#/share/${sessionId}`;
      setShareUrl(originShareUrl);
      if (qrCanvasRef.current) {
        QRCode.toCanvas(qrCanvasRef.current, originShareUrl, { width: 220, margin: 1, color: { dark: "#000000", light: "#ffffff" } }).catch((error) => console.error("Gagal render QR code", error));
      }

      // None of api.ts's fetch calls carry a timeout — a slow/hung request
      // (cold-started DB, flaky tunnel) used to stall this whole chain
      // forever, silently leaving both the QR stuck on this kiosk's own
      // (often unreachable, e.g. localhost) origin AND the strip/finalize
      // step below it never even attempted. Bound every step so a network
      // hiccup degrades to "still shows a working QR, upload retried later"
      // instead of "customer stares at a screen that never finishes."
      const withTimeout = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> =>
        Promise.race([promise, new Promise<T>((resolve) => window.setTimeout(() => resolve(fallback), ms))]);

      const publicConfig = await withTimeout(api.getPublicConfig(sessionId).catch(() => undefined), 4000, undefined);
      const publicBaseUrl = publicConfig?.baseUrl || window.location.origin;
      const localShareUrl = `${publicBaseUrl}/#/share/${sessionId}`;
      if (localShareUrl !== originShareUrl) {
        setShareUrl(localShareUrl);
        if (qrCanvasRef.current) {
          QRCode.toCanvas(qrCanvasRef.current, localShareUrl, { width: 220, margin: 1, color: { dark: "#000000", light: "#ffffff" } }).catch((error) => console.error("Gagal render QR code", error));
        }
      }

      if (isBrowserOnline() && !isOfflineSessionId(sessionId)) {
        try {
          const stripBlob = await canvasToJpegBlob(canvas);
          const stripSession = await withTimeout(api.uploadStrip(sessionId, stripBlob), 15000, undefined);
          if (!stripSession) throw new Error("Upload strip timeout/gagal");
          // shareUrl is NOT sent — the server always computes it from its own
          // PUBLIC_BASE_URL, since a client-side guess (window.location.origin)
          // is "file://" inside a packaged Electron kiosk and would otherwise
          // get persisted as the session's permanent (broken) share link.
          const finalized = await withTimeout(api.finalizeSession(sessionId, { stripUrl: stripSession.stripUrl }), 10000, undefined);
          const finalShareUrl = finalized?.shareUrl ?? localShareUrl;
          setShareUrl(finalShareUrl);
          setDriveShareUrl(finalized?.driveFolderUrl ?? finalized?.driveLinks?.folderUrl ?? null);
          // QR harus mengarah ke halaman hasil khusus/session agar user bisa membuka
          // halaman download dan gallery, bukan langsung folder Google Drive.
          if (finalShareUrl !== localShareUrl && qrCanvasRef.current) {
            QRCode.toCanvas(qrCanvasRef.current, finalShareUrl, { width: 220, margin: 1, color: { dark: "#000000", light: "#ffffff" } }).catch((error) => console.error("Gagal render QR code", error));
          }
          setUploadStatus("ok");
        } catch (error) {
          // The QR (pointing at localShareUrl) is already showing — queue the
          // strip instead of giving up: syncOfflineData() retries this once
          // the network (or a transient server hiccup) recovers, same
          // mechanism as a genuinely offline session below.
          console.error("Gagal upload strip / finalize sesi, akan dicoba lagi otomatis", error);
          try {
            const stripBlob = await canvasToJpegBlob(canvas);
            await addPendingStrip(sessionId, stripBlob, localShareUrl);
          } catch (queueError) {
            console.error("Gagal mengantrikan strip untuk sinkronisasi ulang", queueError);
          }
          setUploadStatus("error");
        }
      } else {
        try {
          const stripBlob = await canvasToJpegBlob(canvas);
          await addPendingStrip(sessionId, stripBlob, localShareUrl);
        } catch (queueError) {
          console.error("Gagal mengantrikan strip untuk sinkronisasi ulang", queueError);
        }
        setUploadStatus("ok");
      }
    })();
  }, [sessionId, template, outputPreset, filter, colorCorrection, photoStickers, stickerAssets, templatePhotoMap, config.stripLayout, config.stripTemplate, config.accentColor, outputMirrored]);

  const slug = config.brandName.toLowerCase().replace(/\s+/g, "-");

  const downloadViaAnchor = (url: string, filename: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  };

  // Saves straight to disk (Electron's Downloads/STUDIODO folder) instead of
  // the browser's own download flow when running as the real kiosk app —
  // only for remote (http) URLs, since the main process downloads by
  // fetching the URL itself and can't do that for a local data: URL.
  const downloadFile = async (url: string, filename: string) => {
    if (window.studiodo?.downloadAsset && !url.startsWith("data:")) {
      const result = await window.studiodo.downloadAsset({ url, filename }).catch(() => ({ ok: false }));
      if (result.ok) return;
    }
    downloadViaAnchor(url, filename);
  };

  const download = () => {
    if (!stripDataUrl) return;
    downloadViaAnchor(stripDataUrl, `${slug}-strip.jpg`);
  };

  // "Download semua foto" — the hero strip plus every clip (combined + per-
  // slot), not just the one photo `download()` grabs.
  const downloadAll = async () => {
    if (!stripDataUrl || downloadingAll) return;
    setDownloadingAll(true);
    try {
      await downloadFile(stripDataUrl, `${slug}-strip.jpg`);
      for (let i = 0; i < mediaUrls.length; i++) {
        const url = mediaUrls[i];
        await downloadFile(url, `${slug}-clip-${i + 1}.${url.toLowerCase().endsWith(".gif") ? "gif" : "webm"}`);
      }
      for (let i = 0; i < slotClipUrls.length; i++) {
        const url = slotClipUrls[i];
        if (!url) continue;
        await downloadFile(url, `${slug}-foto-${i + 1}.${url.toLowerCase().endsWith(".gif") ? "gif" : "webm"}`);
      }
    } finally {
      setDownloadingAll(false);
    }
  };

  // Native share sheet where available (mobile browsers, some desktop
  // Chromium builds); an Electron kiosk almost never has one, so this
  // falls back to copying the link — still lets the customer text/AirDrop
  // it themselves instead of the button doing nothing.
  const shareResult = async () => {
    if (!shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: config.brandName, text: "Lihat hasil foto photobooth aku!", url: shareUrl });
        return;
      } catch {
        // Cancelled or unsupported mid-call — fall through to clipboard copy.
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 2500);
    } catch {
      // Clipboard blocked (rare, permissions) — the QR/"Buka di browser" link is still right there.
    }
  };

  const finish = () => {
    resetSession();
    navigate("/");
  };

  useEffect(() => {
    if (!sessionId) return;
    // Pause the auto-reset while a print-tambahan QRIS payment is in flight —
    // otherwise a customer mid-payment (or waiting on the printer) gets
    // yanked back to idle before it completes. Resumes with a fresh timer once
    // that flow lands on done/error, or immediately if never started. Also
    // paused while still polling the server for a GIF/video that hasn't
    // arrived yet, for the same reason.
    if (additionalPayment === "starting" || additionalPayment === "waiting" || additionalPayment === "printing") return;
    if (awaitingMedia) return;
    setAutoResetSeconds(AUTO_RESET_SECONDS);
    const interval = window.setInterval(() => {
      setAutoResetSeconds((value) => Math.max(0, value - 1));
    }, 1000);
    const timeout = window.setTimeout(finish, AUTO_RESET_SECONDS * 1000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [sessionId, additionalPayment, awaitingMedia]);

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
        const printDataUrl = await renderPrintStrip(photoUrls, template ?? null, photoStickers, stickerAssets, templatePhotoMap, colorCorrection, config.accentColor, config.stripLayout, config.stripTemplate, filter, outputMirrored);
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
    setAdditionalMode("qris");
    setAdditionalPayment("starting");
    setAdditionalError(null);
    try {
      const result = await api.startAdditionalPrint(sessionId, additionalQuantity);
      if (!result) throw new Error("Gagal memulai cetak tambahan");
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

  // Alternative to QRIS for extra prints — redeems a voucher/cash code
  // against just this charge (never touches the original session's total,
  // see server/routes/payment.ts POST /additional-print/voucher), then
  // reuses the exact same print-and-mark-done tail buyAdditionalPrint's
  // QRIS poll uses once payment is confirmed.
  const redeemAdditionalPrintVoucher = async () => {
    if (!sessionId || !additionalVoucherCode.trim() || additionalPayment !== "idle") return;
    setAdditionalPayment("starting");
    setAdditionalError(null);
    try {
      const result = await api.redeemAdditionalPrintVoucher(sessionId, additionalVoucherCode.trim(), additionalQuantity);
      if (!result?.valid) throw new Error("Voucher tidak valid");
      setAdditionalPayment("printing");
      await printNow(additionalQuantity);
      setAdditionalPayment("done");
    } catch (error) {
      setAdditionalPayment("error");
      setAdditionalError(error instanceof Error ? error.message : "Voucher tidak dapat digunakan.");
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

  // While still polling the server for a GIF/video that hasn't landed yet
  // (or once that poll has given up), reserve one extra carousel slide for a
  // loading/failure placeholder instead of just leaving the arrows/dots
  // undersized, or having that slide silently vanish once polling stops.
  const showExtraMediaSlide = (awaitingMedia || mediaFetchFailed) && mediaUrls.length === 0;
  const previewCount = 1 + mediaUrls.length + (showExtraMediaSlide ? 1 : 0);
  const currentMediaUrl = previewIndex > 0 && previewIndex <= mediaUrls.length ? mediaUrls[previewIndex - 1] : null;
  const currentMediaIsGif = currentMediaUrl?.toLowerCase().endsWith(".gif") ?? false;

  // A media src that fails to load (e.g. a transient permission-propagation
  // hiccup right after upload) used to just sit there as a permanently
  // broken image with nothing retrying it. A few silent, cache-busted
  // retries covers that without needing any special "failed" UI.
  const [mediaLoadRetry, setMediaLoadRetry] = useState(0);
  useEffect(() => setMediaLoadRetry(0), [currentMediaUrl]);
  const handleMediaError = () => {
    if (mediaLoadRetry >= 3) return;
    window.setTimeout(() => setMediaLoadRetry((n) => n + 1), 1500 * (mediaLoadRetry + 1));
  };
  const currentMediaSrc = currentMediaUrl && mediaLoadRetry > 0
    ? `${currentMediaUrl}${currentMediaUrl.includes("?") ? "&" : "?"}r=${mediaLoadRetry}`
    : currentMediaUrl;

  return (
    <ScreenLayoutBoundary screenKey="result">
    <div className="kinetic-page relative h-full overflow-y-auto px-5 py-8 sm:px-10">
      <header className="mx-auto max-w-6xl">
        <Positionable id="heading" type="text" label="Judul">
          <div>
            <span className="eyebrow">06 / YOUR MOMENT</span>
            <h2 className="mt-2 font-display text-4xl font-bold sm:text-6xl">Hasil fotomu sudah siap.</h2>
            <p className="mt-2 text-white/50">Foto final, media, dan QR download ada di sini.</p>
          </div>
        </Positionable>
      </header>

      {/* The photo column used to be `minmax(0,1fr)` — on a wide kiosk
          screen that stretched this whole column to fill most of the page,
          but the actual strip/template canvas inside it is always a narrow
          portrait shape, so it just centered in a sea of empty card
          background. Capping the photo column to a sane portrait-card width
          and giving the REST of the width to the sidebar (1fr) means the QR/
          biodata/cetak-lagi panel actually grows to use that freed space
          instead of leaving it empty. */}
      <main className="mx-auto mt-8 grid min-h-0 max-w-6xl gap-6 lg:grid-cols-[minmax(280px,440px)_1fr] lg:items-start">
        {/* Strip + every clip live in one carousel card now (dots/arrows),
            instead of one card per clip stacked below each other — that used
            to push this whole column's height well past the sidebar's, and
            was the main reason the page needed scrolling. */}
        <section className="glass-panel flex flex-col rounded-[2rem] p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent"><IconPreview className="h-[18px] w-[18px]" /></span>
              <h3 className="font-display text-lg font-semibold">Preview Foto</h3>
            </div>
            <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/60">{photoUrls.length} Foto</span>
          </div>

          <div className="relative flex min-h-[clamp(240px,42vh,420px)] items-center justify-center">
            {previewCount > 1 && (
              <button
                type="button"
                onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))}
                disabled={previewIndex === 0}
                className="absolute left-0 z-20 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-white/15 bg-black/50 text-xl text-white shadow-lg backdrop-blur-sm transition hover:border-accent/60 hover:bg-black/70 disabled:opacity-20"
                aria-label="Sebelumnya"
              >
                ‹
              </button>
            )}

            {/* Canvas sized off vh (viewport height), not a percentage of its
                flex parent — a percentage height here would be circular (the
                parent's own height comes FROM its content, i.e. this canvas),
                which is exactly what silently collapsed it to 0px when this
                was briefly tried as `max-h-full` inside an `h-full` wrapper. */}
            <div className="relative flex items-center justify-center" style={{ display: previewIndex === 0 ? "flex" : "none" }}>
              <motion.canvas
                ref={canvasRef}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: stripRendering ? 0 : 1, scale: stripRendering ? 0.97 : 1 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="max-h-[clamp(240px,42vh,420px)] max-w-full rounded-2xl border border-white/10 shadow-2xl"
              />
              {stripRendering && (
                <div className="absolute flex flex-col items-center gap-3">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-accent" />
                  <p className="text-center text-sm font-semibold text-white/70">Menyiapkan hasil foto...</p>
                  <p className="text-xs text-white/40">Sedang merender strip</p>
                </div>
              )}
            </div>
            {currentMediaUrl && (
              currentMediaIsGif
                ? <img src={currentMediaSrc ?? undefined} onError={handleMediaError} alt="Klip sesi" className="max-h-[clamp(240px,42vh,420px)] max-w-full rounded-2xl border border-white/10 shadow-2xl" />
                : <video src={currentMediaSrc ?? undefined} onError={handleMediaError} controls loop playsInline className="max-h-[clamp(240px,42vh,420px)] max-w-full rounded-2xl border border-white/10 shadow-2xl" />
            )}
            {showExtraMediaSlide && previewIndex === previewCount - 1 && (
              awaitingMedia ? (
                <div className="flex flex-col items-center gap-3">
                  <Spinner size="md" />
                  <p className="text-center text-sm font-semibold text-white/70">Menyiapkan GIF/video sesi...</p>
                  <p className="text-xs text-white/40">Muncul otomatis begitu selesai</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 px-6 text-center">
                  <p className="text-sm font-semibold text-white/70">GIF/video sesi gagal dibuat</p>
                  <p className="text-xs text-white/40">Foto & strip tetap tersimpan dengan baik.</p>
                </div>
              )
            )}

            {previewCount > 1 && (
              <button
                type="button"
                onClick={() => setPreviewIndex((i) => Math.min(previewCount - 1, i + 1))}
                disabled={previewIndex === previewCount - 1}
                className="absolute right-0 z-20 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-white/15 bg-black/50 text-xl text-white shadow-lg backdrop-blur-sm transition hover:border-accent/60 hover:bg-black/70 disabled:opacity-20"
                aria-label="Selanjutnya"
              >
                ›
              </button>
            )}
          </div>

          {previewCount > 1 && (
            <div className="mt-4 flex shrink-0 items-center justify-center gap-2">
              {Array.from({ length: previewCount }).map((_, index) => (
                <button
                  key={index}
                  onClick={() => setPreviewIndex(index)}
                  className={`h-1.5 rounded-full transition-all ${previewIndex === index ? "w-6 bg-accent" : "w-1.5 bg-white/25 hover:bg-white/40"}`}
                  aria-label={index === 0 ? "Strip hasil" : `Klip ${index}`}
                />
              ))}
            </div>
          )}

          {currentMediaUrl && (
            <a
              href={currentMediaUrl}
              download={`${slug}-clip-${previewIndex}.${currentMediaIsGif ? "gif" : "webm"}`}
              className="mt-3 text-center text-sm text-accent hover:underline"
            >
              Download {currentMediaIsGif ? "GIF" : "video"} ini
            </a>
          )}
        </section>
        {/* No inner max-height/overflow here on purpose — a nested scroll
            region inside the aside used to hide the "cetak lagi" card below
            the fold with no visible scrollbar cue, so on a kiosk touchscreen
            it looked like the option didn't exist. Letting it flow lets the
            page's own scroll (already enabled on the outer wrapper) reach it
            the same obvious way as everything else on this screen.
            "Kirim hasil" and "Cetak lagi" sit side by side once there's
            width for it (this column is now 1fr, see the grid comment
            above) instead of stacking into one long, mostly-empty column —
            that stacking was the other half of the "not solid" complaint:
            three short cards each full-width, tons of dead space beside
            every one of them. */}
        <aside className="grid min-w-0 gap-4 sm:grid-cols-2">
          {/* Scan & Download card */}
          <div className="glass-panel rounded-[2rem] p-5 sm:col-span-2">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent"><IconScan className="h-[18px] w-[18px]" /></span>
              <div className="min-w-0">
                <h3 className="font-display text-lg font-semibold">Scan & Download</h3>
                <p className="truncate text-xs text-white/50">Scan QR code untuk mengunduh foto kamu.</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
              <div className="relative mx-auto shrink-0">
                {stripRendering && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-16 w-16 animate-ping rounded-full border-2 border-accent/30" />
                    <div className="absolute h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-accent" />
                  </div>
                )}
                <div className={`rounded-2xl bg-white p-3 shadow-xl transition-opacity duration-500 ${stripRendering ? "opacity-0" : "opacity-100"}`}>
                  <canvas ref={qrCanvasRef} className="block rounded-lg" />
                </div>
              </div>

              <div className="space-y-1.5">
                <ActionRow icon={<IconDownload className={iconBase} />} label="Download semua foto" sub="Termasuk semua frame & versi edit" onClick={downloadAll} loading={downloadingAll} disabled={!stripDataUrl} />
                <ActionRow icon={<IconGallery className={iconBase} />} label="Simpan ke galeri" sub="Hasil foto akan tersimpan di perangkatmu" onClick={download} disabled={!stripDataUrl} />
                <ActionRow icon={shareCopied ? <IconCheck className={iconBase} /> : <IconShare className={iconBase} />} label={shareCopied ? "Link disalin!" : "Bagikan ke media sosial"} sub="Langsung dari halaman ini" onClick={shareResult} disabled={!shareUrl} />
              </div>
            </div>

            {driveShareUrl && (
              <div className="mt-4 flex items-center justify-center gap-1.5 text-xs font-semibold text-blue-300">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>
                Tersimpan di Google Drive
              </div>
            )}
            {shareUrl && (
              <a
                href={driveShareUrl ?? shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-accent/15 py-3 text-sm font-semibold text-accent transition hover:bg-accent/25"
              >
                <IconScan className="h-4 w-4" /> Scan QR Code dengan HP kamu
              </a>
            )}
          </div>

          {/* Informasi Pelanggan */}
          <div className="glass-panel rounded-[2rem] p-5">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent"><IconUser className="h-[18px] w-[18px]" /></span>
              <h3 className="font-display text-lg font-semibold">Informasi Pelanggan</h3>
            </div>
            <div className="space-y-2">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35"><IconPhone className={iconBase} /></span>
                <input value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} onFocus={() => setKeyboardField("whatsapp")} type="tel" inputMode="tel" placeholder="Nomor WhatsApp" className="w-full rounded-xl border border-white/10 bg-white/[0.06] py-2.5 pl-10 pr-3 outline-none focus:border-accent" />
              </div>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35"><IconMail className={iconBase} /></span>
                <input value={email} onChange={(event) => setEmail(event.target.value)} onFocus={() => setKeyboardField("email")} type="email" placeholder="Email (opsional)" className="w-full rounded-xl border border-white/10 bg-white/[0.06] py-2.5 pl-10 pr-3 outline-none focus:border-accent" />
              </div>
              <label className="flex gap-2 text-xs text-white/55"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> Izinkan hasil digunakan untuk galeri {config.brandName}</label>
              <button onClick={saveCustomer} disabled={savingCustomer} className="w-full rounded-xl border border-white/15 px-4 py-2.5 text-sm hover:border-accent disabled:opacity-50">{savingCustomer ? "Menyimpan..." : "Simpan biodata"}</button>
              {customerSaved && (
                <p role="status" className="flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200">
                  <IconCheck className="h-4 w-4 shrink-0" /> Terima kasih sudah menggunakan {config.brandName}!
                </p>
              )}
            </div>
          </div>

          {additionalPrintConfig?.enabled && (
            <div className="glass-panel rounded-[2rem] p-5">
              <div className="mb-3 flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent"><IconPrinter className="h-[18px] w-[18px]" /></span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-display text-lg font-semibold">Detail Cetak</h3>
                </div>
                {stripDataUrl && <img src={stripDataUrl} alt="" className="h-11 w-9 shrink-0 rounded-md border border-white/10 object-cover" />}
              </div>
              <p className="font-semibold">{additionalPrintConfig.label}</p>
              <p className="mt-1 text-xs text-white/50">Bayar QRIS atau pakai kode voucher, lalu {additionalQuantity} lembar akan langsung dicetak.</p>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] p-1">
                  <button type="button" onClick={() => setAdditionalQuantity((q) => Math.max(1, q - 1))} disabled={additionalPayment !== "idle"} className="flex h-7 w-7 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-40"><IconMinus className="h-3.5 w-3.5" /></button>
                  <span className="w-6 text-center text-sm font-semibold">{additionalQuantity}</span>
                  <button type="button" onClick={() => setAdditionalQuantity((q) => Math.min(additionalPrintConfig.max, q + 1))} disabled={additionalPayment !== "idle"} className="flex h-7 w-7 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-40"><IconPlus className="h-3.5 w-3.5" /></button>
                </div>
                <span className="ml-auto text-sm font-semibold text-accent">Rp {(additionalQuantity * additionalPrintConfig.price).toLocaleString("id-ID")}</span>
              </div>

              {additionalMode === "choose" && (
                <div className="mt-4 flex gap-2">
                  <button type="button" onClick={buyAdditionalPrint} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold">
                    <IconPrinter className="h-4 w-4" /> Bayar QRIS
                  </button>
                  <button type="button" onClick={() => setAdditionalMode("voucher")} className="flex-1 rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold text-white/80 hover:border-accent hover:text-white">
                    Pakai kode voucher
                  </button>
                </div>
              )}

              {additionalMode === "voucher" && additionalPayment === "idle" && (
                <div className="mt-4">
                  <div className="flex gap-2">
                    <input
                      value={additionalVoucherCode}
                      onChange={(e) => setAdditionalVoucherCode(e.target.value.toUpperCase())}
                      onKeyDown={(e) => { if (e.key === "Enter") redeemAdditionalPrintVoucher(); }}
                      placeholder="KODE VOUCHER"
                      className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-sm font-semibold tracking-[0.12em] outline-none focus:border-accent"
                    />
                    <button type="button" onClick={redeemAdditionalPrintVoucher} disabled={!additionalVoucherCode.trim()} className="rounded-xl bg-accent px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">Terapkan</button>
                  </div>
                  <button type="button" onClick={() => setAdditionalMode("choose")} className="mt-2 text-xs text-white/40 hover:text-white/70">← Pakai QRIS saja</button>
                </div>
              )}

              {(additionalPayment === "starting" || additionalPayment === "waiting" || additionalPayment === "printing") && (
                <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-accent/80 px-4 py-3 text-sm font-semibold">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  {additionalPayment === "starting" ? "Memproses..." : additionalPayment === "waiting" ? "Menunggu pembayaran..." : "Mencetak..."}
                </div>
              )}
              {additionalPayment === "waiting" && additionalQr && <div className="mt-4 flex justify-center rounded-xl bg-white p-3"><canvas ref={additionalQrCanvasRef} /></div>}
              {additionalPayment === "done" && <p className="mt-3 text-xs text-emerald-300">Pembayaran berhasil. Print tambahan dikirim ke printer.</p>}
              {additionalPayment === "error" && (
                <div className="mt-3">
                  <p className="text-xs text-red-300">{additionalError}</p>
                  <button type="button" onClick={() => { setAdditionalPayment("idle"); setAdditionalMode("choose"); setAdditionalVoucherCode(""); }} className="mt-2 text-xs font-semibold text-white/60 hover:text-white">Coba lagi</button>
                </div>
              )}
            </div>
          )}
        </aside>
      </main>

      {slotClipUrls.some(Boolean) && (
        <div className="mx-auto mt-6 max-w-6xl">
          <p className="eyebrow mb-3">KLIP TIAP FOTO</p>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {slotClipUrls.map((clipUrl, index) => {
              if (!clipUrl) return null;
              const isGif = clipUrl.toLowerCase().endsWith(".gif");
              return (
                <div key={clipUrl} className="glass-panel flex w-40 shrink-0 flex-col items-center gap-2 rounded-2xl p-3">
                  {isGif
                    ? <img src={clipUrl} alt={`Klip foto ${index + 1}`} className="h-32 w-full rounded-xl border border-white/10 object-cover" />
                    : <video src={clipUrl} muted loop autoPlay playsInline className="h-32 w-full rounded-xl border border-white/10 object-cover" />}
                  <a href={clipUrl} download={`${config.brandName.toLowerCase().replace(/\s+/g, "-")}-foto-${index + 1}.${isGif ? "gif" : "webm"}`} className="text-xs text-accent hover:underline">
                    ↓ Foto {index + 1}
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mx-auto mt-6 flex max-w-6xl flex-wrap items-center justify-center gap-3">
        {/* Hidden when auto-print is on — the strip already prints itself the
            moment it's ready (see the autoPrintEnabled effect above). Leaving
            this button up on top of that just invites a customer to mash it
            "to be sure", which is exactly what printed the same strip 3x for
            one session — auto-print already covers the case this button was
            for, so there's nothing left for it to safely do here. */}
        {!config.autoPrintEnabled && (
          <button onClick={() => printNow()} disabled={printing} className="flex items-center gap-2 rounded-xl bg-accent px-7 py-3 font-semibold shadow-lg shadow-accent/20 disabled:opacity-60">
            {printing ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <IconPrinter className="h-4 w-4" />}
            {printing ? "Sedang mencetak..." : "Print Sekarang"}
          </button>
        )}
        <button onClick={download} className="flex items-center gap-2 rounded-xl border border-white/20 px-7 py-3 hover:border-accent">
          <IconDownload className="h-4 w-4" /> Download
        </button>
        {/* Satu tombol "selesai" saja — sebelumnya ada "Selesai" + "Mulai sesi
            baru" yang keduanya cuma memanggil finish(), jadi customer/staff
            berikutnya harus mikir dua tombol identik padahal cuma perlu satu
            supaya bisa langsung mulai tanpa menunggu auto-reset. */}
        <button onClick={finish} className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-7 py-3 font-semibold shadow-lg shadow-accent/20 sm:w-auto">
          <IconRefresh className="h-4 w-4" /> Mulai Sesi Baru
        </button>
        <span className="w-full text-center text-xs text-white/40">Kembali ke awal otomatis dalam {autoResetSeconds} detik</span>
        {printStatus === "ok" && <span className="text-xs text-emerald-300">● Terkirim ke printer (4R)</span>}
        {printStatus === "error" && <span className="text-xs text-red-300">● Print gagal: {printError}</span>}
        {uploadStatus === "pending" && <span className="text-xs text-white/40">● Menyimpan hasil ke server...</span>}
        {uploadStatus === "error" && <span className="text-xs text-red-300">● Gagal menyimpan hasil — coba scan QR lagi nanti atau hubungi admin.</span>}
      </div>

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
    </ScreenLayoutBoundary>
  );
}
