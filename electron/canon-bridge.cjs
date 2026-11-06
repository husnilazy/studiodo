const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

let bridgeProcess = null;
let lastSpawnError = null;
// Why the native bridge is (not) running. Its output used to be thrown away (stdio "ignore"), so a bridge that died the moment it
// started — typically a missing .NET runtime or DLL on a fresh PC — looked exactly like "no camera detected" with no clue anywhere.
let lastExit = null; // { code, signal, afterMs }
let skippedReason = null;
let startedAt = 0;
const recentOutput = [];
const rememberOutput = (chunk) => {
  for (const line of String(chunk).split(/\r?\n/)) {
    const text = line.trim();
    if (!text) continue;
    recentOutput.push(text.slice(0, 300));
    if (recentOutput.length > 25) recentOutput.shift();
    console.log(`[canon-bridge] ${text.slice(0, 300)}`);
  }
};

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

// Sesi EDSDK/Sony memegang kamera secara eksklusif. Bridge native sekarang jalan otomatis
// (supaya kamera terdeteksi tanpa setup), kecuali dimatikan lewat CANON_BRIDGE_ENABLED=false
// atau digiCamControl sedang berjalan di PC ini (ia sudah memegang kamera).
function isProcessRunning(imageName) {
  try {
    const out = require("child_process").execFileSync("tasklist", ["/FI", `IMAGENAME eq ${imageName}`, "/NH"], { encoding: "utf8", windowsHide: true, timeout: 4000 });
    return out.toLowerCase().includes(imageName.toLowerCase());
  } catch {
    return false;
  }
}

function startCanonBridge() {
  skippedReason = null;
  if (process.env.CANON_BRIDGE_ENABLED === "false") {
    skippedReason = "Bridge native dimatikan (CANON_BRIDGE_ENABLED=false)";
    return { available: false, reason: skippedReason };
  }
  if (process.platform === "win32" && process.env.CANON_BRIDGE_ENABLED !== "true" && isProcessRunning("CameraControl.exe")) {
    skippedReason = "digiCamControl sedang berjalan dan memegang kamera";
    return { available: false, reason: skippedReason };
  }
  const executable = getBridgePath();
  if (!executable || !fs.existsSync(executable)) {
    skippedReason = "Canon bridge executable belum dipasang";
    return { available: false, reason: skippedReason };
  }
  if (bridgeProcess && !bridgeProcess.killed) {
    return { available: true, executable, alreadyRunning: true };
  }

  lastSpawnError = null;
  lastExit = null;
  startedAt = Date.now();
  bridgeProcess = spawn(executable, ["--port", String(NATIVE_BRIDGE_PORT)], {
    cwd: path.dirname(executable),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  bridgeProcess.stdout?.on("data", rememberOutput);
  bridgeProcess.stderr?.on("data", rememberOutput);
  bridgeProcess.once("exit", (code, signal) => {
    lastExit = { code, signal, afterMs: Date.now() - startedAt };
    console.error(`[canon-bridge] berhenti: kode=${code} sinyal=${signal} setelah ${lastExit.afterMs} ms`);
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
    skippedReason,
    lastExit,
    recentOutput: recentOutput.slice(-8),
    port: NATIVE_BRIDGE_PORT,
  };
}

module.exports = { startCanonBridge, stopCanonBridge, getCanonBridgeStatus };
