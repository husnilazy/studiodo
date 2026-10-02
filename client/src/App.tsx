import { Route, Switch, Router, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import KioskShell from "@/components/KioskShell";
import Idle from "@/pages/Idle";
import Tutorial from "@/pages/Tutorial";
import PilihPaket from "@/pages/PilihPaket";
import PilihOrientasi from "@/pages/PilihOrientasi";
import Pembayaran from "@/pages/Pembayaran";
import SesiFoto from "@/pages/SesiFoto";
import PreviewFoto from "@/pages/PreviewFoto";
import PilihFrame from "@/pages/PilihFrame";
import Hasil from "@/pages/Hasil";
import AdminPlaceholder from "@/pages/AdminPlaceholder";
import ShareGallery from "@/pages/ShareGallery";
import CustomerManagement from "@/pages/CustomerManagement";
import AdminDashboard from "@/pages/AdminDashboard";
import FrameManagement from "@/pages/FrameManagement";
import AdminAuthGate from "@/components/AdminAuthGate";
import KioskPairing from "@/pages/KioskPairing";
import SuperadminDashboard from "@/pages/SuperadminDashboard";
import ScreenBuilder from "@/pages/ScreenBuilder";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useKioskSession } from "@/lib/sessionStore";
import { clearKioskPairing, isKioskPaired } from "@/lib/apiConfig";
import { syncBoothConfigFromServer } from "@/lib/boothConfigStore";
import { useSubscriptionLock } from "@/lib/subscriptionLockStore";
import SubscriptionLockedScreen from "@/components/SubscriptionLockedScreen";
import DeviceMismatchScreen from "@/components/DeviceMismatchScreen";
import KioskBootScreen from "@/components/KioskBootScreen";

const IDLE_WARNING_SECONDS = 30;

function GlobalIdleTimer() {
  const [location, navigate] = useLocation();
  const resetSession = useKioskSession((s) => s.resetSession);
  const timersRef = useRef<{ warn?: ReturnType<typeof setTimeout>; tick?: ReturnType<typeof setInterval> }>({});
  // Seconds left before the session is thrown away, or null while the customer is active.
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    // Jangan aktifkan idle timer di halaman ini
    const isSafeRoute = location === "/" || location.startsWith("/admin") || location.startsWith("/superadmin") || location.startsWith("/share") || location === "/hasil";
    // Sesi foto sudah lunas dibayar sebelum sampai di sini — 3 menit terlalu ketat untuk layar ini (customer
    // mungkin sedang pose, ganti filter, atau kamera butuh waktu nyambung) dan diam-diam membuang sesi yang
    // SUDAH DIBAYAR kalau timer ini kena. Kasih waktu lebih longgar di sini saja, bukan dihilangkan total.
    const idleTimeoutMs = (location === "/sesi-foto" ? 8 : 3) * 60 * 1000;

    const clear = () => {
      if (timersRef.current.warn) clearTimeout(timersRef.current.warn);
      if (timersRef.current.tick) clearInterval(timersRef.current.tick);
      timersRef.current = {};
    };

    const resetTimer = () => {
      clear();
      setSecondsLeft(null);
      if (isSafeRoute) return;

      // A visible countdown BEFORE the reset: customers used to lose a half-finished session with no warning at all.
      timersRef.current.warn = setTimeout(() => {
        const deadline = Date.now() + IDLE_WARNING_SECONDS * 1000;
        setSecondsLeft(IDLE_WARNING_SECONDS);
        timersRef.current.tick = setInterval(() => {
          const left = Math.ceil((deadline - Date.now()) / 1000);
          if (left <= 0) {
            clear();
            setSecondsLeft(null);
            resetSession();
            navigate("/");
          } else {
            setSecondsLeft(left);
          }
        }, 500);
      }, Math.max(1000, idleTimeoutMs - IDLE_WARNING_SECONDS * 1000));
    };

    resetTimer();

    const events = ["mousemove", "touchstart", "keydown", "click"] as const;
    events.forEach((name) => window.addEventListener(name, resetTimer));
    return () => {
      clear();
      events.forEach((name) => window.removeEventListener(name, resetTimer));
    };
  }, [location, navigate, resetSession]);

  if (secondsLeft === null) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-canvas/70 px-6 backdrop-blur-md" role="alertdialog" aria-live="assertive" aria-label="Masih di sini?">
      <div className="glass-panel flex w-full max-w-md flex-col items-center gap-5 rounded-[2rem] p-10 text-center">
        <div className="relative flex h-28 w-28 items-center justify-center">
          <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
            <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="7" />
            <circle cx="50" cy="50" r="44" fill="none" stroke="var(--accent)" strokeWidth="7" strokeLinecap="round" strokeDasharray={2 * Math.PI * 44} strokeDashoffset={(2 * Math.PI * 44) * (1 - secondsLeft / IDLE_WARNING_SECONDS)} style={{ transition: "stroke-dashoffset 0.5s linear" }} />
          </svg>
          <span className="font-display text-4xl font-semibold">{secondsLeft}</span>
        </div>
        <div>
          <h2 className="font-display text-3xl font-semibold tracking-tight">Masih di sini?</h2>
          <p className="mt-2 text-muted">Sesi akan diulang dari awal dalam {secondsLeft} detik kalau layar tidak disentuh.</p>
        </div>
        <button type="button" className="k-btn k-btn-accent k-btn-lg w-full">Ya, lanjutkan</button>
      </div>
    </div>
  );
}
function AnimatedRoutes() {
  const [location] = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location}
        className="h-full w-full"
        initial={{ opacity: 0, y: 10, filter: "blur(3px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: -8, filter: "blur(3px)" }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        <Switch>
          <Route path="/" component={Idle} />
          <Route path="/tutorial" component={Tutorial} />
          <Route path="/paket" component={PilihPaket} />
          <Route path="/orientasi" component={PilihOrientasi} />
          <Route path="/bayar" component={Pembayaran} />
          <Route path="/sesi-foto" component={SesiFoto} />
          <Route path="/preview" component={PreviewFoto} />
          <Route path="/frame" component={PilihFrame} />
          <Route path="/hasil" component={Hasil} />
          <Route path="/admin">{() => <AdminAuthGate><AdminDashboard /></AdminAuthGate>}</Route>
          <Route path="/admin/customers">{() => <AdminAuthGate><CustomerManagement /></AdminAuthGate>}</Route>
          <Route path="/admin/frames">{() => <AdminAuthGate><FrameManagement /></AdminAuthGate>}</Route>
          <Route path="/admin/customizer">{() => { window.location.hash = "#/admin"; return null; }}</Route>
          <Route path="/admin/screen-builder/:screenKey">{(params) => <AdminAuthGate scopeTheme={false}><ScreenBuilder screenKey={params.screenKey} /></AdminAuthGate>}</Route>
          <Route path="/superadmin" component={SuperadminDashboard} />
          <Route path="/share/:id">{(params) => <ShareGallery id={params.id} />}</Route>
          <Route>
            <div className="flex h-full items-center justify-center text-muted">Halaman tidak ditemukan</div>
          </Route>
        </Switch>
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  const [paired, setPaired] = useState(isKioskPaired);
  const [deviceMismatch, setDeviceMismatch] = useState(false);
  // A locally-stored kiosk key can be stale (revoked, or reset to a different
  // device by an admin) without this kiosk knowing yet — Idle itself makes no
  // API call, so it used to render fine and only fail once the customer had
  // already tapped in deep enough to hit a page that talks to the server.
  // This gate makes the very first boot confirm the key against the server
  // before ever showing Idle, so an invalid/locked kiosk goes straight to the
  // right screen (KioskPairing / DeviceMismatchScreen) instead of glitching
  // mid-session.
  const [checkingPairing, setCheckingPairing] = useState(isKioskPaired);
  const [location] = useHashLocation();
  const locked = useSubscriptionLock((s) => s.locked);
  // /admin*, /superadmin, and /share/* don't need a kiosk pairing (and must stay
  // reachable even when the kiosk is subscription-locked — the tenant still needs to
  // see the banner/renew, and existing public share links shouldn't break): admin
  // logs in with its own tenant credentials, superadmin is a separate platform-wide
  // login, and the public share page is opened by customers, not the kiosk.
  const isExemptRoute = location.startsWith("/admin") || location.startsWith("/superadmin") || location.startsWith("/share");
  const needsPairing = !paired && !isExemptRoute;
  const subscriptionLocked = locked && !isExemptRoute;
  const isDeviceMismatched = deviceMismatch && !isExemptRoute;
  const isBooting = checkingPairing && !isExemptRoute && !needsPairing && !isDeviceMismatched;

  useEffect(() => {
    const onMismatch = () => setDeviceMismatch(true);
    const onOk = () => setDeviceMismatch(false);
    const onPairingRequired = () => {
      clearKioskPairing();
      setDeviceMismatch(false);
      setPaired(false);
    };
    window.addEventListener("studiodo-kiosk-device-mismatch", onMismatch);
    window.addEventListener("studiodo-kiosk-device-ok", onOk);
    window.addEventListener("studiodo-kiosk-pairing-required", onPairingRequired);
    return () => {
      window.removeEventListener("studiodo-kiosk-device-mismatch", onMismatch);
      window.removeEventListener("studiodo-kiosk-device-ok", onOk);
      window.removeEventListener("studiodo-kiosk-pairing-required", onPairingRequired);
    };
  }, []);

  useEffect(() => {
    if (!isKioskPaired()) {
      setCheckingPairing(false);
      return;
    }
    // A pure network failure (offline kiosk) must NOT be treated the same as
    // a real "the server rejected this key" — offline mode is intentional
    // (see offlineStore.ts), so this only ever reacts to the specific
    // pairing-required/device-mismatch events dispatched by api.ts on an
    // actual 401/403, same mechanism the listener above already handles.
    syncBoothConfigFromServer()
      .catch(() => {})
      .finally(() => setCheckingPairing(false));
  }, []);

  return (
    <KioskShell>
      <Router hook={useHashLocation}>
        {needsPairing ? (
          <KioskPairing onPaired={() => setPaired(true)} />
        ) : isDeviceMismatched ? (
          <DeviceMismatchScreen />
        ) : isBooting ? (
          <KioskBootScreen />
        ) : subscriptionLocked ? (
          <SubscriptionLockedScreen />
        ) : (
          <>
            <GlobalIdleTimer />
            <AnimatedRoutes />
          </>
        )}
      </Router>
    </KioskShell>
  );
}
