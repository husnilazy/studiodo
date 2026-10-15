import { useEffect, useState } from "react";
import { useFitWidth } from "@/lib/useFitWidth";
import { contentStudioApi, type CsJob, type CsTeaser } from "@/lib/superadminApi";

// Superadmin → Konten Instagram → Teaser Reel: one continuous 1080×1920 motion graphic (~19 s) that tells the whole story:
// logo reveal → COMING SOON → four product beats (QRIS, shoot & print, results on the phone, dashboard) → All-in-One + call to action.

const inputClass = "mt-1 w-full rounded-lg border border-fg/15 bg-fg/5 px-3 py-2 text-sm outline-none focus:border-accent";
const DEFAULTS: CsTeaser = {
  logoStyle: "silver", comingTitle: "COMING|SOON", beats: "Bayar QRIS|Foto & cetak|Hasil di HP|Pantau dashboard",
  headline: "All-in-One|Photobooth|App & Software", features: "Kiosk|QRIS|Kasir|Galeri", cta: "studiodo.id",
};
const PREVIEW_MAX = 360;
const fileSize = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-fg/60">{label}{hint && <span className="ml-1 font-normal text-fg/40">{hint}</span>}{children}</label>;
}

export function TeaserPanel() {
  const [opts, setOpts] = useState<CsTeaser>(DEFAULTS);
  const [html, setHtml] = useState("");
  const [replay, setReplay] = useState(0);
  const [env, setEnv] = useState<{ chrome: string | null; ffmpeg: boolean } | null>(null);
  const [job, setJob] = useState<CsJob | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [boxRef, boxW] = useFitWidth<HTMLDivElement>(PREVIEW_MAX);
  const scale = boxW / 1080;
  const set = <K extends keyof CsTeaser>(k: K, v: CsTeaser[K]) => setOpts((o) => ({ ...o, [k]: v }));

  useEffect(() => { contentStudioApi.status().then((e) => setEnv(e ?? null)).catch(() => undefined); }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      contentStudioApi.teaserPreview(opts).then((r) => {
        if (r && typeof r.html === "string") { setHtml(r.html); setReplay((n) => n + 1); setMessage(null); }
        else setMessage({ ok: false, text: "Server belum mendukung Teaser Reel. Jalankan build:server, lalu restart service StudiodoServer." });
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

  const render = async () => {
    setMessage(null);
    try { const j = await contentStudioApi.teaserRender(opts); if (j) setJob(j); }
    catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "Gagal memulai render" }); }
  };
  const download = (name: string) => job && contentStudioApi.download(job.id, name).catch((e) => setMessage({ ok: false, text: e instanceof Error ? e.message : "Gagal" }));
  const busy = job?.status === "running";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
      <section className="min-w-0 rounded-2xl border border-fg/10 bg-fg/5 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div><p className="text-sm font-bold">Teaser Reel · 1080×1920</p><p className="text-xs text-fg/50">Satu motion graphic utuh, ±19 detik.</p></div>
          <button onClick={() => setReplay((n) => n + 1)} className="rounded-full border border-fg/20 px-4 py-1.5 text-xs font-semibold hover:bg-fg/10">↻ Putar ulang</button>
        </div>
        <div ref={boxRef} className="w-full" style={{ maxWidth: PREVIEW_MAX }}>
          <div className="overflow-hidden rounded-2xl border border-fg/15 bg-black shadow-xl" style={{ width: boxW, height: 1920 * scale, position: "relative" }}>
            {html && <iframe key={replay} title="Teaser Reel" srcDoc={html} sandbox="allow-scripts" style={{ width: 1080, height: 1920, border: 0, transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none" }} />}
          </div>
        </div>
        <p className="mt-2 text-[11px] text-fg/45">Adegan: logo → COMING SOON → 4 langkah produk → All-in-One. Preview diputar dari awal setiap kali teks berubah.</p>
      </section>

      <div className="grid content-start gap-4">
        <div className="grid gap-3 rounded-2xl border border-fg/10 bg-fg/5 p-4">
          <div className="flex items-center justify-between"><p className="text-sm font-bold">Pengaturan</p><button onClick={() => setOpts(DEFAULTS)} className="text-xs font-semibold text-accent underline">Kembalikan default</button></div>
          <Field label="Logo">
            <select className={inputClass} value={opts.logoStyle} onChange={(e) => set("logoStyle", e.target.value as CsTeaser["logoStyle"])}>
              <option value="silver">Silver metalik (tanpa kotak)</option>
              <option value="squircle-white">Ikon kaca putih</option>
              <option value="squircle-dark">Ikon kaca gelap</option>
            </select>
          </Field>
          <Field label="Judul adegan 2" hint="( | = baris baru, maks 2 baris )"><input className={inputClass} value={opts.comingTitle} onChange={(e) => set("comingTitle", e.target.value)} /></Field>
          <Field label="Empat langkah produk" hint="( pisah dengan | )"><input className={inputClass} value={opts.beats} onChange={(e) => set("beats", e.target.value)} /></Field>
          <Field label="Judul penutup" hint="( maks 3 baris )"><input className={inputClass} value={opts.headline} onChange={(e) => set("headline", e.target.value)} /></Field>
          <Field label="Daftar fitur" hint="( pisah dengan | )"><input className={inputClass} value={opts.features} onChange={(e) => set("features", e.target.value)} /></Field>
          <Field label="Tombol ajakan"><input className={inputClass} value={opts.cta} onChange={(e) => set("cta", e.target.value)} /></Field>
        </div>

        <div className="rounded-xl border border-fg/10 bg-canvas p-3">
          <div className="flex flex-wrap items-center gap-2">
            <button disabled={!env?.chrome || !env?.ffmpeg || busy} onClick={render} className="rounded-full bg-accent px-4 py-2 text-xs font-bold text-white disabled:opacity-40">Render Teaser MP4 (HD)</button>
            <span className="text-[11px] text-fg/50">1080×1920 · 30 fps · ±1 menit</span>
            {env && (!env.chrome || !env.ffmpeg) && <span className="text-[11px] text-amber-600">Chrome atau ffmpeg tidak terdeteksi di PC server.</span>}
          </div>
          {message && <p className={`mt-2 text-xs ${message.ok ? "text-emerald-600" : "text-red-500"}`}>{message.text}</p>}
          {job && (
            <div className="mt-3 text-xs">
              {job.status === "running" && (<><div className="h-2 overflow-hidden rounded-full bg-fg/10"><div className="h-full bg-accent transition-all" style={{ width: `${Math.round(job.progress * 100)}%` }} /></div><p className="mt-1 text-fg/60">{job.label} · {Math.round(job.progress * 100)}%</p></>)}
              {job.status === "error" && <p className="text-red-500">Gagal: {job.error}</p>}
              {job.status === "done" && (
                <div className="grid gap-1.5">
                  <span className="font-semibold text-emerald-600">Selesai ✓</span>
                  {job.files.map((f) => (<button key={f.name} onClick={() => download(f.name)} className="flex items-center justify-between rounded-lg bg-fg/5 px-3 py-2 text-left hover:bg-fg/10"><span className="truncate">{f.name}</span><span className="ml-3 shrink-0 text-fg/50">{fileSize(f.size)} ↓</span></button>))}
                </div>
              )}
            </div>
          )}
        </div>
        <p className="text-[11px] text-fg/45">Videonya tanpa audio: tambahkan musik langsung di Instagram. Pakai PNG cover untuk gambar sampul Reel.</p>
      </div>
    </div>
  );
}
