import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useBoothConfig, applyThemeToDocument } from "@/lib/boothConfigStore";
import { useStickerLibrary } from "@/lib/stickerStore";
import { useOfflineStore, startNetworkMonitor } from "@/lib/offlineStore";
import { startKioskHeartbeat } from "@/lib/kioskHeartbeat";
import NetworkToast from "@/components/NetworkToast";
import OperatorConsole from "@/components/OperatorConsole";

export default function KioskShell({ children }: { children: React.ReactNode }) {
  const config = useBoothConfig((s) => s.config);
  const isOnline = useOfflineStore((s) => s.isOnline);
  const pendingCount = useOfflineStore((s) => s.pendingSessionCount + s.pendingPhotoCount + s.pendingStripCount);
  const syncInProgress = useOfflineStore((s) => s.syncInProgress);
  const [showStatus, setShowStatus] = useState(false);

  // Start network monitor + fleet heartbeat once
  useEffect(() => {
    startNetworkMonitor();
    startKioskHeartbeat();
  }, []);

  // Apply theme
  useEffect(() => {
    applyThemeToDocument(config);
  }, [config]);

  // Cross-tab config sync
  useEffect(() => {
    const refreshConfig = (event: StorageEvent) => {
      if (event.key === "studiodo-booth-config") useBoothConfig.persist.rehydrate();
      if (event.key === "studiodo-sticker-library") useStickerLibrary.persist.rehydrate();
    };
    window.addEventListener("storage", refreshConfig);
    return () => window.removeEventListener("storage", refreshConfig);
  }, []);

  // Show status pill for 3s whenever status changes
  useEffect(() => {
    setShowStatus(true);
    const t = setTimeout(() => setShowStatus(false), 3000);
    return () => clearTimeout(t);
  }, [isOnline]);

  return (
    <div
      className="kinetic-shell relative h-full w-full overflow-hidden font-body antialiased"
      style={{
        backgroundColor: "var(--kiosk-background)",
        color: "var(--kiosk-text)",
        backgroundImage: config.backgroundGradientEnabled
          ? "linear-gradient(135deg, var(--kiosk-gradient-start), var(--kiosk-gradient-end))"
          : "none",
      }}
    >
      <div className="kinetic-noise" />

      {/* Network status pill (top-right) */}
      <AnimatePresence>
        {showStatus && (
          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.2 }}
            className={`absolute right-4 top-4 z-50 flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur-md ${
              isOnline
                ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-700"
                : "border-amber-400/40 bg-amber-500/15 text-amber-700"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
            {isOnline ? "Online" : "Offline"}
            {!isOnline && config.offlineModeEnabled && <span className="opacity-60">· Mode lokal aktif</span>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Persistent minimal indicator when offline (no popup) */}
      {!isOnline && !showStatus && config.offlineModeEnabled && (
        <div className="absolute right-4 top-4 z-50 flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[10px] text-amber-700 backdrop-blur-sm">
          <span className="h-1 w-1 rounded-full bg-amber-400/70" />
          Offline
        </div>
      )}

      {/* Pending sync badge */}
      {pendingCount > 0 && isOnline && (
        <div className={`absolute right-4 top-10 z-50 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] backdrop-blur-sm ${syncInProgress ? "border-sky-400/40 bg-sky-500/10 text-sky-700" : "border-accent/30 bg-accent/10 text-accent"}`}>
          {syncInProgress && <span className="h-1 w-1 animate-spin rounded-full border border-sky-400 border-t-transparent" />}
          {syncInProgress ? "Sync..." : `${pendingCount} pending`}
        </div>
      )}

      {children}

      {/* Global network change toasts */}
      <NetworkToast />

      {/* Operator console overlay — hidden until Ctrl+Shift+O */}
      <OperatorConsole />
    </div>
  );
}
