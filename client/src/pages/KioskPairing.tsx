import { useState } from "react";
import { setApiBaseUrl, setKioskKey, getApiBaseUrl } from "@/lib/apiConfig";
import { syncBoothConfigFromServer } from "@/lib/boothConfigStore";
import { ApiError } from "@/lib/api";

const inputClass = "w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-sm outline-none focus:border-accent";

export default function KioskPairing({ onPaired }: { onPaired: () => void }) {
  const [apiBaseUrl, setApiBaseUrlInput] = useState(() => (getApiBaseUrl() === "/api" ? "" : getApiBaseUrl()));
  const [kioskKey, setKioskKeyInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!kioskKey.trim()) return setError("Kiosk API key wajib diisi");
    setSubmitting(true);
    // Roll back to whatever was configured before this attempt if it fails —
    // otherwise a mistyped URL gets persisted and the kiosk keeps hitting a
    // broken host on every future load until someone notices.
    const previousApiBaseUrl = getApiBaseUrl();
    try {
      if (apiBaseUrl.trim()) setApiBaseUrl(apiBaseUrl.trim());
      setKioskKey(kioskKey.trim());
      const ok = await fetch(`${getApiBaseUrl()}/health`).then((r) => r.ok).catch(() => false);
      if (!ok) throw new Error("Server tidak bisa dijangkau. Cek URL server dan koneksi internet.");
      await syncBoothConfigFromServer();
      onPaired();
    } catch (err) {
      setApiBaseUrl(previousApiBaseUrl === "/api" ? null : previousApiBaseUrl);
      setKioskKey(null); // don't leave a possibly-wrong key stored silently
      // A 403 here (kiosk_device_mismatch, see server/middleware/kioskAuth.ts)
      // used to surface as whatever raw message the server sent, which read
      // like a random/broken error rather than an explained one — especially
      // confusing when it fires on what the user believes is the SAME
      // computer (e.g. right after reinstalling the app wiped this device's
      // locally-stored id, so it re-registers as a "new" device against a key
      // the server still remembers as bound to the old one). Naming the
      // situation explicitly here, instead of just relaying the server text,
      // is what the user actually needs to know what to do next.
      if (err instanceof ApiError && err.status === 403) {
        setError("API key ini sudah dipakai di device lain (atau device ini dianggap baru, misalnya setelah install ulang). Minta admin buka dashboard Kiosk → pilih \"Reset device\" pada key ini, atau pakai kiosk key lain untuk booth ini.");
      } else if (err instanceof ApiError && err.status === 401) {
        setError("API key salah, atau sudah dicabut/di-revoke. Cek lagi key-nya di dashboard Admin → Kiosk.");
      } else {
        setError(err instanceof Error ? err.message : "Gagal pairing kiosk");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center bg-[var(--kiosk-background)] px-4 text-[var(--kiosk-text)]">
      <form onSubmit={submit} className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-white/[0.045] p-8 shadow-2xl shadow-black/20 backdrop-blur-xl">
        <p className="text-xs font-semibold uppercase tracking-[.25em] text-accent">STUDIODO</p>
        <h1 className="mt-2 font-display text-2xl font-bold">Setup kiosk ini</h1>
        <p className="mt-2 text-sm text-white/45">
          Tempel kiosk API key dari dashboard admin (Admin → Kiosk) untuk menghubungkan kiosk ini ke tenant kamu.
        </p>

        <div className="mt-6 space-y-3">
          <input
            value={apiBaseUrl}
            onChange={(e) => setApiBaseUrlInput(e.target.value)}
            placeholder="URL server (mis. https://api.studiodo.id/api)"
            className={inputClass}
          />
          <input
            value={kioskKey}
            onChange={(e) => setKioskKeyInput(e.target.value)}
            placeholder="Kiosk API key"
            className={inputClass}
          />
        </div>

        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

        <button
          type="submit"
          disabled={submitting || !kioskKey.trim()}
          className="mt-6 w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Menghubungkan…" : "Hubungkan kiosk"}
        </button>
      </form>
    </div>
  );
}
