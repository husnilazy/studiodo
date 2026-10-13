import { useCallback, useEffect, useState } from "react";
import { superadminApi, type EmailLogRow, type EmailSummary } from "@/lib/superadminApi";

// Superadmin → Email: is sending configured, every attempt of the last 90 days (sent / failed / not sent because no
// key), and a button that sends a test message to your own address. Bodies are never stored, only recipient + subject.

const STATUS: Record<EmailLogRow["status"], { label: string; tone: string }> = {
  sent: { label: "Terkirim", tone: "bg-emerald-500/20 text-emerald-600" },
  failed: { label: "Gagal", tone: "bg-red-500/20 text-red-500" },
  skipped: { label: "Tidak dikirim", tone: "bg-amber-500/20 text-amber-600" },
};
const FILTERS = [["", "Semua"], ["failed", "Gagal"], ["skipped", "Tidak dikirim"], ["sent", "Terkirim"]] as const;
const fmt = (v: string) => new Date(v).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function EmailLogPanel() {
  const [summary, setSummary] = useState<EmailSummary | null>(null);
  const [rows, setRows] = useState<EmailLogRow[] | null>(null);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    superadminApi.getEmailSummary().then((s) => setSummary(s ?? null)).catch(() => undefined);
    superadminApi.getEmailLog(status, debounced).then((r) => { setRows(r ?? []); setError(""); }).catch((e) => setError(e instanceof Error ? e.message : "Gagal memuat"));
  }, [status, debounced]);

  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setRows(null); load(); }, [status, debounced]);

  const sendTest = async () => {
    setTesting(true); setTestResult(null);
    try {
      const r = await superadminApi.sendTestEmail();
      setTestResult({ ok: true, text: `Email uji terkirim ke ${r?.to}. Cek inbox (dan spam).` });
    } catch (e) {
      setTestResult({ ok: false, text: e instanceof Error ? e.message : "Gagal mengirim" });
    } finally { setTesting(false); load(); }
  };

  const stat = (label: string, value: number, tone = "") => (
    <div className="rounded-2xl border border-fg/10 bg-fg/[0.03] px-4 py-3"><div className="text-xs text-fg/50">{label}</div><div className={`mt-1 font-display text-2xl font-semibold ${tone}`}>{value}</div></div>
  );

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-fg/10 bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold">Pengiriman email</h2>
            <p className="mt-1 text-sm text-fg/55">
              {summary ? (summary.configured
                ? <>Resend <strong className="text-emerald-500">terkonfigurasi</strong> · pengirim <code className="rounded bg-fg/10 px-1.5 py-0.5 text-xs">{summary.from}</code></>
                : <><strong className="text-amber-500">Belum aktif.</strong> Isi <code className="rounded bg-fg/10 px-1.5 py-0.5 text-xs">RESEND_API_KEY</code> di file <code className="rounded bg-fg/10 px-1.5 py-0.5 text-xs">.env</code> server lalu restart <code className="rounded bg-fg/10 px-1.5 py-0.5 text-xs">StudiodoServer</code>. Sampai itu, email tidak dikirim.</>) : "Memuat…"}
            </p>
          </div>
          <button type="button" onClick={sendTest} disabled={testing} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/20 transition hover:brightness-110 disabled:opacity-60">{testing ? "Mengirim…" : "Kirim email uji ke saya"}</button>
        </div>
        {testResult && <p role={testResult.ok ? "status" : "alert"} className={`mt-4 rounded-xl px-4 py-3 text-sm ${testResult.ok ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-500"}`}>{testResult.text}</p>}
        {summary && <div className="mt-4 grid gap-3 sm:grid-cols-3">{stat("Terkirim (7 hari)", summary.last7Days.sent, "text-emerald-500")}{stat("Gagal (7 hari)", summary.last7Days.failed, summary.last7Days.failed ? "text-red-500" : "")}{stat("Tidak dikirim (7 hari)", summary.last7Days.skipped, summary.last7Days.skipped ? "text-amber-500" : "")}</div>}
      </section>

      <section className="rounded-3xl border border-fg/10 bg-surface p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1.5 text-sm">
            {FILTERS.map(([k, label]) => <button key={k || "all"} type="button" onClick={() => setStatus(k)} className={`rounded-full px-4 py-1.5 font-semibold ${status === k ? "bg-fg text-canvas" : "bg-fg/10 text-fg/60 hover:bg-fg/15"}`}>{label}</button>)}
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari email penerima atau subjek…" className="ml-auto min-w-[220px] flex-1 rounded-xl border border-fg/15 bg-fg/5 px-4 py-2 text-sm outline-none focus:border-accent md:max-w-[340px]" />
        </div>
        {error && <p role="alert" className="mt-4 text-sm text-red-500">{error}</p>}
        <div className="mt-4 overflow-x-auto">
          {rows === null ? <p className="py-6 text-sm text-fg/50">Memuat…</p> : rows.length === 0 ? <p className="py-6 text-sm text-fg/45">Belum ada catatan email{status || debounced ? " untuk filter ini" : ""}.</p> : (
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-fg/45"><tr><th className="py-2 pr-4">Waktu</th><th className="pr-4">Penerima</th><th className="pr-4">Subjek</th><th>Status</th></tr></thead>
              <tbody className="divide-y divide-fg/10">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap py-3 pr-4 text-fg/55">{fmt(r.createdAt)}</td>
                    <td className="pr-4"><div className="font-medium">{r.toEmail}</div>{r.tenantName && <div className="text-xs text-fg/45">{r.tenantName}</div>}</td>
                    <td className="pr-4"><div>{r.subject}</div>{r.kind && <div className="text-xs text-fg/45">{r.kind}</div>}</td>
                    <td><span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS[r.status].tone}`}>{STATUS[r.status].label}</span>{r.error && <div className="mt-1 max-w-[260px] text-xs text-fg/45" title={r.error}>{r.error}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
