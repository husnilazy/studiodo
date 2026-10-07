import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pushConfigNow, syncBoothConfigFromServer } from "@/lib/boothConfigStore";
import { Link } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "@/lib/api";
import { setAdminToken } from "@/lib/api";
import { useBoothConfig } from "@/lib/boothConfigStore";
import { panel } from "@/lib/adminUi";
import { pushToast } from "@/lib/toastStore";
import Spinner from "@/components/Spinner";
import TrendChart from "@/components/TrendChart";
import WithdrawalPanel from "@/components/WithdrawalPanel";
import AdminPlaceholder from "./AdminPlaceholder";
import GalleryProfile from "./GalleryProfile";
import KioskKeys from "./KioskKeys";
import KioskFlowSettings from "./KioskFlowSettings";
import PaymentSettings from "./PaymentSettings";
import VoucherManagement from "./VoucherManagement";
import CameraSettings from "./CameraSettings";
import PrinterSettings from "./PrinterSettings";
import { Icon } from "@/components/kiosk/Icons";
import { AdminKeyboardToggle, AdminThemeToggle } from "@/components/AdminControls";
import type { StudiodoUpdaterStatus } from "@/types/electron";

type Section = "control" | "gallery" | "kiosk" | "flow" | "finance" | "crm" | "traffic" | "media";
const sections: { id: Section; label: string; icon: string; group: string; hint: string }[] = [
  { id: "control", label: "Kustomisasi Kiosk", icon: "sliders", group: "Tampilan", hint: "Logo, warna, tombol, dan teks kiosk — lihat hasilnya langsung di pratinjau kiosk asli." },
  { id: "gallery", label: "Profil Gallery", icon: "sparkles", group: "Tampilan", hint: "Profil dan tampilan galeri publik hasil foto." },
  { id: "kiosk", label: "Kiosk", icon: "monitor", group: "Operasional", hint: "Kunci kiosk, kamera, dan printer di PC booth." },
  { id: "flow", label: "Flow Kiosk", icon: "shuffle", group: "Operasional", hint: "Urutan layar yang dilalui pelanggan." },
  { id: "finance", label: "Finance", icon: "wallet", group: "Bisnis", hint: "Pendapatan, paket, harga, dan voucher." },
  { id: "crm", label: "Database / CRM", icon: "users", group: "Bisnis", hint: "Data pelanggan yang ikut sesi foto." },
  { id: "traffic", label: "Traffic", icon: "activity", group: "Bisnis", hint: "Jumlah sesi dan performa booth per hari." },
  { id: "media", label: "Database Foto & Video", icon: "folder", group: "Bisnis", hint: "Semua foto, GIF, dan video dari setiap sesi." },
];
const sectionGroups = ["Tampilan", "Operasional", "Bisnis"];
const money = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

function Metric({ label, value, detail, icon = "chart" }: { label: string; value: string; detail?: string; icon?: string }) {
  return (
    <div className={panel}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-fg/45">{label}</p>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><Icon name={icon} className="h-[18px] w-[18px]" /></span>
      </div>
      <p className="mt-3 font-display text-3xl font-semibold tracking-tight">{value}</p>
      {detail && <p className="mt-1.5 text-xs font-medium text-accent">{detail}</p>}
    </div>
  );
}

// Shown only for the very first overview load — before this, the dashboard
// briefly rendered real (misleadingly empty/"0") content while the initial
// api.getAdminOverview() was still in flight.
function OverviewSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={panel}>
            <div className="h-3 w-20 animate-pulse rounded bg-fg/10" />
            <div className="mt-4 h-8 w-16 animate-pulse rounded bg-fg/10" />
          </div>
        ))}
      </div>
      <div className={`${panel} h-64 animate-pulse`} />
    </div>
  );
}

type MeInfo = { subscriptionEndsAt: string | null; status: string | null; gracePeriodDays: number; renewalWhatsapp: string | null; renewalCheckoutUrl: string | null } | null;

// Only shown once subscriptionEndsAt is within 14 days (or already past) — Fase 6
// made this grace-period-aware and tied to real enforcement (see
// server/middleware/requireActiveSubscription.ts): the two most urgent tiers below
// now describe something that's actually about to happen or already happening, not
// just a cosmetic countdown.
function SubscriptionBanner({ me }: { me: MeInfo }) {
  const [dismissed, setDismissed] = useState(false);
  if (!me) return null;
  const suspended = me.status === "suspended";
  if (!me.subscriptionEndsAt && !suspended) return null;

  const daysLeft = me.subscriptionEndsAt ? Math.ceil((new Date(me.subscriptionEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : 0;
  const pastGrace = daysLeft < 0 && Math.abs(daysLeft) > me.gracePeriodDays;
  const lockedNow = suspended || pastGrace;
  const inGrace = !lockedNow && daysLeft < 0;
  if (daysLeft > 14 && !lockedNow) return null;
  if (dismissed && !lockedNow) return null; // the "locked right now" tier can't be dismissed away

  const renewUrl = me.renewalWhatsapp
    ? `https://wa.me/${me.renewalWhatsapp.replace(/[^0-9]/g, "")}?text=${encodeURIComponent("Halo, saya mau perpanjang langganan STUDIODO.")}`
    : me.renewalCheckoutUrl || null;

  const title = lockedNow
    ? "KIOSK SEDANG TERKUNCI — customer tidak bisa memakai kiosk sampai diperpanjang"
    : inGrace
      ? `Langganan kedaluwarsa ${Math.abs(daysLeft)} hari lalu. Kiosk akan terkunci dalam ${me.gracePeriodDays - Math.abs(daysLeft)} hari kalau belum diperpanjang.`
      : `Langganan tinggal ${daysLeft} hari`;
  const tone = lockedNow ? "red" : "amber";

  return (
    <div className={`mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-5 py-4 ${tone === "red" ? "border-red-400/30 bg-red-500/10" : "border-amber-400/30 bg-amber-500/10"}`}>
      <div>
        <p className={`text-sm font-semibold ${tone === "red" ? "text-red-200" : "text-amber-200"}`}>{title}</p>
        <p className="mt-1 text-xs text-fg/50">Perpanjang sebelum habis biar booth tidak berhenti.</p>
      </div>
      <div className="flex items-center gap-2">
        {renewUrl && (
          <a href={renewUrl} target="_blank" rel="noreferrer" className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold">
            Perpanjang
          </a>
        )}
        {!lockedNow && (
          <button type="button" onClick={() => setDismissed(true)} className="text-sm text-fg/40 hover:text-fg/70">
            Tutup
          </button>
        )}
      </div>
    </div>
  );
}

// "expired" = a session row that was opened but never paid (customer walked away, screen re-opened…). It used to be
// lumped in with "pending", so the log kept showing PENDING next to the session that actually succeeded.
function paymentStatusBadge(status: string) {
  switch (status) {
    case "success": return { label: "Berhasil", className: "bg-emerald-400/15 text-emerald-600" };
    case "failed": return { label: "Gagal", className: "bg-red-400/15 text-red-500" };
    case "expired": return { label: "Tidak dibayar", className: "bg-fg/10 text-fg/50" };
    default: return { label: "Menunggu bayar", className: "bg-amber-300/20 text-amber-600" };
  }
}
const paymentMethodLabel = (method?: string | null) => ({ qris: "QRIS", voucher: "Voucher", cash: "Cash", event: "Event gratis" } as Record<string, string>)[method ?? ""] ?? "belum dipilih";

function TrafficMonitor({ sessions, traffic, metrics }: { sessions: any[]; traffic: any[]; metrics: any }) {
  const sortedTraffic = [...traffic].sort((left, right) => left.date.localeCompare(right.date));
  const peak = sortedTraffic.reduce((current, item) => item.visits > current.visits ? item : current, { date: "-", visits: 0, revenue: 0 });
  const latest = sortedTraffic.at(-1);
  const previous = sortedTraffic.at(-2);
  const trend = previous?.visits ? Math.round(((latest.visits - previous.visits) / previous.visits) * 100) : 0;
  const successCount = sessions.filter((item) => item.paymentStatus === "success").length;
  const pendingCount = sessions.filter((item) => item.paymentStatus === "pending").length;
  const failedCount = sessions.filter((item) => item.paymentStatus === "failed").length;
  const unpaidCount = sessions.filter((item) => item.paymentStatus === "expired").length;
  const formatDate = (date: string) => date === "-" ? "-" : new Date(`${date}T00:00:00`).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon="activity" label="Total sesi" value={String(metrics.totalSessions ?? 0)} detail="Semua kunjungan tercatat" />
        <Metric icon="check" label="Sesi berhasil" value={String(metrics.paidSessions ?? 0)} detail={`${metrics.totalSessions ? Math.round((metrics.paidSessions / metrics.totalSessions) * 100) : 0}% conversion`} />
        <Metric icon="clock" label="Hari tersibuk" value={formatDate(peak.date)} detail={`${peak.visits} sesi pada hari tersebut`} />
        <Metric icon="chart" label="Tren terbaru" value={`${trend >= 0 ? "+" : ""}${trend}%`} detail={latest ? `${latest.visits} sesi di ${formatDate(latest.date)}` : "Belum ada data"} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
        <section className={`${panel} overflow-hidden`}>
          {sortedTraffic.length > 0 ? <TrendChart data={sortedTraffic} /> : <div className="flex h-72 items-center justify-center rounded-xl border border-dashed border-fg/10 text-sm text-fg/35">Belum ada aktivitas traffic.</div>}
        </section>

        <section className={panel}>
          <p className="text-xs uppercase tracking-[.16em] text-accent">SESSION FUNNEL</p>
          <h3 className="mt-2 font-display text-2xl font-semibold">Status sesi</h3>
          <div className="mt-6 space-y-5">
            {[{ label: "Berhasil bayar", value: successCount, color: "bg-emerald-400", text: "text-emerald-300" }, { label: "Menunggu", value: pendingCount, color: "bg-amber-300", text: "text-amber-200" }, { label: "Gagal", value: failedCount, color: "bg-red-400", text: "text-red-300" }, { label: "Tidak dibayar", value: unpaidCount, color: "bg-fg/30", text: "text-fg/60" }].map((item) => <div key={item.label}><div className="flex items-center justify-between text-sm"><span className="text-fg/55">{item.label}</span><span className={`font-semibold ${item.text}`}>{item.value}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-fg/10"><div className={`h-full rounded-full ${item.color}`} style={{ width: `${metrics.totalSessions ? Math.max(item.value ? 4 : 0, (item.value / metrics.totalSessions) * 100) : 0}%` }} /></div></div>)}
          </div>
          <div className="mt-8 grid grid-cols-2 gap-3 border-t border-fg/10 pt-5"><div><p className="text-[10px] uppercase tracking-wider text-fg/40">Foto dibuat</p><p className="mt-1 text-xl font-semibold">{metrics.photos ?? 0}</p></div><div><p className="text-[10px] uppercase tracking-wider text-fg/40">Revenue</p><p className="mt-1 text-xl font-semibold text-accent">{money(metrics.revenue ?? 0)}</p></div></div>
        </section>
      </div>

      <section className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-[.16em] text-accent">LIVE LOG</p><h3 className="mt-2 font-display text-2xl font-semibold">Aktivitas sesi terbaru</h3></div><span className="text-xs text-fg/40">{sessions.length} sesi total</span></div>
        <div className="mt-5 divide-y divide-fg/10">
          {sessions.filter((item) => item.paymentStatus !== "expired").slice(-6).reverse().map((item) => {
            const status = paymentStatusBadge(item.paymentStatus);
            return (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-semibold">Sesi {String(item.id).slice(0, 8)}</p>
                  <p className="mt-1 text-xs text-fg/40">{new Date(item.createdAt).toLocaleString("id-ID")} · {paymentMethodLabel(item.paymentMethod)}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-fg/60">{money(Number(item.totalAmount ?? 0))}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${status.className}`}>{status.label}</span>
                </div>
              </div>
            );
          })}
          {sessions.length === 0 && <p className="py-8 text-sm text-fg/40">Belum ada sesi tercatat.</p>}
        </div>
      </section>
    </div>
  );
}

type SessionAsset = { url: string; downloadUrl: string; type: "Strip final" | "Foto" | "GIF" | "Video" | "Stop Motion"; index: number };
const isMotionAsset = (type: string) => type === "Video" || type === "GIF" || type === "Stop Motion";

// For a Google Drive-backed session, session.photoUrls/stripUrl are Drive
// thumbnail URLs (good for display, but low-res) — the real full-quality
// file lives at driveLinks.photos[i].downloadUrl / session.stripUrl (the
// strip field itself already IS Drive's downloadUrl, see sessions.ts strip
// upload route). Falls back to the same url for local/R2-backed sessions,
// where photoUrls/stripUrl are already the real file.
function sessionAssets(session: any): SessionAsset[] {
  const driveLinks = session.driveLinks;
  const photoDownloads: (string | undefined)[] = driveLinks?.photos?.map((p: any) => p.downloadUrl) ?? [];
  return [
    ...(session.stripUrl ? [{ url: session.stripUrl, downloadUrl: session.stripUrl, type: "Strip final" as const, index: 0 }] : []),
    ...((session.photoUrls ?? []) as string[]).map((url, index) => ({ url, downloadUrl: photoDownloads[index] ?? url, type: "Foto" as const, index })),
    ...(session.gifUrl ? [{ url: session.gifUrl, downloadUrl: session.gifUrl, type: "GIF" as const, index: 0 }] : []),
    ...(session.videoUrl ? [{ url: session.videoUrl, downloadUrl: session.videoUrl, type: "Video" as const, index: 0 }] : []),
    ...(session.stopMotionUrl ? [{ url: session.stopMotionUrl, downloadUrl: session.stopMotionUrl, type: "Stop Motion" as const, index: 0 }] : []),
  ];
}

// Drive thumbnails default to 800px — far more than a 160px gallery tile needs, and 30+ of them load per page.
const galleryThumb = (url: string) => url.replace(/([?&]sz=)w\d+/, "$1w360");

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

// The old version was one flat grid of every photo/video/GIF from every
// session ever run, newest and oldest mixed together with no way to narrow
// it down — fine for a handful of test sessions, unusable once a booth has
// actually been out at a few hundred real events. Grouping by session (so a
// client's whole set stays together), a date range, and a WhatsApp/email
// search turn it back into something you can actually find a specific
// customer's photos in.
const MEDIA_LIBRARY_PAGE_SIZE = 8;

function MediaLibrary({ sessions, metrics, downloadAsset, printAsset, downloadingKeys }: { sessions: any[]; metrics: any; downloadAsset: (item: { url: string; type: string; session: any }) => void; printAsset: (item: { url: string; type: string; session: any }) => void; downloadingKeys: Set<string> }) {
  const brandName = useBoothConfig((state) => state.config.brandName) || "kami";
  // Defaults to the last 7 days (not "show everything") — with hundreds of
  // sessions this page used to render every photo/video/GIF from all of them
  // at once (hundreds of full-resolution <img>/<video> tags), which is what
  // made it laggy. Narrower default + pagination below keeps the DOM small;
  // widen the date range or use a preset to look further back.
  const [dateFrom, setDateFrom] = useState(() => formatDateInput(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)));
  const [dateTo, setDateTo] = useState(() => formatDateInput(new Date()));
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(MEDIA_LIBRARY_PAGE_SIZE);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyShareLink = async (sessionId: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(sessionId);
      setTimeout(() => setCopiedId((current) => (current === sessionId ? null : current)), 1500);
    } catch (error) {
      console.error("Gagal menyalin link", error);
    }
  };

  const sessionsWithMedia = useMemo(
    () => sessions.filter((session) => sessionAssets(session).length > 0),
    [sessions],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sessionsWithMedia
      .filter((session) => {
        const created = new Date(session.createdAt);
        if (dateFrom && created < new Date(`${dateFrom}T00:00:00`)) return false;
        if (dateTo && created > new Date(`${dateTo}T23:59:59`)) return false;
        if (q) {
          const haystack = `${session.customerWhatsapp ?? ""} ${session.customerEmail ?? ""} ${session.id}`.toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [sessionsWithMedia, dateFrom, dateTo, query]);

  const resetFilters = () => { setDateFrom(""); setDateTo(""); setQuery(""); };
  const hasFilters = Boolean(dateFrom || dateTo || query);
  const assetCount = filtered.reduce((sum, session) => sum + sessionAssets(session).length, 0);

  // Reset how many sessions are rendered whenever the filter changes, so
  // switching date range/search doesn't leave a huge visibleCount from a
  // previous wide search still in effect.
  useEffect(() => { setVisibleCount(MEDIA_LIBRARY_PAGE_SIZE); }, [dateFrom, dateTo, query]);
  const visibleSessions = filtered.slice(0, visibleCount);

  const setQuickRange = (days: number) => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - (days - 1));
    setDateFrom(formatDateInput(from));
    setDateTo(formatDateInput(to));
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Foto" value={String(metrics.photos ?? 0)} />
        <Metric label="Video" value={String(metrics.videos ?? 0)} />
        <Metric label="GIF" value={String(metrics.gifs ?? 0)} />
      </div>

      <section className={panel}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[.16em] text-accent">FILTER</p>
            <h3 className="mt-2 font-display text-2xl font-semibold">Cari sesi</h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[{ label: "Hari ini", days: 1 }, { label: "7 hari", days: 7 }, { label: "30 hari", days: 30 }, { label: "90 hari", days: 90 }].map((preset) => (
              <button key={preset.days} type="button" onClick={() => setQuickRange(preset.days)} className="rounded-lg border border-fg/15 px-3 py-1.5 text-xs text-fg/60 hover:border-accent hover:text-fg">
                {preset.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-xs text-fg/50">
            Dari tanggal
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="mt-1 block rounded-xl border border-fg/15 bg-fg/5 px-3 py-2 text-sm text-fg outline-none focus:border-accent" />
          </label>
          <label className="text-xs text-fg/50">
            Sampai tanggal
            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="mt-1 block rounded-xl border border-fg/15 bg-fg/5 px-3 py-2 text-sm text-fg outline-none focus:border-accent" />
          </label>
          <label className="min-w-[220px] flex-1 text-xs text-fg/50">
            Cari nomor WA / email / ID sesi
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="mis. 0812… atau nama@email.com" className="mt-1 block w-full rounded-xl border border-fg/15 bg-fg/5 px-3 py-2 text-sm text-fg outline-none focus:border-accent" />
          </label>
          {hasFilters && (
            <button type="button" onClick={resetFilters} className="rounded-xl border border-fg/15 px-4 py-2 text-sm text-fg/60 hover:border-fg/35 hover:text-fg">
              Reset filter
            </button>
          )}
        </div>
        <p className="mt-4 text-xs text-fg/40">{filtered.length} sesi · {assetCount} aset{hasFilters ? " (terfilter)" : ""}</p>
      </section>

      <div className="space-y-4">
        {visibleSessions.map((session) => {
          const assets = sessionAssets(session);
          const waDigits = session.customerWhatsapp ? String(session.customerWhatsapp).replace(/[^0-9]/g, "") : null;
          const waUrl = waDigits
            ? `https://wa.me/${waDigits}?text=${encodeURIComponent(`Halo! Ini foto/video sesi kamu dari ${brandName}.${session.shareUrl ? ` Bisa dilihat & didownload di sini: ${session.shareUrl}` : ""}`)}`
            : null;
          return (
            <article key={session.id} className={panel} style={{ contentVisibility: "auto", containIntrinsicSize: "auto 260px" }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{new Date(session.createdAt).toLocaleString("id-ID")}</p>
                  <p className="mt-1 text-xs text-fg/40">
                    Sesi {String(session.id).slice(0, 8)} · {session.paymentMethod ?? "belum dipilih"} · {money(Number(session.totalAmount ?? 0))}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-fg/55">
                    {session.customerWhatsapp && <span>📱 {session.customerWhatsapp}</span>}
                    {session.customerEmail && <span>✉️ {session.customerEmail}</span>}
                    {!session.customerWhatsapp && !session.customerEmail && <span className="text-fg/30">Belum ada kontak client</span>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {waUrl && (
                    <a href={waUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-400/20">
                      Hubungi via WhatsApp
                    </a>
                  )}
                  {session.shareUrl && (
                    <>
                      <button
                        type="button"
                        onClick={() => copyShareLink(session.id, session.shareUrl)}
                        className="rounded-xl border border-fg/15 px-3 py-2 text-xs text-fg/60 hover:border-accent hover:text-fg"
                      >
                        {copiedId === session.id ? "Tersalin!" : "Salin link"}
                      </button>
                      <a href={session.shareUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-fg/15 px-3 py-2 text-xs text-fg/60 hover:border-accent hover:text-fg">
                        Buka galeri
                      </a>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
                {assets.map((asset, assetIndex) => (
                  <div key={`${asset.url}-${assetIndex}`} className="group w-40 shrink-0 overflow-hidden rounded-2xl border border-fg/10 bg-fg/5">
                    <a href={asset.downloadUrl ?? asset.url} target="_blank" rel="noreferrer" className="block">
                      <div className="flex h-32 items-center justify-center bg-fg/5">
                        {asset.type === "Video" || asset.type === "Stop Motion"
                          ? <video src={asset.url} muted preload="none" className="h-full w-full object-cover" />
                          : <img src={asset.type === "Foto" ? galleryThumb(asset.url) : asset.url} alt={asset.type} loading="lazy" decoding="async" className="h-full w-full object-cover transition group-hover:scale-105" />}
                      </div>
                    </a>
                    <div className="p-2.5">
                      <p className="text-xs font-semibold">{asset.type}{asset.type === "Foto" ? ` #${asset.index + 1}` : ""}</p>
                      <div className="mt-2 flex gap-1.5">
                        {(() => {
                          const key = `${session.id}-${asset.type}-${asset.index ?? 0}`;
                          const isDownloading = downloadingKeys.has(key);
                          return (
                            <button
                              type="button"
                              onClick={() => downloadAsset({ ...asset, session })}
                              disabled={isDownloading}
                              className="flex-1 rounded-lg border border-fg/15 px-2 py-1.5 text-[11px] text-fg/70 hover:border-accent hover:text-fg disabled:cursor-wait disabled:opacity-50"
                            >
                              {isDownloading ? "Mengunduh…" : "Download"}
                            </button>
                          );
                        })()}
                        {!isMotionAsset(asset.type) && (
                          <button type="button" onClick={() => printAsset({ ...asset, session })} disabled={!window.studiodo?.printImage} className="flex-1 rounded-lg bg-accent/80 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40">Print</button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
        {filtered.length === 0 && (
          <div className={`${panel} text-center text-sm text-fg/40`}>
            {sessionsWithMedia.length === 0 ? "Belum ada asset tersimpan." : "Tidak ada sesi yang cocok dengan filter ini."}
          </div>
        )}
        {visibleCount < filtered.length && (
          <button
            type="button"
            onClick={() => setVisibleCount((count) => count + MEDIA_LIBRARY_PAGE_SIZE)}
            className="w-full rounded-2xl border border-fg/15 py-3 text-sm text-fg/60 hover:border-accent hover:text-fg"
          >
            Muat lebih banyak ({filtered.length - visibleCount} sesi lagi)
          </button>
        )}
      </div>
    </div>
  );
}

const KIOSK_SUBTABS = [
  { id: "keys", label: "API Key" },
  { id: "camera", label: "Kamera" },
  { id: "printer", label: "Printer" },
] as const;
type KioskSubtab = (typeof KIOSK_SUBTABS)[number]["id"];

const FINANCE_SUBTABS = [
  { id: "packages", label: "Paket & QRIS" },
  { id: "promo", label: "Promosi" },
  { id: "withdraw", label: "Saldo & Penarikan" },
] as const;
type FinanceSubtab = (typeof FINANCE_SUBTABS)[number]["id"];

// Version + update status used to live buried inside Kiosk -> API Key — an
// odd spot to look for "is this app up to date" (that page is about managing
// OTHER kiosks' keys, not this window's own install), and nothing like it
// showed up in the more conventional place other desktop software puts this
// (a Help/About menu, or a persistent footer). This app hides its native
// menu bar entirely (autoHideMenuBar in electron/main.cjs) to stay
// kiosk-appropriate, so a permanent sidebar footer — visible from every
// admin section, not just one tab — stands in for that convention instead.
function KioskWindowToggle() {
  const [open, setOpen] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!window.studiodo?.getKioskStatus) return;
    const refresh = () => window.studiodo!.getKioskStatus().then((r) => setOpen(r.open)).catch(() => undefined);
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, []);
  if (!window.studiodo?.getKioskStatus || open === null) return null;
  const toggle = async () => {
    if (open && !window.confirm("Tutup layar kiosk? Customer tidak bisa memakai photobooth sampai kiosk dibuka lagi.")) return;
    setBusy(true);
    try {
      const r = open ? await window.studiodo!.closeKiosk() : await window.studiodo!.openKiosk();
      setOpen(r.open);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={toggle} disabled={busy} className={`flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition disabled:opacity-50 ${open ? "border-amber-400/40 text-amber-500 hover:bg-amber-500/10" : "border-emerald-400/40 text-emerald-500 hover:bg-emerald-500/10"}`}>
      <Icon name="monitor" className="h-4 w-4" />{open ? "Tutup Kiosk" : "Buka Kiosk"}
    </button>
  );
}

function AppVersionFooter() {
  const [status, setStatus] = useState<StudiodoUpdaterStatus | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!window.studiodo?.getUpdaterStatus) return;
    window.studiodo.getUpdaterStatus().then(setStatus).catch(() => undefined);
  }, []);

  if (!window.studiodo?.getUpdaterStatus) return null;

  const installNow = async () => {
    if (!window.confirm("Aplikasi akan restart untuk memasang update. Lanjutkan?")) return;
    await window.studiodo?.installUpdateNow?.();
  };

  const checkNow = async () => {
    setChecking(true);
    try {
      setStatus(await window.studiodo!.checkForUpdate());
    } finally {
      setChecking(false);
    }
  };

  const statusLabel = (() => {
    if (checking || status?.state === "checking") return "Mengecek...";
    switch (status?.state) {
      case "downloading": return `Update v${status.version} — ${status.progressPercent ?? 0}%`;
      case "downloaded": return `Update v${status.version} siap dipasang`;
      case "available": return `Update v${status.version} ditemukan...`;
      case "not-available": return "Versi terbaru";
      case "error": return "Gagal cek update";
      default: return "Belum pernah dicek";
    }
  })();

  return (
    <div className="mt-auto border-t border-fg/10 pt-4 text-center">
      <p className="text-[11px] text-fg/35">STUDIODO v{status?.currentVersion ?? "-"} — {statusLabel}</p>
      {status?.state === "downloaded" ? (
        <button type="button" onClick={installNow} className="mt-2 w-full rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-white shadow-md shadow-accent/25">
          Pasang update v{status.version} &amp; restart
        </button>
      ) : (
        <button type="button" onClick={checkNow} disabled={checking} className="mt-1 text-[11px] font-semibold text-accent hover:underline disabled:opacity-50">
          {checking ? "Mengecek..." : "Cek update"}
        </button>
      )}
      {status?.state === "error" && status.error && <p className="mt-1 break-words text-[10px] leading-snug text-red-500">{status.error}</p>}
    </div>
  );
}

export default function AdminDashboard() {
  const [section, setSection] = useState<Section>("control");
  const [kioskSubtab, setKioskSubtab] = useState<KioskSubtab>("keys");
  const [financeSubtab, setFinanceSubtab] = useState<FinanceSubtab>("packages");
  const [overview, setOverview] = useState<any>({ sessions: [], metrics: {}, traffic: [] });
  const [me, setMe] = useState<MeInfo>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  // Keyed by session id + asset type/index — the "Download" button used to
  // give zero feedback on failure (a caught error just went to
  // console.error, invisible on a screen nobody has DevTools open on), so an
  // admin who hit a failed download just kept clicking it with no idea
  // anything was wrong. This both disables the button while a download for
  // that exact asset is in flight (stops the repeat-click pile-up) and lets
  // a real error surface as a toast instead of silently doing nothing.
  const [downloadingKeys, setDownloadingKeys] = useState<Set<string>>(new Set());

  const overviewFingerprintRef = useRef("");
  const loadOverview = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setRefreshing(true);
    try {
      const result = await api.getAdminOverview();
      if (result) {
        // Background polls usually return identical data; swapping in a new object anyway re-rendered the whole
        // dashboard (every gallery card + image) each time, which is what made the admin feel heavy while idle.
        const fingerprint = JSON.stringify(result);
        if (fingerprint !== overviewFingerprintRef.current) {
          overviewFingerprintRef.current = fingerprint;
          setOverview(result);
        }
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error("Gagal memuat dashboard admin", error);
      if (!opts?.silent) pushToast({ type: "error", title: "Gagal memuat data terbaru", sub: "Coba lagi atau periksa koneksi." });
    } finally {
      setRefreshing(false);
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  // A new session created elsewhere (or one that just finished) used to only
  // show up in Database Foto & Video / Traffic / CRM after a manual page
  // reload — disruptive when an admin is watching this live at an event.
  // Polls in the background, paused while the tab isn't visible so a
  // forgotten background tab doesn't poll forever for nothing.
  useEffect(() => {
    const POLL_MS = 45000;
    let inFlight = false;
    const tick = async () => {
      if (document.visibilityState !== "visible" || inFlight) return;
      inFlight = true;
      await loadOverview({ silent: true });
      inFlight = false;
    };
    const interval = setInterval(tick, POLL_MS);
    const onVisibilityChange = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [loadOverview]);

  useEffect(() => { api.getMe().then((result) => setMe(result ?? null)).catch(() => undefined); }, []);

  // On admin login: load the tenant's saved design from the server. A tenant that customized before design saving
  // existed has it only on this PC — in that case upload it once so it survives restarts and reaches other kiosks.
  useEffect(() => {
    syncBoothConfigFromServer()
      .then((result) => { if (!result.hadServerConfig) void pushConfigNow(); })
      .catch(() => undefined);
  }, []);
  const metrics = overview.metrics;
  const sessions = overview.sessions ?? [];
  const paid = sessions.filter((session: any) => session.paymentStatus === "success");

  const logout = async () => {
    try {
      await api.logoutAdmin();
    } catch {
      // token might already be expired server-side — still clear it locally
    } finally {
      setAdminToken(null);
      window.dispatchEvent(new Event("studiodo-admin-unauthorized"));
    }
  };

  const downloadAsset = async (item: any) => {
    // Previously ignored item.index — every "Foto" in a session shared the
    // exact same filename, so downloading photo #2 then #3 silently
    // overwrote #2's file on disk with no error and no visible sign anything
    // was wrong, which looked identical to "download doesn't work" from the
    // admin's side.
    const key = `${item.session?.id}-${item.type}-${item.index ?? 0}`;
    if (downloadingKeys.has(key)) return;
    setDownloadingKeys((prev) => new Set(prev).add(key));
    const suffix = item.type === "Foto" ? `-${(item.index ?? 0) + 1}` : "";
    const filename = `${item.type.toLowerCase().replace(/\s+/g, "-")}${suffix}-${item.session.id}.${isMotionAsset(item.type) ? "webm" : "jpg"}`;
    try {
      // In the Electron app, save straight to disk from the main process —
      // much faster and skips a save dialog per file (see electron/main.cjs
      // "download:asset"). Plain browser (dev/admin-in-a-tab) has no such
      // bridge, so it keeps the fetch-blob-then-<a download> fallback.
      if (window.studiodo?.downloadAsset) {
        const result = await window.studiodo.downloadAsset({ url: item.downloadUrl ?? item.url, filename });
        if (!result.ok) {
          console.error("Gagal download asset", item.type, result.error);
          pushToast({ type: "error", title: `Gagal download ${item.type}`, sub: result.error ?? "Coba lagi beberapa saat." });
          return;
        }
        pushToast({ type: "success", title: `${item.type} tersimpan`, sub: "Folder Downloads/STUDIODO" });
        return;
      }
      const response = await fetch(item.downloadUrl ?? item.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error("Gagal download asset", item.type, error);
      pushToast({ type: "error", title: `Gagal download ${item.type}`, sub: error instanceof Error ? error.message : "Coba lagi beberapa saat." });
    } finally {
      setDownloadingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const printAsset = async (item: any) => {
    if (!window.studiodo?.printImage || isMotionAsset(item.type)) return;
    const response = await fetch(item.downloadUrl ?? item.url);
    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error("Gagal membaca asset"));
      reader.readAsDataURL(blob);
    });
    await window.studiodo.printImage({ dataUrl, copies: 1 });
  };

  const currentSection = sections.find((item) => item.id === section)!;
  const navButton = (item: (typeof sections)[number]) => (
    <button
      key={item.id}
      type="button"
      onClick={() => setSection(item.id)}
      aria-current={section === item.id ? "page" : undefined}
      className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${section === item.id ? "bg-accent text-white shadow-md shadow-accent/25" : "text-fg/60 hover:bg-fg/[0.06] hover:text-fg"}`}
    >
      <Icon name={item.icon} className="h-[18px] w-[18px] shrink-0" />
      {item.label}
    </button>
  );

  return (
    <div className="flex h-full overflow-hidden bg-[var(--kiosk-background)] text-[var(--kiosk-text)]">
      <aside className="hidden w-64 shrink-0 flex-col gap-1 overflow-y-auto border-r border-fg/10 bg-surface p-4 md:flex">
        <div className="mb-4 flex items-center gap-3 px-1 pt-1">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-[#a78bfa] text-white shadow-lg shadow-accent/30"><Icon name="camera" className="h-5 w-5" /></span>
          <div className="min-w-0"><p className="font-display text-lg font-bold leading-tight">STUDIODO</p><p className="text-[11px] font-medium text-fg/45">Admin booth</p></div>
        </div>
        <nav className="space-y-4">
          {sectionGroups.map((group) => (
            <div key={group}>
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[.16em] text-fg/35">{group}</p>
              <div className="space-y-0.5">{sections.filter((item) => item.group === group).map(navButton)}</div>
            </div>
          ))}
          <div>
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[.16em] text-fg/35">Konten</p>
            <Link href="/admin/frames" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-fg/60 transition hover:bg-fg/[0.06] hover:text-fg"><Icon name="frame" className="h-[18px] w-[18px] shrink-0" />Kelola Frame</Link>
            <Link href="/admin/customers" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-fg/60 transition hover:bg-fg/[0.06] hover:text-fg"><Icon name="user" className="h-[18px] w-[18px] shrink-0" />CRM detail</Link>
          </div>
        </nav>
        <div className="mt-auto space-y-2 pt-6">
          <div className="flex items-center justify-between gap-2 px-1"><span className="text-[10px] font-semibold uppercase tracking-[.16em] text-fg/35">Tampilan</span><AdminThemeToggle /></div>
          <AdminKeyboardToggle showLabel />
          <Link href="/" className="flex items-center justify-center gap-2 rounded-xl border border-fg/10 px-3 py-2.5 text-sm font-medium text-fg/60 transition hover:border-accent/40 hover:text-fg"><Icon name="arrow-left" className="h-4 w-4" />Kembali ke Kiosk</Link>
          <button type="button" onClick={logout} className="flex w-full items-center justify-center gap-2 rounded-xl border border-fg/10 px-3 py-2.5 text-sm font-medium text-fg/60 transition hover:border-red-400/50 hover:text-red-500"><Icon name="logout" className="h-4 w-4" />Logout</button>
          <KioskWindowToggle />
          {window.studiodo?.restartApp && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { if (window.confirm("Restart aplikasi STUDIODO? Kiosk & admin akan ditutup lalu dibuka lagi.")) void window.studiodo!.restartApp(); }}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-fg/10 px-2 py-2.5 text-xs font-medium text-fg/60 transition hover:border-accent/50 hover:text-fg"
              ><Icon name="refresh" className="h-4 w-4" />Restart</button>
              <button
                type="button"
                onClick={() => { if (window.confirm("Tutup aplikasi STUDIODO sepenuhnya? Kiosk akan berhenti sampai aplikasi dibuka lagi.")) void window.studiodo!.quitApp(); }}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-red-400/30 px-2 py-2.5 text-xs font-medium text-red-500/80 transition hover:bg-red-500/10 hover:text-red-500"
              ><Icon name="power" className="h-4 w-4" />Tutup</button>
            </div>
          )}
          <AppVersionFooter />
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-8">
        <div className="mx-auto max-w-7xl">
          <SubscriptionBanner me={me} />
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="eyebrow">{currentSection.group}</p>
              <h2 className="mt-1 font-display text-3xl font-bold tracking-tight md:text-4xl">{currentSection.label}</h2>
              <p className="mt-1.5 text-sm text-[var(--kiosk-muted)] md:text-base">{currentSection.hint}</p>
            </div>
            <div className="flex items-center gap-2">
              {lastUpdated && <span className="hidden text-xs text-fg/40 lg:inline">Diperbarui {lastUpdated.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>}
              <div className="flex items-center gap-2 md:hidden"><AdminKeyboardToggle /><AdminThemeToggle /></div>
              <button
                type="button"
                onClick={() => loadOverview()}
                disabled={refreshing}
                className="flex h-10 items-center gap-2 rounded-full border border-fg/10 bg-surface px-4 text-sm font-medium text-fg/70 shadow-sm transition hover:border-accent/50 hover:text-fg disabled:opacity-50"
              >
                {refreshing ? <Spinner size="sm" /> : <Icon name="refresh" className="h-4 w-4" />}
                {refreshing ? "Memuat…" : "Refresh"}
              </button>
            </div>
          </div>
          <nav className="-mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4 pb-1 md:hidden" aria-label="Menu admin">
            {sections.map((item) => (
              <button key={item.id} type="button" onClick={() => setSection(item.id)} className={`flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold ${section === item.id ? "bg-accent text-white" : "bg-fg/[0.06] text-fg/60"}`}><Icon name={item.icon} className="h-4 w-4" />{item.label}</button>
            ))}
          </nav>
          {initialLoading ? <OverviewSkeleton /> : (
          <AnimatePresence mode="wait">
            <motion.div
              key={section}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
          {section === "control" && <AdminPlaceholder />}
          {section === "gallery" && <GalleryProfile />}
          {section === "kiosk" && (
            <div className="space-y-6">
              <nav className="flex gap-1 rounded-full border border-fg/10 bg-fg/[0.05] p-1" aria-label="Kategori pengaturan kiosk">
                {KIOSK_SUBTABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setKioskSubtab(tab.id)}
                    className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${kioskSubtab === tab.id ? "bg-accent text-white shadow-md shadow-accent/25" : "text-fg/55 hover:text-fg"}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
              {kioskSubtab === "keys" && <KioskKeys />}
              {kioskSubtab === "camera" && <CameraSettings />}
              {kioskSubtab === "printer" && <PrinterSettings />}
            </div>
          )}
          {section === "flow" && <KioskFlowSettings />}
          {section === "finance" && (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric icon="wallet" label="Revenue" value={money(metrics.revenue ?? 0)} detail={`${metrics.paidSessions ?? 0} transaksi sukses`} /><Metric icon="chart" label="Paid conversion" value={`${metrics.totalSessions ? Math.round((metrics.paidSessions / metrics.totalSessions) * 100) : 0}%`} detail={`${metrics.totalSessions ?? 0} total sesi`} /><Metric icon="qr" label="QRIS" value={String(paid.filter((item: any) => item.paymentMethod === "qris").length)} /><Metric icon="ticket" label="Voucher" value={String(paid.filter((item: any) => item.paymentMethod === "voucher").length)} /></div>
              <section className={panel}><div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-display text-2xl font-semibold">Transaksi terbaru</h3>{sessions.some((item: any) => item.paymentStatus === "expired") && <span className="text-xs text-fg/40">{sessions.filter((item: any) => item.paymentStatus === "expired").length} sesi yang tidak jadi dibayar disembunyikan</span>}</div><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-fg/45"><tr><th className="p-3">Waktu</th><th className="p-3">Metode</th><th className="p-3">Status</th><th className="p-3">Total</th></tr></thead><tbody>{sessions.filter((item: any) => item.paymentStatus !== "expired").slice(-12).reverse().map((item: any) => { const status = paymentStatusBadge(item.paymentStatus); return <tr key={item.id} className="border-t border-fg/10"><td className="p-3 text-fg/60">{new Date(item.createdAt).toLocaleString("id-ID")}</td><td className="p-3">{paymentMethodLabel(item.paymentMethod)}</td><td className="p-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${status.className}`}>{status.label}</span></td><td className="p-3">{money(Number(item.totalAmount ?? 0))}</td></tr>; })}</tbody></table></div></section>
              <nav className="flex gap-1 rounded-full border border-fg/10 bg-fg/[0.05] p-1" aria-label="Kategori finance">
                {FINANCE_SUBTABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFinanceSubtab(tab.id)}
                    className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${financeSubtab === tab.id ? "bg-accent text-white shadow-md shadow-accent/25" : "text-fg/55 hover:text-fg"}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
              {financeSubtab === "packages" && <PaymentSettings />}
              {financeSubtab === "promo" && <VoucherManagement />}
              {financeSubtab === "withdraw" && <WithdrawalPanel />}
            </div>
          )}
          {section === "crm" && <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-3"><Metric icon="users" label="Total clients" value={String(metrics.customers ?? 0)} /><Metric icon="phone" label="With WhatsApp" value={String(sessions.filter((item: any) => item.customerWhatsapp).length)} /><Metric icon="shield" label="Consent publikasi" value={String(sessions.filter((item: any) => item.publishConsent).length)} /></div><section className={panel}><h3 className="font-display text-2xl font-semibold">Client database</h3><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-fg/45"><tr><th className="p-3">Tanggal</th><th className="p-3">WhatsApp</th><th className="p-3">Email</th><th className="p-3">Status</th><th className="p-3">Gallery</th></tr></thead><tbody>{sessions.filter((item: any) => item.customerWhatsapp || item.customerEmail).map((item: any) => <tr key={item.id} className="border-t border-fg/10"><td className="p-3 text-fg/60">{new Date(item.createdAt).toLocaleDateString("id-ID")}</td><td className="p-3">{item.customerWhatsapp || "-"}</td><td className="p-3">{item.customerEmail || "-"}</td><td className="p-3">{item.paymentStatus}</td><td className="p-3">{item.shareUrl ? <a className="text-accent" href={item.shareUrl} target="_blank">Buka</a> : "-"}</td></tr>)}</tbody></table></div></section></div>}
          {section === "traffic" && <TrafficMonitor sessions={sessions} traffic={overview.traffic} metrics={metrics} />}
          {section === "media" && <MediaLibrary sessions={sessions} metrics={metrics} downloadAsset={downloadAsset} printAsset={printAsset} downloadingKeys={downloadingKeys} />}
            </motion.div>
          </AnimatePresence>
          )}
        </div>
      </main>
    </div>
  );
}
