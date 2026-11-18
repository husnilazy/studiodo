// Bundle & Paket: a package can include several print sheets of different paper sizes (e.g. 2R + 4R).
// `paperItems` is stored as jsonb on packages. An EMPTY list means "legacy package": it prints with the PC's own printer
// settings (global paper size + copies), exactly as before bundles existed.

export const PAPER_SIZE_IDS = ["2r", "3r", "4r", "5r", "6r", "a4"] as const;
export type PaperSizeId = (typeof PAPER_SIZE_IDS)[number];
export interface PaperItem { size: PaperSizeId; copies: number }

export const MAX_PAPER_ITEMS = 6;
export const MAX_COPIES_PER_ITEM = 10;

/** Cleans admin input into a safe list; returns an error message instead when it cannot be repaired. Same size twice is merged. */
export function normalizePaperItems(input: unknown): { items: PaperItem[] } | { error: string } {
  if (input === undefined || input === null) return { items: [] };
  if (!Array.isArray(input)) return { error: "Daftar kertas tidak valid" };
  const merged = new Map<PaperSizeId, number>();
  for (const raw of input) {
    const size = String((raw as { size?: unknown })?.size ?? "").toLowerCase() as PaperSizeId;
    if (!PAPER_SIZE_IDS.includes(size)) return { error: `Ukuran kertas "${String((raw as { size?: unknown })?.size ?? "")}" tidak dikenal` };
    const copies = Math.floor(Number((raw as { copies?: unknown })?.copies ?? 1));
    if (!Number.isFinite(copies) || copies < 1) return { error: "Jumlah lembar tiap kertas minimal 1" };
    merged.set(size, Math.min(MAX_COPIES_PER_ITEM, (merged.get(size) ?? 0) + copies));
  }
  if (merged.size > MAX_PAPER_ITEMS) return { error: `Maksimal ${MAX_PAPER_ITEMS} ukuran kertas per paket` };
  return { items: [...merged].map(([size, copies]) => ({ size, copies })) };
}

/** Total physical sheets a bundle prints (0 for a legacy package). */
export function totalSheets(items: PaperItem[] | null | undefined): number {
  return (items ?? []).reduce((sum, item) => sum + item.copies, 0);
}
