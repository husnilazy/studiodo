import { api } from "./api";
import { useBoothConfig } from "./boothConfigStore";
import { isKioskPaired } from "./apiConfig";
import { checkCamera, checkPrinter, checkNetwork } from "./deviceDiagnostics";
import { useSubscriptionLock } from "./subscriptionLockStore";

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
let started = false;

async function sendHeartbeat() {
  if (!isKioskPaired()) return;
  const config = useBoothConfig.getState().config;
  const [camera, printer, network] = await Promise.all([
    checkCamera(config.cameraMode, config.tetherBridgeUrl),
    checkPrinter(config.printerName),
    checkNetwork(),
  ]);
  const appVersion = await window.studiodo?.getVersion?.().catch(() => undefined);
  const result = await api.sendKioskHeartbeat({
    appVersion,
    diagnostics: { cameraOk: camera.status === "ok", printerOk: printer.status === "ok", networkOk: network.status === "ok" },
  }).catch(() => undefined);
  // If the heartbeat itself failed (offline), deliberately leave the lock store
  // untouched — an offline kiosk keeps whatever lock state it last knew instead of
  // silently reverting to "unlocked" just because it can't reach the server.
  if (result?.subscription) useSubscriptionLock.getState().setFromHeartbeat(result.subscription);
}

/** Periodic self-report so the admin dashboard's "Perangkat" table (KioskKeys.tsx) has fresh online/diagnostic data. */
export function startKioskHeartbeat() {
  if (started) return;
  started = true;
  sendHeartbeat();
  setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
}
