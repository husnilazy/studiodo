import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { useKioskSession, type Package } from "@/lib/sessionStore";
import { cachePackages, isBrowserOnline, readCachedPackages } from "@/lib/offlineStore";
import { useBoothConfig } from "@/lib/boothConfigStore";

function formatIDR(v: string | number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    Number(v)
  );
}

function FeatureChip({ icon, label }: { icon: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-1.5 text-xs text-white/70">
      <span>{icon}</span> {label}
    </span>
  );
}

function PackageCard({ pkg, index, onChoose }: { pkg: Package; index: number; onChoose: (pkg: Package, extras: string[]) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const isFeatured = index === 0;

  const toggleExtra = (id: string) =>
    setSelectedExtras((prev) => prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4 }}
      className={`glass-panel kinetic-card-hover relative flex flex-col rounded-[2rem] p-8 text-left transition hover:border-accent/50 ${isFeatured ? "border-accent/30 shadow-xl shadow-accent/10" : ""}`}
    >
      {isFeatured && (
        <div className="absolute -top-3 left-6 rounded-full border border-accent/40 bg-accent/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-accent">
          ⭐ Paling Populer
        </div>
      )}

      {/* Header */}
      <h3 className="font-display text-2xl font-semibold">{pkg.name}</h3>

      {/* Quick summary chips */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <FeatureChip icon="📷" label={`${pkg.photoCount} foto`} />
        {pkg.hasGif && <FeatureChip icon="🎞️" label="GIF" />}
        {pkg.hasVideo && <FeatureChip icon="🎬" label="Video" />}
        {(pkg.extraPrints ?? []).length > 0 && <FeatureChip icon="🖨️" label="Extra cetak" />}
      </div>

      {/* Price */}
      <p className="mt-5 text-4xl font-bold text-accent">{formatIDR(pkg.price)}</p>
      <p className="mt-1 text-xs text-white/35">sekali bayar, semua sudah termasuk</p>

      {/* Expandable extras */}
      {(pkg.extraPrints ?? []).length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl border border-white/10 px-3 py-2 text-xs text-white/50 hover:border-white/25 hover:text-white/80 transition"
          >
            <span>{expanded ? "Sembunyikan" : "Lihat"} pilihan tambahan</span>
            <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }} className="text-sm">▾</motion.span>
          </button>
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="overflow-hidden"
              >
                <div className="mt-3 space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="mb-2 text-[10px] uppercase tracking-[0.16em] text-white/35">Pilih extra cetak (opsional)</p>
                  {pkg.extraPrints?.map((extra) => {
                    const checked = selectedExtras.includes(extra.id);
                    return (
                      <label key={extra.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm hover:border-white/25 transition">
                        <div className="flex items-center gap-2">
                          <div className={`h-4 w-4 rounded-md border-2 flex items-center justify-center transition ${checked ? "border-accent bg-accent" : "border-white/30"}`}>
                            {checked && <span className="text-[10px] text-white font-bold">✓</span>}
                          </div>
                          <span className="text-white/80">{extra.name}</span>
                        </div>
                        <span className="font-semibold text-accent">+{formatIDR(extra.price)}</span>
                        <input type="checkbox" className="hidden" checked={checked} onChange={() => toggleExtra(extra.id)} />
                      </label>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <button
        onClick={() => onChoose(pkg, selectedExtras)}
        className="kinetic-button mt-6 w-full rounded-2xl bg-accent px-4 py-3.5 text-center font-semibold shadow-lg shadow-accent/20"
      >
        Pilih paket ini →
      </button>
    </motion.div>
  );
}

export default function PilihPaket() {
  const [, navigate] = useLocation();
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const { setPackage, setSelectedExtras } = useKioskSession();
  const offlineModeEnabled = useBoothConfig((state) => state.config.offlineModeEnabled);

  useEffect(() => {
    api.getPackages()
      .then((result) => { setPackages(result); cachePackages(result); })
      .catch(() => setPackages(readCachedPackages<Package>()))
      .finally(() => setLoading(false));
  }, []);

  const choose = (pkg: Package, extraIds: string[]) => {
    setPackage(pkg);
    const selected = (pkg.extraPrints ?? []).filter((extra) => extraIds.includes(extra.id));
    setSelectedExtras(selected);
    navigate("/bayar");
  };

  return (
    <div className="kinetic-page flex h-full flex-col items-center justify-center gap-10 px-8 md:px-16">
      <div className="kinetic-heading text-center">
        <span className="eyebrow">01 / SELECT YOUR MOMENT</span>
        <h1 className="font-display text-5xl font-bold md:text-7xl">Pilih Paket</h1>
        <p className="mt-3 text-[var(--kiosk-muted)]">Pilih ritme yang paling cocok untuk cerita kamu.</p>
      </div>

      {loading && (
        <div className="flex items-center gap-3 text-white/50">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-accent" />
          <span>Memuat paket...</span>
        </div>
      )}
      {!loading && packages.length === 0 && (
        <p className="text-white/50">Belum ada paket aktif. Silakan hubungi admin.</p>
      )}

      {!isBrowserOnline() && offlineModeEnabled && (
        <p className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-center text-sm text-amber-100">
          Mode offline aktif. Paket terakhir tersimpan di perangkat.
        </p>
      )}

      <div className="grid w-full max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {packages.map((pkg, i) => (
          <PackageCard key={pkg.id} pkg={pkg} index={i} onChoose={choose} />
        ))}
      </div>

      <button onClick={() => navigate("/")} className="text-white/40 hover:text-white/70">
        ← Kembali
      </button>
    </div>
  );
}
