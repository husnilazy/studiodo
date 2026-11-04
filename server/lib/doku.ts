import crypto from "node:crypto";

// DOKU Checkout (hosted payment page) client for a tenant's kiosk sales. The kiosk shows the returned checkout URL as a
// QR code; the customer scans it and pays with QRIS / e-wallet / virtual account on DOKU's page, and DOKU then calls our
// notification URL. Signing follows DOKU's "Non-SNAP" scheme: HMAC-SHA256 over
//   Client-Id / Request-Id / Request-Timestamp / Request-Target [/ Digest]  joined by "\n", Base64, prefixed "HMACSHA256=".

export type DokuSnapCfg = { merchantId: string; terminalId: string; postalCode: string; privateKeyPem: string };
export type DokuCfg = { clientId: string; secretKey: string; production: boolean; snap?: DokuSnapCfg };

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

// ---------------------------------------------------------------------------------------------------------------------
// SNAP QRIS MPM: a real, dynamic QRIS code (qrContent) that any bank / e-wallet app can scan — unlike Checkout, whose "QR" is a
// link to DOKU's pay page. Auth is two-step: an RSA-signed B2B access token (public half registered at DOKU as the "Merchant
// Public Key"), then HMAC-SHA512 signed calls carrying that token. Field names follow developers.doku.com (SNAP QRIS guide).
// ---------------------------------------------------------------------------------------------------------------------

const snapTimestamp = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function dokuB2bToken(cfg: DokuCfg): Promise<string> {
  if (!cfg.snap) throw new Error("Pengaturan QRIS langsung DOKU belum lengkap");
  const cached = tokenCache.get(cfg.clientId);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;
  const timestamp = snapTimestamp();
  const signature = crypto.sign("RSA-SHA256", Buffer.from(`${cfg.clientId}|${timestamp}`), cfg.snap.privateKeyPem).toString("base64");
  const res = await fetch(`${base(cfg)}/authorization/v1/access-token/b2b`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CLIENT-KEY": cfg.clientId, "X-TIMESTAMP": timestamp, "X-SIGNATURE": signature },
    body: JSON.stringify({ grantType: "client_credentials" }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as { accessToken?: string; expiresIn?: string | number; responseMessage?: string; responseCode?: string };
  if (!res.ok || !json.accessToken) throw new Error(`Token DOKU ditolak: ${json.responseMessage || "tanpa pesan"} (${json.responseCode ?? res.status}) — pastikan Merchant Public Key terdaftar di DOKU`);
  tokenCache.set(cfg.clientId, { token: json.accessToken, expiresAt: Date.now() + (Number(json.expiresIn) || 900) * 1000 });
  return json.accessToken;
}

/** HMAC-SHA512 over METHOD:PATH:TOKEN:lowercase-hex-SHA256(body):TIMESTAMP, per the SNAP symmetric signature spec. */
export function signDokuSnap(secretKey: string, method: string, path: string, token: string, body: string, timestamp: string): string {
  const bodyHash = crypto.createHash("sha256").update(body).digest("hex").toLowerCase();
  return crypto.createHmac("sha512", secretKey).update(`${method}:${path}:${token}:${bodyHash}:${timestamp}`).digest("base64");
}

async function snapPost<T>(cfg: DokuCfg, path: string, payload: unknown): Promise<{ status: number; json: T & { responseCode?: string; responseMessage?: string } }> {
  const token = await dokuB2bToken(cfg);
  const body = JSON.stringify(payload);
  const timestamp = snapTimestamp();
  const res = await fetch(`${base(cfg)}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-PARTNER-ID": cfg.clientId,
      "X-EXTERNAL-ID": `${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`,
      "X-TIMESTAMP": timestamp,
      "X-SIGNATURE": signDokuSnap(cfg.secretKey, "POST", path, token, body, timestamp),
      "CHANNEL-ID": "H2H",
    },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as T & { responseCode?: string; responseMessage?: string } };
}

/** WIB (UTC+7) ISO-8601 timestamp `minutes` from now, e.g. 2026-11-04T23:15:00+07:00 — how DOKU wants validityPeriod. */
function wibIn(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000 + 7 * 3_600_000).toISOString().replace(/\.\d{3}Z$/, "+07:00");
}

/** Creates a dynamic QRIS. Returns the raw QRIS string (draw it as a QR) and DOKU's reference number (needed to query status). */
export async function createDokuQris(cfg: DokuCfg, input: { partnerReferenceNo: string; amount: number; validityMinutes?: number }): Promise<{ qrContent: string; referenceNo: string }> {
  if (!cfg.snap) throw new Error("Pengaturan QRIS langsung DOKU belum lengkap");
  const { status, json } = await snapPost<{ qrContent?: string; referenceNo?: string }>(cfg, "/snap-adapter/b2b/v1.0/qr/qr-mpm-generate", {
    partnerReferenceNo: input.partnerReferenceNo.slice(0, 64),
    amount: { value: `${Math.round(input.amount)}.00`, currency: "IDR" },
    merchantId: cfg.snap.merchantId,
    terminalId: cfg.snap.terminalId,
    validityPeriod: wibIn(input.validityMinutes ?? 15),
    additionalInfo: { postalCode: cfg.snap.postalCode, feeType: "1" },
  });
  if (status >= 400 || !json.qrContent) {
    throw new Error(`${json.responseMessage || "DOKU menolak permintaan QRIS"} (kode ${json.responseCode ?? status}, ${cfg.production ? "produksi" : "sandbox"})`);
  }
  return { qrContent: json.qrContent, referenceNo: json.referenceNo ?? "" };
}

/** Asks DOKU for the state of a dynamic QRIS. paid = latestTransactionStatus "00" (SNAP: 00 success, 03 pending, 06 failed ...). */
export async function queryDokuQris(cfg: DokuCfg, ref: { partnerReferenceNo: string; referenceNo: string }): Promise<{ paid: boolean; status: string }> {
  if (!cfg.snap) return { paid: false, status: "" };
  try {
    const { json } = await snapPost<{ latestTransactionStatus?: string }>(cfg, "/snap-adapter/b2b/v1.0/qr/qr-mpm-query", {
      originalReferenceNo: ref.referenceNo,
      originalPartnerReferenceNo: ref.partnerReferenceNo,
      serviceCode: "47",
      merchantId: cfg.snap.merchantId,
    });
    const status = String(json.latestTransactionStatus ?? "");
    return { paid: status === "00", status };
  } catch {
    return { paid: false, status: "" };
  }
}
