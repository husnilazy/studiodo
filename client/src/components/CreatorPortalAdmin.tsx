import { useEffect, useState } from "react";
import { getApiBaseUrl } from "@/lib/apiConfig";
import { superadminApi, type CreatorAccount, type CreatorTemplateReview, type ModerationLogEntry, type ReviewCheck } from "@/lib/superadminApi";
import WhatsAppFollowUp from "@/components/WhatsAppFollowUp";

// Superadmin side of the marketplace creator portal: login accounts + the template review queue.

const inputClass = "mt-1 w-full rounded-lg border border-fg/15 bg-fg/5 px-3 py-2 text-sm outline-none focus:border-accent";
const fmt = (v: string | null) => (v ? new Date(v).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "belum pernah");
const assetUrl = (path: string) => { try { return new URL(path, new URL(getApiBaseUrl(), window.location.href).origin).toString(); } catch { return path; } };
const PORTAL_URL = "https://www.studiodo.id/kreator/masuk";

/** Shown once after creating/resetting an account: the password is never retrievable afterwards. */
export function CredentialsNotice({ email, password }: { email: string; password: string }) {
  const text = `Akun kreator STUDIODO\nMasuk: ${PORTAL_URL}\nEmail: ${email}\nPassword sementara: ${password}\nSilakan ganti password setelah masuk.`;
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm">
      <p className="font-semibold text-emerald-200">Akun siap. Salin dan kirim ke kreator — password ini tidak akan ditampilkan lagi.</p>
      <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-black/30 p-3 text-xs text-white/80">{text}</pre>
      <button type="button" onClick={() => { void navigator.clipboard.writeText(text).then(() => setCopied(true)); }} className="mt-2 rounded-xl bg-fg/10 px-4 py-2 font-semibold hover:bg-fg/15">{copied ? "Tersalin ✓" : "Salin"}</button>
    </div>
  );
}

export function CreatorAccountsPanel() {
  const [rows, setRows] = useState<CreatorAccount[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ email: string; password: string } | null>(null);
  const [form, setForm] = useState({ name: "", email: "", whatsapp: "" });
  const [busy, setBusy] = useState(false);

  const load = () => { superadminApi.getCreatorAccounts().then((r) => { setRows(r ?? []); setError(""); }).catch((e) => setError(e instanceof Error ? e.message : "Gagal memuat")); };
  useEffect(load, []);
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(""); try { await fn(); load(); } catch (e) { setError(e instanceof Error ? e.message : "Gagal"); } finally { setBusy(false); } };

  return (
    <div className="mt-5 grid gap-4">
      {error && <p role="alert" className="rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
      {notice && <CredentialsNotice email={notice.email} password={notice.password} />}
      <form className="grid gap-3 rounded-2xl border border-fg/10 bg-fg/[0.03] p-4 sm:grid-cols-4" onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          const r = await superadminApi.createCreatorAccount({ name: form.name, email: form.email, whatsapp: form.whatsapp || undefined });
          if (r) { setNotice({ email: r.creator.email, password: r.password }); setForm({ name: "", email: "", whatsapp: "" }); }
        });
      }}>
        <label className="text-sm text-fg/60">Nama kreator<input className={inputClass} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="text-sm text-fg/60">Email<input type="email" className={inputClass} required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label className="text-sm text-fg/60">WhatsApp (opsional)<input className={inputClass} value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></label>
        <button type="submit" disabled={busy} className="self-end rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold disabled:opacity-40">Buat akun</button>
      </form>
      {rows === null ? (error ? null : <p role="status" className="text-sm text-fg/50">Memuat akun…</p>) : rows.length === 0 ? <p className="text-sm text-fg/45">Belum ada akun kreator.</p> : rows.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-fg/10 bg-fg/[0.03] p-4">
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{r.name} <span className="font-normal text-fg/40">· {r.email}</span></div>
            <div className="text-xs text-fg/40">{r.templateCount} template · terakhir masuk {fmt(r.lastLoginAt)}</div>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${r.status === "active" ? "bg-emerald-500/20 text-emerald-200" : "bg-red-500/20 text-red-200"}`}>{r.status === "active" ? "Aktif" : "Ditangguhkan"}</span>
          <button type="button" disabled={busy} onClick={() => void run(async () => { const x = await superadminApi.resetCreatorPassword(r.id); if (x) setNotice({ email: r.email, password: x.password }); })} className="rounded-xl bg-fg/10 px-4 py-2 text-sm font-semibold hover:bg-fg/15">Reset password</button>
          <button type="button" disabled={busy} onClick={() => void run(async () => { if (r.status === "active") { const hide = window.confirm(`Tangguhkan ${r.name}?\n\nOK = tangguhkan DAN sembunyikan template-nya dari katalog.\nBatal = lanjut pilihan berikutnya.`); if (!hide && !window.confirm("Tangguhkan akun saja (template yang sudah terbit tetap tampil)?")) return; await superadminApi.setCreatorAccountStatus(r.id, "suspended", hide); } else { await superadminApi.setCreatorAccountStatus(r.id, "active"); } })} className="rounded-xl bg-fg/10 px-4 py-2 text-sm font-semibold hover:bg-fg/15">{r.status === "active" ? "Tangguhkan" : "Aktifkan"}</button>
        </div>
      ))}
    </div>
  );
}

function FramePreview({ t }: { t: CreatorTemplateReview }) {
  if (!t.frameUrl || !t.canvasWidth) return <div className="grid aspect-[2/3] w-40 place-items-center rounded-xl bg-fg/5 text-xs text-fg/30">Tanpa frame</div>;
  return (
    <div className="relative w-44 shrink-0 overflow-hidden rounded-xl bg-[repeating-conic-gradient(#2a2a33_0%_25%,#1c1c22_0%_50%)] [background-size:16px_16px]" style={{ aspectRatio: `${t.canvasWidth} / ${t.canvasHeight}` }}>
      {t.slots.map((s, i) => (
        <div key={i} className="absolute grid place-items-center bg-accent/40 text-[10px] font-bold text-fg outline outline-1 outline-accent" style={{ left: `${(s.x / t.canvasWidth) * 100}%`, top: `${(s.y / t.canvasHeight) * 100}%`, width: `${(s.w / t.canvasWidth) * 100}%`, height: `${(s.h / t.canvasHeight) * 100}%`, transform: s.rotation ? `rotate(${s.rotation}deg)` : undefined }}>{i + 1}</div>
      ))}
      <img src={assetUrl(t.frameUrl)} alt={`Frame ${t.name}`} className="absolute inset-0 h-full w-full" />
    </div>
  );
}

const STATUS: Record<CreatorTemplateReview["status"], { label: string; tone: string }> = {
  pending: { label: "Menunggu tinjauan", tone: "bg-amber-500/20 text-amber-200" },
  approved: { label: "Terbit", tone: "bg-emerald-500/20 text-emerald-200" },
  rejected: { label: "Ditolak", tone: "bg-red-500/20 text-red-200" },
  draft: { label: "Draft", tone: "bg-fg/10 text-fg/50" },
};

const CHECK_TONE: Record<ReviewCheck["status"], string> = { ok: "text-emerald-400", warn: "text-amber-400", fail: "text-red-400" };
const CHECK_MARK: Record<ReviewCheck["status"], string> = { ok: "✓", warn: "!", fail: "✕" };

function ReviewRow({ t, presets, onChanged }: { t: CreatorTemplateReview; presets: string[]; onChanged: () => void }) {
  const [note, setNote] = useState("");
  const [featured, setFeatured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setError(""); try { await fn(); onChanged(); } catch (e) { setError(e instanceof Error ? e.message : "Gagal"); } finally { setBusy(false); } };
  const failed = (t.checks ?? []).filter((c) => c.status === "fail");
  const warned = (t.checks ?? []).filter((c) => c.status === "warn");
  const stats = t.creatorStats;
  // One click turns the failed/warned checks into a rejection note the creator can act on.
  const noteFromChecks = () => setNote([...failed, ...warned].map((c) => `${c.label}: ${c.detail}`).join(". ").slice(0, 600));
  return (
    <div className="flex flex-wrap gap-5 rounded-2xl border border-fg/10 bg-fg/[0.03] p-4">
      <FramePreview t={t} />
      <div className="min-w-[260px] flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-semibold">{t.name}</h3>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS[t.status].tone}`}>{STATUS[t.status].label}</span>
          {t.status === "pending" && t.waitingDays !== null && t.waitingDays !== undefined && (
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${t.waitingDays >= 3 ? "bg-red-500/20 text-red-300" : "bg-fg/10 text-fg/55"}`}>{t.waitingDays === 0 ? "Masuk hari ini" : `Menunggu ${t.waitingDays} hari`}</span>
          )}
        </div>
        <p className="mt-1 text-xs text-fg/40">Oleh {t.creatorName} ({t.creatorEmail}) · dikirim {fmt(t.submittedAt)}</p>
        {stats && <p className="mt-1 text-xs text-fg/45">Riwayat kreator: {stats.approved} terbit · {stats.rejected} ditolak · {stats.total} total{stats.total <= 1 ? " — kreator baru, tinjau lebih teliti" : ""}</p>}
        <p className="mt-2 text-sm text-fg/70">{t.description || "—"}</p>
        <p className="mt-2 text-xs text-fg/45">{t.category} · {t.orientation} · {t.canvasWidth}×{t.canvasHeight}px · {t.slots.length} slot foto · cetak {t.outputPreset}</p>
        {t.status === "rejected" && t.reviewNote && <p className="mt-2 text-sm text-red-200/80">Alasan penolakan: {t.reviewNote}</p>}

        {t.status === "pending" && (t.checks?.length ?? 0) > 0 && (
          <details className="mt-3 rounded-xl border border-fg/10 bg-fg/[0.03] p-3" open={failed.length + warned.length > 0}>
            <summary className="cursor-pointer text-sm font-semibold">
              Pemeriksaan otomatis <span className="ml-1 font-normal text-fg/50">{failed.length ? `${failed.length} gagal` : "tidak ada yang gagal"}{warned.length ? ` · ${warned.length} perhatian` : ""}</span>
            </summary>
            <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
              {t.checks!.map((c) => (
                <li key={c.id} className="flex gap-2"><span className={`w-4 shrink-0 text-center font-bold ${CHECK_TONE[c.status]}`}>{CHECK_MARK[c.status]}</span><span><span className="font-medium">{c.label}</span> <span className="text-fg/50">— {c.detail}</span></span></li>
              ))}
            </ul>
          </details>
        )}

        {t.status === "pending" && (
          <div className="mt-4 grid gap-3">
            <div>
              <label className="text-sm text-fg/60">Catatan jika ditolak (dikirim ke kreator lewat portal & email)
                <textarea rows={2} maxLength={600} className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Jelaskan apa yang perlu diperbaiki" />
              </label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {failed.length + warned.length > 0 && <button type="button" onClick={noteFromChecks} className="rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent hover:bg-accent/25">Isi dari pemeriksaan</button>}
                {presets.map((p) => <button key={p} type="button" onClick={() => setNote(p)} title={p} className="max-w-[220px] truncate rounded-full bg-fg/10 px-3 py-1 text-xs text-fg/60 hover:bg-fg/15 hover:text-fg">{p}</button>)}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-fg/60"><input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} /> Tandai unggulan</label>
              <button type="button" disabled={busy} onClick={() => { if (failed.length && !window.confirm(`${failed.length} pemeriksaan gagal (${failed.map((c) => c.label).join(", ")}). Tetap setujui?`)) return; void run(() => superadminApi.approveCreatorTemplate(t.id, featured)); }} className="rounded-xl bg-emerald-500/80 px-4 py-2 text-sm font-semibold text-black disabled:opacity-40">{busy ? "Memproses…" : "Setujui & terbitkan"}</button>
              <button type="button" disabled={busy || note.trim().length < 5} onClick={() => void run(() => superadminApi.rejectCreatorTemplate(t.id, note))} className="rounded-xl bg-fg/10 px-4 py-2 text-sm font-semibold hover:bg-fg/15 disabled:opacity-40">Tolak dengan catatan</button>
              <WhatsAppFollowUp phone={t.creatorWhatsapp} context="creator" vars={{ owner: t.creatorName, business: t.name }} />
              {error && <span role="alert" className="text-sm text-red-300">{error}</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const LOG_LABEL: Record<string, string> = {
  "creator_template.approved": "Disetujui", "creator_template.rejected": "Ditolak", "creator_template.submitted": "Dikirim",
  "creator.suspended": "Ditangguhkan", "creator.reactivated": "Diaktifkan", "marketplace.published": "Diterbitkan", "marketplace.updated": "Diubah", "marketplace.removed": "Dihapus",
};

/** Audit trail of every moderation decision: who approved, rejected, hid or removed what, and when. */
export function ModerationLog() {
  const [rows, setRows] = useState<ModerationLogEntry[] | null>(null);
  useEffect(() => { superadminApi.getModerationLog().then((r) => setRows(r ?? [])).catch(() => setRows([])); }, []);
  return (
    <details className="mt-6 rounded-2xl border border-fg/10 bg-fg/[0.03] p-4">
      <summary className="cursor-pointer text-sm font-semibold">Riwayat moderasi {rows ? `(${rows.length})` : ""}</summary>
      {rows === null ? <p className="mt-3 text-sm text-fg/50">Memuat…</p> : rows.length === 0 ? <p className="mt-3 text-sm text-fg/45">Belum ada aktivitas.</p> : (
        <ul className="mt-3 divide-y divide-fg/10 text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 py-2">
              <span className="rounded-full bg-fg/10 px-2.5 py-0.5 text-[11px] font-semibold text-fg/65">{LOG_LABEL[r.action] ?? r.action}</span>
              <span className="min-w-0 flex-1 text-fg/75">{r.message}</span>
              <span className="text-xs text-fg/40">{fmt(r.createdAt)}{r.actorLabel ? ` · ${r.actorLabel}` : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

export function CreatorReviewPanel() {
  const [rows, setRows] = useState<CreatorTemplateReview[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "">("pending");
  const [summary, setSummary] = useState<{ pending: number; oldestWaitingDays: number | null; rejectionPresets: string[] } | null>(null);

  const load = () => {
    superadminApi.getCreatorTemplates(filter).then((r) => { setRows(r ?? []); setError(""); }).catch((e) => setError(e instanceof Error ? e.message : "Gagal memuat"));
    superadminApi.getCreatorQueueSummary().then((x) => setSummary(x ?? null)).catch(() => undefined);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setRows(null); load(); }, [filter]);

  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-2 text-sm">
        {([["pending", "Menunggu"], ["approved", "Terbit"], ["rejected", "Ditolak"], ["", "Semua"]] as const).map(([k, label]) => (
          <button key={k || "all"} type="button" onClick={() => setFilter(k)} className={`rounded-full px-4 py-1.5 font-semibold ${filter === k ? "bg-accent text-white" : "bg-fg/10 text-fg/60 hover:bg-fg/15"}`}>{label}</button>
        ))}
      </div>
      {summary && summary.pending > 0 && (
        <p className={`mt-4 rounded-2xl px-4 py-3 text-sm ${summary.oldestWaitingDays !== null && summary.oldestWaitingDays >= 3 ? "border border-red-400/30 bg-red-500/10 text-red-300" : "border border-fg/10 bg-fg/[0.04] text-fg/60"}`}>
          <strong className="text-fg">{summary.pending} template</strong> menunggu tinjauan{summary.oldestWaitingDays !== null ? ` · yang terlama sudah ${summary.oldestWaitingDays === 0 ? "masuk hari ini" : `${summary.oldestWaitingDays} hari`}` : ""}. Antrean diurutkan dari yang paling lama.
        </p>
      )}
      {error && <p role="alert" className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
      <div className="mt-4 grid gap-3">
        {rows === null ? (error ? null : <p role="status" className="text-sm text-fg/50">Memuat template…</p>) : rows.length === 0 ? <p className="text-sm text-fg/45">{filter === "pending" ? "Tidak ada template yang menunggu tinjauan." : "Tidak ada template."}</p> : rows.map((t) => <ReviewRow key={t.id} t={t} presets={summary?.rejectionPresets ?? []} onChanged={load} />)}
      </div>
      <ModerationLog />
    </div>
  );
}
