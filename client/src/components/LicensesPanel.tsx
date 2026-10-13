import { useEffect, useMemo, useState } from "react";
import { superadminApi, type LicenseRow, type LicenseType, type SuperadminTenant } from "@/lib/superadminApi";

// Superadmin control over every booth licence: issue trial keys, convert trial → paid, shift or set the end date,
// reset the device, revoke / restore. One kiosk key = one booth = one licence.
// Used both as the platform-wide "Lisensi & Trial" tab and (with `tenantId`) inside a tenant's detail panel.

const inputClass = "mt-1 w-full rounded-lg border border-fg/15 bg-fg/5 px-3 py-2 text-sm outline-none focus:border-accent";
const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const toInputDate = (v: string | null) => (v ? new Date(v).toISOString().slice(0, 10) : "");

const TYPE_LABEL: Record<LicenseType, string> = { trial: "Trial", paid: "Berlangganan", unpaid: "Belum bayar" };

function StatePill({ row }: { row: LicenseRow }) {
  if (row.revokedAt) return <span className="rounded-full border border-fg/20 px-2.5 py-1 text-xs text-fg/50">Dicabut</span>;
  if (row.locked) {
    const text = row.lockReason === "unpaid" ? "Terkunci · belum bayar" : row.lockReason === "trial_expired" ? "Trial habis" : row.lockReason === "suspended" ? "Tenant suspended" : "Terkunci";
    return <span className="rounded-full border border-red-500/50 bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-200">{text}</span>;
  }
  if (row.graceDaysRemaining !== null) return <span className="rounded-full border border-amber-400/30 px-2.5 py-1 text-xs text-amber-300">Masa tenggang {row.graceDaysRemaining}h</span>;
  if (row.licenseEndsAt === null) return <span className="rounded-full border border-emerald-400/30 px-2.5 py-1 text-xs text-emerald-300">Aktif · tanpa batas</span>;
  const tone = (row.daysRemaining ?? 0) <= 7 ? "border-amber-400/30 text-amber-300" : "border-emerald-400/30 text-emerald-300";
  return <span className={`rounded-full border px-2.5 py-1 text-xs ${tone}`}>{row.daysRemaining} hari lagi</span>;
}

function IssueKeyForm({ tenants, fixedTenantId, onIssued }: { tenants: SuperadminTenant[]; fixedTenantId?: string; onIssued: () => void }) {
  const [tenantId, setTenantId] = useState(fixedTenantId ?? "");
  const [kind, setKind] = useState<LicenseType>("trial");
  const [days, setDays] = useState("14");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [issued, setIssued] = useState<{ key: string; label: string | null; kind: LicenseType; days: number; tenantName: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const effectiveTenant = fixedTenantId ?? tenantId;
  const submit = async () => {
    setError("");
    if (!effectiveTenant) return setError("Pilih tenant dulu");
    setBusy(true);
    try {
      const result = await superadminApi.issueLicenseKey(effectiveTenant, { kind, days: kind === "unpaid" ? undefined : Number(days), label: label.trim() || undefined });
      if (!result) throw new Error("Gagal membuat key");
      setIssued({ key: result.key, label: result.label, kind, days: Number(days), tenantName: tenants.find((t) => t.id === effectiveTenant)?.name ?? "" });
      setLabel("");
      onIssued();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membuat key");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-accent/25 bg-accent/[0.04] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Terbitkan key booth</p>
      <p className="mt-1 text-xs text-fg/45">
        Key trial: pengguna baru memasukkannya di aplikasi kiosk. Saat masa trial habis, kiosk terkunci otomatis dan pemilik diminta berlangganan.
      </p>
      {issued ? (
        <div className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4">
          <p className="text-sm font-semibold text-emerald-200">
            Key {issued.kind === "trial" ? `trial ${issued.days} hari` : issued.kind === "paid" ? `berlangganan ${issued.days} hari` : "booth"} untuk {issued.tenantName} dibuat
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs text-white/80">{issued.key}</code>
            <button type="button" onClick={() => { navigator.clipboard?.writeText(issued.key); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }} className="shrink-0 rounded-lg bg-accent px-3 py-2 text-xs font-semibold">
              {copied ? "Tersalin!" : "Salin"}
            </button>
          </div>
          <p className="mt-2 text-xs text-emerald-100/50">Kirim ke pelanggan: tempel di layar "Setup kiosk ini" pada aplikasi STUDIODO. Key bisa dilihat lagi nanti lewat tombol "Lihat key".</p>
          <button type="button" onClick={() => setIssued(null)} className="mt-3 rounded-lg border border-fg/15 px-3 py-1.5 text-xs text-fg/60">Buat key lain</button>
        </div>
      ) : (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            {!fixedTenantId && (
              <label className="text-sm text-fg/60 sm:col-span-2">Tenant
                <select className={inputClass} value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
                  <option value="">Pilih tenant…</option>
                  {tenants.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>)}
                </select>
              </label>
            )}
            <label className="text-sm text-fg/60">Jenis
              <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as LicenseType)}>
                <option value="trial">Trial</option>
                <option value="paid">Berlangganan (gratis/manual)</option>
                <option value="unpaid">Belum bayar (terkunci)</option>
              </select>
            </label>
            {kind !== "unpaid" && (
              <label className="text-sm text-fg/60">Lama (hari)
                <input className={inputClass} type="number" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} />
              </label>
            )}
            <label className={`text-sm text-fg/60 ${fixedTenantId ? "sm:col-span-2" : "sm:col-span-4"}`}>Label (opsional)
              <input className={inputClass} placeholder="mis. Trial Bu Rina" value={label} onChange={(e) => setLabel(e.target.value)} />
            </label>
          </div>
          {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
          <button type="button" onClick={submit} disabled={busy} className="mt-3 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold disabled:opacity-50">{busy ? "Membuat…" : "Terbitkan key"}</button>
        </>
      )}
    </div>
  );
}

function RowActions({ row, onChanged }: { row: LicenseRow; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [type, setType] = useState<LicenseType>(row.licenseType);
  const [date, setDate] = useState(toInputDate(row.licenseEndsAt));
  const [revealed, setRevealed] = useState<string | null>(null);
  const [error, setError] = useState("");

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try { await fn(); onChanged(); } catch (e) { setError(e instanceof Error ? e.message : "Gagal"); } finally { setBusy(false); }
  };
  const extend = (days: number) => run(() => superadminApi.updateLicense(row.id, { extendDays: days }));
  const save = () => run(async () => {
    await superadminApi.updateLicense(row.id, { licenseType: type, licenseEndsAt: type === "unpaid" ? null : date ? new Date(`${date}T23:59:59`).toISOString() : null });
    setEditing(false);
  });
  const reveal = () => run(async () => { const r = await superadminApi.revealLicenseKey(row.id); setRevealed(r?.key ?? null); });

  const btn = "rounded-lg border border-fg/15 px-2.5 py-1.5 text-xs text-fg/70 hover:border-accent disabled:opacity-50";
  if (row.revokedAt) {
    return <button type="button" disabled={busy} onClick={() => run(() => superadminApi.restoreLicense(row.id))} className={btn}>Pulihkan</button>;
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap justify-end gap-1.5">
        <button type="button" disabled={busy} onClick={() => extend(7)} className={btn}>+7h</button>
        <button type="button" disabled={busy} onClick={() => extend(30)} className={btn}>+30h</button>
        <button type="button" disabled={busy} onClick={() => setEditing((v) => !v)} className={btn}>{editing ? "Batal" : "Atur"}</button>
        <button type="button" disabled={busy} onClick={reveal} className={btn}>Lihat key</button>
        {row.paired && <button type="button" disabled={busy} onClick={() => window.confirm("Reset device? Komputer yang sedang memakai key ini akan ditolak sampai dipasang ulang.") && run(() => superadminApi.resetLicenseDevice(row.id))} className={btn}>Reset device</button>}
        <button type="button" disabled={busy} onClick={() => window.confirm("Cabut booth ini? Kiosk yang memakainya langsung berhenti.") && run(() => superadminApi.revokeLicense(row.id))} className={`${btn} hover:!border-red-400 hover:text-red-300`}>Cabut</button>
      </div>
      {editing && (
        <div className="flex flex-wrap items-end justify-end gap-2 rounded-xl border border-fg/10 bg-fg/5 p-3 text-left">
          <label className="text-xs text-fg/55">Jenis
            <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as LicenseType)}>
              <option value="trial">Trial</option><option value="paid">Berlangganan</option><option value="unpaid">Belum bayar</option>
            </select>
          </label>
          {type !== "unpaid" && (
            <label className="text-xs text-fg/55">Berakhir pada
              <input className={inputClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          )}
          <button type="button" disabled={busy || (type === "trial" && !date)} onClick={save} className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold disabled:opacity-50">Simpan</button>
          {type === "paid" && <p className="w-full text-[11px] text-fg/40">Kosongkan tanggal pada "Berlangganan" untuk tanpa batas waktu.</p>}
        </div>
      )}
      {revealed && (
        <div className="flex items-center gap-2">
          <code className="flex-1 overflow-x-auto rounded-lg border border-fg/15 bg-black/30 px-2 py-1.5 text-[11px] text-white/80">{revealed}</code>
          <button type="button" onClick={() => navigator.clipboard?.writeText(revealed)} className={btn}>Salin</button>
        </div>
      )}
      {error && <p className="text-right text-xs text-red-300">{error}</p>}
    </div>
  );
}

export function LicensesPanel({ tenantId, tenants = [], onChanged }: { tenantId?: string; tenants?: SuperadminTenant[]; onChanged?: () => void }) {
  const [rows, setRows] = useState<LicenseRow[] | null>(null);
  const [error, setError] = useState("");
  const [type, setType] = useState("");
  const [state, setState] = useState("");
  const [q, setQ] = useState("");
  const [showRevoked, setShowRevoked] = useState(false);

  const load = () => {
    superadminApi.getLicenses({ type, state: showRevoked ? "revoked" : state, tenantId, q: q.trim() })
      .then((r) => { setRows(r ?? []); setError(""); })
      .catch((e) => setError(e instanceof Error ? e.message : "Gagal memuat"));
  };
  useEffect(() => { load(); }, [type, state, showRevoked, tenantId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = window.setTimeout(load, 350);
    return () => window.clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = () => { load(); onChanged?.(); };
  const counts = useMemo(() => {
    const list = rows ?? [];
    return { trial: list.filter((r) => r.licenseType === "trial").length, paid: list.filter((r) => r.licenseType === "paid").length, unpaid: list.filter((r) => r.licenseType === "unpaid").length, locked: list.filter((r) => r.locked).length };
  }, [rows]);

  const chip = (active: boolean) => `rounded-full px-3.5 py-1.5 text-xs font-semibold ${active ? "bg-accent text-white" : "bg-fg/10 text-fg/60 hover:bg-fg/15"}`;

  return (
    <section className={tenantId ? "space-y-4" : "rounded-[2rem] border border-fg/10 bg-fg/[0.045] p-6 space-y-5"}>
      {!tenantId && (
        <div>
          <p className="text-xs uppercase tracking-[.16em] text-accent">LISENSI PER BOOTH</p>
          <h2 className="mt-2 font-display text-xl font-semibold">Lisensi & key trial</h2>
          <p className="mt-1 text-sm text-fg/45">Satu key = satu booth = satu langganan. Di sini kamu menerbitkan key trial, mengubah trial jadi berlangganan, dan mengatur masa aktif setiap booth.</p>
        </div>
      )}

      <IssueKeyForm tenants={tenants} fixedTenantId={tenantId} onIssued={changed} />

      <div className="flex flex-wrap items-center gap-2">
        {[["", "Semua jenis"], ["trial", "Trial"], ["paid", "Berlangganan"], ["unpaid", "Belum bayar"]].map(([v, l]) => (
          <button key={v || "all"} type="button" onClick={() => { setShowRevoked(false); setType(v); }} className={chip(!showRevoked && type === v)}>{l}</button>
        ))}
        <span className="mx-1 text-fg/20">|</span>
        {[["", "Semua status"], ["active", "Jalan"], ["expiring", "Segera habis"], ["locked", "Terkunci"]].map(([v, l]) => (
          <button key={v || "any"} type="button" onClick={() => { setShowRevoked(false); setState(v); }} className={chip(!showRevoked && state === v)}>{l}</button>
        ))}
        <button type="button" onClick={() => setShowRevoked((v) => !v)} className={chip(showRevoked)}>Dicabut</button>
        {!tenantId && <input placeholder="Cari tenant / label…" value={q} onChange={(e) => setQ(e.target.value)} className="ml-auto w-56 rounded-lg border border-fg/15 bg-fg/5 px-3 py-2 text-xs outline-none focus:border-accent" />}
      </div>
      {rows && !showRevoked && <p className="text-xs text-fg/45">{rows.length} booth · {counts.paid} berlangganan · {counts.trial} trial · {counts.unpaid} belum bayar · {counts.locked} terkunci</p>}

      {error && <p role="alert" className="rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
      <div className="max-h-[62vh] overflow-auto">
        {rows === null ? (error ? null : <p role="status" className="text-sm text-fg/50">Memuat…</p>) : rows.length === 0 ? (
          <p className="text-sm text-fg/45">Tidak ada booth yang cocok.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-surface text-xs uppercase tracking-wider text-fg/40">
              <tr>{!tenantId && <th className="py-2 pr-4">Tenant</th>}<th className="pr-4">Booth</th><th className="pr-4">Jenis</th><th className="pr-4">Berakhir</th><th className="pr-4">Status</th><th className="pr-4">Terakhir aktif</th><th className="text-right">Aksi</th></tr>
            </thead>
            <tbody className="divide-y divide-fg/5">
              {rows.map((row) => (
                <tr key={row.id} className="align-top">
                  {!tenantId && <td className="py-3 pr-4 font-semibold">{row.tenantName}{row.tenantStatus === "suspended" && <span className="ml-2 text-xs font-normal text-red-300">suspended</span>}</td>}
                  <td className="py-3 pr-4">{row.label ?? <span className="text-fg/35">(tanpa label)</span>}<p className="text-xs text-fg/35">{row.paired ? "Terpasang" : "Belum dipasang"}{row.appVersion ? ` · v${row.appVersion}` : ""}</p></td>
                  <td className="py-3 pr-4">{TYPE_LABEL[row.licenseType]}{row.licensePlanSlug && <p className="text-xs text-fg/35">{row.licensePlanSlug}</p>}</td>
                  <td className="py-3 pr-4 text-fg/60">{fmtDate(row.licenseEndsAt)}</td>
                  <td className="py-3 pr-4"><StatePill row={row} /></td>
                  <td className="py-3 pr-4 text-xs text-fg/45">{row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "belum pernah"}</td>
                  <td className="py-3 text-right"><RowActions row={row} onChanged={changed} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
