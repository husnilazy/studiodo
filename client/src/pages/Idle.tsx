import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useBoothConfig } from "@/lib/boothConfigStore";
import { useKioskSession } from "@/lib/sessionStore";
import { getNextRoute } from "@/lib/kioskFlow";
import { ScreenLayoutBoundary } from "@/lib/screenBuilder/ScreenLayoutBoundary";
import { usePositionableContext } from "@/lib/screenBuilder/PositionableContext";
import Positionable from "@/components/Positionable";
import { Icon } from "@/components/kiosk/Icons";

export default function Idle() {
  const [, navigate] = useLocation();
  const config = useBoothConfig((s) => s.config);
  const resetSession = useKioskSession((s) => s.resetSession);
  const [showPromo, setShowPromo] = useState(false);
  // Mounted inside the WYSIWYG editor (ScreenBuilder.tsx), the "tap anywhere to start" behavior on this outer div
  // would otherwise fire real navigation on any canvas click that a Positionable doesn't swallow.
  const positionable = usePositionableContext();

  useEffect(() => {
    resetSession();
    const t = setTimeout(() => setShowPromo(true), 2500);
    return () => clearTimeout(t);
  }, []);

  const start = () => {
    if (positionable?.editMode) return;
    navigate(getNextRoute("idle", config.kioskFlow));
  };

  return (
    <ScreenLayoutBoundary screenKey="idle">
      <div
        className="kinetic-page relative flex h-full w-full cursor-pointer select-none flex-col items-center justify-center overflow-hidden px-6"
        onClick={start}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") start(); }}
        aria-label={config.idleStartText}
      >
        {/* Cover photo/video (optional) with a soft wash so text always reads */}
        {config.idleCoverUrl && config.idleCoverType === "image" && <img src={config.idleCoverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        {config.idleCoverUrl && config.idleCoverType === "video" && <video src={config.idleCoverUrl} autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-cover" />}
        {config.idleCoverUrl && <div className="absolute inset-0 bg-gradient-to-b from-canvas/85 via-canvas/45 to-canvas/90" />}

        {/* Drifting pastel orbs — the same look as the website hero */}
        {!config.idleCoverUrl && config.backgroundGradientEnabled && (
          <>
            <div className={`pointer-events-none absolute -right-24 -top-24 h-[34rem] w-[34rem] rounded-full bg-accent/25 blur-3xl ${config.animationsEnabled ? "k-drift" : ""}`} />
            <div className={`pointer-events-none absolute -bottom-32 -left-24 h-[30rem] w-[30rem] rounded-full bg-[#ffc8de]/50 blur-3xl ${config.animationsEnabled ? "k-drift" : ""}`} style={{ animationDelay: "-5s" }} />
          </>
        )}

        <div className="relative z-10 flex flex-col items-center text-center">
          {config.logoUrl && (
            <img src={config.logoUrl} alt={config.brandName} className="mb-6 h-20 max-w-[70vw] object-contain" style={{ transform: `scale(${Math.max(0.6, Math.min(1.8, config.logoScale / 100))})` }} />
          )}

          <Positionable id="heading" type="text" label="Judul Brand">
            <motion.h1 className="kinetic-title font-display text-6xl font-semibold md:text-8xl" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
              {config.idleHeadline || config.brandName}
            </motion.h1>
          </Positionable>
          <Positionable id="subheading" type="text" label="Tagline">
            <motion.p className="mt-5 max-w-xl text-lg text-muted md:text-2xl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25, duration: 0.6 }}>
              {config.idleSubheadline || config.tagline}
            </motion.p>
          </Positionable>

          <Positionable id="cta" type="system-button" label="Teks Ajakan">
            <motion.div className="relative mt-14" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }}>
              {config.animationsEnabled && <span className="absolute inset-0 animate-ping-soft rounded-full bg-accent/40" />}
              <div className="k-btn k-btn-accent k-btn-lg relative gap-3 text-xl md:text-2xl">
                <Icon name="camera" className="h-7 w-7" />
                {config.idleStartText || "Sentuh layar untuk mulai"}
              </div>
            </motion.div>
          </Positionable>
        </div>

        <AnimatePresence>
          {showPromo && config.promoText && (
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="glass-panel absolute bottom-8 z-10 flex max-w-[90vw] items-center gap-3 rounded-full px-7 py-3.5 text-center text-sm font-semibold md:text-base"
            >
              <Icon name="sparkles" className="h-5 w-5 shrink-0 text-accent" />
              {config.promoText}
            </motion.div>
          )}
        </AnimatePresence>
        {config.idleBannerEnabled && config.idleBannerUrl && <img src={config.idleBannerUrl} alt="Promo banner" className="absolute bottom-6 right-6 z-10 max-h-28 max-w-xs rounded-2xl border border-fg/10 object-contain shadow-2xl" />}
      </div>
    </ScreenLayoutBoundary>
  );
}
