import { BrandLogo } from "@/components/BrandLogo";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { signInWithEmailLink, signInWithGoogle, type HandoffHandle } from "@/lib/passwordless";
import { api, ApiError } from "@/lib/api";
import { getAdminToken, setAdminToken } from "@/lib/api";
import ToastHost from "@/components/ToastHost";
import AdminKeyboard from "@/components/AdminKeyboard";
import { AdminKeyboardToggle, AdminThemeToggle } from "@/components/AdminControls";
import { Icon } from "@/components/kiosk/Icons";
import { useAdminThemeScope } from "@/lib/adminTheme";

type GateStatus = "checking" | "needsLogin" | "authenticated";

/** True when the current admin token is a read-only "lihat sebagai tenant" session opened from Admin Pusat. */
function isViewOnlyToken(token: string | null): boolean {
  try { return Boolean(token && JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).ro === true); } catch { return false; }
}

function ViewOnlyBanner() {
  let who = "";
  try { who = JSON.parse(sessionStorage.getItem("studiodo-impersonating") ?? "{}").tenant ?? ""; } catch { /* name is optional */ }
  const back = () => {
    setAdminToken(null);
    try { sessionStorage.removeItem("studiodo-impersonating"); } catch { /* ignore */ }
    window.location.hash = "#/superadmin";
  };
  return (
    <div className="fixed bottom-4 left-1/2 z-[1200] flex w-max max-w-[94vw] -translate-x-1/2 items-center gap-3 rounded-full bg-amber-500 px-5 py-2.5 text-sm font-semibold text-black shadow-[0_12px_40px_-8px_rgba(0,0,0,0.5)]">
      <span>👁️ Mode lihat saja{who ? ` — ${who}` : ""}. Perubahan dinonaktifkan · berakhir otomatis 30 menit.</span>
      <button type="button" onClick={back} className="rounded-full bg-black/85 px-3 py-1 text-xs font-bold text-white hover:bg-black">← Kembali ke Admin Pusat</button>
    </div>
  );
}

/** `scopeTheme={false}` keeps the tenant's customer-facing kiosk theme (the WYSIWYG screen builder needs it). */
export default function AdminAuthGate({ children, scopeTheme = true }: { children: ReactNode; scopeTheme?: boolean }) {
  useAdminThemeScope(scopeTheme);
  const [status, setStatus] = useState<GateStatus>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [providers, setProviders] = useState<{ google: boolean; magic: boolean } | null>(null);
  // "waiting" = a passwordless sign-in is in progress (browser tab for Google, inbox for the email link)
  const [waiting, setWaiting] = useState<{ via: "google" | "email"; verified: boolean } | null>(null);
  const handle = useRef<HandoffHandle | null>(null);
  const viewOnly = status === "authenticated" && isViewOnlyToken(getAdminToken());

  useEffect(() => { api.getLoginProviders().then((p) => p && setProviders({ google: p.google, magic: p.magic })).catch(() => undefined); }, []);
  useEffect(() => () => handle.current?.cancel(), []);

  const runPasswordless = async (via: "google" | "email") => {
    setError(null);
    setSubmitting(true);
    try {
      const h = via === "google" ? await signInWithGoogle(() => setWaiting({ via, verified: true })) : await signInWithEmailLink(email.trim(), () => setWaiting({ via, verified: true }));
      handle.current = h;
      setWaiting({ via, verified: false });
      const result = await h.done;
      setWaiting(null);
      if (result.ok) { setAdminToken(result.token); setStatus("authenticated"); }
      else if (result.error !== "Dibatalkan.") setError(result.error);
    } catch (err) {
      setWaiting(null);
      setError(err instanceof Error ? err.message : "Gagal memulai login");
    } finally {
      setSubmitting(false);
    }
  };
  const cancelWaiting = () => { handle.current?.cancel(); setWaiting(null); };

  const evaluate = async () => {
    if (!getAdminToken()) {
      setStatus("needsLogin");
      return;
    }
    try {
      await api.getMe();
      setStatus("authenticated");
    } catch (err) {
      // Only a real 401 means the token is actually invalid/expired — a
      // network blip or a transient 5xx must not force a re-login when the
      // token itself is still fine.
      if (err instanceof ApiError && err.status === 401) {
        setAdminToken(null);
        setStatus("needsLogin");
      } else {
        setStatus("authenticated");
      }
    }
  };

  useEffect(() => {
    evaluate();
    const onUnauthorized = () => setStatus("needsLogin");
    window.addEventListener("studiodo-admin-unauthorized", onUnauthorized);
    return () => window.removeEventListener("studiodo-admin-unauthorized", onUnauthorized);
  }, []);

  // Opts every admin route back out of the kiosk's viewport-scaled root font
  // size (see index.css) — admin is a normal desktop page, not a walk-up
  // touchscreen, and shouldn't have its text/paddings scaled up 1.5x+.
  useEffect(() => {
    document.documentElement.classList.add("admin-mode");
    document.body.classList.add("admin-mode");
    return () => {
      document.documentElement.classList.remove("admin-mode");
      document.body.classList.remove("admin-mode");
    };
  }, []);

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await api.loginAdmin(email, password);
      if (result?.token) {
        setAdminToken(result.token);
        setStatus("authenticated");
        setPassword("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Email atau password salah");
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "authenticated") return <>{viewOnly && <ViewOnlyBanner />}{children}<AdminKeyboard /><ToastHost /></>;

  if (status === "checking") {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--kiosk-background)] text-fg/50">
        Memuat…
      </div>
    );
  }

  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden bg-[var(--kiosk-background)] px-4 text-[var(--kiosk-text)]">
      <div className="pointer-events-none absolute -right-24 -top-24 h-[28rem] w-[28rem] rounded-full bg-accent/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-24 h-[26rem] w-[26rem] rounded-full bg-[#ffc8de]/30 blur-3xl" />
      <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
        <AdminKeyboardToggle />
        <AdminThemeToggle />
      </div>
      <form
        onSubmit={submitLogin}
        className="relative w-full max-w-sm rounded-[2rem] border border-fg/10 bg-surface p-8 shadow-glass"
      >
        <BrandLogo className="h-10" />
        <h1 className="mt-6 font-display text-2xl font-bold">Login Admin</h1>
        <p className="mt-2 text-sm text-fg/50">Masuk dengan akun admin tenant kamu untuk membuka dashboard.</p>

        {waiting ? (
          <div className="mt-6 rounded-2xl border border-fg/10 bg-canvas p-5 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-accent/25 border-t-accent" />
            <p className="mt-4 text-sm font-semibold">{waiting.verified ? "Tinggal satu langkah" : waiting.via === "google" ? "Selesaikan di browser" : "Cek email kamu"}</p>
            <p className="mt-1 text-xs text-fg/50">
              {waiting.verified ? "Tekan “Ya, ini saya” di halaman yang terbuka. Aplikasi akan masuk otomatis." : waiting.via === "google" ? "Kami membuka browser untuk memilih akun Google. Setelah itu aplikasi ini masuk otomatis." : `Kami mengirim tautan masuk ke ${email}. Buka tautannya, lalu tekan “Ya, ini saya”. Berlaku 10 menit.`}
            </p>
            <button type="button" onClick={cancelWaiting} className="mt-4 text-xs font-semibold text-fg/50 hover:text-fg">Batal</button>
          </div>
        ) : providers?.google && (
          <>
            <button type="button" disabled={submitting} onClick={() => void runPasswordless("google")} className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl border border-fg/15 bg-canvas px-4 py-3 text-sm font-semibold transition hover:border-accent hover:bg-fg/[0.04] disabled:opacity-50">
              <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" /><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" /><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" /></svg>
              Lanjutkan dengan Google
            </button>
            <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-widest text-fg/35"><span className="h-px flex-1 bg-fg/10" />atau<span className="h-px flex-1 bg-fg/10" /></div>
          </>
        )}

        <div className={`mt-6 space-y-3 ${waiting ? "hidden" : ""}`}>
          <input
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-xl border border-fg/15 bg-canvas px-4 py-3 text-sm outline-none transition focus:border-accent"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-xl border border-fg/15 bg-canvas px-4 py-3 text-sm outline-none transition focus:border-accent"
          />
        </div>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={submitting || !email || !password}
          className={`mt-6 w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none ${waiting ? "hidden" : ""}`}
        >
          {submitting ? "Memproses…" : "Masuk"}
        </button>
        {providers?.magic && !waiting && (
          <button type="button" disabled={submitting || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())} onClick={() => void runPasswordless("email")} className="mt-3 w-full rounded-xl px-4 py-2.5 text-xs font-semibold text-accent transition hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-40">
            Masuk tanpa password — kirim tautan ke email
          </button>
        )}
        <a href="#/" className="mt-4 block text-center text-xs font-semibold text-fg/45 hover:text-fg">← Kembali ke kiosk</a>
      </form>
      <AdminKeyboard />
    </div>
  );
}
