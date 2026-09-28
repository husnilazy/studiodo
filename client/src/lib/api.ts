import { clearKioskPairing, getApiBaseUrl, getDeviceId, getKioskKey } from "./apiConfig";
import type { LayoutElement, ScreenOrientation } from "./screenBuilder/types";

const ADMIN_TOKEN_KEY = "studiodo-admin-token";

let adminToken: string | null = null;
try {
  adminToken = sessionStorage.getItem(ADMIN_TOKEN_KEY);
} catch {
  // sessionStorage can throw in private/locked-down contexts — admin just has to log in again.
}

export function getAdminToken() {
  return adminToken;
}

export function setAdminToken(token: string | null) {
  adminToken = token;
  try {
    if (token) sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    // ignore — token still works for the rest of this session via the in-memory variable
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Without this, a slow/hung request (cold-started Neon compute, a flaky
// tunnel hop) never actually failed — it just sat there forever, so a button
// with no loading indicator of its own (e.g. "Terapkan voucher") looked
// completely unresponsive with no way to tell if it was still trying or
// dead. 25s is generous enough for a real cold start while still giving
// every request a definite end.
const DEFAULT_TIMEOUT_MS = 25000;

async function request<T>(path: string, options?: RequestInit): Promise<T | undefined> {
  const kioskKey = getKioskKey();
  let res: Response;
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), DEFAULT_TIMEOUT_MS);
  try {
    res = await fetch(`${getApiBaseUrl()}${path}`, {
      ...options,
      // Express sends an ETag on JSON responses but no Cache-Control, which left
      // the browser free to reuse a stale cached GET (confirmed live: after
      // saving/resetting a screen-layout override, a reload kept showing the old
      // one until the cache was forced clear). None of this API's responses
      // should ever be cached — every endpoint is per-tenant dynamic state.
      cache: "no-store",
      signal: timeoutController.signal,
      headers: {
        "Content-Type": "application/json",
        ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
        ...(kioskKey ? { "x-kiosk-key": kioskKey, "x-device-id": getDeviceId() } : {}),
        ...(options?.headers ?? {}),
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError(0, "Server tidak merespon. Periksa koneksi internet atau coba lagi.");
    }
    throw new ApiError(0, "Server tidak dapat dijangkau. Periksa koneksi internet atau status server.");
  } finally {
    clearTimeout(timeoutId);
  }

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    if (!res.ok) throw new ApiError(res.status, `API error ${res.status}`);
    if (kioskKey) window.dispatchEvent(new Event("studiodo-kiosk-device-ok"));
    return undefined;
  }
  const text = await res.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }

  // Only treat this as "admin session expired" when the server says it was
  // specifically the admin auth that failed — most endpoints are kiosk-key
  // authenticated and 401 independently (e.g. a revoked kiosk key), which
  // must never log the admin out of the dashboard.
  if (res.status === 401 && body?.code === "admin_auth_required" && path !== "/auth/login") {
    setAdminToken(null);
    window.dispatchEvent(new Event("studiodo-admin-unauthorized"));
  }
  if (res.status === 401 && body?.code === "kiosk_auth_required" && kioskKey) {
    clearKioskPairing();
    window.dispatchEvent(new Event("studiodo-kiosk-pairing-required"));
  }
  if (res.status === 403 && body?.code === "kiosk_device_mismatch") {
    window.dispatchEvent(new Event("studiodo-kiosk-device-mismatch"));
  }
  // Recovery path for the screen above — once any kiosk-authenticated request
  // succeeds again (e.g. an admin reset the device lock and the next periodic
  // heartbeat got through), clear it. Without this, a kiosk that got unlocked
  // server-side would stay stuck on the lock screen until someone restarted the
  // app, since nothing else in the running app re-checks that state.
  if (res.ok && kioskKey) {
    window.dispatchEvent(new Event("studiodo-kiosk-device-ok"));
  }
  if (!res.ok) {
    const contentType = res.headers.get("content-type") ?? "";
    const message = body?.error ?? (contentType.includes("text/html")
      ? `Server sedang tidak tersedia (HTTP ${res.status}). Coba lagi beberapa saat.`
      : `API error ${res.status}`);
    throw new ApiError(res.status, message);
  }
  return body as T;
}

export const api = {
  loginAdmin: (email: string, password: string) => request<{ token: string }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logoutAdmin: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  getMe: () => request<{
    tenantId: string;
    email: string;
    plan: string | null;
    status: string | null;
    subscriptionEndsAt: string | null;
    renewalWhatsapp: string | null;
    renewalCheckoutUrl: string | null;
    gracePeriodDays: number;
  }>("/auth/me"),
  getStorageConfig: () => request<any>("/config/storage"),
  updateStorageConfig: (body: Record<string, unknown>) => request<{ ok: boolean }>("/config/storage", { method: "PATCH", body: JSON.stringify(body) }),
  getTenantConfig: () => request<Record<string, unknown>>("/config/tenant"),
  getPlanFeatures: () => request<{
    planSlug: string | null;
    planName: string | null;
    kioskLimit: number | null;
    screenBuilderEnabled: boolean;
    gifVideoEnabled: boolean;
    kioskCount: number;
  }>("/config/plan-features"),
  updateKioskFlow: (body: { order: string[]; enabled: Record<string, boolean> }) =>
    request<{ ok: boolean; kioskFlow: { order: string[]; enabled: Record<string, boolean> } }>("/config/kiosk-flow", { method: "PATCH", body: JSON.stringify(body) }),
  getScreenLayout: (screenKey: string, orientation: ScreenOrientation) =>
    request<{ elements: LayoutElement[]; updatedAt: string | null }>(`/config/screen-layout?screenKey=${screenKey}&orientation=${orientation}`),
  updateScreenLayout: (screenKey: string, orientation: ScreenOrientation, elements: LayoutElement[]) =>
    request<{ ok: boolean; elements: LayoutElement[] }>("/config/screen-layout", { method: "PATCH", body: JSON.stringify({ screenKey, orientation, elements }) }),
  getKioskKeys: () => request<{ id: string; label: string | null; createdAt: string; lastUsedAt: string | null; revokedAt: string | null; appVersion?: string | null; lastDiagnostics?: { cameraOk: boolean; printerOk: boolean; networkOk: boolean; checkedAt: string } | null; boundDeviceId?: string | null; boundAt?: string | null; autoUpdateEnabled?: boolean }[]>("/kiosk-keys"),
  createKioskKey: (label: string) => request<{ id: string; label: string | null; createdAt: string; key: string }>("/kiosk-keys", { method: "POST", body: JSON.stringify({ label }) }),
  resetKioskKeyDevice: (id: string) => request<{ ok: boolean; id: string }>(`/kiosk-keys/${id}/reset-device`, { method: "POST" }),
  revealKioskKey: (id: string) => request<{ key: string }>(`/kiosk-keys/${id}/reveal`),
  revokeKioskKey: (id: string) => request<{ ok: boolean; id: string }>(`/kiosk-keys/${id}`, { method: "DELETE" }),
  setKioskKeyAutoUpdate: (id: string, autoUpdateEnabled: boolean) =>
    request<{ id: string; autoUpdateEnabled: boolean }>(`/kiosk-keys/${id}`, { method: "PATCH", body: JSON.stringify({ autoUpdateEnabled }) }),
  sendKioskHeartbeat: (body: { appVersion?: string; diagnostics?: { cameraOk: boolean; printerOk: boolean; networkOk: boolean } }) =>
    request<{
      ok: boolean;
      autoUpdateEnabled: boolean;
      subscription: { locked: boolean; graceDaysRemaining: number | null; renewalWhatsapp: string | null; renewalCheckoutUrl: string | null };
    }>("/kiosk-keys/heartbeat", { method: "POST", body: JSON.stringify(body) }),
  // Fire-and-forget from client/src/main.tsx's console.error override — a
  // failure here must never throw back into the console override itself
  // (that would recurse), so call sites wrap this in its own try/catch.
  reportKioskError: (body: { level: "error" | "warning"; message: string; stack?: string; appVersion?: string }) =>
    request<{ ok: boolean }>("/kiosk-keys/report-error", { method: "POST", body: JSON.stringify(body) }),
  getPublicConfig: (sessionId?: string) => request<{ baseUrl: string; brandName?: string; tagline?: string; logoUrl?: string | null; contactWhatsapp?: string | null; socialInstagram?: string | null; socialTiktok?: string | null; socialFacebook?: string | null; websiteUrl?: string | null; address?: string | null; accentColor?: string | null }>(`/config/public${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`),
  updateGalleryProfile: (body: Record<string, unknown>) => request<any>("/config/gallery-profile", { method: "PATCH", body: JSON.stringify(body) }),
  getPackages: () => request<any[]>("/packages"),
  createSession: (body: { packageId?: string; orientation: string; selectedExtras?: { id: string; name: string; price: number }[] }) =>
    request<any>("/sessions", { method: "POST", body: JSON.stringify(body) }),
  patchSession: (id: string, body: Record<string, unknown>) =>
    request<any>(`/sessions/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  markEventFree: (id: string, eventName?: string) =>
    request<any>(`/sessions/${id}/mark-event-free`, { method: "POST", body: JSON.stringify({ eventName }) }),
  uploadPhoto: async (sessionId: string, slotIndex: number, blob: Blob) => {
    const form = new FormData();
    form.append("photo", blob, `slot-${slotIndex}.jpg`);
    form.append("slotIndex", String(slotIndex));
    const kioskKey = getKioskKey();
    const res = await fetch(`${getApiBaseUrl()}/sessions/${sessionId}/photo`, { method: "POST", body: form, headers: kioskKey ? { "x-kiosk-key": kioskKey } : undefined });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Upload gagal (${res.status})${detail ? `: ${detail}` : ""}`);
    }
    return res.json();
  },
  uploadMedia: async (sessionId: string, kind: "gif" | "video", blob: Blob) => {
    const form = new FormData();
    form.append("media", blob, `${kind}-${Date.now()}.${kind === "gif" ? "gif" : "webm"}`);
    form.append("kind", kind);
    const kioskKey = getKioskKey();
    const res = await fetch(`${getApiBaseUrl()}/sessions/${sessionId}/media`, { method: "POST", body: form, headers: kioskKey ? { "x-kiosk-key": kioskKey } : undefined });
    if (!res.ok) throw new Error(`Media upload gagal: ${res.status}`);
    return res.json();
  },
  // The short clip captured at one specific photo shot (slotIndex), as
  // opposed to uploadMedia above which is the combined all-slots-at-once clip.
  uploadSlotMedia: async (sessionId: string, slotIndex: number, kind: "gif" | "video", blob: Blob) => {
    const form = new FormData();
    form.append("media", blob, `slot-${slotIndex}.${kind === "gif" ? "gif" : "webm"}`);
    form.append("slotIndex", String(slotIndex));
    form.append("kind", kind);
    const kioskKey = getKioskKey();
    const res = await fetch(`${getApiBaseUrl()}/sessions/${sessionId}/slot-media`, { method: "POST", body: form, headers: kioskKey ? { "x-kiosk-key": kioskKey } : undefined });
    if (!res.ok) throw new Error(`Slot media upload gagal: ${res.status}`);
    return res.json();
  },
  uploadStrip: async (sessionId: string, blob: Blob) => {
    const form = new FormData();
    form.append("strip", blob, `strip-${Date.now()}.jpg`);
    const kioskKey = getKioskKey();
    const res = await fetch(`${getApiBaseUrl()}/sessions/${sessionId}/strip`, { method: "POST", body: form, headers: kioskKey ? { "x-kiosk-key": kioskKey } : undefined });
    if (!res.ok) throw new Error(`Upload strip gagal: ${res.status}`);
    return res.json();
  },
  finalizeSession: (id: string, body: Record<string, unknown>) =>
    request<any>(`/sessions/${id}/finalize`, { method: "POST", body: JSON.stringify(body) }),
  updateCustomer: (id: string, body: { whatsapp?: string; email?: string; publishConsent: boolean; feedback?: string }) =>
    request<any>(`/sessions/${id}/customer`, { method: "PATCH", body: JSON.stringify(body) }),
  getPublicSession: (id: string) => request<any>(`/sessions/${id}/public`),
  getRecentSessions: () => request<any[]>("/sessions/recent"),
  getCustomers: (params?: { limit?: number; offset?: number }) =>
    request<{ items: any[]; total: number; limit: number; offset: number }>(
      `/sessions?limit=${params?.limit ?? 100}&offset=${params?.offset ?? 0}`,
    ),
  getAdminOverview: () => request<any>("/sessions/admin/overview"),
  startQris: (sessionId: string) =>
    request<{ demo: boolean; qrString: string; invoiceId?: string; expiresInSeconds?: number }>("/payment/qris", { method: "POST", body: JSON.stringify({ sessionId }) }),
  getPaymentStatus: (sessionId: string) => request<any>(`/payment/status/${sessionId}`),
  startAdditionalPrint: (sessionId: string, quantity: number) => request<{ demo: boolean; qrString: string; amount: number; expiresInSeconds?: number }>("/payment/additional-print", { method: "POST", body: JSON.stringify({ sessionId, quantity }) }),
  redeemAdditionalPrintVoucher: (sessionId: string, code: string, quantity: number) =>
    request<{ valid: boolean; amount: number; cash?: boolean }>("/payment/additional-print/voucher", { method: "POST", body: JSON.stringify({ sessionId, code, quantity }) }),
  getPrintingConfig: () => request<{ enabled: boolean; label: string; price: number; max: number }>("/config/printing"),
  updatePrintingConfig: (body: { enabled: boolean; label: string; price: number; max: number }) => request<{ enabled: boolean; label: string; price: number; max: number }>("/config/printing", { method: "PATCH", body: JSON.stringify(body) }),
  redeemVoucher: (sessionId: string, code: string) =>
    request<{ valid: boolean; amount: number; discount: number; cash?: boolean; invoiceNumber?: string }>("/payment/voucher", { method: "POST", body: JSON.stringify({ sessionId, code }) }),
  getPaymentConfig: () => request<{ hasSecretKey: boolean; hasWebhookToken: boolean; demoMode: boolean; cashPaymentEnabled: boolean }>("/config/payment"),
  updatePaymentConfig: (body: { secretKey?: string; webhookToken?: string }) =>
    request<{ ok: boolean }>("/config/payment", { method: "PATCH", body: JSON.stringify(body) }),
  updateCashPaymentConfig: (enabled: boolean) => request<{ enabled: boolean }>("/config/cash-payment", { method: "PATCH", body: JSON.stringify({ enabled }) }),
  createCashVoucher: (body: { amount: number; customerName?: string }) => request<any>("/vouchers/cash", { method: "POST", body: JSON.stringify(body) }),
  getVouchers: () => request<any[]>("/vouchers"),
  createVoucher: (body: Record<string, unknown>) => request<any>("/vouchers", { method: "POST", body: JSON.stringify(body) }),
  createVouchersBulk: (body: Record<string, unknown>) => request<{ codes: any[] }>("/vouchers/bulk", { method: "POST", body: JSON.stringify(body) }),
  getVoucherReport: (params: { voucherId?: string; from?: string; to?: string; limit?: number; offset?: number } = {}) => {
    const query = new URLSearchParams();
    if (params.voucherId) query.set("voucherId", params.voucherId);
    if (params.from) query.set("from", params.from);
    if (params.to) query.set("to", params.to);
    if (params.limit) query.set("limit", String(params.limit));
    if (params.offset) query.set("offset", String(params.offset));
    const qs = query.toString();
    return request<{ summary: { totalRedemptions: number; totalDiscountGiven: number; totalRevenueAfterDiscount: number }; items: any[]; total: number; limit: number; offset: number }>(`/vouchers/report${qs ? `?${qs}` : ""}`);
  },
  updateVoucher: (id: string, body: Record<string, unknown>) => request<any>(`/vouchers/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteVoucher: (id: string) => request<void>(`/vouchers/${id}`, { method: "DELETE" }),
  getFrames: (orientation: string) => request<any[]>(`/frames?orientation=${orientation}`),
  createFrame: (template: { id: string; name: string; frameDataUrl: string; slots: unknown[]; canvasWidth: number; canvasHeight: number; orientation: string; category?: string; style?: string; outputPreset?: string }) =>
    request<any>("/frames", {
      method: "POST",
      body: JSON.stringify({
        id: template.id,
        name: template.name,
        frameImageUrl: template.frameDataUrl,
        slots: template.slots,
        canvasWidth: template.canvasWidth,
        canvasHeight: template.canvasHeight,
        orientation: template.orientation,
        category: template.category,
        style: template.style,
        outputPreset: template.outputPreset,
      }),
    }),
  updateFrame: (id: string, body: Record<string, unknown>) => request<any>(`/frames/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  getFrameCategories: () => request<{ categories: { key: string; label: string }[] }>("/frames/categories"),
  addFrameCategory: (label: string) => request<{ categories: { key: string; label: string }[] }>("/frames/categories", { method: "POST", body: JSON.stringify({ label }) }),
  getPackagesAll: () => request<any[]>("/packages/all"),
  createPackage: (body: Record<string, unknown>) => request<any>("/packages", { method: "POST", body: JSON.stringify(body) }),
  updatePackage: (id: string, body: Record<string, unknown>) => request<any>(`/packages/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deletePackage: (id: string) => request<{ ok: boolean; deleted: boolean; softDeleted: boolean; id: string }>(`/packages/${id}`, { method: "DELETE" }),
  deleteFrame: (id: string) => request<{ ok: boolean; id: string }>(`/frames/${id}`, { method: "DELETE" }),
};
