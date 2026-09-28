import { useLocation } from "wouter";
import { useBoothConfig } from "@/lib/boothConfigStore";
import { STEP_DEFS, LOCKED_STEPS, getNextRoute, type KioskStepKey } from "@/lib/kioskFlow";
import { ScreenLayoutBoundary } from "@/lib/screenBuilder/ScreenLayoutBoundary";
import Positionable from "@/components/Positionable";

export default function Tutorial() {
  const [, navigate] = useLocation();
  const config = useBoothConfig((s) => s.config);

  // Derived from the tenant's actual configured flow (Fase 4 kioskFlow), not a
  // fixed list — only enabled steps in their real order show up here, so the
  // tutorial never promises a screen the customer won't actually see.
  const order = config.kioskFlow.order as KioskStepKey[];
  const steps = order.filter((key) => LOCKED_STEPS.includes(key) || config.kioskFlow.enabled[key] !== false);

  return (
    <ScreenLayoutBoundary screenKey="tutorial">
      <div className="kinetic-page relative flex h-full flex-col items-center justify-center gap-10 px-8 md:px-16">
        <Positionable id="heading" type="text" label="Judul">
          <div className="kinetic-heading text-center">
            <span className="eyebrow">CARA MENGGUNAKAN</span>
            <h1 className="font-display text-5xl font-bold md:text-7xl">Cara menggunakan</h1>
          </div>
        </Positionable>

        <Positionable id="subheading" type="text" label="Subjudul">
          <p className="text-center text-[var(--kiosk-muted)]">Ikuti langkah berikut — kiosk akan memandu sampai foto siap dicetak.</p>
        </Positionable>

        <Positionable id="step-list" type="system-steplist" label="Daftar Langkah">
          <div className="grid w-full max-w-4xl grid-cols-2 gap-4 md:grid-cols-3">
            {steps.map((key, index) => (
              <div key={key} className="glass-panel rounded-2xl border-white/10 p-5 text-center">
                <p className="font-display text-3xl font-bold text-accent">{index + 1}</p>
                <p className="mt-2 font-semibold">{STEP_DEFS[key].label}</p>
                <p className="mt-1 text-xs text-[var(--kiosk-muted)]">{STEP_DEFS[key].hint}</p>
              </div>
            ))}
          </div>
        </Positionable>

        <Positionable id="next-button" type="system-button" label="Tombol Lanjut">
          <button onClick={() => navigate(getNextRoute("tutorial", config.kioskFlow))} className="kinetic-button rounded-2xl bg-accent px-10 py-4 font-display text-xl font-semibold">
            Lanjut
          </button>
        </Positionable>
      </div>
    </ScreenLayoutBoundary>
  );
}
