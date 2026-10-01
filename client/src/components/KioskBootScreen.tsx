import { useBoothConfig } from "@/lib/boothConfigStore";

// Shown only for the brief moment at app boot while we confirm this kiosk's
// key is still valid on the server (see App.tsx's `checkingPairing`) — without
// this, a revoked/device-locked key used to let the customer-facing Idle
// screen render first and only bounce to KioskPairing/DeviceMismatchScreen
// once some later page happened to make an API call, which looked like the
// kiosk "glitching" mid-use instead of failing cleanly up front.
export default function KioskBootScreen() {
  const config = useBoothConfig((s) => s.config);

  return (
    <div className="kinetic-page relative flex h-full w-full flex-col items-center justify-center gap-5 overflow-hidden px-8 text-center">
      {config.logoUrl && (
        <img src={config.logoUrl} alt={config.brandName} className="mb-1 h-14 max-w-[60vw] object-contain opacity-70" />
      )}
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-fg/15 border-t-accent" />
      <p className="text-sm text-fg/40">Menghubungkan ke server...</p>
    </div>
  );
}
