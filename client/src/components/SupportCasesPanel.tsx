import { useCallback, useEffect, useState } from "react";
import { superadminApi, type CasePriority, type CaseStatus, type SupportCase, type SupportCaseEvent, type SupportMessage } from "@/lib/superadminApi";
import { pushToast } from "@/lib/toastStore";
import Spinner from "@/components/Spinner";
import ChatBody from "@/components/ChatBody";
import { errMessage, fieldClass, fmtDate } from "@/lib/leadUi";

// The documented record of every problem tenants reported ("Laporkan masalah" in the Bantuan chat): triage it (status, priority),
// keep internal notes and the resolution for the product team, and export everything to a spreadsheet. Nothing here is ever deleted.

export const CASE_STATUS: Record<CaseStatus, { label: string; tone: string }> = {
  new: { label: "Baru", tone: "bg-sky-500/15 text-sky-700" },
  investigating: { label: "Sedang diperiksa", tone: "bg-amber-500/15 text-amber-700" },
  waiting: { label: "Menunggu info", tone: "bg-violet-500/15 text-violet-700" },
  resolved: { label: "Selesai", tone: "bg-emerald-500/15 text-emerald-700" },
  wontfix: { label: "Tidak dilanjutkan", tone: "bg-fg/10 text-fg/55" },
};
const PRIORITY: Record<CasePriority, string> = { low: "Rendah", normal: "Normal", high: "Tinggi", urgent: "Mendesak" };
const CATEGORY: Record<string, string> = { bug: "Bug aplikasi", payment: "Pembayaran / saldo", device: "Kamera / printer", billing: "Langganan / tagihan", feature: "Saran fitur", other: "Lainnya" };
const EVENT_LABEL: Record<string, string> = { created: "Dibuat", status: "Status", priority: "Prioritas", category: "Jenis", note: "Catatan", reply: "Balasan" };

type Detail = { case: SupportCase; events: SupportCaseEvent[]; messages: SupportMessage[] };

export default function SupportCasesPanel({ onOpenThread }: { onOpenThread?: (threadId: string) => void }) {
  const [filter, setFilter] = useState("open");
  const [category, setCategory] = useState("");
  const [list, setList] = useState<{ cases: SupportCase[]; open: number; total: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [note, setNote] = useState("");
  const [resolution, setResolution] = useState("");
  const [busy, setBusy] = useState(false);

  const loadList = useCallback(async () => {
    try { setList((await superadminApi.getSupportCases(filter, category)) ?? null); } catch (err) { pushToast({ type: "error", title: errMessage(err) }); }
  }, [filter, category]);
  const loadDetail = useCallback(async (id: string) => {
    try {
      const r = await superadminApi.getSupportCase(id);
      if (r) { setDetail(r); setResolution(r.case.resolutionNote ?? ""); }
    } catch (err) { pushToast({ type: "error", title: errMessage(err) }); }
  }, []);

  useEffect(() => { void loadList(); }, [loadList]);
  useEffect(() => { if (selected) void loadDetail(selected); else setDetail(null); }, [selected, loadDetail]);

  const update = async (body: Parameters<typeof superadminApi.updateSupportCase>[1]) => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await superadminApi.updateSupportCase(selected, body);
      setNote("");
      await Promise.all([loadDetail(selected), loadList()]);
    } catch (err) { pushToast({ type: "error", title: errMessage(err) }); } finally { setBusy(false); }
  };
  const download = (path: string, name: string) => superadminApi.downloadFinanceCsv(path, name).catch((err) => pushToast({ type: "error", title: errMessage(err) }));

  const c = detail?.case;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {[["open", `Terbuka${list ? ` (${list.open})` : ""}`], ["resolved", "Selesai"], ["wontfix", "Tidak dilanjutkan"], ["all", `Semua${list ? ` (${list.total})` : ""}`]].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setFilter(id)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${filter === id ? "bg-fg text-canvas" : "border border-fg/15 text-fg/60"}`}>{label}</button>
        ))}
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-full border border-fg/15 bg-surface px-3 py-1.5 text-xs">
          <option value="">Semua jenis</option>
          {Object.entries(CATEGORY).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => void download("/support/cases.csv", "kasus-bug-studiodo.csv")} className="rounded-full border border-fg/20 px-3 py-1.5 text-xs font-semibold">Unduh kasus (CSV)</button>
          <button type="button" onClick={() => void download("/support/messages.csv", "riwayat-chat-bantuan.csv")} className="rounded-full border border-fg/20 px-3 py-1.5 text-xs font-semibold">Unduh seluruh chat (CSV)</button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[340px_1fr]">
        <ul className="max-h-[65vh] divide-y divide-fg/8 overflow-y-auto rounded-2xl border border-fg/10 bg-surface">
          {!list && <li className="flex justify-center py-8"><Spinner /></li>}
          {list?.cases.map((k) => (
            <li key={k.id}>
              <button type="button" onClick={() => setSelected(k.id)} className={`block w-full px-4 py-3 text-left transition hover:bg-fg/[0.04] ${selected === k.id ? "bg-accent/10" : ""}`}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">#{k.caseNo}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${CASE_STATUS[k.status]?.tone ?? ""}`}>{CASE_STATUS[k.status]?.label ?? k.status}</span>
                  {(k.priority === "high" || k.priority === "urgent") && <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-700">{PRIORITY[k.priority]}</span>}
                  <span className="ml-auto text-[10px] text-fg/40">{fmtDate(k.createdAt)}</span>
                </div>
                <p className="mt-0.5 truncate text-sm">{k.title}</p>
                <p className="truncate text-[11px] text-fg/50">{k.tenantName} · {CATEGORY[k.category] ?? k.category}</p>
              </button>
            </li>
          ))}
          {list && list.cases.length === 0 && <li className="px-4 py-8 text-center text-sm text-fg/40">Belum ada kasus.</li>}
        </ul>

        <div className="min-h-[420px] rounded-2xl border border-fg/10 bg-surface p-4">
          {!c ? <p className="py-16 text-center text-sm text-fg/40">Pilih kasus di kiri untuk melihat detail, riwayat, dan memperbaruinya.</p> : (
            <div className="space-y-4">
              <div>
                <p className="text-xs text-fg/50">#{c.caseNo} · {c.tenantName} · {CATEGORY[c.category] ?? c.category} · {fmtDate(c.createdAt)}</p>
                <h3 className="mt-1 font-display text-lg font-semibold">{c.title}</h3>
                <p className="mt-2 whitespace-pre-wrap rounded-xl bg-fg/[0.05] p-3 text-sm">{c.description}</p>
                {detail.messages.some((m) => (m.attachments?.length ?? 0) > 0) && (
                  <div className="mt-2 max-w-md text-sm">{detail.messages.map((m) => <ChatBody key={m.id} text="" attachments={m.attachments} />)}</div>
                )}
                <p className="mt-2 text-[11px] text-fg/45">Konteks otomatis: {Object.entries(c.context).filter(([k]) => k !== "userAgent").map(([k, v]) => `${k}: ${v}`).join(" · ") || "—"}</p>
                {c.context.userAgent && <p className="truncate text-[11px] text-fg/35" title={c.context.userAgent}>{c.context.userAgent}</p>}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-xs font-semibold text-fg/60">Status
                  <select disabled={busy} value={c.status} onChange={(e) => void update({ status: e.target.value as CaseStatus })} className={`${fieldClass} mt-1 font-normal`}>
                    {(Object.keys(CASE_STATUS) as CaseStatus[]).map((s) => <option key={s} value={s}>{CASE_STATUS[s].label}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold text-fg/60">Prioritas
                  <select disabled={busy} value={c.priority} onChange={(e) => void update({ priority: e.target.value as CasePriority })} className={`${fieldClass} mt-1 font-normal`}>
                    {(Object.keys(PRIORITY) as CasePriority[]).map((p) => <option key={p} value={p}>{PRIORITY[p]}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold text-fg/60">Jenis
                  <select disabled={busy} value={c.category} onChange={(e) => void update({ category: e.target.value })} className={`${fieldClass} mt-1 font-normal`}>
                    {Object.entries(CATEGORY).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </label>
              </div>
              <p className="text-[11px] text-fg/45">Tenant otomatis diberi tahu di lonceng dashboard saat status berubah. Catatan internal tidak pernah terlihat oleh tenant.</p>

              <div>
                <label className="text-xs font-semibold text-fg/60">Catatan penyelesaian / pelajaran untuk pengembangan
                  <textarea rows={3} value={resolution} maxLength={2000} onChange={(e) => setResolution(e.target.value)} placeholder="Penyebab, perbaikan, dan apa yang perlu diubah di aplikasi." className={`${fieldClass} mt-1 resize-none font-normal`} />
                </label>
                <button type="button" disabled={busy || resolution === (c.resolutionNote ?? "")} onClick={() => void update({ resolutionNote: resolution })} className="mt-2 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Simpan catatan penyelesaian</button>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => c.threadId && onOpenThread?.(c.threadId)} disabled={!c.threadId} className="rounded-lg border border-fg/20 px-3 py-1.5 text-xs font-semibold disabled:opacity-40">Balas di chat tenant</button>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[.14em] text-fg/50">Riwayat kasus</p>
                <ul className="mt-2 space-y-1.5">
                  {detail.events.map((e) => (
                    <li key={e.id} className="rounded-lg bg-fg/[0.04] px-3 py-2 text-xs">
                      <span className="font-semibold">{EVENT_LABEL[e.kind] ?? e.kind}</span>
                      <span className="text-fg/45"> · {e.actor ?? "sistem"} · {fmtDate(e.createdAt)}</span>
                      {e.detail && <p className="mt-0.5 whitespace-pre-wrap break-words text-fg/70">{e.detail}</p>}
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex gap-2">
                  <input value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} placeholder="Tambah catatan internal…" className={`${fieldClass} flex-1`} />
                  <button type="button" disabled={busy || !note.trim()} onClick={() => void update({ note })} className="rounded-xl border border-fg/20 px-4 text-xs font-semibold disabled:opacity-40">Tambah</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
