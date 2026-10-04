import { useCallback, useEffect, useState } from "react";
import { superadminApi, type TenantQrisBalance, type WithdrawalAdminRow } from "@/lib/superadminApi";
import Spinner from "@/components/Spinner";

const money = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
const inputClass = "w-full rounded-xl border border-fg/15 bg-surface px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";

const STATUS_LABEL: Record<WithdrawalAdminRow["status"], { label: string; className: string }> = {
  pending: { label: "Baru", className: "bg-amber-300/20 text-amber-600" },
  processing: { label: "Sedang ditransfer", className: "bg-sky-400/15 text-sky-600" },
  paid: { label: "Sudah dibayar", className: "bg-emerald-400/15 text-emerald-600" },
  rejected: { label: "Ditolak / batal", className: "bg-red-400/15 text-red-500" },
};

const FILTERS = [
  { id: "open", label: "Perlu ditindaklanjuti" },
  { id: "paid", label: "Sudah dibayar" },
  { id: "rejected", label: "Ditolak" },
  { id: "all", label: "Semua" },
] as const;

function WithdrawalCard({ item, onChanged }: { item: WithdrawalAdminRow; onChanged: () => void }) {
  const [mode, setMode] = useState<"idle" | "pay" | "reject">("idle");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = STATUS_LABEL[item.status];
  const final = item.status === "paid" || item.status === "rejected";

  const act = async (body: Parameters<typeof superadminApi.updateWithdrawal>[1]) => {
    setBusy(true);
    setError(null);
    try {
      await superadminApi.updateWithdrawal(item.id, body);
      setMode("idle");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memperbarui");
    } finally {
      setBusy(false);
    }
  };

  const copy = (text: string) => { void navigator.clipboard?.writeText(text); };

  return (
    <article className="rounded-2xl border border-fg/10 bg-fg/[0.03] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-fg/50">{item.tenantName} · {new Date(item.requestedAt).toLocaleString("id-ID")}</p>
          <p className="mt-1 font-display text-2xl font-semibold">{money(Number(item.netAmount))} <span className="text-sm font-normal text-fg/45">yang ditransfer (permintaan {money(Number(item.amount))}{Number(item.feeAmount) > 0 ? `, biaya ${money(Number(item.feeAmount))}` : ""})</span></p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${status.className}`}>{status.label}</span>
      </div>

      <div className="mt-3 grid gap-2 rounded-xl bg-fg/[0.04] p-3 text-sm sm:grid-cols-3">
        <div><p className="text-[11px] uppercase tracking-wide text-fg/40">Bank / e-wallet</p><p className="font-semibold">{item.bankName}</p></div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-fg/40">Nomor rekening</p>
          <p className="font-mono font-semibold">{item.accountNumber} <button type="button" onClick={() => copy(item.accountNumber)} className="ml-1 font-sans text-xs font-normal text-accent hover:underline">salin</button></p>
        </div>
        <div><p className="text-[11px] uppercase tracking-wide text-fg/40">Atas nama</p><p className="font-semibold">{item.accountName}</p></div>
      </div>
      {item.requestNote && <p className="mt-2 text-sm text-fg/60">Catatan tenant: {item.requestNote}</p>}
      {item.adminNote && <p className="mt-1 text-sm text-fg/60">Catatan admin: {item.adminNote}</p>}
      {item.transferReference && <p className="mt-1 text-sm text-fg/60">Ref. transfer: {item.transferReference}</p>}
      {item.processedBy && <p className="mt-1 text-xs text-fg/40">Diproses oleh {item.processedBy}{item.processedAt ? ` · ${new Date(item.processedAt).toLocaleString("id-ID")}` : ""}</p>}

      {!final && mode === "idle" && (
        <div className="mt-4 flex flex-wrap gap-2">
          {item.status === "pending" && <button type="button" disabled={busy} onClick={() => act({ status: "processing" })} className="rounded-xl border border-sky-400/40 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-600 disabled:opacity-50">Mulai proses transfer</button>}
          <button type="button" onClick={() => setMode("pay")} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white">Tandai sudah dibayar</button>
          <button type="button" onClick={() => setMode("reject")} className="rounded-xl border border-red-400/40 px-4 py-2 text-sm font-semibold text-red-500 hover:bg-red-400/10">Tolak</button>
        </div>
      )}
      {mode === "pay" && (
        <div className="mt-4 space-y-2 rounded-xl border border-accent/30 bg-accent/[0.04] p-3">
          <p className="text-sm text-fg/60">Pastikan {money(Number(item.netAmount))} sudah masuk ke rekening di atas, lalu isi referensi transfernya.</p>
          <input className={inputClass} placeholder="No. referensi / bukti transfer (opsional)" value={reference} onChange={(e) => setReference(e.target.value)} />
          <input className={inputClass} placeholder="Catatan untuk tenant (opsional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => act({ status: "paid", transferReference: reference, adminNote: note })} className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy && <Spinner size="sm" />}Konfirmasi lunas</button>
            <button type="button" onClick={() => setMode("idle")} className="rounded-xl border border-fg/15 px-4 py-2 text-sm text-fg/60">Batal</button>
          </div>
        </div>
      )}
      {mode === "reject" && (
        <div className="mt-4 space-y-2 rounded-xl border border-red-400/30 bg-red-400/[0.04] p-3">
          <p className="text-sm text-fg/60">Saldo dikembalikan ke tenant. Tulis alasannya — tenant akan membacanya.</p>
          <input className={inputClass} placeholder="Alasan penolakan (wajib)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <button type="button" disabled={busy || !note.trim()} onClick={() => act({ status: "rejected", adminNote: note })} className="flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy && <Spinner size="sm" />}Tolak permintaan</button>
            <button type="button" onClick={() => setMode("idle")} className="rounded-xl border border-fg/15 px-4 py-2 text-sm text-fg/60">Batal</button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </article>
  );
}

/** Superadmin → Penarikan: every tenant's QRIS payout request, followed up from "baru" to "sudah dibayar". */
export default function SuperadminWithdrawalsPanel({ onSummary }: { onSummary?: (open: number) => void }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("open");
  const [data, setData] = useState<Awaited<ReturnType<typeof superadminApi.getWithdrawals>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await superadminApi.getWithdrawals(filter === "all" ? "all" : filter);
      setData(result ?? null);
      setError(null);
      if (result) onSummary?.(result.summary.open);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat");
    } finally {
      setLoading(false);
    }
  }, [filter, onSummary]);
  useEffect(() => { void load(); }, [load]);

  return (
    <section className="rounded-[2rem] border border-fg/10 bg-fg/[0.045] p-6">
      <p className="text-xs uppercase tracking-[.16em] text-accent">PENARIKAN SALDO QRIS</p>
      <h2 className="mt-2 font-display text-xl font-semibold">Permintaan penarikan tenant</h2>
      <p className="mt-1 text-sm text-fg/45">Hanya tenant yang QRIS-nya ditampung akun STUDIODO (diatur di detail tenant) yang bisa menarik saldo. Transfer manual ke rekening tenant, lalu tandai lunas di sini.</p>

      {data && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-fg/10 bg-fg/[0.03] p-4"><p className="text-[11px] uppercase tracking-wide text-fg/45">Perlu ditindaklanjuti</p><p className="mt-1 font-display text-2xl font-semibold">{data.summary.open}</p></div>
          <div className="rounded-2xl border border-fg/10 bg-fg/[0.03] p-4"><p className="text-[11px] uppercase tracking-wide text-fg/45">Total yang harus ditransfer</p><p className="mt-1 font-display text-2xl font-semibold text-accent">{money(data.summary.openAmount)}</p></div>
          <div className="rounded-2xl border border-fg/10 bg-fg/[0.03] p-4"><p className="text-[11px] uppercase tracking-wide text-fg/45">Sudah dibayarkan (total)</p><p className="mt-1 font-display text-2xl font-semibold">{money(data.summary.paidAmount)}</p></div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button key={item.id} type="button" onClick={() => setFilter(item.id)} className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${filter === item.id ? "border-accent bg-accent/15 text-fg" : "border-fg/15 text-fg/55 hover:border-fg/35 hover:text-fg"}`}>{item.label}</button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {loading && !data && <div className="flex h-32 items-center justify-center"><Spinner size="md" /></div>}
        {error && <p className="text-sm text-red-500">{error}</p>}
        {data?.items.map((item) => <WithdrawalCard key={item.id} item={item} onChanged={load} />)}
        {data && data.items.length === 0 && <p className="py-8 text-center text-sm text-fg/40">{filter === "open" ? "Tidak ada permintaan yang menunggu. 🎉" : "Belum ada data."}</p>}
      </div>
    </section>
  );
}

/** In a tenant's detail drawer: where this tenant's kiosk QRIS money lands, plus its current balance. */
export function QrisSettlementControl({ tenantId, current, onChanged }: { tenantId: string; current: "direct" | "platform"; onChanged: () => void }) {
  const [balance, setBalance] = useState<TenantQrisBalance | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    superadminApi.getTenantQrisBalance(tenantId).then((result) => setBalance(result ?? null)).catch(() => setBalance(null));
  }, [tenantId, current]);

  const change = async (mode: "direct" | "platform") => {
    if (mode === current) return;
    const warning = mode === "platform"
      ? "Mulai sekarang QRIS tenant ini ditampung di akun Xendit STUDIODO dan tenant menarik saldonya lewat permintaan penarikan. Lanjutkan?"
      : "Kembali ke mode langsung: tenant harus mengisi Xendit-nya sendiri. Lanjutkan?";
    if (!window.confirm(warning)) return;
    setSaving(true);
    setMessage(null);
    try {
      await superadminApi.updateTenant(tenantId, { qrisSettlement: mode });
      setMessage("Tersimpan.");
      onChanged();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-fg/10 bg-fg/5 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-fg/50">Penampungan pembayaran QRIS</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {([
          ["direct", "Langsung ke tenant", "Tenant isi Xendit sendiri. Uang masuk ke akun Xendit mereka."],
          ["platform", "Ditampung STUDIODO", "Pakai akun Xendit STUDIODO. Tenant menarik saldo (ada fee)."],
        ] as const).map(([mode, title, hint]) => (
          <button key={mode} type="button" disabled={saving} onClick={() => change(mode)} className={`rounded-xl border p-3 text-left transition ${current === mode ? "border-accent bg-accent/10" : "border-fg/10 hover:border-fg/30"}`}>
            <p className="text-sm font-semibold">{title}</p>
            <p className="mt-0.5 text-xs text-fg/50">{hint}</p>
          </button>
        ))}
      </div>
      {current === "platform" && balance && (
        <p className="mt-3 text-sm text-fg/60">Saldo tersedia <strong className="text-fg">{money(balance.available)}</strong> · diproses {money(balance.pending)} · sudah ditarik {money(balance.withdrawn)}</p>
      )}
      {message && <p className="mt-2 text-xs text-fg/55">{message}</p>}
    </div>
  );
}
