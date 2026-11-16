import { PAPER_DIMENSIONS_MM, PAPER_OPTIONS, paperItemsSummary, paperSheetCount, paperShortLabel, type PaperItem, type PaperSizeId } from "@/lib/printLayout";

const MAX_COPIES = 10;

/** A sheet drawn to real proportions (and roughly real relative size), so 2R looks small next to A4 at a glance. */
export function PaperSheetIcon({ size, count, tall = 56, className = "" }: { size: PaperSizeId; count?: number; tall?: number; className?: string }) {
  const d = PAPER_DIMENSIONS_MM[size];
  const height = Math.round(tall * (0.45 + 0.55 * (d.h / 297) ** 0.6));
  const width = Math.round(height * (d.w / d.h));
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center rounded-[3px] border-2 border-current bg-current/10 ${className}`} style={{ width, height }} aria-hidden>
      <span className="text-[10px] font-bold leading-none">{paperShortLabel(size)}</span>
      {count !== undefined && count > 1 && <span className="absolute -right-2 -top-2 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-on-accent">×{count}</span>}
    </span>
  );
}

/** Read-only strip of the sheets a bundle includes (kiosk package cards, frame screen). */
export function PaperBundleRow({ items, className = "" }: { items?: PaperItem[] | null; className?: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-end gap-3 ${className}`} aria-label={`Isi paket: ${paperItemsSummary(items)}`}>
      {items.map((item) => (
        <span key={item.size} className="flex flex-col items-center gap-1 text-accent">
          <PaperSheetIcon size={item.size} tall={44} />
          <span className="text-[11px] font-semibold text-muted">{item.copies}× {paperShortLabel(item.size)}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * Admin editor for a package's print sheets. Tap a size to add it, +/− to change how many sheets of it the package includes.
 * Nothing selected = legacy behaviour (the PC's own printer settings decide the paper).
 */
export default function PaperPicker({ value, onChange, price }: { value: PaperItem[]; onChange: (next: PaperItem[]) => void; price?: number }) {
  const copiesOf = (size: PaperSizeId) => value.find((item) => item.size === size)?.copies ?? 0;
  const setCopies = (size: PaperSizeId, copies: number) => {
    const clamped = Math.max(0, Math.min(MAX_COPIES, copies));
    const rest = value.filter((item) => item.size !== size);
    if (clamped === 0) return onChange(rest);
    const existing = value.some((item) => item.size === size);
    onChange(existing ? value.map((item) => (item.size === size ? { ...item, copies: clamped } : item)) : [...rest, { size, copies: clamped }]);
  };
  const sheets = paperSheetCount(value);
  const stepBtn = "flex h-7 w-7 items-center justify-center rounded-full border border-fg/20 text-sm font-bold transition hover:bg-fg/10 disabled:opacity-30";
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {PAPER_OPTIONS.map((option) => {
          const copies = copiesOf(option.id);
          const active = copies > 0;
          return (
            <div key={option.id} className={`flex flex-col items-center gap-2 rounded-2xl border p-3 text-center transition ${active ? "border-accent bg-accent/10" : "border-fg/10 bg-fg/5"}`}>
              <button type="button" onClick={() => setCopies(option.id, active ? copies : 1)} className={`flex h-[68px] items-end justify-center ${active ? "text-accent" : "text-fg/40"}`} aria-label={`Tambah ${option.label}`}>
                <PaperSheetIcon size={option.id} tall={60} />
              </button>
              <div>
                <p className="text-xs font-semibold">{option.label}</p>
                <p className="text-[10px] text-fg/50">{option.size}</p>
              </div>
              {active ? (
                <div className="flex items-center gap-2">
                  <button type="button" className={stepBtn} onClick={() => setCopies(option.id, copies - 1)} aria-label={`Kurangi ${option.label}`}>−</button>
                  <span className="w-5 text-center text-sm font-bold tabular-nums">{copies}</span>
                  <button type="button" className={stepBtn} onClick={() => setCopies(option.id, copies + 1)} disabled={copies >= MAX_COPIES} aria-label={`Tambah lembar ${option.label}`}>+</button>
                </div>
              ) : (
                <button type="button" onClick={() => setCopies(option.id, 1)} className="rounded-full border border-fg/20 px-3 py-1 text-[11px] font-semibold hover:bg-fg/10">+ Tambah</button>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-fg/60">
        {sheets === 0
          ? "Belum ada kertas dipilih — paket dicetak memakai ukuran & jumlah salinan dari pengaturan printer PC (perilaku lama)."
          : `Isi paket: ${paperItemsSummary(value)} · total ${sheets} lembar${price && price > 0 ? ` · ≈ Rp ${Math.round(price / sheets).toLocaleString("id-ID")} per lembar` : ""}`}
      </p>
    </div>
  );
}
