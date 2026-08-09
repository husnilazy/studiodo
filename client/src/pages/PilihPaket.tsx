import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { useKioskSession, type Package } from "@/lib/sessionStore";

function formatIDR(v: string | number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    Number(v)
  );
}

export default function PilihPaket() {
  const [, navigate] = useLocation();
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const { setPackage, setSelectedExtras } = useKioskSession();
  const [extrasByPackage, setExtrasByPackage] = useState<Record<string, string[]>>({});

  useEffect(() => {
    api
      .getPackages()
      .then(setPackages)
      .catch(() => setPackages([]))
      .finally(() => setLoading(false));
  }, []);

  const choose = (pkg: Package) => {
    setPackage(pkg);
    const selected = (pkg.extraPrints ?? []).filter((extra) => extrasByPackage[pkg.id]?.includes(extra.id));
    setSelectedExtras(selected);
    navigate("/orientasi");
  };

  return (
    <div className="kinetic-page flex h-full flex-col items-center justify-center gap-10 px-8 md:px-16">
      <div className="kinetic-heading text-center"><span className="eyebrow">01 / SELECT YOUR MOMENT</span><h2 className="font-display text-5xl font-bold md:text-7xl">Pilih Paket</h2><p className="mt-3 text-[var(--kiosk-muted)]">Pilih ritme yang paling cocok untuk cerita kamu.</p></div>

      {loading && <p className="text-white/50">Memuat paket...</p>}
      {!loading && packages.length === 0 && (
        <p className="text-white/50">Belum ada paket aktif. Silakan hubungi admin.</p>
      )}

      <div className="grid w-full max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {packages.map((pkg, i) => (
          <motion.div
            key={pkg.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="glass-panel kinetic-card-hover rounded-[2rem] p-8 text-left transition hover:border-accent/50"
          >
            <h3 className="font-display text-2xl font-semibold">{pkg.name}</h3>
            <p className="mt-2 text-white/50">{pkg.photoCount} foto{pkg.hasGif ? " + GIF" : ""}{pkg.hasVideo ? " + Video" : ""}</p>
            <p className="mt-6 text-3xl font-bold text-accent">{formatIDR(pkg.price)}</p>
            {(pkg.extraPrints ?? []).length > 0 && (
              <div className="mt-5 space-y-2 border-t border-white/10 pt-4">
                <p className="text-xs uppercase tracking-wider text-white/40">Extra cetak</p>
                {pkg.extraPrints?.map((extra) => {
                  const checked = extrasByPackage[pkg.id]?.includes(extra.id) ?? false;
                  return (
                    <label key={extra.id} className="flex items-center justify-between gap-3 text-sm text-white/70">
                      <span>{extra.name} <span className="text-accent">+{formatIDR(extra.price)}</span></span>
                      <input type="checkbox" checked={checked} onChange={() => setExtrasByPackage((state) => ({
                        ...state,
                        [pkg.id]: checked ? (state[pkg.id] ?? []).filter((id) => id !== extra.id) : [...(state[pkg.id] ?? []), extra.id],
                      }))} />
                    </label>
                  );
                })}
              </div>
            )}
            <button onClick={() => choose(pkg)} className="kinetic-button mt-6 w-full rounded-2xl bg-accent px-4 py-3 text-center font-semibold">
              Pilih paket
            </button>
          </motion.div>
        ))}
      </div>

      <button onClick={() => navigate("/")} className="text-white/40 hover:text-white/70">
        ← Kembali
      </button>
    </div>
  );
}
