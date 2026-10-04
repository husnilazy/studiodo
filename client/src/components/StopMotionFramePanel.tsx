import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fileToDataUrl } from "@/lib/imageDownscale";
import { useBoothConfig } from "@/lib/boothConfigStore";
import { STOP_MOTION_CATEGORY } from "@/lib/stopMotion";
import type { LocalTemplate } from "@/lib/templateStore";
import { panel } from "@/lib/adminUi";
import { pushToast } from "@/lib/toastStore";
import TemplateEditor from "@/components/TemplateEditor";
import Spinner from "@/components/Spinner";

function loadDimensions(dataUrl: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("Gambar tidak bisa dibaca"));
    image.src = dataUrl;
  });
}

/**
 * Frames that are used ONLY for the stop-motion video. They are ordinary templates (same upload + hole editor as the
 * main frames) saved under a reserved category, so they never show up in the customer's frame picker — and the
 * main frames never get used for the video unless the admin wants a plain slideshow.
 */
export default function StopMotionFramePanel() {
  const { config, update } = useBoothConfig();
  const [frames, setFrames] = useState<LocalTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<{ template: LocalTemplate; isNew: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const result = await api.getStopMotionFrames();
      setFrames((result ?? []).map((frame) => ({
        id: frame.id,
        name: frame.name,
        category: STOP_MOTION_CATEGORY,
        style: frame.style ?? "Stop motion",
        orientation: frame.orientation === "landscape" ? "landscape" : "portrait",
        outputPreset: frame.outputPreset ?? "4r",
        canvasWidth: frame.canvasWidth,
        canvasHeight: frame.canvasHeight,
        frameDataUrl: frame.imageUrl,
        slots: frame.slots ?? [],
      })));
    } catch (error) {
      console.error("Gagal memuat frame stop motion", error);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void refresh(); }, []);

  const startUpload = async (file: File | undefined) => {
    if (!file) return;
    if (file.type !== "image/png") {
      pushToast({ type: "error", title: "Pakai file PNG", sub: "Frame harus PNG dengan bagian tengah transparan (lubang foto)." });
      return;
    }
    try {
      const frameDataUrl = await fileToDataUrl(file, 2000);
      const { width, height } = await loadDimensions(frameDataUrl);
      setWorking({
        isNew: true,
        template: {
          id: crypto.randomUUID(),
          name: file.name.replace(/\.png$/i, "") || "Frame stop motion",
          category: STOP_MOTION_CATEGORY,
          style: "Stop motion",
          orientation: width >= height ? "landscape" : "portrait",
          outputPreset: "custom",
          frameDataUrl,
          canvasWidth: width,
          canvasHeight: height,
          // One window, centred: every photo of the session appears in it, one after another.
          slots: [{ x: 0.1, y: 0.1, w: 0.8, h: 0.8 }],
        },
      });
    } catch (error) {
      pushToast({ type: "error", title: "Gagal membaca file", sub: error instanceof Error ? error.message : undefined });
    }
  };

  const save = async () => {
    if (!working) return;
    setSaving(true);
    try {
      const { template, isNew } = working;
      if (isNew) {
        await api.createFrame(template);
      } else {
        await api.updateFrame(template.id, {
          name: template.name,
          frameImageUrl: template.frameDataUrl,
          slots: template.slots,
          canvasWidth: template.canvasWidth,
          canvasHeight: template.canvasHeight,
          orientation: template.orientation,
        });
      }
      if (isNew && !config.stopMotionTemplateId) update({ stopMotionTemplateId: template.id });
      setWorking(null);
      await refresh();
      pushToast({ type: "success", title: "Frame stop motion tersimpan" });
    } catch (error) {
      pushToast({ type: "error", title: "Frame gagal disimpan", sub: error instanceof Error ? error.message : "Periksa koneksi server." });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Hapus frame stop motion ini?")) return;
    setDeletingId(id);
    try {
      await api.deleteFrame(id);
      if (config.stopMotionTemplateId === id) update({ stopMotionTemplateId: null });
      await refresh();
    } catch (error) {
      pushToast({ type: "error", title: "Gagal menghapus frame", sub: error instanceof Error ? error.message : undefined });
    } finally {
      setDeletingId(null);
    }
  };

  const seconds = config.stopMotionSecondsPerPhoto || 0.9;

  return (
    <section className={`mx-auto mt-8 max-w-7xl ${panel} md:p-7`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">VIDEO STOP MOTION</p>
          <h2 className="font-display text-3xl font-semibold">Frame khusus stop motion</h2>
          <p className="mt-1 max-w-2xl text-sm text-fg/55">
            Video stop motion menampilkan semua hasil jepretan satu per satu (bukan GIF cepat). Frame di sini <strong>terpisah</strong> dari frame foto utama dan tidak muncul di pilihan customer.
            Aktifkan fiturnya per paket di Finance → Paket Foto.
          </p>
        </div>
        <label className="k-btn k-btn-accent cursor-pointer !min-h-0 !py-2.5 !text-sm">
          Upload frame PNG
          <input type="file" accept="image/png" className="hidden" onChange={(event) => { void startUpload(event.target.files?.[0]); event.target.value = ""; }} />
        </label>
      </div>

      <div className="mt-5 rounded-2xl border border-fg/10 bg-fg/[0.03] p-4">
        <label className="block text-sm text-fg/60">
          Lama tiap foto tampil: <span className="font-semibold text-fg">{seconds.toFixed(1)} detik</span>
          <input
            type="range" min={0.5} max={2.5} step={0.1} value={seconds}
            onChange={(event) => update({ stopMotionSecondsPerPhoto: Number(event.target.value) })}
            className="mt-2 w-full max-w-md accent-[var(--accent)]"
          />
        </label>
        <p className="mt-1 text-xs text-fg/45">Makin besar angkanya, makin lambat videonya. 0.8–1.2 detik terasa nyaman untuk ditonton.</p>
      </div>

      {working && (
        <div className="mt-5 rounded-2xl border border-accent/30 bg-accent/[0.04] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-display text-xl font-semibold">{working.isNew ? "Frame baru" : "Atur frame"}</p>
            <div className="flex gap-2">
              <button onClick={() => setWorking(null)} className="rounded-xl border border-fg/15 px-4 py-2 text-sm text-fg/60">Batal</button>
              <button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold disabled:opacity-50">
                {saving && <Spinner size="sm" />}{saving ? "Menyimpan…" : "Simpan frame"}
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(260px,1fr)_320px]">
            <TemplateEditor template={working.template} onChange={(patch) => setWorking((current) => current ? { ...current, template: { ...current.template, ...patch } } : current)} />
            <div className="space-y-3">
              <label className="block text-sm text-fg/55">
                Nama frame
                <input value={working.template.name} onChange={(event) => setWorking({ ...working, template: { ...working.template, name: event.target.value } })} className="mt-1 w-full rounded-xl border border-fg/15 bg-surface px-3 py-2 text-fg" />
              </label>
              <p className="text-xs leading-relaxed text-fg/50">
                Geser dan ubah ukuran kotak ungu — di situlah setiap foto akan muncul. Hanya <strong>lubang pertama</strong> yang dipakai; bagian PNG di luar lubang menjadi bingkainya.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <button
          type="button"
          onClick={() => update({ stopMotionTemplateId: null })}
          className={`flex h-full min-h-48 flex-col items-center justify-center gap-2 rounded-2xl border p-4 text-center transition ${!config.stopMotionTemplateId ? "border-accent bg-accent/10" : "border-fg/10 hover:border-fg/30"}`}
        >
          <span className="text-3xl opacity-60">🎞</span>
          <span className="font-semibold">Tanpa frame</span>
          <span className="text-xs text-fg/50">Foto tampil penuh satu per satu</span>
          {!config.stopMotionTemplateId && <span className="rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Dipakai</span>}
        </button>
        {frames.map((frame) => {
          const active = config.stopMotionTemplateId === frame.id;
          return (
            <article key={frame.id} className={`overflow-hidden rounded-2xl border transition ${active ? "border-accent ring-2 ring-accent/30" : "border-fg/10"}`}>
              <button type="button" onClick={() => update({ stopMotionTemplateId: frame.id })} className="block w-full bg-[repeating-conic-gradient(var(--hairline)_0_25%,transparent_0_50%)] [background-size:16px_16px]">
                <img src={frame.frameDataUrl} alt={frame.name} className="h-44 w-full object-contain" />
              </button>
              <div className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-semibold">{frame.name}</p>
                  {active && <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Dipakai</span>}
                </div>
                <div className="mt-2 flex gap-2 text-xs">
                  {!active && <button onClick={() => update({ stopMotionTemplateId: frame.id })} className="rounded-full border border-fg/15 px-3 py-1 hover:border-accent">Pakai</button>}
                  <button onClick={() => setWorking({ isNew: false, template: frame })} className="rounded-full border border-fg/15 px-3 py-1 hover:border-accent">Atur lubang</button>
                  <button onClick={() => remove(frame.id)} disabled={deletingId === frame.id} className="ml-auto text-red-500 hover:text-red-400 disabled:opacity-50">{deletingId === frame.id ? "Menghapus…" : "Hapus"}</button>
                </div>
              </div>
            </article>
          );
        })}
        {loading && <div className="flex min-h-48 items-center justify-center"><Spinner size="md" /></div>}
      </div>
      {!loading && frames.length === 0 && <p className="mt-3 text-sm text-fg/45">Belum ada frame stop motion. Upload PNG (bagian tengah transparan) untuk membuat bingkai video.</p>}
    </section>
  );
}
