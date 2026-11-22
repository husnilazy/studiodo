// Usage: node node_modules/tsx/dist/cli.mjs scripts/capture-kiosk.ts [baseUrl] [WxH] [light|dark]
// Screenshots the REAL kiosk screens through its built-in "kiosk preview" mode (?kioskPreview=1): no pairing, no heartbeat, and every API write is
// answered locally, so nothing is created or charged. Output: storage/content-studio/ui-capture/<stage>.png (used as footage in story reels).
//
// - Landscape 1920x1080 and dark mode by default (the look the owner wants in reels). Dark mode is applied with the kiosk
//   (preview config message), so serve a build of the client, e.g. `vite preview --port 5175` (the Vite dev server cannot load fonts from a path containing '&').
// - The camera is a Chrome fake device fed with a vector avatar, so "Sesi Foto" shows a live-looking portrait instead of "Kamera belum tersedia".
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";
import ffmpegPath from "ffmpeg-static";
import { renderEnvironment } from "../server/lib/contentStudio/render.js";

const base = process.argv[2] ?? "http://localhost:5175";
const [W, H] = (process.argv[3] ?? "1920x1080").split("x").map(Number);
const mode = process.argv[4] === "light" ? "light" : "dark";
const chrome = renderEnvironment().chrome;
if (!chrome) throw new Error("Chrome tidak ditemukan");
const out = path.resolve("storage/content-studio/ui-capture");
await mkdir(out, { recursive: true });

// ---- avatar for the fake camera (SVG -> PNG with Chrome -> y4m with ffmpeg)
const avatarSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbc2eb"/><stop offset="1" stop-color="#a6c1ee"/></linearGradient></defs>
<rect width="1280" height="720" fill="url(#g)"/>
<ellipse cx="500" cy="760" rx="250" ry="210" fill="#5b5bd6"/><ellipse cx="800" cy="780" rx="240" ry="200" fill="#ff7a59"/>
<rect x="462" y="420" width="76" height="90" fill="#d9a077"/><rect x="762" y="430" width="76" height="90" fill="#f2c7a5"/>
<ellipse cx="500" cy="340" rx="124" ry="150" fill="#2b1d16"/><ellipse cx="500" cy="350" rx="100" ry="120" fill="#d9a077"/><ellipse cx="500" cy="286" rx="108" ry="74" fill="#2b1d16"/>
<ellipse cx="800" cy="350" rx="100" ry="120" fill="#f2c7a5"/><ellipse cx="800" cy="288" rx="108" ry="76" fill="#a9552a"/>
<g fill="#1f1b2e"><circle cx="464" cy="360" r="9"/><circle cx="536" cy="360" r="9"/><circle cx="764" cy="362" r="9"/><circle cx="836" cy="362" r="9"/></g>
<g fill="none" stroke="#1f1b2e" stroke-width="7" stroke-linecap="round"><path d="M462 392 Q500 428 538 392"/><path d="M762 394 Q800 430 838 394"/></g>
<g fill="#ff7878" opacity=".35"><circle cx="438" cy="392" r="17"/><circle cx="562" cy="392" r="17"/><circle cx="738" cy="394" r="17"/><circle cx="862" cy="394" r="17"/></g></svg>`;
const avatarPng = path.join(out, "_avatar.png");
const avatarY4m = path.join(out, "_avatar.y4m");
{
  const b = await puppeteer.launch({ executablePath: chrome, headless: true });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 720 });
  await p.setContent(`<body style="margin:0">${avatarSvg}</body>`);
  await p.screenshot({ path: avatarPng, type: "png" });
  await b.close();
  const r = spawnSync(ffmpegPath as string, ["-y", "-loglevel", "error", "-loop", "1", "-i", avatarPng, "-t", "2", "-r", "15", "-pix_fmt", "yuv420p", avatarY4m], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
}
await writeFile(path.join(out, ".gitkeep"), "");

const browser = await puppeteer.launch({
  executablePath: chrome, headless: true,
  args: ["--hide-scrollbars", "--mute-audio", "--force-color-profile=srgb", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${avatarY4m}`],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.goto(`${base}/?kioskPreview=1`, { waitUntil: "networkidle2", timeout: 90_000 });
  await new Promise((r) => setTimeout(r, 3000));
  const DARK = { themeMode: "dark", accentColor: "#8A8AFF", backgroundColor: "#0A0D18", surfaceColor: "#141829", textColor: "#ECEEFF", mutedTextColor: "#9AA3BD", backgroundGradientStart: "#0A0D18", backgroundGradientEnd: "#151A33" };
  if (mode === "dark") await page.evaluate((cfg) => window.postMessage({ type: "studiodo-kiosk-preview-config", config: cfg }, "*"), DARK);
  console.log("theme", mode);
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(out, "idle.png"), type: "png" });
  for (const stage of ["packages", "orientation", "payment", "frame", "capture", "preview", "result"]) {
    await page.evaluate((s) => window.postMessage({ type: "studiodo-kiosk-preview-goto", stage: s }, "*"), stage);
    await new Promise((r) => setTimeout(r, stage === "capture" ? 5000 : 3500));
    if (stage === "capture") { // dismiss the "Foto otomatis atau manual?" dialog so the live camera view is visible
      await page.evaluate(() => { [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Manual" && document.body.textContent?.includes("otomatis atau manual"))?.click(); });
      await new Promise((r) => setTimeout(r, 1500));
    }
    await page.screenshot({ path: path.join(out, `${stage}.png`), type: "png" });
    console.log(stage, "->", await page.evaluate(() => window.location.hash));
  }
} finally { await browser.close(); }
console.log("done", out);
