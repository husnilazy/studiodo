import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { isKioskPaired } from "@/lib/apiConfig";
import { activateThisComputer } from "@/lib/activateKiosk";
import { pushToast } from "@/lib/toastStore";
import Spinner from "@/components/Spinner";

// First-run guide at the top of the Admin in the desktop app, so a new tenant never has to know a keyboard shortcut:
//   step 1: this computer is not a booth yet -> paste the booth key (the admin login is already in place);
//   step 2: activated but the kiosk was never launched -> one big "Luncurkan Kiosk" button.
// Once the kiosk has been launched from here the app opens straight into the kiosk at every start (see electron/main.cjs),
// and this card disappears.

export default function SetupGuideCard({ onOpenKeys }: { onOpenKeys: () => void }) {
  const bridge = window.studiodo;
  const [paired, setPaired] = useState(() => isKioskPaired());
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [kioskOpen, setKioskOpen] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    bridge?.getLaunchPrefs?.().then((p) => setAutostart(p.kioskAutostart)).catch(() => setAutostart(true));
    bridge?.getKioskStatus?.().then((r) => setKioskOpen(r.open)).catch(() => undefined);
  }, [bridge]);

  if (!bridge?.openKiosk || autostart === null) return null; // not the desktop app (phone / web), or still loading
  if (paired && (autostart || kioskOpen)) return null;

  const activate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await activateThisComputer(key);
      setPaired(true);
      setKey("");
      pushToast({ type: "success", title: "Komputer ini sudah aktif", sub: "Tinggal luncurkan kiosk." });
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Gagal mengaktifkan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  const launch = async () => {
    setBusy(true);
    try {
      const r = await bridge.openKiosk();
      setKioskOpen(r.open);
      setAutostart(true);
      pushToast({ type: "success", title: "Kiosk diluncurkan", sub: "Mulai sekarang aplikasi langsung membuka kiosk saat dinyalakan." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-4 rounded-2xl border border-accent/40 bg-accent/[0.06] p-5" aria-label="Langkah pertama" data-tour="setup">
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-accent">Langkah pertama · {paired ? "2" : "1"} dari 2</p>
      {!paired ? (
        <form onSubmit={activate} className="mt-2">
          <h3 className="font-display text-xl font-bold">Aktifkan komputer ini sebagai booth</h3>
          <p className="mt-1 text-sm text-fg/60">Kamu sudah masuk. Tempel key booth dari menu <strong>Kiosk → API Key</strong>. Satu key hanya bisa aktif di satu komputer.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Key booth" autoComplete="off" spellCheck={false} className="min-w-[14rem] flex-1 rounded-xl border border-fg/15 bg-surface px-4 py-2.5 text-sm outline-none focus:border-accent" />
            <button type="submit" disabled={busy || !key.trim()} className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/25 disabled:opacity-40">{busy && <Spinner size="sm" />}{busy ? "Mengaktifkan…" : "Aktifkan"}</button>
            <button type="button" onClick={onOpenKeys} className="rounded-xl border border-fg/15 px-4 py-2.5 text-sm font-semibold text-fg/70 hover:text-fg">Belum punya key? Buat di sini</button>
          </div>
          {error && <p role="alert" className="mt-2 text-sm text-red-500">{error}</p>}
        </form>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-xl font-bold">Siap! Luncurkan kiosk untuk customer</h3>
            <p className="mt-1 text-sm text-fg/60">Kiosk akan tampil layar penuh. Untuk kembali ke Admin tekan <kbd className="rounded bg-fg/10 px-1.5 py-0.5 text-xs">Ctrl</kbd>+<kbd className="rounded bg-fg/10 px-1.5 py-0.5 text-xs">Shift</kbd>+<kbd className="rounded bg-fg/10 px-1.5 py-0.5 text-xs">A</kbd> atau ketuk sudut layar kiosk 5 kali. Setelah ini aplikasi langsung membuka kiosk setiap dinyalakan.</p>
          </div>
          <button type="button" onClick={launch} disabled={busy} className="flex items-center gap-2 rounded-2xl bg-accent px-7 py-3.5 text-base font-bold text-white shadow-lg shadow-accent/30 transition hover:brightness-110 disabled:opacity-50">{busy && <Spinner size="sm" />}Luncurkan Kiosk</button>
        </div>
      )}
    </section>
  );
}
