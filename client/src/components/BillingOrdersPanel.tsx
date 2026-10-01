import { useEffect, useState } from "react";
import { superadminApi, type BillingOrderRow } from "@/lib/superadminApi";

const STATUS: Record<BillingOrderRow["status"], { label: string; cls: string }> = {
  paid: { label: "Lunas", cls: "border-emerald-400/30 text-emerald-300" },
  pending: { label: "Menunggu", cls: "border-amber-400/30 text-amber-300" },
  failed: { label: "Gagal", cls: "border-red-400/30 text-red-300" },
  expired: { label: "Kedaluwarsa", cls: "border-fg/20 text-fg/50" },
};
const money = (v: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);
const fmt = (v: string | null) => (v ? new Date(v).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-");

export function BillingOrdersPanel() {
  const [rows, setRows] = useState<BillingOrderRow[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"" | BillingOrderRow["status"]>("");

  useEffect(() => {
    setRows(null);
    superadminApi.getBillingOrders(filter).then((r) => { setRows(r ?? []); setError(""); }).catch((e) => setError(e instanceof Error ? e.message : "Gagal memuat"));
  }, [filter]);

  const paidTotal = (rows ?? []).filter((r) => r.status === "paid").reduce((s, r) => s + r.amount, 0);
  return (
    <section className="rounded-[2rem] border border-fg/10 bg-fg/[0.045] p-6">
      <p className="text-xs uppercase tracking-[.16em] text-accent">PEMBAYARAN</p>
      <h2 className="mt-2 font-display text-xl font-semibold">Checkout langganan online</h2>
      <p className="mt-1 text-sm text-fg/45">Pesanan perpanjangan lewat Midtrans/Xendit dari portal tenant. Pembayaran manual dicatat di detail tenant.</p>
      {error && <p role="alert" className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        {(["", "paid", "pending", "failed", "expired"] as const).map((f) => (
          <button key={f || "all"} type="button" onClick={() => setFilter(f)} className={`rounded-full px-4 py-1.5 font-semibold ${filter === f ? "bg-accent text-white" : "bg-fg/10 text-fg/60 hover:bg-fg/15"}`}>
            {f ? STATUS[f].label : "Semua"}
          </button>
        ))}
        {rows && rows.some((r) => r.status === "paid") && <span className="ml-auto text-fg/50">Lunas di daftar ini: <b className="text-fg">{money(paidTotal)}</b></span>}
      </div>
      <div className="mt-5 overflow-x-auto">
        {rows === null ? (error ? null : <p role="status" className="text-sm text-fg/50">Memuat pesanan…</p>) : rows.length === 0 ? <p className="text-sm text-fg/45">Belum ada pesanan.</p> : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-fg/40"><tr><th className="py-2 pr-4">Waktu</th><th className="pr-4">Tenant</th><th className="pr-4">Paket</th><th className="pr-4">Nominal</th><th className="pr-4">Gateway</th><th>Status</th></tr></thead>
            <tbody className="divide-y divide-fg/5">
              {rows.map((r) => (
                <tr key={r.orderId}>
                  <td className="py-2.5 pr-4 text-fg/60">{fmt(r.paidAt ?? r.createdAt)}</td>
                  <td className="pr-4 font-semibold">{r.tenantName}</td>
                  <td className="pr-4">{r.planName} · {r.periodDays}h</td>
                  <td className="pr-4">{money(r.amount)}</td>
                  <td className="pr-4 capitalize text-fg/60">{r.provider}{r.paymentType ? ` · ${r.paymentType}` : ""}</td>
                  <td><span className={`rounded-full border px-2.5 py-1 text-xs ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
