import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { useKioskSession, type Package } from "@/lib/sessionStore";
import { cachePackages, isBrowserOnline, readCachedPackages } from "@/lib/offlineStore";
import { isEventActive, useBoothConfig } from "@/lib/boothConfigStore";
import { getNextRoute } from "@/lib/kioskFlow";
import { ScreenLayoutBoundary } from "@/lib/screenBuilder/ScreenLayoutBoundary";
import { usePositionableContext } from "@/lib/screenBuilder/PositionableContext";
import Positionable from "@/components/Positionable";

const EVENT_PACKAGE_ID = "event-session";

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
        <div className="absolute -top-3 left-8 z-10 whitespace-nowrap rounded-full border border-accent/40 bg-[var(--kiosk-background)] px-3 py-1 text-[0.625rem] font-bold uppercase tracking-[0.15em] text-accent">
          ⭐ Paling Populer
        </div>
      )}

      {pkg.thumbnailUrl && (
        <div className="-mx-8 -mt-8 mb-5 h-36 overflow-hidden rounded-t-[2rem]">
          <img src={pkg.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        </div>
      )}

      {/* Header */}
      <h3 className="font-display text-2xl font-semibold">{pkg.name}</h3>
      {pkg.description && <p className="mt-1 text-sm text-white/50">{pkg.description}</p>}

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
                  <p className="mb-2 text-[0.625rem] uppercase tracking-[0.16em] text-white/35">Pilih extra cetak (opsional)</p>
                  {pkg.extraPrints?.map((extra) => {
                    const checked = selectedExtras.includes(extra.id);
                    return (
                      <label key={extra.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm hover:border-white/25 transition">
                        <div className="flex items-center gap-2">
                          <div className={`h-4 w-4 rounded-md border-2 flex items-center justify-center transition ${checked ? "border-accent bg-accent" : "border-white/30"}`}>
                            {checked && <span className="text-[0.625rem] text-white font-bold">✓</span>}
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
  const { selectedPackage, setPackage, setSelectedExtras } = useKioskSession();
  const boothConfig = useBoothConfig((state) => state.config);
  const offlineModeEnabled = boothConfig.offlineModeEnabled;
  const eventActive = isEventActive(boothConfig);
  // Mounted inside the WYSIWYG editor (ScreenBuilder.tsx) too — if this tenant
  // happens to have an event live, the auto-redirect below would otherwise bounce
  // the admin straight out of the editor the moment they open it.
  const positionable = usePositionableContext();

  useEffect(() => {
    if (positionable?.editMode || !eventActive || selectedPackage?.id === EVENT_PACKAGE_ID) return;
    const eventPhotoCount = boothConfig.eventMaxPhotosPerSession > 0
      ? boothConfig.eventMaxPhotosPerSession
      : Math.max(1, boothConfig.maxPhotosPerSession);
    setPackage({
      id: EVENT_PACKAGE_ID,
      name: boothConfig.eventName || "Event Session",
      price: "0",
      photoCount: eventPhotoCount,
      hasGif: boothConfig.eventHasGif,
      hasVideo: boothConfig.eventHasVideo,
      extraPrints: [],
    });
    setSelectedExtras([]);
    navigate(getNextRoute("packages", boothConfig.kioskFlow));
  }, [boothConfig, eventActive, navigate, selectedPackage, setPackage, setSelectedExtras]);

  useEffect(() => {
    let cancelled = false;

    // Stale-while-revalidate: a kiosk that's already loaded packages once has
    // a perfectly good copy sitting in localStorage — show that INSTANTLY
    // (no spinner) instead of always blocking on a fresh network round-trip
    // first. The real fetch still runs underneath and quietly replaces it
    // once it resolves, so pricing/package edits from admin still show up
    // without a restart.
    const cachedFirst = readCachedPackages<Package>();
    if (cachedFirst.length > 0) {
      setPackages(cachedFirst);
      setLoading(false);
    }

    // First-ever load (nothing cached yet): the dev DB's cold-start latency
    // (and any venue wifi hiccup in production) can make this take well past
    // what a customer standing at a kiosk will wait for — the old code just
    // spun forever until the fetch settled either way. Give it a grace
    // window, then fall back to cache if one shows up in the meantime.
    const timeoutId = window.setTimeout(() => {
      if (cancelled || cachedFirst.length > 0) return;
      const cached = readCachedPackages<Package>();
      if (cached.length > 0) {
        setPackages(cached);
        setLoading(false);
      }
    }, 6000);

    api.getPackages()
      .then((result) => {
        if (cancelled) return;
        setPackages(result ?? []);
        cachePackages(result ?? []);
      })
      .catch(() => {
        if (!cancelled && cachedFirst.length === 0) setPackages(readCachedPackages<Package>());
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  const choose = (pkg: Package, extraIds: string[]) => {
    setPackage(pkg);
    const selected = (pkg.extraPrints ?? []).filter((extra) => extraIds.includes(extra.id));
    setSelectedExtras(selected);
    navigate(getNextRoute("packages", boothConfig.kioskFlow));
  };

  return (
    <ScreenLayoutBoundary screenKey="packages">
    <div className="kinetic-page relative flex h-full flex-col items-center justify-center gap-10 px-8 md:px-16">
      <Positionable id="heading" type="text" label="Judul">
        <div className="kinetic-heading text-center">
          <span className="eyebrow">01 / SELECT YOUR MOMENT</span>
          <h1 className="font-display text-5xl font-bold md:text-7xl">Pilih Paket</h1>
          <p className="mt-3 text-[var(--kiosk-muted)]">Pilih ritme yang paling cocok untuk cerita kamu.</p>
        </div>
      </Positionable>

      {eventActive && (
          <div className="rounded-2xl border border-emerald-300/30 bg-emerald-500/10 px-5 py-3 text-center text-sm text-emerald-100">
            <span className="font-semibold">{boothConfig.eventName || "Event aktif"}</span> · {boothConfig.eventFreeEntry ? "Semua paket gratis di event ini" : "Promo event sedang berlaku"}
          </div>
      )}

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

      {!eventActive && <div className="flex w-full max-w-5xl flex-wrap justify-center gap-6">
          {packages.map((pkg, i) => (
            <div key={pkg.id} className="w-full sm:w-[calc(50%-0.75rem)] lg:w-[calc(33.333%-1rem)]">
              <PackageCard pkg={pkg} index={i} onChoose={choose} />
            </div>
          ))}
        </div>}

      <Positionable id="back-button" type="system-button" label="Tombol Kembali">
        <button onClick={() => navigate("/")} className="text-white/40 hover:text-white/70">
          ← Kembali
        </button>
      </Positionable>
    </div>
    </ScreenLayoutBoundary>
  );
}
