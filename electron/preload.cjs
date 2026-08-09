const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("studiodo", {
  getVersion: () => ipcRenderer.invoke("app:getVersion"),
  relaunchKiosk: () => ipcRenderer.invoke("app:relaunchKiosk"),
  canonBridgeStatus: () => ipcRenderer.invoke("canon:bridgeStatus"),
  platform: process.platform,
});
