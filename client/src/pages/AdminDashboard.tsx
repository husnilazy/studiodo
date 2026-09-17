import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { api } from "@/lib/api";
import AdminPlaceholder from "./AdminPlaceholder";

type Section = "control" | "finance" | "crm" | "traffic" | "media";
const sections: { id: Section; label: string; icon: string }[] = [
  { id: "control", label: "Control Center", icon: "⌘" },
  { id: "finance", label: "Finance", icon: "↗" },
  { id: "crm", label: "Database / CRM", icon: "◎" },
  { id: "traffic", label: "Traffic", icon: "⌁" },
  { id: "media", label: "Database Foto & Video", icon: "▧" },
];
const money = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
const panel = "rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/10 backdrop-blur-xl";

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className={panel}><p className="text-xs uppercase tracking-[.16em] text-white/45">{label}</p><p className="mt-3 font-display text-3xl font-semibold">{value}</p>{detail && <p className="mt-2 text-xs text-accent">{detail}</p>}</div>;
}

function TrafficMonitor({ sessions, traffic, metrics }: { sessions: any[]; traffic: any[]; metrics: any }) {
  const sortedTraffic = [...traffic].sort((left, right) => left.date.localeCompare(right.date));
  const peak = sortedTraffic.reduce((current, item) => item.visits > current.visits ? item : current, { date: "-", visits: 0, revenue: 0 });
  const latest = sortedTraffic.at(-1);
  const previous = sortedTraffic.at(-2);
  const trend = previous?.visits ? Math.round(((latest.visits - previous.visits) / previous.visits) * 100) : 0;
  const maxVisits = Math.max(...sortedTraffic.map((item) => item.visits), 1);
  const successCount = sessions.filter((item) => item.paymentStatus === "success").length;
  const pendingCount = sessions.filter((item) => item.paymentStatus === "pending").length;
  const failedCount = sessions.filter((item) => item.paymentStatus === "failed" || item.paymentStatus === "expired").length;
  const formatDate = (date: string) => date === "-" ? "-" : new Date(`${date}T00:00:00`).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total sesi" value={String(metrics.totalSessions ?? 0)} detail="Semua kunjungan tercatat" />
        <Metric label="Sesi berhasil" value={String(metrics.paidSessions ?? 0)} detail={`${metrics.totalSessions ? Math.round((metrics.paidSessions / metrics.totalSessions) * 100) : 0}% conversion`} />
        <Metric label="Hari tersibuk" value={formatDate(peak.date)} detail={`${peak.visits} sesi pada hari tersebut`} />
        <Metric label="Tren terbaru" value={`${trend >= 0 ? "+" : ""}${trend}%`} detail={latest ? `${latest.visits} sesi di ${formatDate(latest.date)}` : "Belum ada data"} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
        <section className={`${panel} overflow-hidden`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs uppercase tracking-[.16em] text-accent">ACTIVITY PULSE</p><h3 className="mt-2 font-display text-2xl font-semibold">Traffic harian</h3><p className="mt-1 text-sm text-white/45">Jumlah sesi yang dimulai per hari.</p></div>
            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-right"><p className="text-[10px] uppercase tracking-wider text-white/40">Peak</p><p className="text-lg font-semibold text-accent">{peak.visits}</p></div>
          </div>
          {sortedTraffic.length > 0 ? (
            <div className="mt-8 flex h-72 items-end gap-2 overflow-x-auto border-b border-white/10 pb-0 sm:gap-3">
              {sortedTraffic.map((item) => {
                const height = Math.max(10, Math.round((item.visits / maxVisits) * 205));
                return <div key={item.date} className="group flex h-full min-w-12 flex-1 flex-col items-center justify-end gap-2 sm:min-w-16" title={`${formatDate(item.date)} · ${item.visits} sesi · ${money(item.revenue ?? 0)}`}><span className="text-xs font-semibold text-white/70">{item.visits}</span><div className="relative flex w-full max-w-16 items-end justify-center" style={{ height: `${height}px` }}><div className="h-full w-full rounded-t-xl bg-accent opacity-85 shadow-lg shadow-accent/10 transition duration-300 group-hover:opacity-100 group-hover:brightness-125" /><span className="absolute -top-6 text-[10px] text-white/0 transition group-hover:text-white/70">{money(item.revenue ?? 0)}</span></div><span className="text-[10px] text-white/40">{formatDate(item.date)}</span></div>;
              })}
            </div>
          ) : <div className="mt-8 flex h-72 items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-white/35">Belum ada aktivitas traffic.</div>}
        </section>

        <section className={panel}>
          <p className="text-xs uppercase tracking-[.16em] text-accent">SESSION FUNNEL</p>
          <h3 className="mt-2 font-display text-2xl font-semibold">Status sesi</h3>
          <div className="mt-6 space-y-5">
            {[{ label: "Berhasil bayar", value: successCount, color: "bg-emerald-400", text: "text-emerald-300" }, { label: "Menunggu", value: pendingCount, color: "bg-amber-300", text: "text-amber-200" }, { label: "Gagal / expired", value: failedCount, color: "bg-red-400", text: "text-red-300" }].map((item) => <div key={item.label}><div className="flex items-center justify-between text-sm"><span className="text-white/55">{item.label}</span><span className={`font-semibold ${item.text}`}>{item.value}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${item.color}`} style={{ width: `${metrics.totalSessions ? Math.max(item.value ? 4 : 0, (item.value / metrics.totalSessions) * 100) : 0}%` }} /></div></div>)}
          </div>
          <div className="mt-8 grid grid-cols-2 gap-3 border-t border-white/10 pt-5"><div><p className="text-[10px] uppercase tracking-wider text-white/40">Foto dibuat</p><p className="mt-1 text-xl font-semibold">{metrics.photos ?? 0}</p></div><div><p className="text-[10px] uppercase tracking-wider text-white/40">Revenue</p><p className="mt-1 text-xl font-semibold text-accent">{money(metrics.revenue ?? 0)}</p></div></div>
        </section>
      </div>

      <section className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-[.16em] text-accent">LIVE LOG</p><h3 className="mt-2 font-display text-2xl font-semibold">Aktivitas sesi terbaru</h3></div><span className="text-xs text-white/40">{sessions.length} sesi total</span></div>
        <div className="mt-5 divide-y divide-white/10">
          {sessions.slice(-6).reverse().map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-semibold">Sesi {String(item.id).slice(0, 8)}</p><p className="mt-1 text-xs text-white/40">{new Date(item.createdAt).toLocaleString("id-ID")} · {item.paymentMethod ?? "belum dipilih"}</p></div><div className="flex items-center gap-4"><span className="text-sm text-white/60">{money(Number(item.totalAmount ?? 0))}</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${item.paymentStatus === "success" ? "bg-emerald-400/15 text-emerald-200" : item.paymentStatus === "failed" || item.paymentStatus === "expired" ? "bg-red-400/15 text-red-200" : "bg-amber-300/15 text-amber-200"}`}>{item.paymentStatus}</span></div></div>)}
          {sessions.length === 0 && <p className="py-8 text-sm text-white/40">Belum ada sesi tercatat.</p>}
        </div>
      </section>
    </div>
  );
}

export default function AdminDashboard() {
  const [section, setSection] = useState<Section>("control");
  const [overview, setOverview] = useState<any>({ sessions: [], metrics: {}, traffic: [] });
  useEffect(() => { api.getAdminOverview().then(setOverview).catch((error) => console.error("Gagal memuat dashboard admin", error)); }, []);
  const metrics = overview.metrics;
  const sessions = overview.sessions ?? [];
  const media = useMemo(() => sessions.flatMap((session: any) => [
    ...(session.photoUrls ?? []).map((url: string, index: number) => ({ url, type: "Foto", session, index })),
    ...(session.gifUrl ? [{ url: session.gifUrl, type: "GIF", session, index: 0 }] : []),
    ...(session.videoUrl ? [{ url: session.videoUrl, type: "Video", session, index: 0 }] : []),
  ]), [sessions]);
  const paid = sessions.filter((session: any) => session.paymentStatus === "success");

  return (
    <div className="flex h-full overflow-hidden bg-[var(--kiosk-background)] text-[var(--kiosk-text)]">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-white/10 bg-black/20 p-5 md:flex">
        <div className="mb-10"><p className="text-xs font-semibold uppercase tracking-[.25em] text-accent">STUDIODO</p><h1 className="mt-2 font-display text-2xl font-bold">Admin OS</h1><p className="mt-1 text-xs text-white/40">Booth intelligence dashboard</p></div>
        <nav className="space-y-2">{sections.map((item) => <button key={item.id} onClick={() => setSection(item.id)} className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm transition ${section === item.id ? "bg-accent text-white shadow-lg shadow-accent/20" : "text-white/55 hover:bg-white/10 hover:text-white"}`}><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10">{item.icon}</span>{item.label}</button>)}</nav>
        <div className="mt-8 space-y-2 border-t border-white/10 pt-6"><p className="px-1 text-[10px] font-semibold uppercase tracking-[.18em] text-white/30">Aksi cepat</p><Link href="/admin/frames" className="block rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-center text-sm text-accent hover:bg-accent/20">Frame Studio</Link><Link href="/" className="block rounded-2xl border border-white/10 px-4 py-3 text-center text-sm text-white/55 hover:text-white">← Kembali ke Kiosk</Link><Link href="/admin/customers" className="block rounded-2xl border border-white/10 px-4 py-3 text-center text-sm text-white/55 hover:text-white">Buka CRM detail</Link></div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto p-5 md:p-10">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">COMMAND CENTER / {section.toUpperCase()}</p><h2 className="font-display text-4xl font-bold md:text-6xl">{sections.find((item) => item.id === section)?.label}</h2><p className="mt-2 text-[var(--kiosk-muted)]">Monitor, kelola, dan pahami performa booth kamu.</p></div><div className="flex gap-2 md:hidden">{sections.map((item) => <button key={item.id} onClick={() => setSection(item.id)} className={`rounded-xl px-3 py-2 text-xs ${section === item.id ? "bg-accent" : "bg-white/10"}`}>{item.icon}</button>)}</div></div>
          {section === "control" && <AdminPlaceholder />}
          {section === "finance" && <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Revenue" value={money(metrics.revenue ?? 0)} detail={`${metrics.paidSessions ?? 0} transaksi sukses`} /><Metric label="Paid conversion" value={`${metrics.totalSessions ? Math.round((metrics.paidSessions / metrics.totalSessions) * 100) : 0}%`} detail={`${metrics.totalSessions ?? 0} total sesi`} /><Metric label="QRIS" value={String(paid.filter((item: any) => item.paymentMethod === "qris").length)} /><Metric label="Voucher" value={String(paid.filter((item: any) => item.paymentMethod === "voucher").length)} /></div><section className={panel}><h3 className="font-display text-2xl font-semibold">Transaksi terbaru</h3><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-white/45"><tr><th className="p-3">Waktu</th><th className="p-3">Metode</th><th className="p-3">Status</th><th className="p-3">Total</th></tr></thead><tbody>{sessions.slice(-12).reverse().map((item: any) => <tr key={item.id} className="border-t border-white/10"><td className="p-3 text-white/60">{new Date(item.createdAt).toLocaleString("id-ID")}</td><td className="p-3 uppercase">{item.paymentMethod}</td><td className="p-3"><span className={item.paymentStatus === "success" ? "text-emerald-300" : "text-amber-300"}>{item.paymentStatus}</span></td><td className="p-3">{money(Number(item.totalAmount ?? 0))}</td></tr>)}</tbody></table></div></section></div>}
          {section === "crm" && <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-3"><Metric label="Total clients" value={String(metrics.customers ?? 0)} /><Metric label="With WhatsApp" value={String(sessions.filter((item: any) => item.customerWhatsapp).length)} /><Metric label="Consent publikasi" value={String(sessions.filter((item: any) => item.publishConsent).length)} /></div><section className={panel}><h3 className="font-display text-2xl font-semibold">Client database</h3><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-white/45"><tr><th className="p-3">Tanggal</th><th className="p-3">WhatsApp</th><th className="p-3">Email</th><th className="p-3">Status</th><th className="p-3">Gallery</th></tr></thead><tbody>{sessions.filter((item: any) => item.customerWhatsapp || item.customerEmail).map((item: any) => <tr key={item.id} className="border-t border-white/10"><td className="p-3 text-white/60">{new Date(item.createdAt).toLocaleDateString("id-ID")}</td><td className="p-3">{item.customerWhatsapp || "-"}</td><td className="p-3">{item.customerEmail || "-"}</td><td className="p-3">{item.paymentStatus}</td><td className="p-3">{item.shareUrl ? <a className="text-accent" href={item.shareUrl} target="_blank">Buka</a> : "-"}</td></tr>)}</tbody></table></div></section></div>}
          {section === "traffic" && <TrafficMonitor sessions={sessions} traffic={overview.traffic} metrics={metrics} />}
          {section === "media" && <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-3"><Metric label="Foto" value={String(metrics.photos ?? 0)} /><Metric label="Video" value={String(metrics.videos ?? 0)} /><Metric label="GIF" value={String(metrics.gifs ?? 0)} /></div><section className={panel}><h3 className="font-display text-2xl font-semibold">Asset library</h3><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{media.map((item: any, index: number) => <a key={`${item.url}-${index}`} href={item.url} target="_blank" className="group overflow-hidden rounded-2xl border border-white/10 bg-black/20"><div className="flex h-36 items-center justify-center bg-white/5">{item.type === "Video" ? <video src={item.url} muted className="h-full w-full object-cover" /> : <img src={item.url} className="h-full w-full object-cover transition group-hover:scale-105" />}</div><div className="p-3"><p className="text-sm font-semibold">{item.type} #{item.index + 1}</p><p className="mt-1 text-xs text-white/40">{new Date(item.session.createdAt).toLocaleString("id-ID")}</p></div></a>)}</div>{media.length === 0 && <p className="text-sm text-white/45">Belum ada asset tersimpan.</p>}</section></div>}
        </div>
      </main>
    </div>
  );
}
