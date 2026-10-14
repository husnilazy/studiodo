import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { superadminApi, type TwoFactorStatus } from "@/lib/superadminApi";

// Admin Pusat → Pengaturan → Keamanan: turn two-factor sign-in on or off. The flow is: scan the QR with an authenticator app →
// type the 6-digit code to prove it works → save the one-time recovery codes (shown exactly once).

const inputClass = "mt-1 w-full rounded-lg border border-fg/15 bg-fg/5 px-3 py-2 text-sm outline-none focus:border-accent";
const btn = "rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-40";
const when = (v: string | null) => (v ? new Date(v).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

type Setup = { secret: string; otpauthUrl: string; qr: string };

export function SuperadminSecurityPanel() {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"idle" | "disable" | "regen">("idle");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => { void superadminApi.getTwoFactorStatus().then((s) => s && setStatus(s)).catch(() => undefined); }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setMessage(null);
    try { await fn(); } catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "Gagal" }); } finally { setBusy(false); }
  };

  const startSetup = () => run(async () => {
    const r = (await superadminApi.setupTwoFactor())!;
    setSetup({ secret: r.secret, otpauthUrl: r.otpauthUrl, qr: await QRCode.toDataURL(r.otpauthUrl, { margin: 1, width: 200 }) });
    setCode("");
  });

  const enable = () => run(async () => {
    const r = (await superadminApi.enableTwoFactor(code))!;
    setCodes(r.recoveryCodes); setSetup(null); setCode(""); setSaved(false); load();
  });

  const disable = () => run(async () => {
    await superadminApi.disableTwoFactor(password, code);
    setMode("idle"); setPassword(""); setCode(""); load();
    setMessage({ ok: true, text: "2FA dinonaktifkan." });
  });

  const regen = () => run(async () => {
    const r = (await superadminApi.regenerateRecoveryCodes(code))!;
    setCodes(r.recoveryCodes); setMode("idle"); setCode(""); setSaved(false); load();
  });

  const downloadCodes = () => {
    if (!codes) return;
    const blob = new Blob([`Kode pemulihan 2FA STUDIODO Admin Pusat\nSimpan di tempat aman. Setiap kode hanya berlaku sekali.\n\n${codes.join("\n")}\n`], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "studiodo-kode-pemulihan.txt"; a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section className="rounded-3xl border border-fg/10 bg-surface p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-xl font-semibold">Keamanan akun · Verifikasi 2 langkah</h2>
        {status && <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status.enabled ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/20 text-amber-200"}`}>{status.enabled ? "Aktif" : "Belum aktif"}</span>}
      </div>
      <p className="mt-2 max-w-[680px] text-sm leading-relaxed text-fg/55">
        Akun Admin Pusat bisa melihat dan mengubah semua tenant. Dengan 2FA, password saja tidak cukup untuk masuk: dibutuhkan juga kode 6 angka dari aplikasi authenticator
        (Google Authenticator, Microsoft Authenticator, Authy, dsb.) di HP Anda.
      </p>

      {codes && (
        <div className="mt-5 rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4">
          <h3 className="text-sm font-semibold text-amber-100">Simpan kode pemulihan ini sekarang</h3>
          <p className="mt-1 text-xs leading-relaxed text-amber-100/70">Kode ini hanya tampil sekali. Jika HP hilang, setiap kode bisa dipakai satu kali sebagai pengganti kode authenticator.</p>
          <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm sm:grid-cols-5">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" className={`${btn} bg-fg/10`} onClick={() => void navigator.clipboard?.writeText(codes.join("\n"))}>Salin</button>
            <button type="button" className={`${btn} bg-fg/10`} onClick={downloadCodes}>Unduh .txt</button>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> Saya sudah menyimpannya</label>
            <button type="button" disabled={!saved} className={`${btn} bg-accent text-white`} onClick={() => setCodes(null)}>Selesai</button>
          </div>
        </div>
      )}

      {!codes && status && !status.enabled && !setup && (
        <button type="button" disabled={busy} onClick={startSetup} className={`${btn} mt-5 bg-accent text-white`}>{busy ? "Menyiapkan…" : "Aktifkan 2FA"}</button>
      )}

      {setup && (
        <div className="mt-5 grid gap-5 sm:grid-cols-[220px_1fr]">
          <div>
            <img src={setup.qr} alt="Kode QR untuk aplikasi authenticator" width={200} height={200} className="rounded-xl bg-white p-2" />
          </div>
          <div className="text-sm text-fg/70">
            <ol className="list-decimal space-y-2 pl-5">
              <li>Buka aplikasi authenticator di HP, pilih <em>tambah akun</em>, lalu scan kode QR ini.</li>
              <li>Tidak bisa scan? Masukkan kunci ini secara manual: <code className="select-all break-all rounded bg-fg/10 px-1.5 py-0.5 text-xs text-accent">{setup.secret}</code></li>
              <li>Ketik kode 6 angka yang tampil di aplikasi untuk memastikan semuanya benar:</li>
            </ol>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ""))} placeholder="123456" className="w-36 rounded-lg border border-fg/15 bg-fg/5 px-3 py-2 text-center font-mono text-sm tracking-widest outline-none focus:border-accent" />
              <button type="button" disabled={busy || code.replace(/\s/g, "").length !== 6} onClick={enable} className={`${btn} bg-accent text-white`}>{busy ? "Memeriksa…" : "Aktifkan"}</button>
              <button type="button" disabled={busy} onClick={() => setSetup(null)} className={`${btn} bg-fg/10`}>Batal</button>
            </div>
          </div>
        </div>
      )}

      {!codes && status?.enabled && (
        <div className="mt-5 grid gap-3 text-sm">
          <div className="text-fg/60">Aktif sejak {when(status.enabledAt)} · sisa kode pemulihan: <strong className={status.recoveryCodesLeft <= 2 ? "text-amber-300" : "text-fg"}>{status.recoveryCodesLeft}</strong>{status.recoveryCodesLeft <= 2 ? " (buat ulang segera)" : ""}</div>
          {mode === "idle" && (
            <div className="flex flex-wrap gap-3">
              <button type="button" className={`${btn} bg-fg/10`} onClick={() => { setMode("regen"); setCode(""); setMessage(null); }}>Buat ulang kode pemulihan</button>
              <button type="button" className={`${btn} bg-red-500/15 text-red-200`} onClick={() => { setMode("disable"); setCode(""); setPassword(""); setMessage(null); }}>Nonaktifkan 2FA</button>
            </div>
          )}
          {mode !== "idle" && (
            <div className="grid max-w-[420px] gap-3 rounded-2xl border border-fg/10 bg-fg/[0.03] p-4">
              {mode === "disable" && <label className="text-fg/60">Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} /></label>}
              <label className="text-fg/60">Kode authenticator{mode === "disable" ? " (atau kode pemulihan)" : ""}<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} className={`${inputClass} font-mono`} /></label>
              <div className="flex gap-3">
                <button type="button" disabled={busy || !code.trim() || (mode === "disable" && !password)} onClick={mode === "disable" ? disable : regen} className={`${btn} ${mode === "disable" ? "bg-red-500/80 text-white" : "bg-accent text-white"}`}>{busy ? "Memproses…" : mode === "disable" ? "Nonaktifkan" : "Buat ulang"}</button>
                <button type="button" disabled={busy} onClick={() => setMode("idle")} className={`${btn} bg-fg/10`}>Batal</button>
              </div>
            </div>
          )}
        </div>
      )}

      {message && <p role={message.ok ? "status" : "alert"} className={`mt-4 text-sm ${message.ok ? "text-emerald-300" : "text-red-300"}`}>{message.text}</p>}
    </section>
  );
}
