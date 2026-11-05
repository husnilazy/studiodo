import { useCallback, useEffect, useState } from "react";
import { superadminApi, type AdminAlert, type AlertSettings, type AlertSummary } from "@/lib/superadminApi";
import { pushToast } from "@/lib/toastStore";
import Spinner from "@/components/Spinner";
import { errMessage, fieldClass, fmtDate } from "@/lib/leadUi";

// Pusat Notifikasi: what needs a person right now, the live feed of everything important (sign-ups, payments, withdrawals,
// help messages, errors), and which of those also go to the owner's WhatsApp.

const TONE: Record<string, string> = {
  info: "border-l-indigo-500 bg-indigo-500/[0.06]", success: "border-l-emerald-500 bg-emerald-500/[0.06]", warning: "border-l-amber-500 bg-amber-500/[0.07]", critical: "border-l-red-500 bg-red-500/[0.08]",
};
const DOT: Record<string, string> = { info: "bg-indigo-500", success: "bg-emerald-500", warning: "bg-amber-500", critical: "bg-red-500" };
const CARD: Record<string, string> = { bad: "border-red-500/40 bg-red-500/[0.07]", warn: "border-amber-500/40 bg-amber-500/[0.07]", info: "border-fg/12 bg-fg/[0.03]" };

function SettingsBox({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<AlertSettings | null>(null);
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { superadminApi.getAlertSettings().then((r) => { if (r) { setS(r); setNumber(r.number); } }).catch((e) => pushToast({ type: "error", title: errMessage(e) })); }, []);
  if (!s) return <div className="flex justify-center py-6"><Spinner /></div>;
  const toggle = (kind: string, ch: "inApp" | "whatsapp") => setS({ ...s, kinds: s.kinds.map((k) => (k.kind === kind ? { ...k, [ch]: !k[ch] } : k)) });
  const save = async () => {
    setBusy(true);
    try {
      await superadminApi.saveAlertSettings({ number, prefs: Object.fromEntries(s.kinds.map((k) => [k.kind, { inApp: k.inApp, whatsapp: k.whatsapp }])) });
      pushToast({ type: "success", title: "Pengaturan notifikasi disimpan" }); onClose();
    } catch (err) { pushToast({ type: "error", title: errMessage(err) }); } finally { setBusy(false); }
  };
  const test = async () => { try { await superadminApi.saveAlertSettings({ number }); await superadminApi.testAlertWhatsapp(); pushToast({ type: "success", title: "Pesan tes terkirim" }); } catch (err) { pushToast({ type: "error", title: errMessage(err) }); } };
  return (
    <div className="mt-4 rounded-2xl border border-fg/10 bg-surface p-4">
      <p className="text-sm font-semibold">Kirim juga ke WhatsApp saya</p>
      <p className="mt-1 text-xs text-fg/55">{s.gateway ? "Gateway WhatsApp tersambung." : "Gateway WhatsApp belum diatur — atur token di Calon Tenant → Pengaturan agar pesan bisa terkirim."}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <input className={`${fieldClass} !w-64`} placeholder="Nomor penerima, mis. 0877…" value={number} onChange={(e) => setNumber(e.target.value)} />
        <button type="button" onClick={() => void test()} disabled={!number.trim()} className="rounded-lg border border-fg/20 px-4 py-2 text-xs font-semibold disabled:opacity-40">Kirim pesan tes</button>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[460px] text-left text-sm">
          <thead className="text-[11px] uppercase tracking-[.12em] text-fg/45"><tr><th className="py-2">Jenis</th><th className="px-3 py-2">Di aplikasi</th><th className="px-3 py-2">WhatsApp</th></tr></thead>
          <tbody>
            {s.kinds.map((k) => (
              <tr key={k.kind} className="border-t border-fg/8">
                <td className="py-2"><span className={`mr-2 inline-block h-2 w-2 rounded-full ${DOT[k.severity]}`} />{k.label}</td>
                <td className="px-3 py-2"><input type="checkbox" checked={k.inApp} onChange={() => toggle(k.kind, "inApp")} aria-label={`${k.label} di aplikasi`} /></td>
                <td className="px-3 py-2"><input type="checkbox" checked={k.whatsapp} onChange={() => toggle(k.kind, "whatsapp")} aria-label={`${k.label} WhatsApp`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex gap-2"><button type="button" disabled={busy} onClick={() => void save()} className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white">{busy ? "Menyimpan…" : "Simpan"}</button><button type="button" onClick={onClose} className="rounded-lg border border-fg/20 px-4 py-2 text-xs">Batal</button></div>
    </div>
  );
}

export default function AlertsPanel({ onNavigate, onChanged }: { onNavigate: (section: string) => void; onChanged?: () => void }) {
  const [items, setItems] = useState<AdminAlert[]>([]);
  const [summary, setSummary] = useState<AlertSummary | null>(null);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [perm, setPerm] = useState<string>(() => (typeof Notification === "undefined" ? "unsupported" : Notification.permission));

  const load = useCallback(async () => {
    try {
      const [list, sum] = await Promise.all([superadminApi.getAlerts({ unread: onlyUnread }), superadminApi.getAlertSummary()]);
      setItems(list?.items ?? []); if (sum) setSummary(sum);
    } catch (err) { pushToast({ type: "error", title: errMessage(err) }); } finally { setLoading(false); }
  }, [onlyUnread]);
  useEffect(() => { void load(); const t = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30_000); return () => window.clearInterval(t); }, [load]);

  const open = async (a: AdminAlert) => {
    if (!a.readAt) { await superadminApi.markAlertsRead({ ids: [a.id] }).catch(() => undefined); onChanged?.(); }
    if (a.link) onNavigate(a.link); else void load();
  };
  const readAll = async () => { await superadminApi.markAlertsRead({ all: true }).catch(() => undefined); onChanged?.(); void load(); };

  return (
    <section className="space-y-4">
      <div className="rounded-[2rem] border border-fg/10 bg-fg/[0.045] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[.16em] text-accent">PUSAT NOTIFIKASI</p>
            <h2 className="mt-2 font-display text-xl font-semibold">{summary?.followUpTotal ? `${summary.followUpTotal} hal perlu ditindaklanjuti` : "Tidak ada yang mendesak"}</h2>
            <p className="mt-1 text-sm text-fg/50">Pendaftaran baru, pembayaran, penarikan, pesan tenant, dan error terpantau di sini.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {perm === "default" && <button type="button" onClick={async () => setPerm(await Notification.requestPermission())} className="rounded-lg border border-fg/15 px-3 py-2 text-xs font-semibold">Aktifkan notifikasi desktop</button>}
            <button type="button" onClick={() => setShowSettings((v) => !v)} className="rounded-lg border border-fg/15 px-3 py-2 text-xs font-semibold">Pengaturan & WhatsApp</button>
          </div>
        </div>
        {summary && summary.followUp.length > 0 && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summary.followUp.map((f) => (
              <button key={f.key} type="button" onClick={() => onNavigate(f.link)} className={`rounded-2xl border px-4 py-3 text-left transition hover:shadow-md ${CARD[f.tone]}`}>
                <p className="font-display text-2xl font-semibold">{f.count}</p>
                <p className="text-sm text-fg/70">{f.label}</p>
              </button>
            ))}
          </div>
        )}
        {showSettings && <SettingsBox onClose={() => setShowSettings(false)} />}
      </div>

      <div className="rounded-[2rem] border border-fg/10 bg-fg/[0.045] p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-lg font-semibold">Aktivitas penting</h3>
          {summary && summary.unread > 0 && <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">{summary.unread} baru</span>}
          <div className="ml-auto flex items-center gap-2 text-xs font-semibold">
            <button type="button" onClick={() => setOnlyUnread((v) => !v)} className={`rounded-full px-3 py-1.5 ${onlyUnread ? "bg-fg text-canvas" : "border border-fg/15 text-fg/60"}`}>Belum dibaca</button>
            <button type="button" onClick={() => void readAll()} disabled={!summary?.unread} className="rounded-full border border-fg/15 px-3 py-1.5 text-fg/60 disabled:opacity-40">Tandai semua dibaca</button>
          </div>
        </div>
        <ul className="mt-4 space-y-2">
          {loading && <li className="flex justify-center py-8"><Spinner /></li>}
          {items.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => void open(a)} className={`flex w-full items-start gap-3 rounded-xl border-l-4 px-4 py-3 text-left transition hover:brightness-95 ${TONE[a.severity]} ${a.readAt ? "opacity-60" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">{a.title}{!a.readAt && <span className="h-2 w-2 rounded-full bg-red-500" aria-label="belum dibaca" />}{a.tenantName && <span className="rounded-full bg-fg/10 px-2 py-0.5 text-[10px] font-medium text-fg/60">{a.tenantName}</span>}</p>
                  {a.body && <p className="mt-0.5 line-clamp-2 text-sm text-fg/65">{a.body}</p>}
                  <p className="mt-1 text-[11px] text-fg/40">{fmtDate(a.createdAt)}{a.waSentAt ? " · terkirim ke WhatsApp ✓" : a.waError ? ` · WhatsApp gagal: ${a.waError}` : ""}</p>
                </div>
                {a.link && <span className="shrink-0 self-center text-xs font-semibold text-accent">Buka →</span>}
              </button>
            </li>
          ))}
          {!loading && items.length === 0 && <li className="py-8 text-center text-sm text-fg/40">{onlyUnread ? "Semua sudah dibaca." : "Belum ada aktivitas penting."}</li>}
        </ul>
      </div>
    </section>
  );
}
