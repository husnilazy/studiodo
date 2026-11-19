import { useEffect, useMemo, useRef, useState } from "react";
import { contentStudioApi, type CsDeck, type CsPost, type CsQueue } from "@/lib/superadminApi";
import { btnAccent, btnGhost, btnPrimary, dayKey, dayLabel, errText, type Notice, NoticeLine, StatusChip, timeOf } from "./shared";
import type { Tab } from "./OverviewView";

// Tinjau: phone-first review of what is waiting to go out. One post per card with the real slide preview (the same HTML the
// renderer uses, scaled to the screen), the caption, any claim warning, and the approve / send / delete actions.

const cache = new Map<string, string>();

function SlidePreview({ deck, index, replay }: { deck: CsDeck; index: number; replay: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  const [html, setHtml] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const key = `${deck.id}:${index}:${deck.updatedAt ?? ""}`;
  const H = deck.format === "reel" ? 1920 : 1350;

  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 320));
    ro.observe(el); setW(el.clientWidth || 320);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    let live = true; setErr(null);
    const hit = cache.get(key);
    if (hit) { setHtml(hit); return; }
    setHtml(null);
    contentStudioApi.preview(deck, index).then((r) => { if (!live || !r) return; cache.set(key, r.html); setHtml(r.html); }).catch((e) => live && setErr(errText(e, "Preview gagal dimuat")));
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const scale = w / 1080;
  return (
    <div ref={box} className="relative w-full overflow-hidden rounded-xl bg-black" style={{ height: H * scale }}>
      {html ? <iframe key={replay} title={`Preview ${deck.title} ${index + 1}`} srcDoc={html} sandbox="allow-scripts" scrolling="no" style={{ width: 1080, height: H, border: 0, transform: `scale(${scale})`, transformOrigin: "top left" }} />
        : <p className="absolute inset-0 grid place-items-center px-4 text-center text-xs text-white/60">{err ?? "Memuat preview…"}</p>}
    </div>
  );
}

function ReviewCard({ post, deck, warn, tz, connected, busy, onApprove, onDraft, onSendNow, onDelete, onEdit }: {
  post: CsPost; deck?: CsDeck; warn?: string; tz: number; connected: boolean; busy: boolean;
  onApprove: () => void; onDraft: () => void; onSendNow: () => void; onDelete: () => void; onEdit: () => void;
}) {
  const [i, setI] = useState(0);
  const [replay, setReplay] = useState(0);
  const slides = deck?.slides.length ?? 0;
  const isReel = post.format === "reel";
  const today = dayKey(new Date().toISOString(), tz);
  const when = `${dayLabel(dayKey(post.scheduledAt, tz), today)} · ${timeOf(post.scheduledAt, tz)} WIB`;
  const goesOut = post.mode === "auto" ? (connected ? "Setelah disetujui, tayang otomatis di waktu ini." : "Instagram belum tersambung, berhenti di “Siap tayang”.") : "Mode manual: Anda posting sendiri setelah file siap.";

  return (
    <article className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 rounded-2xl border border-fg/10 bg-fg/5 p-3">
      <header className="flex flex-wrap items-center gap-2">
        <StatusChip post={post} />
        <span className="rounded-full bg-fg/10 px-2.5 py-1 text-[11px] font-semibold text-fg/60">{isReel ? "Reel" : "Carousel"}{deck?.theme ? ` · ${deck.theme}` : ""}</span>
        <span className="ml-auto text-[11px] font-semibold text-fg/50">{when}</span>
      </header>
      <h3 className="text-sm font-bold leading-snug">{post.title}</h3>

      {deck ? (
        <div className="mx-auto w-full" style={{ maxWidth: isReel ? 300 : 420 }}>
          <SlidePreview deck={deck} index={isReel ? 0 : i} replay={replay} />
          <div className="mt-2 flex items-center justify-between gap-2">
            {!isReel ? (
              <>
                <button className={btnGhost} disabled={i === 0} onClick={() => setI(i - 1)} aria-label="Slide sebelumnya">‹</button>
                <div className="flex items-center gap-1.5" aria-label={`Slide ${i + 1} dari ${slides}`}>
                  {Array.from({ length: slides }, (_, k) => <button key={k} onClick={() => setI(k)} aria-label={`Slide ${k + 1}`} className={`h-2 rounded-full transition-all ${k === i ? "w-5 bg-accent" : "w-2 bg-fg/25"}`} />)}
                </div>
                <button className={btnGhost} disabled={i >= slides - 1} onClick={() => setI(i + 1)} aria-label="Slide berikutnya">›</button>
              </>
            ) : <p className="text-[11px] text-fg/50">Preview reel diputar utuh.</p>}
            <button className={btnGhost} onClick={() => setReplay(replay + 1)}>Putar ulang</button>
          </div>
        </div>
      ) : <p className="rounded-xl border border-dashed border-fg/20 p-4 text-center text-xs text-fg/50">Desain untuk post ini tidak ditemukan di Studio (mungkin dihapus).</p>}

      {warn && <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300"><b>Cek klaim dulu:</b> {warn}</p>}
      {post.error && <p className="text-xs text-red-500">{post.error}</p>}

      <details className="rounded-xl bg-fg/5 p-3 text-xs">
        <summary className="cursor-pointer font-semibold">Caption &amp; hashtag</summary>
        <p className="mt-2 whitespace-pre-wrap leading-relaxed text-fg/80">{post.caption}</p>
        {post.hashtags.length > 0 && <p className="mt-2 break-words text-fg/50">{post.hashtags.join(" ")}</p>}
      </details>

      <p className="text-[11px] text-fg/50">{goesOut}</p>

      <div className="flex flex-wrap gap-2">
        {busy && <span className="py-1.5 text-xs text-fg/50">Sedang diproses…</span>}
        {!busy && post.status === "draft" && <button className={btnAccent} onClick={onApprove}>Setujui</button>}
        {!busy && (post.status === "scheduled" || post.status === "ready") && <button className={btnGhost} onClick={onDraft}>Kembalikan ke draf</button>}
        {!busy && (post.status === "scheduled" || post.status === "ready") && <button className={btnPrimary} onClick={onSendNow}>{post.mode === "auto" ? "Kirim sekarang" : "Siapkan sekarang"}</button>}
        {!busy && <button className={btnGhost} onClick={onEdit}>Edit di Kalender</button>}
        {!busy && post.status !== "posted" && <button className="rounded-full px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-500/10" onClick={onDelete}>Hapus</button>}
      </div>
    </article>
  );
}

export function ReviewView({ queue, decks, onChange, go }: { queue: CsQueue; decks: CsDeck[]; onChange: () => Promise<void>; go: (t: Tab) => void }) {
  const { posts, settings, connected } = queue;
  const [show, setShow] = useState<"tinjau" | "jadwal">("tinjau");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [n, setN] = useState<Notice>(null);
  const [checks, setChecks] = useState<Record<string, string>>({});

  useEffect(() => {
    contentStudioApi.features().then((r) => setChecks(Object.fromEntries((r?.features ?? []).filter((f) => f.check).map((f) => [f.id, f.check as string])))).catch(() => undefined);
  }, []);

  const review = useMemo(() => posts.filter((p) => p.status === "draft" || p.status === "failed").sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)), [posts]);
  const upcoming = useMemo(() => posts.filter((p) => ["scheduled", "preparing", "ready", "posting"].includes(p.status)).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)), [posts]);
  const list = show === "tinjau" ? review : upcoming;
  const drafts = posts.filter((p) => p.status === "draft").length;

  const run = async (id: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusyId(id); setN(null);
    try { await fn(); await onChange(); if (ok) setN({ ok: true, text: ok }); } catch (e) { setN({ ok: false, text: errText(e) }); } finally { setBusyId(null); }
  };

  return (
    <div className="mx-auto grid w-full min-w-0 max-w-xl grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {([["tinjau", `Perlu ditinjau ${review.length}`], ["jadwal", `Terjadwal ${upcoming.length}`]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setShow(id)} className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${show === id ? "bg-fg text-canvas" : "bg-fg/10 text-fg/70"}`}>{label}</button>
        ))}
        {show === "tinjau" && drafts > 1 && <button className={`${btnAccent} ml-auto`} onClick={() => { if (window.confirm(`Setujui ${drafts} draf? Yang bermode Auto akan tayang sesuai jadwal masing-masing.`)) void run("all", () => contentStudioApi.approvePosts(), `${drafts} draf disetujui.`); }}>Setujui semua ({drafts})</button>}
      </div>
      <NoticeLine n={n} />
      {!connected && <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">Instagram belum tersambung (tab Pengaturan). Post Auto berhenti di “Siap tayang” sampai tersambung.</p>}

      {list.length === 0 && (
        <div className="rounded-2xl border border-dashed border-fg/20 p-8 text-center text-sm text-fg/50">
          {show === "tinjau" ? "Tidak ada konten yang menunggu tinjauan." : "Belum ada yang terjadwal."}
          <div className="mt-3"><button className={btnGhost} onClick={() => go("generator")}>Buat konten di Generator</button></div>
        </div>
      )}

      {list.map((p) => (
        <ReviewCard key={p.id} post={p} deck={decks.find((d) => d.id === p.deckId)} warn={p.featureId ? checks[p.featureId] : undefined} tz={settings.tzOffsetMin} connected={connected}
          busy={busyId === p.id || p.status === "preparing" || p.status === "posting"}
          onApprove={() => void run(p.id, () => contentStudioApi.approvePosts([p.id]), "Disetujui.")}
          onDraft={() => void run(p.id, () => contentStudioApi.patchPost(p.id, { status: "draft" }), "Dikembalikan ke draf.")}
          onSendNow={() => { if (window.confirm(p.mode === "auto" ? "Kirim post ini ke Instagram sekarang?" : "Siapkan file post ini sekarang?")) void run(p.id, () => contentStudioApi.postNow(p.id), p.mode === "auto" ? "Dikirim dalam hitungan detik sampai menit." : "Disiapkan."); }}
          onDelete={() => { if (window.confirm("Hapus post ini dari kalender?")) void run(p.id, () => contentStudioApi.deletePost(p.id)); }}
          onEdit={() => go("kalender")} />
      ))}
    </div>
  );
}
