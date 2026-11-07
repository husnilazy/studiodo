import { useEffect, useState } from "react";
import { api, type ReadinessCheck } from "@/lib/api";

// "Kesiapan booth": a plain-language checklist at the top of the dashboard, so a tenant sees what is still missing (storage, payment,
// packages, frames, booths, subscription) and where to fix it, instead of finding out from a failed upload or a customer who cannot pay.

const ICON: Record<ReadinessCheck["status"], { symbol: string; tone: string; label: string }> = {
  ok: { symbol: "✓", tone: "bg-emerald-500/15 text-emerald-600", label: "Siap" },
  warn: { symbol: "!", tone: "bg-amber-500/15 text-amber-600", label: "Perlu dicek" },
  error: { symbol: "✕", tone: "bg-red-500/15 text-red-500", label: "Belum siap" },
};

export default function ReadinessCard({ onGo }: { onGo: (target: string) => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getReadiness>> | null>(null);
  const [open, setOpen] = useState<boolean | null>(null); // null = decide from the result: open when something needs attention
  const [loadError, setLoadError] = useState(false);

  const load = () => { setLoadError(false); api.getReadiness().then((r) => setData(r ?? null)).catch(() => setLoadError(true)); };
  useEffect(load, []);

  if (loadError) return null; // a failed check must never block the dashboard
  if (!data) return null;

  const needs = data.checks.filter((c) => c.status !== "ok");
  const expanded = open ?? needs.length > 0;
  const allGood = needs.length === 0;

  return (
    <section className={`mb-4 rounded-2xl border p-4 ${allGood ? "border-emerald-400/30 bg-emerald-500/5" : data.ready ? "border-amber-400/30 bg-amber-500/5" : "border-red-400/30 bg-red-500/5"}`} aria-label="Kesiapan booth">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{allGood ? "Semua siap. Booth kamu bisa dipakai customer." : data.ready ? "Hampir siap. Ada yang perlu dicek." : "Booth belum siap dipakai. Selesaikan langkah di bawah."}</p>
          <p className="text-xs text-fg/55">{data.done} dari {data.total} langkah sudah siap{needs.length ? ` · ${needs.length} perlu perhatian` : ""}</p>
        </div>
        <div className="hidden h-2 w-32 overflow-hidden rounded-full bg-fg/10 sm:block" aria-hidden><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.round((data.done / Math.max(1, data.total)) * 100)}%` }} /></div>
        <button type="button" onClick={() => setOpen(!expanded)} className="rounded-full border border-fg/15 px-3 py-1.5 text-xs font-semibold">{expanded ? "Sembunyikan" : "Lihat detail"}</button>
        <button type="button" onClick={load} className="rounded-full border border-fg/15 px-3 py-1.5 text-xs font-semibold" title="Periksa ulang">↻</button>
      </div>
      {expanded && (
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          {data.checks.map((c) => (
            <li key={c.id} className="flex items-start gap-3 rounded-xl border border-fg/10 bg-surface px-3 py-2.5">
              <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${ICON[c.status].tone}`} aria-label={ICON[c.status].label}>{ICON[c.status].symbol}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{c.title}</p>
                <p className="text-xs leading-relaxed text-fg/60">{c.message}</p>
                {c.action && <button type="button" onClick={() => onGo(c.action!.target)} className="mt-1.5 rounded-lg bg-accent px-3 py-1 text-xs font-semibold text-white">{c.action.label}</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
