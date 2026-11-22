import { useEffect, useRef, useState } from "react";
import { contentStudioApi, type CsDeck } from "@/lib/superadminApi";
import { btnGhost, btnPrimary, errText } from "./shared";
import { SlidePreview } from "./ReviewView";

// Pratinjau: watch a reel before it posts (rendered on the server PC with the real voice-over, music and effects, the same pipeline
// as the post itself), or flip through the slides of a carousel. Reels take about a minute the first time and are kept for a day.

export type PreviewTarget = { title: string; deck?: CsDeck; storyReelId?: string };

const keyOf = (t: PreviewTarget) => (t.storyReelId ? `story-${t.storyReelId}` : (t.deck?.id ?? "").replace(/[^a-zA-Z0-9-]/g, ""));

function ReelPlayer({ target }: { target: PreviewTarget }) {
  const [url, setUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState("Menyiapkan…");
  const [err, setErr] = useState<string | null>(null);
  const [secs, setSecs] = useState(0);
  const [run, setRun] = useState(0); // bump = render again
  const startedAt = useRef(Date.now());
  const key = keyOf(target);

  useEffect(() => {
    let live = true; let timer: ReturnType<typeof setTimeout> | undefined; let made: string | null = null;
    setUrl(null); setErr(null); startedAt.current = Date.now(); setSecs(0); setMsg("Menyiapkan…");
    const poll = async () => {
      try {
        const st = await contentStudioApi.videoPreviewState(key);
        if (!live) return;
        if (st?.status === "ready") { made = await contentStudioApi.videoPreviewUrl(key); if (live) setUrl(made); return; }
        if (st?.status === "failed") { setErr(st.error ?? "Render gagal"); return; }
        setMsg(st?.status === "rendering" ? "Merender di PC server (suara, musik, efek)…" : "Mengantre…");
        timer = setTimeout(poll, 2500);
      } catch (e) { if (live) setErr(errText(e)); }
    };
    (async () => {
      try {
        const st = await contentStudioApi.startVideoPreview(target.storyReelId ? { storyReelId: target.storyReelId } : { deckId: target.deck?.id }, run > 0);
        if (!live) return;
        if (st?.status === "failed") { setErr(st.error ?? "Render gagal"); return; }
        void poll();
      } catch (e) { if (live) setErr(errText(e)); }
    })();
    return () => { live = false; if (timer) clearTimeout(timer); if (made) URL.revokeObjectURL(made); };
  }, [key, run]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (url || err) return;
    const t = setInterval(() => setSecs(Math.round((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [url, err, run]);

  if (err) return (
    <div className="grid gap-3 p-6 text-center">
      <p className="text-sm text-red-500">{err}</p>
      <div><button className={btnGhost} onClick={() => setRun((r) => r + 1)}>Coba lagi</button></div>
    </div>
  );
  if (!url) return (
    <div className="grid place-items-center gap-3 p-10 text-center">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-fg/20 border-t-accent" />
      <p className="text-sm font-semibold">{msg}</p>
      <p className="text-xs text-fg/50">{secs} detik. Pertama kali sekitar 40 sampai 90 detik, berikutnya langsung tampil.</p>
    </div>
  );
  return (
    <div className="grid gap-3">
      <video src={url} controls autoPlay playsInline className="mx-auto max-h-[72vh] w-auto max-w-full rounded-xl bg-black" style={{ aspectRatio: "9 / 16" }} />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg/55">
        <span>Sama dengan yang dikirim ke Instagram (1080×1920, dengan suara).</span>
        <button className={btnGhost} onClick={() => setRun((r) => r + 1)}>Render ulang</button>
      </div>
    </div>
  );
}

function CarouselViewer({ deck }: { deck: CsDeck }) {
  const [i, setI] = useState(0);
  const [replay, setReplay] = useState(0);
  const n = deck.slides.length;
  return (
    <div className="mx-auto grid w-full max-w-md gap-3">
      <SlidePreview deck={deck} index={i} replay={replay} />
      <div className="flex items-center justify-between gap-2">
        <button className={btnGhost} disabled={i === 0} onClick={() => setI(i - 1)} aria-label="Slide sebelumnya">‹</button>
        <div className="flex items-center gap-1.5">{Array.from({ length: n }, (_, k) => <button key={k} onClick={() => setI(k)} aria-label={`Slide ${k + 1}`} className={`h-2 rounded-full transition-all ${k === i ? "w-5 bg-accent" : "w-2 bg-fg/25"}`} />)}</div>
        <button className={btnGhost} disabled={i >= n - 1} onClick={() => setI(i + 1)} aria-label="Slide berikutnya">›</button>
      </div>
      <div className="flex items-center justify-between text-xs text-fg/55"><span>Slide {i + 1} dari {n}</span><button className={btnGhost} onClick={() => setReplay(replay + 1)}>Putar ulang animasi</button></div>
    </div>
  );
}

export function PreviewModal({ target, onClose }: { target: PreviewTarget; onClose: () => void }) {
  const isReel = !!target.storyReelId || target.deck?.format === "reel";
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-label={`Pratinjau ${target.title}`} className="w-full max-w-lg rounded-2xl border border-fg/15 bg-canvas p-4 shadow-2xl">
        <header className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-wider text-fg/45">Pratinjau {isReel ? "reel" : "carousel"}</p><h3 className="truncate text-sm font-bold">{target.title}</h3></div>
          <button className={btnPrimary} onClick={onClose}>Tutup</button>
        </header>
        {isReel ? <ReelPlayer target={target} /> : target.deck ? <CarouselViewer deck={target.deck} /> : <p className="p-6 text-center text-sm text-fg/50">Desain post ini tidak ditemukan di Studio.</p>}
      </div>
    </div>
  );
}

/** What to preview for a calendar post: a story reel plays the voiced video; any other reel renders its deck; a carousel flips slides. */
export const previewTargetFor = (title: string, deck?: CsDeck): PreviewTarget => ({ title, deck, storyReelId: deck?.storyReel });
