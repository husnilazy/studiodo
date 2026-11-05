import { useCallback, useEffect, useMemo, useState } from "react";
import { LEAD_SOURCES, LEAD_STAGES, LEAD_STAGE_LABELS, superadminApi, type Lead, type LeadInput, type LeadListItem, type LeadStage, type LeadSummary } from "@/lib/superadminApi";
import { pushToast } from "@/lib/toastStore";
import Spinner from "@/components/Spinner";
import { errMessage, fieldClass, fmtDate } from "@/lib/leadUi";
import LeadDetailDrawer from "@/components/LeadDetailDrawer";
import LeadsSettingsModal, { LeadDocsModal } from "@/components/LeadsSettingsModal";
import Select from "@/components/Select";

// Follow-up CRM for prospective tenants: a pipeline board (drag a card to move it) or a list, with the day's follow-ups on top.
// Everything per lead — info, tasks, WhatsApp, contract, timeline — lives in the drawer (LeadDetailDrawer).


const STAGE_TONE: Record<LeadStage, string> = {
  new: "bg-sky-500", contacted: "bg-indigo-500", trial_given: "bg-violet-500", negotiation: "bg-amber-500", contract_sent: "bg-orange-500", active: "bg-emerald-500", lost: "bg-fg/30",
};
const TASK_TONE = { overdue: "bg-red-500/15 text-red-600", today: "bg-amber-500/15 text-amber-700", upcoming: "bg-fg/8 text-fg/55", done: "bg-emerald-500/15 text-emerald-700" } as const;
const CONTRACT_LABEL = { none: "", draft: "Draf kontrak", sent: "Kontrak terkirim", signed: "Kontrak disetujui" } as const;

function Stat({ label, value, tone, onClick }: { label: string; value: number; tone?: "warn" | "bad"; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-2xl border border-fg/10 bg-fg/[0.03] px-4 py-3 text-left ${onClick ? "transition hover:border-accent/50" : "cursor-default"}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-fg/45">{label}</p>
      <p className={`mt-1 font-display text-2xl font-semibold ${tone === "bad" && value > 0 ? "text-red-600" : tone === "warn" && value > 0 ? "text-amber-600" : ""}`}>{value}</p>
    </button>
  );
}

function LeadCard({ lead, onOpen, onDragStart }: { lead: LeadListItem; onOpen: () => void; onDragStart: (e: React.DragEvent) => void }) {
  const t = lead.nextTask;
  return (
    <div draggable onDragStart={onDragStart} onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
      className="cursor-pointer rounded-2xl border border-fg/10 bg-surface p-3 shadow-sm transition hover:border-accent/60 hover:shadow-md">
      <p className="font-display text-sm font-semibold leading-tight">{lead.businessName}</p>
      <p className="mt-0.5 text-xs text-fg/55">{lead.ownerName}{lead.city ? ` · ${lead.city}` : ""}</p>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        {lead.boothCount ? <span className="rounded-full bg-fg/8 px-2 py-0.5 text-fg/65">{lead.boothCount} booth</span> : null}
        {lead.paymentSetup && <span className="rounded-full bg-fg/8 px-2 py-0.5 text-fg/65">{lead.paymentSetup === "platform" ? "Pakai platform" : "Akun sendiri"}</span>}
        {lead.contractStatus !== "none" && <span className={`rounded-full px-2 py-0.5 ${lead.contractStatus === "signed" ? "bg-emerald-500/15 text-emerald-700" : "bg-orange-500/15 text-orange-700"}`}>{CONTRACT_LABEL[lead.contractStatus]}</span>}
      </div>
      {t ? (
        <p className={`mt-2 truncate rounded-lg px-2 py-1 text-[11px] font-medium ${TASK_TONE[t.state]}`} title={t.title}>{t.state === "overdue" ? "Lewat · " : ""}{fmtDate(t.dueAt)} — {t.title}</p>
      ) : lead.pipelineStage !== "active" && lead.pipelineStage !== "lost" ? (
        <p className="mt-2 rounded-lg bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-700">Belum ada tugas follow-up</p>
      ) : null}
    </div>
  );
}

function NewLeadModal({ onClose, onCreated }: { onClose: () => void; onCreated: (lead: Lead) => void }) {
  const [draft, setDraft] = useState<LeadInput & { message?: string }>({ leadSource: "whatsapp" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: LeadInput & { message?: string }) => setDraft((d) => ({ ...d, ...patch }));
  const submit = async () => {
    setBusy(true); setError("");
    try {
      const lead = await superadminApi.createLead(draft);
      if (lead) onCreated(lead);
    } catch (err) { setError(errMessage(err)); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[1.5rem] bg-canvas p-6 shadow-2xl">
        <h3 className="font-display text-lg font-semibold">Lead baru</h3>
        <p className="mt-1 text-sm text-fg/50">Untuk calon tenant yang masuk lewat chat/IG/rekomendasi. Yang dari form website sudah otomatis ada.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-fg/60">Nama usaha *<input className={fieldClass} value={draft.businessName ?? ""} onChange={(e) => set({ businessName: e.target.value })} /></label>
          <label className="text-sm text-fg/60">Nama pemilik *<input className={fieldClass} value={draft.ownerName ?? ""} onChange={(e) => set({ ownerName: e.target.value })} /></label>
          <label className="text-sm text-fg/60">WhatsApp<input className={fieldClass} placeholder="0877…" value={draft.ownerWhatsapp ?? ""} onChange={(e) => set({ ownerWhatsapp: e.target.value })} /></label>
          <label className="text-sm text-fg/60">Email (boleh menyusul)<input className={fieldClass} value={draft.ownerEmail ?? ""} onChange={(e) => set({ ownerEmail: e.target.value })} /></label>
          <label className="text-sm text-fg/60">Kota<input className={fieldClass} value={draft.city ?? ""} onChange={(e) => set({ city: e.target.value })} /></label>
          <label className="text-sm text-fg/60">Sumber
            <Select className={fieldClass} value={draft.leadSource ?? ""} onChange={(e) => set({ leadSource: e.target.value || null })}>
              {LEAD_SOURCES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </label>
        </div>
        <label className="mt-3 block text-sm text-fg/60">Catatan awal<textarea rows={2} className={fieldClass} value={draft.message ?? ""} onChange={(e) => set({ message: e.target.value })} /></label>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-fg/15 px-4 py-2 text-sm">Batal</button>
          <button type="button" disabled={busy || !draft.businessName?.trim() || !draft.ownerName?.trim()} onClick={submit} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Menyimpan…" : "Buat lead"}</button>
        </div>
      </div>
    </div>
  );
}

export default function LeadsPanel({ onChanged, onSummary }: { onChanged?: () => void; onSummary?: (s: LeadSummary) => void }) {
  const [leads, setLeads] = useState<LeadListItem[]>([]);
  const [summary, setSummary] = useState<LeadSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<"board" | "list">(() => { try { return localStorage.getItem("studiodo-leads-view") === "list" ? "list" : "board"; } catch { return "board"; } });
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<"all" | "overdue" | "today" | "notask" | "contract">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [dragOver, setDragOver] = useState<LeadStage | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, sum] = await Promise.all([superadminApi.getLeads(), superadminApi.getLeadSummary()]);
      setLeads(list?.leads ?? []);
      if (sum) { setSummary(sum); onSummary?.(sum); }
      setError("");
    } catch (err) { setError(errMessage(err)); } finally { setLoading(false); }
  }, [onSummary]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { try { localStorage.setItem("studiodo-leads-view", view); } catch { /* ignore */ } }, [view]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => {
      if (q && ![l.businessName, l.ownerName, l.ownerEmail, l.ownerWhatsapp, l.city].some((v) => v?.toLowerCase().includes(q))) return false;
      const open = l.pipelineStage !== "active" && l.pipelineStage !== "lost";
      if (focus === "overdue") return l.nextTask?.state === "overdue";
      if (focus === "today") return l.nextTask?.state === "today";
      if (focus === "notask") return open && !l.nextTask;
      if (focus === "contract") return l.contractStatus === "sent";
      return true;
    });
  }, [leads, query, focus]);

  const move = async (id: string, stage: LeadStage) => {
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.pipelineStage === stage) return;
    let reason: string | undefined;
    if (stage === "lost") { const r = window.prompt("Alasan batal? (opsional)"); if (r === null) return; reason = r || undefined; }
    setLeads((all) => all.map((l) => (l.id === id ? { ...l, pipelineStage: stage } : l))); // optimistic
    try { await superadminApi.moveLead(id, stage, reason); } catch (err) { pushToast({ type: "error", title: errMessage(err) }); }
    void load();
  };

  const changed = () => { void load(); onChanged?.(); };

  return (
    <section className="space-y-4">
      <div className="rounded-[2rem] border border-fg/10 bg-fg/[0.045] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[.16em] text-accent">CALON TENANT · CRM</p>
            <h2 className="mt-2 font-display text-xl font-semibold">{summary ? `${summary.openLeads} lead sedang diproses` : "Follow-up calon tenant"}</h2>
            <p className="mt-1 text-sm text-fg/50">Satu kartu per calon tenant: info, tugas, WhatsApp, kontrak, dan riwayat di satu tempat.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setShowDocs(true)} className="rounded-lg border border-fg/15 px-3 py-2 text-xs font-semibold text-fg/70">Panduan</button>
            <button type="button" onClick={() => setShowSettings(true)} className="rounded-lg border border-fg/15 px-3 py-2 text-xs font-semibold text-fg/70">Pengaturan</button>
            <button type="button" onClick={() => setShowNew(true)} className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white">+ Lead baru</button>
          </div>
        </div>
        {summary && (
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Follow-up terlambat" value={summary.overdue} tone="bad" onClick={() => setFocus(focus === "overdue" ? "all" : "overdue")} />
            <Stat label="Follow-up hari ini" value={summary.today} tone="warn" onClick={() => setFocus(focus === "today" ? "all" : "today")} />
            <Stat label="Tanpa tugas berikutnya" value={summary.withoutTask} tone="warn" onClick={() => setFocus(focus === "notask" ? "all" : "notask")} />
            <Stat label="Kontrak menunggu persetujuan" value={summary.contractsAwaiting} onClick={() => setFocus(focus === "contract" ? "all" : "contract")} />
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama, kota, WhatsApp, email…" className="w-full rounded-xl border border-fg/15 bg-surface px-3 py-2 text-sm outline-none focus:border-accent sm:w-72" />
          {focus !== "all" && <button type="button" onClick={() => setFocus("all")} className="rounded-full bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent">Filter aktif ✕</button>}
          <div className="ml-auto flex rounded-full border border-fg/15 p-0.5 text-xs font-semibold">
            {(["board", "list"] as const).map((v) => <button key={v} type="button" onClick={() => setView(v)} className={`rounded-full px-3 py-1.5 ${view === v ? "bg-fg text-canvas" : "text-fg/55"}`}>{v === "board" ? "Pipeline" : "Daftar"}</button>)}
          </div>
          <button type="button" onClick={() => void load()} className="rounded-lg border border-fg/15 px-3 py-2 text-xs text-fg/60">{loading ? <Spinner /> : "Muat ulang"}</button>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      {view === "board" ? (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {LEAD_STAGES.map((stage) => {
            const items = visible.filter((l) => l.pipelineStage === stage);
            return (
              <div key={stage} onDragOver={(e) => { e.preventDefault(); setDragOver(stage); }} onDragLeave={() => setDragOver((s) => (s === stage ? null : s))}
                onDrop={(e) => { e.preventDefault(); setDragOver(null); const id = e.dataTransfer.getData("text/lead"); if (id) void move(id, stage); }}
                className={`w-[260px] shrink-0 rounded-[1.5rem] border p-3 transition ${dragOver === stage ? "border-accent bg-accent/5" : "border-fg/10 bg-fg/[0.03]"}`}>
                <div className="mb-3 flex items-center gap-2 px-1">
                  <span className={`h-2.5 w-2.5 rounded-full ${STAGE_TONE[stage]}`} />
                  <p className="text-sm font-semibold">{LEAD_STAGE_LABELS[stage]}</p>
                  <span className="ml-auto rounded-full bg-fg/8 px-2 py-0.5 text-xs text-fg/55">{items.length}</span>
                </div>
                <div className="space-y-2.5">
                  {items.map((lead) => <LeadCard key={lead.id} lead={lead} onOpen={() => setOpenId(lead.id)} onDragStart={(e) => { e.dataTransfer.setData("text/lead", lead.id); e.dataTransfer.effectAllowed = "move"; }} />)}
                  {items.length === 0 && <p className="rounded-xl border border-dashed border-fg/12 px-3 py-5 text-center text-xs text-fg/35">Kosong</p>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[1.5rem] border border-fg/10 bg-fg/[0.03]">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-[11px] uppercase tracking-[.12em] text-fg/45">
              <tr><th className="px-4 py-3">Calon tenant</th><th className="px-3 py-3">Tahap</th><th className="px-3 py-3">Booth</th><th className="px-3 py-3">Follow-up berikutnya</th><th className="px-3 py-3">Kontrak</th><th className="px-3 py-3">Terakhir dihubungi</th></tr>
            </thead>
            <tbody>
              {visible.map((l) => (
                <tr key={l.id} onClick={() => setOpenId(l.id)} className="cursor-pointer border-t border-fg/8 hover:bg-fg/[0.04]">
                  <td className="px-4 py-3"><p className="font-semibold">{l.businessName}</p><p className="text-xs text-fg/50">{l.ownerName}{l.city ? ` · ${l.city}` : ""}</p></td>
                  <td className="px-3 py-3"><span className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${STAGE_TONE[l.pipelineStage]}`} />{LEAD_STAGE_LABELS[l.pipelineStage]}</span></td>
                  <td className="px-3 py-3">{l.boothCount ?? "—"}</td>
                  <td className="px-3 py-3">{l.nextTask ? <span className={`rounded-lg px-2 py-1 text-xs ${TASK_TONE[l.nextTask.state]}`}>{fmtDate(l.nextTask.dueAt)} — {l.nextTask.title}</span> : <span className="text-xs text-fg/35">—</span>}</td>
                  <td className="px-3 py-3 text-xs">{CONTRACT_LABEL[l.contractStatus] || "—"}</td>
                  <td className="px-3 py-3 text-xs text-fg/55">{fmtDate(l.lastContactedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && visible.length === 0 && <p className="py-8 text-center text-sm text-fg/40">Tidak ada lead yang cocok.</p>}
        </div>
      )}

      {openId && <LeadDetailDrawer id={openId} onClose={() => setOpenId(null)} onChanged={changed} onOpenSettings={() => setShowSettings(true)} />}
      {showNew && <NewLeadModal onClose={() => setShowNew(false)} onCreated={(lead) => { setShowNew(false); changed(); setOpenId(lead.id); }} />}
      {showSettings && <LeadsSettingsModal onClose={() => setShowSettings(false)} />}
      {showDocs && <LeadDocsModal onClose={() => setShowDocs(false)} />}
    </section>
  );
}
