import { useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useKioskSession } from "@/lib/sessionStore";
import { useBoothConfig } from "@/lib/boothConfigStore";
import { getNextRoute, getPreviousRoute } from "@/lib/kioskFlow";
import { ScreenLayoutBoundary } from "@/lib/screenBuilder/ScreenLayoutBoundary";
import { usePositionableContext } from "@/lib/screenBuilder/PositionableContext";
import { BackButton, KioskPage, ScreenTitle } from "@/components/kiosk/KioskUI";
import { Icon } from "@/components/kiosk/Icons";

// "Orientasi" / "Live view" was jargon customers didn't understand. This step is really one question:
// do you want the camera to behave like a mirror, or show the picture as everyone else sees it?
const OPTIONS = [
  {
    mirror: true,
    title: "Seperti cermin",
    badge: "Disarankan",
    desc: "Layar menampilkan dirimu seperti berkaca. Paling natural untuk berpose.",
    sample: "scale-x-[-1]",
  },
  {
    mirror: false,
    title: "Normal",
    badge: null,
    desc: "Layar menampilkan dirimu persis seperti yang dilihat orang lain (tulisan tidak terbalik).",
    sample: "",
  },
];

export default function PilihOrientasi() {
  const [, navigate] = useLocation();
  const setMirrorLiveView = useKioskSession((s) => s.setMirrorLiveView);
  const selectedPackage = useKioskSession((s) => s.selectedPackage);
  const config = useBoothConfig((s) => s.config);
  // Mounted inside the WYSIWYG editor with no real session in progress, so selectedPackage is always null
  // there — skip the guard in that case instead of bouncing the admin straight back out of the editor.
  const positionable = usePositionableContext();
  const mustGoBack = !selectedPackage && !positionable?.editMode;

  useEffect(() => {
    if (mustGoBack) navigate("/paket");
  }, [mustGoBack, navigate]);
  if (mustGoBack) return null;

  const choose = (mirror: boolean) => {
    setMirrorLiveView(mirror);
    navigate(getNextRoute("orientation", config.kioskFlow));
  };

  return (
    <ScreenLayoutBoundary screenKey="orientation">
      <KioskPage step="orientation">
        <ScreenTitle title={config.orientationHeadline || "Tampilan Kamera"} subtitle="Pilih cara layar menampilkan dirimu saat berfoto." hint="Ketuk salah satu pilihan di bawah" />

        <div className="flex flex-wrap justify-center gap-6">
          {OPTIONS.map((opt, i) => (
            <motion.button
              key={opt.title}
              type="button"
              onClick={() => choose(opt.mirror)}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.1, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ y: -6 }}
              whileTap={{ scale: 0.97 }}
              className="glass-panel group relative flex w-[clamp(15rem,30vw,20rem)] flex-col items-center gap-5 rounded-[2rem] p-7 text-center hover:border-accent/60"
            >
              {opt.badge && <span className="k-chip k-chip-accent absolute -top-3 left-1/2 -translate-x-1/2">{opt.badge}</span>}
              {/* A tiny live demo of the difference: a person with a "label" held up, flipped or not */}
              <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-accent/15 to-fg/5">
                <div className={`flex flex-col items-center gap-1 ${opt.sample}`}>
                  <Icon name="user" className="h-14 w-14 text-fg/70" strokeWidth={1.4} />
                  <span className="rounded-md bg-fg px-2.5 py-0.5 font-display text-sm font-semibold text-canvas">STUDIODO</span>
                </div>
              </div>
              <div>
                <p className="font-display text-2xl font-semibold">{opt.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">{opt.desc}</p>
              </div>
              <span className="k-btn k-btn-accent mt-auto w-full group-hover:brightness-110">Pilih</span>
            </motion.button>
          ))}
        </div>

        <BackButton onClick={() => navigate(getPreviousRoute("orientation", config.kioskFlow))} label="Kembali ke pilih paket" />
      </KioskPage>
    </ScreenLayoutBoundary>
  );
}
