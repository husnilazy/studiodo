const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("studiodo", {
  getVersion: () => ipcRenderer.invoke("app:getVersion"),
  relaunchKiosk: () => ipcRenderer.invoke("app:relaunchKiosk"),
  canonBridgeStatus: () => ipcRenderer.invoke("canon:bridgeStatus"),
  digicamBridgeStatus: () => ipcRenderer.invoke("digicam:bridgeStatus"),
  restartDigicamBridge: () => ipcRenderer.invoke("digicam:restartBridge"),
  listPrinters: () => ipcRenderer.invoke("print:listPrinters"),
  printImage: (payload) => ipcRenderer.invoke("print:image", payload),
  downloadAsset: (payload) => ipcRenderer.invoke("download:asset", payload),
  getSystemDiagnostics: () => ipcRenderer.invoke("system:getDiagnostics"),
  getUpdaterStatus: () => ipcRenderer.invoke("updater:getStatus"),
  checkForUpdate: () => ipcRenderer.invoke("updater:checkNow"),
  setAutoUpdateEnabled: (enabled) => ipcRenderer.send("updater:setEnabled", enabled),
  // Renderer console.error/warn used to only exist for the instant they
  // happened — no DevTools console is reachable on an unattended, fullscreen
  // kiosk window. Forwarding them into the same app.log the main process
  // already writes to (see main.cjs's own console tee) means a failure like
  // "combined GIF/video silently didn't upload" can actually be diagnosed
  // after the fact instead of just showing up as "it's blank" with no trace.
  logRenderer: (level, args) => ipcRenderer.send("renderer:log", level, args),
  onOperatorConsoleToggle: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("operator-console:toggle", listener);
    return () => ipcRenderer.removeListener("operator-console:toggle", listener);
  },
  platform: process.platform,
});
