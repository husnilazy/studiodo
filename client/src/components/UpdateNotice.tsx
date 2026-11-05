import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUpdaterStatus, formatMB } from "@/lib/useUpdaterStatus";

// Tells the person at the screen what the app is doing about an update, so the restart never comes as a surprise.
//  - admin mode: a card that follows the download (progress, size, speed), offers "Pasang sekarang / Nanti" when it is
//    ready, and shows what went wrong if it failed.
//  - kiosk mode: customers must never see download chatter, so only the restart itself is announced.
// Both modes show a full-screen "Memasang pembaruan" notice while the app is about to close and reopen by itself.

function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} />;
}

export function InstallingOverlay({ version }: { version?: string | null }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-5 bg-black/85 px-8 text-center text-white backdrop-blur-sm"
      role="alertdialog"
      aria-live="assertive"
    >
      <Spinner className="h-12 w-12 text-accent" />
      <h2 className="text-2xl font-semibold">Memasang pembaruan{version ? ` v${version}` : ""}…</h2>
      <p className="max-w-md text-sm leading-relaxed text-white/75">
        Aplikasi akan menutup lalu terbuka kembali sendiri dalam sekitar 30 detik. Mohon jangan mematikan komputer atau menutup jendela ini.
      </p>
    </motion.div>
  );
}

export default function UpdateNotice({ mode }: { mode: "admin" | "kiosk" }) {
  const status = useUpdaterStatus();
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const [errorDismissed, setErrorDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  // A new failure should be able to show again after an earlier one was dismissed.
  useEffect(() => { if (status?.state !== "error") setErrorDismissed(false); }, [status?.state]);

  if (!status) return null;
  const version = status.version;
  const installing = status.state === "installing";

  const installNow = async () => {
    setBusy(true);
    try {
      await window.studiodo?.installUpdateNow?.();
    } finally {
      setBusy(false);
    }
  };
  const retry = async () => {
    setBusy(true);
    try { await window.studiodo?.checkForUpdate?.(); } finally { setBusy(false); }
  };

  const percent = Math.max(0, Math.min(100, status.progressPercent ?? 0));
  const speed = status.bytesPerSecond ? `${(status.bytesPerSecond / 1024 / 1024).toFixed(1)} MB/dtk` : null;

  const showDownloading = mode === "admin" && (status.state === "downloading" || status.state === "available");
  const showReady = mode === "admin" && status.state === "downloaded" && dismissedVersion !== version;
  const showError = mode === "admin" && status.state === "error" && !errorDismissed && Boolean(status.error);

  return (
    <>
      <AnimatePresence>{installing && <InstallingOverlay version={version} />}</AnimatePresence>

      {!installing && (showDownloading || showReady || showError) && (
        <div className="fixed bottom-4 right-4 z-[9000] w-[min(92vw,360px)]">
          <AnimatePresence mode="wait">
            {showDownloading && (
              <motion.div key="dl" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} className="rounded-2xl border border-fg/15 bg-surface p-4 shadow-2xl shadow-black/20">
                <div className="flex items-center gap-2 text-sm font-semibold"><Spinner className="h-4 w-4 text-accent" />Mengunduh pembaruan{version ? ` v${version}` : ""}</div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-fg/10" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${percent}%` }} />
                </div>
                <div className="mt-2 flex justify-between text-xs text-fg/60">
                  <span>{percent}%{status.totalBytes ? ` · ${formatMB(status.transferredBytes)} / ${formatMB(status.totalBytes)}` : ""}</span>
                  {speed && <span>{speed}</span>}
                </div>
                <p className="mt-2 text-xs text-fg/55">Aplikasi tetap bisa dipakai seperti biasa. Anda akan diberi tahu sebelum aplikasi restart.</p>
              </motion.div>
            )}
            {showReady && (
              <motion.div key="ready" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} className="rounded-2xl border border-accent/40 bg-surface p-4 shadow-2xl shadow-black/20">
                <p className="text-sm font-semibold">Pembaruan v{version} siap dipasang</p>
                <p className="mt-1 text-xs leading-relaxed text-fg/60">Aplikasi akan menutup lalu terbuka sendiri (±30 detik). Pastikan tidak ada sesi foto yang sedang berjalan.</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={installNow} disabled={busy} className="flex-1 rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">{busy ? "Memulai…" : "Pasang sekarang"}</button>
                  <button type="button" onClick={() => setDismissedVersion(version)} className="rounded-xl border border-fg/20 px-3 py-2 text-xs font-medium hover:border-fg/50">Nanti</button>
                </div>
                <p className="mt-2 text-[11px] text-fg/45">Jika dibiarkan, kiosk memasangnya sendiri saat sedang tidak dipakai.</p>
              </motion.div>
            )}
            {showError && (
              <motion.div key="err" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} className="rounded-2xl border border-red-400/40 bg-surface p-4 shadow-2xl shadow-black/20">
                <p className="text-sm font-semibold text-red-500">Pembaruan gagal</p>
                <p className="mt-1 break-words text-xs text-fg/60">{status.error}</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={retry} disabled={busy} className="flex-1 rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">{busy ? "Mencoba…" : "Coba lagi"}</button>
                  <button type="button" onClick={() => setErrorDismissed(true)} className="rounded-xl border border-fg/20 px-3 py-2 text-xs font-medium hover:border-fg/50">Tutup</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </>
  );
}
