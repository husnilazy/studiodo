import crypto from "node:crypto";

// Midtrans Snap client for STUDIODO's own subscription billing (tenants paying the
// platform). Deliberately separate from the Xendit setup in routes/payment.ts,
// which is a tenant's kiosk collecting money from its own customers.
//
// Configured only through env: MIDTRANS_SERVER_KEY (required to enable online
// payment) and MIDTRANS_IS_PRODUCTION=true for the live endpoint (default sandbox).

export function isMidtransConfigured(): boolean {
  return !!process.env.MIDTRANS_SERVER_KEY;
}

function serverKey(): string {
  const key = process.env.MIDTRANS_SERVER_KEY;
  if (!key) throw new Error("MIDTRANS_SERVER_KEY belum diatur");
  return key;
}

function snapBase(): string {
  return process.env.MIDTRANS_IS_PRODUCTION === "true" ? "https://app.midtrans.com" : "https://app.sandbox.midtrans.com";
}

export type SnapTransaction = { token: string; redirectUrl: string };

export async function createSnapTransaction(input: {
  orderId: string;
  grossAmount: number; // whole rupiah — Midtrans rejects decimals for IDR
  itemName: string;
  customerEmail: string;
  customerName: string;
  finishUrl?: string;
}): Promise<SnapTransaction> {
  const res = await fetch(`${snapBase()}/snap/v1/transactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${serverKey()}:`).toString("base64")}`,
    },
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
export function verifyNotificationSignature(n: MidtransNotification): boolean {
  if (!n.order_id || !n.status_code || !n.gross_amount || !n.signature_key) return false;
  const expected = crypto.createHash("sha512").update(`${n.order_id}${n.status_code}${n.gross_amount}${serverKey()}`).digest("hex");
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
