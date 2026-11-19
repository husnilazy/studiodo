import { useEffect, useMemo, useState } from "react";
import Select from "@/components/Select";
import { contentStudioApi, type CsDeck, type CsPost, type CsPostStatus, type CsQueue } from "@/lib/superadminApi";
import { ScheduleDialog } from "./ScheduleDialog";
import { btnAccent, btnGhost, btnPrimary, dayKey, dayLabel, errText, fromLocalInput, inputClass, StatusChip, timeOf, toLocalInput, type Notice, NoticeLine, Field } from "./shared";

// Kalender: every queued post by day, with the actions that make sense for its status.

const FILTERS: { id: "semua" | "perhatian" | CsPostStatus; label: string }[] = [
  { id: "semua", label: "Semua" }, { id: "perhatian", label: "Perlu tindakan" }, { id: "draft", label: "Draf" }, { id: "scheduled", label: "Terjadwal" },
  { id: "ready", label: "Siap" }, { id: "posted", label: "Tayang" }, { id: "failed", label: "Gagal" },
];

export function CalendarView({ queue, decks, onChange, onOpenDeck }: { queue: CsQueue; decks: CsDeck[]; onChange: () => Promise<void>; onOpenDeck: (id: string) => void }) {
  const { posts, settings, connected } = queue;
  const tz = settings.tzOffsetMin;
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("semua");
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pickDeck, setPickDeck] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [n, setN] = useState<Notice>(null);

  const needsAttention = (p: CsPost) => p.status === "draft" || p.status === "failed" || (p.status === "ready" && (p.mode === "manual" || !connected));
  const shown = useMemo(() => posts.filter((p) => filter === "semua" || (filter === "perhatian" ? needsAttention(p) : p.status === filter)), [posts, filter, connected]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, f.id === "semua" ? posts.length : f.id === "perhatian" ? posts.filter(needsAttention).length : posts.filter((p) => p.status === f.id).length])), [posts, connected]); // eslint-disable-line react-hooks/exhaustive-deps
  const days = useMemo(() => {
    const m = new Map<string, CsPost[]>();
    for (const p of shown) m.set(dayKey(p.scheduledAt, tz), [...(m.get(dayKey(p.scheduledAt, tz)) ?? []), p]);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [shown, tz]);
  const today = dayKey(new Date().toISOString(), tz);
  const drafts = posts.filter((p) => p.status === "draft").length;

  // keep the list fresh while something is rendering/posting
  const busyServer = posts.some((p) => p.status === "preparing" || p.status === "posting");
  useEffect(() => { const t = setInterval(() => { void onChange(); }, busyServer ? 4000 : 30000); return () => clearInterval(t); }, [busyServer, onChange]);

  const run = async (id: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusyId(id); setN(null);
    try { await fn(); await onChange(); if (ok) setN({ ok: true, text: ok }); } catch (e) { setN({ ok: false, text: errText(e) }); } finally { setBusyId(null); }
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)} className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${filter === f.id ? "bg-fg text-canvas" : "bg-fg/10 text-fg/70 hover:bg-fg/20"}`}>
              {f.label} <span className="opacity-60">{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {drafts > 0 && <button className={btnAccent} onClick={() => run("all", () => contentStudioApi.approvePosts(), `${drafts} draf disetujui. Akan dirender & tayang sesuai jadwal.`)}>Setujui semua draf ({drafts})</button>}
          <button className={btnPrimary} onClick={() => setAdding(true)}>+ Jadwalkan deck</button>
        </div>
      </div>
      <NoticeLine n={n} />
      {!connected && posts.some((p) => p.mode === "auto" && p.status !== "posted") && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">Instagram belum tersambung, jadi post bermode Auto akan berhenti di &ldquo;Siap tayang&rdquo;. Sambungkan di tab Pengaturan, atau unduh filenya dan posting manual.</p>
      )}

      {days.length === 0 && (
        <div className="rounded-2xl border border-dashed border-fg/20 p-10 text-center text-sm text-fg/50">
          {posts.length === 0 ? "Kalender masih kosong. Buat konten di tab Generator lalu isi kalender dengan Autopilot, atau jadwalkan deck dari Studio." : "Tidak ada post pada filter ini."}
        </div>
      )}

      {days.map(([key, list]) => (
        <section key={key} className="grid gap-2">
          <h3 className={`text-xs font-bold uppercase tracking-wider ${key === today ? "text-accent" : "text-fg/50"}`}>{dayLabel(key, today)}</h3>
          {list.map((p) => {
            const busy = busyId === p.id || p.status === "preparing" || p.status === "posting";
            const deck = decks.find((d) => d.id === p.deckId);
            return (
              <article key={p.id} className="rounded-2xl border border-fg/10 bg-fg/5 p-3.5">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="w-14 shrink-0 text-center">
                    <p className="font-mono text-lg font-bold leading-none">{timeOf(p.scheduledAt, tz)}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-fg/40">{p.format === "reel" ? "Reel" : "Carousel"}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <StatusChip post={p} />
                      <span className="rounded-full bg-fg/10 px-2.5 py-1 text-[11px] font-semibold text-fg/60">{p.mode === "auto" ? "Auto-post" : "Manual"}</span>
                      {p.status === "ready" && p.mode === "auto" && !connected && <span className="text-[11px] text-amber-600">menunggu koneksi Instagram</span>}
                      {p.status === "ready" && p.mode === "manual" && <span className="text-[11px] text-fg/50">unduh file lalu posting sendiri</span>}
                      {p.permalink && <a className="text-[11px] font-semibold text-accent underline" href={p.permalink} target="_blank" rel="noreferrer">Lihat di Instagram</a>}
                    </div>
                    {p.error && <p className="mt-1.5 text-xs text-red-500">{p.error}</p>}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {busy && <span className="text-[11px] text-fg/50">sedang diproses…</span>}
                    {!busy && p.status === "draft" && <button className={btnAccent} onClick={() => run(p.id, () => contentStudioApi.approvePosts([p.id]))}>Setujui</button>}
                    {!busy && (p.status === "scheduled" || p.status === "ready") && <button className={btnGhost} onClick={() => run(p.id, () => contentStudioApi.postNow(p.id), p.mode === "auto" ? "Dikirim dalam hitungan detik–menit." : "Disiapkan sekarang.")}>{p.mode === "auto" ? "Kirim sekarang" : "Siapkan sekarang"}</button>}
                    {!busy && p.status === "ready" && (p.files ?? []).map((f) => <button key={f} className={btnGhost} onClick={() => run(p.id, () => contentStudioApi.downloadPostFile(p.id, f))}>{(p.files ?? []).length > 1 ? `↓ ${f.replace(/.*-(\d+)\.\w+$/, "slide $1")}` : "↓ Unduh"}</button>)}
                    {!busy && (p.status === "ready" || p.status === "scheduled") && p.mode === "manual" && <button className={btnPrimary} onClick={() => run(p.id, () => contentStudioApi.markPosted(p.id))}>Tandai terposting</button>}
                    {!busy && p.status === "failed" && <button className={btnAccent} onClick={() => run(p.id, () => contentStudioApi.retryPost(p.id))}>Ulangi</button>}
                    {!busy && p.status === "skipped" && <button className={btnGhost} onClick={() => run(p.id, () => contentStudioApi.patchPost(p.id, { status: "scheduled" }))}>Aktifkan lagi</button>}
                    {!busy && p.status !== "posted" && <button className={btnGhost} onClick={() => setEditing(editing === p.id ? null : p.id)}>{editing === p.id ? "Tutup" : "Edit"}</button>}
                    {!busy && (p.status === "scheduled" || p.status === "ready") && <button className={btnGhost} onClick={() => run(p.id, () => contentStudioApi.patchPost(p.id, { status: "draft" }))}>Jadikan draf</button>}
                    {!busy && p.status !== "posted" && <button className="rounded-full px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-500/10" onClick={() => { if (window.confirm("Hapus post ini dari kalender?")) void run(p.id, () => contentStudioApi.deletePost(p.id)); }}>Hapus</button>}
                  </div>
                </div>
                {editing === p.id && <EditPost post={p} tz={tz} deckExists={!!deck} onOpenDeck={() => onOpenDeck(p.deckId)} onSave={async (patch) => { await run(p.id, () => contentStudioApi.patchPost(p.id, patch), "Perubahan disimpan."); setEditing(null); }} />}
                {p.log.length > 0 && editing === p.id && <ul className="mt-2 grid gap-0.5 border-t border-fg/10 pt-2 font-mono text-[10.5px] text-fg/40">{p.log.slice().reverse().map((l, i) => <li key={i}>{l}</li>)}</ul>}
              </article>
            );
          })}
        </section>
      ))}

      {adding && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setAdding(false); }}>
          <div className="w-full max-w-md rounded-2xl border border-fg/15 bg-canvas p-5 shadow-2xl">
            <h3 className="text-base font-bold">Pilih deck untuk dijadwalkan</h3>
            <Select className={inputClass} value={pickDeck} onChange={(e) => setPickDeck(e.target.value)}>
              <option value="">— pilih deck —</option>
              {decks.filter((d) => d.format !== "highlight").map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
            </Select>
            <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setAdding(false)}>Batal</button></div>
          </div>
        </div>
      )}
      {adding && pickDeck && decks.find((d) => d.id === pickDeck) && (
        <ScheduleDialog deck={decks.find((d) => d.id === pickDeck)!} settings={settings} connected={connected} takenIso={posts.map((p) => p.scheduledAt)} onClose={() => { setAdding(false); setPickDeck(""); }}
          onDone={(m) => { setAdding(false); setPickDeck(""); setN({ ok: true, text: m }); void onChange(); }} />
      )}
    </div>
  );
}

function EditPost({ post, tz, deckExists, onSave, onOpenDeck }: { post: CsPost; tz: number; deckExists: boolean; onSave: (p: Parameters<typeof contentStudioApi.patchPost>[1]) => Promise<void>; onOpenDeck: () => void }) {
  const [when, setWhen] = useState(toLocalInput(post.scheduledAt, tz));
  const [mode, setMode] = useState(post.mode);
  const [media, setMedia] = useState(post.carouselMedia);
  const [caption, setCaption] = useState(post.caption);
  const [tags, setTags] = useState(post.hashtags.join(" "));
  return (
    <div className="mt-3 grid gap-3 border-t border-fg/10 pt-3 md:grid-cols-2">
      <div className="grid content-start gap-3">
        <Field label="Waktu tayang (WIB)"><input type="datetime-local" className={inputClass} value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
        <Field label="Cara posting"><Select className={inputClass} value={mode} onChange={(e) => setMode(e.target.value as "auto" | "manual")}><option value="auto">Auto-post</option><option value="manual">Manual</option></Select></Field>
        {post.format === "carousel" && <Field label="Isi carousel" hint="Video: tiap slide jadi klip beranimasi (render lebih lama)."><Select className={inputClass} value={media} onChange={(e) => setMedia(e.target.value as "image" | "video")}><option value="image">Gambar JPEG (cepat)</option><option value="video">Video per slide (animasi)</option></Select></Field>}
      </div>
      <div className="grid content-start gap-3">
        <Field label="Caption"><textarea rows={7} className={inputClass} value={caption} onChange={(e) => setCaption(e.target.value)} /></Field>
        <Field label="Hashtag (pisah spasi)"><input className={inputClass} value={tags} onChange={(e) => setTags(e.target.value)} /></Field>
      </div>
      <div className="flex flex-wrap justify-end gap-2 md:col-span-2">
        {deckExists && <button className={btnGhost} onClick={onOpenDeck}>Buka desain di Studio</button>}
        <button className={btnPrimary} onClick={() => onSave({ scheduledAt: fromLocalInput(when, tz), mode, carouselMedia: media, caption, hashtags: tags.split(/\s+/).filter(Boolean) })}>Simpan perubahan</button>
      </div>
    </div>
  );
}
