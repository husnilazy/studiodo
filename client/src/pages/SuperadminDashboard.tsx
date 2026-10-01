import { useEffect, useRef, useState } from "react";
import {
  superadminApi,
  getSuperadminToken,
  setSuperadminToken,
  SuperadminApiError,
  type SuperadminTenant,
  type PlatformSettings,
  type PlatformOverview,
  type Plan,
  type TenantDetail,
  type OverviewTimeseriesPoint,
  type TenantProfileFields,
  type PlatformEvent,
  type TenantApplication,
  type FleetAlertKiosk,
} from "@/lib/superadminApi";
import { SiteContentPanel } from "@/components/SiteContentPanel";
import { BlogPanel } from "@/components/BlogPanel";
import { MarketplacePanel } from "@/components/MarketplacePanel";
import { CreatorsPanel } from "@/components/CreatorsPanel";
import { PaymentGatewaysPanel } from "@/components/PaymentGatewaysPanel";

const inputClass = "mt-1 w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm outline-none focus:border-accent";
const money = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function daysRemaining(value: string | null): number | null {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function StatusPill({ subscriptionEndsAt, locked }: { subscriptionEndsAt: string | null; locked: boolean }) {
  // Fase 6 — "Terkunci" takes priority over every other tier: it means the kiosk is
  // ACTUALLY unusable right now (past grace, or manually suspended), not just a
  // days-remaining countdown.
  if (locked) return <span className="rounded-full border border-red-500/50 bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-200">Terkunci</span>;
  const days = daysRemaining(subscriptionEndsAt);
  if (days === null) return <span className="rounded-full border border-white/15 px-2.5 py-1 text-xs text-white/40">Belum diset</span>;
  if (days < 0) return <span className="rounded-full border border-red-400/30 px-2.5 py-1 text-xs text-red-300">Kedaluwarsa {Math.abs(days)}h lalu</span>;
  if (days <= 14) return <span className="rounded-full border border-amber-400/30 px-2.5 py-1 text-xs text-amber-300">{days} hari lagi</span>;
  return <span className="rounded-full border border-emerald-400/30 px-2.5 py-1 text-xs text-emerald-300">{days} hari lagi</span>;
}

function StatCard({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: "amber" }) {
  return (
    <div className={`rounded-2xl border p-4 ${tone === "amber" ? "border-amber-400/30 bg-amber-500/10" : "border-white/10 bg-white/[0.03]"}`}>
      <p className={`text-xs uppercase tracking-[.14em] ${tone === "amber" ? "text-amber-300" : "text-white/45"}`}>{label}</p>
      <p className="mt-2 font-display text-2xl font-bold">{value}</p>
      {detail && <p className="mt-1 text-xs text-white/40">{detail}</p>}
    </div>
  );
}

// Compact Rupiah for axis/tick labels only — money() (full "Rp x.xxx.xxx") stays
// for figures read on their own (stat tiles, tooltip body).
function shortMoney(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(value % 1_000_000_000 === 0 ? 0 : 1)}M`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}jt`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}rb`;
  return String(value);
}

const STATUS_LABEL: Record<string, string> = { active: "Aktif", trial: "Trial", suspended: "Suspended" };
// Fixed order + status-role colors reused from elsewhere in this dashboard
// (StatusPill/badges) rather than a new categorical palette — active reads as
// "good", trial as neutral/informational (the brand accent), suspended as
// "critical". Direct-labeled bars, so hue never has to carry meaning alone.
const STATUS_ORDER: { key: string; color: string; barClass: string }[] = [
  { key: "active", color: "#34d399", barClass: "bg-emerald-400" },
  { key: "trial", color: "var(--accent)", barClass: "bg-accent" },
  { key: "suspended", color: "#f87171", barClass: "bg-red-400" },
];

function TenantStatusBars({ byStatus, total }: { byStatus: Record<string, number>; total: number }) {
  const known = new Set(STATUS_ORDER.map((s) => s.key));
  const rows = [...STATUS_ORDER, ...Object.keys(byStatus).filter((k) => !known.has(k)).map((key) => ({ key, color: "#8b8b86", barClass: "bg-white/30" }))];

  return (
    <div className="space-y-3">
      {rows.map(({ key, barClass }) => {
        const count = byStatus[key] ?? 0;
        const pct = total > 0 ? (count / total) * 100 : 0;
        return (
          <div key={key}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="text-white/70">{STATUS_LABEL[key] ?? key}</span>
              <span className="font-semibold text-white">{count}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <div className={`h-full rounded-full ${barClass} transition-[width] duration-500`} style={{ width: `${Math.max(pct, count > 0 ? 2 : 0)}%` }} />
            </div>
          </div>
        );
      })}
      {total === 0 && <p className="text-sm text-white/40">Belum ada tenant.</p>}
    </div>
  );
}

// Hand-rolled SVG line+area chart — single series (revenue), so no dual-axis
// temptation. Sessions count (a different scale) gets its own stat tile instead
// of sharing this y-axis. Logical viewBox 640x220; scales with the container.
function RevenueTrendChart({ data }: { data: OverviewTimeseriesPoint[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const W = 640;
  const H = 220;
  const padL = 8;
  const padR = 8;
  const padT = 12;
  const padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const maxRevenue = Math.max(1, ...data.map((d) => d.revenue));
  const xAt = (i: number) => padL + (data.length <= 1 ? 0 : (i / (data.length - 1)) * plotW);
  const yAt = (v: number) => padT + plotH - (v / maxRevenue) * plotH;

  const linePath = data.map((d, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(d.revenue).toFixed(1)}`).join(" ");
  const areaPath = data.length > 0
    ? `${linePath} L${xAt(data.length - 1).toFixed(1)},${(padT + plotH).toFixed(1)} L${xAt(0).toFixed(1)},${(padT + plotH).toFixed(1)} Z`
    : "";

  // ~6 evenly spaced x-axis labels — showing every date would collide at 30+ points.
  const labelEvery = Math.max(1, Math.ceil(data.length / 6));

  const handleMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || data.length === 0) return;
    const relX = ((event.clientX - rect.left) / rect.width) * W;
    const ratio = Math.min(1, Math.max(0, (relX - padL) / plotW));
    setHoverIndex(Math.round(ratio * (data.length - 1)));
  };

  const totalRevenue = data.reduce((sum, d) => sum + d.revenue, 0);
  const hovered = hoverIndex !== null ? data[hoverIndex] : null;
  const tooltipLeft = hoverIndex !== null && data.length > 0 ? (xAt(hoverIndex) / W) * 100 : 0;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-xs uppercase tracking-[.14em] text-white/45">Revenue {data.length} hari terakhir</p>
          <p className="mt-1 font-display text-2xl font-bold text-accent">{money(totalRevenue)}</p>
        </div>
        {hovered && (
          <div className="text-right text-xs">
            <p className="text-white/70">{new Date(hovered.date).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}</p>
            <p className="font-semibold text-accent">{money(hovered.revenue)}</p>
            <p className="text-white/40">{hovered.sessions} sesi</p>
          </div>
        )}
      </div>
      <div className="relative mt-3">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full touch-none"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIndex(null)}
          role="img"
          aria-label={`Grafik revenue harian, total ${money(totalRevenue)} dalam ${data.length} hari`}
        >
          <defs>
            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Gridlines — recessive, hairline */}
          {[0, 0.5, 1].map((t) => (
            <line key={t} x1={padL} x2={W - padR} y1={padT + plotH * t} y2={padT + plotH * t} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
          ))}
          {data.length > 0 && <path d={areaPath} fill="url(#revenueFill)" />}
          {data.length > 0 && <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
          {/* X-axis labels */}
          {data.map((d, i) => (i % labelEvery === 0 || i === data.length - 1) ? (
            <text key={d.date} x={xAt(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.35)">
              {new Date(d.date).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}
            </text>
          ) : null)}
          {/* Y-axis max label */}
          <text x={padL} y={padT - 2} fontSize="9" fill="rgba(255,255,255,0.35)">{shortMoney(maxRevenue)}</text>
          {/* Hover crosshair + dot */}
          {hovered && hoverIndex !== null && (
            <g>
              <line x1={xAt(hoverIndex)} x2={xAt(hoverIndex)} y1={padT} y2={padT + plotH} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
              <circle cx={xAt(hoverIndex)} cy={yAt(hovered.revenue)} r={4} fill="var(--accent)" stroke="#0b0b10" strokeWidth={2} />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}

function PlatformOverviewPanel() {
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [timeseries, setTimeseries] = useState<OverviewTimeseriesPoint[]>([]);
  const [rangeDays, setRangeDays] = useState(30);

  useEffect(() => {
    superadminApi.getOverview().then((result) => setOverview(result ?? null));
  }, []);
  useEffect(() => {
    superadminApi.getOverviewTimeseries(rangeDays).then((rows) => setTimeseries(rows ?? []));
  }, [rangeDays]);

  if (!overview) return null;
  const { tenants, kiosks, sessions } = overview;
  const activeCount = tenants.byStatus.active ?? 0;
  const trialCount = tenants.byStatus.trial ?? 0;
  const suspendedCount = tenants.byStatus.suspended ?? 0;

  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[.16em] text-accent">RINGKASAN PLATFORM</p>
        <h2 className="mt-2 font-display text-xl font-semibold">Progress STUDIODO</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total tenant" value={String(tenants.total)} detail={`${activeCount} aktif · ${trialCount} trial · ${suspendedCount} suspended`} />
        <StatCard label="Kiosk online" value={`${kiosks.online}/${kiosks.total}`} detail="Aktif dalam 10 menit terakhir" />
        <StatCard label="Total sesi" value={String(sessions.total)} detail={`${sessions.paid} sesi berhasil bayar`} />
        <StatCard label="Revenue platform" value={money(sessions.revenue)} detail="Semua tenant, sepanjang waktu" />
      </div>

      {tenants.locked > 0 && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/15 px-5 py-4">
          <p className="text-sm font-semibold text-red-200">{tenants.locked} tenant kiosk-nya sedang terkunci</p>
          <p className="mt-1 text-xs text-red-100/60">Sudah lewat masa tenggang (atau di-suspend manual) — cek badge "Terkunci" di tabel tenant di bawah.</p>
        </div>
      )}
      {(tenants.expiringSoon > 0 || tenants.expired > 0) && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-5 py-4">
          <p className="text-sm font-semibold text-amber-200">
            {tenants.expiringSoon > 0 && `${tenants.expiringSoon} tenant akan expired ≤7 hari`}
            {tenants.expiringSoon > 0 && tenants.expired > 0 && " · "}
            {tenants.expired > 0 && `${tenants.expired} tenant sudah kedaluwarsa`}
          </p>
          <p className="mt-1 text-xs text-amber-100/60">Cek kolom "Langganan" di tabel tenant di bawah untuk detail per tenant.</p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center justify-end gap-1.5">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setRangeDays(d)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${rangeDays === d ? "bg-accent text-white" : "text-white/45 hover:text-white/70"}`}
              >
                {d}h
              </button>
            ))}
          </div>
          <RevenueTrendChart data={timeseries} />
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-xs uppercase tracking-[.14em] text-white/45">Tenant per status</p>
          <div className="mt-4">
            <TenantStatusBars byStatus={tenants.byStatus} total={tenants.total} />
          </div>
        </div>
      </div>
    </section>
  );
}

const BUSINESS_TYPE_OPTIONS = [
  { value: "", label: "Pilih jenis usaha" },
  { value: "photobooth_rental", label: "Sewa photobooth" },
  { value: "event_organizer", label: "Event organizer" },
  { value: "studio", label: "Studio foto" },
  { value: "other", label: "Lainnya" },
];

// Shared by CreateTenantPanel and TenantDetailPanel — the exact same
// business-profile fields a future public landing-page signup form would
// also collect (see server/routes/tenantApplications.ts), so onboarding a
// tenant by hand today already produces the same shape of data.
function ProfileFieldsGrid({ value, onChange }: { value: Partial<TenantProfileFields>; onChange: (patch: Partial<TenantProfileFields>) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm text-white/60">Nama pemilik
        <input className={inputClass} value={value.ownerName ?? ""} onChange={(e) => onChange({ ownerName: e.target.value })} />
      </label>
      <label className="text-sm text-white/60">WhatsApp pemilik
        <input className={inputClass} placeholder="628xxxxxxxxxx" value={value.ownerWhatsapp ?? ""} onChange={(e) => onChange({ ownerWhatsapp: e.target.value })} />
      </label>
      <label className="text-sm text-white/60">Jenis usaha
        <select className={inputClass} value={value.businessType ?? ""} onChange={(e) => onChange({ businessType: e.target.value })}>
          {BUSINESS_TYPE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      </label>
      <label className="text-sm text-white/60">Kota
        <input className={inputClass} value={value.city ?? ""} onChange={(e) => onChange({ city: e.target.value })} />
      </label>
      <label className="text-sm text-white/60 sm:col-span-2">Alamat
        <input className={inputClass} value={value.address ?? ""} onChange={(e) => onChange({ address: e.target.value })} />
      </label>
      <label className="text-sm text-white/60">Website</label>
      <input className={`${inputClass} -mt-3`} placeholder="https://" value={value.website ?? ""} onChange={(e) => onChange({ website: e.target.value })} />
      <label className="text-sm text-white/60">Instagram</label>
      <input className={`${inputClass} -mt-3`} placeholder="@nama.studio" value={value.instagramHandle ?? ""} onChange={(e) => onChange({ instagramHandle: e.target.value })} />
      <label className="text-sm text-white/60 sm:col-span-2">Sumber referral (dari mana tahu STUDIODO?)
        <input className={inputClass} value={value.referralSource ?? ""} onChange={(e) => onChange({ referralSource: e.target.value })} />
      </label>
      <label className="text-sm text-white/60 sm:col-span-2">Catatan internal (tidak terlihat tenant)
        <textarea className={`${inputClass} min-h-[70px]`} value={value.internalNotes ?? ""} onChange={(e) => onChange({ internalNotes: e.target.value })} />
      </label>
    </div>
  );
}

// Platform-wide "which booths are actually down right now" view — built from
// kiosk heartbeat data (POST /api/kiosk-keys/heartbeat) that was already being
// collected per-tenant, but never surfaced across the whole fleet at once
// until now.
function FleetAlertsPanel() {
  const [data, setData] = useState<{ offline: FleetAlertKiosk[]; diagnosticIssues: FleetAlertKiosk[] } | null>(null);

  useEffect(() => {
    superadminApi.getFleetAlerts().then((result) => setData(result ?? null));
    const interval = window.setInterval(() => superadminApi.getFleetAlerts().then((result) => setData(result ?? null)), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  if (!data || (data.offline.length === 0 && data.diagnosticIssues.length === 0)) return null;

  return (
    <section className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5">
      <p className="text-xs uppercase tracking-[.16em] text-red-300">FLEET ALERT</p>
      <h2 className="mt-1 font-display text-lg font-semibold text-red-100">
        {data.offline.length > 0 && `${data.offline.length} kiosk offline`}
        {data.offline.length > 0 && data.diagnosticIssues.length > 0 && " · "}
        {data.diagnosticIssues.length > 0 && `${data.diagnosticIssues.length} kiosk lapor masalah hardware`}
      </h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {[...data.offline, ...data.diagnosticIssues.filter((d) => !data.offline.some((o) => o.id === d.id))].slice(0, 8).map((kiosk) => {
          const diag = kiosk.lastDiagnostics;
          const issues = diag ? [!diag.cameraOk && "kamera", !diag.printerOk && "printer", !diag.networkOk && "jaringan"].filter(Boolean) : [];
          return (
            <div key={kiosk.id} className="rounded-xl border border-red-400/20 bg-black/20 px-3 py-2 text-sm">
              <p className="font-semibold text-red-100">{kiosk.tenantName} <span className="font-normal text-red-200/60">· {kiosk.label ?? "(tanpa label)"}</span></p>
              <p className="text-xs text-red-200/60">
                {kiosk.lastUsedAt ? `Terakhir online ${formatDate(kiosk.lastUsedAt)}` : "Belum pernah online"}
                {issues.length > 0 && ` · Masalah: ${issues.join(", ")}`}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function LoginForm({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await superadminApi.login(email, password);
      if (result?.token) {
        setSuperadminToken(result.token);
        onLoggedIn();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Email atau password salah");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-[#0b0b10] px-4 text-white">
      <form onSubmit={submit} className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-white/[0.045] p-8 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[.25em] text-accent">STUDIODO</p>
        <h1 className="mt-2 font-display text-2xl font-bold">Admin Pusat</h1>
        <p className="mt-2 text-sm text-white/45">Panel superadmin — kelola semua tenant di platform ini.</p>
        <div className="mt-6 space-y-3">
          <input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={inputClass} />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className={inputClass} />
        </div>
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
        <button type="submit" disabled={submitting || !email || !password} className="mt-6 w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">
          {submitting ? "Memproses…" : "Masuk"}
        </button>
      </form>
    </div>
  );
}

function PlatformSettingsPanel() {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [draft, setDraft] = useState({ defaultTrialDays: "7", renewalWhatsapp: "", renewalCheckoutUrl: "", gracePeriodDays: "3" });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = () => {
    superadminApi.getSettings().then((result) => {
      if (!result) return;
      setSettings(result);
      setDraft({
        defaultTrialDays: String(result.defaultTrialDays),
        renewalWhatsapp: result.renewalWhatsapp ?? "",
        renewalCheckoutUrl: result.renewalCheckoutUrl ?? "",
        gracePeriodDays: String(result.gracePeriodDays),
      });
    });
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      const result = await superadminApi.updateSettings({
        defaultTrialDays: Number(draft.defaultTrialDays) || 0,
        renewalWhatsapp: draft.renewalWhatsapp,
        renewalCheckoutUrl: draft.renewalCheckoutUrl,
        gracePeriodDays: Number(draft.gracePeriodDays) || 0,
      });
      if (result) setSettings(result);
      setMessage("Tersimpan.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return null;

  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-6">
      <p className="text-xs uppercase tracking-[.16em] text-accent">PENGATURAN PLATFORM</p>
      <h2 className="mt-2 font-display text-xl font-semibold">Default trial & kontak renewal</h2>
      <p className="mt-1 text-sm text-white/45">Berlaku untuk tenant baru dan tombol "Perpanjang" di dashboard semua tenant.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm text-white/60">
          Trial default (hari)
          <input type="number" min={0} className={inputClass} value={draft.defaultTrialDays} onChange={(e) => setDraft({ ...draft, defaultTrialDays: e.target.value })} />
        </label>
        <label className="text-sm text-white/60">
          Masa tenggang (hari)
          <input type="number" min={0} className={inputClass} value={draft.gracePeriodDays} onChange={(e) => setDraft({ ...draft, gracePeriodDays: e.target.value })} />
        </label>
        <label className="text-sm text-white/60">
          Nomor WhatsApp renewal
          <input placeholder="628xxxxxxxxxx" className={inputClass} value={draft.renewalWhatsapp} onChange={(e) => setDraft({ ...draft, renewalWhatsapp: e.target.value })} />
        </label>
        <label className="text-sm text-white/60">
          Link checkout (opsional)
          <input placeholder="https://studiodo.id/pricing" className={inputClass} value={draft.renewalCheckoutUrl} onChange={(e) => setDraft({ ...draft, renewalCheckoutUrl: e.target.value })} />
        </label>
      </div>
      <p className="mt-3 text-xs text-white/35">Masa tenggang = berapa hari setelah langganan lewat sebelum kiosk benar-benar terkunci.</p>
      <div className="mt-5 flex items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold disabled:opacity-50">
          {saving ? "Menyimpan…" : "Simpan"}
        </button>
        {message && <span className="text-sm text-white/50">{message}</span>}
      </div>
    </section>
  );
}

const BILLING_LABEL: Record<string, string> = { monthly: "/bulan", yearly: "/tahun" };

function PlansPanel({ onPlansChanged }: { onPlansChanged?: () => void }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({ name: "", slug: "", price: "", billingInterval: "monthly", kioskLimit: "", screenBuilderEnabled: true, gifVideoEnabled: true, description: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    superadminApi.getPlans().then((rows) => setPlans(rows ?? [])).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!draft.name.trim() || !draft.slug.trim()) return;
    setError("");
    try {
      await superadminApi.createPlan({
        name: draft.name.trim(),
        slug: draft.slug.trim().toLowerCase(),
        price: Number(draft.price) || 0,
        billingInterval: draft.billingInterval as "monthly" | "yearly",
        kioskLimit: draft.kioskLimit ? Number(draft.kioskLimit) : null,
        screenBuilderEnabled: draft.screenBuilderEnabled,
        gifVideoEnabled: draft.gifVideoEnabled,
        description: draft.description.trim() || undefined,
        sortOrder: plans.length + 1,
      });
      setDraft({ name: "", slug: "", price: "", billingInterval: "monthly", kioskLimit: "", screenBuilderEnabled: true, gifVideoEnabled: true, description: "" });
      load();
      onPlansChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat plan");
    }
  };

  const beginEdit = (plan: Plan) => {
    setEditingId(plan.id);
    setEditingDraft({ name: plan.name, price: plan.price, billingInterval: plan.billingInterval, kioskLimit: plan.kioskLimit === null ? "" : String(plan.kioskLimit), screenBuilderEnabled: String(plan.screenBuilderEnabled), gifVideoEnabled: String(plan.gifVideoEnabled), description: plan.description ?? "" });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setError("");
    try {
      await superadminApi.updatePlan(editingId, {
        name: editingDraft.name,
        price: Number(editingDraft.price) || 0,
        billingInterval: editingDraft.billingInterval as "monthly" | "yearly",
        kioskLimit: editingDraft.kioskLimit ? Number(editingDraft.kioskLimit) : null,
        screenBuilderEnabled: editingDraft.screenBuilderEnabled !== "false",
        gifVideoEnabled: editingDraft.gifVideoEnabled !== "false",
        description: editingDraft.description,
      });
      setEditingId(null);
      load();
      onPlansChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan perubahan plan");
    }
  };

  const toggleActive = async (plan: Plan) => {
    setError("");
    try {
      await superadminApi.updatePlan(plan.id, { active: !plan.active });
      load();
      onPlansChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengubah status plan");
    }
  };

  const remove = async (plan: Plan) => {
    if (!window.confirm(`Hapus plan "${plan.name}"? Kalau masih dipakai tenant, plan hanya akan dinonaktifkan.`)) return;
    setError("");
    try {
      await superadminApi.deletePlan(plan.id);
      load();
      onPlansChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus plan");
    }
  };

  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[.16em] text-accent">SUBSCRIPTION PLANS</p>
          <h2 className="mt-2 font-display text-xl font-semibold">{plans.length} plan terdaftar</h2>
          <p className="mt-1 text-sm text-white/45">Menu plan yang dipilih saat mengonlinekan tenant baru atau mencatat pembayaran.</p>
        </div>
        <button type="button" onClick={load} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-white/60">{loading ? "Memuat…" : "Muat ulang"}</button>
      </div>

      <div className="mt-5 rounded-2xl border border-accent/20 bg-accent/[0.04] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Buat plan baru</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm text-white/60">Nama<input className={inputClass} placeholder="Pro" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label className="text-sm text-white/60">Slug<input className={inputClass} placeholder="pro" value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} /></label>
          <label className="text-sm text-white/60">Harga (Rp)<input className={inputClass} type="number" min={0} placeholder="299000" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} /></label>
          <label className="text-sm text-white/60">Interval<select className={inputClass} value={draft.billingInterval} onChange={(e) => setDraft({ ...draft, billingInterval: e.target.value })}><option value="monthly">Bulanan</option><option value="yearly">Tahunan</option></select></label>
          <label className="text-sm text-white/60">Limit kiosk<input className={inputClass} type="number" min={0} placeholder="Kosongkan = tanpa batas" value={draft.kioskLimit} onChange={(e) => setDraft({ ...draft, kioskLimit: e.target.value })} /></label>
          <div className="flex items-center gap-4 self-end pb-2.5">
            <label className="flex items-center gap-2 text-sm text-white/60"><input type="checkbox" checked={draft.screenBuilderEnabled} onChange={(e) => setDraft({ ...draft, screenBuilderEnabled: e.target.checked })} /> Screen Builder</label>
            <label className="flex items-center gap-2 text-sm text-white/60"><input type="checkbox" checked={draft.gifVideoEnabled} onChange={(e) => setDraft({ ...draft, gifVideoEnabled: e.target.checked })} /> GIF & Video</label>
          </div>
          <label className="text-sm text-white/60 sm:col-span-2 lg:col-span-3">Deskripsi<input className={inputClass} placeholder="mis. Untuk studio dengan 1-2 booth aktif" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
        </div>
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
        <button type="button" onClick={create} disabled={!draft.name.trim() || !draft.slug.trim()} className="mt-4 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">+ Tambah plan</button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <div key={plan.id} className={`rounded-2xl border p-4 ${plan.active ? "border-white/10 bg-black/20" : "border-white/10 bg-white/5 opacity-60"}`}>
            {editingId === plan.id ? (
              <div className="grid gap-2">
                <input className={inputClass} value={editingDraft.name ?? ""} onChange={(e) => setEditingDraft({ ...editingDraft, name: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <input className={inputClass} type="number" value={editingDraft.price ?? "0"} onChange={(e) => setEditingDraft({ ...editingDraft, price: e.target.value })} />
                  <select className={inputClass} value={editingDraft.billingInterval ?? "monthly"} onChange={(e) => setEditingDraft({ ...editingDraft, billingInterval: e.target.value })}><option value="monthly">Bulanan</option><option value="yearly">Tahunan</option></select>
                </div>
                <input className={inputClass} type="number" placeholder="Limit kiosk (kosong = tanpa batas)" value={editingDraft.kioskLimit ?? ""} onChange={(e) => setEditingDraft({ ...editingDraft, kioskLimit: e.target.value })} />
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-xs text-white/60"><input type="checkbox" checked={editingDraft.screenBuilderEnabled !== "false"} onChange={(e) => setEditingDraft({ ...editingDraft, screenBuilderEnabled: String(e.target.checked) })} /> Screen Builder</label>
                  <label className="flex items-center gap-2 text-xs text-white/60"><input type="checkbox" checked={editingDraft.gifVideoEnabled !== "false"} onChange={(e) => setEditingDraft({ ...editingDraft, gifVideoEnabled: String(e.target.checked) })} /> GIF & Video</label>
                </div>
                <input className={inputClass} placeholder="Deskripsi" value={editingDraft.description ?? ""} onChange={(e) => setEditingDraft({ ...editingDraft, description: e.target.value })} />
                <div className="mt-1 flex gap-2"><button onClick={saveEdit} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold">Simpan</button><button onClick={() => setEditingId(null)} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs">Batal</button></div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-lg font-semibold">{plan.name}</p>
                    <p className="text-xs text-white/40">{plan.slug}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${plan.active ? "bg-emerald-400/15 text-emerald-200" : "bg-white/10 text-white/50"}`}>{plan.active ? "Aktif" : "Nonaktif"}</span>
                </div>
                <p className="mt-2 text-2xl font-bold text-accent">{money(Number(plan.price))}<span className="text-sm font-normal text-white/40">{BILLING_LABEL[plan.billingInterval]}</span></p>
                <p className="mt-1 text-xs text-white/45">{plan.kioskLimit === null ? "Tanpa batas kiosk" : `Maks ${plan.kioskLimit} kiosk`}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${plan.screenBuilderEnabled ? "bg-emerald-400/15 text-emerald-200" : "bg-white/5 text-white/30 line-through"}`}>Screen Builder</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${plan.gifVideoEnabled ? "bg-emerald-400/15 text-emerald-200" : "bg-white/5 text-white/30 line-through"}`}>GIF & Video</span>
                </div>
                {plan.description && <p className="mt-2 text-xs text-white/50">{plan.description}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                  <button onClick={() => beginEdit(plan)} className="rounded-full border border-white/15 px-3 py-1 text-xs">Edit</button>
                  <button onClick={() => toggleActive(plan)} className="rounded-full border border-white/15 px-3 py-1 text-xs">{plan.active ? "Nonaktifkan" : "Aktifkan"}</button>
                  <button onClick={() => remove(plan)} className="text-xs text-red-300 hover:text-red-200">Hapus</button>
                </div>
              </>
            )}
          </div>
        ))}
        {!loading && plans.length === 0 && <p className="text-sm text-white/40">Belum ada plan. Buat plan pertama di atas.</p>}
      </div>
    </section>
  );
}

const LEVEL_STYLE: Record<PlatformEvent["level"], string> = {
  info: "border-white/15 text-white/50",
  warning: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  error: "border-red-400/30 bg-red-400/10 text-red-200",
};
const CATEGORY_LABEL: Record<string, string> = { tenant: "Tenant", billing: "Billing", kiosk: "Kiosk", auth: "Auth", system: "System" };

// The combined activity+error timeline — didn't exist before (see the
// platformEvents table added alongside this). Every mutating superadmin
// action (tenant created/edited, payment recorded, plan changed, application
// reviewed) and every unhandled server error now writes a row here.
function EventsLogPanel({ tenants }: { tenants: SuperadminTenant[] }) {
  const [events, setEvents] = useState<PlatformEvent[]>([]);
  const [level, setLevel] = useState("all");
  const [category, setCategory] = useState("all");
  const [tenantId, setTenantId] = useState("");
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);

  const load = (before?: string) => {
    setLoading(true);
    superadminApi.getEvents({ level, category, tenantId: tenantId || undefined, before, limit: 50 }).then((rows) => {
      const page = rows ?? [];
      setEvents((current) => (before ? [...current, ...page] : page));
      setHasMore(page.length === 50);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [level, category, tenantId]);

  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[.16em] text-accent">AKTIVITAS & ERROR</p>
          <h2 className="mt-2 font-display text-xl font-semibold">Log platform</h2>
          <p className="mt-1 text-sm text-white/45">Semua perubahan tenant/billing/plan, dan error server yang belum tertangani.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="rounded-lg border border-white/15 bg-black/20 px-2 py-1.5 text-xs" value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="all">Semua level</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </select>
          <select className="rounded-lg border border-white/15 bg-black/20 px-2 py-1.5 text-xs" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">Semua kategori</option>
            {Object.entries(CATEGORY_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <select className="rounded-lg border border-white/15 bg-black/20 px-2 py-1.5 text-xs" value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
            <option value="">Semua tenant</option>
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        {events.map((event) => (
          <div key={event.id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${LEVEL_STYLE[event.level]}`}>{event.level}</span>
                <span className="text-[10px] uppercase tracking-wide text-white/35">{CATEGORY_LABEL[event.category] ?? event.category}</span>
                {event.tenantName && <span className="text-xs text-accent">{event.tenantName}</span>}
              </div>
              <p className="mt-1 text-sm text-white/80">{event.message}</p>
              <p className="mt-0.5 text-xs text-white/35">{new Date(event.createdAt).toLocaleString("id-ID")}{event.actorLabel ? ` · ${event.actorLabel}` : ""}</p>
            </div>
          </div>
        ))}
        {!loading && events.length === 0 && <p className="py-6 text-center text-sm text-white/40">Belum ada event yang cocok dengan filter ini.</p>}
      </div>
      {hasMore && events.length > 0 && (
        <button type="button" disabled={loading} onClick={() => load(events[events.length - 1].createdAt)} className="mt-4 w-full rounded-xl border border-white/15 py-2.5 text-sm text-white/60 hover:border-accent disabled:opacity-50">
          {loading ? "Memuat…" : "Muat lebih banyak"}
        </button>
      )}
    </section>
  );
}

// Review queue for leads submitted through the (future) public landing page's
// signup form — POST /api/tenant-applications. Converting reuses all the
// data the applicant already typed, so the only thing a superadmin still has
// to decide is the tenant's slug and initial admin password.
function TenantApplicationsPanel({ onConverted }: { onConverted: () => void }) {
  const [applications, setApplications] = useState<TenantApplication[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [convertDraft, setConvertDraft] = useState({ slug: "", password: "" });
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ kioskKey: string; adminEmail: string } | null>(null);

  const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  const load = () => {
    setLoading(true);
    superadminApi.getTenantApplications(showAll ? "all" : "pending").then((rows) => setApplications(rows ?? [])).finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [showAll]);

  const startConvert = (application: TenantApplication) => {
    setConvertingId(application.id);
    setConvertDraft({ slug: slugify(application.businessName), password: "" });
    setError("");
    setResult(null);
  };

  const submitConvert = async (application: TenantApplication) => {
    setError("");
    try {
      const created = await superadminApi.convertApplication(application.id, convertDraft);
      if (!created) throw new Error("Gagal mengonversi aplikasi");
      setResult({ kioskKey: created.kioskKey, adminEmail: created.adminEmail });
      setConvertingId(null);
      load();
      onConverted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengonversi aplikasi");
    }
  };

  const reject = async (application: TenantApplication) => {
    if (!window.confirm(`Tolak aplikasi "${application.businessName}"?`)) return;
    await superadminApi.rejectApplication(application.id).catch(() => undefined);
    load();
  };

  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[.16em] text-accent">APLIKASI TENANT</p>
          <h2 className="mt-2 font-display text-xl font-semibold">{applications.length} {showAll ? "aplikasi" : "menunggu review"}</h2>
          <p className="mt-1 text-sm text-white/45">Masuk dari form pendaftaran publik STUDIODO (landing page).</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowAll((v) => !v)} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-white/60">{showAll ? "Hanya pending" : "Lihat semua"}</button>
          <button type="button" onClick={load} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-white/60">{loading ? "Memuat…" : "Muat ulang"}</button>
        </div>
      </div>

      {result && (
        <div className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4">
          <p className="text-sm font-semibold text-emerald-200">Tenant berhasil dibuat dari aplikasi ini.</p>
          <p className="mt-1 text-xs text-emerald-100/70">Admin: {result.adminEmail}</p>
          <code className="mt-2 block overflow-x-auto rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs text-white/80">{result.kioskKey}</code>
          <p className="mt-1 text-xs text-emerald-100/50">Kiosk API key — hanya tampil sekali, tempel ke layar "Setup / Pair kiosk ini".</p>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {applications.map((application) => (
          <div key={application.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display text-lg font-semibold">{application.businessName}</p>
                <p className="text-xs text-white/45">{application.ownerName} · {application.ownerEmail}{application.ownerWhatsapp ? ` · ${application.ownerWhatsapp}` : ""}</p>
                <p className="mt-1 text-xs text-white/35">
                  {[application.businessType, application.city, application.referralSource ? `via ${application.referralSource}` : null].filter(Boolean).join(" · ")}
                </p>
                {application.message && <p className="mt-2 text-sm text-white/60">"{application.message}"</p>}
                <p className="mt-1 text-xs text-white/30">Diajukan {formatDate(application.createdAt)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {application.status !== "pending" ? (
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${application.status === "converted" ? "bg-emerald-400/15 text-emerald-200" : "bg-white/10 text-white/50"}`}>
                    {application.status === "converted" ? "Diterima" : "Ditolak"}
                  </span>
                ) : (
                  <>
                    <button type="button" onClick={() => startConvert(application)} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold">Terima & buat tenant</button>
                    <button type="button" onClick={() => reject(application)} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-red-300 hover:border-red-400">Tolak</button>
                  </>
                )}
              </div>
            </div>

            {convertingId === application.id && (
              <div className="mt-4 rounded-xl border border-accent/20 bg-accent/[0.04] p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm text-white/60">Slug tenant
                    <input className={inputClass} value={convertDraft.slug} onChange={(e) => setConvertDraft({ ...convertDraft, slug: slugify(e.target.value) })} />
                  </label>
                  <label className="text-sm text-white/60">Password admin awal
                    <input className={inputClass} type="password" placeholder="Minimal 6 karakter" value={convertDraft.password} onChange={(e) => setConvertDraft({ ...convertDraft, password: e.target.value })} autoComplete="new-password" />
                  </label>
                </div>
                {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => submitConvert(application)} disabled={!convertDraft.slug || convertDraft.password.length < 6} className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40">Buat tenant</button>
                  <button type="button" onClick={() => setConvertingId(null)} className="rounded-lg border border-white/15 px-4 py-2 text-xs">Batal</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {!loading && applications.length === 0 && <p className="py-6 text-center text-sm text-white/40">{showAll ? "Belum ada aplikasi masuk." : "Tidak ada aplikasi yang menunggu review."}</p>}
      </div>
    </section>
  );
}

function TenantsTable({ plans, onSelectTenant, reloadRef }: { plans: Plan[]; onSelectTenant: (id: string) => void; reloadRef?: React.MutableRefObject<(() => void) | null> }) {
  const [tenants, setTenants] = useState<SuperadminTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, { plan: string; status: string }>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = () => {
    setLoading(true);
    superadminApi.getTenants().then((rows) => {
      setTenants(rows ?? []);
      setDrafts(Object.fromEntries((rows ?? []).map((tenant) => [tenant.id, { plan: tenant.plan, status: tenant.status }])));
    }).finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    if (reloadRef) reloadRef.current = load;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const savePlanStatus = async (id: string) => {
    const draft = drafts[id];
    if (!draft) return;
    setBusyId(id);
    try {
      await superadminApi.updateTenant(id, { plan: draft.plan, status: draft.status });
      load();
    } finally {
      setBusyId(null);
    }
  };

  const extend = async (id: string, days: number) => {
    setBusyId(id);
    try {
      await superadminApi.extendTenant(id, days);
      load();
    } finally {
      setBusyId(null);
    }
  };

  const filtered = tenants.filter((tenant) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return tenant.name.toLowerCase().includes(q) || tenant.slug.toLowerCase().includes(q) || (tenant.adminEmail ?? "").toLowerCase().includes(q);
  });

  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[.16em] text-accent">SEMUA TENANT</p>
          <h2 className="mt-2 font-display text-xl font-semibold">{filtered.length} dari {tenants.length} tenant</h2>
        </div>
        <div className="flex items-center gap-2">
          <input placeholder="Cari nama, slug, atau email admin…" value={query} onChange={(e) => setQuery(e.target.value)} className="w-64 rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-xs outline-none focus:border-accent" />
          <button type="button" onClick={load} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-white/60">{loading ? "Memuat…" : "Muat ulang"}</button>
        </div>
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-white/45">
            <tr>
              <th className="p-3">Tenant</th>
              <th className="p-3">Admin</th>
              <th className="p-3">Plan</th>
              <th className="p-3">Status</th>
              <th className="p-3">Langganan</th>
              <th className="p-3">Kiosk</th>
              <th className="p-3">Sesi</th>
              <th className="p-3">Revenue</th>
              <th className="p-3">Extend cepat</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((tenant) => {
              const draft = drafts[tenant.id] ?? { plan: tenant.plan, status: tenant.status };
              const dirty = draft.plan !== tenant.plan || draft.status !== tenant.status;
              const days = daysRemaining(tenant.subscriptionEndsAt);
              const nearingExpiry = days !== null && days <= 7;
              const knownPlan = plans.some((p) => p.slug === draft.plan);
              return (
                <tr key={tenant.id} className={`border-t border-white/10 ${nearingExpiry ? (days! < 0 ? "bg-red-500/[0.06]" : "bg-amber-500/[0.06]") : ""}`}>
                  <td className="p-3">
                    <button type="button" onClick={() => onSelectTenant(tenant.id)} className="font-semibold text-left hover:text-accent hover:underline">{tenant.name}</button>
                    <p className="text-xs text-white/40">{tenant.slug}</p>
                  </td>
                  <td className="p-3 text-white/60">{tenant.adminEmail ?? "-"}</td>
                  <td className="p-3">
                    <select
                      className="w-28 rounded border border-white/15 bg-black/20 px-2 py-1 text-xs"
                      value={knownPlan ? draft.plan : "__custom__"}
                      onChange={(e) => {
                        if (e.target.value === "__custom__") return;
                        setDrafts({ ...drafts, [tenant.id]: { ...draft, plan: e.target.value } });
                      }}
                    >
                      {!knownPlan && <option value="__custom__">{draft.plan || "(kosong)"}</option>}
                      {plans.map((plan) => <option key={plan.id} value={plan.slug}>{plan.name}</option>)}
                    </select>
                  </td>
                  <td className="p-3">
                    <select
                      className="rounded border border-white/15 bg-black/20 px-2 py-1 text-xs"
                      value={draft.status}
                      onChange={(e) => setDrafts({ ...drafts, [tenant.id]: { ...draft, status: e.target.value } })}
                    >
                      <option value="active">active</option>
                      <option value="trial">trial</option>
                      <option value="suspended">suspended</option>
                    </select>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/45">{formatDate(tenant.subscriptionEndsAt)}</span>
                      <StatusPill subscriptionEndsAt={tenant.subscriptionEndsAt} locked={tenant.locked} />
                    </div>
                  </td>
                  <td className="p-3 text-white/60">{tenant.onlineKioskCount}/{tenant.kioskCount}</td>
                  <td className="p-3 text-white/60">{tenant.sessionCount}</td>
                  <td className="p-3 text-white/60">{money(tenant.revenue)}</td>
                  <td className="p-3">
                    <div className="flex gap-1.5">
                      <button type="button" disabled={busyId === tenant.id} onClick={() => extend(tenant.id, 7)} className="rounded-lg border border-white/15 px-2.5 py-1.5 text-xs hover:border-accent disabled:opacity-50">+7h</button>
                      <button type="button" disabled={busyId === tenant.id} onClick={() => extend(tenant.id, 30)} className="rounded-lg border border-white/15 px-2.5 py-1.5 text-xs hover:border-accent disabled:opacity-50">+30h</button>
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {dirty && (
                        <button type="button" disabled={busyId === tenant.id} onClick={() => savePlanStatus(tenant.id)} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
                          Simpan
                        </button>
                      )}
                      <button type="button" onClick={() => onSelectTenant(tenant.id)} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/60 hover:border-accent hover:text-white">Detail</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={10} className="p-6 text-center text-white/40">{tenants.length === 0 ? "Belum ada tenant." : "Tidak ada tenant yang cocok."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const EMPTY_PROFILE: Partial<TenantProfileFields> = { ownerName: "", ownerWhatsapp: "", businessType: "", city: "", address: "", website: "", instagramHandle: "", referralSource: "", internalNotes: "" };

function CreateTenantPanel({ plans, onCreated }: { plans: Plan[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [draft, setDraft] = useState({ name: "", slug: "", email: "", password: "", plan: "" });
  const [profile, setProfile] = useState<Partial<TenantProfileFields>>(EMPTY_PROFILE);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ kioskKey: string; adminEmail: string; slug: string; trialDays: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  const submit = async () => {
    setError("");
    setSubmitting(true);
    try {
      const created = await superadminApi.createTenant({
        name: draft.name.trim(),
        slug: draft.slug.trim() || slugify(draft.name),
        email: draft.email.trim(),
        password: draft.password,
        plan: draft.plan || undefined,
        ...profile,
      });
      if (!created) throw new Error("Gagal membuat tenant");
      setResult({ kioskKey: created.kioskKey, adminEmail: created.adminEmail, slug: created.tenant.slug, trialDays: created.trialDays });
      setDraft({ name: "", slug: "", email: "", password: "", plan: "" });
      setProfile(EMPTY_PROFILE);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat tenant");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-[2rem] border border-accent/25 bg-accent/[0.04] p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[.16em] text-accent">ONBOARDING</p>
          <h2 className="mt-2 font-display text-xl font-semibold">Tenant baru</h2>
        </div>
        <button type="button" onClick={() => { setOpen((v) => !v); setResult(null); }} className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/70 hover:border-accent">
          {open ? "Tutup" : "+ Tambah tenant"}
        </button>
      </div>

      {open && (
        result ? (
          <div className="mt-5 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-5">
            <p className="font-display text-lg font-semibold text-emerald-200">Tenant "{result.slug}" berhasil dibuat</p>
            <p className="mt-1 text-sm text-emerald-100/70">Admin login: {result.adminEmail} · Trial {result.trialDays} hari</p>
            <div className="mt-4">
              <p className="text-xs uppercase tracking-[.14em] text-emerald-200/70">Kiosk API key (hanya tampil sekali)</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs text-white/80">{result.kioskKey}</code>
                <button
                  type="button"
                  onClick={() => { navigator.clipboard?.writeText(result.kioskKey); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}
                  className="shrink-0 rounded-lg bg-accent px-3 py-2 text-xs font-semibold"
                >
                  {copied ? "Tersalin!" : "Salin"}
                </button>
              </div>
              <p className="mt-2 text-xs text-emerald-100/50">Tempel key ini ke layar "Setup / Pair kiosk ini" di aplikasi Electron tenant ini.</p>
            </div>
            <button type="button" onClick={() => setResult(null)} className="mt-4 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/60">Buat tenant lain</button>
          </div>
        ) : (
          <div className="mt-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-white/60">Nama studio
                <input className={inputClass} placeholder="Studio Kenangan" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value, slug: draft.slug || slugify(e.target.value) })} />
              </label>
              <label className="text-sm text-white/60">Slug
                <input className={inputClass} placeholder="studio-kenangan" value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: slugify(e.target.value) })} />
              </label>
              <label className="text-sm text-white/60">Email admin
                <input className={inputClass} type="email" placeholder="owner@studio.com" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
              </label>
              <label className="text-sm text-white/60">Password admin
                <input className={inputClass} type="password" placeholder="Minimal 6 karakter" value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} autoComplete="new-password" />
              </label>
              <label className="text-sm text-white/60 sm:col-span-2">Plan awal (opsional)
                <select className={inputClass} value={draft.plan} onChange={(e) => setDraft({ ...draft, plan: e.target.value })}>
                  <option value="">Trial (default)</option>
                  {plans.map((plan) => <option key={plan.id} value={plan.slug}>{plan.name}</option>)}
                </select>
              </label>
            </div>

            <button type="button" onClick={() => setShowProfile((v) => !v)} className="mt-4 text-xs text-accent hover:underline">
              {showProfile ? "− Sembunyikan detail bisnis" : "+ Detail bisnis (opsional — pemilik, kontak, referral)"}
            </button>
            {showProfile && (
              <div className="mt-3 rounded-xl border border-white/10 bg-black/10 p-4">
                <ProfileFieldsGrid value={profile} onChange={(patch) => setProfile({ ...profile, ...patch })} />
              </div>
            )}

            {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
            <button
              type="button"
              onClick={submit}
              disabled={submitting || !draft.name.trim() || !draft.email.trim() || draft.password.length < 6}
              className="mt-4 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? "Membuat…" : "Buat tenant"}
            </button>
          </div>
        )
      )}
    </section>
  );
}

function RecordPaymentForm({ tenant, plans, onRecorded }: { tenant: TenantDetail; plans: Plan[]; onRecorded: () => void }) {
  const [planId, setPlanId] = useState("");
  const [amount, setAmount] = useState("");
  const [periodDays, setPeriodDays] = useState("30");
  const [method, setMethod] = useState("manual");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const applyPlan = (id: string) => {
    setPlanId(id);
    const plan = plans.find((p) => p.id === id);
    if (plan) {
      setAmount(plan.price);
      setPeriodDays(plan.billingInterval === "yearly" ? "365" : "30");
    }
  };

  const submit = async () => {
    setError("");
    const amountNum = Number(amount);
    const daysNum = Number(periodDays);
    if (!Number.isFinite(amountNum) || amountNum < 0) return setError("Nominal tidak valid");
    if (!Number.isFinite(daysNum) || daysNum <= 0) return setError("Periode tidak valid");
    setSubmitting(true);
    try {
      const result = await superadminApi.recordPayment(tenant.id, { amount: amountNum, periodDays: daysNum, method, note: note.trim() || undefined, planId: planId || null });
      if (!result) throw new Error("Gagal mencatat pembayaran");
      setAmount("");
      setNote("");
      onRecorded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mencatat pembayaran");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-accent/20 bg-accent/[0.04] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Catat pembayaran</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-white/60 sm:col-span-2">Plan (opsional — isi otomatis nominal & periode)
          <select className={inputClass} value={planId} onChange={(e) => applyPlan(e.target.value)}>
            <option value="">Tanpa plan (manual)</option>
            {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} — {money(Number(plan.price))}{BILLING_LABEL[plan.billingInterval]}</option>)}
          </select>
        </label>
        <label className="text-sm text-white/60">Nominal (Rp)<input className={inputClass} type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label className="text-sm text-white/60">Perpanjang (hari)<input className={inputClass} type="number" min={1} value={periodDays} onChange={(e) => setPeriodDays(e.target.value)} /></label>
        <label className="text-sm text-white/60">Metode
          <select className={inputClass} value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="manual">Manual</option>
            <option value="transfer">Transfer bank</option>
            <option value="cash">Cash</option>
            <option value="other">Lainnya</option>
          </select>
        </label>
        <label className="text-sm text-white/60">Catatan (opsional)<input className={inputClass} placeholder="mis. Perpanjangan Feb 2026" value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      <button type="button" onClick={submit} disabled={submitting || !amount} className="mt-4 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">
        {submitting ? "Menyimpan…" : "Catat & perpanjang langganan"}
      </button>
    </div>
  );
}

function TenantDetailPanel({ tenantId, plans, onClose, onChanged }: { tenantId: string; plans: Plan[]; onClose: () => void; onChanged: () => void }) {
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileDraft, setProfileDraft] = useState<Partial<TenantProfileFields>>(EMPTY_PROFILE);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");

  const load = () => {
    setLoading(true);
    superadminApi.getTenant(tenantId).then((result) => {
      setTenant(result ?? null);
      if (result) {
        setProfileDraft({
          ownerName: result.ownerName ?? "", ownerWhatsapp: result.ownerWhatsapp ?? "", businessType: result.businessType ?? "",
          city: result.city ?? "", address: result.address ?? "", website: result.website ?? "",
          instagramHandle: result.instagramHandle ?? "", referralSource: result.referralSource ?? "", internalNotes: result.internalNotes ?? "",
        });
      }
    }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [tenantId]);

  const refreshAll = () => { load(); onChanged(); };

  const saveProfile = async () => {
    setSavingProfile(true);
    setProfileMessage("");
    try {
      await superadminApi.updateTenant(tenantId, profileDraft);
      setProfileMessage("Tersimpan.");
      onChanged();
    } catch (err) {
      setProfileMessage(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <section className="rounded-[2rem] border border-accent/30 bg-white/[0.045] p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[.16em] text-accent">DETAIL TENANT</p>
          <h2 className="mt-2 font-display text-xl font-semibold">{tenant?.name ?? (loading ? "Memuat…" : "Tenant tidak ditemukan")}</h2>
          {tenant && <p className="mt-1 text-sm text-white/45">{tenant.slug} · dibuat {formatDate(tenant.createdAt)}</p>}
        </div>
        <button type="button" onClick={onClose} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-white/60 hover:border-white/30">Tutup</button>
      </div>

      {tenant && (
        <div className="mt-5 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
          <div className="space-y-5">
            <RecordPaymentForm tenant={tenant} plans={plans} onRecorded={refreshAll} />

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/50">Riwayat pembayaran ({tenant.payments.length})</p>
              <div className="mt-3 space-y-2">
                {tenant.payments.map((payment) => (
                  <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm">
                    <div>
                      <p className="font-semibold">{money(Number(payment.amount))} <span className="font-normal text-white/40">· +{payment.periodDays} hari</span></p>
                      <p className="text-xs text-white/40">{payment.planName ?? "Tanpa plan"} · {payment.method} · {formatDate(payment.createdAt)}{payment.recordedBy ? ` · oleh ${payment.recordedBy}` : ""}</p>
                      {payment.note && <p className="mt-1 text-xs text-white/50">{payment.note}</p>}
                    </div>
                  </div>
                ))}
                {tenant.payments.length === 0 && <p className="text-sm text-white/40">Belum ada pembayaran tercatat.</p>}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/50">Profil bisnis</p>
              <div className="mt-3">
                <ProfileFieldsGrid value={profileDraft} onChange={(patch) => setProfileDraft({ ...profileDraft, ...patch })} />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <button type="button" onClick={saveProfile} disabled={savingProfile} className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold disabled:opacity-50">{savingProfile ? "Menyimpan…" : "Simpan profil"}</button>
                {profileMessage && <span className="text-xs text-white/50">{profileMessage}</span>}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/50">Aktivitas terbaru</p>
              <div className="mt-2 space-y-2">
                {tenant.recentEvents.map((event) => (
                  <div key={event.id} className="text-sm">
                    <span className={`mr-2 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${LEVEL_STYLE[event.level]}`}>{event.level}</span>
                    <span className="text-white/70">{event.message}</span>
                    <p className="ml-[3.1rem] text-xs text-white/35">{new Date(event.createdAt).toLocaleString("id-ID")}</p>
                  </div>
                ))}
                {tenant.recentEvents.length === 0 && <p className="text-sm text-white/40">Belum ada aktivitas tercatat untuk tenant ini.</p>}
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/50">Status langganan</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-sm text-white/70">{formatDate(tenant.subscriptionEndsAt)}</span>
                <StatusPill subscriptionEndsAt={tenant.subscriptionEndsAt} locked={tenant.locked} />
              </div>
              <p className="mt-2 text-xs text-white/40">Plan saat ini: {plans.find((p) => p.slug === tenant.plan)?.name ?? tenant.plan}</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/50">Admin ({tenant.admins.length})</p>
              <div className="mt-2 space-y-1.5">
                {tenant.admins.map((admin) => <p key={admin.id} className="text-sm text-white/70">{admin.email}</p>)}
                {tenant.admins.length === 0 && <p className="text-sm text-white/40">Belum ada admin.</p>}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/50">Kiosk key ({tenant.kioskKeys.length})</p>
              <div className="mt-2 space-y-2">
                {tenant.kioskKeys.map((key) => {
                  const diag = key.lastDiagnostics;
                  const issues = diag ? [!diag.cameraOk && "kamera", !diag.printerOk && "printer", !diag.networkOk && "jaringan"].filter(Boolean) as string[] : [];
                  return (
                    <div key={key.id} className="text-sm">
                      <p className="text-white/70">{key.label ?? "(tanpa label)"} {key.revokedAt && <span className="text-red-300">· dicabut</span>}{key.appVersion && <span className="text-white/30"> · v{key.appVersion}</span>}</p>
                      <p className="text-xs text-white/40">
                        {key.boundDeviceId ? "Device terpasang" : "Belum terpasang di device manapun"} · Terakhir dipakai {key.lastUsedAt ? formatDate(key.lastUsedAt) : "belum pernah"}
                      </p>
                      {diag && (
                        <p className={`text-xs ${issues.length > 0 ? "text-amber-300" : "text-emerald-300/70"}`}>
                          {issues.length > 0 ? `Masalah: ${issues.join(", ")}` : "Kamera, printer, jaringan OK"} · dicek {formatDate(diag.checkedAt)}
                        </p>
                      )}
                    </div>
                  );
                })}
                {tenant.kioskKeys.length === 0 && <p className="text-sm text-white/40">Belum ada kiosk key.</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

type Section = "overview" | "tenants" | "applications" | "events" | "plans" | "website" | "blog" | "marketplace" | "creators" | "settings";
const SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: "overview", label: "Ringkasan", icon: "⌘" },
  { id: "tenants", label: "Tenant", icon: "◎" },
  { id: "applications", label: "Aplikasi Tenant", icon: "✦" },
  { id: "events", label: "Aktivitas & Error", icon: "⌁" },
  { id: "plans", label: "Plans", icon: "▣" },
  { id: "website", label: "Konten Website", icon: "❖" },
  { id: "blog", label: "Blog", icon: "✎" },
  { id: "marketplace", label: "Marketplace", icon: "❒" },
  { id: "creators", label: "Kreator", icon: "✧" },
  { id: "settings", label: "Pengaturan", icon: "⚙" },
];

export default function SuperadminDashboard() {
  const [status, setStatus] = useState<"checking" | "needsLogin" | "authenticated">("checking");
  const [email, setEmail] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [tenants, setTenants] = useState<SuperadminTenant[]>([]);
  const [section, setSection] = useState<Section>("overview");
  const [pendingApplicationCount, setPendingApplicationCount] = useState(0);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const tenantsReloadRef = useRef<(() => void) | null>(null);

  const loadPlans = () => { superadminApi.getPlans().then((rows) => setPlans((rows ?? []).filter((p) => p.active))).catch(() => undefined); };
  // A light, separate fetch from TenantsTable's own — just for the tenant
  // filter dropdown on the Activity & Error log, so that tab doesn't need
  // the full table mounted to know which tenants exist.
  const loadTenantsForFilter = () => { superadminApi.getTenants().then((rows) => setTenants(rows ?? [])).catch(() => undefined); };
  const loadPendingApplicationCount = () => {
    superadminApi.getTenantApplications("pending").then((rows) => setPendingApplicationCount((rows ?? []).length)).catch(() => undefined);
  };

  useEffect(() => {
    document.documentElement.classList.add("superadmin-mode");
    document.body.classList.add("superadmin-mode");
    return () => {
      document.documentElement.classList.remove("superadmin-mode");
      document.body.classList.remove("superadmin-mode");
    };
  }, []);

  // Re-fetch once we're actually logged in, not just on mount — mount can
  // happen before login (still on "checking"/"needsLogin"), when the request
  // would 401 and never get retried, leaving every plan-picker in this dashboard
  // (tenant table, "Plan awal" on tenant creation) permanently empty even after
  // a successful login.
  useEffect(() => {
    if (status === "authenticated") {
      loadPlans();
      loadTenantsForFilter();
      loadPendingApplicationCount();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const evaluate = () => {
    if (!getSuperadminToken()) {
      setStatus("needsLogin");
      return;
    }
    superadminApi.getMe().then((result) => {
      setEmail(result?.email ?? null);
      setStatus("authenticated");
    }).catch((err) => {
      if (err instanceof SuperadminApiError && err.status === 401) {
        setSuperadminToken(null);
        setStatus("needsLogin");
      } else {
        setStatus("authenticated");
      }
    });
  };

  useEffect(() => {
    evaluate();
    const onUnauthorized = () => setStatus("needsLogin");
    window.addEventListener("studiodo-superadmin-unauthorized", onUnauthorized);
    return () => window.removeEventListener("studiodo-superadmin-unauthorized", onUnauthorized);
  }, []);

  const logout = async () => {
    await superadminApi.logout().catch(() => undefined);
    setSuperadminToken(null);
    setStatus("needsLogin");
  };

  if (status === "checking") {
    return <div className="flex h-screen items-center justify-center bg-[#0b0b10] text-white/50">Memuat…</div>;
  }
  if (status === "needsLogin") {
    return <LoginForm onLoggedIn={evaluate} />;
  }

  const selectTenantAndSwitch = (id: string) => {
    setSelectedTenantId(id);
    setSection("tenants");
  };

  return (
    <div className="min-h-screen bg-[#0b0b10] px-6 py-10 text-white">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.25em] text-accent">STUDIODO</p>
            <h1 className="mt-1 font-display text-3xl font-bold">Admin Pusat</h1>
            {email && <p className="mt-1 text-sm text-white/45">Masuk sebagai {email}</p>}
          </div>
          <button type="button" onClick={logout} className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/60 hover:border-red-400 hover:text-red-300">
            Keluar
          </button>
        </header>

        <nav className="flex flex-wrap gap-2 border-b border-white/10 pb-4">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${section === item.id ? "bg-accent text-white shadow-lg shadow-accent/20" : "text-white/55 hover:bg-white/10 hover:text-white"}`}
            >
              <span className="opacity-70">{item.icon}</span>
              {item.label}
              {item.id === "applications" && pendingApplicationCount > 0 && (
                <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{pendingApplicationCount}</span>
              )}
            </button>
          ))}
        </nav>

        {section === "overview" && (
          <div className="space-y-6">
            <FleetAlertsPanel />
            <PlatformOverviewPanel />
          </div>
        )}

        {section === "tenants" && (
          <div className="space-y-6">
            <CreateTenantPanel plans={plans} onCreated={() => { tenantsReloadRef.current?.(); loadTenantsForFilter(); }} />
            {selectedTenantId && (
              <TenantDetailPanel
                tenantId={selectedTenantId}
                plans={plans}
                onClose={() => setSelectedTenantId(null)}
                onChanged={() => tenantsReloadRef.current?.()}
              />
            )}
            <TenantsTable plans={plans} onSelectTenant={selectTenantAndSwitch} reloadRef={tenantsReloadRef} />
          </div>
        )}

        {section === "applications" && (
          <TenantApplicationsPanel onConverted={() => { tenantsReloadRef.current?.(); loadTenantsForFilter(); loadPendingApplicationCount(); }} />
        )}

        {section === "events" && <EventsLogPanel tenants={tenants} />}

        {section === "plans" && <PlansPanel onPlansChanged={loadPlans} />}

        {section === "website" && <SiteContentPanel />}

        {section === "blog" && <BlogPanel />}

        {section === "marketplace" && <MarketplacePanel />}

        {section === "creators" && <CreatorsPanel />}

        {section === "settings" && (
          <div className="grid gap-6">
            <PlatformSettingsPanel />
            <PaymentGatewaysPanel />
          </div>
        )}
      </div>
    </div>
  );
}
