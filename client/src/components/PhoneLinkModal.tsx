import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api } from "@/lib/api";
import { pushToast } from "@/lib/toastStore";
import Spinner from "@/components/Spinner";

// "Luncurkan di HP": a one-time QR/link that signs a phone in to the web admin with no password.
export default function PhoneLinkModal({ onClose }: { onClose: () => void }) {
  const [link, setLink] = useState<{ url: string; qr: string; expiresAt: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const make = () => {
    setLink(null);
    setError(null);
    api.createPhoneLink()
      .then(async (r) => {
        if (!r) throw new Error("Gagal membuat tautan.");
        const qr = await QRCode.toDataURL(r.url, { margin: 1, width: 320, errorCorrectionLevel: "M" });
        setLink({ url: r.url, qr, expiresAt: Date.now() + r.expiresInSeconds * 1000 });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Gagal membuat tautan."));
  };
  useEffect(make, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const left = link ? Math.max(0, Math.ceil((link.expiresAt - now) / 1000)) : 0;
  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link.url); pushToast({ type: "success", title: "Tautan disalin", sub: "Kirim ke HP kamu sendiri (mis. WhatsApp ke nomor sendiri)." }); }
    catch { pushToast({ type: "error", title: "Gagal menyalin", sub: "Pindai QR saja." }); }
  };

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Luncurkan di HP" onClick={onClose}>
      <div className="w-full max-w-sm rounded-[2rem] border border-fg/10 bg-surface p-7 text-center shadow-glass" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-xl font-bold">Luncurkan di HP</h2>
        <p className="mt-1 text-sm text-fg/55">Pindai QR ini dengan kamera HP. Admin langsung terbuka tanpa login, dan HP itu tetap masuk 30 hari.</p>
        <div className="mx-auto mt-5 flex h-[272px] w-[272px] items-center justify-center rounded-2xl bg-white p-2">
          {link && left > 0 ? <img src={link.qr} alt="QR akses admin di HP" className="h-full w-full" /> : link ? <p className="px-4 text-sm font-semibold text-black/60">Tautan kedaluwarsa</p> : error ? <p className="px-4 text-sm text-red-500">{error}</p> : <Spinner />}
        </div>
        {link && left > 0 && <p className="mt-3 text-xs text-fg/50">Sekali pakai · berlaku {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</p>}
        <p className="mt-2 text-[11px] leading-snug text-amber-600">Jangan bagikan QR/tautan ini ke orang lain. Siapa pun yang membukanya masuk sebagai admin akun kamu.</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={make} className="rounded-xl border border-fg/15 px-3 py-2.5 text-sm font-semibold hover:border-accent/50">Buat ulang</button>
          <button type="button" onClick={copy} disabled={!link || left === 0} className="rounded-xl border border-fg/15 px-3 py-2.5 text-sm font-semibold hover:border-accent/50 disabled:opacity-40">Salin tautan</button>
        </div>
        <button type="button" onClick={onClose} className="mt-3 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white">Selesai</button>
      </div>
    </div>
  );
}
