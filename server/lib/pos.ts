import type { PosOrderItem } from "../db/schema.js";

// Pure POS rules (no I/O) so they can be unit-tested: pricing a cart, totals, cash-drawer maths, queue numbering and refunds.

/** Templates in this category are made for one customer: hidden from the kiosk picker, sold at the cashier, delivered by voucher. */
export const CUSTOM_FRAME_CATEGORY = "__custom";

export type CartLine = { type: PosOrderItem["type"]; refId?: string | null; name?: string; qty?: number; unitPrice?: number };
export type Catalog = {
  packages: Map<string, { name: string; price: number }>;
  prints: Map<string, { name: string; price: number }>; // keyed `${packageId}:${printId}` (extra-print ids are only unique within a package)
  products: Map<string, { name: string; price: number }>;
  frames: Map<string, { name: string; price: number }>; // custom frames sold at the cashier (templates in category __custom)
};

export class PosError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const money = (n: number) => Math.round(n);

/** Turn the client's cart into priced lines using the DATABASE's prices (never trust a client price, except for a free-form "custom" line). */
export function priceCart(lines: CartLine[], catalog: Catalog): PosOrderItem[] {
  if (!Array.isArray(lines) || lines.length === 0) throw new PosError("Keranjang masih kosong");
  if (lines.length > 50) throw new PosError("Terlalu banyak item dalam satu transaksi");
  return lines.map((line) => {
    const qty = Math.floor(Number(line.qty ?? 1));
    if (line.type === "frame" && qty !== 1) throw new PosError("Satu frame custom per transaksi");
    if (!Number.isFinite(qty) || qty < 1 || qty > 99) throw new PosError("Jumlah item harus antara 1 dan 99");
    if (line.type === "custom") {
      const unitPrice = money(Number(line.unitPrice));
      const name = String(line.name ?? "").trim().slice(0, 80);
      if (!name) throw new PosError("Nama item bebas wajib diisi");
      if (!Number.isFinite(unitPrice) || unitPrice <= 0 || unitPrice > 100_000_000) throw new PosError(`Harga "${name}" tidak valid`);
      return { type: "custom", refId: null, name, qty, unitPrice };
    }
    const source = line.type === "package" ? catalog.packages : line.type === "print" ? catalog.prints : line.type === "product" ? catalog.products : line.type === "frame" ? catalog.frames : null;
    if (!source) throw new PosError("Jenis item tidak dikenal");
    const found = line.refId ? source.get(String(line.refId)) : undefined;
    if (!found) throw new PosError(`Item "${line.name ?? line.refId ?? "?"}" sudah tidak tersedia`);
    return { type: line.type, refId: String(line.refId), name: found.name, qty, unitPrice: money(found.price) };
  });
}

export const subtotalOf = (items: PosOrderItem[]) => items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);

/** Amount the booth will charge for this cart: what a cash voucher must cover (packages and extra prints are paid at the kiosk). */
export const kioskPortionOf = (items: PosOrderItem[], discount = 0) => {
  const portion = items.filter((i) => i.type === "package" || i.type === "print").reduce((sum, i) => sum + i.unitPrice * i.qty, 0);
  // The discount is applied to the booth part first (that is the part a voucher pays), never below zero.
  return Math.max(0, portion - Math.min(discount, portion));
};

export function computeTotals(items: PosOrderItem[], discountInput: unknown) {
  const subtotal = subtotalOf(items);
  const discount = money(Number(discountInput) || 0);
  if (discount < 0) throw new PosError("Diskon tidak boleh negatif");
  if (discount > subtotal) throw new PosError("Diskon melebihi total belanja");
  return { subtotal, discount, total: subtotal - discount };
}

export const PAYMENT_METHODS = ["cash", "qris", "transfer", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export function settlePayment(method: unknown, total: number, cashReceivedInput: unknown) {
  if (!PAYMENT_METHODS.includes(method as PaymentMethod)) throw new PosError("Metode pembayaran tidak valid");
  if (method !== "cash") return { method: method as PaymentMethod, cashReceived: null, change: null };
  const cashReceived = money(Number(cashReceivedInput));
  if (!Number.isFinite(cashReceived) || cashReceived < total) throw new PosError("Uang diterima kurang dari total");
  return { method: "cash" as const, cashReceived, change: cashReceived - total };
}

/** What should physically be in the drawer: float + cash taken − cash handed back as refunds. */
export const expectedCash = (openingCash: number, cashSales: number, cashRefunds: number) => openingCash + cashSales - cashRefunds;

// --- numbering ---------------------------------------------------------------------------------------------------

/** YYYY-MM-DD in Indonesia's WIB (UTC+7), the "business day" for numbering and queues. */
export function wibDay(date: Date): string {
  return new Date(date.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}
export const orderNumber = (day: string, seq: number) => `KSR-${day.replaceAll("-", "")}-${String(seq).padStart(3, "0")}`;
export const queueLabel = (prefix: string, seq: number) => `${prefix || "A"}-${String(seq).padStart(3, "0")}`;

export type QueueTicket = { id: string; seq: number; status: string; customerWhatsapp: string | null; kioskKeyId: string | null };

/** Next customer to call: oldest waiting ticket, skipping anyone whose phone number is already being called/served (they are still in another booth). */
export function pickNextTicket(tickets: QueueTicket[]): QueueTicket | null {
  const busy = new Set(tickets.filter((t) => (t.status === "called" || t.status === "serving") && t.customerWhatsapp).map((t) => t.customerWhatsapp));
  return tickets
    .filter((t) => t.status === "waiting" && !(t.customerWhatsapp && busy.has(t.customerWhatsapp)))
    .sort((a, b) => a.seq - b.seq)[0] ?? null;
}

// --- refunds -----------------------------------------------------------------------------------------------------

export type RefundLine = { index: number; qty: number };

/** Refundable value of chosen lines, with the order's discount shared out proportionally; also checks nothing is refunded twice. */
export function refundAmount(order: { items: PosOrderItem[]; subtotal: number; total: number; refundedAmount: number }, lines: RefundLine[]) {
  if (!Array.isArray(lines) || lines.length === 0) throw new PosError("Pilih item yang di-refund");
  let gross = 0;
  const seen = new Set<number>();
  for (const l of lines) {
    const item = order.items[l.index];
    const qty = Math.floor(Number(l.qty));
    if (!item || seen.has(l.index)) throw new PosError("Item refund tidak valid");
    if (!Number.isFinite(qty) || qty < 1 || qty > item.qty) throw new PosError(`Jumlah refund "${item.name}" tidak valid`);
    seen.add(l.index);
    gross += item.unitPrice * qty;
  }
  const ratio = order.subtotal > 0 ? order.total / order.subtotal : 1;
  const amount = money(gross * ratio);
  if (order.refundedAmount + amount > order.total) throw new PosError("Nominal refund melebihi sisa transaksi");
  return amount;
}

export const refundStatus = (total: number, refunded: number) => (refunded <= 0 ? "paid" : refunded >= total ? "refunded" : "partial_refund");

/** A custom-frame sale: exactly one frame line, which must come with a package (the voucher pays that package at the booth). */
export function customFrameOf(items: PosOrderItem[]): { frameId: string } | null {
  const frames = items.filter((i) => i.type === "frame");
  if (frames.length === 0) return null;
  if (frames.length > 1) throw new PosError("Satu transaksi hanya boleh berisi satu frame custom");
  if (!items.some((i) => i.type === "package")) throw new PosError("Frame custom harus dibeli bersama paket foto (voucher dipakai untuk sesi paket itu)");
  return { frameId: String(frames[0].refId) };
}
