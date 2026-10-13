import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useBoothConfig } from "@/lib/boothConfigStore";
import { sendKioskHeartbeatNow } from "@/lib/kioskHeartbeat";
import { useSubscriptionLock, type LockReason } from "@/lib/subscriptionLockStore";

// Rendered by App.tsx in place of the normal kiosk flow once THIS booth's licence is locked (its trial ended, it was never
// subscribed, its subscription ran out past the grace period, or the account was suspended). No dismiss button: unlike
// AdminDashboard.tsx's SubscriptionBanner, this isn't a warning, it's what's actually happening right now.
// /admin stays reachable (see App.tsx), so the owner can still log in and renew.

const COPY: Record<LockReason, { badge: string; title: string; body: string; cta: string }> = {
  trial_expired: {
    badge: "Masa trial berakhir",
    title: "Terima kasih sudah mencoba STUDIODO",
    body: "Masa trial booth ini sudah selesai. Berlangganan penuh supaya kiosk bisa dipakai lagi — semua pengaturan dan data kamu tetap aman.",
    cta: "Berlangganan sekarang",
  },
  unpaid: {
    badge: "Booth belum berlangganan",
    title: "Aktifkan langganan booth ini",
    body: "Key kiosk ini belum punya langganan aktif. Buka dashboard STUDIODO, pilih booth ini, lalu berlangganan untuk memakainya.",
    cta: "Aktifkan langganan",
  },
  expired: {
    badge: "Kiosk terkunci",
    title: "Langganan booth ini sudah berakhir",
    body: "Langganan sudah berakhir dan melewati masa tenggang. Perpanjang dari dashboard STUDIODO supaya kiosk bisa dipakai lagi.",
    cta: "Perpanjang langganan",
  },
  suspended: {
    badge: "Akun dinonaktifkan",
    title: "Akun ini sedang dinonaktifkan",
    body: "Hubungi tim STUDIODO untuk mengaktifkan kembali akun ini.",
    cta: "Hubungi STUDIODO",
  },
};

export default function SubscriptionLockedScreen() {
  const config = useBoothConfig((s) => s.config);
  const { reason, renewalWhatsapp, renewalCheckoutUrl, portalUrl } = useSubscriptionLock();
  const copy = COPY[reason ?? "expired"];

  // The owner's phone is the natural way to pay, so the portal address is also shown as a QR code.
  const target = reason === "suspended" ? null : portalUrl || renewalCheckoutUrl || null;
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    if (!target) { setQr(null); return; }
    let cancelled = false;
    QRCode.toDataURL(target, { margin: 1, width: 220 }).then((url) => { if (!cancelled) setQr(url); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [target]);

  // After paying on the website the screen should open by itself, not at the next 5-minute heartbeat: re-check while locked.
  const [checking, setChecking] = useState(false);
  const [checkedOnce, setCheckedOnce] = useState(false);
  const recheck = async () => {
    setChecking(true);
    try { await sendKioskHeartbeatNow(); } finally { setChecking(false); setCheckedOnce(true); }
  };
  useEffect(() => {
    const timer = window.setInterval(() => { void sendKioskHeartbeatNow(); }, 45_000);
    return () => window.clearInterval(timer);
  }, []);

  const whatsappUrl = renewalWhatsapp
    ? `https://wa.me/${renewalWhatsapp.replace(/[^0-9]/g, "")}?text=${encodeURIComponent("Halo, saya mau berlangganan / perpanjang STUDIODO untuk booth saya.")}`
    : null;
  const mainUrl = reason === "suspended" ? whatsappUrl : target || whatsappUrl;

  return (
    <div className="kinetic-page relative flex h-full w-full flex-col items-center justify-center gap-5 overflow-y-auto px-8 py-8 text-center">
      {config.logoUrl && (
        <img src={config.logoUrl} alt={config.brandName} className="mb-1 h-14 max-w-[60vw] object-contain opacity-80" />
      )}
      <span className="rounded-full border border-red-400/30 bg-red-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-red-300">
        {copy.badge}
      </span>
      <h1 className="font-display text-4xl font-semibold tracking-tight text-fg md:text-5xl">{copy.title}</h1>
      <p className="max-w-md text-fg/55">{copy.body}</p>

      {qr && (
        <div className="flex flex-col items-center gap-2">
          <img src={qr} alt="QR dashboard STUDIODO" className="h-[180px] w-[180px] rounded-2xl bg-white p-2" />
          <p className="text-xs text-fg/40">Scan dengan HP untuk membuka dashboard</p>
        </div>
      )}

      <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
        {mainUrl && (
          <a href={mainUrl} target="_blank" rel="noreferrer" className="k-btn k-btn-accent k-btn-lg">
            {copy.cta}
          </a>
        )}
        {whatsappUrl && mainUrl !== whatsappUrl && (
          <a href={whatsappUrl} target="_blank" rel="noreferrer" className="k-btn k-btn-lg">
            Tanya via WhatsApp
          </a>
        )}
      </div>
      {target && <p className="text-xs text-fg/35">{target.replace(/^https?:\/\//, "")}</p>}
      {reason !== "suspended" && (
        <button type="button" onClick={recheck} disabled={checking} className="text-sm text-fg/55 underline underline-offset-4 hover:text-fg disabled:opacity-50">
          {checking ? "Mengecek…" : checkedOnce ? "Belum aktif — cek lagi" : "Sudah bayar? Cek ulang"}
        </button>
      )}
      <a href="#/admin" className="mt-2 text-xs text-fg/35 underline underline-offset-4 hover:text-fg/60">Masuk admin</a>
    </div>
  );
}
