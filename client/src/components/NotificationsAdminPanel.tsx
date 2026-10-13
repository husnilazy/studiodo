import { useCallback, useEffect, useState } from "react";
import { superadminApi, type NotificationSeverity, type SentNotification, type SuperadminTenant } from "@/lib/superadminApi";

// Superadmin → "Notifikasi": send a message to every tenant, or to one, that shows up in the bell of their web dashboard.
// The same table also carries future automatic notifications (customer messages, billing, booth alerts), so this
// list is the audit trail of everything pushed to tenants.

const inputClass = "mt-1 w-full rounded-lg border border-fg/15 bg-fg/5 px-3 py-2 text-sm outline-none focus:border-accent";
const SEVERITIES: { id: NotificationSeverity; label: string; tone: string }[] = [
  { id: "info", label: "Info", tone: "bg-indigo-500/15 text-indigo-600" },
  { id: "success", label: "Kabar baik", tone: "bg-emerald-500/15 text-emerald-600" },
  { id: "warning", label: "Peringatan", tone: "bg-amber-500/15 text-amber-600" },
  { id: "critical", label: "Penting", tone: "bg-red-500/15 text-red-600" },
];
const tone = (s: string) => SEVERITIES.find((x) => x.id === s)?.tone ?? SEVERITIES[0].tone;
const fmt = (v: string) => new Date(v).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function NotificationsAdminPanel({ tenants }: { tenants: SuperadminTenant[] }) {
  const [items, setItems] = useState<SentNotification[]>([]);
  const [tenantCount, setTenantCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState("");
  const [severity, setSeverity] = useState<NotificationSeverity>("info");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [days, setDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await superadminApi.getNotifications();
      if (r) { setItems(r.items); setTenantCount(r.tenantCount); }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat notifikasi");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const send = async () => {
    setError(""); setSent("");
    if (!title.trim()) return setError("Judul wajib diisi");
    if (!target && !window.confirm(`Kirim ke SEMUA tenant (${tenantCount})?`)) return;
    setBusy(true);
    try {
      await superadminApi.sendNotification({
        tenantId: target || null, title: title.trim(), body: body.trim() || undefined, severity,
        linkUrl: link.trim() || undefined, expiresInDays: days ? Number(days) : undefined,
      });
      setSent(target ? "Terkirim ke tenant." : `Terkirim ke ${tenantCount} tenant.`);
      setTitle(""); setBody(""); setLink(""); setDays("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengirim");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Hapus notifikasi ini? Akan hilang dari dashboard semua penerima.")) return;
    try { await superadminApi.deleteNotification(id); setItems((cur) => cur.filter((n) => n.id !== id)); } catch (e) { setError(e instanceof Error ? e.message : "Gagal menghapus"); }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <section className="rounded-2xl border border-fg/10 bg-fg/[0.03] p-5">
        <h2 className="font-display text-lg font-semibold">Kirim notifikasi</h2>
        <p className="mt-1 text-xs text-fg/50">Muncul di bel dashboard tenant dan halaman Notifikasi mereka.</p>
        <div className="mt-4 space-y-3">
          <label className="block text-sm font-medium">Penerima
            <select value={target} onChange={(e) => setTarget(e.target.value)} className={inputClass}>
              <option value="">Semua tenant ({tenantCount || tenants.length})</option>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <div>
            <p className="text-sm font-medium">Jenis</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {SEVERITIES.map((s) => (
                <button key={s.id} type="button" onClick={() => setSeverity(s.id)} aria-pressed={severity === s.id} className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${severity === s.id ? `${s.tone} ring-2 ring-current` : "bg-fg/10 text-fg/55 hover:text-fg"}`}>{s.label}</button>
              ))}
            </div>
          </div>
          <label className="block text-sm font-medium">Judul
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="mis. Versi 0.1.18 sudah tersedia" className={inputClass} />
          </label>
          <label className="block text-sm font-medium">Isi pesan <span className="font-normal text-fg/45">(opsional)</span>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={2000} className={inputClass} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">Tautan <span className="font-normal text-fg/45">(opsional)</span>
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="/portal/unduh atau https://…" className={inputClass} />
            </label>
            <label className="block text-sm font-medium">Tampil selama (hari)
              <input type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} placeholder="tanpa batas" className={inputClass} />
            </label>
          </div>
          {error && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
          {sent && <p role="status" className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">{sent}</p>}
          <button type="button" onClick={send} disabled={busy} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/20 transition hover:brightness-110 disabled:opacity-60">{busy ? "Mengirim…" : target ? "Kirim ke tenant ini" : "Kirim ke semua tenant"}</button>
        </div>
      </section>

      <section className="rounded-2xl border border-fg/10 bg-fg/[0.03] p-5">
        <h2 className="font-display text-lg font-semibold">Terkirim ({items.length})</h2>
        {loading ? <p className="mt-4 text-sm text-fg/50">Memuat…</p> : items.length === 0 ? <p className="mt-4 text-sm text-fg/50">Belum ada notifikasi yang dikirim.</p> : (
          <ul className="mt-3 max-h-[640px] divide-y divide-fg/10 overflow-y-auto">
            {items.map((n) => (
              <li key={n.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tone(n.severity)}`}>{SEVERITIES.find((s) => s.id === n.severity)?.label ?? n.severity}</span>
                    <span className="text-sm font-semibold">{n.title}</span>
                  </div>
                  {n.body && <p className="mt-1 line-clamp-2 text-[13px] text-fg/60">{n.body}</p>}
                  <p className="mt-1 text-xs text-fg/45">{n.tenantName ? `Ke ${n.tenantName}` : `Semua tenant`} · {fmt(n.createdAt)} · dibaca {n.readCount}{n.tenantId ? "" : `/${tenantCount}`}{n.expiresAt ? ` · sampai ${fmt(n.expiresAt)}` : ""}{n.createdBy ? ` · ${n.createdBy}` : ""}</p>
                </div>
                <button type="button" onClick={() => void remove(n.id)} className="shrink-0 rounded-lg border border-fg/15 px-3 py-1.5 text-xs text-fg/60 hover:border-red-400 hover:text-red-500">Hapus</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
