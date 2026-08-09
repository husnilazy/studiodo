import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import QRCode from "qrcode";
import VirtualKeyboard from "@/components/VirtualKeyboard";
import { api } from "@/lib/api";
import { useKioskSession } from "@/lib/sessionStore";
import { useBoothConfig } from "@/lib/boothConfigStore";

type Mode = "choose" | "voucher" | "qris";

export default function Pembayaran() {
  const [, navigate] = useLocation();
  const { selectedPackage, selectedExtras, orientation, sessionId, setSessionId } = useKioskSession();
  const [mode, setMode] = useState<Mode>("choose");
  const [voucherCode, setVoucherCode] = useState("");
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [starting, setStarting] = useState(false);
  const qrisCanvasRef = useRef<HTMLCanvasElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!selectedPackage) {
      navigate("/paket");
      return;
    }
    if (!sessionId) {
      api
        .createSession({ packageId: selectedPackage.id, orientation, selectedExtras })
        .then((s) => setSessionId(s.id))
        .catch(() => setError("Gagal membuat sesi. Coba lagi."));
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [selectedPackage, selectedExtras, orientation, sessionId]);

  const totalAmount = Number(selectedPackage?.price ?? 0) + selectedExtras.reduce((sum, extra) => sum + Number(extra.price), 0);

  const startQris = async () => {
    if (!sessionId || !selectedPackage || starting) return;
    setMode("qris");
    setChecking(true);
    setStarting(true);
    try {
      const result = await api.startQris(sessionId, totalAmount);
      if (qrisCanvasRef.current) {
        await QRCode.toCanvas(qrisCanvasRef.current, result.qrString, {
          width: 220,
          margin: 2,
          color: { dark: "#111111", light: "#ffffff" },
        });
      }
      pollRef.current = setInterval(async () => {
        try {
          const { status } = await api.getPaymentStatus(sessionId);
          if (status === "success") {
            if (pollRef.current) clearInterval(pollRef.current);
            navigate("/frame");
          }
        } catch {
          if (pollRef.current) clearInterval(pollRef.current);
          setChecking(false);
          setError("Gagal memeriksa status pembayaran.");
        }
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memulai pembayaran QRIS.");
      setChecking(false);
    } finally {
      setStarting(false);
    }
  };

  const redeemVoucher = async () => {
    if (!sessionId || !voucherCode.trim()) return;
    setError(null);
    try {
      const result = await api.redeemVoucher(sessionId, voucherCode);
      if (result.amount === 0) {
        navigate("/frame");
      } else {
        setMode("qris");
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
        Total {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(totalAmount)}
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
              <p className="mt-1 text-sm text-[var(--kiosk-muted)]">Masukkan kode untuk mendapatkan potongan harga.</p>
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
                placeholder="CONTOH: HEMAT50"
                aria-label="Kode voucher"
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-lg font-semibold tracking-[0.16em] outline-none transition focus:border-accent"
              />
              {voucherCode && <button onClick={() => setVoucherCode("")} className="rounded-lg px-2 text-white/40 hover:text-white" aria-label="Hapus kode voucher">×</button>}
            </div>
          </div>
            <button onClick={redeemVoucher} disabled={!voucherCode.trim()} className="kinetic-button mt-4 w-full rounded-xl bg-accent px-5 py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-40">Terapkan voucher</button>
          </div>
          <AnimatePresence>
            {showKeyboard && (
              <motion.div
                initial={{ opacity: 0, y: 24, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 18, scale: 0.97 }}
                transition={{ duration: 0.24, ease: "easeOut" }}
                className="mt-1 w-full"
              >
                <VirtualKeyboard value={voucherCode} onChange={(value) => setVoucherCode(value.toUpperCase())} onClose={() => setShowKeyboard(false)} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {mode === "qris" && (
        <div className="flex flex-col items-center gap-6">
          <motion.div
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ repeat: Infinity, duration: 1.6 }}
            className="flex h-64 w-64 items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-white"
          >
            <canvas ref={qrisCanvasRef} aria-label="QRIS pembayaran" />
          </motion.div>
          <p className="text-white/60">Menunggu pembayaran{checking ? "..." : ""}</p>
        </div>
      )}

      {error && <p className="text-red-400">{error}</p>}

      <button
        onClick={() => (mode === "choose" ? navigate("/orientasi") : setMode("choose"))}
        className="text-white/40 hover:text-white/70"
      >
        ← Kembali
      </button>
    </div>
  );
}
