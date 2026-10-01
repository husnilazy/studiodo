import { useBoothConfig } from "@/lib/boothConfigStore";
import { LOCKED_STEPS, type KioskStepKey } from "@/lib/kioskFlow";
import { Icon } from "./Icons";

// Customer-facing names for the steps of the flow (the admin-facing labels in kioskFlow.ts are technical).
const CUSTOMER_LABEL: Record<KioskStepKey, string> = {
  tutorial: "Panduan",
  packages: "Paket",
  orientation: "Kamera",
  payment: "Bayar",
  frame: "Frame",
  capture: "Foto",
  preview: "Edit",
  result: "Selesai",
};

/** The steps this tenant's flow actually has, in order — a disabled step never shows up as a dot. */
export function useFlowSteps(): KioskStepKey[] {
  const flow = useBoothConfig((s) => s.config.kioskFlow);
  return (flow.order as KioskStepKey[]).filter((key) => key !== "tutorial" && (LOCKED_STEPS.includes(key) || flow.enabled[key] !== false));
}

/**
 * "Where am I?" indicator shown at the top of every flow screen. Customers kept asking how many steps were left;
 * this answers it at a glance. Done steps get a check, the current one is highlighted and labelled.
 */
export default function StepProgress({ current }: { current: KioskStepKey }) {
  const steps = useFlowSteps();
  const index = steps.indexOf(current);
  if (index === -1 || steps.length < 2) return null;

  return (
    <nav aria-label={`Langkah ${index + 1} dari ${steps.length}`} className="pointer-events-none absolute left-0 right-0 top-4 z-20 flex justify-center px-4">
      <ol className="glass-panel flex max-w-full items-center gap-1 rounded-full px-3 py-2 sm:gap-2 sm:px-4">
        {steps.map((key, i) => {
          const done = i < index;
          const active = i === index;
          return (
            <li key={key} className="flex items-center gap-1 sm:gap-2">
              <span
                className={`flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold transition-all ${
                  active ? "bg-accent text-on-accent shadow-md" : done ? "text-accent" : "text-muted"
                }`}
              >
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[0.65rem] ${active ? "bg-white/25" : done ? "bg-accent/15" : "bg-fg/8"}`}>
                  {done ? <Icon name="check" className="h-3 w-3" strokeWidth={3} /> : i + 1}
                </span>
                <span className={active ? "inline" : "hidden"}>{CUSTOMER_LABEL[key]}</span>
              </span>
              {i < steps.length - 1 && <span className={`h-px w-2 sm:w-4 ${i < index ? "bg-accent/50" : "bg-fg/15"}`} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
