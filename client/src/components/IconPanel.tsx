import { useEffect, useState } from "react";
import { contentStudioApi, type CsJob } from "@/lib/superadminApi";

// Superadmin → Konten Instagram → Ikon logo: the STUDIODO app icon (glass squircle) in dark and white, as transparent PNGs and profile pictures.

const fileSize = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

export function IconPanel() {
  const [html, setHtml] = useState("");
  const [env, setEnv] = useState<{ chrome: string | null; ffmpeg: boolean } | null>(null);
  const [job, setJob] = useState<CsJob | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const W = 880, scale = W / 1040;

  useEffect(() => {
    contentStudioApi.status().then((e) => setEnv(e ?? null)).catch(() => undefined);
    contentStudioApi.iconPreview()
      .then((r) => { if (r && typeof r.html === "string") setHtml(r.html); else setMessage({ ok: false, text: "Server belum mendukung Ikon logo. Jalankan build:server, lalu restart service StudiodoServer." }); })
      .catch((e) => setMessage({ ok: false, text: e instanceof Error ? e.message : "Preview gagal" }));
  }, []);

  useEffect(() => {
    if (!job || job.status !== "running") return;
    const t = setInterval(() => {
      contentStudioApi.job(job.id).then((j) => { if (j) setJob(j); }).catch((e) => setJob({ ...job, status: "error", error: e instanceof Error ? e.message : "Gagal cek status" }));
    }, 1000);
    return () => clearInterval(t);
  }, [job]);

  const render = async () => {
    setMessage(null);
    try { const j = await contentStudioApi.iconRender(); if (j) setJob(j); }
    catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "Gagal memulai render" }); }
  };
  const download = (name: string) => job && contentStudioApi.download(job.id, name).catch((e) => setMessage({ ok: false, text: e instanceof Error ? e.message : "Gagal" }));
  const downloadAll = async () => { for (const f of job?.files ?? []) { await contentStudioApi.download(job!.id, f.name); await new Promise((r) => setTimeout(r, 400)); } };
  const busy = job?.status === "running";

  return (
    <section className="max-w-[920px] rounded-2xl border border-fg/10 bg-fg/5 p-4">
      <p className="text-sm font-bold">Ikon logo STUDIODO</p>
      <p className="mb-3 text-xs text-fg/50">Logo silver metalik tanpa kotak (dipakai di tile pertama Pembuka Feed dan cover Sorotan "Kenalan"), plus ikon kaca versi gelap dan putih untuk keperluan ikon aplikasi.</p>
      <div className="overflow-hidden rounded-2xl border border-fg/15 shadow-xl" style={{ width: W, maxWidth: "100%", height: 520 * scale }}>
        {html && <iframe title="Ikon logo" srcDoc={html} sandbox="allow-scripts" style={{ width: 1040, height: 520, border: 0, transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none" }} />}
      </div>
      <div className="mt-4 w-full max-w-[640px] rounded-xl border border-fg/10 bg-canvas p-3">
        <div className="flex flex-wrap items-center gap-2">
          <button disabled={!env?.chrome || busy} onClick={render} className="rounded-full bg-fg px-4 py-2 text-xs font-bold text-canvas disabled:opacity-40">Render logo &amp; ikon (6 file PNG)</button>
          <span className="text-[11px] text-fg/50">Logo silver transparan, ikon kaca, dan foto profil Instagram</span>
        </div>
        {message && <p className={`mt-2 text-xs ${message.ok ? "text-emerald-600" : "text-red-500"}`}>{message.text}</p>}
        {job && (
          <div className="mt-3 text-xs">
            {job.status === "running" && (<><div className="h-2 overflow-hidden rounded-full bg-fg/10"><div className="h-full bg-accent transition-all" style={{ width: `${Math.round(job.progress * 100)}%` }} /></div><p className="mt-1 text-fg/60">{job.label} · {Math.round(job.progress * 100)}%</p></>)}
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
  );
}
