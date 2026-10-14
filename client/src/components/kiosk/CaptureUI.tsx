import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "./Icons";
import type { KioskStyleId } from "@/lib/kioskStyles";

// Pieces of the photo-session screen that change with the kiosk style: the countdown, the shutter button and the
// "slots are full" side popup. Positioning lives on plain wrapper elements and framer-motion only animates an inner
// element — a motion element that also carries a CSS translate gets its transform overwritten while animating, which
// is what made the shutter button jump out of place when it was pressed.

const CONFETTI = ["#ff4d8d", "#ffd23f", "#2ee6a6", "#4cc9ff", "#ffffff", "#ff8c42"];

/** Full-view countdown number. Shown centered over the live view; each style has its own look. */
export function CountdownOverlay({ value, total, styleId }: { value: number | null; total: number; styleId: KioskStyleId }) {
  const progress = value === null ? 0 : value / Math.max(1, total);
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center overflow-hidden">
      <AnimatePresence mode="popLayout">
        {value !== null && (
          <motion.div key={value} className={styleId === "minimal" ? "absolute bottom-[26%] left-[8%]" : "relative flex items-center justify-center"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            {styleId === "minimal" && (
              <motion.span className="font-display text-[18vmin] font-extralight leading-none text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.45)]" initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 30 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
                {value}
              </motion.span>
            )}

            {(styleId === "default" || styleId === "fullcam") && (
              <motion.div className="relative flex items-center justify-center" initial={{ scale: 1.4, opacity: 0 }} animate={{ scale: 1, opacity: styleId === "fullcam" ? 0.7 : 0.9 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
                <svg viewBox="0 0 100 100" className="absolute h-[26vmin] w-[26vmin] -rotate-90">
                  <circle cx="50" cy="50" r="46" fill="rgba(0,0,0,0.06)" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
                  <circle cx="50" cy="50" r="46" fill="none" stroke={styleId === "fullcam" ? "#fff" : "var(--accent)"} strokeWidth="2.5" strokeLinecap="round" strokeDasharray="289" strokeDashoffset={289 * (1 - progress)} style={{ transition: "stroke-dashoffset 1s linear" }} />
                </svg>
                <span className="relative font-display text-[13vmin] font-light leading-none text-white/80 drop-shadow-lg">{value}</span>
              </motion.div>
            )}

            {styleId === "immersive" && (
              <>
                <motion.span className="absolute h-[24vmin] w-[24vmin] rounded-full border-2 border-accent" initial={{ scale: 0.5, opacity: 0.9 }} animate={{ scale: 1.7, opacity: 0 }} transition={{ duration: 1, ease: "easeOut" }} />
                <motion.span className="font-display text-[22vmin] font-bold leading-none text-white/85" style={{ textShadow: "0 0 60px var(--accent), 0 8px 40px rgba(0,0,0,0.6)" }} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.5, opacity: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
                  {value}
                </motion.span>
              </>
            )}

            {styleId === "playful" && (
              <motion.div className="flex h-[24vmin] w-[24vmin] items-center justify-center rounded-[2.5rem] border-[5px] border-fg bg-surface shadow-[10px_10px_0_var(--kiosk-text)]" initial={{ scale: 0.3, rotate: -18, opacity: 0 }} animate={{ scale: 1, rotate: value % 2 ? -5 : 5, opacity: 1 }} exit={{ scale: 0.5, rotate: 14, opacity: 0 }} transition={{ type: "spring", stiffness: 380, damping: 16 }}>
                <span className="font-display text-[16vmin] font-extrabold leading-none text-accent">{value}</span>
              </motion.div>
            )}

            {styleId === "fun" && (
              <>
                {CONFETTI.concat(CONFETTI).map((color, i) => {
                  const angle = (i / 12) * Math.PI * 2;
                  return (
                    <motion.span key={i} className="absolute h-[2vmin] w-[2vmin] rounded-full" style={{ background: color, border: "2px solid rgba(36,16,70,0.85)" }} initial={{ x: 0, y: 0, scale: 0, opacity: 1 }} animate={{ x: Math.cos(angle) * 22 + "vmin", y: Math.sin(angle) * 22 + "vmin", scale: [0, 1.3, 1], opacity: [1, 1, 0] }} transition={{ duration: 0.9, ease: "easeOut" }} />
                  );
                })}
                <motion.div className="relative flex h-[32vmin] w-[32vmin] items-center justify-center" initial={{ scale: 0.2, rotate: -40 }} animate={{ scale: [0.2, 1.18, 1], rotate: [-40, 8, 0] }} exit={{ scale: 1.8, opacity: 0 }} transition={{ duration: 0.55, ease: "easeOut" }}>
                  <motion.span className="absolute inset-0 bg-[#ffd23f]" style={{ clipPath: "polygon(50% 0%, 61% 14%, 79% 9%, 82% 28%, 98% 35%, 88% 51%, 98% 66%, 80% 72%, 79% 91%, 61% 86%, 50% 100%, 39% 86%, 21% 91%, 20% 72%, 2% 66%, 12% 51%, 2% 35%, 18% 28%, 21% 9%, 39% 14%)", filter: "drop-shadow(6px 6px 0 rgba(36,16,70,0.9))" }} animate={{ rotate: 360 }} transition={{ duration: 6, repeat: Infinity, ease: "linear" }} />
                  <span className="relative font-display text-[18vmin] font-extrabold leading-none text-accent" style={{ WebkitTextStroke: "0.8vmin #241046", paintOrder: "stroke fill" }}>{value}</span>
                </motion.div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface SlotFullPopupProps {
  show: boolean;
  /** "frame": the frame's slots are full but the package still allows more shots; "complete": every shot is taken. */
  kind: "frame" | "complete";
  slots: number;
  remaining: number;
  busy: boolean;
  busyLabel?: string;
  onContinue: () => void;
  onStay: () => void;
}

/** Side popup (not a centered dialog) that slides in once the frame/session is full and asks what to do next. */
export function SlotFullPopup({ show, kind, slots, remaining, busy, busyLabel, onContinue, onStay }: SlotFullPopupProps) {
  const firstRender = useRef(true);
  useEffect(() => { firstRender.current = false; }, []);
  return (
    <div className="pointer-events-none absolute right-3 top-1/2 z-40 w-[min(78vw,300px)] -translate-y-1/2 sm:right-5">
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ x: 120, opacity: 0, scale: 0.92 }}
            animate={{ x: 0, opacity: 1, scale: 1 }}
            exit={{ x: 120, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="pointer-events-auto glass-panel overflow-hidden rounded-3xl p-4 shadow-2xl"
            role="dialog"
            aria-label="Slot foto sudah penuh"
          >
            <div className="flex items-start gap-3">
              <motion.span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-on-accent" animate={{ rotate: [0, -10, 10, -6, 0], scale: [1, 1.08, 1] }} transition={{ duration: 1.1, repeat: Infinity, repeatDelay: 1.6 }}>
                <Icon name="check" className="h-6 w-6" strokeWidth={3} />
              </motion.span>
              <div className="min-w-0">
                <p className="font-display text-lg font-semibold leading-tight">{kind === "frame" ? "Slot foto sudah penuh" : "Semua foto sudah diambil"}</p>
                <p className="mt-1 text-sm leading-snug text-muted">
                  {kind === "frame"
                    ? `Ke-${slots} slot di frame sudah terisi. Mau lanjut ke hasil, atau selesaikan sesi foto dulu (sisa ${remaining})?`
                    : "Foto sudah lengkap. Lanjut ke hasil, atau ganti foto yang kurang bagus."}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <button type="button" onClick={onContinue} disabled={busy} className="k-btn k-btn-accent w-full disabled:cursor-wait disabled:opacity-60">
                {busy ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />{busyLabel ?? "Menyimpan…"}</> : <>Lanjut ke hasil <Icon name="arrow-right" className="h-5 w-5" /></>}
              </button>
              <button type="button" onClick={onStay} disabled={busy} className="k-btn w-full disabled:opacity-50">
                {kind === "frame" ? `Selesaikan sesi foto (sisa ${remaining})` : "Ganti foto dulu"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The shutter: a thin ring and a line camera icon, no filled disc. Position comes from the wrapper, so pressing it only
 *  scales the button in place. While counting down it only dims: the big number on the live view IS the countdown. */
export function ShutterButton({ onClick, disabled, countdown, focusing, styleId }: { onClick: () => void; disabled: boolean; countdown: number | null; focusing: boolean; styleId: KioskStyleId }) {
  const bold = styleId === "fun" || styleId === "playful";
  const counting = countdown !== null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center">
      <motion.button
        type="button"
        onClick={onClick}
        disabled={disabled}
        whileTap={{ scale: 0.9 }}
        animate={styleId === "fun" && !counting && !disabled ? { y: [0, -6, 0], rotate: [0, -3, 3, 0] } : { y: 0, rotate: 0 }}
        transition={styleId === "fun" && !counting ? { duration: 1.6, repeat: Infinity, repeatDelay: 0.6 } : { duration: 0.2 }}
        aria-label="Ambil foto"
        className={`pointer-events-auto flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-black/20 text-white backdrop-blur-sm transition-opacity disabled:cursor-not-allowed sm:h-20 sm:w-20 ${
          bold ? "border-[4px] border-white shadow-[0_4px_0_rgba(0,0,0,0.55)]" : "border-2 border-white/90"
        } ${counting ? "opacity-30" : disabled ? "opacity-50" : ""} ${focusing ? "animate-pulse" : ""}`}
      >
        <svg viewBox="0 0 24 24" className="h-8 w-8 drop-shadow sm:h-9 sm:w-9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" />
          <circle cx="12" cy="13" r="3.4" />
        </svg>
      </motion.button>
    </div>
  );
}

/** Small "Filter" pill that opens a transparent popover over the live view, so the camera keeps all the room. */
export function FilterControl({ filter, onPick, order, labels, css, open, setOpen, className = "" }: {
  filter: string; onPick: (key: string) => void; order: readonly string[]; labels: Record<string, string>; css: Record<string, string>;
  open: boolean; setOpen: (open: boolean) => void; className?: string;
}) {
  return (
    <div className={`pointer-events-none absolute z-40 flex flex-col items-start ${className}`}>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }} transition={{ duration: 0.16 }} className="pointer-events-auto mb-2 flex max-w-[min(92vw,34rem)] gap-1.5 overflow-x-auto rounded-2xl border border-white/20 bg-black/35 p-2 backdrop-blur-xl">
            {order.map((key) => (
              <button key={key} type="button" onClick={() => onPick(key)} className={`min-w-[3.6rem] shrink-0 rounded-xl border p-1 text-center text-white transition ${filter === key ? "border-white bg-white/20" : "border-white/15 bg-white/5"}`}>
                <div className="h-6 rounded-lg bg-white/30" style={{ filter: css[key] }} />
                <span className="mt-1 block text-[0.5625rem] font-semibold">{labels[key]}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/25 bg-black/35 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur-md">
        <Icon name="sparkles" className="h-4 w-4" /> Filter{filter !== "normal" ? ` · ${labels[filter]}` : ""}
      </button>
    </div>
  );
}
