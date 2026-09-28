import { motion, AnimatePresence } from "framer-motion";
import { useToastStore, type AdminToastType } from "@/lib/toastStore";

const ICONS: Record<AdminToastType, string> = {
  success: "✓",
  error: "✕",
  info: "ℹ",
};

const COLORS: Record<AdminToastType, string> = {
  success: "border-emerald-400/40 bg-emerald-950/80",
  error: "border-red-400/40 bg-red-950/80",
  info: "border-amber-400/40 bg-amber-950/80",
};

const PILL_COLORS: Record<AdminToastType, string> = {
  success: "bg-emerald-400",
  error: "bg-red-400",
  info: "bg-amber-400",
};

// Generic toast host for the admin surface — mounted once in AdminAuthGate so
// every gated admin route (AdminDashboard, FrameManagement, CustomerManagement,
// ScreenBuilder) can push a toast via lib/toastStore's pushToast(). Copies
// NetworkToast.tsx's proven AnimatePresence shell but reads from a decoupled
// store; positioned bottom-right (NetworkToast is bottom-center) so the two
// never overlap if both are ever visible at once.
export default function ToastHost() {
  const toasts = useToastStore((state) => state.toasts);

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-2">
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
              <p className="text-sm font-semibold text-white">{toast.title}</p>
              {toast.sub && <p className="mt-0.5 text-xs text-white/55">{toast.sub}</p>}
            </div>
            <span className={`ml-1 h-2 w-2 shrink-0 rounded-full ${PILL_COLORS[toast.type]}`} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
