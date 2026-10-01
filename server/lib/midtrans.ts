import crypto from "node:crypto";

// Midtrans Snap client for STUDIODO's own subscription billing (tenants paying the platform).
// Deliberately separate from the Xendit setup in routes/payment.ts, which is a tenant's kiosk collecting
// money from its own customers. Credentials come from lib/gateways.ts (Superadmin settings, with env fallback);
// nothing in here reads process.env directly.

export type MidtransCfg = { serverKey: string; production: boolean };

const snapBase = (cfg: MidtransCfg) => (cfg.production ? "https://app.midtrans.com" : "https://app.sandbox.midtrans.com");
const coreBase = (cfg: MidtransCfg) => (cfg.production ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com");
const basicAuth = (cfg: MidtransCfg) => `Basic ${Buffer.from(`${cfg.serverKey}:`).toString("base64")}`;

export type SnapTransaction = { token: string; redirectUrl: string };

export async function createSnapTransaction(
  cfg: MidtransCfg,
  input: {
    orderId: string;
    grossAmount: number; // whole rupiah — Midtrans rejects decimals for IDR
    itemName: string;
    customerEmail: string;
    customerName: string;
    finishUrl?: string;
  },
): Promise<SnapTransaction> {
  const res = await fetch(`${snapBase(cfg)}/snap/v1/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: basicAuth(cfg) },
    body: JSON.stringify({
      transaction_details: { order_id: input.orderId, gross_amount: input.grossAmount },
      item_details: [{ id: input.orderId, price: input.grossAmount, quantity: 1, name: input.itemName.slice(0, 50) }],
      customer_details: { first_name: input.customerName.slice(0, 50), email: input.customerEmail },
      ...(input.finishUrl ? { callbacks: { finish: input.finishUrl } } : {}),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as { token?: string; redirect_url?: string; error_messages?: string[] };
  if (!res.ok || !body.token || !body.redirect_url) {
    throw new Error(body.error_messages?.join("; ") || `Midtrans menolak permintaan (HTTP ${res.status})`);
  }
  return { token: body.token, redirectUrl: body.redirect_url };
}

/**
 * Verifies the credentials without creating anything: asks for the status of an order that cannot exist.
 * Valid key → Midtrans answers 404 ("transaction doesn't exist"); wrong key or wrong environment → 401.
 */
export async function testMidtrans(cfg: MidtransCfg): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`${coreBase(cfg)}/v2/studiodo-connection-test-${Date.now()}/status`, {
      headers: { Accept: "application/json", Authorization: basicAuth(cfg) },
      signal: AbortSignal.timeout(15_000),
    });
    // Midtrans' Core API often answers HTTP 200 and puts the real outcome in the JSON body's status_code
    // ("404" = no such order, "401" = bad credentials), so read that first and fall back to the HTTP status.
    const body = (await res.json().catch(() => ({}))) as { status_code?: string | number };
    const code = Number(body.status_code ?? res.status);
    const mode = cfg.production ? "produksi" : "sandbox";
    if (code === 404) return { ok: true, message: `Kunci valid untuk mode ${mode}.` };
    if (code === 401) return { ok: false, message: `Kunci ditolak Midtrans. Pastikan Server Key sesuai dengan mode ${mode}.` };
    return { ok: false, message: `Respons tak terduga dari Midtrans (HTTP ${res.status}, kode ${Number.isFinite(code) ? code : "?"}).` };
  } catch (e) {
    return { ok: false, message: `Tidak dapat menghubungi Midtrans: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export type MidtransNotification = {
  order_id?: string;
  status_code?: string;
  gross_amount?: string;
  signature_key?: string;
  transaction_status?: string;
  fraud_status?: string;
  payment_type?: string;
};

/** Midtrans signs notifications as SHA512(order_id + status_code + gross_amount + server_key). */
export function verifyNotificationSignature(serverKey: string, n: MidtransNotification): boolean {
  if (!n.order_id || !n.status_code || !n.gross_amount || !n.signature_key) return false;
  const expected = crypto.createHash("sha512").update(`${n.order_id}${n.status_code}${n.gross_amount}${serverKey}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(n.signature_key));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export type OrderOutcome = "paid" | "failed" | "expired" | "pending";

export function outcomeFromNotification(n: MidtransNotification): OrderOutcome {
  switch (n.transaction_status) {
    case "settlement":
      return "paid";
    case "capture":
      return n.fraud_status === "challenge" ? "pending" : "paid";
    case "expire":
      return "expired";
    case "deny":
    case "cancel":
    case "failure":
      return "failed";
    default:
      return "pending";
  }
}
