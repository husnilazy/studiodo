import { PAPER_OPTIONS } from "@/lib/printLayout";
import type { BoothConfig } from "@/lib/boothConfigStore";

type PaperId = BoothConfig["printPaperSize"];

// Real proportions (cm) so the sheets on screen are drawn to scale relative to each other.
const DIMENSIONS: Record<string, [number, number]> = { "4r": [10.2, 15.2], "5r": [12.7, 17.8], "6r": [15.2, 20.3], a4: [21, 29.7] };
const HINTS: Record<string, string> = { "4r": "Standar photobooth", "5r": "Foto lebih besar", "6r": "Poster kecil", a4: "Dokumen / poster" };
const SCALE = 3.6; // px per cm
const MAX_H = 29.7 * SCALE;

/** Visual paper-size chooser: each sheet is drawn to scale with a sample layout, instead of a plain dropdown. */
export default function PaperPicker({ value, onChange }: { value: PaperId; onChange: (id: PaperId) => void }) {
  return (
    <div role="radiogroup" aria-label="Ukuran kertas" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {PAPER_OPTIONS.map((paper) => {
        const [w, h] = DIMENSIONS[paper.id as string] ?? [10.2, 15.2];
        const selected = paper.id === value;
        const pw = w * SCALE, ph = h * SCALE;
        return (
          <button
            key={paper.id} type="button" role="radio" aria-checked={selected} onClick={() => onChange(paper.id)}
            className={`group relative flex flex-col items-center gap-2 rounded-2xl border p-3 text-center transition active:scale-[0.98] ${selected ? "border-accent bg-accent/10 ring-2 ring-accent/25" : "border-fg/15 hover:border-fg/35 hover:bg-fg/[0.04]"}`}
          >
            {selected && <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-on-accent"><svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5l4 4 8-9" /></svg></span>}
            <div className="flex items-end justify-center" style={{ height: MAX_H + 4 }}>
              <svg width={pw} height={ph} viewBox={`0 0 ${pw} ${ph}`} aria-hidden className="drop-shadow-sm">
                <rect x="0.5" y="0.5" width={pw - 1} height={ph - 1} rx="3" fill="var(--kiosk-surface, #fff)" stroke="currentColor" strokeOpacity="0.35" />
                {paper.id === "4r" && [0, 1, 2, 3].map((i) => <rect key={i} x={pw * 0.1 + (i % 2) * pw * 0.42} y={ph * 0.07 + Math.floor(i / 2) * ph * 0.3} width={pw * 0.38} height={ph * 0.26} rx="2" className="fill-accent" opacity={0.25 + i * 0.12} />)}
                {paper.id === "4r" && <rect x={pw * 0.1} y={ph * 0.7} width={pw * 0.8} height={ph * 0.2} rx="2" fill="currentColor" opacity="0.08" />}
                {paper.id !== "4r" && <rect x={pw * 0.1} y={ph * 0.07} width={pw * 0.8} height={ph * 0.66} rx="2" className="fill-accent" opacity="0.35" />}
                {paper.id !== "4r" && <rect x={pw * 0.1} y={ph * 0.78} width={pw * 0.8} height={ph * 0.14} rx="2" fill="currentColor" opacity="0.08" />}
              </svg>
            </div>
            <div>
              <p className="font-display text-base font-semibold leading-tight">{paper.label.split(" / ")[0]}</p>
              <p className="text-[11px] text-fg/55">{paper.size}</p>
              <p className="mt-0.5 text-[11px] font-medium text-accent/90">{HINTS[paper.id as string]}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
