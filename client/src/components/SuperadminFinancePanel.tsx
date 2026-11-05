import { useCallback, useEffect, useState } from "react";
import { superadminApi, type FinanceOverview, type FinanceTenantRow, type FinanceUser, type LedgerRow, type WithdrawalPolicy } from "@/lib/superadminApi";
import { pushToast } from "@/lib/toastStore";
import Spinner from "@/components/Spinner";

const money = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
const inputClass = "w-full rounded-xl border border-fg/15 bg-surface px-3 py-2 text-sm outline-none transition focus:border-accent";
const card = "rounded-2xl border border-fg/10 bg-fg/[0.03] p-4";
const DAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "accent" | "warn" }) {
  return (
    <div className={card}>
      <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-fg/45">{label}</p>
      <p className={`mt-1.5 font-display text-xl font-semibold tracking-tight ${tone === "accent" ? "text-accent" : tone === "warn" ? "text-amber-600" : ""}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-fg/45">{hint}</p>}
    </div>
  );
}

const errMessage = (err: unknown) => (err instanceof Error ? err.message : "Terjadi kesalahan");

/** Form for a withdrawal policy. `partial` = tenant override: every field can inherit (blank) instead of being set. */
function PolicyForm({ value, onChange, partial }: { value: Partial<WithdrawalPolicy>; onChange: (next: Partial<WithdrawalPolicy>) => void; partial?: boolean }) {
  const set = <K extends keyof WithdrawalPolicy>(key: K, v: WithdrawalPolicy[K] | undefined) => {
    const next = { ...value };
    if (v === undefined) delete next[key]; else next[key] = v;
    onChange(next);
  };
  const numberField = (key: "minAmount" | "maxAmount" | "dailyMaxAmount" | "dailyMaxCount" | "holdDays" | "cooldownHours" | "approvalThreshold" | "newAccountHoldHours", label: string, hint: string) => (
    <label className="block text-sm text-fg/60">
      {label}
      <input className={inputClass} type="number" min={0} inputMode="numeric" value={value[key] ?? ""} placeholder={partial ? "ikut default" : "0"}
        onChange={(e) => set(key, e.target.value === "" ? undefined : Math.max(0, Math.floor(Number(e.target.value) || 0)))} />
      <span className="mt-1 block text-[11px] text-fg/40">{hint}</span>
    </label>
  );
  const mode = value.mode ?? (partial ? undefined : "anytime");
  const days = value.days ?? [0, 1, 2, 3, 4, 5, 6];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={value.enabled !== false} onChange={(e) => set("enabled", e.target.checked ? (partial ? undefined : true) : false)} />
          Penarikan aktif {value.enabled === false && <span className="rounded-full bg-red-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-500">Dibekukan</span>}
        </label>
      </div>
      <div>
        <p className="text-sm text-fg/60">Kapan tenant boleh menarik</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {partial && <button type="button" onClick={() => set("mode", undefined)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${mode === undefined ? "border-accent bg-accent/10" : "border-fg/15"}`}>Ikut default</button>}
          <button type="button" onClick={() => set("mode", "anytime")} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${mode === "anytime" ? "border-accent bg-accent/10" : "border-fg/15"}`}>Kapan saja</button>
          <button type="button" onClick={() => set("mode", "window")} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${mode === "window" ? "border-accent bg-accent/10" : "border-fg/15"}`}>Hari &amp; jam tertentu</button>
        </div>
        {mode === "window" && (
          <div className="mt-3 space-y-3 rounded-xl bg-fg/[0.04] p-3">
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((name, index) => {
                const on = days.includes(index);
                return <button key={name} type="button" onClick={() => set("days", (on ? days.filter((d) => d !== index) : [...days, index]).sort())} className={`h-9 w-11 rounded-lg border text-xs font-semibold ${on ? "border-accent bg-accent/10" : "border-fg/15 text-fg/50"}`}>{name}</button>;
              })}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <input className={`${inputClass} !w-28`} type="time" value={value.fromTime ?? "09:00"} onChange={(e) => set("fromTime", e.target.value)} />
              <span>sampai</span>
              <input className={`${inputClass} !w-28`} type="time" value={value.toTime ?? "16:00"} onChange={(e) => set("toTime", e.target.value)} />
              <span className="text-xs text-fg/45">WIB</span>
            </div>
          </div>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {numberField("minAmount", "Minimal per penarikan (Rp)", "0 = pakai minimal platform")}
        {numberField("maxAmount", "Maksimal per penarikan (Rp)", "0 = tanpa batas")}
        {numberField("dailyMaxAmount", "Batas nominal per hari (Rp)", "0 = tanpa batas")}
        {numberField("dailyMaxCount", "Batas permintaan per hari", "0 = tanpa batas")}
        {numberField("holdDays", "Dana ditahan (hari)", "Pembayaran baru bisa ditarik setelah N hari (antisipasi refund)")}
        {numberField("cooldownHours", "Jeda antar permintaan (jam)", "0 = tanpa jeda")}
        {numberField("approvalThreshold", "Butuh persetujuan 2 orang mulai (Rp)", "Satu orang menyetujui, orang lain yang membayar. 0 = nonaktif")}
        {numberField("newAccountHoldHours", "Tahan rekening baru (jam)", "Rekening tujuan yang belum pernah dibayar ditahan N jam sebelum bisa diproses. 0 = nonaktif")}
        <label className="block text-sm text-fg/60">
          Fee platform (%)
          <input className={inputClass} type="number" min={0} max={30} step="0.01" value={value.feePercent ?? ""} placeholder="ikut default"
            onChange={(e) => set("feePercent", e.target.value === "" ? (partial ? undefined : null) : Number(e.target.value))} />
          <span className="mt-1 block text-[11px] text-fg/40">Berlaku untuk pembayaran BARU; yang lama tetap pada fee saat itu</span>
        </label>
        <label className="block text-sm text-fg/60">
          Biaya transfer per penarikan (Rp)
          <input className={inputClass} type="number" min={0} value={value.flatFee ?? ""} placeholder="ikut default"
            onChange={(e) => set("flatFee", e.target.value === "" ? (partial ? undefined : null) : Math.max(0, Math.floor(Number(e.target.value) || 0)))} />
        </label>
      </div>
    </div>
  );
}

function TenantDrawer({ row, onClose, onChanged }: { row: FinanceTenantRow; onClose: () => void; onChanged: () => void }) {
  const [ledger, setLedger] = useState<{ rows: LedgerRow[]; balance: { available: number; onHold: number; pending: number; withdrawn: number } } | null>(null);
  const [override, setOverride] = useState<Partial<WithdrawalPolicy>>({});
  const [summary, setSummary] = useState("");
  const [adjust, setAdjust] = useState({ amount: "", note: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [l, p] = await Promise.all([superadminApi.getTenantLedger(row.tenantId), superadminApi.getTenantPolicy(row.tenantId)]);
    if (l) setLedger(l);
    if (p) { setOverride(p.override); setSummary(p.summary); }
  }, [row.tenantId]);
  useEffect(() => { void load().catch((e) => pushToast({ type: "error", title: "Gagal memuat", sub: errMessage(e) })); }, [load]);

  const savePolicy = async (next: Partial<WithdrawalPolicy> | null) => {
    setBusy(true);
    try {
      const result = await superadminApi.saveTenantPolicy(row.tenantId, next);
      if (result) { setOverride(result.override); setSummary(result.summary); }
      pushToast({ type: "success", title: next ? "Kebijakan tenant disimpan" : "Kembali ke default platform" });
      onChanged();
    } catch (e) { pushToast({ type: "error", title: "Gagal menyimpan", sub: errMessage(e) }); } finally { setBusy(false); }
  };
  const submitAdjust = async () => {
    setBusy(true);
    try {
      await superadminApi.adjustTenantBalance(row.tenantId, Math.trunc(Number(adjust.amount)), adjust.note);
      setAdjust({ amount: "", note: "" });
      pushToast({ type: "success", title: "Penyesuaian tercatat" });
      await load();
      onChanged();
    } catch (e) { pushToast({ type: "error", title: "Penyesuaian gagal", sub: errMessage(e) }); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="flex h-full w-full max-w-2xl flex-col gap-5 overflow-y-auto bg-canvas p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[.16em] text-accent">SALDO TENANT</p>
            <h3 className="font-display text-2xl font-semibold">{row.name}</h3>
            <p className="mt-1 text-xs text-fg/50">{summary}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full bg-fg/10 px-3 py-1.5 text-sm hover:bg-fg/20">Tutup</button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Bisa ditarik" value={money(ledger?.balance.available ?? row.available)} tone="accent" />
          <Stat label="Ditahan" value={money(ledger?.balance.onHold ?? row.onHold)} />
          <Stat label="Diproses" value={money(ledger?.balance.pending ?? row.pending)} />
          <Stat label="Sudah ditarik" value={money(ledger?.balance.withdrawn ?? row.withdrawn)} />
        </div>

        <section className={card}>
          <h4 className="font-display text-lg font-semibold">Kebijakan penarikan khusus tenant ini</h4>
          <p className="mt-1 text-xs text-fg/50">Kolom yang dikosongkan mengikuti default platform. Hilangkan centang "Penarikan aktif" untuk membekukan tenant ini.</p>
          <div className="mt-4"><PolicyForm value={override} onChange={setOverride} partial /></div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => savePolicy(override)} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Simpan kebijakan</button>
            <button type="button" disabled={busy} onClick={() => savePolicy(null)} className="rounded-xl border border-fg/15 px-4 py-2 text-sm hover:border-accent">Ikut default platform</button>
          </div>
        </section>

        <section className={card}>
          <h4 className="font-display text-lg font-semibold">Penyesuaian saldo manual</h4>
          <p className="mt-1 text-xs text-fg/50">Untuk koreksi (mis. refund). Selalu tercatat permanen di buku besar dengan alasan dan nama kamu.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[160px_1fr_auto]">
            <input className={inputClass} type="number" inputMode="numeric" placeholder="± Rupiah" value={adjust.amount} onChange={(e) => setAdjust({ ...adjust, amount: e.target.value })} />
            <input className={inputClass} placeholder="Alasan (wajib)" value={adjust.note} onChange={(e) => setAdjust({ ...adjust, note: e.target.value })} />
            <button type="button" disabled={busy || !Number(adjust.amount) || adjust.note.trim().length < 5} onClick={submitAdjust} className="rounded-xl border border-fg/20 px-4 py-2 text-sm font-semibold hover:border-accent disabled:opacity-40">Catat</button>
          </div>
        </section>

        <section className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-display text-lg font-semibold">Buku besar</h4>
            <button type="button" onClick={() => void superadminApi.downloadFinanceCsv(`/finance/tenants/${row.tenantId}/ledger?format=csv`, `buku-besar-${row.name}.csv`).catch((e) => pushToast({ type: "error", title: "Unduh gagal", sub: errMessage(e) }))} className="text-xs font-semibold text-accent hover:underline">Unduh CSV</button>
          </div>
          {!ledger ? <div className="flex h-24 items-center justify-center"><Spinner size="sm" /></div> : ledger.rows.length === 0 ? <p className="mt-3 text-sm text-fg/45">Belum ada pergerakan saldo.</p> : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="uppercase tracking-wide text-fg/40"><tr><th className="py-2 pr-3">Waktu</th><th className="py-2 pr-3">Jenis</th><th className="py-2 pr-3">Keterangan</th><th className="py-2 pr-3 text-right">Jumlah</th><th className="py-2">Status</th></tr></thead>
                <tbody>
                  {ledger.rows.slice(0, 100).map((r, i) => (
                    <tr key={i} className="border-t border-fg/10 align-top">
                      <td className="py-2 pr-3 text-fg/55">{new Date(r.at).toLocaleString("id-ID")}</td>
                      <td className="py-2 pr-3 font-semibold">{r.type}</td>
                      <td className="py-2 pr-3 text-fg/65">{r.description}{r.note && r.type !== "Penyesuaian" ? <span className="block text-fg/40">{r.note}</span> : null}</td>
                      <td className={`py-2 pr-3 text-right font-semibold ${r.amount < 0 ? "text-red-500" : "text-emerald-600"}`}>{r.amount < 0 ? "−" : "+"}{money(Math.abs(r.amount))}</td>
                      <td className="py-2 text-fg/55">{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}

export default function SuperadminFinancePanel({ isOwner }: { isOwner: boolean }) {
  const [tab, setTab] = useState<"summary" | "policy" | "users">("summary");
  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<FinanceTenantRow | null>(null);
  const [policy, setPolicy] = useState<Partial<WithdrawalPolicy>>({});
  const [policySummary, setPolicySummary] = useState("");
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [users, setUsers] = useState<FinanceUser[]>([]);
  const [newUser, setNewUser] = useState({ email: "", password: "" });
  const [reconciling, setReconciling] = useState(false);

  const loadOverview = useCallback(async () => {
    try { const result = await superadminApi.getFinanceOverview(); if (result) { setOverview(result); setError(null); } } catch (e) { setError(errMessage(e)); }
  }, []);
  useEffect(() => { void loadOverview(); }, [loadOverview]);
  useEffect(() => {
    if (tab === "policy") void superadminApi.getFinancePolicy().then((r) => { if (r) { setPolicy(r.policy); setPolicySummary(r.summary); } }).catch((e) => setError(errMessage(e)));
    if (tab === "users" && isOwner) void superadminApi.getFinanceUsers().then((r) => r && setUsers(r)).catch((e) => setError(errMessage(e)));
  }, [tab, isOwner]);

  const savePolicy = async () => {
    setSavingPolicy(true);
    try {
      const result = await superadminApi.saveFinancePolicy(policy);
      if (result) { setPolicy(result.policy); setPolicySummary(result.summary); }
      pushToast({ type: "success", title: "Kebijakan default disimpan" });
      void loadOverview();
    } catch (e) { pushToast({ type: "error", title: "Gagal menyimpan", sub: errMessage(e) }); } finally { setSavingPolicy(false); }
  };
  const reconcile = async () => {
    setReconciling(true);
    try {
      const result = await superadminApi.runReconcile();
      pushToast({ type: "success", title: `${result?.credited ?? 0} pembayaran dicatat`, sub: money(result?.amount ?? 0) });
      await loadOverview();
    } catch (e) { pushToast({ type: "error", title: "Rekonsiliasi gagal", sub: errMessage(e) }); } finally { setReconciling(false); }
  };

  const tabs = [{ id: "summary", label: "Saldo tenant" }, { id: "policy", label: "Kebijakan penarikan" }, ...(isOwner ? [{ id: "users", label: "Akun finance" }] : [])] as { id: "summary" | "policy" | "users"; label: string }[];

  return (
    <div className="space-y-5">
      <nav className="flex gap-1 self-start rounded-full border border-fg/10 bg-fg/[0.05] p-1" aria-label="Keuangan tenant">
        {tabs.map((t) => <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${tab === t.id ? "bg-fg text-canvas shadow-md" : "text-fg/55 hover:text-fg"}`}>{t.label}</button>)}
      </nav>
      {error && <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-2.5 text-sm text-red-500">{error}</p>}

      {tab === "summary" && (!overview ? <div className="flex h-48 items-center justify-center"><Spinner size="md" /></div> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Utang ke tenant" value={money(overview.totals.owed)} tone="accent" hint="Semua saldo tenant yang dipegang STUDIODO" />
            <Stat label="Bisa ditarik sekarang" value={money(overview.totals.available)} hint={`${money(overview.totals.onHold)} masih ditahan`} />
            <Stat label="Menunggu transfer" value={money(overview.totals.awaitingPayout)} hint="Permintaan penarikan yang belum dibayar" tone={overview.totals.awaitingPayout > 0 ? "warn" : undefined} />
            <Stat label="Fee STUDIODO" value={money(overview.totals.feesEarned)} hint={`${money(overview.totals.paidOut)} sudah dibayarkan ke tenant`} />
          </div>

          {overview.uncredited.count > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm">
              <span><strong>{overview.uncredited.count} pembayaran QRIS</strong> ({money(overview.uncredited.amount)}) sudah lunas tapi belum masuk saldo tenant, misalnya karena webhook terlewat.</span>
              <button type="button" disabled={reconciling} onClick={reconcile} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{reconciling ? "Mencatat…" : "Catat ke saldo"}</button>
            </div>
          )}

          <section className={card}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-lg font-semibold">Tenant dengan QRIS STUDIODO ({overview.totals.tenants})</h3>
              <div className="flex gap-3 text-xs font-semibold text-accent">
                <button type="button" onClick={() => void superadminApi.downloadFinanceCsv("/finance/withdrawals.csv?status=pending", "penarikan-baru.csv").catch((e) => pushToast({ type: "error", title: "Unduh gagal", sub: errMessage(e) }))} className="hover:underline">CSV penarikan baru</button>
                <button type="button" onClick={() => void superadminApi.downloadFinanceCsv("/finance/withdrawals.csv", "penarikan-semua.csv").catch((e) => pushToast({ type: "error", title: "Unduh gagal", sub: errMessage(e) }))} className="hover:underline">CSV semua penarikan</button>
              </div>
            </div>
            {overview.items.length === 0 ? <p className="mt-3 text-sm text-fg/45">Belum ada tenant yang memakai QRIS STUDIODO. Aktifkan lewat menu Tenant, bagian penyelesaian QRIS.</p> : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-fg/40"><tr><th className="py-2 pr-3">Tenant</th><th className="py-2 pr-3 text-right">Pemasukan</th><th className="py-2 pr-3 text-right">Bisa ditarik</th><th className="py-2 pr-3 text-right">Ditahan</th><th className="py-2 pr-3 text-right">Diproses</th><th className="py-2 pr-3 text-right">Sudah ditarik</th><th className="py-2" /></tr></thead>
                  <tbody>
                    {overview.items.map((item) => (
                      <tr key={item.tenantId} className="border-t border-fg/10">
                        <td className="py-2.5 pr-3 font-semibold">{item.name}{item.frozen && <span className="ml-2 rounded-full bg-red-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-500">Beku</span>}{item.hasOverride && !item.frozen && <span className="ml-2 rounded-full bg-fg/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-fg/50">Khusus</span>}</td>
                        <td className="py-2.5 pr-3 text-right text-fg/65">{money(item.gross)}</td>
                        <td className="py-2.5 pr-3 text-right font-semibold text-accent">{money(item.available)}</td>
                        <td className="py-2.5 pr-3 text-right text-fg/55">{money(item.onHold)}</td>
                        <td className="py-2.5 pr-3 text-right text-fg/55">{money(item.pending)}</td>
                        <td className="py-2.5 pr-3 text-right text-fg/55">{money(item.withdrawn)}</td>
                        <td className="py-2.5 text-right"><button type="button" onClick={() => setSelected(item)} className="rounded-lg border border-fg/15 px-3 py-1.5 text-xs font-semibold hover:border-accent">Kelola</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ))}

      {tab === "policy" && (
        <section className={card}>
          <h3 className="font-display text-lg font-semibold">Kebijakan penarikan default (semua tenant)</h3>
          <p className="mt-1 text-xs text-fg/50">Berlaku untuk semua tenant yang memakai QRIS STUDIODO, kecuali tenant yang punya kebijakan khusus (diatur dari tombol Kelola di daftar tenant). Sekarang: <strong>{policySummary}</strong>.</p>
          <div className="mt-4"><PolicyForm value={policy} onChange={setPolicy} /></div>
          <button type="button" disabled={savingPolicy} onClick={savePolicy} className="mt-5 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{savingPolicy ? "Menyimpan…" : "Simpan kebijakan default"}</button>
        </section>
      )}

      {tab === "users" && isOwner && (
        <section className={card}>
          <h3 className="font-display text-lg font-semibold">Akun finance</h3>
          <p className="mt-1 text-xs text-fg/50">Akun finance hanya bisa membuka menu Keuangan (saldo tenant, kebijakan, penarikan). Tidak bisa mengubah tenant, paket, atau konten. Sarankan mereka mengaktifkan 2FA di Pengaturan.</p>
          <div className="mt-4 divide-y divide-fg/10">
            {users.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                <span><strong>{u.email}</strong> <span className="ml-2 rounded-full bg-fg/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-fg/50">{u.role}</span> {u.twoFactor ? <span className="ml-1 text-xs text-emerald-600">2FA aktif</span> : <span className="ml-1 text-xs text-amber-600">tanpa 2FA</span>}</span>
                {u.role === "finance" && <button type="button" onClick={async () => { if (!window.confirm(`Hapus akun ${u.email}?`)) return; try { await superadminApi.deleteFinanceUser(u.id); setUsers((list) => list.filter((x) => x.id !== u.id)); } catch (e) { pushToast({ type: "error", title: "Gagal menghapus", sub: errMessage(e) }); } }} className="text-xs text-red-500 hover:underline">Hapus</button>}
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <input className={inputClass} type="email" placeholder="Email finance" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
            <input className={inputClass} type="password" autoComplete="new-password" placeholder="Kata sandi (min. 10 karakter)" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
            <button type="button" disabled={!newUser.email || newUser.password.length < 10} onClick={async () => { try { const created = await superadminApi.createFinanceUser(newUser.email, newUser.password); if (created) setUsers((list) => [...list, created]); setNewUser({ email: "", password: "" }); pushToast({ type: "success", title: "Akun finance dibuat" }); } catch (e) { pushToast({ type: "error", title: "Gagal membuat akun", sub: errMessage(e) }); } }} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Buat akun</button>
          </div>
        </section>
      )}

      {selected && <TenantDrawer row={selected} onClose={() => setSelected(null)} onChanged={() => void loadOverview()} />}
    </div>
  );
}
