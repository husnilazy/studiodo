import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useKioskSession } from "@/lib/sessionStore";

export default function PilihOrientasi() {
  const [, navigate] = useLocation();
  const setMirrorLiveView = useKioskSession((s) => s.setMirrorLiveView);
  const selectedPackage = useKioskSession((s) => s.selectedPackage);

  if (!selectedPackage) {
    navigate("/paket");
    return null;
  }

  const choose = (mirror: boolean) => {
    setMirrorLiveView(mirror);
    navigate("/bayar");
  };

  return (
    <div className="kinetic-page flex h-full flex-col items-center justify-center gap-10 px-6">
      <motion.div
        className="text-center"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <span className="eyebrow">02 / LIVE VIEW</span>
        <h2 className="kinetic-heading mt-3 font-display text-5xl font-bold md:text-7xl">Atur Live View</h2>
        <p className="mt-3 text-[var(--kiosk-muted)]">Pilih tampilan kamera seperti cermin atau normal.</p>
      </motion.div>

      <div className="flex flex-wrap justify-center gap-6">
        {[{ mirror: true, label: "Mirror", sub: "Seperti kaca cermin", icon: "↔", desc: "Gerakan di layar terasa natural seperti melihat cermin." }, { mirror: false, label: "Normal", sub: "Tampilan kamera asli", icon: "▣", desc: "Tampilkan live view tanpa membalik gambar." }].map((opt, i) => (
          <motion.button
            key={opt.label}
            onClick={() => choose(opt.mirror)}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.1, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ y: -6 }}
            whileTap={{ scale: 0.97 }}
            className="glass-panel group flex w-56 flex-col items-center gap-5 rounded-[2rem] border border-white/10 p-8 text-left transition hover:border-accent/60 hover:shadow-xl hover:shadow-accent/10"
          >
            {/* Frame shape preview */}
            <div className="relative flex items-center justify-center">
              <div className="h-40 w-56 rounded-xl border-2 border-white/25 bg-white/5 transition group-hover:border-accent/60" />
              <span className="absolute text-2xl opacity-30 group-hover:opacity-60 transition">
                {opt.icon}
              </span>
            </div>

            <div className="text-center">
              <p className="font-display text-2xl font-semibold">{opt.label}</p>
              <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-accent">{opt.sub}</p>
              <p className="mt-3 text-sm leading-relaxed text-white/45">{opt.desc}</p>
            </div>

            <div className="w-full rounded-xl bg-accent/10 px-4 py-2 text-center text-sm font-semibold text-accent opacity-0 transition group-hover:opacity-100">
              Pilih →
            </div>
          </motion.button>
        ))}
      </div>

      <motion.button
        onClick={() => navigate("/paket")}
        className="text-white/40 transition hover:text-white/70"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        ← Kembali ke pilih paket
      </motion.button>
    </div>
  );
}
