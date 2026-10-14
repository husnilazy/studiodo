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
import { resolveIdleLayout } from "@/lib/kioskStyles";

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

  const headline = (config.idleHeadline ?? "").trim();
  const subheadline = (config.idleSubheadline ?? "").trim();
  const showHeading = config.idleShowHeadline !== false && headline !== "";
  const showSubheading = config.idleShowSubheadline !== false && subheadline !== "";

  const start = () => {
    if (positionable?.editMode) return;
    navigate(getNextRoute("idle", config.kioskFlow));
  };

  const layout = resolveIdleLayout(config);
  const alignLeft = layout === "left";
  const logoScale = { transform: `scale(${Math.max(0.6, Math.min(1.8, config.logoScale / 100))})` };
  const origin = alignLeft || layout === "fullbleed" ? "origin-left" : "";

  // The pieces are the same in every layout; only how they are composed differs (see lib/kioskStyles.ts).
  const logo = config.idleLogoVideoUrl ? (
    <Positionable id="logo" type="image" label="Logo">
      <video src={config.idleLogoVideoUrl} autoPlay muted loop playsInline className={`mb-6 h-28 max-w-[80vw] object-contain ${origin}`} style={logoScale} />
    </Positionable>
  ) : config.logoUrl ? (
    <Positionable id="logo" type="image" label="Logo">
      <img src={config.logoUrl} alt={config.brandName} className={`mb-6 h-20 max-w-[70vw] object-contain ${origin}`} style={logoScale} />
    </Positionable>
  ) : null;

  // Empty or switched-off = not rendered at all (it used to fall back to the brand name, so the title
  // kept coming back after the tenant deleted it).
  const heading = showHeading ? (
    <Positionable id="heading" type="text" label="Judul Brand">
      <motion.h1
        className={`kinetic-title font-display font-semibold ${layout === "center" || layout === "split" ? "text-6xl md:text-8xl" : "text-6xl md:text-[6.5rem]"}`}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
      >
        {headline}
      </motion.h1>
    </Positionable>
  ) : null;

  const subheading = showSubheading ? (
    <Positionable id="subheading" type="text" label="Tagline">
      <motion.p
        className={`mt-5 max-w-xl text-lg md:text-2xl ${layout === "fullbleed" ? "text-white/80" : "text-muted"} ${alignLeft || layout === "fullbleed" ? "" : "mx-auto"}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25, duration: 0.6 }}
      >
        {subheadline}
      </motion.p>
    </Positionable>
  ) : null;

  const cta = (wide: boolean) => (
    <Positionable id="cta" type="system-button" label="Teks Ajakan">
      <motion.div className={`relative ${wide ? "w-full" : "mt-12"}`} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }}>
        {config.animationsEnabled && layout === "center" && <span className="absolute inset-0 animate-ping-soft rounded-full bg-accent/40" />}
        <div className={`k-btn k-btn-accent k-btn-lg relative gap-3 text-xl md:text-2xl ${wide ? "w-full" : ""}`}>
          <Icon name="camera" className="h-7 w-7" />
          {config.idleStartText || "Sentuh layar untuk mulai"}
          {(alignLeft || wide) && <Icon name="arrow-right" className="h-6 w-6" />}
        </div>
      </motion.div>
    </Positionable>
  );

  const promo = (
    <AnimatePresence>
      {showPromo && config.promoText && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          className={`glass-panel absolute z-10 flex max-w-[90vw] items-center gap-3 rounded-full px-7 py-3.5 text-center text-sm font-semibold md:text-base ${
            layout === "fullbleed" ? "left-1/2 top-8 -translate-x-1/2 text-white" : alignLeft ? "bottom-8 left-[8vw]" : "bottom-8"
          }`}
        >
          <Icon name="sparkles" className="h-5 w-5 shrink-0 text-accent" />
          {config.promoText}
        </motion.div>
      )}
    </AnimatePresence>
  );

  const banner =
    config.idleBannerEnabled && config.idleBannerUrl ? (
      <img src={config.idleBannerUrl} alt="Promo banner" className="absolute bottom-6 right-6 z-10 max-h-28 max-w-xs rounded-2xl border border-fg/10 object-contain shadow-2xl" />
    ) : null;

  const cover = config.idleCoverUrl ? (
    config.idleCoverType === "video" ? (
      <video src={config.idleCoverUrl} autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-cover" />
    ) : (
      <img src={config.idleCoverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
    )
  ) : null;

  const rootClass = "kinetic-page relative flex h-full w-full cursor-pointer select-none overflow-hidden";
  const a11y = {
    onClick: start,
    role: "button",
    tabIndex: 0,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") start();
    },
    "aria-label": config.idleStartText,
  };

  // --- Rata kiri: big type on the left, the cover (or a soft accent shape) behind the right side ---
  if (layout === "left") {
    return (
      <ScreenLayoutBoundary screenKey="idle">
        <div {...a11y} className={`${rootClass} flex-col justify-center px-[8vw]`}>
          {cover && (
            <>
              {cover}
              <div className="absolute inset-0 bg-gradient-to-r from-canvas via-canvas/85 to-canvas/10" />
            </>
          )}
          {!cover && <div className="pointer-events-none absolute -right-[12vw] top-1/2 aspect-square w-[46vw] -translate-y-1/2 rounded-full border border-fg/10" />}
          {!cover && <div className="pointer-events-none absolute -right-[4vw] top-1/2 aspect-square w-[30vw] -translate-y-1/2 rounded-full bg-accent/10" />}
          <div className="relative z-10 flex max-w-[44rem] flex-col items-start text-left">
            {logo}
            {heading}
            {subheading}
            {cta(false)}
          </div>
          {promo}
          {banner}
        </div>
      </ScreenLayoutBoundary>
    );
  }

  // --- Layar penuh: the cover fills the screen, copy sits at the bottom with a full-width start bar ---
  if (layout === "fullbleed") {
    return (
      <ScreenLayoutBoundary screenKey="idle">
        <div {...a11y} className={`${rootClass} flex-col justify-end`}>
          {cover ?? <div className="absolute inset-0 bg-[radial-gradient(60rem_40rem_at_70%_10%,color-mix(in_srgb,var(--accent)_55%,transparent),transparent_70%),linear-gradient(180deg,var(--kiosk-background),color-mix(in_srgb,var(--accent)_18%,var(--kiosk-background)))]" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/35" />
          <div className="relative z-10 flex flex-col items-start gap-1 px-[6vw] pb-[7vh] text-left text-white">
            {logo}
            {heading}
            {subheading}
            <div className="mt-8 w-full max-w-3xl">{cta(true)}</div>
          </div>
          {promo}
          {banner}
        </div>
      </ScreenLayoutBoundary>
    );
  }

  // --- Terbelah: a visual half and a copy half (stacked in portrait) ---
  if (layout === "split") {
    return (
      <ScreenLayoutBoundary screenKey="idle">
        <div {...a11y} className={`${rootClass} flex-col landscape:flex-row`}>
          <div className="relative flex min-h-0 flex-[1.05] items-center justify-center overflow-hidden bg-accent">
            {cover ?? (
              <>
                <div className="absolute -left-[10%] -top-[12%] aspect-square h-[70%] rounded-full bg-white/20" />
                <div className="absolute -bottom-[14%] right-[-8%] aspect-square h-[60%] rounded-full bg-black/10" />
                <div className="relative flex aspect-square h-[46%] -rotate-6 items-center justify-center rounded-[2rem] border-[3px] border-fg bg-surface shadow-[8px_8px_0_var(--kiosk-text)]">
                  <Icon name="camera" className="h-1/2 w-1/2 text-accent" />
                </div>
              </>
            )}
          </div>
          <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-8 text-center">
            {logo}
            {heading}
            {subheading}
            {cta(false)}
          </div>
          {promo}
          {banner}
        </div>
      </ScreenLayoutBoundary>
    );
  }

  // --- Tengah (default) ---
  return (
    <ScreenLayoutBoundary screenKey="idle">
      <div {...a11y} className={`${rootClass} flex-col items-center justify-center px-6`}>
        {/* Cover photo/video (optional) with a soft wash so text always reads */}
        {cover}
        {cover && <div className="absolute inset-0 bg-gradient-to-b from-canvas/85 via-canvas/45 to-canvas/90" />}

        {/* Drifting pastel orbs — the same look as the website hero */}
        {!cover && config.backgroundGradientEnabled && (
          <>
            <div className={`pointer-events-none absolute -right-24 -top-24 h-[34rem] w-[34rem] rounded-full bg-accent/25 blur-3xl ${config.animationsEnabled ? "k-drift" : ""}`} />
            <div className={`pointer-events-none absolute -bottom-32 -left-24 h-[30rem] w-[30rem] rounded-full bg-[#ffc8de]/50 blur-3xl ${config.animationsEnabled ? "k-drift" : ""}`} style={{ animationDelay: "-5s" }} />
          </>
        )}

        <div className="relative z-10 flex flex-col items-center text-center">
          {logo}
          {heading}
          {subheading}
          {cta(false)}
        </div>
        {promo}
        {banner}
      </div>
    </ScreenLayoutBoundary>
  );
}
