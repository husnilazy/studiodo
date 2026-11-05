import { useBoothConfig } from "@/lib/boothConfigStore";

// A kiosk key is locked to whichever device first authenticates with it (see
// server/middleware/kioskAuth.ts) — one license, one physical machine, even
// though a tenant can hold many keys for many booths. This renders when the
// server rejects THIS device as a mismatch (someone reused the same key on a
// second computer). No self-service fix on purpose: only an admin, from the
// Kiosk dashboard, can reset the device lock.
export default function DeviceMismatchScreen() {
  const config = useBoothConfig((s) => s.config);

  return (
    <div className="kinetic-page relative flex h-full w-full flex-col items-center justify-center gap-6 overflow-hidden px-8 text-center">
      {config.logoUrl && (
        <img src={config.logoUrl} alt={config.brandName} className="mb-2 h-16 max-w-[60vw] object-contain opacity-80" />
      )}
      <span className="rounded-full border border-red-400/30 bg-red-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-red-300">
        Kiosk Terkunci — Device Lain
      </span>
      <h1 className="font-display text-4xl font-semibold tracking-tight text-fg md:text-5xl">{config.brandName}</h1>
      <p className="max-w-md text-fg/50">
        Kiosk key ini sudah terpasang di komputer lain — satu key hanya bisa dipakai di satu device.
        Minta admin buka dashboard <span className="text-fg/70">Kiosk</span> dan pilih "Reset device"
        pada key ini untuk memindahkannya ke komputer ini, atau pasang kiosk key baru khusus untuk booth ini.
      </p>
      {/* Same path as a revoked key: drop the stored key and go back to the pairing form (login → enter key). */}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("studiodo-kiosk-pairing-required"))}
        className="k-btn k-btn-accent px-8"
      >
        Pasang key baru
      </button>
      <p className="max-w-sm text-xs text-fg/35">Anda akan diminta masuk dengan akun tenant, lalu menempelkan kiosk key baru.</p>
    </div>
  );
}
