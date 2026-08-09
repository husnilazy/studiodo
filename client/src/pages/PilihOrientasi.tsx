import { useLocation } from "wouter";
import { useKioskSession, type Orientation } from "@/lib/sessionStore";

const OPTIONS: { value: Orientation; label: string; sub: string }[] = [
  { value: "portrait", label: "Portrait", sub: "9:16 — vertikal" },
  { value: "landscape", label: "Landscape", sub: "16:9 — horizontal" },
];

export default function PilihOrientasi() {
  const [, navigate] = useLocation();
  const setOrientation = useKioskSession((s) => s.setOrientation);
  const selectedPackage = useKioskSession((s) => s.selectedPackage);

  if (!selectedPackage) {
    navigate("/paket");
    return null;
  }

  const choose = (o: Orientation) => {
    setOrientation(o);
    navigate("/bayar");
  };

  return (
    <div className="kinetic-page flex h-full flex-col items-center justify-center gap-10 px-6">
      <div className="text-center"><span className="eyebrow">02 / SET THE FRAME</span><h2 className="kinetic-heading font-display text-5xl font-bold md:text-7xl">Pilih Orientasi</h2><p className="mt-3 text-[var(--kiosk-muted)]">Tentukan cara momenmu tampil.</p></div>
      <div className="flex flex-wrap justify-center gap-5">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => choose(opt.value)}
            className="glass-panel group flex flex-col items-center gap-4 rounded-[2rem] p-8 transition hover:-translate-y-2 hover:border-accent"
          >
            <div
              className={`rounded-lg border-2 border-white/30 group-hover:border-accent ${
                opt.value === "portrait" ? "h-56 w-32" : "h-32 w-56"
              }`}
            />
            <span className="font-display text-2xl font-semibold">{opt.label}</span>
            <span className="text-white/50">{opt.sub}</span>
          </button>
        ))}
      </div>
      <button onClick={() => navigate("/paket")} className="text-white/40 hover:text-white/70">
        ← Kembali
      </button>
    </div>
  );
}
