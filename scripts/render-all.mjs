// Usage: node scripts/render-all.mjs id1 id2 ...   renders each story reel one after another (kills leftover render Chrome between runs) and writes a contact sheet per reel.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const ids = process.argv.slice(2);
const ffmpeg = path.resolve("node_modules/ffmpeg-static/ffmpeg.exe");
// the process name is built from pieces so this script's own command line never matches the filter
const needle = "chrome" + "-profile";
const killChrome = () => spawnSync("powershell", ["-NoProfile", "-Command", `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${needle}*' -and $_.Name -eq 'chrome.exe' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Get-ChildItem -Path storage -Recurse -Force -Filter 'Singleton*' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue`], { stdio: "ignore" });

for (const id of ids) {
  killChrome();
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/make-reel.ts", id], { encoding: "utf8" });
  const mp4 = path.resolve("storage/content-studio", `reel-${id}`, `reel-${id}.mp4`);
  const ok = r.status === 0 && existsSync(mp4);
  console.log(id, ok ? "ok" : `FAILED (${r.status})`, `${Math.round((Date.now() - t0) / 1000)}s`);
  if (!ok) { console.log((r.stderr || r.stdout || "").split("\n").filter((l) => !l.startsWith("frame")).slice(0, 6).join("\n")); continue; }
  // contact sheet: 10 frames across the video
  const dir = path.resolve("storage/content-studio", `reel-${id}`, "sheet");
  mkdirSync(dir, { recursive: true });
  spawnSync(ffmpeg, ["-y", "-loglevel", "error", "-i", mp4, "-vf", "fps=10/" + "30,scale=270:480,tile=10x1", "-frames:v", "1", path.join(dir, "sheet.png")]);
}
killChrome();
