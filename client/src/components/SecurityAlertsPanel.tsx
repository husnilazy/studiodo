import { useEffect, useState } from "react";
import { superadminApi, type SecurityAlert } from "@/lib/superadminApi";
import WhatsAppFollowUp from "@/components/WhatsAppFollowUp";

// Overview card: tenants whose login was just locked after repeated wrong passwords, each with a WhatsApp button so
// the Superadmin can ask "was that you?" immediately. Disappears when there is nothing in the last 14 days.

const ago = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} jam lalu` : `${Math.floor(h / 24)} hari lalu`;
};

export default function SecurityAlertsPanel() {
  const [alerts, setAlerts] = useState<SecurityAlert[] | null>(null);

  useEffect(() => {
    superadminApi.getSecurityAlerts().then((rows) => setAlerts(rows ?? [])).catch(() => setAlerts([]));
  }, []);

  if (!alerts || alerts.length === 0) return null;
  return (
    <section className="rounded-3xl border border-amber-400/40 bg-amber-400/[0.07] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg font-semibold">Peringatan keamanan <span className="ml-1 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">{alerts.length}</span></h3>
        <p className="text-xs text-fg/50">Login dikunci setelah kata sandi salah berulang · 14 hari terakhir</p>
      </div>
      <ul className="mt-3 divide-y divide-fg/10">
        {alerts.slice(0, 8).map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{a.tenantName ?? "Email tidak dikenal"} <span className="font-normal text-fg/50">· {a.email}</span></p>
              <p className="text-xs text-fg/50">Dikunci {a.lockMinutes} menit (kunci ke-{a.lockoutCount}) · IP {a.ip ?? "?"} · {ago(a.createdAt)}</p>
            </div>
            {a.tenantName
              ? <WhatsAppFollowUp phone={a.ownerWhatsapp} context="security" vars={{ owner: a.ownerName, business: a.tenantName }} />
              : <span className="text-xs text-fg/35">Tidak ada akun terkait</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
