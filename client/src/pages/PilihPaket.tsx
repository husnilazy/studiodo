import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { useKioskSession, type Package } from "@/lib/sessionStore";
import { cachePackages, isBrowserOnline, readCachedPackages } from "@/lib/offlineStore";
import { isEventActive, useBoothConfig } from "@/lib/boothConfigStore";
import { getNextRoute, getPreviousRoute } from "@/lib/kioskFlow";
import { ScreenLayoutBoundary } from "@/lib/screenBuilder/ScreenLayoutBoundary";
import { usePositionableContext } from "@/lib/screenBuilder/PositionableContext";
import { BackButton, KioskPage, ScreenTitle, Spinner } from "@/components/kiosk/KioskUI";
import { Icon } from "@/components/kiosk/Icons";

const EVENT_PACKAGE_ID = "event-session";

function formatIDR(v: string | number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(v));
}

function Feature({ icon, label }: { icon: string; label: string }) {
  return (
    <li className="flex items-center gap-3 text-sm md:text-base">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent">
        <Icon name={icon} className="h-4 w-4" />
      </span>
      {label}
    </li>
  );
}

function PackageCard({ pkg, index, onChoose }: { pkg: Package; index: number; onChoose: (pkg: Package, extras: string[]) => void }) {
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const extras = pkg.extraPrints ?? [];
  const extrasTotal = extras.filter((e) => selectedExtras.includes(e.id)).reduce((sum, e) => sum + Number(e.price), 0);
  const total = Number(pkg.price) + extrasTotal;
  const isFree = Number(pkg.price) === 0;

  const toggleExtra = (id: string) => setSelectedExtras((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]));

  return (
    <motion.article
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="glass-panel kinetic-card-hover relative flex h-full flex-col overflow-hidden rounded-[2rem] text-left"
    >
      {pkg.thumbnailUrl && (
        <div className="h-36 shrink-0 overflow-hidden">
          <img src={pkg.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        </div>
      )}
      <div className="flex flex-1 flex-col p-7 md:p-8">
        <h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">{pkg.name}</h2>
        {pkg.description && <p className="mt-1.5 text-sm text-muted md:text-base">{pkg.description}</p>}

        <p className="mt-5 font-display text-3xl font-semibold tracking-tight text-accent md:text-4xl">{isFree ? "Gratis" : formatIDR(pkg.price)}</p>
        <p className="mt-1 text-xs text-muted">sekali bayar, semua sudah termasuk</p>

        <ul className="mt-6 flex flex-col gap-3">
          <Feature icon="camera" label={`${pkg.photoCount} foto`} />
          {pkg.hasGif && <Feature icon="gif" label="GIF animasi" />}
          {pkg.hasVideo && <Feature icon="video" label="Video singkat" />}
          {pkg.hasStopMotion && <Feature icon="video" label="Video stop motion" />}
          <Feature icon="smile" label="Filter & stiker seru" />
          <Feature icon="download" label="Unduh lewat QR code" />
        </ul>

        {/* Extras are shown up front (they used to hide behind a collapsed row that customers never opened) */}
        {extras.length > 0 && (
          <div className="mt-6 rounded-2xl border border-fg/10 bg-fg/5 p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">Tambahan (opsional)</p>
            <div className="flex flex-col gap-2">
              {extras.map((extra) => {
                const checked = selectedExtras.includes(extra.id);
                return (
                  <button
                    key={extra.id}
                    type="button"
                    onClick={() => toggleExtra(extra.id)}
                    aria-pressed={checked}
                    className={`flex min-h-[3rem] items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition ${checked ? "border-accent bg-accent/10" : "border-fg/10 bg-canvas/50 hover:border-fg/25"}`}
                  >
                    <span className="flex items-center gap-3">
                      <span className={`flex h-5 w-5 items-center justify-center rounded-md border-2 ${checked ? "border-accent bg-accent text-on-accent" : "border-fg/30"}`}>
                        {checked && <Icon name="check" className="h-3 w-3" strokeWidth={3.5} />}
                      </span>
                      {extra.name}
                    </span>
                    <span className="font-semibold text-accent">+{formatIDR(extra.price)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-auto pt-7"><button type="button" onClick={() => onChoose(pkg, selectedExtras)} className="k-btn k-btn-accent k-btn-lg w-full">
          Pilih paket ini
          {extrasTotal > 0 && <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-sm">{formatIDR(total)}</span>}
          <Icon name="arrow-right" className="h-5 w-5" />
        </button></div>
      </div>
    </motion.article>
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
  // Mounted inside the WYSIWYG editor (ScreenBuilder.tsx) too — if this tenant has an event live, the
  // auto-redirect below would otherwise bounce the admin straight out of the editor.
  const positionable = usePositionableContext();

  useEffect(() => {
    if (positionable?.editMode || !eventActive || selectedPackage?.id === EVENT_PACKAGE_ID) return;
    const eventPhotoCount = boothConfig.eventMaxPhotosPerSession > 0 ? boothConfig.eventMaxPhotosPerSession : Math.max(1, boothConfig.maxPhotosPerSession);
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
  }, [boothConfig, eventActive, navigate, selectedPackage, setPackage, setSelectedExtras, positionable?.editMode]);

  useEffect(() => {
    let cancelled = false;

    // Stale-while-revalidate: show the cached copy instantly, refresh quietly underneath.
    const cachedFirst = readCachedPackages<Package>();
    if (cachedFirst.length > 0) {
      setPackages(cachedFirst);
      setLoading(false);
    }

    // First-ever load: a slow DB/venue wifi can take far longer than a customer will wait — fall back to cache.
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
    setSelectedExtras((pkg.extraPrints ?? []).filter((extra) => extraIds.includes(extra.id)));
    navigate(getNextRoute("packages", boothConfig.kioskFlow));
  };

  return (
    <ScreenLayoutBoundary screenKey="packages">
      <KioskPage step="packages">
        <ScreenTitle title={boothConfig.packageHeadline || "Pilih Paket"} subtitle="Mau berfoto berapa kali hari ini?" hint="Ketuk “Pilih paket ini” pada paket yang kamu mau" />

        {eventActive && (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-5 py-3 text-center text-sm text-emerald-700">
            <span className="font-semibold">{boothConfig.eventName || "Event aktif"}</span> · {boothConfig.eventFreeEntry ? "Semua paket gratis di event ini" : "Promo event sedang berlaku"}
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-3 text-muted">
            <Spinner />
            <span>Memuat paket…</span>
          </div>
        )}
        {!loading && packages.length === 0 && (
          <div className="glass-panel flex max-w-md flex-col items-center gap-3 rounded-3xl p-8 text-center">
            <Icon name="warning" className="h-8 w-8 text-accent" />
            <p className="font-display text-xl font-semibold">Paket belum tersedia</p>
            <p className="text-sm text-muted">Mohon hubungi petugas booth untuk menyiapkan paket foto.</p>
          </div>
        )}

        {!isBrowserOnline() && offlineModeEnabled && (
          <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-center text-sm text-amber-700">Mode offline aktif. Paket terakhir tersimpan di perangkat.</p>
        )}

        {!eventActive && (
          <div className="grid w-full max-w-[1500px] items-stretch gap-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 17rem), 1fr))" }}>
            {packages.map((pkg, i) => (
              <div key={pkg.id} className="mx-auto w-full max-w-[34rem]">
                <PackageCard pkg={pkg} index={i} onChoose={choose} />
              </div>
            ))}
          </div>
        )}

        <BackButton onClick={() => navigate(getPreviousRoute("packages", boothConfig.kioskFlow))} label="Kembali ke awal" />
      </KioskPage>
    </ScreenLayoutBoundary>
  );
}
