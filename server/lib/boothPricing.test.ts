import { describe, expect, it } from "vitest";
import { bestDiscount, quoteBooths, sanitizeVolumeTiers } from "./boothPricing.js";

const plan = { price: "150000", billingInterval: "monthly", yearlyDiscountPercent: 20 };
const tiers = [{ minBooths: 5, percent: 5 }, { minBooths: 10, percent: 10 }];

describe("quoteBooths", () => {
  it("charges per booth with no discount for a small order", () => {
    const q = quoteBooths(plan, "monthly", 3, tiers, 0)!;
    expect(q).toMatchObject({ boothCount: 3, unitFinal: 150000, total: 450000, discountPercent: 0, discountSource: "none", periodDays: 30 });
  });

  it("applies the volume tier at the threshold", () => {
    const q = quoteBooths(plan, "monthly", 10, tiers, 0)!;
    expect(q).toMatchObject({ discountPercent: 10, discountSource: "volume", unitFinal: 135000, total: 1350000, discountAmount: 150000 });
  });

  it("uses the better of volume and negotiated discount, never both", () => {
    expect(bestDiscount(10, tiers, 25)).toMatchObject({ percent: 25, source: "tenant" });
    expect(bestDiscount(10, tiers, 5)).toMatchObject({ percent: 10, source: "volume" });
    expect(bestDiscount(2, tiers, 15)).toMatchObject({ percent: 15, source: "tenant" });
  });

  it("prices the yearly interval from the yearly option", () => {
    const q = quoteBooths(plan, "yearly", 2, tiers, 0)!;
    expect(q.periodDays).toBe(365);
    expect(q.unitBase).toBe(1440000); // 12 x 150000 x 0.8
    expect(q.total).toBe(2880000);
  });

  it("refuses an interval the plan lacks and out-of-range booth counts", () => {
    expect(quoteBooths({ price: "100000", billingInterval: "monthly" }, "yearly", 1, [], 0)).toBeNull();
    expect(quoteBooths(plan, "monthly", 0, tiers, 0)).toBeNull();
    expect(quoteBooths(plan, "monthly", 1.5, tiers, 0)).toBeNull();
    expect(quoteBooths(plan, "monthly", 101, tiers, 0)).toBeNull();
  });
});

describe("sanitizeVolumeTiers", () => {
  it("sorts, de-duplicates by size and rounds", () => {
    expect(sanitizeVolumeTiers([{ minBooths: 10, percent: 10 }, { minBooths: 5, percent: 4.6 }, { minBooths: 10, percent: 12 }])).toEqual([
      { minBooths: 5, percent: 5 }, { minBooths: 10, percent: 12 },
    ]);
  });
  it("rejects nonsense", () => {
    expect(() => sanitizeVolumeTiers([{ minBooths: 1, percent: 10 }])).toThrow();
    expect(() => sanitizeVolumeTiers([{ minBooths: 5, percent: 95 }])).toThrow();
    expect(() => sanitizeVolumeTiers("x")).toThrow();
  });
});
