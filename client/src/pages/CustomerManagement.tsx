import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function CustomerManagement() {
  const [customers, setCustomers] = useState<any[]>([]);
  useEffect(() => { api.getCustomers().then(setCustomers).catch((error) => console.error("Gagal memuat customer", error)); }, []);
  return <div className="h-full overflow-y-auto px-6 py-8"><div className="mx-auto max-w-5xl">
    <p className="text-sm uppercase tracking-[.2em] text-accent">STUDIODO CRM</p>
    <h1 className="mt-2 font-display text-4xl font-bold">Manajemen Customer</h1>
    <p className="mt-2 text-white/50">Kontak, persetujuan publikasi, feedback, dan link galeri hasil sesi.</p>
    <div className="mt-6 overflow-x-auto rounded-2xl border border-white/10">
      <table className="w-full text-left text-sm"><thead className="bg-white/5 text-white/60"><tr><th className="p-3">Tanggal</th><th className="p-3">WhatsApp</th><th className="p-3">Email</th><th className="p-3">Publikasi</th><th className="p-3">Feedback</th><th className="p-3">Galeri</th></tr></thead>
        <tbody>{customers.map((customer) => <tr key={customer.id} className="border-t border-white/10"><td className="p-3">{new Date(customer.createdAt).toLocaleString("id-ID")}</td><td className="p-3">{customer.customerWhatsapp || "-"}</td><td className="p-3">{customer.customerEmail || "-"}</td><td className="p-3">{customer.publishConsent ? "Ya" : "Tidak"}</td><td className="max-w-xs p-3">{customer.feedback || "-"}</td><td className="p-3">{customer.shareUrl ? <a className="text-accent" href={customer.shareUrl} target="_blank">Buka</a> : "-"}</td></tr>)}</tbody>
      </table>
    </div>
  </div></div>;
}
