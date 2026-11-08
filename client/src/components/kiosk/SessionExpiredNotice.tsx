import { useEffect, useState } from "react";
import { motion } from "framer-motion";

/** "Time is up" notice: counts down a few seconds, then moves on by itself (the tap-to-continue button skips the wait). */
export default function SessionExpiredNotice({ title = "Waktu sesi habis", detail, seconds = 5, onDone }: { title?: string; detail: string; seconds?: number; onDone: () => void }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (left <= 0) { onDone(); return; }
    const timer = window.setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-6 backdrop-blur-sm" role="alertdialog" aria-live="assertive">
      <motion.div initial={{ opacity: 0, scale: 0.92, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="glass-panel w-full max-w-[26rem] rounded-[2rem] p-7 text-center shadow-2xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/15 font-display text-3xl font-bold text-red-500">{Math.max(0, left)}</div>
        <h2 className="mt-4 font-display text-2xl font-semibold">{title}</h2>
        <p className="mt-1.5 text-[15px] text-muted">{detail}</p>
        <button type="button" onClick={onDone} className="k-btn k-btn-accent mt-5 w-full">Lanjut sekarang</button>
      </motion.div>
    </div>
  );
}
