import { describe, expect, it } from "vitest";
import { buildPrintJobs, paperItemsSummary } from "./printLayout";

const config = { printPaperSize: "4r" as const, printFit: "cover" as const, printMarginMm: 0, printTwoUp: true, printCopies: 2 };

describe("buildPrintJobs", () => {
  it("legacy package: one job with the PC's own paper, copies and two-up", () => {
    expect(buildPrintJobs([], config)).toEqual([{ pageSize: "4r", fit: "cover", marginMm: 0, twoUp: true, copies: 2 }]);
    expect(buildPrintJobs(undefined, config, 3)[0].copies).toBe(5);
  });
  it("bundle: one job per item on its own paper size, extras ride on the first item", () => {
    const jobs = buildPrintJobs([{ size: "4r", copies: 1 }, { size: "2r", copies: 2 }], config, 2);
    expect(jobs.map((j) => [j.pageSize, j.copies, j.twoUp])).toEqual([["4r", 3, false], ["2r", 2, false]]);
  });
  it("summarises a bundle", () => {
    expect(paperItemsSummary([{ size: "4r", copies: 1 }, { size: "2r", copies: 2 }])).toBe("1× 4R + 2× 2R");
  });
});
