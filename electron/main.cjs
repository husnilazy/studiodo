// STUDIODO — Electron main process
// Dual window: kiosk (fullscreen, customer-facing) + dashboard (admin, windowed)
// This is a thin client: all business logic lives in the cloud API the
// renderer talks to directly over HTTP(S) (see client/src/lib/apiConfig.ts).
// Electron here only owns the native shell: fullscreen kiosk window, camera
// bridges, and printing — it no longer spawns a local server or local DB.
require("dotenv").config();
const { app, BrowserWindow, ipcMain, globalShortcut, screen, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const { startCanonBridge, stopCanonBridge, getCanonBridgeStatus } = require("./canon-bridge.cjs");
const { startDigicamBridge, stopDigicamBridge } = require("./digicam-bridge.cjs");
const { listPrinters, printImage } = require("./print.cjs");
const path = require("path");
const fs = require("fs");
const os = require("os");

const isDev = process.env.NODE_ENV === "development";
const CLIENT_DEV_URL = "http://localhost:5173";
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
}

let kioskWin = null;
let adminWin = null;

// ─── File logging ───────────────────────────────────────────────────────────
// These kiosks run unattended with no console anyone can see — every
// console.log/warn/error anywhere in the app (this file, canon-bridge.cjs,
// digicam-bridge.cjs, print.cjs) is tee'd into a file so a failure can
// actually be diagnosed after the fact, instead of only existing for the
// instant it happened.
const MAX_LOG_BYTES = 5 * 1024 * 1024;

function logFilePath() {
  return path.join(app.getPath("userData"), "app.log");
}

function rotateLogIfNeeded() {
  try {
    const target = logFilePath();
    const stat = fs.statSync(target);
    if (stat.size > MAX_LOG_BYTES) fs.renameSync(target, `${target}.old`);
  } catch {
    // No existing log file yet, or rotation failed — not fatal either way.
  }
}

function appendLog(level, args) {
  try {
    const rendered = args
      .map((value) => {
        if (value instanceof Error) return value.stack || value.message;
        if (typeof value === "string") return value;
        try { return JSON.stringify(value); } catch { return String(value); }
      })
      .join(" ");
    fs.appendFileSync(logFilePath(), `${new Date().toISOString()} [${level}] ${rendered}\n`);
  } catch {
    // Logging must never be the reason the kiosk goes down.
  }
}

const originalConsole = { log: console.log.bind(console), warn: console.warn.bind(console), error: console.error.bind(console) };
for (const level of ["log", "warn", "error"]) {
  console[level] = (...args) => {
    originalConsole[level](...args);
    appendLog(level.toUpperCase(), args);
  };
}

// A main-process error that would otherwise silently kill the app (or print
// to a stderr nobody's watching) — log it and keep the kiosk running rather
// than dropping an unattended booth to a dead black screen over a single
// unexpected error.
process.on("uncaughtException", (error) => {
  console.error("[main] uncaughtException", error);
});
process.on("unhandledRejection", (reason) => {
  console.error("[main] unhandledRejection", reason);
});

function loadRoute(win, route) {
  if (isDev) {
    win.loadURL(`${CLIENT_DEV_URL}#${route}`);
    return;
  }
  // Production: the client bundle is loaded straight off disk — there's no
  // local server to serve it anymore. The renderer talks to the configured
  // cloud API (client/src/lib/apiConfig.ts) purely over fetch().
  const indexHtml = path.join(app.getAppPath(), "dist-client", "index.html");
  win.loadFile(indexHtml, { hash: route });
}

// ─── Crash/fail-load recovery ───────────────────────────────────────────────
// An unattended kiosk PC has no one to press F5 when the renderer crashes or
// the bundle fails to load — without this it just shows a dead window until
// staff physically intervene. Retries are capped so a genuinely broken build
// (e.g. a missing dist-client) doesn't hammer forever.
let kioskFailStreak = 0;
const MAX_AUTO_RECOVER_ATTEMPTS = 5;

function attachRecovery(win, route, { isKiosk } = {}) {
  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    if (errorCode === -3) return; // ERR_ABORTED — usually a benign navigation cancel, not a real failure
    console.error(`[window] did-fail-load route=${route} code=${errorCode} desc=${errorDescription} url=${validatedURL}`);
    scheduleRecovery(win, route, isKiosk);
  });
  win.webContents.on("render-process-gone", (_event, details) => {
    console.error(`[window] render-process-gone route=${route} reason=${details?.reason}`);
    scheduleRecovery(win, route, isKiosk);
  });
  win.webContents.on("did-finish-load", () => {
    if (isKiosk) kioskFailStreak = 0;
  });
}

function scheduleRecovery(win, route, isKiosk) {
  if (isKiosk) {
    kioskFailStreak += 1;
    if (kioskFailStreak > MAX_AUTO_RECOVER_ATTEMPTS) {
      console.error(`[window] ${kioskFailStreak} kegagalan kiosk berturut-turut, berhenti mencoba otomatis`);
      return;
    }
  }
  setTimeout(() => {
    if (!win || win.isDestroyed()) return;
    console.log(`[window] mencoba pemulihan otomatis route=${route}`);
    loadRoute(win, route);
  }, 2000);
}

// The renderer's `<a target="_blank">` links (Admin's "Buka galeri"/"Lihat
// di Google Drive"/WhatsApp share buttons) go through window.open(), which
// since Electron 15 is denied by default unless a window-open handler
// explicitly allows it — with no handler at all, clicking those links did
// nothing but leave a blank stub window (no page ever loads into it). These
// links point outside the app anyway (customer gallery, Google Drive,
// wa.me), so instead of opening a second Chromium window inside the kiosk
// app, hand them to the OS's own default browser.
function openExternalLinksIn(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    console.log(`[external-link] window-open url=${url}`);
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url).catch((error) => console.error("[external-link] openExternal gagal", error));
    }
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (url !== win.webContents.getURL()) {
      console.log(`[external-link] will-navigate url=${url}`);
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) {
        shell.openExternal(url).catch((error) => console.error("[external-link] openExternal gagal", error));
      }
    }
  });
}

// digiCamControl's live view window pops up in front of everything when the
// bridge turns live view on — pull the (fullscreen) kiosk back on top.
function bringKioskToFront() {
  if (!kioskWin || kioskWin.isDestroyed()) return;
  kioskWin.show();
  kioskWin.focus();
  kioskWin.moveTop();
}

function createKioskWindow() {
  const { width, height } = screen.getPrimaryDisplay().bounds;
  kioskWin = new BrowserWindow({
    width,
    height,
    fullscreen: !isDev,
    kiosk: !isDev,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  openExternalLinksIn(kioskWin);
  attachRecovery(kioskWin, "/", { isKiosk: true });
  loadRoute(kioskWin, "/");
  kioskWin.on("closed", () => (kioskWin = null));
}

function createAdminWindow() {
  if (adminWin && !adminWin.isDestroyed()) {
    adminWin.show();
    adminWin.focus();
    return;
  }
  adminWin = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  openExternalLinksIn(adminWin);
  attachRecovery(adminWin, "/admin", { isKiosk: false });
  loadRoute(adminWin, "/admin");
  adminWin.on("closed", () => (adminWin = null));
}

function openAdminWindow() {
  createAdminWindow();
}

// ─── Auto-update ─────────────────────────────────────────────────────────────
// Every kiosk is a separate physical install with no one to walk over and
// reinstall it — this is what makes a bug/security fix actually reach the
// fleet. Checks against GitHub Releases (see package.json build.publish);
// downloads silently in the background and installs on the next natural
// app quit/relaunch, never interrupting a customer mid-session.
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

// This whole mechanism used to be entirely invisible — it worked (checks,
// downloads, installs on restart), but nothing anywhere showed an admin
// whether it had ever run, found anything, or failed, so from the outside it
// looked like no update feature existed at all. This state is what the
// admin dashboard's "Cek update" card (see AdminDashboard.tsx) reads via
// updater:getStatus, and what a manual click re-triggers via updater:checkNow.
const updaterStatus = {
  currentVersion: app.getVersion(),
  state: "idle", // idle | checking | available | not-available | downloading | downloaded | error
  version: null,
  progressPercent: null,
  error: null,
  lastCheckedAt: null,
};

// Defaults to enabled — matches the pre-toggle behavior for every kiosk that
// hasn't reported in yet, and for one that's simply offline (an unreachable
// heartbeat must never silently disable updates just because it can't say
// otherwise). Only ever flipped false by an explicit heartbeat response
// (client/src/lib/kioskHeartbeat.ts) reflecting a real per-kiosk toggle an
// admin set in Admin → Kiosk. This only gates the BACKGROUND periodic/
// startup checks below — a manual "Cek update sekarang" click
// (updater:checkNow) always bypasses it, same as most OS update UIs
// separate "auto-update" from "check now".
let autoUpdateEnabled = true;
ipcMain.on("updater:setEnabled", (_event, enabled) => {
  autoUpdateEnabled = Boolean(enabled);
});

function setupAutoUpdater() {
  if (isDev) return; // no packaged build to replace, and no point hitting the feed from a dev checkout
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    updaterStatus.state = "checking";
    updaterStatus.error = null;
    console.log("[updater] checking for update");
  });
  autoUpdater.on("update-available", (info) => {
    updaterStatus.state = "available";
    updaterStatus.version = info.version;
    updaterStatus.lastCheckedAt = new Date().toISOString();
    console.log(`[updater] update available: ${info.version}`);
  });
  autoUpdater.on("update-not-available", () => {
    updaterStatus.state = "not-available";
    updaterStatus.lastCheckedAt = new Date().toISOString();
    console.log("[updater] no update available");
  });
  autoUpdater.on("download-progress", (progress) => {
    updaterStatus.state = "downloading";
    updaterStatus.progressPercent = Math.round(progress.percent);
    console.log(`[updater] downloading update: ${updaterStatus.progressPercent}%`);
  });
  autoUpdater.on("update-downloaded", (info) => {
    updaterStatus.state = "downloaded";
    updaterStatus.version = info.version;
    console.log(`[updater] update ${info.version} downloaded, will install on next restart`);
  });
  autoUpdater.on("error", (error) => {
    updaterStatus.state = "error";
    updaterStatus.error = error instanceof Error ? error.message : String(error);
    updaterStatus.lastCheckedAt = new Date().toISOString();
    console.error("[updater] error", error);
  });

  const check = () => {
    if (!autoUpdateEnabled) {
      console.log("[updater] skip — auto-update dimatikan untuk kiosk ini");
      return;
    }
    autoUpdater.checkForUpdates().catch((error) => console.error("[updater] checkForUpdates gagal", error));
  };
  check();
  setInterval(check, UPDATE_CHECK_INTERVAL_MS);
}

ipcMain.handle("updater:getStatus", () => updaterStatus);
ipcMain.handle("updater:checkNow", async () => {
  if (isDev) return { ...updaterStatus, error: "Update check dimatikan di mode development" };
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    // Already recorded onto updaterStatus by the "error" listener above —
    // this catch just stops an unhandled rejection from reaching the caller.
  }
  return updaterStatus;
});

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return;
  rotateLogIfNeeded();
  console.log(`[startup] app ready isDev=${isDev} version=${app.getVersion()}`);
  startCanonBridge();
  if (process.env.DIGICAM_BRIDGE_ENABLED !== "false") {
    startDigicamBridge({ onLiveViewShown: bringKioskToFront });
  }
  createKioskWindow();
  setupAutoUpdater();

  // Secret combo to open/reveal admin dashboard on top of the kiosk
  globalShortcut.register("Control+Shift+A", openAdminWindow);
  globalShortcut.register("Control+Alt+A", openAdminWindow);

  // Secret combo for on-site staff: toggles the Operator Console overlay
  // *inside* the kiosk window itself (not a separate window — the kiosk
  // window is fullscreen/kiosk-locked, so a second window can't be alt-tabbed to).
  globalShortcut.register("Control+Shift+O", () => {
    if (kioskWin && !kioskWin.isDestroyed()) kioskWin.webContents.send("operator-console:toggle");
  });

  // Escape kiosk mode for setup/debugging — dev-only. In production this used
  // to quit the whole app with nothing to bring it back (no watchdog/service
  // wrapper restarts it), so an accidental or malicious press could kill an
  // unattended booth outright.
  if (isDev) {
    globalShortcut.register("Control+Shift+Q", () => {
      app.quit();
    });
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createKioskWindow();
  });
});

app.on("second-instance", () => {
  if (kioskWin && !kioskWin.isDestroyed()) {
    kioskWin.show();
    kioskWin.focus();
  }
  if (adminWin && !adminWin.isDestroyed()) {
    adminWin.show();
    adminWin.focus();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  stopCanonBridge();
  stopDigicamBridge();
});

// One-way (send, not invoke) — logging must never block or wait on a reply
// from the renderer. args come through as whatever JSON-safe values the
// renderer's console call had; appendLog already knows how to render them.
ipcMain.on("renderer:log", (_event, level, args) => {
  appendLog(`RENDERER-${String(level ?? "LOG").toUpperCase()}`, Array.isArray(args) ? args : [args]);
});

ipcMain.handle("app:getVersion", () => app.getVersion());
ipcMain.handle("app:relaunchKiosk", () => {
  if (kioskWin) kioskWin.close();
  createKioskWindow();
});
ipcMain.handle("canon:bridgeStatus", () => getCanonBridgeStatus());
ipcMain.handle("digicam:bridgeStatus", () => ({
  enabled: process.env.DIGICAM_BRIDGE_ENABLED !== "false",
  port: Number(process.env.DIGICAM_BRIDGE_PORT || 5510),
}));
ipcMain.handle("digicam:restartBridge", () => {
  try {
    stopDigicamBridge();
    startDigicamBridge({ onLiveViewShown: bringKioskToFront });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Gagal restart bridge kamera" };
  }
});
ipcMain.handle("system:getDiagnostics", () => {
  const cpus = os.cpus();
  return {
    platform: process.platform,
    arch: process.arch,
    cpuModel: cpus[0]?.model ?? "-",
    cpuCount: cpus.length,
    freeMemMB: Math.round(os.freemem() / 1024 / 1024),
    totalMemMB: Math.round(os.totalmem() / 1024 / 1024),
    uptimeSeconds: Math.round(os.uptime()),
  };
});
ipcMain.handle("print:listPrinters", async () => {
  try {
    return { ok: true, printers: await listPrinters() };
  } catch (error) {
    return { ok: false, printers: [], error: error instanceof Error ? error.message : "Gagal membaca daftar printer" };
  }
});
ipcMain.handle("print:image", async (_event, payload) => {
  try {
    await printImage(payload);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Print gagal" };
  }
});
// Downloads straight to disk from the main process instead of the renderer's
// fetch()-into-blob-then-<a download> dance — that path was the slow,
// "sangat mengganggu" one: every click held the whole file in renderer memory
// as a blob, then handed it to Chromium's download plumbing, which inside
// Electron doesn't reliably show the same fast native save flow a normal
// browser tab gets. Saving directly to a fixed folder here is both faster
// (single network hop, no blob URL/anchor overhead) and skips a save dialog
// per photo, which matters when an admin is downloading a whole session at once.
ipcMain.handle("download:asset", async (_event, payload) => {
  try {
    const { url, filename } = payload ?? {};
    if (!url || !filename) throw new Error("URL atau nama file tidak ada");
    // A plain Node fetch with no User-Agent can get a different (sometimes
    // stricter) response from Google Drive's uc?export=download endpoint
    // than a real browser tab does — a real UA header keeps this behaving
    // the same as the working browser-download paths (ShareGallery.tsx,
    // Hasil.tsx's per-clip download links).
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) STUDIODO-Kiosk" } });
    if (!response.ok) throw new Error(`Gagal mengunduh (HTTP ${response.status})`);
    // For a large-enough file, Drive's download endpoint can return an HTML
    // "can't scan this file for viruses" interstitial (still HTTP 200)
    // instead of the actual bytes — writing that straight to a .jpg/.gif/
    // .webm silently produces a small, corrupt file with no error at all.
    // Catching it here as a real failure is far better than a "Download"
    // button that appears to work but hands back garbage.
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/html")) {
      throw new Error("Drive mengembalikan halaman konfirmasi, bukan file asli (kemungkinan file terlalu besar untuk didownload langsung)");
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const dir = path.join(app.getPath("downloads"), "STUDIODO");
    await fs.promises.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, filename);
    await fs.promises.writeFile(filePath, buffer);
    return { ok: true, path: filePath };
  } catch (error) {
    console.error("[download:asset] gagal", payload?.url, error);
    return { ok: false, error: error instanceof Error ? error.message : "Download gagal" };
  }
});
