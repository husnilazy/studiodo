// Usage: node node_modules/tsx/dist/cli.mjs scripts/capture-kiosk.ts [baseUrl] [WxH]
// Screenshots the REAL kiosk screens through its built-in "kiosk preview" mode (?kioskPreview=1): no pairing, no heartbeat, and every API write is
// answered locally, so nothing is created or charged. Output: storage/content-studio/ui-capture/<stage>.png (used as footage in story reels).
import { mkdir } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { renderEnvironment } from "../server/lib/contentStudio/render.js";

const base = process.argv[2] ?? "http://localhost:4050";
const [W, H] = (process.argv[3] ?? "1080x1920").split("x").map(Number);
const chrome = renderEnvironment().chrome;
if (!chrome) throw new Error("Chrome tidak ditemukan");
const out = path.resolve("storage/content-studio/ui-capture");
await mkdir(out, { recursive: true });

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--hide-scrollbars", "--mute-audio", "--force-color-profile=srgb"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.goto(`${base}/?kioskPreview=1`, { waitUntil: "networkidle2", timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 2500));
  await page.screenshot({ path: path.join(out, "idle.png"), type: "png" });
  for (const stage of ["packages", "orientation", "payment", "frame", "capture", "preview", "result"]) {
    await page.evaluate((s) => window.postMessage({ type: "studiodo-kiosk-preview-goto", stage: s }, "*"), stage);
    await new Promise((r) => setTimeout(r, 3500));
    await page.screenshot({ path: path.join(out, `${stage}.png`), type: "png" });
    console.log(stage, "->", await page.evaluate(() => window.location.hash));
  }
} finally { await browser.close(); }
console.log("done", out);
