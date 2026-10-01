import { useEffect, useState } from "react";
import { superadminApi, type CreatorSubmission } from "@/lib/superadminApi";

// Review queue for template designers who applied through the website's /kreator form.

const STATUS_LABEL: Record<CreatorSubmission["status"], string> = { new: "Baru", reviewing: "Ditinjau", accepted: "Diterima", rejected: "Ditolak" };
const STATUS_TONE: Record<CreatorSubmission["status"], string> = {
  new: "bg-accent/20 text-accent",
  reviewing: "bg-amber-500/20 text-amber-200",
  accepted: "bg-emerald-500/20 text-emerald-200",
  rejected: "bg-white/10 text-white/45",
};
const inputClass = "mt-1 w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm outline-none focus:border-accent";
const fmt = (v: string) => new Date(v).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function Row({ item, onChanged }: { item: CreatorSubmission; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(item.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError("");
    try { await fn(); onChanged(); } catch (e) { setError(e instanceof Error ? e.message : "Gagal"); } finally { setBusy(false); }
  };
  const safeUrl = /^https?:\/\//i.test(item.portfolioUrl) ? item.portfolioUrl : undefined;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{item.name} <span className="font-normal text-white/40">· {item.email}</span></div>
          <div className="text-xs text-white/40">{fmt(item.createdAt)}{item.whatsapp ? ` · WA ${item.whatsapp}` : ""}</div>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_TONE[item.status]}`}>{STATUS_LABEL[item.status]}</span>
        <button type="button" onClick={() => setOpen(!open)} className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/15">{open ? "Tutup" : "Detail"}</button>
      </div>
      {open && (
        <div className="mt-4 grid gap-4 border-t border-white/10 pt-4">
          <div className="text-sm text-white/60">
            Portofolio: {safeUrl ? <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="break-all font-semibold text-accent underline">{item.portfolioUrl}</a> : <span className="break-all">{item.portfolioUrl}</span>}
          </div>
          {item.description && <p className="whitespace-pre-line text-sm text-white/70">{item.description}</p>}
          <label className="text-sm text-white/60">Catatan internal<textarea rows={2} maxLength={1000} className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <div className="flex flex-wrap items-center gap-2">
            {(["reviewing", "accepted", "rejected"] as const).map((s) => (
              <button key={s} type="button" disabled={busy || item.status === s} onClick={() => run(() => superadminApi.updateCreatorSubmission(item.id, { status: s, note }))} className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/15 disabled:opacity-40">
                {s === "reviewing" ? "Tandai ditinjau" : s === "accepted" ? "Terima" : "Tolak"}
              </button>
            ))}
            <button type="button" disabled={busy || note === (item.note ?? "")} onClick={() => run(() => superadminApi.updateCreatorSubmission(item.id, { note }))} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold disabled:opacity-40">Simpan catatan</button>
            <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Hapus pendaftaran ${item.name}?`)) run(() => superadminApi.deleteCreatorSubmission(item.id)); }} className="rounded-xl px-3 py-2 text-sm text-red-300 hover:bg-red-500/15">Hapus</button>
            {error && <span role="alert" className="text-sm text-red-300">{error}</span>}
          </div>
          {item.reviewedBy && item.reviewedAt && <p className="text-xs text-white/35">Terakhir ditinjau oleh {item.reviewedBy} · {fmt(item.reviewedAt)}</p>}
        </div>
      )}
    </div>
  );
}

export function CreatorsPanel() {
  const [items, setItems] = useState<CreatorSubmission[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | CreatorSubmission["status"]>("all");

  const load = () => { superadminApi.getCreatorSubmissions().then((r) => { setItems(r ?? []); setError(""); }).catch((e) => setError(e instanceof Error ? e.message : "Gagal memuat")); };
  useEffect(load, []);

  const shown = (items ?? []).filter((i) => filter === "all" || i.status === filter);
  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-6">
      <p className="text-xs uppercase tracking-[.16em] text-accent">KREATOR</p>
      <h2 className="mt-2 font-display text-xl font-semibold">Pendaftaran kreator template</h2>
      <p className="mt-1 text-sm text-white/45">Masuk dari form di halaman /kreator. Jika diterima, hubungi kreatornya, lalu terbitkan template lewat tab Marketplace.</p>
      {error && <p role="alert" className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        {(["all", "new", "reviewing", "accepted", "rejected"] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-full px-4 py-1.5 font-semibold ${filter === f ? "bg-accent text-white" : "bg-white/10 text-white/60 hover:bg-white/15"}`}>
            {f === "all" ? "Semua" : STATUS_LABEL[f]}{items && f !== "all" ? ` (${items.filter((i) => i.status === f).length})` : ""}
          </button>
        ))}
      </div>
      <div className="mt-5 grid gap-3">
        {items === null ? null : shown.length === 0 ? <p className="text-sm text-white/45">Tidak ada pendaftaran.</p> : shown.map((i) => <Row key={i.id} item={i} onChanged={load} />)}
      </div>
    </section>
  );
}
