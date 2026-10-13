// STUDIODO — print service
//
// Mencetak gambar secara silent (tanpa dialog print OS) ke printer yang
// dipilih admin. Dua ukuran halaman didukung: "4r" (10.2 x 15.2 cm) untuk
// strip hasil foto — ukuran fisik tetap ini terlepas dari ukuran output
// digital yang dipilih customer — dan "receipt" (7.2 x 12 cm) untuk nota
// kecil seperti kode voucher cash, supaya tidak ikut kepotong/membesar ke
// ukuran kertas 4R.
//
// Pendekatan: buat BrowserWindow tersembunyi berisi <img> yang mengisi penuh
// halaman berukuran target, lalu panggil webContents.print({ silent: true }).

const { BrowserWindow } = require("electron");

// Fisik dalam mm; Electron page size pakai microns (1mm = 1000 microns).
const PAGE_SIZES_MM = {
  "4r": { width: 101.6, height: 152.4 },
  receipt: { width: 72, height: 120 },
};

// Strict on purpose: dataUrl gets interpolated straight into an <img src="">
// below. The old check only required a "data:image/" prefix, so a crafted
// string like `data:image/png;base64,x" onerror="..."` would still pass it
// and break out of the attribute. A real base64 image data URL can only ever
// contain these characters, so validating the whole string closes that off
// instead of just escaping the quote.
function isValidImageDataUrl(value) {
  return typeof value === "string" && /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
}

function pageSizeMicrons(pageSize) {
  const mm = PAGE_SIZES_MM[pageSize] ?? PAGE_SIZES_MM["4r"];
  return { width: Math.round(mm.width * 1000), height: Math.round(mm.height * 1000) };
}

function buildPrintHtml(dataUrl, pageSize) {
  const mm = PAGE_SIZES_MM[pageSize] ?? PAGE_SIZES_MM["4r"];
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: ${mm.width}mm ${mm.height}mm; margin: 0; }
  html, body { margin: 0; padding: 0; width: ${mm.width}mm; height: ${mm.height}mm; }
  img { width: ${mm.width}mm; height: ${mm.height}mm; display: block; object-fit: cover; }
</style>
</head>
<body>
  <img src="${dataUrl}" />
</body>
</html>`;
}

async function listPrinters() {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  try {
    const printers = await win.webContents.getPrintersAsync();
    return printers.map((printer) => ({
      name: printer.name,
      displayName: printer.displayName,
      isDefault: Boolean(printer.isDefault),
    }));
  } finally {
    win.destroy();
  }
}

function printImage({ dataUrl, printerName, copies, pageSize }) {
  return new Promise((resolve, reject) => {
    if (!isValidImageDataUrl(dataUrl)) {
      reject(new Error("dataUrl strip tidak valid"));
      return;
    }

    const printWin = new BrowserWindow({ show: false, webPreferences: { offscreen: false } });
    const html = buildPrintHtml(dataUrl, pageSize);

    printWin.webContents.once("did-finish-load", () => {
      const options = {
        silent: true,
        printBackground: true,
        copies: Math.max(1, Math.min(20, Number(copies) || 1)),
        pageSize: pageSizeMicrons(pageSize),
        margins: { marginType: "none" },
      };
      if (printerName) options.deviceName = printerName;

      printWin.webContents.print(options, (success, failureReason) => {
        printWin.destroy();
        if (success) resolve({ ok: true });
        else reject(new Error(failureReason || "Print gagal"));
      });
    });

    printWin.webContents.once("did-fail-load", (_event, _code, description) => {
      printWin.destroy();
      reject(new Error(description || "Gagal memuat halaman cetak"));
    });

    printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  });
}

// printImage resolves once Windows has accepted the job into the spooler — the paper is usually still being printed at that
// point. This polls the printer's Windows print queue until this recent job has left it (printed), so the kiosk can keep
// its "Sedang mencetak" animation up until the print really finishes. Best effort: if the queue can't be read
// (PowerShell blocked, driver without a queue) it reports `unknown` and the caller just treats the print as done.
const { execFile } = require("child_process");

function readQueue(printerName) {
  const name = String(printerName || "").replace(/'/g, "''");
  const script = [
    `$n='${name}'`,
    `if(-not $n){$n=(Get-CimInstance Win32_Printer | Where-Object Default | Select-Object -First 1).Name}`,
    `$j=@(Get-PrintJob -PrinterName $n -ErrorAction Stop | Where-Object { $_.SubmittedTime -gt (Get-Date).AddMinutes(-5) })`,
    `"$($j.Count)|$((($j | ForEach-Object { $_.JobStatus }) -join ','))"`,
  ].join("; ");
  return new Promise((resolve, reject) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { timeout: 8000, windowsHide: true }, (error, stdout) => {
      if (error) return reject(error);
      const [count, statuses = ""] = String(stdout).trim().split("|");
      resolve({ count: Number(count) || 0, statuses });
    });
  });
}

async function waitForPrintQueue({ printerName, timeoutMs = 120000 } = {}) {
  if (process.platform !== "win32") return { ok: true, unknown: true };
  const deadline = Date.now() + timeoutMs;
  let emptyStreak = 0;
  await new Promise((r) => setTimeout(r, 1500));
  while (Date.now() < deadline) {
    let queue;
    try {
      queue = await readQueue(printerName);
    } catch {
      return { ok: true, unknown: true };
    }
    if (/error|paperout|offline|userintervention|blocked/i.test(queue.statuses)) {
      return { ok: false, error: "Printer bermasalah (cek kertas, tinta, atau kabel printer)" };
    }
    emptyStreak = queue.count === 0 ? emptyStreak + 1 : 0;
    if (emptyStreak >= 2) return { ok: true };
    await new Promise((r) => setTimeout(r, 1500));
  }
  return { ok: true, timedOut: true };
}

module.exports = { listPrinters, printImage, waitForPrintQueue, PAGE_SIZES_MM };
