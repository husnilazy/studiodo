import type { ReactNode } from "react";
import type { CsPost, CsPostStatus } from "@/lib/superadminApi";

// Shared bits for the Konten Instagram screens.

export const inputClass = "mt-1 w-full rounded-lg border border-fg/15 bg-fg/5 px-3 py-2 text-sm outline-none focus:border-accent";
export const btnPrimary = "rounded-full bg-fg px-4 py-2 text-xs font-bold text-canvas transition hover:opacity-90 disabled:opacity-40";
export const btnAccent = "rounded-full bg-accent px-4 py-2 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-40";
export const btnGhost = "whitespace-nowrap rounded-full border border-fg/20 px-3.5 py-1.5 text-xs font-semibold transition hover:bg-fg/10 disabled:opacity-40";

export const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
export const DAY_LONG = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export const fileSize = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

/** ISO (UTC) -> "YYYY-MM-DDTHH:mm" wall clock in the configured zone, for <input type="datetime-local">. */
export const toLocalInput = (iso: string, tzMin: number) => new Date(new Date(iso).getTime() + tzMin * 60_000).toISOString().slice(0, 16);
/** Inverse of toLocalInput. */
export const fromLocalInput = (v: string, tzMin: number) => new Date(Date.parse(`${v}:00Z`) - tzMin * 60_000).toISOString();
export const dayKey = (iso: string, tzMin: number) => toLocalInput(iso, tzMin).slice(0, 10);
export const timeOf = (iso: string, tzMin: number) => toLocalInput(iso, tzMin).slice(11, 16);
export function dayLabel(key: string, todayKey: string) {
  const [y, m, d] = key.split("-").map(Number);
  const wd = DAY_LONG[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const diff = Math.round((Date.UTC(y, m - 1, d) - Date.parse(`${todayKey}T00:00:00Z`)) / 86_400_000);
  const rel = diff === 0 ? "Hari ini · " : diff === 1 ? "Besok · " : "";
  return `${rel}${wd}, ${d} ${MONTHS[m - 1]}`;
}

export const STATUS: Record<CsPostStatus, { label: string; cls: string }> = {
  draft: { label: "Draf · perlu disetujui", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  scheduled: { label: "Terjadwal", cls: "bg-accent/15 text-accent" },
  preparing: { label: "Merender…", cls: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  ready: { label: "Siap tayang", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  posting: { label: "Mengirim…", cls: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  posted: { label: "Sudah tayang", cls: "bg-fg/10 text-fg/60" },
  failed: { label: "Gagal", cls: "bg-red-500/15 text-red-600" },
  skipped: { label: "Dilewati", cls: "bg-fg/10 text-fg/40" },
};

/** Posts published today (local day) against the per-day safety cap: an auto post that is ready waits while this is full. */
export function capToday(posts: Pick<CsPost, "status" | "postedAt">[], maxPerDay: number, tzMin: number) {
  const today = dayKey(new Date().toISOString(), tzMin);
  const postedToday = posts.filter((p) => p.status === "posted" && p.postedAt && dayKey(p.postedAt, tzMin) === today).length;
  return { postedToday, maxPerDay, reached: postedToday >= maxPerDay };
}

export function StatusChip({ post }: { post: Pick<CsPost, "status"> }) {
  const s = STATUS[post.status];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${s.cls}`}>{s.label}</span>;
}

export function Card({ title, hint, action, children, className = "" }: { title?: string; hint?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-fg/10 bg-fg/5 p-4 ${className}`}>
      {(title || action) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div><h3 className="text-sm font-bold">{title}</h3>{hint && <p className="mt-0.5 text-xs text-fg/50">{hint}</p>}</div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block text-xs font-semibold text-fg/60">{label}{children}{hint && <span className="mt-1 block text-[11px] font-normal text-fg/40">{hint}</span>}</label>;
}

export function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex w-full items-center justify-between gap-4 rounded-xl border border-fg/10 px-4 py-3 text-left transition hover:border-fg/30">
      <span><span className="block text-sm font-semibold">{label}</span>{hint && <span className="block text-xs text-fg/50">{hint}</span>}</span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-accent" : "bg-fg/20"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} /></span>
    </button>
  );
}

export type Notice = { ok: boolean; text: string } | null;
export function NoticeLine({ n }: { n: Notice }) {
  return n ? <p className={`text-xs ${n.ok ? "text-emerald-600" : "text-red-500"}`}>{n.text}</p> : null;
}

export const errText = (e: unknown, fallback = "Terjadi kesalahan") => (e instanceof Error ? e.message : fallback);
