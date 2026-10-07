import { useEffect, useState } from "react";
import { Link } from "wouter";
import { api } from "@/lib/api";
import { Icon } from "@/components/kiosk/Icons";

const PAGE_SIZE = 100;

export default function CustomerManagement() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);

  useEffect(() => {
    api.getCustomers({ limit: PAGE_SIZE, offset: page * PAGE_SIZE })
      .then((result) => { setCustomers(result?.items ?? []); setTotal(result?.total ?? 0); })
      .catch((error) => console.error("Gagal memuat customer", error));
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return <div className="h-full overflow-y-auto px-6 py-8"><div className="mx-auto max-w-5xl">
    <Link href="/admin" className="mb-5 inline-flex items-center gap-2 rounded-xl border border-fg/15 px-4 py-2 text-sm font-medium text-fg/70 transition hover:border-accent hover:text-fg"><Icon name="arrow-left" className="h-4 w-4" />Kembali ke Dashboard</Link>
    <p className="text-sm uppercase tracking-[.2em] text-accent">STUDIODO CRM</p>
    <h1 className="mt-2 font-display text-4xl font-bold">Manajemen Customer</h1>
    <p className="mt-2 text-fg/50">Kontak, persetujuan publikasi, feedback, dan link galeri hasil sesi. {total} customer total, terbaru dulu.</p>
    <div className="mt-6 overflow-x-auto rounded-2xl border border-fg/10">
      <table className="w-full text-left text-sm"><thead className="bg-fg/5 text-fg/60"><tr><th className="p-3">Tanggal</th><th className="p-3">WhatsApp</th><th className="p-3">Email</th><th className="p-3">Publikasi</th><th className="p-3">Feedback</th><th className="p-3">Galeri</th></tr></thead>
        <tbody>{customers.map((customer) => <tr key={customer.id} className="border-t border-fg/10"><td className="p-3">{new Date(customer.createdAt).toLocaleString("id-ID")}</td><td className="p-3">{customer.customerWhatsapp || "-"}</td><td className="p-3">{customer.customerEmail || "-"}</td><td className="p-3">{customer.publishConsent ? "Ya" : "Tidak"}</td><td className="max-w-xs p-3">{customer.feedback || "-"}</td><td className="p-3">{customer.shareUrl ? <a className="text-accent" href={customer.shareUrl} target="_blank">Buka</a> : "-"}</td></tr>)}</tbody>
      </table>
    </div>
    {totalPages > 1 && (
      <div className="mt-4 flex items-center justify-between text-sm text-fg/60">
        <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-fg/15 px-3 py-1.5 disabled:opacity-30">← Sebelumnya</button>
        <span>Halaman {page + 1} dari {totalPages}</span>
        <button type="button" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-fg/15 px-3 py-1.5 disabled:opacity-30">Berikutnya →</button>
      </div>
    )}
  </div></div>;
}
