import { useEffect, useState } from "react";
import { contentStudioApi, type CsJob, type CsTriptych } from "@/lib/superadminApi";

// Superadmin → Konten Instagram → Pembuka Feed: three seamless animated tiles for the top row of the profile grid.
// Geometry mirrors server/lib/contentStudio/triptych.ts:
//   panorama: canvas 3240, tile i = canvas[i*1080 ..] -> the three PNGs line up edge to edge.
//   grid:     canvas 3096, tile i = canvas[i*1008 .. +1080] -> overlap 72 px so the part Instagram's 3:4 grid shows stays contiguous.

const inputClass = "mt-1 w-full rounded-lg border border-fg/15 bg-fg/5 px-3 py-2 text-sm outline-none focus:border-accent";
const CANVAS_H = 1350, PREVIEW_W = 940;
const DEFAULTS: CsTriptych = {
  seam: "panorama", logoStyle: "silver", comingTitle: "COMING|SOON", comingSub: "studiodo.id",
  headline: "All-in-One|Photobooth|App & Software", features: "Kiosk|QRIS|Kasir|Galeri", cta: "studiodo.id",
};
const CAPTIONS: [string, string][] = [
  ["Kiri · logo (unggah TERAKHIR)", "STUDIODO. Platform photobooth all-in-one. Coming soon. Ikuti untuk kabar terbaru!"],
  ["Tengah · coming soon", "Coming soon. Kami sedang menyiapkan sesuatu untuk bisnis photobooth kamu."],
  ["Kanan · all-in-one (unggah PERTAMA)", "All-in-One Photobooth App & Software: kiosk, pembayaran QRIS, kasir, dan galeri hasil dalam satu platform. studiodo.id"],
];
const fileSize = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-fg/60">{label}{hint && <span className="ml-1 font-normal text-fg/40">{hint}</span>}{children}</label>;
}

export function TriptychPanel() {
  const [opts, setOpts] = useState<CsTriptych>(DEFAULTS);
  const [html, setHtml] = useState("");
  const [replay, setReplay] = useState(0);
  const [guides, setGuides] = useState(true);
  const [env, setEnv] = useState<{ chrome: string | null; ffmpeg: boolean } | null>(null);
  const [job, setJob] = useState<CsJob | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const pitch = opts.seam === "grid" ? 1008 : 1080;
  const canvasW = pitch * 2 + 1080;
  const scale = PREVIEW_W / canvasW;
  const set = <K extends keyof CsTriptych>(k: K, v: CsTriptych[K]) => setOpts((o) => ({ ...o, [k]: v }));

  useEffect(() => { contentStudioApi.status().then((e) => setEnv(e ?? null)).catch(() => undefined); }, []);

  // Live preview: the server renders the very document that gets exported.
  useEffect(() => {
    const t = setTimeout(() => {
      contentStudioApi.triptychPreview(opts).then((r) => {
        if (r && typeof r.html === "string") { setHtml(r.html); setReplay((n) => n + 1); setMessage(null); }
        else setMessage({ ok: false, text: "Server belum mendukung Pembuka Feed. Jalankan build:server, lalu restart service StudiodoServer." });
      }).catch((e) => setMessage({ ok: false, text: e instanceof Error ? e.message : "Preview gagal" }));
    }, 500);
    return () => clearTimeout(t);
  }, [opts]);

  useEffect(() => {
    if (!job || job.status !== "running") return;
    const t = setInterval(() => {
      contentStudioApi.job(job.id).then((j) => { if (j) setJob(j); }).catch((e) => setJob({ ...job, status: "error", error: e instanceof Error ? e.message : "Gagal cek status" }));
    }, 1000);
    return () => clearInterval(t);
  }, [job]);

  const render = async (mode: "png" | "mp4") => {
    setMessage(null);
    try { const j = await contentStudioApi.triptychRender(opts, mode); if (j) setJob(j); }
    catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "Gagal memulai render" }); }
  };
  const download = (name: string) => job && contentStudioApi.download(job.id, name).catch((e) => setMessage({ ok: false, text: e instanceof Error ? e.message : "Gagal" }));
  const downloadAll = async () => { for (const f of job?.files ?? []) { await contentStudioApi.download(job!.id, f.name); await new Promise((r) => setTimeout(r, 400)); } };
  const copy = (text: string, what: string) => navigator.clipboard.writeText(text).then(() => setMessage({ ok: true, text: `${what} disalin.` }));
  const busy = job?.status === "running";
  // dashed guide = where one post ends and the next begins (in grid mode: where Instagram's 3:4 crop makes the visible parts meet)
  const guideX = opts.seam === "grid" ? [1044, 2052] : [1080, 2160];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="min-w-0 rounded-2xl border border-fg/10 bg-fg/5 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-bold">Pembuka Feed · 3 tile menyambung</p>
            <p className="text-xs text-fg/50">Tiga postingan yang menyatu jadi satu gambar bergerak di baris pertama profil.</p>
          </div>
          <div className="flex gap-2 text-xs">
            <label className="flex cursor-pointer items-center gap-2 rounded-full bg-fg/10 px-3 py-1.5 font-semibold"><input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} />Garis sambungan</label>
            <button onClick={() => setReplay((n) => n + 1)} className="rounded-full border border-fg/20 px-4 py-1.5 font-semibold hover:bg-fg/10">↻ Putar ulang</button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-fg/15 bg-black shadow-xl" style={{ width: PREVIEW_W, maxWidth: "100%", height: CANVAS_H * scale, position: "relative" }}>
          {html && <iframe key={replay} title="Pembuka Feed" srcDoc={html} sandbox="allow-scripts" style={{ width: canvasW, height: CANVAS_H, border: 0, transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none" }} />}
          {guides && guideX.map((x) => <div key={x} style={{ position: "absolute", left: x * scale, top: 0, bottom: 0, borderLeft: "2px dashed rgba(255,255,255,.7)", pointerEvents: "none" }} />)}
          {guides && ["Kiri", "Tengah", "Kanan"].map((l, i) => <span key={l} style={{ position: "absolute", left: (i * pitch + 60) * scale, bottom: 6 }} className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white">{i + 1} · {l}</span>)}
        </div>
        <p className="mt-2 text-[11px] text-fg/45">
          {opts.seam === "panorama"
            ? "Mode Panorama: tiga PNG menyambung persis jika diletakkan berdampingan. Grid Instagram memotong ±36 px di kiri-kanan tiap postingan, jadi di grid sambungannya bisa bergeser sedikit."
            : "Mode Grid 3:4: tile bertumpang-tindih 72 px supaya bagian yang terlihat di grid Instagram menyambung. PNG-nya sendiri tampak tumpang-tindih jika diletakkan berdampingan."}
        </p>

        <div className="mt-4 w-full max-w-[640px] rounded-xl border border-fg/10 bg-canvas p-3">
          <div className="flex flex-wrap items-center gap-2">
            <button disabled={!env?.chrome || busy} onClick={() => render("png")} className="rounded-full bg-fg px-4 py-2 text-xs font-bold text-canvas disabled:opacity-40">Render 3 tile PNG</button>
            <button disabled={!env?.chrome || !env?.ffmpeg || busy} onClick={() => render("mp4")} className="rounded-full bg-accent px-4 py-2 text-xs font-bold text-white disabled:opacity-40">Render 3 tile MP4 (HD)</button>
            {env && !env.chrome && <span className="text-[11px] text-amber-600">Chrome tidak terdeteksi di PC server.</span>}
          </div>
          {message && <p className={`mt-2 text-xs ${message.ok ? "text-emerald-600" : "text-red-500"}`}>{message.text}</p>}
          {job && (
            <div className="mt-3 text-xs">
              {job.status === "running" && (<><div className="h-2 overflow-hidden rounded-full bg-fg/10"><div className="h-full bg-accent transition-all" style={{ width: `${Math.round(job.progress * 100)}%` }} /></div><p className="mt-1 text-fg/60">{job.label} · {Math.round(job.progress * 100)}%{job.mode === "trio-mp4" ? " (±30–60 detik)" : ""}</p></>)}
              {job.status === "error" && <p className="text-red-500">Gagal: {job.error}</p>}
              {job.status === "done" && (
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between"><span className="font-semibold text-emerald-600">Selesai ✓</span><button onClick={downloadAll} className="font-semibold text-accent underline">Unduh semua</button></div>
                  {job.files.map((f) => (<button key={f.name} onClick={() => download(f.name)} className="flex items-center justify-between rounded-lg bg-fg/5 px-3 py-2 text-left hover:bg-fg/10"><span className="truncate">{f.name}</span><span className="ml-3 shrink-0 text-fg/50">{fileSize(f.size)} ↓</span></button>))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <aside className="grid content-start gap-4">
        <div className="grid gap-3 rounded-2xl border border-fg/10 bg-fg/5 p-4">
          <div className="flex items-center justify-between"><p className="text-sm font-bold">Pengaturan</p><button onClick={() => setOpts(DEFAULTS)} className="text-xs font-semibold text-accent underline">Kembalikan default</button></div>
          <Field label="Mode sambungan">
            <select className={inputClass} value={opts.seam} onChange={(e) => set("seam", e.target.value as CsTriptych["seam"])}>
              <option value="panorama">Panorama: PNG menyambung persis</option>
              <option value="grid">Grid 3:4: mulus di grid Instagram</option>
            </select>
          </Field>
          <Field label="Logo (tile kiri)">
            <select className={inputClass} value={opts.logoStyle} onChange={(e) => set("logoStyle", e.target.value as CsTriptych["logoStyle"])}>
              <option value="silver">Silver metalik (tanpa kotak)</option>
              <option value="squircle-white">Ikon kaca putih</option>
              <option value="squircle-dark">Ikon kaca gelap</option>
            </select>
          </Field>
          <Field label="Judul tile tengah" hint="( | = baris baru, maks 2 baris )"><input className={inputClass} value={opts.comingTitle} onChange={(e) => set("comingTitle", e.target.value)} /></Field>
          <Field label="Teks di bawah judul"><input className={inputClass} value={opts.comingSub} onChange={(e) => set("comingSub", e.target.value)} /></Field>
          <Field label="Judul tile kanan" hint="( maks 3 baris )"><input className={inputClass} value={opts.headline} onChange={(e) => set("headline", e.target.value)} /></Field>
          <Field label="Daftar fitur" hint="( pisah dengan | )"><input className={inputClass} value={opts.features} onChange={(e) => set("features", e.target.value)} /></Field>
          <Field label="Tombol ajakan"><input className={inputClass} value={opts.cta} onChange={(e) => set("cta", e.target.value)} /></Field>
        </div>

        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs leading-relaxed text-fg/80">
          <p className="mb-1.5 text-sm font-bold text-fg">Urutan unggah (penting)</p>
          <p>Grid Instagram menaruh postingan <b>terbaru di kiri atas</b>. Unggah dari <b>kanan ke kiri</b>:</p>
          <ol className="mt-1.5 grid list-decimal gap-0.5 pl-5 font-semibold">
            <li>feed-3-kanan-all-in-one (pertama)</li>
            <li>feed-2-tengah-coming-soon</li>
            <li>feed-1-kiri-logo (terakhir)</li>
          </ol>
          <p className="mt-2">Untuk MP4, pilih <b>cover dari file PNG</b> yang bernama sama (Edit sampul → Tambah dari galeri), karena frame pertama video belum lengkap. Jangan dipangkas sendiri.</p>
        </div>

        <div className="grid gap-2 rounded-2xl border border-fg/10 bg-fg/5 p-4">
          <p className="text-sm font-bold">Usulan caption</p>
          {CAPTIONS.map(([label, text]) => (
            <div key={label} className="rounded-lg bg-fg/5 p-3">
              <p className="text-[11px] font-semibold text-fg/50">{label}</p>
              <p className="mt-1 text-xs">{text}</p>
              <button onClick={() => copy(text, "Caption")} className="mt-2 rounded-full border border-fg/20 px-3 py-1 text-[11px] font-semibold hover:bg-fg/10">Salin</button>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
