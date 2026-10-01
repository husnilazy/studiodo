import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import QRCode from "qrcode";
import VirtualKeyboard from "@/components/VirtualKeyboard";
import QrCodeScanner from "@/components/QrCodeScanner";
import { api } from "@/lib/api";
import { useKioskSession } from "@/lib/sessionStore";
import { useBoothConfig } from "@/lib/boothConfigStore";
import { getNextRoute, getPreviousRoute } from "@/lib/kioskFlow";
import { addPendingSession, createOfflineSessionId, isBrowserOnline } from "@/lib/offlineStore";
import { ScreenLayoutBoundary } from "@/lib/screenBuilder/ScreenLayoutBoundary";
import { usePositionableContext } from "@/lib/screenBuilder/PositionableContext";
import Positionable from "@/components/Positionable";
import { BackButton, KioskPage, ScreenTitle, Spinner } from "@/components/kiosk/KioskUI";
import { Icon } from "@/components/kiosk/Icons";

type Mode = "choose" | "voucher" | "qris";

// The 5-minute ring is only a UI cue — Xendit's own QR string isn't given any
// explicit expiry by our server, so it typically stays scannable well past
// this. A first-time customer opening their banking app and confirming a
// payment can easily take longer than 5 minutes, so polling must keep
// checking the database well after the ring hits zero instead of abandoning
// a payment that's still in flight.
const QRIS_DISPLAY_SECONDS = 300;
const QRIS_POLL_GRACE_SECONDS = 600;
const POLL_FAILURE_TOLERANCE = 5;

export default function Pembayaran() {
  const [, navigate] = useLocation();
  const { selectedPackage, selectedExtras, orientation, sessionId, setSessionId, resetSession } = useKioskSession();
  const boothConfig = useBoothConfig((state) => state.config);
  const offlineModeEnabled = boothConfig.offlineModeEnabled;
  const eventFreeEntryActive = boothConfig.eventEnabled && boothConfig.eventFreeEntry && (() => {
    const now = Date.now();
    if (boothConfig.eventStartAt) {
      const start = new Date(boothConfig.eventStartAt).getTime();
      if (!Number.isNaN(start) && now < start) return false;
    }
    if (boothConfig.eventEndAt) {
      const end = new Date(boothConfig.eventEndAt).getTime();
      if (!Number.isNaN(end) && now > end) return false;
    }
    return true;
  })();
  const [mode, setMode] = useState<Mode>("choose");
  const [sessionRetry, setSessionRetry] = useState(0); // bump to try creating the server session again
  const [voucherCode, setVoucherCode] = useState("");
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const qrScanSupported = typeof window !== "undefined" && "BarcodeDetector" in window;
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [starting, setStarting] = useState(false);
  const [redeemingVoucher, setRedeemingVoucher] = useState(false);
  const [qrisString, setQrisString] = useState<string | null>(null);
  const [cashPaymentEnabled, setCashPaymentEnabled] = useState(false);
  const [cashRedeemed, setCashRedeemed] = useState(false);
  const [qrisExpirySeconds, setQrisExpirySeconds] = useState(QRIS_DISPLAY_SECONDS);
  const qrisCanvasRef = useRef<HTMLCanvasElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qrisTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Hard stop for the background grace-period poll (see QRIS_POLL_GRACE_SECONDS
  // above) — separate from qrisTimerRef, which only drives the visual ring.
  const pollGraceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollFailureCountRef = useRef(0);
  // No-payment-for-too-long -> back to idle. Distinct from the QR's own 5-minute
  // display countdown: this is the grace period AFTER it expires, just long
  // enough to read "kedaluwarsa" before the booth resets itself for the next
  // customer, so an abandoned/unpaid session never just sits there forever.
  const idleReturnRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mounted inside the WYSIWYG editor with no real session — selectedPackage is
  // always null there, and without this check the guard below would both bounce
  // the admin out AND (were selectedPackage ever truthy) create a real session
  // via the API just from opening the editor.
  const positionable = usePositionableContext();

  useEffect(() => {
    api.getPaymentConfig().then((result) => setCashPaymentEnabled(result?.cashPaymentEnabled ?? false)).catch(() => setCashPaymentEnabled(false));
  }, []);

  useEffect(() => {
    if (!selectedPackage) {
      if (!positionable?.editMode) navigate("/paket");
      return;
    }
    if (!sessionId) {
      api
        .createSession({ packageId: selectedPackage.id === "event-session" ? undefined : selectedPackage.id, orientation, selectedExtras })
        .then((s) => {
          setSessionId(s.id);
          if (eventFreeEntryActive) {
            api.markEventFree(s.id, boothConfig.eventName).catch(() => undefined);
          }
        })
        .catch((err) => {
          if (offlineModeEnabled && !isBrowserOnline()) {
            const offlineId = createOfflineSessionId();
            void addPendingSession({
              offlineId,
              packageId: selectedPackage.id === "event-session" ? undefined : selectedPackage.id,
              orientation,
              selectedExtras,
            });
            setSessionId(offlineId);
          } else setError(err instanceof Error ? err.message : "Gagal membuat sesi. Coba lagi.");
        });
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (qrisTimerRef.current) clearInterval(qrisTimerRef.current);
      if (idleReturnRef.current) clearTimeout(idleReturnRef.current);
      if (pollGraceTimeoutRef.current) clearTimeout(pollGraceTimeoutRef.current);
    };
  }, [selectedPackage, selectedExtras, orientation, sessionId, eventFreeEntryActive, boothConfig.eventName, offlineModeEnabled, sessionRetry]);

  const totalAmount = Number(selectedPackage?.price ?? 0) + selectedExtras.reduce((sum, extra) => sum + Number(extra.price), 0);
  const [payableAmount, setPayableAmount] = useState(eventFreeEntryActive ? 0 : totalAmount);

  useEffect(() => {
    setPayableAmount(eventFreeEntryActive ? 0 : totalAmount);
  }, [eventFreeEntryActive, totalAmount]);

  useEffect(() => {
    if (mode !== "qris" || !qrisString || !qrisCanvasRef.current) return;
    // 220px used to be plenty, back when this box was a plain 256px (16rem)
    // square — but the kiosk's root font-size scales with viewport (see
    // index.css), so 16rem can be well over 400px on a big screen while this
    // bitmap stayed fixed, leaving a small QR floating in a mostly-empty
    // white box. A bigger fixed bitmap plus the canvas actually filling its
    // container (see the className below) fixes that at any scale.
    QRCode.toCanvas(qrisCanvasRef.current, qrisString, {
      width: 400,
      margin: 2,
      color: { dark: "#111111", light: "#ffffff" },
    }).catch(() => setError("QRIS gagal ditampilkan. Silakan buat QRIS baru."));
  }, [mode, qrisString]);

  const startQris = async () => {
    if (eventFreeEntryActive) {
      if (sessionId) {
        await api.markEventFree(sessionId, boothConfig.eventName).catch(() => undefined);
      }
      navigate(getNextRoute("payment", boothConfig.kioskFlow));
      return;
    }
    if (!sessionId || !selectedPackage || starting) return;
    if (pollRef.current) clearInterval(pollRef.current);
    if (qrisTimerRef.current) clearInterval(qrisTimerRef.current);
    if (idleReturnRef.current) clearTimeout(idleReturnRef.current);
    if (pollGraceTimeoutRef.current) clearTimeout(pollGraceTimeoutRef.current);
    pollFailureCountRef.current = 0;
    setError(null);
    setQrisString(null);
    setQrisExpirySeconds(QRIS_DISPLAY_SECONDS);
    setMode("qris");
    setChecking(true);
    setStarting(true);

    // Shared by every "we've stopped waiting" branch below (expired, failed,
    // or the status check itself broke) — after a grace period to actually
    // read the message, abandon this unpaid session and return to idle for
    // the next customer instead of leaving the booth stuck showing an error.
    const scheduleIdleReturn = () => {
      if (idleReturnRef.current) clearTimeout(idleReturnRef.current);
      idleReturnRef.current = setTimeout(() => {
        resetSession();
        navigate("/");
      }, 15_000);
    };

    try {
      const result = await api.startQris(sessionId);
      if (!result) throw new Error("Gagal memulai QRIS");
      setQrisString(result.qrString);

      // Visual ring only — reaching 0 just tells the customer the QR looks
      // stale and offers a fresh one. It must NOT stop the background poll:
      // the old QR string is usually still honored by Xendit, and a real
      // payment (open banking app, confirm) can easily run past 5 minutes.
      qrisTimerRef.current = setInterval(() => {
        setQrisExpirySeconds((prev) => {
          if (prev <= 1) {
            if (qrisTimerRef.current) clearInterval(qrisTimerRef.current);
            setError("QRIS sudah kedaluwarsa secara tampilan. Kami masih memeriksa jika kamu baru saja membayar — atau tekan \"Buat QRIS baru\".");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Hard stop for the poll itself — well beyond the visual ring, so a
      // slow real-world payment still gets picked up before we give up.
      pollGraceTimeoutRef.current = setTimeout(() => {
        if (pollRef.current) clearInterval(pollRef.current);
        setChecking(false);
        setError("Belum ada konfirmasi pembayaran. Silakan buat QRIS baru.");
        scheduleIdleReturn();
      }, (QRIS_DISPLAY_SECONDS + QRIS_POLL_GRACE_SECONDS) * 1000);

      pollRef.current = setInterval(async () => {
        try {
          const status = (await api.getPaymentStatus(sessionId))?.status;
          pollFailureCountRef.current = 0;
          if (status === "success") {
            if (pollRef.current) clearInterval(pollRef.current);
            if (qrisTimerRef.current) clearInterval(qrisTimerRef.current);
            if (idleReturnRef.current) clearTimeout(idleReturnRef.current);
            if (pollGraceTimeoutRef.current) clearTimeout(pollGraceTimeoutRef.current);
            setChecking(false);
            navigate(getNextRoute("payment", boothConfig.kioskFlow));
          } else if (status === "failed" || status === "expired") {
            if (pollRef.current) clearInterval(pollRef.current);
            if (qrisTimerRef.current) clearInterval(qrisTimerRef.current);
            if (pollGraceTimeoutRef.current) clearTimeout(pollGraceTimeoutRef.current);
            setChecking(false);
            setError("Pembayaran QRIS gagal atau sudah kedaluwarsa. Silakan coba lagi.");
            scheduleIdleReturn();
          }
        } catch {
          // A single failed status check is likely a transient network blip,
          // not a reason to abandon a payment that may already have gone
          // through — only give up after several in a row.
          pollFailureCountRef.current += 1;
          if (pollFailureCountRef.current >= POLL_FAILURE_TOLERANCE) {
            if (pollRef.current) clearInterval(pollRef.current);
            if (qrisTimerRef.current) clearInterval(qrisTimerRef.current);
            if (pollGraceTimeoutRef.current) clearTimeout(pollGraceTimeoutRef.current);
            setChecking(false);
            setError("Gagal memeriksa status pembayaran.");
            scheduleIdleReturn();
          }
        }
      }, 1500);
    } catch (err) {
      setQrisString(null);
      setError(err instanceof Error ? err.message : "Gagal memulai pembayaran QRIS.");
      setChecking(false);
    } finally {
      setStarting(false);
    }
  };

  // A package priced at Rp 0 needs no payment step at all — offering "Bayar dengan QRIS" for Rp 0 only confuses people.
  const isFreePackage = totalAmount === 0 && !eventFreeEntryActive;
  const startFree = async () => {
    if (sessionId) await api.markEventFree(sessionId, selectedPackage?.name ? `Gratis · ${selectedPackage.name}` : "Gratis").catch(() => undefined);
    navigate(getNextRoute("payment", boothConfig.kioskFlow));
  };

  const closeQris = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (qrisTimerRef.current) clearInterval(qrisTimerRef.current);
    if (pollGraceTimeoutRef.current) clearTimeout(pollGraceTimeoutRef.current);
    if (idleReturnRef.current) clearTimeout(idleReturnRef.current);
    setChecking(false);
    setMode("choose");
  };

  const continueOffline = () => {
    if (!offlineModeEnabled || isBrowserOnline() || !selectedPackage) return;
    if (!sessionId) {
      const offlineId = createOfflineSessionId();
      void addPendingSession({
        offlineId,
        packageId: selectedPackage.id === "event-session" ? undefined : selectedPackage.id,
        orientation,
        selectedExtras,
      });
      setSessionId(offlineId);
    }
    navigate(getNextRoute("payment", boothConfig.kioskFlow));
  };

  const redeemVoucher = async (codeOverride?: string) => {
    if (eventFreeEntryActive) {
      if (sessionId) {
        await api.markEventFree(sessionId, boothConfig.eventName).catch(() => undefined);
      }
      navigate(getNextRoute("payment", boothConfig.kioskFlow));
      return;
    }
    const code = (codeOverride ?? voucherCode).trim();
    if (!sessionId || !code || redeemingVoucher) return;
    setError(null);
    setShowKeyboard(false);
    setRedeemingVoucher(true);
    try {
      const result = await api.redeemVoucher(sessionId, code);
      if (!result) throw new Error("Voucher tidak valid");
      const isCash = Boolean(result.cash);
      setPayableAmount(result.amount);
      setCashRedeemed(isCash);
      // A cash voucher marks the session as already paid server-side (admin
      // collected cash on the spot) — its "amount" is the full session total,
      // not a remaining balance, so it must never fall through to QRIS.
      if (result.amount === 0 || isCash) {
        navigate(getNextRoute("payment", boothConfig.kioskFlow));
      } else {
          await startQris();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Voucher tidak dapat digunakan.");
    } finally {
      setRedeemingVoucher(false);
    }
  };

  const onQrScanned = (text: string) => {
    const normalized = text.trim().toUpperCase();
    setShowScanner(false);
    setVoucherCode(normalized);
    redeemVoucher(normalized);
  };

  const rupiah = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
  // The server session is created in the background when this screen opens. Tapping a payment option before it exists used
  // to do nothing at all (or, for free packages, silently skip marking the session as paid). Wait for it instead.
  const sessionReady = Boolean(sessionId);
  const methodCard = "glass-panel kinetic-card-hover group disabled:pointer-events-none disabled:opacity-50 flex w-[clamp(14rem,24vw,18rem)] flex-col items-center gap-4 rounded-[2rem] p-8 text-center hover:border-accent/60";
  const methodIcon = "flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/12 text-accent transition group-hover:scale-110";

  return (
    <ScreenLayoutBoundary screenKey="payment">
      <KioskPage step="payment">
        <ScreenTitle
          title={boothConfig.paymentHeadline || "Pembayaran"}
          subtitle={mode === "voucher" ? "Masukkan kode voucher atau invoice cash dari petugas." : isFreePackage || eventFreeEntryActive ? "Tidak ada yang perlu dibayar. Langsung berfoto!" : "Pilih cara bayar yang paling nyaman buatmu."}
        />

        {/* Order summary — customers kept asking "what am I paying for?" */}
        <Positionable id="total-price" type="text" label="Total Harga">
          <div className="glass-panel flex min-w-[18rem] flex-col items-center gap-1 rounded-3xl px-10 py-5 text-center">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">{selectedPackage?.name ?? "Paket"}{selectedExtras.length > 0 ? ` + ${selectedExtras.map((e) => e.name).join(", ")}` : ""}</span>
            <span className="font-display text-4xl font-semibold tracking-tight text-accent md:text-5xl">{payableAmount === 0 ? "Gratis" : rupiah(payableAmount)}</span>
            {payableAmount !== totalAmount && totalAmount > 0 && <span className="text-xs text-muted line-through">{rupiah(totalAmount)}</span>}
          </div>
        </Positionable>

        {eventFreeEntryActive && (
          <div className="max-w-xl rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-6 py-4 text-center text-emerald-700">
            <p className="text-xs font-bold uppercase tracking-[0.2em]">{boothConfig.eventName || "Event"}</p>
            <p className="mt-1 text-lg font-semibold">Kiosk sedang aktif untuk event ini, jadi masuk gratis.</p>
            <p className="mt-1 text-sm opacity-80">{boothConfig.eventDescription || "Semua paket tersedia tanpa pembayaran."}</p>
          </div>
        )}

        {mode === "choose" && (isFreePackage || eventFreeEntryActive) && (
          <button type="button" onClick={isFreePackage ? startFree : startQris} disabled={!sessionReady} className="k-btn k-btn-accent k-btn-lg">
            {sessionReady ? <Icon name="camera" className="h-6 w-6" /> : <Spinner className="h-5 w-5 !border-white/40 !border-t-white" />}
            {sessionReady ? "Mulai berfoto" : "Menyiapkan sesi…"}
          </button>
        )}

        {mode === "choose" && !sessionReady && !error && !(offlineModeEnabled && !isBrowserOnline()) && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" />Menyiapkan sesi…</p>
        )}

        {mode === "choose" && !isFreePackage && !eventFreeEntryActive && (
          <Positionable id="choose-buttons" type="system-button" label="Pilihan Metode Bayar">
            <div className="flex flex-wrap justify-center gap-5">
              <button type="button" onClick={startQris} disabled={!sessionReady} className={methodCard}>
                <span className={methodIcon}><Icon name="qr" className="h-8 w-8" /></span>
                <span className="font-display text-2xl font-semibold">Bayar dengan QRIS</span>
                <span className="text-sm text-muted">Scan pakai GoPay, OVO, DANA, m-banking, atau e-wallet lain.</span>
              </button>
              <button type="button" onClick={() => setMode("voucher")} disabled={!sessionReady} className={methodCard}>
                <span className={methodIcon}><Icon name="ticket" className="h-8 w-8" /></span>
                <span className="font-display text-2xl font-semibold">Pakai voucher</span>
                <span className="text-sm text-muted">Punya kode promo atau tiket dari petugas? Masukkan di sini.</span>
              </button>
              {cashPaymentEnabled && (
                <button type="button" onClick={() => { setCashRedeemed(false); setMode("voucher"); }} disabled={!sessionReady} className={methodCard}>
                  <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-600 transition group-hover:scale-110"><Icon name="cash" className="h-8 w-8" /></span>
                  <span className="font-display text-2xl font-semibold">Bayar tunai</span>
                  <span className="text-sm text-muted">Bayar ke petugas, lalu masukkan kode invoice yang diberikan.</span>
                </button>
              )}
              {offlineModeEnabled && !isBrowserOnline() && (
                <button type="button" onClick={continueOffline} className={methodCard}>
                  <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/12 text-amber-600"><Icon name="warning" className="h-8 w-8" /></span>
                  <span className="font-display text-2xl font-semibold">Lanjut offline</span>
                  <span className="text-sm text-muted">Bayar manual di kasir.</span>
                </button>
              )}
            </div>
          </Positionable>
        )}

        {mode === "voucher" && (
          <div className="glass-panel w-full max-w-2xl rounded-[2rem] p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/12 text-accent"><Icon name="ticket" className="h-6 w-6" /></span>
              <div>
                <h2 className="font-display text-2xl font-semibold">Punya voucher?</h2>
                <p className="mt-1 text-sm text-muted">Ketik kodenya (huruf besar/kecil sama saja) atau scan QR pada tiket.</p>
              </div>
            </div>
            <div className="mt-6 flex items-center gap-2">
              <input
                autoFocus
                value={voucherCode}
                onChange={(event) => { setError(null); setVoucherCode(event.target.value.toUpperCase()); }}
                onFocus={() => setShowKeyboard(true)}
                onKeyDown={(event) => { if (event.key === "Enter") redeemVoucher(); }}
                placeholder="Contoh: CASH-AB12CD34"
                aria-label="Kode voucher"
                disabled={redeemingVoucher}
                className="k-input min-w-0 flex-1 !py-4 text-lg font-semibold tracking-[0.14em] disabled:opacity-60"
              />
              {voucherCode && !redeemingVoucher && (
                <button type="button" onClick={() => setVoucherCode("")} className="k-btn !min-h-[3.25rem] !px-4" aria-label="Hapus kode voucher"><Icon name="x" className="h-5 w-5" /></button>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" onClick={() => redeemVoucher()} disabled={!voucherCode.trim() || redeemingVoucher} className="k-btn k-btn-accent flex-1">
                {redeemingVoucher && <Spinner className="h-4 w-4 !border-white/40 !border-t-white" />}
                {redeemingVoucher ? "Memeriksa voucher…" : "Terapkan voucher"}
              </button>
              {qrScanSupported && (
                <button type="button" onClick={() => setShowScanner(true)} disabled={redeemingVoucher} className="k-btn">
                  <Icon name="scan" className="h-5 w-5" />
                  Scan QR tiket
                </button>
              )}
            </div>
            {cashRedeemed && <p className="mt-4 text-center text-sm font-semibold text-emerald-600">Invoice cash diterima. Sesi siap dimulai.</p>}
          </div>
        )}

        <AnimatePresence>
          {showKeyboard && mode === "voucher" && (
            // pointer-events-none on this full-screen wrapper (with -auto only on the keyboard itself): a tap anywhere
            // that isn't the keyboard must reach whatever is really there, not just dismiss the overlay first.
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none fixed inset-0 z-40 flex items-end justify-center bg-fg/15 p-3 pb-4 backdrop-blur-[2px] sm:p-5 sm:pb-6">
              <motion.div initial={{ opacity: 0, y: 32, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24, scale: 0.97 }} transition={{ duration: 0.24, ease: "easeOut" }} className="pointer-events-auto w-full max-w-5xl">
                <VirtualKeyboard value={voucherCode} onChange={(value) => setVoucherCode(value.toUpperCase())} onClose={() => setShowKeyboard(false)} />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {mode === "qris" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/70 p-6 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Pembayaran QRIS">
              <motion.div initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="glass-solid relative flex w-full max-w-md flex-col items-center gap-5 rounded-[2rem] p-8 text-center">
                <button type="button" onClick={closeQris} className="k-btn k-btn-ghost absolute right-3 top-3 !min-h-0 !p-2" aria-label="Tutup pembayaran"><Icon name="x" className="h-5 w-5" /></button>

                <div>
                  <span className="eyebrow !mb-1">Scan untuk bayar</span>
                  <h2 className="font-display text-3xl font-semibold tracking-tight">Bayar dengan QRIS</h2>
                  <p className="mt-2 text-sm text-muted">Buka aplikasi pembayaranmu, scan QR di bawah, lalu tunggu. Halaman ini lanjut otomatis.</p>
                </div>

                {/* While the invoice is still being created the canvas is empty — show a spinner instead of a blank white square. */}
                <div className="flex aspect-square w-full max-w-[18rem] items-center justify-center rounded-3xl bg-white p-3 shadow-xl ring-1 ring-black/5">
                  {qrisString ? (
                    <canvas ref={qrisCanvasRef} aria-label="QRIS pembayaran" className="h-full w-full" />
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <Spinner className="h-10 w-10" />
                      <p className="text-sm font-medium text-black/50">Menyiapkan QRIS…</p>
                    </div>
                  )}
                </div>
                <p className="font-display text-2xl font-semibold text-accent">{rupiah(payableAmount)}</p>

                {checking && qrisExpirySeconds > 0 && (
                  <div className="flex w-full items-center gap-3 rounded-2xl border border-fg/10 bg-fg/5 px-4 py-3">
                    <div className="relative shrink-0">
                      <svg viewBox="0 0 40 40" className="h-10 w-10 -rotate-90">
                        <circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="3" />
                        <circle cx="20" cy="20" r="16" fill="none" stroke={qrisExpirySeconds < 60 ? "#ef4444" : "var(--accent)"} strokeWidth="3" strokeLinecap="round" strokeDasharray="100.53" strokeDashoffset={100.53 * (1 - qrisExpirySeconds / QRIS_DISPLAY_SECONDS)} className="transition-all duration-1000" />
                      </svg>
                      <span className={`absolute inset-0 flex items-center justify-center text-[0.625rem] font-bold ${qrisExpirySeconds < 60 ? "text-red-500" : "text-muted"}`}>{Math.ceil(qrisExpirySeconds / 60)}m</span>
                    </div>
                    <div className="text-left">
                      <p className="text-[0.65rem] font-bold uppercase tracking-wider text-muted">Berlaku</p>
                      <p className={`font-display text-lg font-semibold tabular-nums ${qrisExpirySeconds < 60 ? "text-red-500" : ""}`}>
                        {String(Math.floor(qrisExpirySeconds / 60)).padStart(2, "0")}:{String(qrisExpirySeconds % 60).padStart(2, "0")}
                      </p>
                    </div>
                    <div className="ml-auto flex items-center gap-1.5">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                      <span className="text-xs text-muted">Menunggu pembayaran…</span>
                    </div>
                  </div>
                )}

                {qrisExpirySeconds === 0 && checking && (
                  <div className="w-full rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-center">
                    <p className="text-sm font-semibold text-amber-700">QR ini terlihat kedaluwarsa</p>
                    <p className="mt-0.5 text-xs text-amber-700/80">Sudah bayar? Kami masih memeriksa di latar belakang. Atau buat QRIS baru di bawah.</p>
                  </div>
                )}

                {error && <p className="max-w-sm text-sm font-medium text-red-500">{error}</p>}
                {(qrisExpirySeconds === 0 || !checking) && (
                  <button type="button" onClick={startQris} disabled={starting} className="k-btn k-btn-accent">
                    {starting && <Spinner className="h-4 w-4 !border-white/40 !border-t-white" />}
                    {starting ? "Menyiapkan…" : "Buat QRIS baru"}
                  </button>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {showScanner && <QrCodeScanner onDetect={onQrScanned} onClose={() => setShowScanner(false)} />}

        {error && mode !== "qris" && (
          <div role="alert" className="flex max-w-xl flex-col items-center gap-3 rounded-2xl bg-red-500/10 px-5 py-4 text-center text-sm font-medium text-red-500">
            <p>{error}</p>
            {!sessionReady && (
              <button type="button" onClick={() => { setError(null); setSessionRetry((n) => n + 1); }} className="k-btn !min-h-0 !py-2.5 !text-sm">
                <Icon name="refresh" className="h-4 w-4" />
                Coba lagi
              </button>
            )}
          </div>
        )}

        <BackButton onClick={() => (mode === "choose" ? navigate(getPreviousRoute("payment", boothConfig.kioskFlow)) : setMode("choose"))} label={mode === "choose" ? "Kembali" : "Pilih cara bayar lain"} />
      </KioskPage>
    </ScreenLayoutBoundary>
  );
}
