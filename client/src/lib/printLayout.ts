import type { BoothConfig } from "@/lib/boothConfigStore";

export const PAPER_OPTIONS: { id: BoothConfig["printPaperSize"]; label: string; size: string }[] = [
  { id: "4r", label: "4R / 4x6 in", size: "10,2 x 15,2 cm" },
  { id: "5r", label: "5R / 5x7 in", size: "12,7 x 17,8 cm" },
  { id: "6r", label: "6R / 6x8 in", size: "15,2 x 20,3 cm" },
  { id: "a4", label: "A4", size: "21 x 29,7 cm" },
];

/** Print-layout part of a printImage payload, taken from this PC's printer settings. */
export function printLayoutFromConfig(config: Pick<BoothConfig, "printPaperSize" | "printFit" | "printMarginMm" | "printTwoUp">) {
  return { pageSize: config.printPaperSize ?? "4r", fit: config.printFit ?? "cover", marginMm: config.printMarginMm ?? 0, twoUp: Boolean(config.printTwoUp) };
}
