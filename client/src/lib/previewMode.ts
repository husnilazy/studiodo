import { useKioskSession, type Package } from "./sessionStore";
import { createJSONStorage } from "zustand/middleware";
import { getApiBaseUrl } from "./apiConfig";
import { useBoothConfig, type BoothConfig } from "./boothConfigStore";

// "Kiosk preview" = the REAL kiosk app running inside an <iframe> on the admin's Kustomisasi Kiosk page, so the tenant
// sees exactly what a customer sees (same pages, fonts, buttons, animations) instead of a hand-drawn imitation.
//
// The iframe loads this same app with `?kioskPreview=1`. In that mode:
//  - the app never pairs / checks the subscription / starts the heartbeat, the updater, the operator console or the
//    hidden admin entry (see App.tsx and KioskShell.tsx),
//  - every API write (create session, start QRIS, upload photo …) is answered locally, so previewing the payment or
//    result screens can never create a real session or charge anyone,
//  - the admin page drives it with postMessage: pick a screen, and the frame seeds sample data for it.

export const IS_KIOSK_PREVIEW = (() => {
  try {
    return new URLSearchParams(window.location.search).has("kioskPreview");
  } catch {
    return false;
  }
})();

export type PreviewStage = "idle" | "packages" | "orientation" | "payment" | "frame" | "capture" | "preview" | "result";

export const PREVIEW_MESSAGE = "studiodo-kiosk-preview-goto";
/** parent → frame: the design being edited right now (applied instantly, nothing is saved from inside the frame). */
export const PREVIEW_CONFIG_MESSAGE = "studiodo-kiosk-preview-config";
/** frame → parent: the frame booted / the customer moved to another screen. */
export const PREVIEW_READY_MESSAGE = "studiodo-kiosk-preview-ready";
/** parent → frame: "are you up?" — answered with PREVIEW_READY_MESSAGE, so the handshake works whichever side loaded first. */
export const PREVIEW_PING_MESSAGE = "studiodo-kiosk-preview-ping";
export const PREVIEW_ROUTE_MESSAGE = "studiodo-kiosk-preview-route";

export const ROUTE_STAGE: Record<string, PreviewStage> = {
  "/": "idle",
  "/tutorial": "idle",
  "/paket": "packages",
  "/orientasi": "orientation",
  "/bayar": "payment",
  "/frame": "frame",
  "/sesi-foto": "capture",
  "/preview": "preview",
  "/hasil": "result",
};

const STAGE_ROUTE: Record<PreviewStage, string> = {
  idle: "/",
  packages: "/paket",
  orientation: "/orientasi",
  payment: "/bayar",
  frame: "/frame",
  capture: "/sesi-foto",
  preview: "/preview",
  result: "/hasil",
};

const MOCK_RESPONSE = {
  id: "preview-session",
  sessionId: "preview-session",
  qrString: "STUDIODO-PREVIEW-QRIS",
  demo: true,
  valid: true,
  ok: true,
  status: "pending",
  amount: 0,
  discount: 0,
  shareUrl: "https://studiodo.id/preview",
  stripUrl: "",
};

function samplePhoto(index: number) {
  const palettes = [["#fbc2eb", "#a6c1ee"], ["#fddb92", "#d1fdff"], ["#a1c4fd", "#c2e9fb"], ["#ffecd2", "#fcb69f"], ["#d4fc79", "#96e6a1"], ["#e0c3fc", "#8ec5fc"]];
  const [from, to] = palettes[index % palettes.length];
  const canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 800;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 0, 600, 800);
  gradient.addColorStop(0, from);
  gradient.addColorStop(1, to);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 600, 800);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.arc(300, 330, 120, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(300, 640, 210, 170, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.font = "600 44px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`Foto ${index + 1}`, 300, 760);
  return canvas.toDataURL("image/jpeg", 0.85);
}

async function pickPackage(): Promise<Package> {
  try {
    const key = localStorage.getItem("studiodo-kiosk-key");
    const response = await fetch(`${getApiBaseUrl()}/packages`, { headers: key ? { "x-kiosk-key": key } : undefined, cache: "no-store" });
    if (response.ok) {
      const list = (await response.json()) as Package[];
      if (Array.isArray(list) && list.length > 0) return list[0];
    }
  } catch {
    // fall through to the sample package
  }
  return { id: "preview-package", name: "Paket Contoh", price: "50000", photoCount: 4, hasGif: false, hasVideo: false, extraPrints: [] };
}

export async function seedStage(stage: PreviewStage) {
  const session = useKioskSession.getState();
  if (stage === "idle" || stage === "packages") {
    session.resetSession();
    return;
  }
  const pkg = session.selectedPackage ?? (await pickPackage());
  const photoCount = Math.max(2, Math.min(6, Number(pkg.photoCount) || 4));
  const needsPhotos = stage === "frame" || stage === "preview" || stage === "result";
  useKioskSession.setState({
    selectedPackage: pkg,
    sessionId: "preview-session",
    photoUrls: needsPhotos ? Array.from({ length: photoCount }, (_, i) => samplePhoto(i)) : [],
    currentSlot: 0,
    sessionStartedAt: null,
  });
}

// Shown on the package screen when the tenant has no packages yet (or the frame is not paired), so the buttons, cards
// and prices can still be judged.
const SAMPLE_PACKAGES = [
  { id: "preview-package-1", name: "Paket Hemat", price: "35000", photoCount: 3, hasGif: false, hasVideo: false, hasStopMotion: false, extraPrints: [], description: "3 foto, cetak 4R" },
  { id: "preview-package-2", name: "Paket Seru", price: "60000", photoCount: 4, hasGif: true, hasVideo: false, hasStopMotion: false, extraPrints: [], description: "4 foto + GIF animasi" },
  { id: "preview-package-3", name: "Paket Lengkap", price: "95000", photoCount: 6, hasGif: true, hasVideo: true, hasStopMotion: true, extraPrints: [], description: "6 foto + GIF + video" },
];

/** Called once from main.tsx when the app was opened as a preview frame. */
export function installKioskPreview() {
  if (!IS_KIOSK_PREVIEW) return;
  document.documentElement.classList.add("kiosk-preview");

  // The frame shows whatever design the admin is editing right now (pushed in by postMessage), so it must never write
  // that back to the shared localStorage — the admin page would see the write, push it again, and the two would
  // ping-pong forever. It also stops listening to storage events (see KioskShell).
  useBoothConfig.persist.setOptions({
    storage: createJSONStorage(() => ({ getItem: () => null, setItem: () => undefined, removeItem: () => undefined })),
  });

  // Writes are answered locally; reads (packages, frames, config) stay real so the preview shows the tenant's own data.
  const realFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase();
    const isApi = url.startsWith(getApiBaseUrl());
    if (isApi && (method !== "GET" || url.includes("/payment/status"))) {
      return Promise.resolve(new Response(JSON.stringify(MOCK_RESPONSE), { status: 200, headers: { "Content-Type": "application/json" } }));
    }
    if (isApi && method === "GET" && /\/packages\/?(\?.*)?$/.test(url)) {
      return realFetch(input, init)
        .then(async (response) => {
          const list = response.ok ? await response.clone().json().catch(() => null) : null;
          if (Array.isArray(list) && list.length > 0) return response;
          return new Response(JSON.stringify(SAMPLE_PACKAGES), { status: 200, headers: { "Content-Type": "application/json" } });
        })
        .catch(() => new Response(JSON.stringify(SAMPLE_PACKAGES), { status: 200, headers: { "Content-Type": "application/json" } }));
    }
    return realFetch(input, init);
  };
  window.print = () => undefined;

  window.addEventListener("message", (event) => {
    const data = event.data as { type?: string; stage?: PreviewStage; config?: Partial<BoothConfig> } | null;
    if (!data) return;
    if (data.type === PREVIEW_PING_MESSAGE) {
      window.parent?.postMessage({ type: PREVIEW_READY_MESSAGE }, "*");
      return;
    }
    if (data.type === PREVIEW_CONFIG_MESSAGE && data.config) {
      useBoothConfig.getState().update(data.config);
      return;
    }
    if (data.type !== PREVIEW_MESSAGE || !data.stage || !(data.stage in STAGE_ROUTE)) return;
    void seedStage(data.stage).then(() => {
      window.location.hash = `#${STAGE_ROUTE[data.stage!]}`;
    });
  });
  const reportRoute = () => window.parent?.postMessage({ type: PREVIEW_ROUTE_MESSAGE, route: window.location.hash.replace(/^#/, "") || "/" }, "*");
  window.addEventListener("hashchange", reportRoute);
  window.parent?.postMessage({ type: PREVIEW_READY_MESSAGE }, "*");
  reportRoute();
}
