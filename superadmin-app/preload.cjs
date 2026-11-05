// Bridge between the dashboard (renderer) and the native shell. Only these two calls are exposed.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("studiodoSuperadmin", {
  notify: (title, body) => ipcRenderer.send("sa:notify", { title: String(title ?? ""), body: String(body ?? "") }),
  setBadge: (count) => ipcRenderer.send("sa:badge", Number(count) || 0),
});
