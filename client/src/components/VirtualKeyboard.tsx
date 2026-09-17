import { useState } from "react";
import { useBoothConfig } from "@/lib/boothConfigStore";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
}

const rows = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M"],
];
const symbolRows = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["@", ".", "_", "-", "+", "!", "?", "&", "#", "%"],
  ["(", ")", "/", ":", ";", "'", "\"", ",", "="],
];

export default function VirtualKeyboard({ value, onChange, onClose }: Props) {
  const keyboardScale = useBoothConfig((state) => state.config.keyboardScale);
  const [symbols, setSymbols] = useState(false);
  const [shift, setShift] = useState(false);
  const append = (key: string) => onChange(value + (shift && /^[A-Z]$/.test(key) ? key.toLowerCase() : key));
  return (
    <div className="keyboard-panel mx-auto max-w-full overflow-hidden rounded-[1.75rem] border border-white/10 bg-ink-950/98 p-3 shadow-2xl shadow-black/50 backdrop-blur-xl sm:p-5" style={{ width: `${Math.min(100, 100 / (keyboardScale / 100))}%`, transform: `scale(${keyboardScale / 100})` }}>
      <div className="mx-auto w-full max-w-5xl">
        {(symbols ? symbolRows : rows).map((row, rowIndex) => (
          <div
            key={`${symbols}-${row.join("")}`}
            className={`mx-auto mb-2 flex justify-center gap-1.5 sm:gap-2 ${rowIndex === 1 && !symbols ? "w-[92%]" : rowIndex === 2 && !symbols ? "w-[78%]" : "w-full"}`}
          >
            {row.map((key) => (
              <button
                key={key}
                onClick={() => append(key)}
                className="h-11 min-w-0 flex-1 rounded-lg border border-white/10 bg-white/10 px-1 text-sm font-semibold transition hover:bg-accent sm:h-13 sm:rounded-xl sm:text-base lg:h-14 lg:text-lg"
              >
                {shift && /^[A-Z]$/.test(key) ? key.toLowerCase() : key}
              </button>
            ))}
          </div>
        ))}
        <div className="flex gap-2">
          <button onClick={() => setShift((current) => !current)} className="min-h-11 rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold sm:min-h-12 sm:text-base">Shift</button>
          <button onClick={() => setSymbols((current) => !current)} className="min-h-11 rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold sm:min-h-12 sm:text-base">#+=</button>
          <button onClick={() => onChange(value.slice(0, -1))} className="min-h-11 flex-1 rounded-xl border border-white/15 px-2 py-2 text-sm sm:min-h-12 sm:text-base">⌫</button>
          <button onClick={() => append(" ")} className="min-h-11 flex-[3] rounded-xl border border-white/15 px-2 py-2 text-sm sm:min-h-12 sm:text-base">Spasi</button>
          <button onClick={onClose} className="min-h-11 flex-1 rounded-xl bg-accent px-2 py-2 text-sm font-semibold sm:min-h-12 sm:text-base">Selesai</button>
        </div>
      </div>
    </div>
  );
}
