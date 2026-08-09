// STUDIODO — Electron main process
// Dual window: kiosk (fullscreen, customer-facing) + dashboard (admin, windowed)
const { app, BrowserWindow, ipcMain, globalShortcut, screen, dialog } = require("electron");
const { spawn } = require("child_process");
const http = require("http");
const { startCanonBridge, stopCanonBridge } = require("./canon-bridge.cjs");
const path = require("path");

const isDev = process.env.NODE_ENV === "development";
const CLIENT_DEV_URL = "http://localhost:5173";
const SERVER_URL = "http://localhost:4050";

let kioskWin = null;
let adminWin = null;
let serverProcess = null;

function startPackagedServer() {
  if (isDev || !process.resourcesPath) return;
  const serverEntry = path.join(app.getAppPath(), "dist-server", "index.js");
  serverProcess = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: process.env.PORT || "4050",
      DOTENV_CONFIG_PATH: path.join(process.resourcesPath, ".env"),
    },
    cwd: app.getPath("userData"),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProcess.stdout.on("data", (chunk) => console.log(`[server] ${chunk}`));
  serverProcess.stderr.on("data", (chunk) => console.error(`[server] ${chunk}`));
  serverProcess.on("error", (error) => console.error("[STUDIODO] server process error:", error));
}

function waitForServer() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 15000;
    const check = () => {
      const request = http.get(`${SERVER_URL}/api/health`, (response) => {
        response.resume();
        if (response.statusCode && response.statusCode < 500) {
          resolve();
          return;
        }
        retry();
      });
      request.on("error", retry);
      request.setTimeout(1000, () => request.destroy());
    };
    const retry = () => {
      if (Date.now() >= deadline) {
        reject(new Error("STUDIODO server tidak merespons."));
        return;
      }
      setTimeout(check, 250);
    };
    check();
  });
}

function loadRoute(win, route) {
  if (isDev) {
    win.loadURL(`${CLIENT_DEV_URL}#${route}`);
  } else {
    win.loadURL(`${SERVER_URL}#${route}`);
  }
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
  loadRoute(kioskWin, "/");
  kioskWin.on("closed", () => (kioskWin = null));
}

function createAdminWindow() {
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
  loadRoute(adminWin, "/admin");
  adminWin.on("closed", () => (adminWin = null));
}

app.whenReady().then(() => {
  startPackagedServer();
  startCanonBridge();
  const ready = isDev ? Promise.resolve() : waitForServer();
  ready.then(createKioskWindow).catch((error) => {
    console.error("[STUDIODO] gagal memulai server:", error);
    dialog.showErrorBox(
      "STUDIODO tidak dapat dijalankan",
      `${error instanceof Error ? error.message : "Server lokal gagal dimulai."}\n\nPastikan PostgreSQL/DATABASE_URL sudah tersedia.`
    );
    app.quit();
  });

  // Secret combo to open/reveal admin dashboard on top of the kiosk
  globalShortcut.register("Control+Shift+A", () => {
    if (adminWin) {
      adminWin.show();
      adminWin.focus();
    } else {
      createAdminWindow();
    }
  });

  // Escape kiosk mode for setup/debugging (dev convenience — disable/gate in production build)
  globalShortcut.register("Control+Shift+Q", () => {
    app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createKioskWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  stopCanonBridge();
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
});

ipcMain.handle("app:getVersion", () => app.getVersion());
ipcMain.handle("app:relaunchKiosk", () => {
  if (kioskWin) kioskWin.close();
  createKioskWindow();
});
ipcMain.handle("canon:bridgeStatus", () => ({
  configured: Boolean(process.env.STUDIODO_CANON_BRIDGE) || Boolean(process.resourcesPath),
}));
