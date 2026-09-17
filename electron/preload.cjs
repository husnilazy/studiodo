const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("studiodo", {
  getVersion: () => ipcRenderer.invoke("app:getVersion"),
  relaunchKiosk: () => ipcRenderer.invoke("app:relaunchKiosk"),
  canonBridgeStatus: () => ipcRenderer.invoke("canon:bridgeStatus"),
  listPrinters: () => ipcRenderer.invoke("print:listPrinters"),
  printImage: (payload) => ipcRenderer.invoke("print:image", payload),
  platform: process.platform,
});
