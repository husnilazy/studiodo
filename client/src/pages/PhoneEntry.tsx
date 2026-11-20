import { useEffect, useState } from "react";
import { api, rememberAdminOnThisBrowser } from "@/lib/api";
import { BrandLogo } from "@/components/BrandLogo";

// Opened from the QR/link made by "Luncurkan di HP" in the desktop app: #/hp/<id>.<secret>. The secret lives in the URL fragment,
// so it is never sent to a server or written to access logs until this page trades it for a session.
export default function PhoneEntry({ code }: { code: string }) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.redeemPhoneLink(code)
      .then((r) => {
        if (cancelled) return;
        if (!r?.token) throw new Error("Tautan tidak valid.");
        rememberAdminOnThisBrowser(r.token);
        window.location.replace(`${window.location.pathname}${window.location.search}#/admin`); // drops the code from the address bar and history
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Gagal masuk."); });
    return () => { cancelled = true; };
  }, [code]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-[var(--kiosk-background)] px-6 text-center text-[var(--kiosk-text)]">
      <BrandLogo className="h-9" />
      {error ? (
        <>
          <p className="max-w-xs text-sm text-red-500" role="alert">{error}</p>
          <a href="#/admin" className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white">Masuk dengan email &amp; password</a>
        </>
      ) : (
        <>
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent/25 border-t-accent" />
          <p className="text-sm text-fg/60">Membuka admin…</p>
        </>
      )}
    </div>
  );
}
