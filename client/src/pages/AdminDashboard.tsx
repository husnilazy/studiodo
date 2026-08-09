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
        <div className="mt-auto space-y-2"><Link href="/admin/customizer" className="block rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-center text-sm text-accent hover:bg-accent/20">Kiosk Customizer</Link><Link href="/admin/frames" className="block rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-center text-sm text-accent hover:bg-accent/20">Frame Studio</Link><Link href="/" className="block rounded-2xl border border-white/10 px-4 py-3 text-center text-sm text-white/55 hover:text-white">← Kembali ke Kiosk</Link><Link href="/admin/customers" className="block rounded-2xl border border-white/10 px-4 py-3 text-center text-sm text-white/55 hover:text-white">Buka CRM detail</Link></div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto p-5 md:p-10">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">COMMAND CENTER / {section.toUpperCase()}</p><h2 className="font-display text-4xl font-bold md:text-6xl">{sections.find((item) => item.id === section)?.label}</h2><p className="mt-2 text-[var(--kiosk-muted)]">Monitor, kelola, dan pahami performa booth kamu.</p></div><div className="flex gap-2 md:hidden">{sections.map((item) => <button key={item.id} onClick={() => setSection(item.id)} className={`rounded-xl px-3 py-2 text-xs ${section === item.id ? "bg-accent" : "bg-white/10"}`}>{item.icon}</button>)}</div></div>
          {section === "control" && <AdminPlaceholder />}
          {section === "finance" && <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Revenue" value={money(metrics.revenue ?? 0)} detail={`${metrics.paidSessions ?? 0} transaksi sukses`} /><Metric label="Paid conversion" value={`${metrics.totalSessions ? Math.round((metrics.paidSessions / metrics.totalSessions) * 100) : 0}%`} detail={`${metrics.totalSessions ?? 0} total sesi`} /><Metric label="QRIS" value={String(paid.filter((item: any) => item.paymentMethod === "qris").length)} /><Metric label="Voucher" value={String(paid.filter((item: any) => item.paymentMethod === "voucher").length)} /></div><section className={panel}><h3 className="font-display text-2xl font-semibold">Transaksi terbaru</h3><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-white/45"><tr><th className="p-3">Waktu</th><th className="p-3">Metode</th><th className="p-3">Status</th><th className="p-3">Total</th></tr></thead><tbody>{sessions.slice(-12).reverse().map((item: any) => <tr key={item.id} className="border-t border-white/10"><td className="p-3 text-white/60">{new Date(item.createdAt).toLocaleString("id-ID")}</td><td className="p-3 uppercase">{item.paymentMethod}</td><td className="p-3"><span className={item.paymentStatus === "success" ? "text-emerald-300" : "text-amber-300"}>{item.paymentStatus}</span></td><td className="p-3">{money(Number(item.totalAmount ?? 0))}</td></tr>)}</tbody></table></div></section></div>}
          {section === "crm" && <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-3"><Metric label="Total clients" value={String(metrics.customers ?? 0)} /><Metric label="With WhatsApp" value={String(sessions.filter((item: any) => item.customerWhatsapp).length)} /><Metric label="Consent publikasi" value={String(sessions.filter((item: any) => item.publishConsent).length)} /></div><section className={panel}><h3 className="font-display text-2xl font-semibold">Client database</h3><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-white/45"><tr><th className="p-3">Tanggal</th><th className="p-3">WhatsApp</th><th className="p-3">Email</th><th className="p-3">Status</th><th className="p-3">Gallery</th></tr></thead><tbody>{sessions.filter((item: any) => item.customerWhatsapp || item.customerEmail).map((item: any) => <tr key={item.id} className="border-t border-white/10"><td className="p-3 text-white/60">{new Date(item.createdAt).toLocaleDateString("id-ID")}</td><td className="p-3">{item.customerWhatsapp || "-"}</td><td className="p-3">{item.customerEmail || "-"}</td><td className="p-3">{item.paymentStatus}</td><td className="p-3">{item.shareUrl ? <a className="text-accent" href={item.shareUrl} target="_blank">Buka</a> : "-"}</td></tr>)}</tbody></table></div></section></div>}
          {section === "traffic" && <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-3"><Metric label="Total visits" value={String(metrics.totalSessions ?? 0)} /><Metric label="Avg / hari" value={String(overview.traffic.length ? Math.round(metrics.totalSessions / overview.traffic.length) : 0)} /><Metric label="Completion" value={`${metrics.totalSessions ? Math.round((metrics.paidSessions / metrics.totalSessions) * 100) : 0}%`} /></div><section className={panel}><h3 className="font-display text-2xl font-semibold">Traffic harian</h3><div className="mt-6 flex h-64 items-end gap-2 overflow-x-auto">{overview.traffic.map((item: any) => <div key={item.date} className="flex min-w-12 flex-1 flex-col items-center gap-2"><span className="text-xs text-white/50">{item.visits}</span><div className="w-full rounded-t-xl bg-gradient-to-t from-accent to-cyan-300" style={{ height: `${Math.max(8, (item.visits / Math.max(...overview.traffic.map((entry: any) => entry.visits), 1)) * 180)}px` }} /><span className="text-[10px] text-white/35">{item.date.slice(5)}</span></div>)}</div></section></div>}
          {section === "media" && <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-3"><Metric label="Foto" value={String(metrics.photos ?? 0)} /><Metric label="Video" value={String(metrics.videos ?? 0)} /><Metric label="GIF" value={String(metrics.gifs ?? 0)} /></div><section className={panel}><h3 className="font-display text-2xl font-semibold">Asset library</h3><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{media.map((item: any, index: number) => <a key={`${item.url}-${index}`} href={item.url} target="_blank" className="group overflow-hidden rounded-2xl border border-white/10 bg-black/20"><div className="flex h-36 items-center justify-center bg-white/5">{item.type === "Video" ? <video src={item.url} muted className="h-full w-full object-cover" /> : <img src={item.url} className="h-full w-full object-cover transition group-hover:scale-105" />}</div><div className="p-3"><p className="text-sm font-semibold">{item.type} #{item.index + 1}</p><p className="mt-1 text-xs text-white/40">{new Date(item.session.createdAt).toLocaleString("id-ID")}</p></div></a>)}</div>{media.length === 0 && <p className="text-sm text-white/45">Belum ada asset tersimpan.</p>}</section></div>}
        </div>
      </main>
    </div>
  );
}
