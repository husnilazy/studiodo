import { useCallback, useEffect, useState, type ReactNode } from "react";
import { superadminApi, type AnomalyItem, type DigestSettings, type FleetRow, type HealthLevel, type RevenueInsights, type TenantHealthRow } from "@/lib/superadminApi";
import { pushToast } from "@/lib/toastStore";
import { errMessage } from "@/lib/leadUi";
import Select from "@/components/Select";

// "Wawasan": what the owner should look at today — tenant health, money, booths, oddities and the morning summary.

const card = "rounded-2xl border border-fg/10 bg-fg/5 p-4";
const label = "text-xs font-semibold uppercase tracking-[0.16em] text-fg/50";
const rp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
const LEVEL: Record<HealthLevel, { text: string; tone: string; bar: string }> = {
  healthy: { text: "Sehat", tone: "bg-emerald-500/15 text-emerald-700", bar: "bg-emerald-500" },
  watch: { text: "Perlu perhatian", tone: "bg-amber-500/15 text-amber-700", bar: "bg-amber-500" },
  risk: { text: "Berisiko", tone: "bg-red-500/15 text-red-600", bar: "bg-red-500" },
};
type Tab = "health" | "revenue" | "fleet" | "anomalies" | "digest";
const TABS: [Tab, string][] = [["health", "Kesehatan tenant"], ["revenue", "Pendapatan & trial"], ["fleet", "Armada booth"], ["anomalies", "Anomali"], ["digest", "Ringkasan pagi"]];

function useLoad<T>(load: () => Promise<T | undefined>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => { setError(null); load().then((r) => setData(r ?? null)).catch((e) => setError(errMessage(e))); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [reload]);
  return { data, error, reload };
}

const Loading = ({ error }: { error: string | null }) => <p className={`text-sm ${error ? "text-red-500" : "text-fg/40"}`}>{error ?? "Memuat…"}</p>;
const Stat = ({ title, value, sub, tone }: { title: string; value: ReactNode; sub?: ReactNode; tone?: string }) => (
  <div className={card}><p className={label}>{title}</p><p className={`mt-2 font-display text-2xl font-bold ${tone ?? ""}`}>{value}</p>{sub && <p className="mt-1 text-xs text-fg/50">{sub}</p>}</div>
);

function HealthTab({ onOpenTenant }: { onOpenTenant: (id: string) => void }) {
  const { data, error } = useLoad(() => superadminApi.getInsightsHealth());
  const [filter, setFilter] = useState<HealthLevel | "all">("all");
  if (!data) return <Loading error={error} />;
  const rows = data.rows.filter((r) => filter === "all" || r.level === filter);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {(["risk", "watch", "healthy"] as HealthLevel[]).map((l) => (
          <button key={l} type="button" onClick={() => setFilter(filter === l ? "all" : l)} className={`${card} text-left transition hover:border-accent/50 ${filter === l ? "!border-accent" : ""}`}>
            <p className={label}>{LEVEL[l].text}</p><p className="mt-2 font-display text-3xl font-bold">{data.summary[l]}</p><p className="mt-1 text-xs text-fg/50">tenant</p>
          </button>
        ))}
      </div>
      <div className={`${card} !p-0 overflow-hidden`}>
        {rows.map((r) => (
          <button key={r.tenantId} type="button" onClick={() => onOpenTenant(r.tenantId)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 border-b border-fg/10 px-4 py-3 text-left transition last:border-0 hover:bg-fg/[0.04]">
            <div className="w-14 shrink-0"><div className="font-display text-xl font-bold leading-none">{r.score}</div><div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-fg/10"><div className={`h-full ${LEVEL[r.level].bar}`} style={{ width: `${r.score}%` }} /></div></div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{r.name}</p>
              <p className="truncate text-xs text-fg/50">{r.reasons.length ? r.reasons.join(" · ") : "Tidak ada masalah"}</p>
            </div>
            <span className="text-xs text-fg/50">{r.sessions30} sesi/30h · {r.online}/{r.keys} online</span>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${LEVEL[r.level].tone}`}>{LEVEL[r.level].text}</span>
          </button>
        ))}
        {rows.length === 0 && <p className="px-4 py-6 text-sm text-fg/40">Tidak ada tenant pada kategori ini.</p>}
      </div>
      <p className="text-xs text-fg/40">Skor 0–100: pemakaian 30 hari (40) + kondisi & keaktifan booth (25) + masa aktif lisensi (25) + pesan bantuan terjawab (10).</p>
    </div>
  );
}

function Delta({ now, prev }: { now: number; prev: number }) {
  if (!prev) return <>{now ? "baru" : "—"}</>;
  const pct = Math.round(((now - prev) / prev) * 100);
  return <span className={pct >= 0 ? "text-emerald-600" : "text-red-500"}>{pct >= 0 ? "▲" : "▼"} {Math.abs(pct)}% dari 30 hari sebelumnya</span>;
}

function RevenueTab() {
  const { data, error } = useLoad(() => superadminApi.getInsightsRevenue());
  if (!data) return <Loading error={error} />;
  const max = Math.max(1, ...data.monthly.map((m) => m.revenue));
  const f = data.funnel;
  const steps: [string, number][] = [["Trial diterbitkan", f.trialsIssued], ["Diaktifkan di PC", f.activated], ["Dipakai (ada sesi)", f.used], ["Jadi berlangganan", f.converted]];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat title="MRR (estimasi)" value={rp(data.mrr)} sub="Nilai bulanan dari pembayaran yang masih berjalan" />
        <Stat title="Pendapatan 30 hari" value={rp(data.revenue30)} sub={<Delta now={data.revenue30} prev={data.revenuePrev30} />} />
        <Stat title="Tenant berbayar" value={data.payingTenants} sub={`+${data.newPaying30} baru · ${data.churned30} berhenti (30 hari)`} />
        <Stat title="Churn 30 hari" value={data.churned30} tone={data.churned30 ? "text-red-500" : ""} sub="Tenant yang masa bayarnya habis & belum lanjut" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className={card}>
          <p className={label}>Pendapatan langganan per bulan</p>
          <div className="mt-4 flex h-44 items-end gap-3">
            {data.monthly.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] text-fg/50">{m.revenue ? `${(m.revenue / 1_000_000).toFixed(1)}jt` : "—"}</span>
                <div className="w-full rounded-t-lg bg-accent/70 transition-all" style={{ height: `${Math.max(3, Math.round((m.revenue / max) * 120))}px` }} />
                <span className="text-[10px] text-fg/50">{m.month.slice(5)}/{m.month.slice(2, 4)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className={card}>
          <p className={label}>Corong trial (90 hari)</p>
          <div className="mt-4 space-y-3">
            {steps.map(([name, n], i) => (
              <div key={name}>
                <div className="flex justify-between text-sm"><span>{name}</span><span className="font-semibold">{n}{i > 0 && steps[0][1] ? <span className="ml-1 font-normal text-fg/45">({Math.round((n / steps[0][1]) * 100)}%)</span> : null}</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-fg/10"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${steps[0][1] ? (n / steps[0][1]) * 100 : 0}%` }} /></div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-fg/50">{f.expiredUnconverted} trial sudah habis tanpa berlangganan. {f.activated - f.used > 0 ? `${f.activated - f.used} trial aktif belum pernah dipakai untuk sesi foto — layak dihubungi.` : ""}</p>
        </div>
      </div>
    </div>
  );
}

function FleetTab({ onOpenTenant }: { onOpenTenant: (id: string) => void }) {
  const { data, error } = useLoad(() => superadminApi.getInsightsFleet());
  const [only, setOnly] = useState<"all" | "problem" | "outdated" | "offline">("all");
  if (!data) return <Loading error={error} />;
  const rows = data.rows.filter((r) => only === "all" || (only === "problem" && r.issues.length) || (only === "outdated" && r.outdated) || (only === "offline" && !r.online));
  const count = (f: (r: FleetRow) => boolean) => data.rows.filter(f).length;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat title="Booth terpasang" value={data.rows.length} sub={`Versi terbaru: ${data.latest ? `v${data.latest}` : "—"}`} />
        <Stat title="Online" value={count((r) => r.online)} sub={`${count((r) => !r.online)} offline`} />
        <Stat title="Bermasalah" value={count((r) => r.issues.length > 0)} tone={count((r) => r.issues.length > 0) ? "text-amber-600" : ""} sub="Kamera / printer / jaringan" />
        <Stat title="Versi lama" value={count((r) => r.outdated)} sub={`${count((r) => r.outdated && !r.autoUpdate)} dengan pembaruan otomatis dimatikan`} />
      </div>
      <div className="flex flex-wrap gap-2">
        {([["all", "Semua"], ["problem", "Bermasalah"], ["outdated", "Versi lama"], ["offline", "Offline"]] as const).map(([k, t]) => (
          <button key={k} type="button" onClick={() => setOnly(k)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${only === k ? "border-accent bg-accent/15 text-accent" : "border-fg/15 text-fg/50"}`}>{t}</button>
        ))}
      </div>
      <div className={`${card} !p-0 overflow-hidden`}>
        {rows.map((r) => (
          <button key={r.keyId} type="button" onClick={() => onOpenTenant(r.tenantId)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 border-b border-fg/10 px-4 py-3 text-left transition last:border-0 hover:bg-fg/[0.04]">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${r.online ? "bg-emerald-500" : "bg-fg/25"}`} title={r.online ? "Online" : "Offline"} />
            <div className="min-w-0 flex-1"><p className="truncate font-semibold">{r.label ?? "(tanpa label)"} <span className="font-normal text-fg/50">· {r.tenantName}</span></p>
              <p className="text-xs text-fg/50">{r.lastUsedAt ? `Terakhir aktif ${new Date(r.lastUsedAt).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "Belum pernah aktif"}</p></div>
            {r.issues.length > 0 && <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-700">{r.issues.join(", ")}</span>}
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${r.outdated ? "bg-sky-500/15 text-sky-700" : "bg-fg/10 text-fg/55"}`}>{r.version ? `v${r.version}` : "versi ?"}{r.outdated ? " · lama" : ""}</span>
          </button>
        ))}
        {rows.length === 0 && <p className="px-4 py-6 text-sm text-fg/40">Tidak ada booth pada kategori ini.</p>}
      </div>
    </div>
  );
}

function AnomaliesTab({ onOpenTenant }: { onOpenTenant: (id: string) => void }) {
  const { data, error } = useLoad(() => superadminApi.getInsightsAnomalies());
  if (!data) return <Loading error={error} />;
  return (
    <div className="space-y-3">
      {data.items.map((a, i) => (
        <div key={`${a.kind}-${i}`} className={`${card} flex flex-wrap items-center gap-3 ${a.severity === "critical" ? "!border-red-500/40" : "!border-amber-500/40"}`}>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${a.severity === "critical" ? "bg-red-500/15 text-red-600" : "bg-amber-500/15 text-amber-700"}`}>{a.severity === "critical" ? "Penting" : "Perhatikan"}</span>
          <div className="min-w-0 flex-1"><p className="font-semibold">{a.tenantName ?? "Seluruh platform"}</p><p className="text-sm text-fg/65">{a.message}</p></div>
          {a.tenantId && <button type="button" onClick={() => onOpenTenant(a.tenantId!)} className="rounded-lg border border-fg/20 px-3 py-1.5 text-xs font-semibold">Buka tenant</button>}
        </div>
      ))}
      {data.items.length === 0 && <div className={card}><p className="font-semibold text-emerald-600">✓ Tidak ada anomali</p><p className="mt-1 text-sm text-fg/55">Penarikan, lonjakan sesi, kegagalan pembayaran, dan percobaan login diperiksa tiap kali halaman ini dibuka.</p></div>}
      <p className="text-xs text-fg/40">Aturan: penarikan &gt; 3× rata-rata (atau penarikan pertama ≥ Rp 5 jt), sesi 24 jam &gt; 4× rata-rata harian, &gt; 60% pembayaran kiosk gagal, ≥ 3 penguncian login dalam 24 jam.</p>
    </div>
  );
}

function DigestTab() {
  const { data, error, reload } = useLoad(() => superadminApi.getDigest());
  const [busy, setBusy] = useState(false);
  if (!data) return <Loading error={error} />;
  const save = async (next: DigestSettings) => {
    setBusy(true);
    try { await superadminApi.saveDigest(next); pushToast({ type: "success", title: next.enabled ? `Ringkasan pagi aktif (pukul ${String(next.hour).padStart(2, "0")}.00 WIB)` : "Ringkasan pagi dimatikan" }); reload(); } catch (e) { pushToast({ type: "error", title: errMessage(e) }); } finally { setBusy(false); }
  };
  const sendNow = async () => {
    setBusy(true);
    try {
      const r = await superadminApi.sendDigestNow();
      if (!r) return;
      pushToast(r.whatsapp === "sent" ? { type: "success", title: "Ringkasan dikirim ke WhatsApp Anda" } : { type: "info", title: r.whatsapp === "no_number" ? "Tersimpan di Pusat Notifikasi. Isi nomor WhatsApp admin di Pusat Notifikasi → Pengaturan agar terkirim." : r.whatsapp === "no_gateway" ? "Tersimpan di Pusat Notifikasi. Atur gateway WhatsApp di Calon Tenant → Pengaturan agar terkirim." : `Tersimpan, tetapi WhatsApp gagal: ${r.error ?? ""}` });
    } catch (e) { pushToast({ type: "error", title: errMessage(e) }); } finally { setBusy(false); }
  };
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
      <div className={`${card} space-y-4`}>
        <div className="flex items-start justify-between gap-3">
          <div><p className={label}>Ringkasan pagi otomatis</p><p className="mt-1 text-sm text-fg/60">Satu pesan WhatsApp tiap pagi berisi yang perlu ditindaklanjuti. Juga tersimpan di Pusat Notifikasi.</p></div>
          <button type="button" role="switch" aria-checked={data.settings.enabled} disabled={busy} onClick={() => void save({ ...data.settings, enabled: !data.settings.enabled })} className={`flex h-9 shrink-0 items-center gap-2 rounded-full px-4 text-xs font-semibold ${data.settings.enabled ? "bg-emerald-500 text-white" : "bg-fg/10 text-fg/60"}`}>{data.settings.enabled ? "Aktif" : "Mati"}</button>
        </div>
        <label className="block text-sm text-fg/60">Dikirim pukul (WIB)
          <Select className="mt-1 w-full rounded-xl border border-fg/15 bg-surface px-3 py-2 text-sm" value={String(data.settings.hour)} onChange={(e) => void save({ ...data.settings, hour: Number(e.target.value) })}>
            {[5, 6, 7, 8, 9, 10, 11].map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}.00</option>)}
          </Select>
        </label>
        {(!data.gateway || !data.hasNumber) && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700">{!data.gateway ? "Gateway WhatsApp belum diatur (Calon Tenant → Pengaturan). " : ""}{!data.hasNumber ? "Nomor WhatsApp admin belum diisi (Pusat Notifikasi → Pengaturan). " : ""}Tanpa keduanya, ringkasan hanya tersimpan di dalam aplikasi.</p>}
        <button type="button" disabled={busy} onClick={() => void sendNow()} className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">{busy ? "Memproses…" : "Kirim sekarang"}</button>
      </div>
      <div className={card}>
        <p className={label}>Pratinjau (data saat ini)</p>
        <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-fg/[0.05] p-4 font-sans text-sm leading-relaxed">{data.preview}</pre>
      </div>
    </div>
  );
}

export default function InsightsPanel({ onOpenTenant }: { onOpenTenant: (id: string) => void }) {
  const [tab, setTab] = useState<Tab>("health");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map(([id, name]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${tab === id ? "bg-fg text-canvas shadow" : "bg-fg/[0.06] text-fg/60 hover:text-fg"}`}>{name}</button>
        ))}
      </div>
      <div key={tab} className="sa-page">
        {tab === "health" && <HealthTab onOpenTenant={onOpenTenant} />}
        {tab === "revenue" && <RevenueTab />}
        {tab === "fleet" && <FleetTab onOpenTenant={onOpenTenant} />}
        {tab === "anomalies" && <AnomaliesTab onOpenTenant={onOpenTenant} />}
        {tab === "digest" && <DigestTab />}
      </div>
    </div>
  );
}
