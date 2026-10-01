import { useLocation } from "wouter";
import { useBoothConfig } from "@/lib/boothConfigStore";
import { STEP_DEFS, LOCKED_STEPS, getNextRoute, type KioskStepKey } from "@/lib/kioskFlow";
import { ScreenLayoutBoundary } from "@/lib/screenBuilder/ScreenLayoutBoundary";
import Positionable from "@/components/Positionable";
import { KioskPage, ScreenTitle } from "@/components/kiosk/KioskUI";
import { Icon } from "@/components/kiosk/Icons";

const ICONS: Record<KioskStepKey, string> = {
  tutorial: "info", packages: "sparkles", orientation: "mirror", payment: "qr", frame: "frame", capture: "camera", preview: "smile", result: "download",
};

export default function Tutorial() {
  const [, navigate] = useLocation();
  const config = useBoothConfig((s) => s.config);

  // Derived from the tenant's actual configured flow, not a fixed list — only enabled steps in their real order
  // show up, so the tutorial never promises a screen the customer won't actually see.
  const order = config.kioskFlow.order as KioskStepKey[];
  const steps = order.filter((key) => key !== "tutorial" && (LOCKED_STEPS.includes(key) || config.kioskFlow.enabled[key] !== false));

  return (
    <ScreenLayoutBoundary screenKey="tutorial">
      <KioskPage className="pt-16">
        <ScreenTitle eyebrow="Panduan singkat" title="Cara menggunakan" subtitle="Ikuti langkah berikut. Kiosk akan memandu sampai fotomu siap dibawa pulang." />

        <Positionable id="step-list" type="system-steplist" label="Daftar Langkah">
          <ol className="grid w-full max-w-5xl grid-cols-2 gap-4 md:grid-cols-4">
            {steps.map((key, index) => (
              <li key={key} className="glass-panel flex flex-col items-center gap-2 rounded-3xl p-6 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/12 text-accent">
                  <Icon name={ICONS[key]} className="h-6 w-6" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-accent">Langkah {index + 1}</span>
                <p className="font-display text-lg font-semibold">{STEP_DEFS[key].label}</p>
                <p className="text-xs text-muted">{STEP_DEFS[key].hint}</p>
              </li>
            ))}
          </ol>
        </Positionable>

        <Positionable id="next-button" type="system-button" label="Tombol Lanjut">
          <button type="button" onClick={() => navigate(getNextRoute("tutorial", config.kioskFlow))} className="k-btn k-btn-accent k-btn-lg">
            Mulai sekarang
            <Icon name="arrow-right" className="h-5 w-5" />
          </button>
        </Positionable>
      </KioskPage>
    </ScreenLayoutBoundary>
  );
}
