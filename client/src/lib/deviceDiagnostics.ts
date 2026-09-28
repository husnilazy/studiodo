import { checkTetherBridge } from "./camera";
import { getApiBaseUrl, getKioskKey } from "./apiConfig";
import type { CameraMode } from "./boothConfigStore";

export type DiagnosticStatus = "ok" | "warn" | "fail" | "checking";

export interface DiagnosticResult {
  status: DiagnosticStatus;
  detail: string;
}

export async function checkKioskToken(): Promise<DiagnosticResult> {
  if (!getKioskKey()) return { status: "fail", detail: "Kiosk belum di-pairing." };
  try {
    const res = await fetch(`${getApiBaseUrl()}/packages`, { headers: { "x-kiosk-key": getKioskKey()! } });
    if (res.status === 401) return { status: "fail", detail: "Kiosk key ditolak server — pairing ulang diperlukan." };
    if (!res.ok) return { status: "warn", detail: `Server merespons status ${res.status}.` };
    return { status: "ok", detail: "Kiosk key valid dan diterima server." };
  } catch {
    return { status: "fail", detail: "Tidak bisa menghubungi server." };
  }
}

export async function checkCamera(cameraMode: CameraMode, tetherBridgeUrl: string): Promise<DiagnosticResult> {
  if (cameraMode === "tether") {
    if (!tetherBridgeUrl) return { status: "fail", detail: "URL bridge kamera belum diisi." };
    const health = await checkTetherBridge(tetherBridgeUrl);
    if (!health.ok) return { status: "fail", detail: health.error ?? "Bridge kamera tidak terjangkau." };
    if (health.digicamReachable === false) return { status: "warn", detail: "Bridge jalan, tapi digiCamControl belum terhubung." };
    return { status: "ok", detail: "Bridge kamera & digiCamControl terhubung." };
  }
  try {
    if (!navigator.mediaDevices?.enumerateDevices) return { status: "warn", detail: "Browser tidak mendukung deteksi kamera." };
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter((device) => device.kind === "videoinput");
    if (videoInputs.length === 0) return { status: "fail", detail: "Tidak ada webcam terdeteksi." };
    return { status: "ok", detail: `${videoInputs.length} webcam terdeteksi.` };
  } catch {
    return { status: "warn", detail: "Gagal membaca daftar webcam (izin kamera belum diberikan?)." };
  }
}

export async function checkNetwork(): Promise<DiagnosticResult> {
  if (!navigator.onLine) return { status: "fail", detail: "Perangkat sedang offline." };
  try {
    const start = performance.now();
    const res = await fetch(`${getApiBaseUrl()}/health`, { cache: "no-store" });
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) return { status: "warn", detail: `Server merespons status ${res.status} (${latencyMs}ms).` };
    return { status: latencyMs > 2000 ? "warn" : "ok", detail: `Terhubung ke server, ${latencyMs}ms.` };
  } catch {
    return { status: "fail", detail: "Tidak bisa menjangkau server." };
  }
}

export async function checkPrinter(printerName: string | null): Promise<DiagnosticResult> {
  if (!window.studiodo?.listPrinters) return { status: "warn", detail: "Cek printer hanya tersedia di aplikasi desktop." };
  const result = await window.studiodo.listPrinters();
  if (!result.ok) return { status: "fail", detail: result.error ?? "Gagal membaca daftar printer." };
  if (result.printers.length === 0) return { status: "fail", detail: "Tidak ada printer terdeteksi di sistem." };
  if (printerName && !result.printers.some((printer) => printer.name === printerName)) {
    return { status: "warn", detail: "Printer yang dipilih sebelumnya sudah tidak terdeteksi." };
  }
  if (!printerName) return { status: "warn", detail: "Belum ada printer dipilih." };
  return { status: "ok", detail: `Printer "${printerName}" siap.` };
}
