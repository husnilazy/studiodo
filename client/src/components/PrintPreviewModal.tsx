import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useBoothConfig } from "@/lib/boothConfigStore";
import { PAPER_DIMENSIONS_MM, paperShortLabel, printLayoutFromConfig } from "@/lib/printLayout";
import { prepareFileForPrint } from "@/lib/printSheet";
import { pushToast } from "@/lib/toastStore";

const MAX_COPIES = 20;

type Sheet = Awaited<ReturnType<typeof prepareFileForPrint>>;

// Preview of a reprint. The sheet drawn here is the very file sent to the printer, laid out the way electron/print.cjs
// lays it out (paper, orientation, fit, margin, 2-up). What the printer driver does afterwards can't be previewed.
export default function PrintPreviewModal({ url, title, isStrip, onClose }: { url: string; title: string; isStrip: boolean; onClose: () => void }) {
  const config = useBoothConfig((s) => s.config);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [sending, setSending] = useState(0);
  const [customCopies, setCustomCopies] = useState(3);

  useEffect(() => {
    let cancelled = false;
    setSheet(null);
    setError("");
    prepareFileForPrint(url)
      .then((result) => { if (!cancelled) setSheet(result); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Gambar tidak bisa dimuat"); });
    return () => { cancelled = true; };
  }, [url, attempt]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !sending) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, sending]);

  const layout = printLayoutFromConfig(config);
  const twoUp = isStrip && layout.twoUp;
  const landscape = sheet?.orientation === "landscape";
  const paper = PAPER_DIMENSIONS_MM[layout.pageSize] ?? PAPER_DIMENSIONS_MM["4r"];
  const paperW = landscape ? paper.h : paper.w;
  const paperH = landscape ? paper.w : paper.h;
  const margin = Math.max(0, Math.min(10, layout.marginMm));

  const print = async (copies: number) => {
    if (!sheet || sending || !window.studiodo?.printImage) return;
    setSending(copies);
    try {
      const result = await window.studiodo.printImage({ ...sheet, ...layout, twoUp, printerName: config.printerName, copies });
      if (!result.ok) throw new Error(result.error ?? "Printer tidak merespons");
      pushToast({ type: "success", title: `${copies} lembar dikirim ke printer`, sub: config.printerName || "Printer default" });
      onClose();
    } catch (e) {
      pushToast({ type: "error", title: "Gagal mencetak", sub: e instanceof Error ? e.message : "Coba lagi beberapa saat." });
      setSending(0);
    }
  };

  const ready = Boolean(sheet) && !sending;
  const info: [string, string][] = [
    ["Printer", config.printerName || "Printer default Windows"],
    ["Kertas", `${paperShortLabel(layout.pageSize)} · ${paper.w} × ${paper.h} mm`],
    ["Orientasi", sheet ? (landscape ? "Landscape" : "Portrait") : "—"],
    ["Penyesuaian", `${layout.fit === "contain" ? "Utuh" : "Isi penuh"} · margin ${margin} mm${twoUp ? " · 2 strip per lembar" : ""}`],
  ];

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Pratinjau cetak" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget && !sending) onClose(); }}>
      <div className="flex max-h-full w-full max-w-[880px] flex-col overflow-y-auto rounded-3xl border border-fg/10 bg-canvas text-fg shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-fg/10 p-5">
          <div>
            <p className="text-sm font-semibold">Pratinjau cetak</p>
            <p className="mt-1 text-xs text-fg/40">{title}</p>
          </div>
          <button type="button" onClick={onClose} disabled={Boolean(sending)} aria-label="Tutup" className="rounded-xl border border-fg/15 px-3 py-2 text-xs text-fg/70 hover:border-fg/40 hover:text-fg disabled:opacity-40">✕ Tutup</button>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-[1fr_300px]">
          <div className="flex min-h-[240px] items-center md:min-h-[320px] justify-center rounded-2xl bg-fg/5 p-4">
            {sheet ? (
              <div className="relative bg-white [--sheet-vh:34vh] md:[--sheet-vh:60vh] shadow-[0_18px_50px_-15px_rgba(0,0,0,0.7)]" style={{ width: `min(100%, calc(var(--sheet-vh) * ${paperW / paperH}))`, aspectRatio: `${paperW} / ${paperH}` }}>
                <div className="absolute flex" style={{ left: `${(margin / paperW) * 100}%`, right: `${(margin / paperW) * 100}%`, top: `${(margin / paperH) * 100}%`, bottom: `${(margin / paperH) * 100}%`, columnGap: twoUp ? `${(margin / (paperW - 2 * margin)) * 100}%` : 0 }}>
                  {(twoUp ? [0, 1] : [0]).map((copy) => (
                    <img key={copy} src={sheet.dataUrl} alt={copy === 0 ? "Pratinjau hasil cetak" : ""} className="h-full min-w-0 flex-1" style={{ objectFit: layout.fit }} />
                  ))}
                </div>
              </div>
            ) : error ? (
              <div className="text-center">
                <p className="text-sm text-fg/70">{error}</p>
                <button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-3 rounded-xl border border-fg/15 px-4 py-2 text-xs text-fg/70 hover:border-accent hover:text-fg">Coba lagi</button>
              </div>
            ) : (
              <p className="animate-pulse text-sm text-fg/50">Menyiapkan pratinjau…</p>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-3 rounded-2xl border border-fg/10 p-4 md:grid-cols-1">
              {info.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[11px] text-fg/40">{label}</dt>
                  <dd className="mt-0.5 break-words text-xs font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-[11px] leading-relaxed text-fg/40">Diubah di Kiosk → Printer. Borderless mengikuti setelan driver printer, jadi tepi kertas bisa sedikit berbeda dari pratinjau.</p>

            <div className="mt-auto space-y-2">
              <div className="grid grid-cols-2 gap-2">
                {[1, 2].map((copies) => (
                  <button key={copies} type="button" onClick={() => print(copies)} disabled={!ready} className="rounded-2xl bg-accent px-3 py-4 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">
                    {sending === copies ? "Mengirim…" : `Print ${copies}×`}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-xl border border-fg/15">
                  <button type="button" onClick={() => setCustomCopies((n) => Math.max(1, n - 1))} disabled={Boolean(sending)} aria-label="Kurangi jumlah" className="px-3 py-2 text-sm text-fg/70 hover:text-fg">−</button>
                  <span className="w-7 text-center text-sm font-semibold">{customCopies}</span>
                  <button type="button" onClick={() => setCustomCopies((n) => Math.min(MAX_COPIES, n + 1))} disabled={Boolean(sending)} aria-label="Tambah jumlah" className="px-3 py-2 text-sm text-fg/70 hover:text-fg">+</button>
                </div>
                <button type="button" onClick={() => print(customCopies)} disabled={!ready} className="flex-1 rounded-xl border border-fg/15 px-3 py-2.5 text-xs font-semibold text-fg/80 hover:border-accent hover:text-fg disabled:cursor-not-allowed disabled:opacity-40">Print {customCopies} lembar</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
