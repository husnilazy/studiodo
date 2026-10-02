import { describe, expect, it } from "vitest";
import { activeDiscountPercent, computePlanPricing, priceForInterval } from "./planPricing.js";

const now = new Date("2026-10-02T00:00:00Z");
const monthly = { price: "350000", billingInterval: "monthly" };

describe("computePlanPricing", () => {
  it("returns the plain list price when there is no discount or yearly option", () => {
    const p = computePlanPricing(monthly, now);
    expect(p.monthly).toMatchObject({ list: 350000, final: 350000, discountPercent: 0, perMonth: 350000 });
    expect(p.yearly).toBeNull();
    expect(p.yearlySavingsPercent).toBe(0);
  });

  it("applies a promo discount to the monthly price", () => {
    const p = computePlanPricing({ ...monthly, discountPercent: 20 }, now);
    expect(p.monthly).toMatchObject({ list: 350000, final: 280000, discountPercent: 20 });
    expect(p.activeDiscountPercent).toBe(20);
  });

  it("ignores a promo whose end date has passed, and keeps one that has not", () => {
    expect(activeDiscountPercent({ discountPercent: 20, discountEndsAt: "2026-10-01T00:00:00Z" }, now)).toBe(0);
    expect(activeDiscountPercent({ discountPercent: 20, discountEndsAt: "2026-10-31T00:00:00Z" }, now)).toBe(20);
    expect(computePlanPricing({ ...monthly, discountPercent: 20, discountEndsAt: "2026-10-01T00:00:00Z" }, now).monthly?.final).toBe(350000);
  });

  it("builds the yearly option from twelve months minus the yearly discount", () => {
    const p = computePlanPricing({ ...monthly, yearlyDiscountPercent: 20 }, now);
    expect(p.yearly).toMatchObject({ list: 4200000, final: 3360000, perMonth: 280000 });
    expect(p.yearlySavingsPercent).toBe(20);
  });

  it("stacks the promo and the yearly discount, and reports the real saving against the list price", () => {
    const p = computePlanPricing({ ...monthly, discountPercent: 10, yearlyDiscountPercent: 20 }, now);
    // 350000 -> 315000 monthly; yearly = 315000 * 12 * 0.8 = 3024000 against a 4200000 list price
    expect(p.monthly?.final).toBe(315000);
    expect(p.yearly?.final).toBe(3024000);
    expect(p.yearly?.discountPercent).toBe(28);
    expect(p.yearlySavingsPercent).toBe(20);
  });

  it("treats a legacy yearly plan as yearly-only", () => {
    const p = computePlanPricing({ price: "3000000", billingInterval: "yearly", discountPercent: 10 }, now);
    expect(p.monthly).toBeNull();
    expect(p.yearly).toMatchObject({ list: 3000000, final: 2700000 });
  });

  it("never offers a yearly option on a free plan", () => {
    expect(computePlanPricing({ price: "0", billingInterval: "monthly", yearlyDiscountPercent: 20 }, now).yearly).toBeNull();
  });
});

describe("priceForInterval", () => {
  it("returns the amount and period to charge", () => {
    const plan = { ...monthly, yearlyDiscountPercent: 20, discountPercent: 10 };
    expect(priceForInterval(plan, "monthly", now)).toEqual({ amount: 315000, periodDays: 30, list: 350000 });
    expect(priceForInterval(plan, "yearly", now)).toEqual({ amount: 3024000, periodDays: 365, list: 4200000 });
  });

  it("refuses an interval the plan does not offer", () => {
    expect(priceForInterval(monthly, "yearly", now)).toBeNull();
    expect(priceForInterval({ price: "3000000", billingInterval: "yearly" }, "monthly", now)).toBeNull();
  });
});
