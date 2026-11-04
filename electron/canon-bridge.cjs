const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

let bridgeProcess = null;
let lastSpawnError = null;

// Bridge native (Canon EDSDK + Sony) — kontrak HTTP sama dengan digicam-bridge.cjs
// tapi port berbeda supaya keduanya bisa jalan berdampingan; pilih mana yang dipakai
// lewat "URL bridge kamera" di Admin > Kamera (http://127.0.0.1:5514 untuk yang native).
const NATIVE_BRIDGE_PORT = Number(process.env.CANON_BRIDGE_PORT || 5514);

function getBridgePath() {
  if (process.env.STUDIODO_CANON_BRIDGE) return process.env.STUDIODO_CANON_BRIDGE;
  const packaged = process.resourcesPath && path.join(process.resourcesPath, "canon-bridge", "canon-bridge.exe");
  if (packaged && fs.existsSync(packaged)) return packaged;
  // Mode dev: hasil build di native/canon-bridge.
  const dev = path.join(__dirname, "..", "native", "canon-bridge", "canon-bridge.exe");
  return fs.existsSync(dev) ? dev : packaged || null;
}

// Sesi EDSDK/Sony memegang kamera secara eksklusif — kalau bridge native ikut jalan
// otomatis, digiCamControl di kiosk yang sama tidak bisa memakai kamera. Sampai bridge
// ini terverifikasi di kamera asli, ia hanya jalan bila CANON_BRIDGE_ENABLED=true.
function startCanonBridge() {
  if (process.env.CANON_BRIDGE_ENABLED !== "true") {
    return { available: false, reason: "Bridge native nonaktif (set CANON_BRIDGE_ENABLED=true)" };
  }
  const executable = getBridgePath();
  if (!executable || !fs.existsSync(executable)) {
    return { available: false, reason: "Canon bridge executable belum dipasang" };
  }
  if (bridgeProcess && !bridgeProcess.killed) {
    return { available: true, executable, alreadyRunning: true };
  }

  lastSpawnError = null;
  bridgeProcess = spawn(executable, ["--port", String(NATIVE_BRIDGE_PORT)], {
    cwd: path.dirname(executable),
    windowsHide: true,
    stdio: "ignore",
  });
  bridgeProcess.once("exit", () => {
    bridgeProcess = null;
  });
  // Without this, a spawn failure (missing DLL dependency, permission
  // denied, etc.) surfaces as an unhandled "error" event on the child
  // process — logged here instead so canon:bridgeStatus can report it.
  bridgeProcess.once("error", (error) => {
    lastSpawnError = error instanceof Error ? error.message : String(error);
    console.error("[canon-bridge] Gagal menjalankan canon-bridge.exe", error);
    bridgeProcess = null;
  });
  return { available: true, executable };
}

function stopCanonBridge() {
  if (bridgeProcess && !bridgeProcess.killed) bridgeProcess.kill();
  bridgeProcess = null;
}

// Ground truth for the UI/IPC — reflects whether the executable actually
// exists on disk right now, not just whether the app is packaged. Previously
// the IPC handler in main.cjs reported "configured: true" merely because the
// app was packaged, even when canon-bridge.exe was never installed.
function getCanonBridgeStatus() {
  const executable = getBridgePath();
  const configured = Boolean(executable && fs.existsSync(executable));
  return {
    configured,
    executable: executable ?? null,
    running: Boolean(bridgeProcess && !bridgeProcess.killed),
    lastError: lastSpawnError,
  };
}

module.exports = { startCanonBridge, stopCanonBridge, getCanonBridgeStatus };
