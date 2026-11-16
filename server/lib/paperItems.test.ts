import { describe, expect, it } from "vitest";
import { normalizePaperItems, totalSheets } from "./paperItems.js";

describe("normalizePaperItems", () => {
  it("treats missing input as a legacy package (no items)", () => {
    expect(normalizePaperItems(undefined)).toEqual({ items: [] });
    expect(normalizePaperItems([])).toEqual({ items: [] });
  });
  it("accepts a multi-size bundle and merges duplicate sizes", () => {
    expect(normalizePaperItems([{ size: "4R", copies: 1 }, { size: "2r", copies: 2 }, { size: "4r", copies: 1 }])).toEqual({
      items: [{ size: "4r", copies: 2 }, { size: "2r", copies: 2 }],
    });
  });
  it("rejects unknown sizes, bad copies and non-arrays", () => {
    expect(normalizePaperItems([{ size: "xx", copies: 1 }])).toHaveProperty("error");
    expect(normalizePaperItems([{ size: "4r", copies: 0 }])).toHaveProperty("error");
    expect(normalizePaperItems("4r")).toHaveProperty("error");
  });
  it("clamps copies per item and caps the number of sizes", () => {
    expect(normalizePaperItems([{ size: "4r", copies: 99 }])).toEqual({ items: [{ size: "4r", copies: 10 }] });
    expect(normalizePaperItems(["2r", "3r", "4r", "5r", "6r", "a4"].concat([]).map((size) => ({ size, copies: 1 })))).toHaveProperty("items");
  });
  it("counts sheets", () => {
    expect(totalSheets([{ size: "4r", copies: 2 }, { size: "2r", copies: 3 }])).toBe(5);
    expect(totalSheets([])).toBe(0);
  });
});
