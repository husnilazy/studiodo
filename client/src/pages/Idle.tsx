import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useBoothConfig } from "@/lib/boothConfigStore";
import { useKioskSession } from "@/lib/sessionStore";

export default function Idle() {
  const [, navigate] = useLocation();
  const config = useBoothConfig((s) => s.config);
  const resetSession = useKioskSession((s) => s.resetSession);
  const [showPromo, setShowPromo] = useState(false);

  useEffect(() => {
    resetSession();
    const t = setTimeout(() => setShowPromo(true), 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="kinetic-page relative flex h-full w-full cursor-pointer flex-col items-center justify-center overflow-hidden px-6"
      onClick={() => navigate("/paket")}
    >
      <div
        className={`absolute inset-0 bg-[length:200%_200%] ${config.animationsEnabled && config.backgroundGradientEnabled ? "animate-gradient" : ""} opacity-70`}
        style={{
          backgroundImage: config.backgroundGradientEnabled
            ? `radial-gradient(circle at 30% 30%, ${config.accentColor} 0%, transparent 55%), linear-gradient(135deg, ${config.backgroundGradientStart}, ${config.backgroundGradientEnd})`
            : "none",
        }}
      />
      {config.idleCoverUrl && config.idleCoverType === "image" && <img src={config.idleCoverUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-45" />}
      {config.idleCoverUrl && config.idleCoverType === "video" && <video src={config.idleCoverUrl} autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-cover opacity-45" />}
      <div className="absolute inset-0 bg-black/35" />

      {config.logoUrl && (
        <img src={config.logoUrl} alt={config.brandName} className="relative z-10 mb-6 h-20 max-w-[70vw] object-contain" style={{ transform: `scale(${Math.max(0.6, Math.min(1.8, config.logoScale / 100))})` }} />
      )}

      <motion.h1
        className="kinetic-title relative z-10 font-display text-6xl font-bold tracking-tight md:text-8xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        {config.brandName}
      </motion.h1>
      <p className="relative z-10 mt-4 max-w-lg text-center text-lg text-white/60 md:text-xl">{config.tagline}</p>

      <motion.div
        className="kinetic-cta relative z-10 mt-16 rounded-full border border-white/20 bg-white/10 px-10 py-4 text-xl font-medium shadow-2xl backdrop-blur-xl"
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ repeat: Infinity, duration: 2 }}
      >
        Sentuh layar untuk mulai
      </motion.div>

      <AnimatePresence>
        {showPromo && config.promoText && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="absolute bottom-10 z-10 rounded-2xl px-8 py-4 text-center shadow-xl backdrop-blur-md"
            style={{ background: "color-mix(in srgb, var(--accent) 25%, black 60%)" }}
          >
            {config.promoText}
          </motion.div>
        )}
      </AnimatePresence>
      {config.idleBannerEnabled && config.idleBannerUrl && <img src={config.idleBannerUrl} alt="Promo banner" className="absolute bottom-6 right-6 z-10 max-h-28 max-w-xs rounded-2xl border border-white/20 object-contain shadow-2xl" />}
    </div>
  );
}
