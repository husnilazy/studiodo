import { useBoothConfig } from "@/lib/boothConfigStore";
import { useSubscriptionLock } from "@/lib/subscriptionLockStore";

// Fase 6 — rendered by App.tsx in place of the normal kiosk flow once a heartbeat
// confirms the tenant's subscription is locked. No dismiss button: unlike
// AdminDashboard.tsx's SubscriptionBanner, this isn't a warning, it's what's
// actually happening right now.
export default function SubscriptionLockedScreen() {
  const config = useBoothConfig((s) => s.config);
  const { renewalWhatsapp, renewalCheckoutUrl } = useSubscriptionLock();

  const renewUrl = renewalWhatsapp
    ? `https://wa.me/${renewalWhatsapp.replace(/[^0-9]/g, "")}?text=${encodeURIComponent("Halo, saya mau perpanjang langganan STUDIODO.")}`
    : renewalCheckoutUrl || null;

  return (
    <div className="kinetic-page relative flex h-full w-full flex-col items-center justify-center gap-6 overflow-hidden px-8 text-center">
      {config.logoUrl && (
        <img src={config.logoUrl} alt={config.brandName} className="mb-2 h-16 max-w-[60vw] object-contain opacity-80" />
      )}
      <span className="rounded-full border border-red-400/30 bg-red-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-red-300">
        Kiosk Terkunci
      </span>
      <h1 className="font-display text-4xl font-semibold tracking-tight text-fg md:text-5xl">{config.brandName}</h1>
      <p className="max-w-md text-fg/50">
        Langganan STUDIODO untuk booth ini sudah berakhir dan melewati masa tenggang.
        Hubungi admin untuk memperpanjang supaya kiosk bisa dipakai lagi.
      </p>
      {renewUrl && (
        <a
          href={renewUrl}
          target="_blank"
          rel="noreferrer"
          className="k-btn k-btn-accent k-btn-lg mt-2"
        >
          Hubungi untuk perpanjang
        </a>
      )}
    </div>
  );
}
