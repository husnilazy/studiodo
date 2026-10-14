import { describe, expect, it } from "vitest";
import { PosError, computeTotals, expectedCash, kioskPortionOf, orderNumber, pickNextTicket, priceCart, queueLabel, refundAmount, refundStatus, settlePayment, wibDay, type Catalog } from "./pos.js";

const catalog: Catalog = {
  packages: new Map([["pk1", { name: "Strip", price: 25000 }]]),
  prints: new Map([["pr1", { name: "Cetak +1", price: 10000 }]]),
  products: new Map([["pd1", { name: "Es Teh", price: 8000 }]]),
};

describe("priceCart", () => {
  it("uses catalog prices, ignoring any client price", () => {
    const items = priceCart([{ type: "package", refId: "pk1", qty: 2, unitPrice: 1 }, { type: "product", refId: "pd1" }], catalog);
    expect(items).toEqual([
      { type: "package", refId: "pk1", name: "Strip", qty: 2, unitPrice: 25000 },
      { type: "product", refId: "pd1", name: "Es Teh", qty: 1, unitPrice: 8000 },
    ]);
  });
  it("accepts a custom line with its own price and rejects bad input", () => {
    expect(priceCart([{ type: "custom", name: "Sewa properti", unitPrice: 15000 }], catalog)[0].unitPrice).toBe(15000);
    expect(() => priceCart([], catalog)).toThrow(PosError);
    expect(() => priceCart([{ type: "package", refId: "nope" }], catalog)).toThrow(/tidak tersedia/);
    expect(() => priceCart([{ type: "product", refId: "pd1", qty: 0 }], catalog)).toThrow(/Jumlah/);
    expect(() => priceCart([{ type: "custom", name: "", unitPrice: 5 }], catalog)).toThrow(/Nama/);
  });
});

describe("totals and payment", () => {
  const items = priceCart([{ type: "package", refId: "pk1", qty: 2 }, { type: "product", refId: "pd1" }], catalog);
  it("computes totals and rejects an oversized discount", () => {
    expect(computeTotals(items, 5000)).toEqual({ subtotal: 58000, discount: 5000, total: 53000 });
    expect(() => computeTotals(items, 99999)).toThrow(/melebihi/);
  });
  it("gives change for cash and rejects short cash", () => {
    expect(settlePayment("cash", 53000, 60000)).toEqual({ method: "cash", cashReceived: 60000, change: 7000 });
    expect(() => settlePayment("cash", 53000, 50000)).toThrow(/kurang/);
    expect(settlePayment("qris", 53000, undefined).change).toBeNull();
    expect(() => settlePayment("bitcoin", 1, 1)).toThrow(/tidak valid/);
  });
  it("sizes the kiosk voucher to the booth part only, after discount", () => {
    expect(kioskPortionOf(items, 0)).toBe(50000);
    expect(kioskPortionOf(items, 5000)).toBe(45000);
    expect(kioskPortionOf(priceCart([{ type: "product", refId: "pd1" }], catalog), 0)).toBe(0);
  });
});

describe("cash drawer and numbering", () => {
  it("expects float + cash sales − cash refunds", () => expect(expectedCash(100000, 250000, 20000)).toBe(330000));
  it("uses the WIB business day", () => {
    expect(wibDay(new Date("2026-10-13T20:00:00Z"))).toBe("2026-10-14"); // 03:00 WIB next day
    expect(wibDay(new Date("2026-10-13T10:00:00Z"))).toBe("2026-10-13");
  });
  it("formats order numbers and queue labels", () => {
    expect(orderNumber("2026-10-14", 7)).toBe("KSR-20261014-007");
    expect(queueLabel("B", 12)).toBe("B-012");
    expect(queueLabel("", 3)).toBe("A-003");
  });
});

describe("queue", () => {
  const t = (seq: number, status: string, wa: string | null = null) => ({ id: `t${seq}`, seq, status, customerWhatsapp: wa, kioskKeyId: null });
  it("calls the oldest waiting ticket", () => expect(pickNextTicket([t(2, "waiting"), t(1, "waiting"), t(3, "done")])?.id).toBe("t1"));
  it("skips someone who is still being served elsewhere", () => {
    expect(pickNextTicket([t(1, "serving", "0811"), t(2, "waiting", "0811"), t(3, "waiting", "0822")])?.id).toBe("t3");
  });
  it("returns null when nobody is waiting", () => expect(pickNextTicket([t(1, "done")])).toBeNull());
});

describe("refunds", () => {
  const order = { items: priceCart([{ type: "package", refId: "pk1", qty: 2 }, { type: "product", refId: "pd1" }], catalog), subtotal: 58000, total: 52200, refundedAmount: 0 }; // 10% off
  it("shares the discount proportionally", () => expect(refundAmount(order, [{ index: 1, qty: 1 }])).toBe(7200));
  it("refuses over-refunds, repeats and bad lines", () => {
    expect(() => refundAmount({ ...order, refundedAmount: 50000 }, [{ index: 0, qty: 1 }])).toThrow(/melebihi/);
    expect(() => refundAmount(order, [{ index: 0, qty: 3 }])).toThrow(/Jumlah/);
    expect(() => refundAmount(order, [{ index: 9, qty: 1 }])).toThrow(/tidak valid/);
    expect(() => refundAmount(order, [{ index: 0, qty: 1 }, { index: 0, qty: 1 }])).toThrow(/tidak valid/);
    expect(() => refundAmount(order, [])).toThrow();
  });
  it("derives the order status", () => {
    expect(refundStatus(100, 0)).toBe("paid");
    expect(refundStatus(100, 40)).toBe("partial_refund");
    expect(refundStatus(100, 100)).toBe("refunded");
  });
});
