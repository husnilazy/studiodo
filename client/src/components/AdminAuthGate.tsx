import { useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import { getAdminToken, setAdminToken } from "@/lib/api";
import ToastHost from "@/components/ToastHost";

type GateStatus = "checking" | "needsLogin" | "authenticated";

export default function AdminAuthGate({ children }: { children: ReactNode }) {
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

  if (status === "authenticated") return <>{children}<ToastHost /></>;

  if (status === "checking") {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--kiosk-background)] text-fg/50">
        Memuat…
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center bg-[var(--kiosk-background)] px-4 text-[var(--kiosk-text)]">
      <form
        onSubmit={submitLogin}
        className="w-full max-w-sm rounded-[2rem] border border-fg/10 bg-fg/[0.045] p-8 shadow-2xl shadow-black/20 backdrop-blur-xl"
      >
        <p className="text-xs font-semibold uppercase tracking-[.25em] text-accent">STUDIODO</p>
        <h1 className="mt-2 font-display text-2xl font-bold">Login Admin</h1>
        <p className="mt-2 text-sm text-fg/45">Masuk dengan akun admin tenant kamu untuk membuka dashboard.</p>

        <div className="mt-6 space-y-3">
          <input
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-xl border border-fg/15 bg-fg/5 px-4 py-3 text-sm outline-none focus:border-accent"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-xl border border-fg/15 bg-fg/5 px-4 py-3 text-sm outline-none focus:border-accent"
          />
        </div>

        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

        <button
          type="submit"
          disabled={submitting || !email || !password}
          className="mt-6 w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Memproses…" : "Masuk"}
        </button>
      </form>
    </div>
  );
}
