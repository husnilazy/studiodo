const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

let bridgeProcess = null;

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

  bridgeProcess = spawn(executable, [], {
    cwd: path.dirname(executable),
    windowsHide: true,
    stdio: "ignore",
  });
  bridgeProcess.once("exit", () => {
    bridgeProcess = null;
  });
  return { available: true, executable };
}

function stopCanonBridge() {
  if (bridgeProcess && !bridgeProcess.killed) bridgeProcess.kill();
  bridgeProcess = null;
}

module.exports = { startCanonBridge, stopCanonBridge };
