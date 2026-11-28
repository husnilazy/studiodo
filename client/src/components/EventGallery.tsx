import { useCallback, useEffect, useState } from "react";
import { api, type EventGalleryItem } from "@/lib/api";
import { panel } from "@/lib/adminUi";
import { useBoothConfig } from "@/lib/boothConfigStore";
import { printLayoutFromConfig } from "@/lib/printLayout";
import { prepareFileForPrint } from "@/lib/printSheet";
import { pushToast } from "@/lib/toastStore";

// Gallery of ONE event: every finished session, newest first. A guest who wants another copy (or one more print) is served
// right here: open the result, pick the number of copies and press Cetak — it goes to this PC's printer like the kiosk's own print.

const time = (iso: string) => new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const cover = (i: EventGalleryItem) => i.stripUrl || i.photoUrls[0] || i.gifUrl || "";

export default function EventGallery({ eventId }: { eventId: string }) {
  const config = useBoothConfig((s) => s.config);
  const [items, setItems] = useState<EventGalleryItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<EventGalleryItem | null>(null);
  const [which, setWhich] = useState<string | null>(null); // the image chosen inside the open session (null = the strip)
  const [copies, setCopies] = useState(1);
  const [printing, setPrinting] = useState(false);
  const canPrint = Boolean(window.studiodo?.printImage);

  const load = useCallback((more = false, cursor: string | null = null) => {
    setLoading(true);
    api.getEventGallery(eventId, more ? cursor : null)
      .then((r) => { if (!r) return; setItems((cur) => (more ? [...cur, ...r.items] : r.items)); setNext(r.next); setError(""); })
      .catch((e) => setError(e instanceof Error ? e.message : "Gagal memuat galeri"))
      .finally(() => setLoading(false));
  }, [eventId]);
  useEffect(() => { load(); }, [load]);

  const choose = (item: EventGalleryItem) => { setOpen(item); setWhich(null); setCopies(1); };
  const current = open ? (which ?? open.stripUrl ?? open.photoUrls[0] ?? "") : "";

  const print = async () => {
    if (!current || printing || !window.studiodo?.printImage) return;
    setPrinting(true);
    try {
      const sheet = await prepareFileForPrint(current);
      const layout = printLayoutFromConfig(config);
      const result = await window.studiodo.printImage({
        ...sheet, ...layout, twoUp: current === open?.stripUrl && layout.twoUp, printerName: config.printerName, copies,
      });
      if (!result.ok) throw new Error(result.error ?? "Printer tidak merespons");
      pushToast({ type: "success", title: `${copies} lembar dikirim ke printer`, sub: config.printerName || "Printer default" });
    } catch (e) { pushToast({ type: "error", title: "Gagal mencetak", sub: e instanceof Error ? e.message : undefined }); } finally { setPrinting(false); }
  };

  const download = async () => {
    if (!current || !open) return;
    const filename = `event-${open.id.slice(0, 8)}${which ? "-foto" : "-strip"}.jpg`;
    try {
      if (window.studiodo?.downloadAsset) {
        const r = await window.studiodo.downloadAsset({ url: current, filename });
        if (!r.ok) throw new Error(r.error ?? "Gagal menyimpan");
        pushToast({ type: "success", title: "Tersimpan", sub: "Folder Downloads/STUDIODO" });
        return;
      }
      const blob = await (await fetch(current)).blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
    } catch (e) { pushToast({ type: "error", title: "Gagal mengunduh", sub: e instanceof Error ? e.message : undefined }); }
  };

  const copyLink = async () => {
    if (!open?.shareUrl) return;
    try { await navigator.clipboard.writeText(open.shareUrl); pushToast({ type: "success", title: "Link galeri tamu disalin" }); } catch { pushToast({ type: "error", title: "Tidak bisa menyalin link" }); }
  };

  return (
    <div className="space-y-3">
      <div className={`${panel} flex flex-wrap items-center gap-3`}>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">Galeri event</h3>
          <p className="text-sm text-fg/55">Semua hasil foto event ini. Buka satu hasil untuk cetak tambahan langsung, unduh, atau salin link tamu.{!canPrint && " Cetak hanya tersedia di aplikasi desktop STUDIODO."}</p>
        </div>
        <button type="button" onClick={() => load()} disabled={loading} className="rounded-xl border border-fg/15 px-4 py-2 text-sm disabled:opacity-50">Segarkan</button>
      </div>

      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {!loading && items.length === 0 && !error && <div className={`${panel} py-12 text-center text-sm text-fg/45`}>Belum ada hasil foto di event ini.</div>}

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
        {items.map((item) => (
          <button key={item.id} type="button" onClick={() => choose(item)} className="group overflow-hidden rounded-2xl border border-fg/10 bg-fg/[0.04] text-left transition hover:border-accent">
            <div className="aspect-[3/4] w-full overflow-hidden bg-fg/5">{cover(item) && <img src={cover(item)} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />}</div>
            <p className="truncate px-2 py-1.5 text-[11px] text-fg/50">{time(item.createdAt)}{item.booth ? ` · ${item.booth}` : ""}</p>
          </button>
        ))}
      </div>
      {loading && <p className="py-4 text-center text-sm text-fg/40">Memuat…</p>}
      {next && !loading && <div className="text-center"><button type="button" onClick={() => load(true, next)} className="rounded-xl border border-fg/15 px-5 py-2.5 text-sm">Muat lebih banyak</button></div>}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Hasil foto" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(null); }}>
          <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-fg/10 bg-surface shadow-2xl md:flex-row">
            <div className="flex min-h-0 flex-1 items-center justify-center bg-fg/[0.05] p-4">{current && <img src={current} alt="Hasil foto" className="max-h-[80vh] max-w-full object-contain" />}</div>
            <div className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto p-5 md:w-72">
              <div className="flex items-start justify-between gap-2">
                <div><p className="font-semibold">{time(open.createdAt)}</p>{open.booth && <p className="text-xs text-fg/50">{open.booth}</p>}</div>
                <button type="button" onClick={() => setOpen(null)} aria-label="Tutup" className="rounded-full border border-fg/15 px-3 py-1 text-sm">✕</button>
              </div>

              {(open.stripUrl || open.photoUrls.length > 1) && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg/45">Pilih yang dicetak</p>
                  <div className="flex flex-wrap gap-2">
                    {open.stripUrl && <button type="button" onClick={() => setWhich(null)} className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${which === null ? "border-accent bg-accent/10 text-accent" : "border-fg/15"}`}>Hasil jadi</button>}
                    {open.photoUrls.map((u, i) => <button key={u} type="button" onClick={() => setWhich(u)} className={`overflow-hidden rounded-lg border ${which === u ? "border-accent ring-2 ring-accent/40" : "border-fg/15"}`} aria-label={`Foto ${i + 1}`}><img src={u} alt="" className="h-12 w-12 object-cover" /></button>)}
                  </div>
                </div>
              )}

              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg/45">Jumlah cetak</p>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setCopies((c) => Math.max(1, c - 1))} className="h-10 w-10 rounded-xl border border-fg/15 text-lg" aria-label="Kurangi">−</button>
                  <span className="w-8 text-center font-display text-2xl font-semibold">{copies}</span>
                  <button type="button" onClick={() => setCopies((c) => Math.min(20, c + 1))} className="h-10 w-10 rounded-xl border border-fg/15 text-lg" aria-label="Tambah">+</button>
                </div>
              </div>

              <button type="button" onClick={() => void print()} disabled={!canPrint || printing || !current} className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/20 disabled:cursor-not-allowed disabled:opacity-40">{printing ? "Mengirim ke printer…" : `Cetak ${copies} lembar`}</button>
              <div className="flex gap-2">
                <button type="button" onClick={() => void download()} className="flex-1 rounded-xl border border-fg/15 px-3 py-2 text-sm">Unduh</button>
                {open.shareUrl && <button type="button" onClick={() => void copyLink()} className="flex-1 rounded-xl border border-fg/15 px-3 py-2 text-sm">Salin link tamu</button>}
              </div>
              {!canPrint && <p className="text-xs text-fg/45">Buka dari aplikasi desktop STUDIODO di PC booth untuk mencetak.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
