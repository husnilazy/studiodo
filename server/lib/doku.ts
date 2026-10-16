import crypto from "node:crypto";

// DOKU Checkout (hosted payment page) client for a tenant's kiosk sales. The kiosk shows the returned checkout URL as a
// QR code; the customer scans it and pays with QRIS / e-wallet / virtual account on DOKU's page, and DOKU then calls our
// notification URL. Signing follows DOKU's "Non-SNAP" scheme: HMAC-SHA256 over
//   Client-Id / Request-Id / Request-Timestamp / Request-Target [/ Digest]  joined by "\n", Base64, prefixed "HMACSHA256=".

export type DokuCfg = { clientId: string; secretKey: string; production: boolean };

const base = (cfg: DokuCfg) => (cfg.production ? "https://api.doku.com" : "https://api-sandbox.doku.com");

export function signDoku(secretKey: string, parts: { clientId: string; requestId: string; timestamp: string; target: string; body?: string }): string {
  const lines = [`Client-Id:${parts.clientId}`, `Request-Id:${parts.requestId}`, `Request-Timestamp:${parts.timestamp}`, `Request-Target:${parts.target}`];
  if (parts.body !== undefined) lines.push(`Digest:${crypto.createHash("sha256").update(parts.body).digest("base64")}`);
  return `HMACSHA256=${crypto.createHmac("sha256", secretKey).update(lines.join("\n")).digest("base64")}`;
}

function headers(cfg: DokuCfg, target: string, body?: string) {
  const requestId = crypto.randomUUID();
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  return {
    "Content-Type": "application/json",
    "Client-Id": cfg.clientId,
    "Request-Id": requestId,
    "Request-Timestamp": timestamp,
    Signature: signDoku(cfg.secretKey, { clientId: cfg.clientId, requestId, timestamp, target, body }),
  };
}

export async function createDokuCheckout(
  cfg: DokuCfg,
  input: { invoiceNumber: string; amount: number; dueMinutes?: number; notificationUrl?: string },
): Promise<{ url: string; tokenId?: string }> {
  const target = "/checkout/v1/payment";
  const body = JSON.stringify({
    order: { amount: Math.round(input.amount), invoice_number: input.invoiceNumber.slice(0, 64) },
    payment: { payment_due_date: input.dueMinutes ?? 15 },
    ...(input.notificationUrl ? { additional_info: { override_notification_url: input.notificationUrl } } : {}),
  });
  const res = await fetch(`${base(cfg)}${target}`, { method: "POST", headers: headers(cfg, target, body), body, signal: AbortSignal.timeout(20_000) });
  const json = (await res.json().catch(() => ({}))) as { response?: { payment?: { url?: string; token_id?: string } }; error_messages?: string[]; message?: string[] | string; error?: { message?: string; code?: string } | string };
  const url = json.response?.payment?.url;
  if (!res.ok || !url) {
    const detail = json.error_messages?.join("; ")
      || (Array.isArray(json.message) ? json.message.join("; ") : json.message)
      || (typeof json.error === "string" ? json.error : json.error?.message);
    throw new Error(`${detail || "DOKU menolak permintaan"} (HTTP ${res.status}, ${cfg.production ? "produksi" : "sandbox"})`);
  }
  return { url, tokenId: json.response?.payment?.token_id };
}

/** Best-effort status lookup (used as a fallback when the notification is slow/missed). true = paid. */
export async function dokuInvoicePaid(cfg: DokuCfg, invoiceNumber: string): Promise<boolean> {
  const target = `/orders/v1/status/${encodeURIComponent(invoiceNumber)}`;
  try {
    const res = await fetch(`${base(cfg)}${target}`, { headers: headers(cfg, target), signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return false;
    const json = (await res.json().catch(() => ({}))) as { transaction?: { status?: string } };
    return String(json.transaction?.status ?? "").toUpperCase() === "SUCCESS";
  } catch {
    return false;
  }
}

/** Verifies an incoming notification: headers come from DOKU, target is the path of OUR notification URL, body must be the raw bytes. */
export function verifyDokuNotification(secretKey: string, h: { clientId?: string; requestId?: string; timestamp?: string; signature?: string }, target: string, rawBody: string): boolean {
  if (!h.clientId || !h.requestId || !h.timestamp || !h.signature) return false;
  const expected = signDoku(secretKey, { clientId: h.clientId, requestId: h.requestId, timestamp: h.timestamp, target, body: rawBody });
  const a = Buffer.from(expected);
  const b = Buffer.from(h.signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function testDoku(cfg: DokuCfg): Promise<{ ok: boolean; message: string }> {
  // A lookup for an invoice that cannot exist: valid credentials get a "not found" style answer, bad ones a 401/403.
  const target = `/orders/v1/status/studiodo-connection-test-${Date.now()}`;
  try {
    const res = await fetch(`${base(cfg)}${target}`, { headers: headers(cfg, target), signal: AbortSignal.timeout(15_000) });
    if (res.status === 401 || res.status === 403) return { ok: false, message: "Client ID / Secret Key ditolak DOKU. Pastikan sesuai mode (sandbox/produksi)." };
    return { ok: true, message: `Kredensial diterima DOKU (mode ${cfg.production ? "produksi" : "sandbox"}).` };
  } catch (error) {
    return { ok: false, message: `Tidak dapat menghubungi DOKU: ${error instanceof Error ? error.message : String(error)}` };
  }
}
