import { describe, expect, it } from "vitest";
import { applyPackageOverrides, boothPackagePrice, sanitizeOverrides, sanitizePackageOverrides } from "./boothSettings.js";

const P1 = "11111111-1111-1111-1111-111111111111";
const P2 = "22222222-2222-2222-2222-222222222222";
const OTHER_TENANT_PKG = "99999999-9999-9999-9999-999999999999";

describe("sanitizeOverrides", () => {
  it("keeps only whitelisted keys and drops empty values", () => {
    const r = sanitizeOverrides({ accentColor: "#112233", tagline: "  Halo  ", brandName: "", hacker: "x", logoUrl: "https://evil" });
    expect(r).toEqual({ ok: true, value: { accentColor: "#112233", tagline: "Halo" } });
  });
  it("rejects bad colours and non-text values", () => {
    expect(sanitizeOverrides({ accentColor: "red" }).ok).toBe(false);
    expect(sanitizeOverrides({ tagline: 5 }).ok).toBe(false);
    expect(sanitizeOverrides("nope").ok).toBe(false);
  });
});

describe("sanitizePackageOverrides", () => {
  const valid = new Set([P1, P2]);
  it("accepts prices and hidden flags for this tenant's packages only", () => {
    const r = sanitizePackageOverrides({ [P1]: { price: "45000" }, [P2]: { active: false }, [OTHER_TENANT_PKG]: { price: 1 } }, valid);
    expect(r).toEqual({ ok: true, value: { [P1]: { price: 45000 }, [P2]: { active: false } } });
  });
  it("drops entries that change nothing and refuses absurd prices", () => {
    expect(sanitizePackageOverrides({ [P1]: { active: true } }, valid)).toEqual({ ok: true, value: {} });
    expect(sanitizePackageOverrides({ [P1]: { price: -1 } }, valid).ok).toBe(false);
    expect(sanitizePackageOverrides({ [P1]: { price: 999999999999 } }, valid).ok).toBe(false);
  });
  it("allows a free (price 0) package", () => {
    expect(sanitizePackageOverrides({ [P1]: { price: 0 } }, valid)).toEqual({ ok: true, value: { [P1]: { price: 0 } } });
  });
});

describe("applying booth prices", () => {
  const rows = [{ id: P1, price: "50000", name: "Basic" }, { id: P2, price: "80000", name: "Premium" }];
  it("replaces the price and hides unavailable packages without touching the originals", () => {
    const out = applyPackageOverrides(rows, { [P1]: { price: 35000 }, [P2]: { active: false } });
    expect(out).toEqual([{ id: P1, price: "35000", name: "Basic" }]);
    expect(rows[0].price).toBe("50000");
  });
  it("boothPackagePrice: booth price, tenant price, or null when hidden", () => {
    expect(boothPackagePrice(rows[0], { [P1]: { price: 0 } })).toBe(0);
    expect(boothPackagePrice(rows[0], {})).toBe(50000);
    expect(boothPackagePrice(rows[1], { [P2]: { active: false } })).toBeNull();
  });
});
