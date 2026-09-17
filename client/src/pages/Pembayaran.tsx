import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import QRCode from "qrcode";
import VirtualKeyboard from "@/components/VirtualKeyboard";
import { api } from "@/lib/api";
import { useKioskSession } from "@/lib/sessionStore";
import { useBoothConfig } from "@/lib/boothConfigStore";
import { createOfflineSessionId, isBrowserOnline } from "@/lib/offlineStore";

type Mode = "choose" | "voucher" | "qris";

export default function Pembayaran() {
  const [, navigate] = useLocation();
  const { selectedPackage, selectedExtras, orientation, sessionId, setSessionId } = useKioskSession();
  const offlineModeEnabled = useBoothConfig((state) => state.config.offlineModeEnabled);
  const [mode, setMode] = useState<Mode>("choose");
  const [voucherCode, setVoucherCode] = useState("");
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [starting, setStarting] = useState(false);
  const [qrisString, setQrisString] = useState<string | null>(null);
  const [cashPaymentEnabled, setCashPaymentEnabled] = useState(false);
  const [cashRedeemed, setCashRedeemed] = useState(false);
  const [qrisExpirySeconds, setQrisExpirySeconds] = useState(300);
  const qrisCanvasRef = useRef<HTMLCanvasElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qrisTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api.getPaymentConfig().then((result) => setCashPaymentEnabled(result.cashPaymentEnabled)).catch(() => setCashPaymentEnabled(false));
  }, []);

  useEffect(() => {
    if (!selectedPackage) {
      navigate("/paket");
      return;
    }
    if (!sessionId) {
      api
        .createSession({ packageId: selectedPackage.id, orientation, selectedExtras })
        .then((s) => setSessionId(s.id))
        .catch(() => {
          if (offlineModeEnabled && !isBrowserOnline()) setSessionId(createOfflineSessionId());
          else setError("Gagal membuat sesi. Coba lagi.");
        });
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (qrisTimerRef.current) clearInterval(qrisTimerRef.current);
    };
  }, [selectedPackage, selectedExtras, orientation, sessionId]);

  const totalAmount = Number(selectedPackage?.price ?? 0) + selectedExtras.reduce((sum, extra) => sum + Number(extra.price), 0);
  const [payableAmount, setPayableAmount] = useState(totalAmount);

  useEffect(() => {
    if (mode !== "qris" || !qrisString || !qrisCanvasRef.current) return;
    QRCode.toCanvas(qrisCanvasRef.current, qrisString, {
      width: 220,
      margin: 2,
      color: { dark: "#111111", light: "#ffffff" },
    }).catch(() => setError("QRIS gagal ditampilkan. Silakan buat QRIS baru."));
  }, [mode, qrisString]);

  const startQris = async () => {
    if (!sessionId || !selectedPackage || starting) return;
    if (pollRef.current) clearInterval(pollRef.current);
    if (qrisTimerRef.current) clearInterval(qrisTimerRef.current);
    setError(null);
    setQrisString(null);
    setQrisExpirySeconds(300);
    setMode("qris");
    setChecking(true);
    setStarting(true);
    try {
      const result = await api.startQris(sessionId);
      setQrisString(result.qrString);
      // Start expiry countdown
      qrisTimerRef.current = setInterval(() => {
        setQrisExpirySeconds((prev) => {
          if (prev <= 1) {
            if (qrisTimerRef.current) clearInterval(qrisTimerRef.current);
            if (pollRef.current) clearInterval(pollRef.current);
            setChecking(false);
            setError("QRIS sudah kedaluwarsa. Silakan buat QRIS baru.");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      pollRef.current = setInterval(async () => {
        try {
          const { status } = await api.getPaymentStatus(sessionId);
          if (status === "success") {
            if (pollRef.current) clearInterval(pollRef.current);
            if (qrisTimerRef.current) clearInterval(qrisTimerRef.current);
            setChecking(false);
            navigate("/frame");
          } else if (status === "failed" || status === "expired") {
            if (pollRef.current) clearInterval(pollRef.current);
            if (qrisTimerRef.current) clearInterval(qrisTimerRef.current);
            setChecking(false);
            setError("Pembayaran QRIS gagal atau sudah kedaluwarsa. Silakan coba lagi.");
          }
        } catch {
          if (pollRef.current) clearInterval(pollRef.current);
          if (qrisTimerRef.current) clearInterval(qrisTimerRef.current);
          setChecking(false);
          setError("Gagal memeriksa status pembayaran.");
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

  const continueOffline = () => {
    if (!offlineModeEnabled || isBrowserOnline()) return;
    if (!sessionId) setSessionId(createOfflineSessionId());
    navigate("/frame");
  };

  const redeemVoucher = async () => {
    if (!sessionId || !voucherCode.trim()) return;
    setError(null);
    try {
      const result = await api.redeemVoucher(sessionId, voucherCode);
      setPayableAmount(result.amount);
      setCashRedeemed(Boolean((result as { cash?: boolean }).cash));
      if (result.amount === 0) {
        navigate("/frame");
      } else {
          await startQris();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Voucher tidak dapat digunakan.");
    }
  };

  return (
    <div className="kinetic-page flex h-full flex-col items-center justify-center gap-10 px-6">
      <div className="text-center"><span className="eyebrow">03 / SECURE CHECKOUT</span><h2 className="kinetic-heading font-display text-5xl font-bold md:text-7xl">Pembayaran</h2><p className="mt-3 text-[var(--kiosk-muted)]">Satu scan, lalu momenmu siap dibuat.</p></div>
      <p className="text-xl text-accent">
        Total {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(payableAmount)}
      </p>

      {mode === "choose" && (
        <div className="flex flex-wrap justify-center gap-5">
          <button
            onClick={startQris}
            className="glass-panel kinetic-button rounded-[2rem] border-white/10 px-14 py-10 font-display text-2xl font-semibold hover:border-accent"
          >
            Bayar dengan QRIS
          </button>
          <button
            onClick={() => setMode("voucher")}
            className="glass-panel kinetic-button rounded-[2rem] border-white/10 px-14 py-10 font-display text-2xl font-semibold hover:border-accent"
          >
            Gunakan Voucher
          </button>
          {cashPaymentEnabled && <button onClick={() => { setCashRedeemed(false); setMode("voucher"); }} className="glass-panel kinetic-button rounded-[2rem] border-emerald-300/20 px-14 py-10 font-display text-2xl font-semibold text-emerald-100 hover:border-emerald-200">Bayar Cash ke Admin</button>}
          {offlineModeEnabled && !isBrowserOnline() && <button onClick={continueOffline} className="glass-panel kinetic-button rounded-[2rem] border-amber-300/30 px-14 py-10 font-display text-2xl font-semibold text-amber-100 hover:border-amber-200">Lanjut offline<br /><span className="text-sm font-normal">Bayar manual di kasir</span></button>}
        </div>
      )}

      {mode === "voucher" && (
        <div className="flex w-full max-w-3xl flex-col items-center gap-4">
          <div className="glass-panel w-full rounded-[2rem] border-white/10 p-5 shadow-2xl shadow-black/20 sm:p-7">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-2xl text-accent">%</div>
            <div>
              <p className="eyebrow">PROMO CODE</p>
              <h3 className="mt-1 font-display text-2xl font-semibold">Punya voucher?</h3>
              <p className="mt-1 text-sm text-[var(--kiosk-muted)]">Masukkan kode voucher atau invoice cash dari admin.</p>
            </div>
          </div>
          <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="mb-2 flex items-center justify-between px-2 text-xs uppercase tracking-[0.16em] text-white/40">
              <span>Kode voucher</span>
              <span className="text-accent">Tidak peka huruf besar/kecil</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={voucherCode}
                onChange={(event) => { setError(null); setVoucherCode(event.target.value.toUpperCase()); }}
                onFocus={() => setShowKeyboard(true)}
                onKeyDown={(event) => { if (event.key === "Enter") redeemVoucher(); }}
                placeholder="CONTOH: CASH-AB12CD34"
                aria-label="Kode voucher"
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-lg font-semibold tracking-[0.16em] outline-none transition focus:border-accent"
              />
              {voucherCode && <button onClick={() => setVoucherCode("")} className="rounded-lg px-2 text-white/40 hover:text-white" aria-label="Hapus kode voucher">×</button>}
            </div>
          </div>
            <button onClick={redeemVoucher} disabled={!voucherCode.trim()} className="kinetic-button mt-4 w-full rounded-xl bg-accent px-5 py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-40">Terapkan voucher</button>
            {cashRedeemed && <p className="mt-3 text-center text-sm text-emerald-300">Invoice cash diterima. Sesi siap dimulai.</p>}
          </div>
        </div>
      )}

      <AnimatePresence>
        {showKeyboard && mode === "voucher" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-end justify-center bg-black/45 p-3 pb-4 backdrop-blur-[2px] sm:p-5 sm:pb-6"
            onMouseDown={(event) => { if (event.target === event.currentTarget) setShowKeyboard(false); }}
          >
            <motion.div
              initial={{ opacity: 0, y: 32, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.97 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
              className="w-full max-w-5xl"
            >
              <VirtualKeyboard value={voucherCode} onChange={(value) => setVoucherCode(value.toUpperCase())} onClose={() => setShowKeyboard(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {mode === "qris" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label="Pembayaran QRIS"
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="relative flex w-full max-w-md flex-col items-center gap-5 rounded-[2rem] border border-white/15 bg-ink-800 p-7 text-center shadow-2xl"
            >
              <button
                onClick={() => {
                  if (pollRef.current) clearInterval(pollRef.current);
                  if (qrisTimerRef.current) clearInterval(qrisTimerRef.current);
                  setChecking(false);
                  setMode("choose");
                }}
                className="absolute right-5 top-4 text-2xl text-white/50 hover:text-white"
                aria-label="Tutup pembayaran"
              >×</button>

              <span className="eyebrow text-accent">SCAN TO PAY</span>
              <h3 className="font-display text-3xl font-bold">Bayar dengan QRIS</h3>
              <p className="text-sm text-white/60">Buka aplikasi pembayaran, scan QR, lalu tunggu konfirmasi otomatis.</p>

              {/* QR Code */}
              <div className="flex h-64 w-64 items-center justify-center rounded-2xl bg-white p-3 shadow-xl shadow-black/30">
                <canvas ref={qrisCanvasRef} aria-label="QRIS pembayaran" />
              </div>

              {/* Expiry countdown */}
              {checking && qrisExpirySeconds > 0 && (
                <div className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                  {/* Progress ring */}
                  <div className="relative shrink-0">
                    <svg viewBox="0 0 40 40" className="h-10 w-10 -rotate-90">
                      <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
                      <circle
                        cx="20" cy="20" r="16"
                        fill="none"
                        stroke={qrisExpirySeconds < 60 ? "#f87171" : "var(--accent, #7C3AED)"}
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeDasharray="100.53"
                        strokeDashoffset={100.53 * (1 - qrisExpirySeconds / 300)}
                        className="transition-all duration-1000"
                      />
                    </svg>
                    <span className={`absolute inset-0 flex items-center justify-center text-[10px] font-bold ${qrisExpirySeconds < 60 ? "text-red-300" : "text-white/70"}`}>
                      {Math.ceil(qrisExpirySeconds / 60)}m
                    </span>
                  </div>
                  <div className="text-left">
                    <p className="text-xs text-white/40 uppercase tracking-wide">Berlaku</p>
                    <p className={`font-display text-lg font-bold tabular-nums ${qrisExpirySeconds < 60 ? "text-red-300" : "text-white"}`}>
                      {String(Math.floor(qrisExpirySeconds / 60)).padStart(2, "0")}:{String(qrisExpirySeconds % 60).padStart(2, "0")}
                    </p>
                  </div>
                  <div className="ml-auto flex items-center gap-1.5">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                    <span className="text-xs text-white/50">Menunggu...</span>
                  </div>
                </div>
              )}

              {qrisExpirySeconds === 0 && (
                <div className="w-full rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-center">
                  <p className="text-sm font-semibold text-red-300">QRIS sudah kedaluwarsa</p>
                  <p className="mt-0.5 text-xs text-red-300/60">Silakan buat QRIS baru untuk melanjutkan pembayaran.</p>
                </div>
              )}

              {error && <p className="max-w-sm text-sm text-red-300">{error}</p>}
              {!checking && <button onClick={startQris} className="kinetic-button rounded-xl bg-accent px-5 py-3 font-semibold">Buat QRIS baru</button>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && <p className="text-red-400">{error}</p>}

      <button
            onClick={() => (mode === "choose" ? navigate("/paket") : setMode("choose"))}
        className="text-white/40 hover:text-white/70"
      >
        ← Kembali
      </button>
    </div>
  );
}
