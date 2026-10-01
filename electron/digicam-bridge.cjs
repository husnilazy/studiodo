// STUDIODO — digiCamControl bridge
//
// Menjembatani digiCamControl (aplikasi terpisah, harus sudah jalan dengan
// webserver diaktifkan di Settings > Webserver) ke kontrak HTTP yang dipakai
// client/src/lib/camera.ts:
//
//   GET  /health      -> { ok, digicamReachable, cameraConnected }
//   POST /capture     -> { slotIndex, filter, orientation } => image/jpeg
//   GET  /properties  -> { [name]: { value, choices } } (ISO/shutter/aperture/WB)
//   POST /properties  -> { [name]: value } => { results: { [name]: { ok, error? } } }
//   POST /liveview/start -> { ready }  (nyalakan live view, tunggu frame pertama)
//   POST /liveview/stop  -> 204        (matikan live view supaya kamera tidak panas)
//   GET  /liveview.jpg   -> satu frame live view
//
// digiCamControl HARUS sudah berjalan sendiri (proses .exe terpisah) dengan
// webserver aktif (default port 5513). Bridge ini TIDAK menjalankan
// digiCamControl — hanya menerjemahkan panggilan HTTP-nya.
//
// API digiCamControl (Single Command System) — verified live 2026-09-29
// against a real tethered Canon EOS 1300D through this exact bridge, not
// just from docs (digicamcontrol.com's own web-interface doc page doesn't
// list the property command syntax, and an earlier guess at "?CMD=Set..."
// silently did nothing — every request to "/" returns the same static
// remote-control HTML regardless of whether the command was recognized, so
// a wrong command looks IDENTICAL to a working one unless you check the
// camera's actual resulting state):
//   http://127.0.0.1:5513/?CMD=Capture
//   http://127.0.0.1:5513/?slc=list&param1=iso&param2=      -> "Auto\n100\n200\n..." (newline list)
//   http://127.0.0.1:5513/?slc=get&param1=iso&param2=       -> "1600" (current value, plain text)
//   http://127.0.0.1:5513/?slc=set&param1=iso&param2=400    -> "OK", or "Wrong value X for property Y" on failure — both HTTP 200
//   http://127.0.0.1:5513/image/<nama file>
//   http://127.0.0.1:5513/session.json

const http = require("http");
const net = require("net");
const crypto = require("crypto");
const { URL } = require("url");

const DIGICAM_URL = (process.env.DIGICAM_URL || "http://127.0.0.1:5513").replace(/\/$/, "");
const BRIDGE_PORT = Number(process.env.DIGICAM_BRIDGE_PORT || 5510);
const CAPTURE_TIMEOUT_MS = Number(process.env.DIGICAM_CAPTURE_TIMEOUT_MS || 30000);
const POLL_INTERVAL_MS = 250;

// Fixed, deliberately small allowlist — these are the properties confirmed
// working live (see the API note above). digiCamControl's "set"/"get"/"list"
// commands accept other property names too (compressionsetting, focusmode,
// exposurecompensation, mode, ...), but only these were actually verified
// against real hardware, and an allowlist also means /properties can never
// be used to poke at an arbitrary, unvalidated camera property from the client.
const CAMERA_PROPERTIES = [
  { name: "iso", label: "ISO" },
  { name: "shutterspeed", label: "Shutter Speed" },
  { name: "aperture", label: "Aperture" },
  { name: "whitebalance", label: "White Balance" },
];

let server = null;

// Hand-rolled raw-socket HTTP client, NOT fetch() or http.request() — both
// verified live to fail against digiCamControl's embedded webserver (an old
// Griffin.Networking-based .NET server). Captured the exact raw bytes over a
// plain net.connect() to see why: it sends "Content-Length: 4" TWICE
// (identical values, genuinely just duplicated, not conflicting) for "slc"
// responses specifically, which Node's HTTP parser refuses outright as a
// protocol violation — fetch's undici parser rejects it as "fetch failed"
// (real cause buried in error.cause), and http.request() with
// insecureHTTPParser:true STILL rejects this specific case ("Parse Error:
// Duplicate Content-Length"), so there's no supported Node HTTP client that
// tolerates it. It also ignores the "Connection: close" header entirely
// (sends "Connection: Keep-Alive" back regardless), so a client waiting for
// the server to close the socket hangs forever — this reads exactly
// Content-Length bytes of body (taking whichever duplicate, since they
// match) and destroys the socket itself rather than waiting for that.
// /health, /capture etc. never hit this specific bug (whatever's different
// about how Griffin.Networking builds those particular responses), which is
// why the original fetch()-based version worked fine until /properties
// started using slc=get/list. Not fixable on digiCamControl's side from here
// — it's closed, unmaintained server code — so this bypasses Node's HTTP
// parsing for ALL requests to it, uniformly, rather than special-casing one path.
function digicamGet(pathAndQuery) {
  return new Promise((resolve, reject) => {
    const target = new URL(`${DIGICAM_URL}${pathAndQuery}`);
    const socket = net.connect({ host: target.hostname, port: Number(target.port) || 80 });
    const chunks = [];
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      fn(value);
    };

    socket.setTimeout(5000);
    socket.on("timeout", () => finish(reject, new Error("Timeout menghubungi digiCamControl")));
    socket.on("error", (error) => finish(reject, error));
    socket.on("connect", () => {
      socket.write(`GET ${target.pathname}${target.search} HTTP/1.1\r\nHost: ${target.host}\r\nConnection: close\r\n\r\n`);
    });
    socket.on("data", (chunk) => {
      chunks.push(chunk);
      const raw = Buffer.concat(chunks);
      const headerEnd = raw.indexOf("\r\n\r\n");
      if (headerEnd === -1) return; // still waiting for the rest of the headers
      const headerLines = raw.slice(0, headerEnd).toString("latin1").split("\r\n");
      const statusMatch = headerLines[0].match(/^HTTP\/1\.\d (\d+)/);
      const statusCode = statusMatch ? Number(statusMatch[1]) : 0;
      const headers = {};
      let contentLength = null;
      for (const line of headerLines.slice(1)) {
        const idx = line.indexOf(":");
        if (idx === -1) continue;
        const key = line.slice(0, idx).trim().toLowerCase();
        const value = line.slice(idx + 1).trim();
        headers[key] = value; // last duplicate wins — fine here since digiCamControl's duplicates always match
        if (key === "content-length") contentLength = Number(value);
      }
      const bodySoFar = raw.length - (headerEnd + 4);
      if (contentLength === null) return; // no length to know when we're done — keep reading until close/timeout
      if (bodySoFar >= contentLength) {
        finish(resolve, { statusCode, body: raw.slice(headerEnd + 4, headerEnd + 4 + contentLength), headers });
      }
    });
    socket.on("close", () => {
      // Server closed before we saw a Content-Length (or never sent one) —
      // whatever arrived is all there is.
      const raw = Buffer.concat(chunks);
      const headerEnd = raw.indexOf("\r\n\r\n");
      if (headerEnd === -1) return finish(reject, new Error("Response tidak valid dari digiCamControl"));
      const statusMatch = raw.slice(0, headerEnd).toString("latin1").match(/^HTTP\/1\.\d (\d+)/);
      finish(resolve, { statusCode: statusMatch ? Number(statusMatch[1]) : 0, body: raw.slice(headerEnd + 4), headers: {} });
    });
  });
}

// The Single Command System takes its 3 arguments as query params named
// literally "slc"/"param1"/"param2" (not the property name/value directly) —
// see WebServerModule.cs in digiCamControl's source, which forwards
// [slc, param1, param2] straight into the same command parser its scripting
// engine and CameraControlCmd.exe use.
async function digicamSlc(action, param1, param2 = "") {
  const query = `/?slc=${encodeURIComponent(action)}&param1=${encodeURIComponent(param1)}&param2=${encodeURIComponent(param2)}`;
  const response = await digicamGet(query);
  return response.body.toString("utf8").trim();
}

// Sequential, not Promise.all — digiCamControl's embedded webserver is an
// old, simple single-purpose server; not worth risking it choking on several
// requests at once when one property fully failing doesn't stop the rest anyway.
async function getCameraProperties() {
  const result = {};
  for (const { name } of CAMERA_PROPERTIES) {
    try {
      const value = await digicamSlc("get", name);
      const listRaw = await digicamSlc("list", name);
      const choices = listRaw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      result[name] = { value: value || null, choices };
    } catch (error) {
      result[name] = { value: null, choices: [], error: error instanceof Error ? error.message : "Gagal membaca properti" };
    }
  }
  return result;
}

// Sequential on purpose, not Promise.all — digiCamControl's own "set" command
// handler sleeps 200ms after every single set to let the camera settle
// before the next command, so firing several concurrently risks the camera
// still processing the previous one when the next SET arrives.
async function setCameraProperties(values) {
  const allowedNames = new Set(CAMERA_PROPERTIES.map((p) => p.name));
  const results = {};
  for (const [name, rawValue] of Object.entries(values || {})) {
    if (!allowedNames.has(name)) {
      results[name] = { ok: false, error: "Properti tidak dikenal" };
      continue;
    }
    try {
      const response = await digicamSlc("set", name, String(rawValue));
      results[name] = response === "OK" ? { ok: true } : { ok: false, error: response || "digiCamControl menolak nilai ini" };
    } catch (error) {
      results[name] = { ok: false, error: error instanceof Error ? error.message : "Gagal mengubah properti" };
    }
  }
  return results;
}

async function checkDigicamReachable() {
  try {
    const response = await digicamGet("/session.json");
    return response.statusCode > 0 && response.statusCode < 500;
  } catch {
    return false;
  }
}

// digiCamControl answering on its port only means the app is open — not that a
// camera is plugged in. Verified live: "slc=list&param1=cameras" returns the
// connected camera's serial number (one per line), and just "OK" when none is
// connected. Anything else (errors, empty) counts as not connected.
async function checkCameraConnected() {
  try {
    const raw = await digicamSlc("list", "cameras");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .some((line) => line && line.toUpperCase() !== "OK" && !/error|exception|object reference|wrong|not found/i.test(line));
  } catch {
    return false;
  }
}

// digiCamControl occasionally answers a command with a transient 5xx/timeout
// while it's still busy finishing the previous one (autofocus settling,
// writing the last file, USB re-negotiation) — a couple of quick retries
// smooths over that without meaningfully slowing down the real failure case
// (camera actually off/disconnected, which fails the same way every time).
async function withRetry(fn, attempts = 3, delayMs = 350) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

async function triggerCapture() {
  await withRetry(async () => {
    const response = await digicamGet("/?CMD=Capture");
    if (response.statusCode >= 400 || response.statusCode === 0) {
      throw new Error(`digiCamControl menolak perintah capture (status ${response.statusCode})`);
    }
  });
}

async function triggerFocus() {
  await withRetry(async () => {
    const response = await digicamGet("/?CMD=Focus");
    if (response.statusCode >= 400 || response.statusCode === 0) {
      throw new Error(`digiCamControl menolak perintah autofocus (status ${response.statusCode})`);
    }
  });
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
  return withRetry(async () => {
    const response = await digicamGet(`/image/${encodeURIComponent(filename)}`);
    if (response.statusCode !== 200 || response.body.length === 0) {
      throw new Error(`Gagal mengunduh foto "${filename}" dari digiCamControl (status ${response.statusCode})`);
    }
    return response.body;
  }, 3, 300);
}

// --- Live view on demand ---------------------------------------------------
// Live view keeps the Canon sensor powered and running continuously, which is
// what makes the body overheat on a booth that sits on it all day. So the
// kiosk asks for it explicitly (POST /liveview/start when a photo session
// begins, /liveview/stop when it ends) instead of it being left on.
//
// digiCamControl's own web UI (WebServer/liveview.html + cmd.html, shipped in
// its install folder) turns live view on with "?CMD=LiveViewWnd_Show" and off
// with "?CMD=LiveViewWnd_Hide" — /liveview.jpg only returns frames while that
// window is open, and an empty 200 otherwise. NOTE: those command names come
// from that shipped web UI, not from a tethered-camera test (no camera was
// connected when this was written) — if live view never starts, check them first.
//
// Safety net: if the kiosk crashes or navigates away without calling /stop, a
// watchdog turns live view off once nobody has fetched a frame for a while.
const LIVEVIEW_START_TIMEOUT_MS = Number(process.env.DIGICAM_LIVEVIEW_START_TIMEOUT_MS || 12000);
const LIVEVIEW_IDLE_STOP_MS = Number(process.env.DIGICAM_LIVEVIEW_IDLE_STOP_MS || 20000);
const LIVEVIEW_HEAL_COOLDOWN_MS = 6000;
const LIVEVIEW_STALE_MS = 3000;

let liveViewDesired = false;
let liveViewLastSeen = 0;
let liveViewLastHeal = 0;
let liveViewLastChange = 0;
let liveViewShown = false;
let liveViewLastHash = null;
let liveViewWatchdog = null;
let liveViewChain = Promise.resolve();
let onLiveViewShown = null;

// Start/stop calls can arrive back-to-back (React dev double-mount, quick
// session restart) — run them strictly in order so a late "hide" can never
// land after a newer "show".
function liveViewSerial(task) {
  const run = liveViewChain.then(task, task);
  liveViewChain = run.catch(() => {});
  return run;
}

// Verified live (Canon EOS 1300D): while the live view window is HIDDEN,
// /liveview.jpg keeps serving the last frame it ever had (byte-identical, 200
// OK) — so "a frame came back" does NOT mean live view is running. Only a
// frame whose bytes keep changing does (sensor noise alone changes every frame).
async function fetchLiveViewFrame() {
  try {
    const response = await digicamGet("/liveview.jpg");
    if (response.statusCode !== 200 || response.body.length === 0) return null;
    return crypto.createHash("md5").update(response.body).digest("hex");
  } catch {
    return null;
  }
}

function armLiveViewWatchdog() {
  if (liveViewWatchdog) return;
  liveViewWatchdog = setInterval(() => {
    if (liveViewDesired && Date.now() - liveViewLastSeen > LIVEVIEW_IDLE_STOP_MS) {
      console.log("[digicam-bridge] live view idle, mematikan otomatis");
      stopLiveView().catch(() => {});
    }
  }, 5000);
  liveViewWatchdog.unref?.();
}

function startLiveView() {
  liveViewDesired = true;
  liveViewLastSeen = Date.now();
  armLiveViewWatchdog();
  return liveViewSerial(async () => {
    liveViewDesired = true;
    // Baseline BEFORE showing, so a stale frame can't be mistaken for a live one.
    let lastHash = await fetchLiveViewFrame();
    if (!liveViewShown) {
      await digicamGet("/?CMD=LiveViewWnd_Show");
      liveViewShown = true;
      // The digiCamControl live view window opens on top of everything — put
      // the kiosk back in front so customers never see the operator window.
      onLiveViewShown?.();
    }
    const deadline = Date.now() + LIVEVIEW_START_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (!liveViewDesired) return { ready: false };
      await new Promise((resolve) => setTimeout(resolve, 250));
      const hash = await fetchLiveViewFrame();
      if (hash && lastHash && hash !== lastHash) {
        liveViewLastChange = Date.now();
        onLiveViewShown?.();
        return { ready: true };
      }
      lastHash = hash || lastHash;
    }
    return { ready: false };
  });
}

function stopLiveView() {
  liveViewDesired = false;
  return liveViewSerial(async () => {
    // A start queued after this stop wins — don't hide what it just showed.
    if (liveViewDesired) return;
    try {
      await digicamGet("/?CMD=LiveViewWnd_Hide");
      liveViewShown = false;
    } catch (error) {
      console.error("[digicam-bridge] gagal mematikan live view:", error);
    }
  });
}

// If the kiosk still wants live view but the frames have stopped changing
// (window closed by hand, camera dropped out of live view), cycle the window
// — rate-limited so a genuinely dead camera isn't hammered with commands.
function healLiveViewIfStale() {
  if (!liveViewDesired || Date.now() - liveViewLastChange < LIVEVIEW_STALE_MS) return;
  if (Date.now() - liveViewLastHeal < LIVEVIEW_HEAL_COOLDOWN_MS) return;
  liveViewLastHeal = Date.now();
  liveViewShown = false;
  digicamGet("/?CMD=LiveViewWnd_Hide").catch(() => {}).finally(() => startLiveView().catch(() => {}));
}

async function handleLiveView(res) {
  if (liveViewDesired) liveViewLastSeen = Date.now();
  try {
    const response = await digicamGet("/liveview.jpg");
    if (response.statusCode !== 200 || response.body.length === 0) {
      healLiveViewIfStale();
      throw new Error(`Live view digiCamControl tidak tersedia (status ${response.statusCode})`);
    }
    if (liveViewDesired) {
      const hash = crypto.createHash("md5").update(response.body).digest("hex");
      if (hash !== liveViewLastHash) {
        liveViewLastHash = hash;
        liveViewLastChange = Date.now();
      } else {
        healLiveViewIfStale();
      }
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

function startDigicamBridge(options = {}) {
  if (typeof options.onLiveViewShown === "function") onLiveViewShown = options.onLiveViewShown;
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
      checkDigicamReachable().then(async (digicamReachable) => {
        const cameraConnected = digicamReachable ? await checkCameraConnected() : false;
        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify({ ok: true, digicamReachable, cameraConnected, digicamUrl: DIGICAM_URL }));
      });
      return;
    }

    if (req.method === "GET" && req.url?.startsWith("/liveview.jpg")) {
      handleLiveView(res);
      return;
    }

    if (req.method === "POST" && req.url === "/liveview/start") {
      startLiveView()
        .then((result) => {
          res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
          res.end(JSON.stringify(result));
        })
        .catch((error) => {
          res.writeHead(502, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Live view gagal dinyalakan" }));
        });
      return;
    }

    if (req.method === "POST" && req.url === "/liveview/stop") {
      stopLiveView().finally(() => {
        res.writeHead(204, { "Access-Control-Allow-Origin": "*" });
        res.end();
      });
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

    if (req.method === "GET" && req.url === "/properties") {
      getCameraProperties()
        .then((properties) => {
          res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
          res.end(JSON.stringify(properties));
        })
        .catch((error) => {
          res.writeHead(502, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Gagal membaca properti kamera" }));
        });
      return;
    }

    if (req.method === "POST" && req.url === "/properties") {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", async () => {
        let body = {};
        try {
          body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        } catch {
          res.writeHead(400, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
          res.end(JSON.stringify({ error: "Body tidak valid" }));
          return;
        }
        const results = await setCameraProperties(body);
        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify({ results }));
      });
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
  if (liveViewDesired) stopLiveView().catch(() => {});
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
