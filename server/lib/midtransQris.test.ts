import { afterEach, describe, expect, it, vi } from "vitest";
import { baseOrderId, chargeMethod } from "./midtrans.js";

const cfg = { serverKey: "SB-Mid-server-test", production: false };
const input = { midOrderId: "SDO-TEST-1-AB12", grossAmount: 449000, itemName: "Starter", customerEmail: "a@b.id", customerName: "Tenant" };
const reply = (body: object) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));

afterEach(() => vi.unstubAllGlobals());

describe("chargeMethod", () => {
  it("QRIS: sends a qris charge and returns the QR payload, expiry read as WIB", async () => {
    const f = reply({ status_code: "201", qr_string: "000201010212", expiry_time: "2026-11-08 22:00:00" });
    vi.stubGlobal("fetch", f);
    const out = await chargeMethod(cfg, "qris", input);
    expect(out).toMatchObject({ method: "qris", qrString: "000201010212", expiresAt: "2026-11-08T15:00:00.000Z", midOrderId: "SDO-TEST-1-AB12" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.sandbox.midtrans.com/v2/charge");
    const sent = JSON.parse(String(init.body));
    expect(sent.payment_type).toBe("qris");
    expect(sent.transaction_details).toEqual({ order_id: "SDO-TEST-1-AB12", gross_amount: 449000 });
  });

  it("virtual account: asks for the chosen bank and reads the VA number", async () => {
    const f = reply({ status_code: "201", va_numbers: [{ bank: "bca", va_number: "812345678901" }] });
    vi.stubGlobal("fetch", f);
    const out = await chargeMethod(cfg, "bca", input);
    expect(out).toMatchObject({ method: "bca", bank: "bca", vaNumber: "812345678901" });
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toMatchObject({ payment_type: "bank_transfer", bank_transfer: { bank: "bca" } });
  });

  it("Permata answers with permata_va_number", async () => {
    vi.stubGlobal("fetch", reply({ status_code: "201", permata_va_number: "8988123456" }));
    expect((await chargeMethod(cfg, "permata", input)).vaNumber).toBe("8988123456");
  });

  it("Mandiri Bill: reads biller code and bill key", async () => {
    vi.stubGlobal("fetch", reply({ status_code: "201", biller_code: "70012", bill_key: "990123456789" }));
    expect(await chargeMethod(cfg, "mandiri", input)).toMatchObject({ billerCode: "70012", billKey: "990123456789" });
  });

  it("Alfamart: reads the payment code", async () => {
    vi.stubGlobal("fetch", reply({ status_code: "201", payment_code: "1234567890123456", store: "alfamart" }));
    expect(await chargeMethod(cfg, "alfamart", input)).toMatchObject({ paymentCode: "1234567890123456", store: "alfamart" });
  });

  it("throws Midtrans' message when the channel is refused, so the page can show it", async () => {
    vi.stubGlobal("fetch", reply({ status_code: "402", status_message: "Payment channel is not activated." }));
    await expect(chargeMethod(cfg, "qris", input)).rejects.toThrow("not activated");
  });

  it("throws when the expected payment detail is missing", async () => {
    vi.stubGlobal("fetch", reply({ status_code: "201" }));
    await expect(chargeMethod(cfg, "qris", input)).rejects.toThrow("kode QRIS");
    await expect(chargeMethod(cfg, "bni", input)).rejects.toThrow("Virtual Account");
  });
});

describe("baseOrderId", () => {
  it("strips the per-charge suffix and leaves plain order ids alone", () => {
    expect(baseOrderId("SDO-MW6M83PB-CCB083-2F9A")).toBe("SDO-MW6M83PB-CCB083");
    expect(baseOrderId("SDO-MW6M83PB-CCB083")).toBe("SDO-MW6M83PB-CCB083");
  });
});
