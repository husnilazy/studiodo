import { useEffect, useMemo, useState } from "react";
import { contentStudioApi, type CsPost, type CsQueue, type CsStoryReel } from "@/lib/superadminApi";
import { PreviewModal, type PreviewTarget } from "./PreviewModal";
import { btnGhost, btnPrimary, dayKey, errText, timeOf, type Notice, NoticeLine } from "./shared";

// Pantau: one checklist of what has actually gone out. Instagram is checked against the Graph API ("Cek ke Instagram");
// TikTok is uploaded by hand, so the owner ticks it here.

type Filter = "semua" | "belum-ig" | "belum-tt" | "lengkap";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "semua", label: "Semua" }, { id: "belum-ig", label: "Belum di Instagram" }, { id: "belum-tt", label: "Belum di TikTok" }, { id: "lengkap", label: "Sudah di keduanya" },
];

const onIg = (p: CsPost) => p.status === "posted" && !p.igGone;

function IgCell({ p }: { p: CsPost }) {
  if (onIg(p)) return <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">✓ Tayang{p.permalink && <a className="ml-1 font-semibold text-accent underline" href={p.permalink} target="_blank" rel="noreferrer">buka</a>}</span>;
  if (p.status === "posted" && p.igGone) return <span className="text-xs font-bold text-red-500">✕ Tidak ada di Instagram</span>;
  if (p.status === "failed") return <span className="text-xs font-bold text-red-500">Gagal kirim</span>;
  return <span className="text-xs font-semibold text-fg/45">Belum ({p.status === "draft" ? "draf" : "terjadwal"})</span>;
}

// Starter pack for a brand-new TikTok account: relatable-problem reels first (strong hook in the first second, nothing that needs a live-app check),
// then the pitch. All of them already have the voice over, so it is download -> upload by hand -> tick.
const TIKTOK_ORDER = ["kenalan", "kesalahan", "urutan", "galeri", "harga", "frame", "hari", "cetak", "pelanggan", "trial"];
const TIKTOK_TAGS = "#photobooth #usahaphotobooth #bisnisphotobooth #fotoboothindonesia #studiodo";
const tiktokCaption = (r: CsStoryReel) => `${r.hook}

Coba gratis di studiodo.id (link di bio) 📸
${TIKTOK_TAGS}`;

function TiktokStarter({ queue, onChange }: { queue: CsQueue; onChange: () => Promise<void> }) {
  const [reels, setReels] = useState<CsStoryReel[]>([]);
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { contentStudioApi.storyReels().then((r) => setReels(r ?? [])).catch(() => undefined); }, []);
  const done = queue.settings.tiktokKeys ?? [];
  const list = TIKTOK_ORDER.map((id) => reels.find((r) => r.id === id)).filter((r): r is CsStoryReel => !!r);
  const toggle = async (id: string, on: boolean) => {
    setErr(null);
    try { await contentStudioApi.saveSettings({ ...queue.settings, tiktokKeys: on ? [...new Set([...done, id])] : done.filter((k) => k !== id) }); await onChange(); } catch (e) { setErr(errText(e)); }
  };
  const copy = async (r: CsStoryReel) => { try { await navigator.clipboard.writeText(tiktokCaption(r)); setCopied(r.id); setTimeout(() => setCopied(null), 1500); } catch { setErr("Tidak bisa menyalin, pilih teksnya manual."); } };
  if (!list.length) return null;
  const next = list.find((r) => !done.includes(r.id));
  return (
    <section className="rounded-2xl border border-accent/30 bg-accent/5 p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div><h3 className="text-sm font-bold">Mulai di TikTok: 10 reel pertama</h3><p className="mt-0.5 max-w-2xl text-xs text-fg/60">Urutan untuk akun baru: mulai dari masalah yang dialami semua pemilik booth (hook kuat di detik pertama), baru pelan-pelan ke penawaran. Satu reel per hari sudah cukup. Tonton, unduh MP4, upload manual di TikTok, lalu centang.</p></div>
        <span className="rounded-full bg-fg/10 px-3 py-1.5 text-xs font-bold">{done.filter((k) => list.some((r) => r.id === k)).length}/{list.length} terupload</span>
      </header>
      {err && <p className="mb-2 text-xs text-red-500">{err}</p>}
      <ol className="grid gap-2">
        {list.map((r, i) => (
          <li key={r.id} className={`grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-xl bg-canvas/60 px-3 py-2.5 sm:grid-cols-[auto_minmax(0,1fr)_auto] ${done.includes(r.id) ? "opacity-55" : ""}`}>
            <span className="grid h-7 w-7 place-items-center rounded-full bg-fg/10 text-xs font-bold">{i + 1}</span>
            <div className="min-w-0"><p className="truncate text-sm font-semibold">{r.title}</p><p className="truncate text-xs text-fg/55">Hook: &ldquo;{r.hook}&rdquo;{next?.id === r.id && <b className="ml-2 text-accent">berikutnya</b>}</p></div>
            <div className="col-span-2 flex flex-wrap items-center gap-1.5 sm:col-span-1 sm:justify-end">
              <button className={btnGhost} onClick={() => setPreview({ title: r.title, storyReelId: r.id })}>▶ Tonton / unduh</button>
              <button className={btnGhost} onClick={() => copy(r)}>{copied === r.id ? "Tersalin ✓" : "Salin caption"}</button>
              <label className="flex cursor-pointer items-center gap-1.5 px-1 text-xs font-semibold"><input type="checkbox" className="h-4 w-4" checked={done.includes(r.id)} onChange={(e) => toggle(r.id, e.target.checked)} />Sudah upload</label>
            </div>
          </li>
        ))}
      </ol>
      <ul className="mt-3 grid gap-1 text-xs text-fg/55"><li>• Upload sekali per hari, jam 12:00 atau 19:00 WIB (jam santai orang scroll).</li><li>• Di TikTok, pilih sendiri suara trending di bawah suara asli kalau mau: volume suara trending kecilkan agar VO tetap terdengar.</li><li>• Balas semua komentar di jam pertama, dan sematkan komentar &ldquo;COBA&rdquo; sebagai ajakan.</li><li>• Cuplikan ini juga bisa dipakai sebagai Instagram Reels, jadi tidak perlu bikin ulang.</li></ul>
      {preview && <PreviewModal target={preview} onClose={() => setPreview(null)} />}
    </section>
  );
}

export function TrackView({ queue, onChange }: { queue: CsQueue; onChange: () => Promise<void> }) {
  const tz = queue.settings.tzOffsetMin;
  const [filter, setFilter] = useState<Filter>("semua");
  const [showHidden, setShowHidden] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [n, setN] = useState<Notice>(null);

  // everything that is real content (not a replaced plan), newest first
  const base = useMemo(() => queue.posts.filter((p) => p.status !== "skipped" && (showHidden || !p.hidden)), [queue.posts, showHidden]);
  const rows = useMemo(() => base.filter((p) => filter === "semua" || (filter === "belum-ig" ? !onIg(p) : filter === "belum-tt" ? !p.tiktokAt : onIg(p) && !!p.tiktokAt)), [base, filter]);
  const igDone = base.filter(onIg).length, ttDone = base.filter((p) => p.tiktokAt).length;
  const gone = base.filter((p) => p.status === "posted" && p.igGone).length;
  const byDay = useMemo(() => {
    const m = new Map<string, CsPost[]>();
    for (const p of rows) m.set(dayKey(p.scheduledAt, tz), [...(m.get(dayKey(p.scheduledAt, tz)) ?? []), p]);
    return [...m.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([k, l]) => [k, [...l].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))] as const);
  }, [rows, tz]);

  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id); setN(null);
    try { await fn(); await onChange(); } catch (e) { setN({ ok: false, text: errText(e) }); } finally { setBusy(null); }
  };
  const check = async () => {
    setBusy("check"); setN(null);
    try {
      const r = await contentStudioApi.reconcilePosts(); await onChange();
      setN(!r ? { ok: false, text: "Server tidak membalas" } : r.checked === 0 ? { ok: false, text: "Belum ada post yang bisa dicek (atau Instagram belum tersambung)." } : { ok: !r.gone, text: r.gone ? `${r.gone} dari ${r.checked} post tidak ditemukan di Instagram.` : `${r.checked} post dicek, semuanya masih ada di Instagram.` });
    } catch (e) { setN({ ok: false, text: errText(e) }); } finally { setBusy(null); }
  };

  return (
    <div className="grid gap-4">
      <TiktokStarter queue={queue} onChange={onChange} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-xs font-bold">
          <span className="rounded-full bg-emerald-500/15 px-3 py-1.5 text-emerald-700 dark:text-emerald-300">Instagram {igDone}/{base.length}</span>
          <span className="rounded-full bg-fg/10 px-3 py-1.5">TikTok {ttDone}/{base.length}</span>
          {gone > 0 && <span className="rounded-full bg-red-500/15 px-3 py-1.5 text-red-600">{gone} hilang dari Instagram</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-fg/60"><input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> tampilkan yang disembunyikan</label>
          <button className={btnPrimary} disabled={busy === "check"} onClick={check}>{busy === "check" ? "Mengecek…" : "Cek ke Instagram"}</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => <button key={f.id} onClick={() => setFilter(f.id)} className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${filter === f.id ? "bg-fg text-canvas" : "bg-fg/10 text-fg/70 hover:bg-fg/20"}`}>{f.label}</button>)}
      </div>
      <NoticeLine n={n} />
      <p className="text-xs text-fg/50">Instagram dicek otomatis ke akun (tiap 20 menit dan lewat tombol di atas). TikTok kamu upload sendiri, jadi centang kolom TikTok setelah selesai upload.</p>
      {byDay.length === 0 && <p className="rounded-2xl border border-dashed border-fg/15 p-8 text-center text-sm text-fg/50">Tidak ada post pada filter ini.</p>}
      <div className="grid gap-4">
        {byDay.map(([key, list]) => (
          <section key={key} className="overflow-hidden rounded-2xl border border-fg/10">
            <h3 className="bg-fg/5 px-4 py-2 text-xs font-bold uppercase tracking-wider text-fg/55">{key}</h3>
            <ul className="divide-y divide-fg/10">
              {list.map((p) => (
                <li key={p.id} className={`grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_11rem_9rem_auto] ${p.hidden ? "opacity-50" : ""}`}>
                  <span className="font-mono text-sm font-bold">{timeOf(p.scheduledAt, tz)}</span>
                  <div className="min-w-0"><p className="truncate text-sm font-semibold">{p.title}</p><p className="text-[11px] font-bold uppercase tracking-wider text-fg/40">{p.format === "reel" ? "Reel" : "Carousel"}</p></div>
                  <div className="col-span-2 sm:col-span-1"><IgCell p={p} /></div>
                  <label className="col-span-2 flex cursor-pointer items-center gap-2 text-xs font-semibold sm:col-span-1">
                    <input type="checkbox" className="h-4 w-4" checked={!!p.tiktokAt} disabled={busy === p.id} onChange={(e) => act(p.id, () => contentStudioApi.setTiktok(p.id, e.target.checked))} />
                    {p.tiktokAt ? "Sudah di TikTok" : "TikTok"}
                  </label>
                  <button className={`${btnGhost} col-span-2 sm:col-span-1`} disabled={busy === p.id} onClick={() => act(p.id, () => contentStudioApi.hidePost(p.id, !p.hidden))}>{p.hidden ? "Tampilkan" : "Sembunyikan"}</button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
