// Usage: tsx scripts/audit-carousels.ts [deckId ...]   renders every built-in carousel (or the listed decks) in its current style and writes
// storage/content-studio/audit/<deckId>/slide-N.png plus a contact sheet and audit.json (style, theme, slide count, mockups).
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BUILTIN_DECKS } from "../server/lib/contentStudio/decks.js";
import { renderForPublish } from "../server/lib/contentStudio/render.js";

const only = process.argv.slice(2);
const decks = BUILTIN_DECKS.filter((d) => d.format === "carousel" && (!only.length || only.includes(d.id)));
const ffmpeg = path.resolve("node_modules/ffmpeg-static/ffmpeg.exe");
const needle = "chrome" + "-profile";
const killChrome = () => spawnSync("powershell", ["-NoProfile", "-Command", `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${needle}*' -and $_.Name -eq 'chrome.exe' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Get-ChildItem -Path storage -Recurse -Force -Filter 'Singleton*' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue`], { stdio: "ignore" });
const report: Record<string, unknown>[] = [];
for (const d of decks) {
  killChrome();
  const dir = path.resolve("storage/content-studio/audit", d.id);
  mkdirSync(dir, { recursive: true });
  try {
    const r = await renderForPublish(d, dir, "image");
    const files = r.files.map((f) => path.join(dir, f));
    const args = ["-y", "-loglevel", "error"];
    files.forEach((f) => args.push("-i", f));
    const sc = files.map((_, i) => `[${i}:v]scale=270:-1[s${i}]`).join(";");
    args.push("-filter_complex", `${sc};${files.map((_, i) => `[s${i}]`).join("")}hstack=inputs=${files.length}[o]`, "-map", "[o]", "-frames:v", "1", path.join(dir, "sheet.png"));
    spawnSync(ffmpeg, args);
    console.log("ok", d.id, files.length);
    report.push({ id: d.id, style: d.style, theme: d.theme, slides: d.slides.length, mockups: d.slides.filter((s) => s.mockup && s.mockup !== "none").length, rendered: files.length });
  } catch (e) {
    console.log("FAIL", d.id, e instanceof Error ? e.message : e);
    report.push({ id: d.id, error: String(e) });
  }
}
killChrome();
writeFileSync(path.resolve("storage/content-studio/audit/audit.json"), JSON.stringify(report, null, 2));
