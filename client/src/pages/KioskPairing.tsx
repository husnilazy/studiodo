import { useState } from "react";
import { getApiBaseUrl, getHardwareDeviceId, setApiBaseUrl, setBoundDeviceId, setDeviceToken, setKioskKey } from "@/lib/apiConfig";
import { syncBoothConfigFromServer } from "@/lib/boothConfigStore";
import { ApiError, api, setAdminToken } from "@/lib/api";
import { sendKioskHeartbeatNow } from "@/lib/kioskHeartbeat";

// First-run setup of a computer, in the order STUDIODO requires:
//   1. sign in with the TENANT account (email + password): proves who owns the booth;
//   2. enter the booth KEY from the dashboard: the server checks it belongs to that account, binds THIS computer to it
//      (hardware-derived id + a secret kept in the OS keystore) and only then does the kiosk open.
// A key that was merely copied is useless on its own: it cannot claim a computer without the owner's login (see
// server/routes/kioskKeys.ts → /activate and server/lib/deviceLock.ts).

const inputClass = "k-input";

export default function KioskPairing({ onPaired }: { onPaired: () => void }) {
  const [step, setStep] = useState<"login" | "key">("login");
  const [apiBaseUrl, setApiBaseUrlInput] = useState(() => (getApiBaseUrl() === "/api" ? "" : getApiBaseUrl()));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [kioskKey, setKioskKeyInput] = useState("");
  const [account, setAccount] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = (err: unknown, fallback: string) => setError(err instanceof Error && err.message ? err.message : fallback);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) return setError("Email dan password akun wajib diisi.");
    setBusy(true);
    const previousApiBaseUrl = getApiBaseUrl();
    try {
      if (apiBaseUrl.trim()) setApiBaseUrl(apiBaseUrl.trim());
      const ok = await fetch(`${getApiBaseUrl()}/health`).then((r) => r.ok).catch(() => false);
      if (!ok) throw new Error("Server tidak bisa dijangkau. Cek koneksi internet (atau URL server di bagian Lanjutan).");
      const { token } = (await api.loginAdmin(email.trim(), password))!;
      setAdminToken(token);
      setAccount(email.trim());
      setPassword("");
      setStep("key");
    } catch (err) {
      setApiBaseUrl(previousApiBaseUrl === "/api" ? null : previousApiBaseUrl); // don't keep a mistyped server URL
      if (err instanceof ApiError && err.status === 401) setError("Email atau password salah.");
      else fail(err, "Gagal masuk. Coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  const activate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const key = kioskKey.trim();
    if (!key) return setError("Key booth wajib diisi.");
    setBusy(true);
    try {
      const hardwareId = getHardwareDeviceId();
      const result = (await api.activateKiosk({ key, deviceId: hardwareId }))!;
      // From here on this computer is the booth: remember who we are (id + secret) before the first kiosk request goes out.
      setBoundDeviceId(hardwareId);
      await setDeviceToken(result.deviceToken);
      setKioskKey(key);
      setAdminToken(null); // the tenant login was only needed to activate; don't leave an admin session on a customer-facing PC
      await syncBoothConfigFromServer().catch(() => undefined); // offline right after activating is fine: it syncs later
      void sendKioskHeartbeatNow();
      onPaired();
    } catch (err) {
      fail(err, "Gagal mengaktifkan kiosk. Coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  const backToLogin = () => {
    setAdminToken(null);
    setAccount(null);
    setKioskKeyInput("");
    setError(null);
    setStep("login");
  };

  return (
    <div className="flex h-full items-center justify-center bg-[var(--kiosk-background)] px-4 text-[var(--kiosk-text)]">
      <div className="glass-panel w-full max-w-sm rounded-[2rem] p-8">
        <p className="text-xs font-semibold uppercase tracking-[.25em] text-accent">STUDIODO · Langkah {step === "login" ? "1" : "2"} dari 2</p>

        {step === "login" ? (
          <form onSubmit={login}>
            <h1 className="mt-2 font-display text-2xl font-bold">Masuk akun tenant</h1>
            <p className="mt-2 text-sm text-fg/45">
              Masuk dengan akun STUDIODO pemilik booth. Setelah itu Anda memasukkan key booth untuk mengaktifkan komputer ini.
            </p>
            <div className="mt-6 space-y-3">
              <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email akun" className={inputClass} />
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className={inputClass} />
              <details className="text-xs text-fg/45">
                <summary className="cursor-pointer select-none">Lanjutan</summary>
                <input value={apiBaseUrl} onChange={(e) => setApiBaseUrlInput(e.target.value)} placeholder="URL server (kosongkan untuk bawaan)" className={`${inputClass} mt-2`} />
              </details>
            </div>
            {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
            <button type="submit" disabled={busy || !email.trim() || !password} className="k-btn k-btn-accent mt-6 w-full">{busy ? "Masuk…" : "Masuk"}</button>
            <p className="mt-4 text-center text-xs text-fg/40">Belum punya akun? Daftar di studiodo.id.</p>
          </form>
        ) : (
          <form onSubmit={activate}>
            <h1 className="mt-2 font-display text-2xl font-bold">Masukkan key booth</h1>
            <p className="mt-2 text-sm text-fg/45">
              Masuk sebagai <strong className="text-fg/70">{account}</strong>. Salin key booth dari dashboard (menu <em>Booth &amp; langganan</em>) lalu tempel di sini.
              Satu key hanya bisa aktif di satu komputer.
            </p>
            <div className="mt-6 space-y-3">
              <input value={kioskKey} onChange={(e) => setKioskKeyInput(e.target.value)} placeholder="Key booth" autoComplete="off" spellCheck={false} className={inputClass} />
            </div>
            {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
            <button type="submit" disabled={busy || !kioskKey.trim()} className="k-btn k-btn-accent mt-6 w-full">{busy ? "Mengaktifkan…" : "Aktifkan kiosk"}</button>
            <button type="button" onClick={backToLogin} className="mt-3 w-full text-center text-xs text-fg/45 underline-offset-4 hover:underline">Ganti akun</button>
          </form>
        )}
      </div>
    </div>
  );
}
