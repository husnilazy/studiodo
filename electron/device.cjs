// Device identity for licence binding ("one key = one computer").
//
//  - hardware id: derived from values that survive reinstalling the app and clearing its storage (the Windows MachineGuid
//    and the firmware's SMBIOS UUID), hashed so the raw values never leave the PC. The old id was a random UUID kept in the
//    web page's localStorage, which anyone could change or lose, so a fresh id (= a fresh free trial) was one click away.
//  - device secret: issued by the server when an admin activates a booth with their login. It lives in the main process
//    only (encrypted with the OS keystore through Electron's safeStorage), never in the page's storage, so it cannot be
//    read by the renderer's JavaScript or copied along with a localStorage export.
//
// No client-side scheme is unbreakable (the user owns the PC); the aim is to make "new trial" and "share one key" cost real
// effort, with the server doing the actual enforcement (server/lib/deviceLock.ts).
const { execFile } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const JUNK = /^(0+|f+|0-9|to be filled by o\.?e\.?m\.?|default string|none|n\/a|not specified|system serial number|0123456789)$/i;
const cleanValue = (v) => {
  const t = String(v ?? "").trim().replace(/[{}]/g, "");
  const digits = t.replace(/[^0-9a-f]/gi, "");
  if (!t || JUNK.test(t) || JUNK.test(digits) || t.length < 6) return null;
  return t.toLowerCase();
};

function run(file, args, timeoutMs = 8000) {
  return new Promise((resolve) => {
    try {
      execFile(file, args, { timeout: timeoutMs, windowsHide: true }, (error, stdout) => resolve(error ? "" : String(stdout)));
    } catch {
      resolve("");
    }
  });
}

async function readMachineGuid() {
  if (process.platform !== "win32") return null;
  const out = await run("reg", ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"]);
  const m = out.match(/MachineGuid\s+REG_SZ\s+(\S+)/i);
  return cleanValue(m && m[1]);
}

async function readSmbiosUuid() {
  if (process.platform !== "win32") return null;
  let out = await run("powershell", ["-NoProfile", "-NonInteractive", "-Command", "(Get-CimInstance Win32_ComputerSystemProduct).UUID"]);
  if (!cleanValue(out)) out = (await run("wmic", ["csproduct", "get", "uuid"])).split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[1] || "";
  return cleanValue(out);
}

/** Pure: turn the collected hardware values into the device id. Exported for tests. */
function deriveDeviceId(parts) {
  const good = parts.map(cleanValue).filter(Boolean);
  if (good.length === 0) return null;
  return "hw1-" + crypto.createHash("sha256").update("studiodo-hw-v1|" + good.join("|")).digest("hex").slice(0, 40);
}

let cached = null;

/** Hardware-derived id; if the PC exposes nothing usable, a random id kept in a file in the app's data folder (not in localStorage). */
async function getDeviceId(userDataDir) {
  if (cached) return cached;
  const derived = deriveDeviceId([await readMachineGuid(), await readSmbiosUuid()]);
  if (derived) return (cached = derived);
  const file = path.join(userDataDir, "device-id.txt");
  try {
    const existing = fs.readFileSync(file, "utf8").trim();
    if (/^[A-Za-z0-9._:-]{8,128}$/.test(existing)) return (cached = existing);
  } catch { /* first run */ }
  const fresh = "rnd-" + crypto.randomBytes(20).toString("hex");
  try { fs.mkdirSync(userDataDir, { recursive: true }); fs.writeFileSync(file, fresh, { mode: 0o600 }); } catch { /* keep in memory */ }
  return (cached = fresh);
}

// --- device secret -------------------------------------------------------------------------------------------------

function tokenFile(userDataDir) {
  return path.join(userDataDir, "device-secret.bin");
}

function readToken(userDataDir, safeStorage) {
  try {
    const raw = fs.readFileSync(tokenFile(userDataDir));
    if (raw.slice(0, 4).toString() === "ENC1") {
      if (!safeStorage || !safeStorage.isEncryptionAvailable()) return null;
      return safeStorage.decryptString(raw.slice(4)) || null;
    }
    if (raw.slice(0, 4).toString() === "RAW1") return raw.slice(4).toString("utf8") || null; // keystore was unavailable when saved
    return null;
  } catch {
    return null;
  }
}

function writeToken(userDataDir, safeStorage, token) {
  fs.mkdirSync(userDataDir, { recursive: true });
  const useKeystore = safeStorage && safeStorage.isEncryptionAvailable();
  const body = useKeystore ? Buffer.concat([Buffer.from("ENC1"), safeStorage.encryptString(token)]) : Buffer.concat([Buffer.from("RAW1"), Buffer.from(token, "utf8")]);
  fs.writeFileSync(tokenFile(userDataDir), body, { mode: 0o600 });
}

function clearToken(userDataDir) {
  try { fs.rmSync(tokenFile(userDataDir), { force: true }); } catch { /* already gone */ }
}

module.exports = { getDeviceId, deriveDeviceId, readToken, writeToken, clearToken, cleanValue };
