import { BrandLogo } from "@/components/BrandLogo";
import { useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import { getAdminToken, setAdminToken } from "@/lib/api";
import ToastHost from "@/components/ToastHost";
import AdminKeyboard from "@/components/AdminKeyboard";
import { AdminKeyboardToggle, AdminThemeToggle } from "@/components/AdminControls";
import { Icon } from "@/components/kiosk/Icons";
import { useAdminThemeScope } from "@/lib/adminTheme";

type GateStatus = "checking" | "needsLogin" | "authenticated";

/** `scopeTheme={false}` keeps the tenant's customer-facing kiosk theme (the WYSIWYG screen builder needs it). */
export default function AdminAuthGate({ children, scopeTheme = true }: { children: ReactNode; scopeTheme?: boolean }) {
  useAdminThemeScope(scopeTheme);
  const [status, setStatus] = useState<GateStatus>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  if (status === "authenticated") return <>{children}<AdminKeyboard /><ToastHost /></>;

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

        <div className="mt-6 space-y-3">
          <input
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-xl border border-fg/15 bg-canvas px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-xl border border-fg/15 bg-canvas px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={submitting || !email || !password}
          className="mt-6 w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          {submitting ? "Memproses…" : "Masuk"}
        </button>
        <a href="#/" className="mt-4 block text-center text-xs font-semibold text-fg/45 hover:text-fg">← Kembali ke kiosk</a>
      </form>
      <AdminKeyboard />
    </div>
  );
}
