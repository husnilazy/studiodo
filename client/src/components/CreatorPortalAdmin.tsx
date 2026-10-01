import { useEffect, useState } from "react";
import { getApiBaseUrl } from "@/lib/apiConfig";
import { superadminApi, type CreatorAccount, type CreatorTemplateReview } from "@/lib/superadminApi";

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
          <button type="button" disabled={busy} onClick={() => void run(async () => { await superadminApi.setCreatorAccountStatus(r.id, r.status === "active" ? "suspended" : "active"); })} className="rounded-xl bg-fg/10 px-4 py-2 text-sm font-semibold hover:bg-fg/15">{r.status === "active" ? "Tangguhkan" : "Aktifkan"}</button>
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

function ReviewRow({ t, onChanged }: { t: CreatorTemplateReview; onChanged: () => void }) {
  const [note, setNote] = useState("");
  const [featured, setFeatured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setError(""); try { await fn(); onChanged(); } catch (e) { setError(e instanceof Error ? e.message : "Gagal"); } finally { setBusy(false); } };
  return (
    <div className="flex flex-wrap gap-5 rounded-2xl border border-fg/10 bg-fg/[0.03] p-4">
      <FramePreview t={t} />
      <div className="min-w-[240px] flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-semibold">{t.name}</h3>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS[t.status].tone}`}>{STATUS[t.status].label}</span>
        </div>
        <p className="mt-1 text-xs text-fg/40">Oleh {t.creatorName} ({t.creatorEmail}) · dikirim {fmt(t.submittedAt)}</p>
        <p className="mt-2 text-sm text-fg/70">{t.description || "—"}</p>
        <p className="mt-2 text-xs text-fg/45">{t.category} · {t.orientation} · {t.canvasWidth}×{t.canvasHeight}px · {t.slots.length} slot foto · cetak {t.outputPreset}</p>
        {t.status === "rejected" && t.reviewNote && <p className="mt-2 text-sm text-red-200/80">Alasan penolakan: {t.reviewNote}</p>}
        {t.status === "pending" && (
          <div className="mt-4 grid gap-3">
            <label className="text-sm text-fg/60">Catatan jika ditolak (dikirim ke kreator)<textarea rows={2} maxLength={600} className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. Slot kedua terlalu dekat tepi frame" /></label>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-fg/60"><input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} /> Tandai unggulan</label>
              <button type="button" disabled={busy} onClick={() => void run(() => superadminApi.approveCreatorTemplate(t.id, featured))} className="rounded-xl bg-emerald-500/80 px-4 py-2 text-sm font-semibold text-black disabled:opacity-40">Setujui &amp; terbitkan</button>
              <button type="button" disabled={busy || note.trim().length < 5} onClick={() => void run(() => superadminApi.rejectCreatorTemplate(t.id, note))} className="rounded-xl bg-fg/10 px-4 py-2 text-sm font-semibold hover:bg-fg/15 disabled:opacity-40">Tolak</button>
              {error && <span role="alert" className="text-sm text-red-300">{error}</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function CreatorReviewPanel() {
  const [rows, setRows] = useState<CreatorTemplateReview[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "">("pending");

  const load = () => { superadminApi.getCreatorTemplates(filter).then((r) => { setRows(r ?? []); setError(""); }).catch((e) => setError(e instanceof Error ? e.message : "Gagal memuat")); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setRows(null); load(); }, [filter]);

  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-2 text-sm">
        {([["pending", "Menunggu"], ["approved", "Terbit"], ["rejected", "Ditolak"], ["", "Semua"]] as const).map(([k, label]) => (
          <button key={k || "all"} type="button" onClick={() => setFilter(k)} className={`rounded-full px-4 py-1.5 font-semibold ${filter === k ? "bg-accent text-white" : "bg-fg/10 text-fg/60 hover:bg-fg/15"}`}>{label}</button>
        ))}
      </div>
      {error && <p role="alert" className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
      <div className="mt-4 grid gap-3">
        {rows === null ? (error ? null : <p role="status" className="text-sm text-fg/50">Memuat template…</p>) : rows.length === 0 ? <p className="text-sm text-fg/45">{filter === "pending" ? "Tidak ada template yang menunggu tinjauan." : "Tidak ada template."}</p> : rows.map((t) => <ReviewRow key={t.id} t={t} onChanged={load} />)}
      </div>
    </div>
  );
}
