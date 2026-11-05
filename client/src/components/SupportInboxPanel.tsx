import { useCallback, useEffect, useRef, useState } from "react";
import { superadminApi, type SupportMessage, type SupportThread } from "@/lib/superadminApi";
import { pushToast } from "@/lib/toastStore";
import Spinner from "@/components/Spinner";
import { errMessage, fieldClass, fmtDate } from "@/lib/leadUi";

// Superadmin inbox for the tenants' "Bantuan" chat: who wrote, who still needs an answer, reply right here.

type Open = Awaited<ReturnType<typeof superadminApi.getSupportThread>>;

export default function SupportInboxPanel({ onChanged }: { onChanged?: () => void }) {
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "needs">("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => {
    try { const r = await superadminApi.getSupportThreads(); setThreads(r?.threads ?? []); } catch (err) { pushToast({ type: "error", title: errMessage(err) }); } finally { setLoading(false); }
  }, []);
  const loadThread = useCallback(async (id: string) => {
    try { const r = await superadminApi.getSupportThread(id); if (r) { setOpen(r); onChanged?.(); } } catch (err) { pushToast({ type: "error", title: errMessage(err) }); }
  }, [onChanged]);

  useEffect(() => { void loadList(); const t = window.setInterval(() => { if (document.visibilityState === "visible") void loadList(); }, 30_000); return () => window.clearInterval(t); }, [loadList]);
  useEffect(() => {
    if (!selected) { setOpen(null); return; }
    void loadThread(selected);
    const t = window.setInterval(() => { if (document.visibilityState === "visible") void loadThread(selected); }, 15_000);
    return () => window.clearInterval(t);
  }, [selected, loadThread]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [open?.messages.length]);

  const send = async () => {
    if (!selected || !text.trim() || busy) return;
    setBusy(true);
    try { await superadminApi.replySupport(selected, text); setText(""); await Promise.all([loadThread(selected), loadList()]); } catch (err) { pushToast({ type: "error", title: errMessage(err) }); } finally { setBusy(false); }
  };
  const setStatus = async (status: "open" | "resolved") => {
    if (!selected) return;
    try { await superadminApi.setSupportStatus(selected, status); await Promise.all([loadThread(selected), loadList()]); onChanged?.(); } catch (err) { pushToast({ type: "error", title: errMessage(err) }); }
  };

  const q = query.trim().toLowerCase();
  const shown = threads.filter((t) => (filter === "all" || t.needsReply) && (!q || t.tenantName.toLowerCase().includes(q) || (t.lastBody ?? "").toLowerCase().includes(q)));
  const needs = threads.filter((t) => t.needsReply).length;
  const waDigits = open?.thread.ownerWhatsapp?.replace(/\D/g, "").replace(/^0/, "62");

  return (
    <section className="rounded-[2rem] border border-fg/10 bg-fg/[0.045] p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[.16em] text-accent">BANTUAN TENANT</p>
          <h2 className="mt-2 font-display text-xl font-semibold">{needs > 0 ? `${needs} percakapan perlu dibalas` : "Semua percakapan sudah dibalas"}</h2>
          <p className="mt-1 text-sm text-fg/50">Pesan dari tombol Bantuan di dashboard tenant. Balasan Anda muncul di chat dan lonceng tenant.</p>
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="rounded-2xl border border-fg/10 bg-surface">
          <div className="space-y-2 border-b border-fg/10 p-3">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari tenant atau pesan…" className={fieldClass} />
            <div className="flex gap-1.5 text-xs font-semibold">
              <button type="button" onClick={() => setFilter("all")} className={`rounded-full px-3 py-1.5 ${filter === "all" ? "bg-fg text-canvas" : "border border-fg/15 text-fg/60"}`}>Semua ({threads.length})</button>
              <button type="button" onClick={() => setFilter("needs")} className={`rounded-full px-3 py-1.5 ${filter === "needs" ? "bg-fg text-canvas" : "border border-fg/15 text-fg/60"}`}>Perlu dibalas ({needs})</button>
            </div>
          </div>
          <ul className="max-h-[60vh] divide-y divide-fg/8 overflow-y-auto">
            {loading && <li className="flex justify-center py-8"><Spinner /></li>}
            {shown.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => setSelected(t.id)} className={`block w-full px-4 py-3 text-left transition hover:bg-fg/[0.04] ${selected === t.id ? "bg-accent/10" : ""}`}>
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{t.tenantName}</span>
                    {t.unread > 0 && <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-bold leading-[18px] text-white">{t.unread}</span>}
                    {t.status === "resolved" && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Selesai</span>}
                    <span className="ml-auto shrink-0 text-[10px] text-fg/40">{fmtDate(t.lastMessageAt)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-fg/55">{t.lastSender === "admin" ? "Anda: " : ""}{t.lastBody}</p>
                  {t.needsReply && <p className="mt-1 text-[11px] font-semibold text-amber-700">Perlu dibalas</p>}
                </button>
              </li>
            ))}
            {!loading && shown.length === 0 && <li className="px-4 py-8 text-center text-sm text-fg/40">Belum ada percakapan.</li>}
          </ul>
        </div>

        <div className="flex min-h-[420px] flex-col rounded-2xl border border-fg/10 bg-surface">
          {!open ? <p className="m-auto px-6 text-center text-sm text-fg/40">Pilih percakapan di kiri untuk membaca dan membalas.</p> : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-fg/10 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-base font-semibold">{open.thread.tenantName}</p>
                  <p className="truncate text-xs text-fg/50">{open.thread.ownerName ?? "—"} · paket {open.thread.plan}</p>
                </div>
                {waDigits && <a href={`https://wa.me/${waDigits}`} target="_blank" rel="noreferrer" className="rounded-lg border border-fg/20 px-3 py-1.5 text-xs font-semibold">WhatsApp tenant</a>}
                {open.thread.status === "open"
                  ? <button type="button" onClick={() => void setStatus("resolved")} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">Tandai selesai</button>
                  : <button type="button" onClick={() => void setStatus("open")} className="rounded-lg border border-fg/20 px-3 py-1.5 text-xs font-semibold">Buka lagi</button>}
              </div>
              <div className="max-h-[50vh] flex-1 space-y-2 overflow-y-auto px-4 py-3">
                {open.messages.map((m: SupportMessage) => (
                  <div key={m.id} className={`flex ${m.sender === "admin" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.sender === "admin" ? "bg-accent text-white" : "bg-fg/[0.07]"}`}>
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p className={`mt-1 text-[10px] ${m.sender === "admin" ? "text-white/70" : "text-fg/40"}`}>{m.author ?? (m.sender === "admin" ? "Tim" : "Tenant")} · {fmtDate(m.createdAt)}</p>
                    </div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>
              <div className="flex items-end gap-2 border-t border-fg/10 p-3">
                <textarea rows={2} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder="Tulis balasan… (Enter kirim, Shift+Enter baris baru)" className={`${fieldClass} flex-1 resize-none`} />
                <button type="button" disabled={!text.trim() || busy} onClick={() => void send()} className="h-11 rounded-xl bg-accent px-5 text-sm font-semibold text-white disabled:opacity-40">{busy ? "…" : "Balas"}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
