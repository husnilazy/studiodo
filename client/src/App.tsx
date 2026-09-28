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

function GlobalIdleTimer() {
  const [location, navigate] = useLocation();
  const resetSession = useKioskSession((s) => s.resetSession);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Jangan aktifkan idle timer di halaman ini
    const isSafeRoute = location === "/" || location.startsWith("/admin") || location.startsWith("/superadmin") || location.startsWith("/share") || location === "/hasil";
    // Sesi foto sudah lunas dibayar sebelum sampai di sini — 3 menit terlalu
    // ketat untuk layar ini (customer mungkin sedang pose, ganti filter, atau
    // kamera butuh waktu nyambung) dan diam-diam membuang sesi yang SUDAH DIBAYAR
    // balik ke pilih paket kalau timer ini kena. Kasih waktu lebih longgar di sini
    // saja, bukan dihilangkan total — booth yang benar-benar ditinggal tetap harus
    // reset akhirnya.
    const idleTimeoutMs = (location === "/sesi-foto" ? 8 : 3) * 60 * 1000;

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (isSafeRoute) return;

      timerRef.current = setTimeout(() => {
        resetSession();
        navigate("/");
      }, idleTimeoutMs);
    };

    resetTimer();

    // Listen for any activity
    window.addEventListener("mousemove", resetTimer);
    window.addEventListener("touchstart", resetTimer);
    window.addEventListener("keydown", resetTimer);
    window.addEventListener("click", resetTimer);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener("mousemove", resetTimer);
      window.removeEventListener("touchstart", resetTimer);
      window.removeEventListener("keydown", resetTimer);
      window.removeEventListener("click", resetTimer);
    };
  }, [location, navigate, resetSession]);

  return null;
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
          <Route path="/admin/screen-builder/:screenKey">{(params) => <AdminAuthGate><ScreenBuilder screenKey={params.screenKey} /></AdminAuthGate>}</Route>
          <Route path="/superadmin" component={SuperadminDashboard} />
          <Route path="/share/:id">{(params) => <ShareGallery id={params.id} />}</Route>
          <Route>
            <div className="flex h-full items-center justify-center text-white/50">Halaman tidak ditemukan</div>
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
