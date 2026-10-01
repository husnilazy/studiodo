import type { ReactNode } from "react";
import { motion } from "framer-motion";
import Positionable from "@/components/Positionable";
import { Icon } from "./Icons";
import StepProgress from "./StepProgress";
import type { KioskStepKey } from "@/lib/kioskFlow";

/**
 * Screen heading used by every flow screen. Wrapped in Positionable so the Screen Builder can still move it.
 * `hint` is a plain-language instruction for the customer ("Ketuk salah satu paket…") — the single biggest
 * thing missing before, when customers weren't sure what to do on a screen.
 */
export function ScreenTitle({ title, subtitle, hint, eyebrow }: { title: string; subtitle?: string; hint?: string; eyebrow?: string }) {
  return (
    <Positionable id="heading" type="text" label="Judul">
      <motion.div className="kinetic-heading text-center" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1 className="font-display text-4xl font-semibold tracking-tight md:text-6xl">{title}</h1>
        {subtitle && <p className="mx-auto mt-3 max-w-xl text-base text-muted md:text-lg">{subtitle}</p>}
        {hint && (
          <p className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full bg-accent/10 px-4 py-2 text-sm font-semibold text-accent">
            <Icon name="info" className="h-4 w-4" />
            {hint}
          </p>
        )}
      </motion.div>
    </Positionable>
  );
}

/** Big, obvious "back" button (the old one was a tiny grey text link that customers didn't see). */
export function BackButton({ onClick, label = "Kembali" }: { onClick: () => void; label?: string }) {
  return (
    <Positionable id="back-button" type="system-button" label="Tombol Kembali">
      <button type="button" onClick={onClick} className="k-btn">
        <Icon name="arrow-left" className="h-5 w-5" />
        {label}
      </button>
    </Positionable>
  );
}

/**
 * Consistent page frame. The step indicator stays pinned at the top while the content scrolls beneath it
 * (and is vertically centered whenever it fits), so long screens never push the "where am I" bar away.
 */
export function KioskPage({ children, step, className = "" }: { children: ReactNode; step?: KioskStepKey; className?: string }) {
  return (
    <div className="kinetic-page relative h-full min-h-0 w-full">
      {step && <StepProgress current={step} />}
      <div className="h-full overflow-y-auto overflow-x-hidden">
        <div className={`flex min-h-full flex-col items-center justify-center gap-8 px-6 pb-8 pt-24 md:px-12 ${className}`}>{children}</div>
      </div>
    </div>
  );
}

/** Small circular spinner in the accent color. */
export function Spinner({ className = "h-6 w-6" }: { className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-fg/15 border-t-accent ${className}`} role="status" aria-label="Memuat" />;
}
