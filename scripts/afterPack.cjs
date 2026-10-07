// electron-builder afterPack hook: stamps STUDIODO's icon and version info onto the packaged .exe.
//
// package.json has `win.signAndEditExecutable: false` (the winCodeSign download needs symlink rights that a normal
// Windows account doesn't have), and with that flag electron-builder skips editing the .exe — so the app kept Electron's
// default atom icon in the taskbar, Start menu and desktop shortcut even though icon.ico was configured. This applies the
// same edit directly with the bundled rcedit binary.
const path = require("path");
const { execFileSync } = require("child_process");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;
  const { productName, version } = { productName: context.packager.appInfo.productName, version: context.packager.appInfo.version };
  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const rcedit = path.join(__dirname, "vendor", "rcedit-x64.exe");
  const icon = path.join(__dirname, "..", "electron", "icon.ico");
  execFileSync(rcedit, [
    exe,
    "--set-icon", icon,
    "--set-version-string", "ProductName", productName,
    "--set-version-string", "FileDescription", productName,
    "--set-version-string", "InternalName", productName,
    "--set-version-string", "OriginalFilename", `${productName}.exe`,
    "--set-version-string", "CompanyName", "Frameless Creative",
    "--set-file-version", version,
    "--set-product-version", version,
  ], { stdio: "inherit" });
  console.log(`  • afterPack: icon + version info stamped on ${path.basename(exe)}`);
};
