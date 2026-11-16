import type { BoothConfig } from "@/lib/boothConfigStore";

export type PaperSizeId = BoothConfig["printPaperSize"];
export interface PaperItem { id?: string; size: PaperSizeId; copies: number }

/** Real sheet sizes in mm (portrait), used for the scale-true sheet icons and labels. */
export const PAPER_DIMENSIONS_MM: Record<PaperSizeId, { w: number; h: number }> = {
  "2r": { w: 63.5, h: 88.9 },
  "3r": { w: 88.9, h: 127 },
  "4r": { w: 101.6, h: 152.4 },
  "5r": { w: 127, h: 177.8 },
  "6r": { w: 152.4, h: 203.2 },
  a4: { w: 210, h: 297 },
};

export const PAPER_OPTIONS: { id: PaperSizeId; label: string; size: string }[] = [
  { id: "2r", label: "2R / 2.5x3.5 in", size: "6,4 x 8,9 cm" },
  { id: "3r", label: "3R / 3.5x5 in", size: "8,9 x 12,7 cm" },
  { id: "4r", label: "4R / 4x6 in", size: "10,2 x 15,2 cm" },
  { id: "5r", label: "5R / 5x7 in", size: "12,7 x 17,8 cm" },
  { id: "6r", label: "6R / 6x8 in", size: "15,2 x 20,3 cm" },
  { id: "a4", label: "A4", size: "21 x 29,7 cm" },
];

export const paperShortLabel = (size: PaperSizeId) => (size === "a4" ? "A4" : size.toUpperCase());

/** "2 × 4R + 1 × 2R" — compact summary of a bundle, "" for a legacy package. */
export function paperItemsSummary(items?: PaperItem[] | null): string {
  return (items ?? []).map((item) => `${item.copies}× ${paperShortLabel(item.size)}`).join(" + ");
}

export const paperSheetCount = (items?: PaperItem[] | null) => (items ?? []).reduce((sum, item) => sum + item.copies, 0);

/** Print-layout part of a printImage payload, taken from this PC's printer settings. */
export function printLayoutFromConfig(config: Pick<BoothConfig, "printPaperSize" | "printFit" | "printMarginMm" | "printTwoUp">) {
  return { pageSize: config.printPaperSize ?? "4r", fit: config.printFit ?? "cover", marginMm: config.printMarginMm ?? 0, twoUp: Boolean(config.printTwoUp) };
}

/**
 * The print jobs for one session. A bundle package prints every item on its OWN paper size (the PC's printer settings only
 * supply fit/margin); the extra sheets the customer paid for ride on the first item. A legacy package (no items) keeps the
 * old behaviour: one job with the PC's paper size and copy count.
 */
export function buildPrintJobs(
  items: PaperItem[] | null | undefined,
  config: Pick<BoothConfig, "printPaperSize" | "printFit" | "printMarginMm" | "printTwoUp" | "printCopies">,
  extraCopies = 0,
): { pageSize: PaperSizeId; fit: "cover" | "contain"; marginMm: number; twoUp: boolean; copies: number }[] {
  const base = printLayoutFromConfig(config);
  if (!items || items.length === 0) return [{ ...base, copies: Math.max(1, (config.printCopies ?? 1) + extraCopies) }];
  return items.map((item, index) => ({
    ...base,
    pageSize: item.size,
    twoUp: false,
    copies: Math.max(1, item.copies) + (index === 0 ? extraCopies : 0),
  }));
}
