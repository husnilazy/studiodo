import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type LiveBooth, type LiveData } from "@/lib/api";
import { panel } from "@/lib/adminUi";
import { Icon } from "@/components/kiosk/Icons";
import Spinner from "@/components/Spinner";
import { duration, relativeTime, rupiah, rupiahShort } from "@/lib/crmFormat";

// Live monitor: every booth of the account on one screen — who is mid-session, who is waiting to pay, who went offline.
// Booths don't report their screen, so the stage is inferred from the session the kiosk keeps updating (server/lib/live.ts).

const POLL_MS = 8000;

const STATE: Record<LiveBooth["state"], { label: string; dot: string; chip: string; rank: number }> = {
  capture: { label: "Sedang sesi foto", dot: "bg-emerald-400", chip: "border-emerald-400/30 bg-emerald-400/10 text-emerald-500", rank: 0 },
  review: { label: "Preview & cetak", dot: "bg-sky-400", chip: "border-sky-400/30 bg-sky-400/10 text-sky-500", rank: 1 },
  payment: { label: "Menunggu pembayaran", dot: "bg-amber-400", chip: "border-amber-400/30 bg-amber-400/10 text-amber-500", rank: 2 },
  idle: { label: "Siaga", dot: "bg-fg/40", chip: "border-fg/15 bg-fg/[0.04] text-fg/60", rank: 3 },
  offline: { label: "Offline", dot: "bg-fg/20", chip: "border-fg/10 bg-fg/[0.03] text-fg/40", rank: 4 },
  locked: { label: "Terkunci", dot: "bg-red-400", chip: "border-red-400/30 bg-red-400/10 text-red-500", rank: 5 },
};

const LOCK_TEXT: Record<string, string> = { unpaid: "Belum berlangganan", trial_expired: "Trial habis", expired: "Langganan habis", suspended: "Akun dinonaktifkan" };

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

function Tile({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: "good" | "warn" | "bad" }) {
  const color = tone === "good" ? "text-emerald-500" : tone === "warn" ? "text-amber-500" : tone === "bad" ? "text-red-500" : "text-fg";
  return (
    <div className={panel}>
      <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-fg/45">{label}</p>
      <p className={`mt-2 font-display text-3xl font-semibold tracking-tight ${color}`}>{value}</p>
      {detail && <p className="mt-1 text-xs text-fg/45">{detail}</p>}
    </div>
  );
}

function BoothCard({ booth, now }: { booth: LiveBooth; now: number }) {
  const st = STATE[booth.state];
  const cur = booth.current;
  const progress = cur && cur.photoTarget ? Math.min(100, Math.round((cur.photoCount / cur.photoTarget) * 100)) : cur?.stage === "review" ? 100 : 0;
  const issues = booth.diagnostics ? [!booth.diagnostics.cameraOk && "Kamera", !booth.diagnostics.printerOk && "Printer", !booth.diagnostics.networkOk && "Jaringan"].filter(Boolean) as string[] : [];
  const active = booth.state === "capture" || booth.state === "review" || booth.state === "payment";
  return (
    <li className={`${panel} flex flex-col gap-4 ${active ? "border-accent/40" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-xl font-semibold">{booth.label}</h3>
          <p className="mt-0.5 text-xs text-fg/45">
            {booth.appVersion ? `v${booth.appVersion} · ` : ""}{booth.state === "offline" ? `terakhir terlihat ${relativeTime(booth.lastUsedAt, now)}` : booth.paired ? "terhubung" : "belum dipasangkan"}
          </p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${st.chip}`}>
          <span className={`h-2 w-2 rounded-full ${st.dot} ${active ? "animate-pulse" : ""}`} />{st.label}
        </span>
      </div>

      {cur ? (
        <div className="rounded-2xl bg-fg/[0.04] p-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-semibold">{cur.packageName ?? "Sesi"}</p>
            <p className="text-sm tabular-nums text-fg/55">{duration(now - new Date(cur.startedAt).getTime())}</p>
          </div>
          <p className="mt-1 text-xs text-fg/50">
            {cur.stage === "payment" ? "Pelanggan memilih paket / membayar" : cur.stage === "capture" ? `Foto ${cur.photoCount}${cur.photoTarget ? ` dari ${cur.photoTarget}` : ""}` : "Memilih frame, preview, dan cetak"}
            {cur.amount > 0 ? ` · ${rupiah(cur.amount)}` : ""}
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-fg/10"><div className="h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${progress}%` }} /></div>
          {booth.waiting > 0 && <p className="mt-2 text-xs font-medium text-amber-500">+{booth.waiting} sesi lain menunggu pembayaran</p>}
        </div>
      ) : booth.state === "locked" ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-400/[0.06] p-4 text-sm text-red-500">{LOCK_TEXT[booth.lockReason ?? ""] ?? "Booth terkunci"} — booth tidak bisa dipakai pelanggan.</div>
      ) : (
        <div className="rounded-2xl bg-fg/[0.03] p-4 text-sm text-fg/45">{booth.state === "offline" ? "Tidak ada kabar dari booth ini." : "Tidak ada sesi berjalan."}</div>
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-fg/[0.03] py-2"><p className="font-display text-lg font-semibold tabular-nums">{booth.today.sessions}</p><p className="text-[10px] uppercase tracking-wider text-fg/40">Sesi hari ini</p></div>
        <div className="rounded-xl bg-fg/[0.03] py-2"><p className="font-display text-lg font-semibold tabular-nums">{booth.today.photos}</p><p className="text-[10px] uppercase tracking-wider text-fg/40">Foto</p></div>
        <div className="rounded-xl bg-fg/[0.03] py-2"><p className="font-display text-lg font-semibold tabular-nums">{rupiah(booth.today.revenue).replace("Rp", "").trim()}</p><p className="text-[10px] uppercase tracking-wider text-fg/40">Rupiah</p></div>
      </div>

      {(issues.length > 0 || (booth.licenseType === "trial" && booth.state !== "locked") || (booth.daysRemaining !== null && booth.daysRemaining <= 7 && booth.state !== "locked")) && (
        <div className="flex flex-wrap gap-2">
          {issues.map((i) => <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-red-400/30 px-2.5 py-1 text-[11px] font-medium text-red-500"><Icon name="warning" className="h-3 w-3" />{i} bermasalah</span>)}
          {booth.licenseType === "trial" && booth.state !== "locked" && <span className="rounded-full border border-amber-400/30 px-2.5 py-1 text-[11px] font-medium text-amber-500">Trial · {Math.max(0, booth.daysRemaining ?? 0)} hari lagi</span>}
          {booth.licenseType === "paid" && booth.daysRemaining !== null && booth.daysRemaining <= 7 && booth.state !== "locked" && <span className="rounded-full border border-amber-400/30 px-2.5 py-1 text-[11px] font-medium text-amber-500">Langganan berakhir {booth.daysRemaining} hari lagi</span>}
        </div>
      )}
    </li>
  );
}

export default function LiveMonitorPanel() {
  const [data, setData] = useState<LiveData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "attention">("all");
  const [query, setQuery] = useState("");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const now = useNow(1000);

  const load = useCallback(async () => {
    try {
      const result = await api.getLive();
      if (result) { setData(result); setUpdatedAt(Date.now()); setError(null); }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat");
    }
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(t); document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

  const booths = useMemo(() => {
    const list = (data?.booths ?? []).filter((b) => {
      if (query.trim() && !b.label.toLowerCase().includes(query.trim().toLowerCase())) return false;
      if (filter === "active") return b.state === "capture" || b.state === "review" || b.state === "payment";
      if (filter === "attention") return b.state === "offline" || b.state === "locked" || (b.diagnostics && (!b.diagnostics.cameraOk || !b.diagnostics.printerOk || !b.diagnostics.networkOk));
      return true;
    });
    return [...list].sort((a, b) => STATE[a.state].rank - STATE[b.state].rank || a.label.localeCompare(b.label));
  }, [data, filter, query]);

  if (!data) {
    return <div className="flex items-center justify-center gap-3 py-24 text-fg/50">{error ? <span className="text-red-500">{error}</span> : <><Spinner /> Memuat monitor…</>}</div>;
  }
  const s = data.summary;
  const chip = (active: boolean) => `rounded-full px-4 py-2 text-sm font-semibold transition ${active ? "bg-accent text-white shadow-md shadow-accent/25" : "bg-fg/[0.06] text-fg/60 hover:text-fg"}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-xs text-fg/45">
          <span className={`h-2 w-2 rounded-full ${error ? "bg-red-400" : "animate-pulse bg-emerald-400"}`} />
          {error ? "Gagal memperbarui — mencoba lagi" : `Diperbarui otomatis tiap ${POLL_MS / 1000} detik${updatedAt ? ` · ${new Date(updatedAt).toLocaleTimeString("id-ID")}` : ""}`}
        </p>
        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-fg/15 px-4 py-2 text-sm font-medium text-fg/70 transition hover:border-accent hover:text-fg"><Icon name="refresh" className="h-4 w-4" />Muat ulang</button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Tile label="Booth aktif" value={`${s.online}/${s.booths}`} detail={s.offline > 0 ? `${s.offline} offline` : "Semua tersambung"} tone={s.offline > 0 ? "warn" : "good"} />
        <Tile label="Sedang sesi" value={String(s.inSession)} detail="Foto, preview, cetak" tone={s.inSession > 0 ? "good" : undefined} />
        <Tile label="Menunggu bayar" value={String(s.waitingPayment)} detail="Pelanggan di layar pembayaran" tone={s.waitingPayment > 0 ? "warn" : undefined} />
        <Tile label="Sesi hari ini" value={String(s.sessionsToday)} detail={`${s.paidToday} sudah bayar`} />
        <Tile label="Pendapatan hari ini" value={rupiahShort(s.revenueToday)} detail={s.locked > 0 ? `${s.locked} booth terkunci` : undefined} tone={s.locked > 0 ? "bad" : undefined} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {([["all", `Semua (${data.booths.length})`], ["active", "Sedang dipakai"], ["attention", "Perlu perhatian"]] as const).map(([v, l]) => <button key={v} type="button" onClick={() => setFilter(v)} className={chip(filter === v)}>{l}</button>)}
        {data.booths.length > 6 && (
          <label className="relative ml-auto">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg/35" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari booth…" className="w-56 rounded-xl border border-fg/15 bg-surface py-2.5 pl-9 pr-3 text-sm outline-none focus:border-accent" />
          </label>
        )}
      </div>

      {data.booths.length === 0 ? (
        <p className={`${panel} text-fg/55`}>Belum ada booth. Buat kiosk key di menu Kiosk lalu pasangkan di komputer booth.</p>
      ) : booths.length === 0 ? (
        <p className={`${panel} text-fg/55`}>Tidak ada booth di tampilan ini.</p>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{booths.map((b) => <BoothCard key={b.id} booth={b} now={now} />)}</ul>
      )}

      <section className={panel}>
        <h3 className="font-display text-xl font-semibold">Aktivitas terbaru hari ini</h3>
        {data.recent.length === 0 ? <p className="mt-3 text-sm text-fg/45">Belum ada sesi hari ini.</p> : (
          <ul className="mt-3 divide-y divide-fg/10">
            {data.recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div><span className="font-semibold">{r.booth}</span><span className="text-fg/45"> · {r.packageName ?? "Sesi"} · {relativeTime(r.at, now)}</span></div>
                <div className="flex items-center gap-2">
                  {r.hasContact && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">Kontak tersimpan</span>}
                  <span className="tabular-nums text-fg/60">{r.amount > 0 ? rupiah(r.amount) : "Gratis"}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${r.done ? "bg-emerald-400/15 text-emerald-500" : r.paymentStatus === "success" ? "bg-sky-400/15 text-sky-500" : "bg-amber-400/15 text-amber-500"}`}>{r.done ? "Selesai" : r.paymentStatus === "success" ? "Berjalan" : "Menunggu bayar"}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
