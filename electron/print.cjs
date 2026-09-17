// STUDIODO — print service
//
// Mencetak strip hasil foto secara silent (tanpa dialog print OS) ke printer
// yang dipilih admin, selalu di ukuran kertas 4R (10.2 x 15.2 cm / 4x6 inch)
// terlepas dari ukuran output digital yang dipilih customer.
//
// Pendekatan: buat BrowserWindow tersembunyi berisi <img> yang mengisi penuh
// halaman berukuran 4R, lalu panggil webContents.print({ silent: true }).

const { BrowserWindow } = require("electron");

// 4R fisik: 101.6mm x 152.4mm. Electron page size pakai microns.
const PAGE_SIZE_MICRONS = { width: 101600, height: 152400 };

function buildPrintHtml(dataUrl) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: 101.6mm 152.4mm; margin: 0; }
  html, body { margin: 0; padding: 0; width: 101.6mm; height: 152.4mm; }
  img { width: 101.6mm; height: 152.4mm; display: block; object-fit: cover; }
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

function printImage({ dataUrl, printerName, copies }) {
  return new Promise((resolve, reject) => {
    if (!dataUrl || !dataUrl.startsWith("data:image/")) {
      reject(new Error("dataUrl strip tidak valid"));
      return;
    }

    const printWin = new BrowserWindow({ show: false, webPreferences: { offscreen: false } });
    const html = buildPrintHtml(dataUrl);

    printWin.webContents.once("did-finish-load", () => {
      const options = {
        silent: true,
        printBackground: true,
        copies: Math.max(1, Math.min(20, Number(copies) || 1)),
        pageSize: PAGE_SIZE_MICRONS,
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

module.exports = { listPrinters, printImage, PAGE_SIZE_MICRONS };
