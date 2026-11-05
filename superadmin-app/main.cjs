// STUDIODO Admin — desktop app for the platform owner (Superadmin).
// A thin shell around the same Superadmin dashboard that runs in the browser: it opens straight on #/superadmin, keeps running in
// the tray, shows native notifications for new alerts (sign-ups, payments, help messages…) and needs no browser tab.
// Everything is served by the cloud API (default baked into the client build: VITE_DEFAULT_API_BASE_URL). Not related to the kiosk app.
const { app, BrowserWindow, Menu, Notification, Tray, ipcMain, nativeImage, session, shell } = require("electron");
const path = require("path");
const fs = require("fs");

const SMOKE = process.env.SUPERADMIN_SMOKE === "1"; // load, report, quit (used to verify a build)
const ICON = path.join(__dirname, "..", "electron", "icon.png");
const BASE_TITLE = "STUDIODO Admin";

// This app shares package.json's name with the kiosk app, so Electron gave both the SAME data folder (%APPDATA%\studiodo-kiosk)
// and therefore the SAME single-instance lock: while one was running, launching the other only brought the first to the
// front ("open STUDIODO, get Superadmin"). Its own data folder keeps the two apps fully independent. Must run before the lock.
app.setPath("userData", path.join(app.getPath("appData"), "STUDIODO Admin"));
if (!app.requestSingleInstanceLock()) app.quit();
if (process.platform === "win32") app.setAppUserModelId("com.framelesscreative.studiodo.admin");

let win = null;
let tray = null;
let quitting = false;
let unread = 0;

// Optional override: userData/config.json { "url": "https://qr.studiodo.id/#/superadmin" } loads the hosted dashboard instead of the
// bundled one (the hosted copy always has the newest UI, the bundled one always matches this build).
function readConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(app.getPath("userData"), "config.json"), "utf8")); } catch { return {}; }
}

function clientIndex() {
  const candidates = [path.join(__dirname, "..", "dist-client", "index.html"), path.join(process.resourcesPath || "", "app.asar.unpacked", "dist-client", "index.html")];
  return candidates.find((p) => fs.existsSync(p));
}

function isInternal(url) {
  if (url.startsWith("file:")) return true;
  const cfg = readConfig();
  try { return Boolean(cfg.url) && new URL(url).origin === new URL(cfg.url).origin; } catch { return false; }
}

function updateBadge() {
  const title = unread > 0 ? `(${unread}) ${BASE_TITLE}` : BASE_TITLE;
  if (win && !win.isDestroyed()) win.setTitle(title);
  if (tray) tray.setToolTip(title);
  try { app.setBadgeCount(unread); } catch { /* not supported everywhere */ }
}

function showWindow() {
  if (!win || win.isDestroyed()) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 900, minHeight: 600, show: false, title: BASE_TITLE, icon: ICON, autoHideMenuBar: true, backgroundColor: "#f7f7fb",
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  win.once("ready-to-show", () => { if (!SMOKE) win.show(); });
  win.on("page-title-updated", (event) => { event.preventDefault(); updateBadge(); }); // keep our own title (with the unread count)
  // Closing hides to the tray so alerts keep arriving; "Keluar" in the tray menu really quits.
  win.on("close", (event) => { if (!quitting && !SMOKE) { event.preventDefault(); win.hide(); } });
  // Links to the outside world (wa.me, payment dashboards, invoices) open in the real browser, never inside this window.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) void shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (event, url) => { if (!isInternal(url)) { event.preventDefault(); if (/^https?:/i.test(url)) void shell.openExternal(url); } });

  const cfg = readConfig();
  const devUrl = process.env.SUPERADMIN_DEV_URL; // e.g. http://localhost:5173 while developing the dashboard
  if (devUrl) void win.loadURL(`${devUrl.replace(/\/$/, "")}/#/superadmin`);
  else if (cfg.url) void win.loadURL(cfg.url);
  else {
    const index = clientIndex();
    if (!index) { void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent("<body style='font:16px system-ui;padding:40px'><h2>STUDIODO Admin</h2><p>Berkas dashboard tidak ditemukan. Jalankan <code>npm run build:client</code> lalu buka ulang aplikasi.</p></body>")}`); return; }
    void win.loadFile(index, { hash: "/superadmin" });
  }
  if (SMOKE) {
    win.webContents.on("did-finish-load", async () => {
      try {
        await new Promise((r) => setTimeout(r, 2500));
        const info = await win.webContents.executeJavaScript(`({ hash: location.hash, bridge: typeof window.studiodoSuperadmin, text: document.body.innerText.slice(0, 120) })`);
        console.log("SMOKE_OK " + JSON.stringify(info));
      } catch (error) { console.log("SMOKE_FAIL " + error); }
      quitting = true; app.quit();
    });
    win.webContents.on("did-fail-load", (_e, code, desc) => { console.log(`SMOKE_FAIL load ${code} ${desc}`); quitting = true; app.quit(); });
  }
}

function createTray() {
  try {
    tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
    const menu = () => Menu.buildFromTemplate([
      { label: "Buka STUDIODO Admin", click: showWindow },
      { label: "Jalankan saat Windows menyala", type: "checkbox", checked: app.getLoginItemSettings().openAtLogin, click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }) },
      { type: "separator" },
      { label: "Keluar", click: () => { quitting = true; app.quit(); } },
    ]);
    tray.setContextMenu(menu());
    tray.on("click", showWindow);
    tray.on("right-click", () => tray.popUpContextMenu(menu()));
    updateBadge();
  } catch (error) { console.warn("[admin-app] tray tidak tersedia:", error.message); }
}

// Native notification for a new alert; clicking it brings the dashboard forward.
ipcMain.on("sa:notify", (_event, payload) => {
  const title = String(payload?.title ?? "").slice(0, 120);
  const body = String(payload?.body ?? "").slice(0, 300);
  if (!title || !Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: ICON });
  n.on("click", showWindow);
  n.show();
  if (win && !win.isDestroyed() && !win.isFocused()) win.flashFrame(true);
});
ipcMain.on("sa:badge", (_event, count) => { unread = Math.max(0, Math.min(999, Number(count) || 0)); updateBadge(); });

app.on("second-instance", showWindow);
app.on("before-quit", () => { quitting = true; });
app.on("window-all-closed", () => { if (SMOKE || quitting) app.quit(); }); // otherwise stay in the tray

app.whenReady().then(() => {
  // Only what the dashboard needs: notifications and the clipboard (copy links/keys). Camera, mic, location etc. are refused.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(["notifications", "clipboard-sanitized-write", "clipboard-read"].includes(permission)));
  Menu.setApplicationMenu(null);
  createWindow();
  if (!SMOKE) createTray();
});
