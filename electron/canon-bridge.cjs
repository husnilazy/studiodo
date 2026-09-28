const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

let bridgeProcess = null;
let lastSpawnError = null;

function getBridgePath() {
  if (process.env.STUDIODO_CANON_BRIDGE) return process.env.STUDIODO_CANON_BRIDGE;
  if (!process.resourcesPath) return null;
  return path.join(process.resourcesPath, "canon-bridge", "canon-bridge.exe");
}

function startCanonBridge() {
  const executable = getBridgePath();
  if (!executable || !fs.existsSync(executable)) {
    return { available: false, reason: "Canon bridge executable belum dipasang" };
  }

  lastSpawnError = null;
  bridgeProcess = spawn(executable, [], {
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
