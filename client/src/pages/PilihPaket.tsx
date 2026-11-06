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
import { resolvePackageLayout } from "@/lib/kioskStyles";

const EVENT_PACKAGE_ID = "event-session";

function formatIDR(v: string | number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(v));
}

export interface PrintOption { enabled: boolean; label: string; price: number; max: number }
type ChooseFn = (pkg: Package, extras: string[], printQty: number) => void;

/** "Tambah print" stepper: the price of each extra copy is added to the total right here, before paying. */
function PrintStepper({ option, qty, setQty, compact = false }: { option: PrintOption | null; qty: number; setQty: (n: number) => void; compact?: boolean }) {
  if (!option || !option.enabled || option.max < 1) return null;
  const btn = "flex h-11 w-11 items-center justify-center rounded-full border-2 border-fg/15 bg-canvas/60 text-xl font-bold transition active:scale-90 disabled:opacity-35";
  return (
    <div className={`rounded-2xl border border-fg/10 bg-fg/5 ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">{option.label || "Tambah print"}</p>
          <p className="text-xs text-muted">{formatIDR(option.price)} per lembar · maks {option.max}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button type="button" aria-label="Kurangi print" onClick={() => setQty(Math.max(0, qty - 1))} disabled={qty <= 0} className={btn}>−</button>
          <span className="w-8 text-center font-display text-2xl font-semibold tabular-nums">{qty}</span>
          <button type="button" aria-label="Tambah print" onClick={() => setQty(Math.min(option.max, qty + 1))} disabled={qty >= option.max} className={btn}>+</button>
        </div>
      </div>
      {qty > 0 && <p className="mt-2 text-right text-sm font-semibold text-accent">+ {formatIDR(qty * option.price)}</p>}
    </div>
  );
}

function Feature({ icon, label }: { icon: string; label: string }) {
  return (
    <li className="flex items-center gap-3 text-sm md:text-base landscape:gap-2 landscape:text-sm">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent">
        <Icon name={icon} className="h-4 w-4" />
      </span>
      {label}
    </li>
  );
}

function PackageCard({ pkg, index, onChoose, printOption }: { pkg: Package; index: number; onChoose: ChooseFn; printOption: PrintOption | null }) {
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const [printQty, setPrintQty] = useState(0);
  const extras = pkg.extraPrints ?? [];
  const extrasTotal = extras.filter((e) => selectedExtras.includes(e.id)).reduce((sum, e) => sum + Number(e.price), 0);
  const total = Number(pkg.price) + extrasTotal + (printOption?.enabled ? printQty * printOption.price : 0);
  const isFree = Number(pkg.price) === 0 && total === 0;

  const toggleExtra = (id: string) => setSelectedExtras((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]));

  return (
    <motion.article
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="glass-panel kinetic-card-hover relative flex h-full flex-col overflow-hidden rounded-[2rem] text-left"
    >
      {pkg.thumbnailUrl && (
        <div className="h-36 shrink-0 overflow-hidden landscape:h-20">
          <img src={pkg.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        </div>
      )}
      <div className="flex flex-1 flex-col p-7 md:p-8 landscape:p-4 landscape:md:p-5">
        <h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl landscape:text-xl landscape:md:text-2xl">{pkg.name}</h2>
        {pkg.description && <p className="mt-1.5 text-sm text-muted md:text-base landscape:mt-0.5 landscape:text-sm">{pkg.description}</p>}

        <p className="mt-5 font-display text-3xl font-semibold tracking-tight text-accent md:text-4xl landscape:mt-2 landscape:text-2xl landscape:md:text-3xl">{isFree ? "Gratis" : formatIDR(pkg.price)}</p>

        <ul className="mt-6 flex flex-col gap-3 landscape:mt-2 landscape:flex-row landscape:flex-wrap landscape:gap-x-4 landscape:gap-y-1">
          <Feature icon="camera" label={`${pkg.photoCount} foto`} />
          {pkg.hasGif && <Feature icon="gif" label="GIF animasi" />}
          {pkg.hasVideo && <Feature icon="video" label="Video singkat" />}
          {pkg.hasStopMotion && <Feature icon="video" label="Video stop motion" />}
          <span className="k-desc contents"><Feature icon="download" label="Unduh lewat QR code" /></span>
        </ul>

        {/* Extras are shown up front (they used to hide behind a collapsed row that customers never opened) */}
        {extras.length > 0 && (
          <div className="mt-6 rounded-2xl border border-fg/10 bg-fg/5 p-4 landscape:mt-3 landscape:p-3">
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

        {printOption?.enabled && <div className="mt-4 landscape:mt-2"><PrintStepper option={printOption} qty={printQty} setQty={setPrintQty} compact /></div>}

        <div className="mt-auto pt-7 landscape:pt-3"><button type="button" onClick={() => onChoose(pkg, selectedExtras, printQty)} className="k-btn k-btn-accent k-btn-lg w-full landscape:!min-h-[3rem] landscape:!py-2">
          Pilih paket ini
          {total !== Number(pkg.price) && <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-sm">{formatIDR(total)}</span>}
          <Icon name="arrow-right" className="h-5 w-5" />
        </button></div>
      </div>
    </motion.article>
  );
}

/** "Daftar" layout: one compact row per package, add-ons as chips — fastest to scan, used by the Minimalis style. */
function PackageRow({ pkg, index, onChoose, printOption }: { pkg: Package; index: number; onChoose: ChooseFn; printOption: PrintOption | null }) {
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const [printQty, setPrintQty] = useState(0);
  const extras = pkg.extraPrints ?? [];
  const extrasTotal = extras.filter((e) => selectedExtras.includes(e.id)).reduce((sum, e) => sum + Number(e.price), 0);
  const total = Number(pkg.price) + extrasTotal + (printOption?.enabled ? printQty * printOption.price : 0);
  const isFree = Number(pkg.price) === 0 && total === 0;
  const toggleExtra = (id: string) => setSelectedExtras((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]));
  const included = [`${pkg.photoCount} foto`, pkg.hasGif && "GIF", pkg.hasVideo && "Video", pkg.hasStopMotion && "Stop motion"].filter(Boolean).join("  ·  ");

  return (
    <motion.article
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.07, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="glass-panel flex w-full flex-col gap-4 rounded-3xl p-5 text-left md:flex-row md:items-center md:gap-6 md:p-6"
    >
      {pkg.thumbnailUrl && <img src={pkg.thumbnailUrl} alt="" className="h-24 w-full shrink-0 rounded-2xl object-cover md:h-28 md:w-28" />}
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">{pkg.name}</h2>
        <p className="mt-1 text-sm font-semibold text-accent md:text-base">{included}</p>
        {pkg.description && <p className="mt-1 text-sm text-muted md:text-base">{pkg.description}</p>}
        {extras.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {extras.map((extra) => {
              const checked = selectedExtras.includes(extra.id);
              return (
                <button key={extra.id} type="button" onClick={() => toggleExtra(extra.id)} aria-pressed={checked} className={`flex min-h-[2.5rem] items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition ${checked ? "border-accent bg-accent/10 font-semibold" : "border-fg/15 hover:border-fg/35"}`}>
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${checked ? "border-accent bg-accent text-on-accent" : "border-fg/30"}`}>{checked && <Icon name="check" className="h-2.5 w-2.5" strokeWidth={4} />}</span>
                  {extra.name} <span className="text-accent">+{formatIDR(extra.price)}</span>
                </button>
              );
            })}
          </div>
        )}
        {printOption?.enabled && <div className="mt-3 max-w-md"><PrintStepper option={printOption} qty={printQty} setQty={setPrintQty} compact /></div>}
      </div>
      <div className="flex shrink-0 items-center justify-between gap-5 md:flex-col md:items-end md:gap-3">
        <p className="font-display text-3xl font-semibold tracking-tight md:text-4xl">{isFree ? "Gratis" : formatIDR(total)}</p>
        <button type="button" onClick={() => onChoose(pkg, selectedExtras, printQty)} className="k-btn k-btn-accent">
          Pilih <Icon name="arrow-right" className="h-5 w-5" />
        </button>
      </div>
    </motion.article>
  );
}

/** One-price mode: no package list. The booth sells a single package; the customer only chooses how many extra prints. */
function SinglePriceCard({ pkg, printOption, onChoose }: { pkg: Package; printOption: PrintOption | null; onChoose: ChooseFn }) {
  const [printQty, setPrintQty] = useState(0);
  const total = Number(pkg.price) + (printOption?.enabled ? printQty * printOption.price : 0);
  const included = [`${pkg.photoCount} foto`, pkg.hasGif && "GIF", pkg.hasVideo && "Video", pkg.hasStopMotion && "Stop motion"].filter(Boolean) as string[];
  return (
    <motion.article initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} className="glass-panel flex w-full max-w-[34rem] flex-col gap-5 rounded-[2rem] p-7 text-center md:p-9 landscape:gap-3 landscape:p-5">
      {pkg.thumbnailUrl && <img src={pkg.thumbnailUrl} alt="" className="mx-auto h-36 w-full rounded-2xl object-cover landscape:h-24" />}
      <div>
        <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl landscape:text-2xl">{pkg.name}</h2>
        {pkg.description && <p className="mt-1.5 text-sm text-muted md:text-base">{pkg.description}</p>}
        <p className="mt-3 font-display text-5xl font-semibold tracking-tight text-accent landscape:text-4xl">{Number(pkg.price) === 0 ? "Gratis" : formatIDR(pkg.price)}</p>
        <p className="mt-2 text-sm font-semibold text-muted">{included.join("  ·  ")}</p>
      </div>
      <PrintStepper option={printOption} qty={printQty} setQty={setPrintQty} />
      <div className="flex items-center justify-between rounded-2xl bg-fg/[0.06] px-5 py-3">
        <span className="text-sm font-bold uppercase tracking-wider text-muted">Total bayar</span>
        <motion.span key={total} initial={{ scale: 1.15 }} animate={{ scale: 1 }} className="font-display text-3xl font-semibold tabular-nums">{formatIDR(total)}</motion.span>
      </div>
      <button type="button" onClick={() => onChoose(pkg, [], printQty)} className="k-btn k-btn-accent k-btn-lg w-full">
        Mulai foto <Icon name="arrow-right" className="h-5 w-5" />
      </button>
    </motion.article>
  );
}

export default function PilihPaket() {
  const [, navigate] = useLocation();
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const { selectedPackage, setPackage, setSelectedExtras } = useKioskSession();
  const [printOption, setPrintOption] = useState<PrintOption | null>(null);
  useEffect(() => { api.getPrintingConfig().then((result) => setPrintOption(result ?? null)).catch(() => setPrintOption(null)); }, []);
  const boothConfig = useBoothConfig((state) => state.config);
  const offlineModeEnabled = boothConfig.offlineModeEnabled;
  const eventActive = isEventActive(boothConfig);
  const packageLayout = resolvePackageLayout(boothConfig);
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

  // One-price mode: show just the configured package (if it is still available), otherwise fall back to the normal list.
  const singlePackage = boothConfig.kioskFlow.mode === "single" && boothConfig.kioskFlow.singlePackageId
    ? packages.find((pkg) => pkg.id === boothConfig.kioskFlow.singlePackageId) ?? null
    : null;

  const choose: ChooseFn = (pkg, extraIds, printQty) => {
    setPackage(pkg);
    const chosen: { id: string; name: string; price: number; qty?: number }[] = (pkg.extraPrints ?? []).filter((extra) => extraIds.includes(extra.id));
    // Extra print copies ride along as one line item: the server re-prices it from the tenant's own setting, this only shows it.
    if (printOption?.enabled && printQty > 0) {
      const qty = Math.min(printQty, printOption.max);
      chosen.push({ id: "print-qty", name: `${printOption.label || "Tambah print"} ×${qty}`, price: qty * printOption.price, qty });
    }
    setSelectedExtras(chosen);
    navigate(getNextRoute("packages", boothConfig.kioskFlow));
  };

  return (
    <ScreenLayoutBoundary screenKey="packages">
      <KioskPage step="packages">
        <ScreenTitle title={boothConfig.packageHeadline || "Pilih Paket"} />

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

        {!eventActive && singlePackage && (
          <SinglePriceCard pkg={singlePackage} printOption={printOption} onChoose={choose} />
        )}
        {!eventActive && !singlePackage && packageLayout === "list" && (
          <div className="flex w-full max-w-[1100px] flex-col gap-4">
            {packages.map((pkg, i) => <PackageRow key={pkg.id} pkg={pkg} index={i} onChoose={choose} printOption={printOption} />)}
          </div>
        )}
        {!eventActive && !singlePackage && packageLayout === "carousel" && (
          <>
            <div className="pkg-carousel">
              {packages.map((pkg, i) => (
                <div key={pkg.id} className="pkg-slot flex">
                  <div className="w-full"><PackageCard pkg={pkg} index={i} onChoose={choose} printOption={printOption} /></div>
                </div>
              ))}
            </div>
            {packages.length > 1 && <p className="-mt-4 flex items-center gap-2 text-sm text-muted"><Icon name="arrow-left" className="h-4 w-4" /> Geser untuk melihat paket lain <Icon name="arrow-right" className="h-4 w-4" /></p>}
          </>
        )}
        {!eventActive && !singlePackage && packageLayout === "grid" && (
          <div className="grid w-full max-w-[1500px] items-stretch gap-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 17rem), 1fr))" }}>
            {packages.map((pkg, i) => (
              <div key={pkg.id} className="pkg-slot mx-auto w-full max-w-[34rem]">
                <PackageCard pkg={pkg} index={i} onChoose={choose} printOption={printOption} />
              </div>
            ))}
          </div>
        )}

        <BackButton onClick={() => navigate(getPreviousRoute("packages", boothConfig.kioskFlow))} label="Kembali ke awal" />
      </KioskPage>
    </ScreenLayoutBoundary>
  );
}
