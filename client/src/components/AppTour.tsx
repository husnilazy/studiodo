import { useEffect, useState } from "react";
import { markTourSeen, type TourStep } from "@/lib/tourSteps";

// A floating guide card (no dimmed backdrop, so the section it is talking about stays visible behind it). Each step opens the
// matching part of the dashboard through `onStep`. Steps live in lib/tourSteps.ts.
export default function AppTour({ steps, mode, tenantId, onStep, onClose }: {
  steps: TourStep[];
  mode: "welcome" | "whatsnew" | "replay";
  tenantId: string;
  onStep: (step: TourStep) => void;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const last = index === steps.length - 1;

  useEffect(() => { if (step) onStep(step); }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = () => { markTourSeen(tenantId); onClose(); };
  if (!step) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[1250] md:inset-x-auto md:bottom-6 md:right-6 md:w-[24rem]" role="dialog" aria-label="Tur aplikasi">
      <div className="rounded-3xl border border-accent/40 bg-surface p-5 shadow-[0_24px_70px_-18px_rgba(0,0,0,0.55)]">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-accent">{mode === "whatsnew" ? "Yang baru di STUDIODO" : "Tur aplikasi"} · {index + 1}/{steps.length}</p>
          <button type="button" onClick={finish} className="text-xs font-semibold text-fg/45 hover:text-fg">Lewati</button>
        </div>
        <h3 className="mt-2 font-display text-lg font-bold leading-snug">{step.title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-fg/65">{step.body}</p>
        <div className="mt-3 flex gap-1" aria-hidden>
          {steps.map((s, i) => <span key={s.id} className={`h-1 flex-1 rounded-full ${i <= index ? "bg-accent" : "bg-fg/10"}`} />)}
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" onClick={() => setIndex(index - 1)} disabled={index === 0} className="rounded-xl border border-fg/15 px-4 py-2 text-sm font-semibold text-fg/70 disabled:opacity-30">Kembali</button>
          <button type="button" onClick={last ? finish : () => setIndex(index + 1)} className="rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-white shadow-md shadow-accent/25">{last ? "Selesai" : "Lanjut"}</button>
        </div>
      </div>
    </div>
  );
}
