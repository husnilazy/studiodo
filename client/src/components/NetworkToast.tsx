import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useOfflineStore } from "@/lib/offlineStore";

interface ToastMessage {
  id: string;
  type: "online" | "offline" | "syncing" | "synced";
  text: string;
  sub?: string;
}

const TOAST_DURATION = 4000;

export default function NetworkToast() {
  const isOnline = useOfflineStore((s) => s.isOnline);
  const pendingCount = useOfflineStore((s) => s.pendingSessionCount + s.pendingPhotoCount + s.pendingStripCount);
  const syncInProgress = useOfflineStore((s) => s.syncInProgress);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const prevOnline = useRef<boolean | null>(null);
  const prevSyncing = useRef(false);
  const pendingBeforeSync = useRef(0);

  const pushToast = (msg: Omit<ToastMessage, "id">) => {
    const id = crypto.randomUUID();
    setToasts((t) => [...t.slice(-2), { ...msg, id }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), TOAST_DURATION + 600);
  };

  // React to online/offline transitions. The actual sync is driven centrally
  // by offlineStore's network monitor (startNetworkMonitor) — this component
  // only reacts to its state to show toasts.
  useEffect(() => {
    if (prevOnline.current === null) {
      prevOnline.current = isOnline;
      return;
    }
    if (isOnline && !prevOnline.current) {
      prevOnline.current = true;
      pushToast({ type: "online", text: "Koneksi tersambung kembali ✓", sub: pendingCount > 0 ? `Menyinkronkan ${pendingCount} data offline...` : "Semua fitur aktif" });
    } else if (!isOnline && prevOnline.current) {
      prevOnline.current = false;
      pushToast({ type: "offline", text: "Koneksi terputus", sub: "Sesi foto tetap berjalan secara offline" });
    }
  }, [isOnline, pendingCount]);

  // Show sync progress, then a "done" toast once a sync pass that had
  // something to do finishes.
  useEffect(() => {
    if (syncInProgress) {
      pendingBeforeSync.current = pendingCount;
      pushToast({ type: "syncing", text: "Menyinkronkan data...", sub: `${pendingCount} data menunggu upload` });
    } else if (prevSyncing.current && pendingBeforeSync.current > 0) {
      pushToast({ type: "synced", text: "Data offline berhasil disinkronkan ✨", sub: "Semua data tersimpan di server" });
    }
    prevSyncing.current = syncInProgress;
  }, [syncInProgress]);

  const ICONS: Record<ToastMessage["type"], string> = {
    online: "🌐",
    offline: "📡",
    syncing: "🔄",
    synced: "✨",
  };

  const COLORS: Record<ToastMessage["type"], string> = {
    online: "border-emerald-400/40 bg-emerald-950/80",
    offline: "border-amber-400/40 bg-amber-950/80",
    syncing: "border-sky-400/40 bg-sky-950/80",
    synced: "border-violet-400/40 bg-violet-950/80",
  };

  const PILL_COLORS: Record<ToastMessage["type"], string> = {
    online: "bg-emerald-400",
    offline: "bg-amber-400",
    syncing: "bg-sky-400 animate-pulse",
    synced: "bg-violet-400",
  };

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[9999] flex -translate-x-1/2 flex-col items-center gap-2">
      <AnimatePresence mode="sync">
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className={`flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-2xl shadow-black/50 backdrop-blur-xl ${COLORS[toast.type]}`}
          >
            <span className="text-xl">{ICONS[toast.type]}</span>
            <div>
              <p className="text-sm font-semibold text-white">{toast.text}</p>
              {toast.sub && <p className="mt-0.5 text-xs text-white/55">{toast.sub}</p>}
            </div>
            <span className={`ml-1 h-2 w-2 shrink-0 rounded-full ${PILL_COLORS[toast.type]}`} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
