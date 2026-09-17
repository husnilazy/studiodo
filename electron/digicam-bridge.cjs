// STUDIODO — digiCamControl bridge
//
// Menjembatani digiCamControl (aplikasi terpisah, harus sudah jalan dengan
// webserver diaktifkan di Settings > Webserver) ke kontrak HTTP yang dipakai
// client/src/lib/camera.ts:
//
//   GET  /health   -> { ok, digicamReachable }
//   POST /capture  -> { slotIndex, filter, orientation } => image/jpeg
//
// digiCamControl HARUS sudah berjalan sendiri (proses .exe terpisah) dengan
// webserver aktif (default port 5513). Bridge ini TIDAK menjalankan
// digiCamControl — hanya menerjemahkan panggilan HTTP-nya.
//
// Referensi API digiCamControl (Single Command System):
//   http://127.0.0.1:5513/?CMD=Capture
//   http://127.0.0.1:5513/?slc=get&param1=lastcaptured&param2=
//   http://127.0.0.1:5513/image/<nama file>
//   http://127.0.0.1:5513/session.json

const http = require("http");

const DIGICAM_URL = (process.env.DIGICAM_URL || "http://127.0.0.1:5513").replace(/\/$/, "");
const BRIDGE_PORT = Number(process.env.DIGICAM_BRIDGE_PORT || 5510);
const CAPTURE_TIMEOUT_MS = Number(process.env.DIGICAM_CAPTURE_TIMEOUT_MS || 30000);
const POLL_INTERVAL_MS = 250;

let server = null;

async function digicamGet(pathAndQuery) {
  const response = await fetch(`${DIGICAM_URL}${pathAndQuery}`, {
    headers: { Connection: "close" },
    signal: AbortSignal.timeout(5000),
  });
  return {
    statusCode: response.status,
    body: Buffer.from(await response.arrayBuffer()),
    headers: Object.fromEntries(response.headers.entries()),
  };
}

async function checkDigicamReachable() {
  try {
    const response = await digicamGet("/session.json");
    return response.statusCode > 0 && response.statusCode < 500;
  } catch {
    return false;
  }
}

async function triggerCapture() {
  const response = await digicamGet("/?CMD=Capture");
  if (response.statusCode >= 400 || response.statusCode === 0) {
    throw new Error(`digiCamControl menolak perintah capture (status ${response.statusCode})`);
  }
}

async function triggerFocus() {
  const response = await digicamGet("/?CMD=Focus");
  if (response.statusCode >= 400 || response.statusCode === 0) {
    throw new Error(`digiCamControl menolak perintah autofocus (status ${response.statusCode})`);
  }
}

async function waitForLastCaptured(previousFilename) {
  const deadline = Date.now() + CAPTURE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const response = await digicamGet("/session.json");
    let latestFile = null;
    try {
      const session = JSON.parse(response.body.toString("utf8"));
      const files = Array.isArray(session.Files) ? session.Files : [];
      latestFile = files
        .filter((file) => file && file.Name && file.FileDate)
        .sort((left, right) => new Date(right.FileDate) - new Date(left.FileDate))[0];
    } catch {
      latestFile = null;
    }
    const filename = latestFile?.Name || "";
    const fileSignature = latestFile ? `${latestFile.Name}|${latestFile.FileDate}` : "";
    if (filename && filename !== "-" && fileSignature !== previousFilename) {
      return filename;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error("Timeout menunggu foto dari digiCamControl (lastcaptured tidak berubah)");
}

async function fetchLastCapturedFilename() {
  const response = await digicamGet("/session.json");
  try {
    const session = JSON.parse(response.body.toString("utf8"));
    const files = Array.isArray(session.Files) ? session.Files : [];
    const latest = files
      .filter((file) => file && file.Name && file.FileDate)
      .sort((left, right) => new Date(right.FileDate) - new Date(left.FileDate))[0];
    return latest?.Name && latest?.FileDate ? `${latest.Name}|${latest.FileDate}` : "";
  } catch {
    return "";
  }
}

async function downloadImage(filename) {
  const response = await digicamGet(`/image/${encodeURIComponent(filename)}`);
  if (response.statusCode !== 200 || response.body.length === 0) {
    throw new Error(`Gagal mengunduh foto "${filename}" dari digiCamControl (status ${response.statusCode})`);
  }
  return response.body;
}

async function handleLiveView(res) {
  try {
    const response = await digicamGet("/liveview.jpg");
    if (response.statusCode !== 200 || response.body.length === 0) {
      throw new Error(`Live view digiCamControl tidak tersedia (status ${response.statusCode})`);
    }
    res.writeHead(200, {
      "Content-Type": "image/jpeg",
      "Content-Length": response.body.length,
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(response.body);
  } catch (error) {
    res.writeHead(502, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Live view gagal" }));
  }
}

async function handleCapture(_req, res) {
  try {
    const previousFilename = await fetchLastCapturedFilename();
    await triggerCapture();
    const filename = await waitForLastCaptured(previousFilename);
    const imageBuffer = await downloadImage(filename);
    res.writeHead(200, {
      "Content-Type": "image/jpeg",
      "Content-Length": imageBuffer.length,
      "Access-Control-Allow-Origin": "*",
    });
    res.end(imageBuffer);
  } catch (error) {
    console.error("[digicam-bridge] capture gagal:", error);
    res.writeHead(502, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Capture gagal" }));
  }
}

async function handleFocus(res) {
  try {
    await triggerFocus();
    res.writeHead(204, { "Access-Control-Allow-Origin": "*" });
    res.end();
  } catch (error) {
    console.error("[digicam-bridge] autofocus gagal:", error);
    res.writeHead(502, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Autofocus gagal" }));
  }
}

function startDigicamBridge() {
  if (server) return { available: true, port: BRIDGE_PORT, alreadyRunning: true };

  server = http.createServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      checkDigicamReachable().then((digicamReachable) => {
        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify({ ok: true, digicamReachable, digicamUrl: DIGICAM_URL }));
      });
      return;
    }

    if (req.method === "GET" && req.url?.startsWith("/liveview.jpg")) {
      handleLiveView(res);
      return;
    }

    if (req.method === "POST" && req.url === "/capture") {
      // Body ({ slotIndex, filter, orientation }) sengaja tidak dipakai untuk
      // memicu capture fisik — digiCamControl mengendalikan exposure/preset di
      // sisi kamera. Body tetap dibaca supaya request tidak menggantung.
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => handleCapture(req, res));
      return;
    }

    if (req.method === "POST" && req.url === "/focus") {
      handleFocus(res);
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  server.listen(BRIDGE_PORT, "127.0.0.1", () => {
    console.log(`[digicam-bridge] jalan di http://127.0.0.1:${BRIDGE_PORT} (target digiCamControl: ${DIGICAM_URL})`);
  });
  server.on("error", (error) => {
    console.error("[digicam-bridge] gagal start:", error);
  });

  return { available: true, port: BRIDGE_PORT };
}

function stopDigicamBridge() {
  if (server) {
    server.close();
    server = null;
  }
}

module.exports = { startDigicamBridge, stopDigicamBridge, DIGICAM_URL, BRIDGE_PORT };

// Bisa dijalankan langsung untuk testing di kiosk PC tanpa build Electron:
//   node electron/digicam-bridge.cjs
if (require.main === module) {
  startDigicamBridge();
}
