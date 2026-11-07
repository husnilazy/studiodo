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
    unfinishUrl?: string;
    errorUrl?: string;
  },
): Promise<SnapTransaction> {
  const res = await fetch(`${snapBase(cfg)}/snap/v1/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: basicAuth(cfg) },
    body: JSON.stringify({
      transaction_details: { order_id: input.orderId, gross_amount: input.grossAmount },
      item_details: [{ id: input.orderId, price: input.grossAmount, quantity: 1, name: input.itemName.slice(0, 50) }],
      customer_details: { first_name: input.customerName.slice(0, 50), email: input.customerEmail },
      // The payment page stays open for 24h (the same window the invoice shows as its due time).
      expiry: { unit: "hours", duration: 24 },
      ...(input.finishUrl ? { callbacks: { finish: input.finishUrl, ...(input.unfinishUrl ? { unfinish: input.unfinishUrl } : {}), ...(input.errorUrl ? { error: input.errorUrl } : {}) } } : {}),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as { token?: string; redirect_url?: string; error_messages?: string[] };
  if (!res.ok || !body.token || !body.redirect_url) {
    throw new Error(body.error_messages?.join("; ") || `Midtrans menolak permintaan (HTTP ${res.status})`);
  }
  return { token: body.token, redirectUrl: body.redirect_url };
}

// --- STUDIODO's own payment page: the tenant picks a method there and each one is charged through the Core API ---

export type PayMethodId = "qris" | "bca" | "bni" | "bri" | "permata" | "cimb" | "mandiri" | "alfamart" | "indomaret";
export const PAY_METHODS: { id: PayMethodId; label: string; hint: string; kind: "qris" | "va" | "bill" | "store" }[] = [
  { id: "qris", label: "QRIS", hint: "GoPay, OVO, DANA, ShopeePay, LinkAja, dan m-banking", kind: "qris" },
  { id: "bca", label: "BCA Virtual Account", hint: "Transfer lewat ATM, m-BCA, atau KlikBCA", kind: "va" },
  { id: "bni", label: "BNI Virtual Account", hint: "Transfer lewat ATM atau mobile banking BNI", kind: "va" },
  { id: "bri", label: "BRI Virtual Account", hint: "Transfer lewat ATM, BRImo, atau internet banking", kind: "va" },
  { id: "permata", label: "Permata Virtual Account", hint: "Transfer lewat ATM atau PermataMobile", kind: "va" },
  { id: "cimb", label: "CIMB Niaga Virtual Account", hint: "Transfer lewat ATM atau OCTO Mobile", kind: "va" },
  { id: "mandiri", label: "Mandiri Bill", hint: "Bayar lewat ATM atau Livin' by Mandiri", kind: "bill" },
  { id: "alfamart", label: "Alfamart", hint: "Bayar tunai di kasir dengan kode pembayaran", kind: "store" },
  { id: "indomaret", label: "Indomaret", hint: "Bayar tunai di kasir dengan kode pembayaran", kind: "store" },
];
export const isPayMethod = (v: unknown): v is PayMethodId => PAY_METHODS.some((m) => m.id === v);

/** What the tenant needs to complete a payment, shown on the pay page. Only the fields that apply to the method are set. */
export type PayInstruction = {
  method: PayMethodId;
  midOrderId: string; // the order_id Midtrans knows this charge by (a suffix on our order id, new for every method switch)
  expiresAt: string | null;
  qrString?: string;
  qrImage?: string; // data URL, for GoPay-QRIS charges that return a picture instead of the QR text
  bank?: string;
  vaNumber?: string;
  billerCode?: string;
  billKey?: string;
  paymentCode?: string;
  store?: string;
};

/** Our order id with the per-charge suffix removed ("SDO-AB-CD-2F" → "SDO-AB-CD"). Notifications carry the charge's id. */
export const baseOrderId = (midOrderId: string) => midOrderId.replace(/^(SDO-[A-Z0-9]+-[A-Z0-9]+)-[A-Z0-9]{1,4}$/, "$1");

type ChargeBody = {
  status_code?: string; status_message?: string; expiry_time?: string;
  qr_string?: string; actions?: { name?: string; url?: string }[];
  va_numbers?: { bank?: string; va_number?: string }[]; permata_va_number?: string;
  biller_code?: string; bill_key?: string;
  payment_code?: string; store?: string;
};

/**
 * Charges one payment method through the Core API. Throws when Midtrans refuses (e.g. the channel is not activated on the
 * merchant account); the pay page shows the message and the tenant can pick another method.
 */
export async function chargeMethod(
  cfg: MidtransCfg,
  method: PayMethodId,
  input: { midOrderId: string; grossAmount: number; itemName: string; customerEmail: string; customerName: string },
): Promise<PayInstruction> {
  const post = async (spec: Record<string, unknown>) => {
    const res = await fetch(`${coreBase(cfg)}/v2/charge`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: basicAuth(cfg) },
      body: JSON.stringify({
        ...spec,
        transaction_details: { order_id: input.midOrderId, gross_amount: input.grossAmount },
        item_details: [{ id: input.midOrderId, price: input.grossAmount, quantity: 1, name: input.itemName.slice(0, 50) }],
        customer_details: { first_name: input.customerName.slice(0, 50), email: input.customerEmail },
        custom_expiry: { expiry_duration: 24, unit: "hour" },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    return { res, b: (await res.json().catch(() => ({}))) as ChargeBody };
  };
  const spec: Record<string, unknown> =
    method === "qris" ? { payment_type: "qris", qris: { acquirer: "gopay" } }
    : method === "mandiri" ? { payment_type: "echannel", echannel: { bill_info1: "Pembayaran:", bill_info2: "Langganan STUDIODO" } }
    : method === "alfamart" || method === "indomaret" ? { payment_type: "cstore", cstore: { store: method, message: "Langganan STUDIODO" } }
    : { payment_type: "bank_transfer", bank_transfer: { bank: method } };
  let { res, b } = await post(spec);
  // Many accounts only have "GoPay QRIS" switched on (what Snap shows as one QR for every e-wallet): when plain QRIS is refused, try that.
  if (method === "qris" && Number(b.status_code ?? res.status) !== 201 && /not activated/i.test(String(b.status_message ?? ""))) {
    ({ res, b } = await post({ payment_type: "gopay", gopay: { enable_callback: false } }));
  }
  const code = Number(b.status_code ?? res.status);
  if (code !== 201 && code !== 200) throw new Error(b.status_message || `Midtrans menolak metode ini (HTTP ${res.status}, kode ${code})`);
  // expiry_time comes as "YYYY-MM-DD HH:mm:ss" in WIB (UTC+7).
  const exp = b.expiry_time ? new Date(b.expiry_time.replace(" ", "T") + "+07:00") : null;
  const out: PayInstruction = { method, midOrderId: input.midOrderId, expiresAt: exp && !Number.isNaN(exp.getTime()) ? exp.toISOString() : null };
  if (method === "qris") {
    if (b.qr_string) {
      out.qrString = b.qr_string;
    } else {
      // GoPay charges answer with a link to the QR picture instead of its text: fetch it so the page can show it without leaving STUDIODO.
      const link = b.actions?.find((a) => a.name === "generate-qr-code")?.url;
      if (!link || !/^https:\/\/api\.(sandbox\.)?midtrans\.com\//.test(link)) throw new Error("Midtrans tidak mengirim kode QRIS");
      const img = await fetch(link, { signal: AbortSignal.timeout(15_000) });
      const type = img.headers.get("content-type") ?? "";
      if (!img.ok || !type.startsWith("image/")) throw new Error("Gambar kode QRIS dari Midtrans tidak dapat diambil");
      out.qrImage = `data:${type};base64,${Buffer.from(await img.arrayBuffer()).toString("base64")}`;
    }
  } else if (method === "mandiri") {
    if (!b.biller_code || !b.bill_key) throw new Error("Midtrans tidak mengirim kode Mandiri Bill");
    out.billerCode = b.biller_code;
    out.billKey = b.bill_key;
  } else if (method === "alfamart" || method === "indomaret") {
    if (!b.payment_code) throw new Error("Midtrans tidak mengirim kode pembayaran");
    out.paymentCode = b.payment_code;
    out.store = b.store ?? method;
  } else {
    const va = b.permata_va_number ?? b.va_numbers?.[0]?.va_number;
    if (!va) throw new Error("Midtrans tidak mengirim nomor Virtual Account");
    out.bank = method;
    out.vaNumber = va;
  }
  return out;
}

/** Best effort: closes a charge the tenant abandoned when they switch method, so it cannot be paid later by mistake. */
export async function cancelCharge(cfg: MidtransCfg, midOrderId: string): Promise<void> {
  try {
    await fetch(`${coreBase(cfg)}/v2/${encodeURIComponent(midOrderId)}/cancel`, { method: "POST", headers: { Accept: "application/json", Authorization: basicAuth(cfg) }, signal: AbortSignal.timeout(10_000) });
  } catch { /* the charge simply expires by itself */ }
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

/** Asks Midtrans for an order's current state (same shape as a notification, minus the signature). Null = no such order yet. */
export async function fetchMidtransStatus(cfg: MidtransCfg, orderId: string): Promise<MidtransNotification | null> {
  const res = await fetch(`${coreBase(cfg)}/v2/${encodeURIComponent(orderId)}/status`, {
    headers: { Accept: "application/json", Authorization: basicAuth(cfg) },
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as MidtransNotification & { status_message?: string };
  const code = Number(body.status_code ?? res.status);
  if (code === 404) return null; // the customer never opened the payment page
  if (code === 401) throw new Error("Midtrans menolak Server Key (periksa kunci dan mode sandbox/produksi)");
  if (!body.transaction_status) throw new Error(body.status_message || `Respons tak terduga dari Midtrans (HTTP ${res.status})`);
  return body;
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
