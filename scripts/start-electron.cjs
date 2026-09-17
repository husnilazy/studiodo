// Launcher dev Electron yang aman dari ELECTRON_RUN_AS_NODE
// (VS Code / CodeGPT set var ini di terminal yang di-spawn dari extension host,
//  sehingga electron.exe jalan sebagai Node biasa dan `app` jadi undefined).
const { spawn } = require("child_process");
const path = require("path");

delete process.env.ELECTRON_RUN_AS_NODE;

const electronCli = path.join(__dirname, "..", "node_modules", "electron", "cli.js");

const child = spawn(process.execPath, [electronCli, "."], {
  stdio: "inherit",
  env: process.env,
});
child.on("close", (code) => process.exit(code ?? 0));
