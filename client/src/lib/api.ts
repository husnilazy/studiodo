const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

export const api = {
  getPackages: () => request<any[]>("/packages"),
  createSession: (body: { packageId: string; orientation: string; boothId?: string; selectedExtras?: { id: string; name: string; price: number }[] }) =>
    request<any>("/sessions", { method: "POST", body: JSON.stringify(body) }),
  patchSession: (id: string, body: Record<string, unknown>) =>
    request<any>(`/sessions/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  uploadPhoto: async (sessionId: string, slotIndex: number, blob: Blob) => {
    const form = new FormData();
    form.append("photo", blob, `slot-${slotIndex}.jpg`);
    form.append("slotIndex", String(slotIndex));
    const res = await fetch(`${BASE}/sessions/${sessionId}/photo`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`Upload gagal: ${res.status}`);
    return res.json();
  },
  uploadMedia: async (sessionId: string, kind: "gif" | "video", blob: Blob) => {
    const form = new FormData();
    form.append("media", blob, `${kind}-${Date.now()}.webm`);
    form.append("kind", kind);
    const res = await fetch(`${BASE}/sessions/${sessionId}/media`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`Media upload gagal: ${res.status}`);
    return res.json();
  },
  finalizeSession: (id: string, body: Record<string, unknown>) =>
    request<any>(`/sessions/${id}/finalize`, { method: "POST", body: JSON.stringify(body) }),
  updateCustomer: (id: string, body: { whatsapp?: string; email?: string; publishConsent: boolean; feedback?: string }) =>
    request<any>(`/sessions/${id}/customer`, { method: "PATCH", body: JSON.stringify(body) }),
  getPublicSession: (id: string) => request<any>(`/sessions/${id}/public`),
  getCustomers: () => request<any[]>("/sessions"),
  getAdminOverview: () => request<any>("/sessions/admin/overview"),
  startQris: (sessionId: string, amount: number) =>
    request<any>("/payment/qris", { method: "POST", body: JSON.stringify({ sessionId, amount }) }),
  getPaymentStatus: (sessionId: string) => request<any>(`/payment/status/${sessionId}`),
  redeemVoucher: (sessionId: string, code: string) =>
    request<{ valid: boolean; amount: number; discount: number }>("/payment/voucher", { method: "POST", body: JSON.stringify({ sessionId, code }) }),
  getPaymentConfig: () => request<{ hasSecretKey: boolean; hasWebhookToken: boolean; demoMode: boolean }>("/config/payment"),
  updatePaymentConfig: (body: { secretKey?: string; webhookToken?: string }) =>
    request<{ ok: boolean }>("/config/payment", { method: "PATCH", body: JSON.stringify(body) }),
  getVouchers: () => request<any[]>("/vouchers"),
  createVoucher: (body: Record<string, unknown>) => request<any>("/vouchers", { method: "POST", body: JSON.stringify(body) }),
  updateVoucher: (id: string, body: Record<string, unknown>) => request<any>(`/vouchers/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteVoucher: (id: string) => request<void>(`/vouchers/${id}`, { method: "DELETE" }),
  getFrames: (orientation: string) => request<any[]>(`/frames?orientation=${orientation}`),
  createFrame: (template: { id: string; name: string; frameDataUrl: string; slots: unknown[]; canvasWidth: number; canvasHeight: number; orientation: string }) =>
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
      }),
    }),
  getPackagesAll: () => request<any[]>("/packages/all"),
  createPackage: (body: Record<string, unknown>) => request<any>("/packages", { method: "POST", body: JSON.stringify(body) }),
  updatePackage: (id: string, body: Record<string, unknown>) => request<any>(`/packages/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deletePackage: (id: string) => request<void>(`/packages/${id}`, { method: "DELETE" }),
};
