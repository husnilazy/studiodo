import { useCallback, useEffect, useState } from "react";
import { api, type WithdrawalOverview, type WithdrawalRow } from "@/lib/api";
import { panel, inputClass } from "@/lib/adminUi";
import { pushToast } from "@/lib/toastStore";
import Spinner from "@/components/Spinner";

const money = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

const STATUS: Record<WithdrawalRow["status"], { label: string; className: string }> = {
  pending: { label: "Menunggu", className: "bg-amber-300/20 text-amber-600" },
  processing: { label: "Sedang ditransfer", className: "bg-sky-400/15 text-sky-600" },
  paid: { label: "Sudah dibayar", className: "bg-emerald-400/15 text-emerald-600" },
  rejected: { label: "Ditolak / batal", className: "bg-red-400/15 text-red-500" },
};

const BANKS = ["BCA", "BNI", "BRI", "Mandiri", "BSI", "CIMB Niaga", "Permata", "Jago", "SeaBank", "DANA", "OVO", "GoPay", "ShopeePay", "Lainnya"];

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "accent" }) {
  return (
    <div className="rounded-2xl border border-fg/10 bg-fg/[0.03] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-fg/45">{label}</p>
      <p className={`mt-2 font-display text-2xl font-semibold tracking-tight ${tone === "accent" ? "text-accent" : ""}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-fg/45">{hint}</p>}
    </div>
  );
}

/** Admin → Finance → Penarikan: the QRIS balance held for a platform-settled tenant, and the payout requests. */
export default function WithdrawalPanel() {
  const [overview, setOverview] = useState<WithdrawalOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ amount: "", bankName: "BCA", accountNumber: "", accountName: "", note: "" });
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.getWithdrawals();
      if (!result) return;
      setOverview(result);
      setError(null);
      setForm((current) => (current.accountNumber || !result.lastAccount ? current : { ...current, ...result.lastAccount }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat saldo");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (error && !overview) return <section className={panel}><p className="text-sm text-red-500">{error}</p></section>;
  if (!overview) return <section className={`${panel} flex h-48 items-center justify-center`}><Spinner size="md" /></section>;

  const { balance, items } = overview;

  if (balance.settlement !== "platform") {
    return (
      <section className={panel}>
        <p className="text-xs uppercase tracking-[.16em] text-accent">PENARIKAN QRIS</p>
        <h3 className="mt-2 font-display text-2xl font-semibold">Pembayaran QRIS langsung ke rekening kamu</h3>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg/60">
          Akun kamu memakai Xendit milikmu sendiri (diatur di <strong>Paket &amp; QRIS</strong>), jadi uang QRIS masuk langsung ke saldo Xendit kamu — tidak ada saldo yang perlu ditarik di sini.
          Kalau kamu ingin STUDIODO yang menampung pembayaran QRIS (tanpa perlu akun Xendit sendiri) lalu kamu tarik ke rekening kapan saja, hubungi admin STUDIODO untuk mengaktifkannya.
        </p>
      </section>
    );
  }

  const amount = Math.floor(Number(form.amount) || 0);
  const net = amount - balance.rules.flatFee;
  const canSubmit = amount >= balance.rules.minAmount && amount <= balance.available && form.accountNumber.trim() && form.accountName.trim() && !submitting;

  const submit = async () => {
    setSubmitting(true);
    try {
      await api.requestWithdrawal({ amount, bankName: form.bankName, accountNumber: form.accountNumber, accountName: form.accountName, note: form.note || undefined });
      setForm((current) => ({ ...current, amount: "", note: "" }));
      pushToast({ type: "success", title: "Permintaan penarikan terkirim", sub: "Admin STUDIODO akan memprosesnya. Statusnya bisa dilihat di daftar ini." });
      await load();
    } catch (err) {
      pushToast({ type: "error", title: "Penarikan gagal diajukan", sub: err instanceof Error ? err.message : undefined });
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async (id: string) => {
    setCancellingId(id);
    try {
      await api.cancelWithdrawal(id);
      await load();
    } catch (err) {
      pushToast({ type: "error", title: "Tidak bisa dibatalkan", sub: err instanceof Error ? err.message : undefined });
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <section className={panel}>
        <p className="text-xs uppercase tracking-[.16em] text-accent">SALDO QRIS</p>
        <h3 className="mt-2 font-display text-2xl font-semibold">Saldo yang bisa ditarik</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Bisa ditarik" value={money(balance.available)} tone="accent" hint="Setelah potongan & penarikan sebelumnya" />
          <Stat label="Total pemasukan QRIS" value={money(balance.grossIncome)} hint={`${balance.paymentCount} pembayaran`} />
          <Stat label={`Biaya layanan ${balance.rules.feePercent}%`} value={`− ${money(balance.platformFee)}`} />
          <Stat label="Sudah / sedang ditarik" value={money(balance.withdrawn + balance.pending)} hint={balance.pending > 0 ? `${money(balance.pending)} masih diproses` : undefined} />
        </div>
      </section>

      <section className={panel}>
        <h3 className="font-display text-2xl font-semibold">Ajukan penarikan</h3>
        <p className="mt-1 text-sm text-fg/55">Minimal {money(balance.rules.minAmount)}{balance.rules.flatFee > 0 ? ` · biaya transfer ${money(balance.rules.flatFee)} per penarikan` : ""}. Admin STUDIODO mentransfer secara manual ke rekening di bawah.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm text-fg/60">
            Nominal (Rp)
            <input className={inputClass} type="number" min={0} inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder={String(balance.rules.minAmount)} />
            <span className="mt-1 flex gap-2 text-xs">
              <button type="button" onClick={() => setForm({ ...form, amount: String(balance.available) })} className="text-accent hover:underline">Tarik semua ({money(balance.available)})</button>
            </span>
          </label>
          <label className="block text-sm text-fg/60">
            Bank / e-wallet
            <select className={inputClass} value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })}>
              {BANKS.map((bank) => <option key={bank} value={bank}>{bank}</option>)}
            </select>
          </label>
          <label className="block text-sm text-fg/60">
            Nomor rekening / e-wallet
            <input className={inputClass} inputMode="numeric" value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} />
          </label>
          <label className="block text-sm text-fg/60">
            Nama pemilik rekening
            <input className={inputClass} value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })} />
          </label>
          <label className="block text-sm text-fg/60 md:col-span-2">
            Catatan (opsional)
            <input className={inputClass} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button onClick={submit} disabled={!canSubmit} className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
            {submitting && <Spinner size="sm" />}{submitting ? "Mengirim…" : "Ajukan penarikan"}
          </button>
          {amount > 0 && <span className="text-sm text-fg/55">Kamu terima: <strong className="text-fg">{money(Math.max(0, net))}</strong></span>}
          {amount > balance.available && <span className="text-sm text-red-500">Melebihi saldo yang bisa ditarik</span>}
          {amount > 0 && amount < balance.rules.minAmount && <span className="text-sm text-red-500">Di bawah minimal penarikan</span>}
        </div>
      </section>

      <section className={panel}>
        <h3 className="font-display text-2xl font-semibold">Riwayat penarikan</h3>
        {items.length === 0 ? (
          <p className="mt-4 text-sm text-fg/45">Belum ada permintaan penarikan.</p>
        ) : (
          <div className="mt-4 divide-y divide-fg/10">
            {items.map((item) => {
              const status = STATUS[item.status];
              return (
                <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-3.5">
                  <div className="min-w-0">
                    <p className="font-semibold">{money(Number(item.amount))} <span className="text-sm font-normal text-fg/45">→ {item.bankName} {item.accountNumber} a.n. {item.accountName}</span></p>
                    <p className="mt-0.5 text-xs text-fg/45">Diajukan {new Date(item.requestedAt).toLocaleString("id-ID")}{item.processedAt ? ` · diproses ${new Date(item.processedAt).toLocaleString("id-ID")}` : ""}</p>
                    {item.adminNote && <p className="mt-1 text-xs text-fg/60">Catatan admin: {item.adminNote}</p>}
                    {item.transferReference && <p className="mt-0.5 text-xs text-fg/60">Ref. transfer: {item.transferReference}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${status.className}`}>{status.label}</span>
                    {item.status === "pending" && (
                      <button onClick={() => cancel(item.id)} disabled={cancellingId === item.id} className="text-xs text-red-500 hover:underline disabled:opacity-50">{cancellingId === item.id ? "…" : "Batalkan"}</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
