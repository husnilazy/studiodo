import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Select from "@/components/Select";
import { contentStudioApi, type CsDeck, type CsIdea, type CsJob, type CsMockup, type CsQueue, type CsSlide, type CsSlideKind, type CsTone } from "@/lib/superadminApi";
import { ScheduleDialog } from "./ScheduleDialog";
import { btnAccent, btnGhost, btnPrimary, errText, fileSize, inputClass, type Notice, NoticeLine } from "./shared";

// Studio: pick a deck, edit it with a live preview, export files or schedule it. The editor is split into three tabs
// (Slide / Deck / Caption) so only one block of fields is on screen at a time.

const KINDS: [CsSlideKind, string][] = [["cover", "Cover"], ["feature", "Fitur + mockup"], ["steps", "Langkah-langkah"], ["stat", "Angka besar"], ["compare", "Sebelum vs sesudah"], ["cta", "Ajakan (CTA)"], ["badge", "Cover Sorotan (ikon)"], ["hook", "Hook santai"], ["chat", "Obrolan (chat)"], ["note", "Catatan tempel"]];
const ICON_OPTIONS: [string, string][] = [["app", "Ikon logo STUDIODO"], ["user", "Orang"], ["grid", "Kisi"], ["play", "Mulai"], ["help", "Tanya"], ["bell", "Lonceng"], ["ticket", "Tiket"], ["qr", "QR"], ["image", "Foto"], ["camera", "Kamera"], ["chart", "Grafik"], ["card", "Kartu"], ["spark", "Kilau"], ["check", "Centang"]];
const MOCKUPS: [CsMockup, string][] = [["none", "Tanpa mockup"], ["dashboard", "Dashboard (jendela)"], ["macbook", "Dashboard di MacBook"], ["qris", "Kiosk QRIS"], ["gallery", "Galeri HP"], ["booth", "Kiosk sesi foto"], ["strip", "Strip foto"], ["queue", "Antrian"], ["hub", "Hub dashboard"], ["qris-l", "Kiosk QRIS · landscape"], ["booth-l", "Kiosk sesi foto · landscape"], ["gallery-l", "Galeri monitor · landscape"], ["print-l", "Hasil cetak 4R · landscape"]];
const TONES: [CsTone, string][] = [["light", "Terang"], ["dark", "Gelap"], ["indigo", "Indigo / Kobalt"], ["mint", "Mint / Blush"], ["peach", "Peach / Kuning"]];
const SIZES = { carousel: { w: 1080, h: 1350 }, reel: { w: 1080, h: 1920 }, highlight: { w: 1080, h: 1920 } } as const;

const newId = () => `custom-${Date.now().toString(36)}`;
const blankSlide = (kind: CsSlideKind = "feature"): CsSlide => ({ kind, eyebrow: "Fitur", title: "Judul *utama*", body: "", mockup: "none" });
const lines = (v: string) => v.split("\n").map((x) => x.trim()).filter(Boolean);
const F = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="block text-xs font-semibold text-fg/60">{label}{children}</label>;

export function StudioView({ decks, ideas, env, queue, openId, reload, onScheduled }: {
  decks: CsDeck[]; ideas: CsIdea[]; env: { chrome: string | null; ffmpeg: boolean } | null; queue: CsQueue; openId?: string; reload: () => Promise<CsDeck[]>; onScheduled: (msg: string) => void;
}) {
  const [draft, setDraft] = useState<CsDeck | null>(decks[0] ?? null);
  const [dirty, setDirty] = useState(false);
  const [sel, setSel] = useState(0);
  const [html, setHtml] = useState("");
  const [replay, setReplay] = useState(0);
  const [job, setJob] = useState<CsJob | null>(null);
  const [note, setNote] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState<"decks" | "ideas">("decks");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"semua" | "carousel" | "reel" | "kaca">("semua");
  const [usage, setUsage] = useState<"all" | "belum" | "jadwal" | "tayang">("all"); // where a deck is in the pipeline: unused / queued / already on Instagram
  const [tab, setTab] = useState<"slide" | "deck" | "caption">("slide");
  const [scheduling, setScheduling] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const bgRef = useRef<HTMLInputElement>(null);

  const open = useCallback((d: CsDeck, force = false) => {
    if (!force && dirty && !window.confirm("Perubahan belum disimpan akan hilang. Lanjut?")) return;
    setDraft(structuredClone(d)); setDirty(false); setSel(0); setJob(null); setNote(null);
  }, [dirty]);
  useEffect(() => { if (openId) { const d = decks.find((x) => x.id === openId); if (d) open(d, true); } }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps

  const edit = (fn: (d: CsDeck) => void) => { setDraft((cur) => { if (!cur) return cur; const next = structuredClone(cur); fn(next); return next; }); setDirty(true); };
  const editSlide = (fn: (s: CsSlide) => void) => edit((d) => fn(d.slides[sel]));

  useEffect(() => {
    if (!draft || !draft.slides.length) { setHtml(""); return; }
    const t = setTimeout(() => {
      contentStudioApi.preview(draft, sel).then((r) => { if (r) { setHtml(r.html); setReplay((n) => n + 1); } }).catch((e) => setNote({ ok: false, text: errText(e, "Preview gagal") }));
    }, 450);
    return () => clearTimeout(t);
  }, [draft, sel]);

  useEffect(() => {
    if (!job || job.status !== "running") return;
    const t = setInterval(() => { contentStudioApi.job(job.id).then((j) => { if (j) setJob(j); }).catch((e) => setJob({ ...job, status: "error", error: errText(e, "Gagal cek status") })); }, 1000);
    return () => clearInterval(t);
  }, [job]);

  const save = async (): Promise<boolean> => {
    if (!draft) return false;
    setBusy(true);
    try { await contentStudioApi.saveDeck(draft); setDirty(false); await reload(); setNote({ ok: true, text: "Tersimpan." }); return true; }
    catch (e) { setNote({ ok: false, text: errText(e, "Gagal menyimpan") }); return false; } finally { setBusy(false); }
  };
  const reset = async () => {
    if (!draft || !window.confirm(draft.builtin ? "Kembalikan deck ini ke versi bawaan?" : "Hapus deck ini?")) return;
    await contentStudioApi.deleteDeck(draft.id);
    const d = await reload(); setDirty(false); setDraft(d.find((x) => x.id === draft.id) ?? d[0] ?? null); setSel(0);
  };
  const render = async (mode: "png" | "mp4" | "mp4-slides") => {
    if (!draft) return; setNote(null);
    try { const j = await contentStudioApi.render(draft, mode); if (j) setJob(j); } catch (e) { setNote({ ok: false, text: errText(e, "Gagal memulai render") }); }
  };
  const download = (name: string) => job && contentStudioApi.download(job.id, name).catch((e) => setNote({ ok: false, text: errText(e) }));
  const downloadAll = async () => { for (const f of job?.files ?? []) { await contentStudioApi.download(job!.id, f.name); await new Promise((r) => setTimeout(r, 400)); } };

  const addDeck = (format: "carousel" | "reel", seed?: CsIdea) => {
    if (dirty && !window.confirm("Perubahan belum disimpan akan hilang. Lanjut?")) return;
    setDraft({
      id: newId(), title: seed?.title ?? "Deck baru", format, tone: "light", style: "kaca", theme: "biru", handle: "studiodo.id", caption: seed ? `${seed.hook}\n\n` : "",
      hashtags: ["#studiodo", "#photobooth", "#bisnisphotobooth"],
      slides: [{ kind: "cover", eyebrow: seed?.pillar ?? "STUDIODO", title: seed ? seed.title : "Judul *cover*", body: seed?.hook ?? "", mockup: "none", seconds: 3.4 }, { ...blankSlide("cta"), eyebrow: "Mulai sekarang", title: "Coba *gratis* di studiodo.id" }],
    });
    setDirty(true); setSel(0); setLeft("decks"); setJob(null); setNote(null);
  };
  const upload = async (file: File, target: "images" | "bg") => {
    const dataUrl = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
    try {
      const { name } = (await contentStudioApi.uploadAsset(file.name, dataUrl))!;
      editSlide((s) => { if (target === "bg") s.bgImage = `asset:${name}`; else s.images = [...(s.images ?? []), `asset:${name}`]; });
    } catch (e) { setNote({ ok: false, text: errText(e, "Gagal unggah") }); }
  };
  const importDeck = () => {
    try {
      const raw = JSON.parse(importText); const d = raw?.deck ?? raw;
      if (!d || !Array.isArray(d.slides) || !d.slides.length) throw new Error('JSON harus berisi deck dengan daftar "slides"');
      setDraft({ id: newId(), title: String(d.title ?? "Deck impor"), format: d.format === "reel" ? "reel" : "carousel", tone: (["light", "dark", "indigo", "mint", "peach"].includes(d.tone) ? d.tone : "light") as CsTone, style: d.style === "kontak" ? "kontak" : d.style === "kaca" ? "kaca" : undefined, theme: ["biru", "ungu", "rose", "senja", "tosca"].includes(d.theme) ? d.theme : undefined, handle: String(d.handle ?? "studiodo.id").replace(/^@/, ""), caption: String(d.caption ?? ""), hashtags: Array.isArray(d.hashtags) ? d.hashtags.map(String) : [], slides: d.slides });
      setDirty(true); setSel(0); setJob(null); setImportOpen(false); setImportText(""); setLeft("decks"); setNote({ ok: true, text: "Deck dimuat. Cek preview, lalu simpan." });
    } catch (e) { setNote({ ok: false, text: errText(e, "JSON tidak valid") }); }
  };
  const copy = (text: string, what: string) => navigator.clipboard.writeText(text).then(() => setNote({ ok: true, text: `${what} disalin.` }));

  const slide = draft?.slides[sel];
  const size = draft ? SIZES[draft.format] : SIZES.carousel;
  const previewW = 380;
  const scale = previewW / size.w;
  const deckState = (id: string): "belum" | "jadwal" | "tayang" => {
    const mine = queue.posts.filter((p) => p.deckId === id && p.status !== "skipped");
    return mine.some((p) => p.status === "posted" && !p.igGone) ? "tayang" : mine.length ? "jadwal" : "belum";
  };
  const usageCount = (u: "belum" | "jadwal" | "tayang") => decks.filter((d) => d.format !== "highlight" && deckState(d.id) === u).length;
  const shownDecks = useMemo(() => decks.filter((d) => {
    if (q.trim() && !d.title.toLowerCase().includes(q.trim().toLowerCase())) return false;
    if (usage !== "all" && deckState(d.id) !== usage) return false;
    return filter === "semua" || (filter === "kaca" ? d.style === "kaca" : d.format === filter);
  }), [decks, q, filter, usage, queue.posts]); // eslint-disable-line react-hooks/exhaustive-deps
  const grouped = useMemo(() => { const m = new Map<string, CsIdea[]>(); ideas.filter((i) => !i.deckId).forEach((i) => m.set(i.pillar, [...(m.get(i.pillar) ?? []), i])); return [...m.entries()]; }, [ideas]);
  const scheduledOf = (id: string) => queue.posts.filter((p) => p.deckId === id && p.status !== "skipped").length;
  const canPreviewNow = draft && draft.slides.length > 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_360px] xl:items-start">
      {env && (!env.chrome || !env.ffmpeg) && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 lg:col-span-2 xl:col-span-3 dark:text-amber-300">
          {!env.chrome && <p>Chrome/Edge tidak ditemukan di PC server, jadi render dan auto-post belum bisa jalan. Pasang Google Chrome atau isi CHROME_PATH di .env lalu restart server.</p>}
          {!env.ffmpeg && <p>ffmpeg tidak ditemukan; MP4 belum bisa dibuat (gambar tetap bisa).</p>}
        </div>
      )}

      {/* ---- left: decks ---- */}
      <aside className="flex min-h-0 flex-col rounded-2xl border border-fg/10 bg-fg/5 p-3 lg:row-span-2 lg:self-start xl:row-span-1 xl:sticky xl:top-2 xl:max-h-[calc(100dvh-170px)]">
        <div className="mb-2 flex gap-1 rounded-full bg-fg/10 p-1 text-xs font-semibold">
          {(["decks", "ideas"] as const).map((t) => <button key={t} onClick={() => setLeft(t)} className={`flex-1 rounded-full py-1.5 ${left === t ? "bg-fg text-canvas" : "text-fg/60"}`}>{t === "decks" ? `Deck (${decks.length})` : `Ide (${grouped.reduce((n, [, l]) => n + l.length, 0)})`}</button>)}
        </div>
        {left === "decks" ? (
          <>
            <input className={`${inputClass} !mt-0 mb-2`} placeholder="Cari deck…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="mb-2 flex flex-wrap gap-1">
              {([["semua", "Semua"], ["kaca", "Kaca"], ["carousel", "Carousel"], ["reel", "Reel"]] as const).map(([v, l]) => <button key={v} onClick={() => setFilter(v)} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${filter === v ? "bg-accent text-white" : "bg-fg/10 text-fg/60 hover:bg-fg/20"}`}>{l}</button>)}
            </div>
            <div className="mb-2 flex flex-wrap gap-1">
              {([["all", "Semua status", null], ["belum", "Belum dipakai", usageCount("belum")], ["jadwal", "Terjadwal", usageCount("jadwal")], ["tayang", "Sudah tayang", usageCount("tayang")]] as const).map(([v, l, c]) => <button key={v} onClick={() => setUsage(v)} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${usage === v ? "bg-fg text-canvas" : "bg-fg/10 text-fg/60 hover:bg-fg/20"}`}>{l}{c !== null && <span className="opacity-60"> {c}</span>}</button>)}
            </div>
            <div className="mb-2 grid grid-cols-3 gap-1.5 [&>button]:!px-1.5">
              <button onClick={() => addDeck("carousel")} className={btnGhost}>+ Carousel</button>
              <button onClick={() => addDeck("reel")} className={btnGhost}>+ Reel</button>
              <button onClick={() => setImportOpen((v) => !v)} className={btnGhost}>JSON</button>
            </div>
            {importOpen && (
              <div className="mb-2 grid gap-2">
                <textarea rows={5} className={inputClass} placeholder="Tempel JSON deck…" value={importText} onChange={(e) => setImportText(e.target.value)} />
                <button disabled={!importText.trim()} onClick={importDeck} className={btnPrimary}>Muat deck</button>
              </div>
            )}
            <div className="grid min-h-0 max-h-[50vh] flex-1 content-start gap-1.5 overflow-auto pr-1 xl:max-h-none">
              {draft && !decks.some((d) => d.id === draft.id) && <div className="rounded-xl border border-dashed border-accent p-2.5 text-xs font-semibold">{draft.title} <span className="font-normal text-fg/50">(belum disimpan)</span></div>}
              {shownDecks.map((d) => (
                <button key={d.id} onClick={() => open(d)} className={`rounded-xl border p-2.5 text-left transition ${draft?.id === d.id ? "border-accent bg-accent/10" : "border-fg/10 hover:border-fg/30"}`}>
                  <span className="block text-[13px] font-semibold leading-snug">{d.title}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1 text-[10.5px] text-fg/50">
                    <span>{d.format === "reel" ? "Reel" : d.format === "highlight" ? "Sorotan" : "Carousel"} · {d.slides.length} slide</span>
                    {d.style === "kaca" && <span className="rounded bg-fg/10 px-1.5 py-px font-bold">Kaca · {d.theme ?? "biru"}</span>}{d.style === "kontak" && <span className="rounded bg-fg/10 px-1.5 py-px font-bold">Contact</span>}
                    {deckState(d.id) === "tayang" ? <span className="rounded bg-emerald-500/15 px-1.5 py-px font-bold text-emerald-600 dark:text-emerald-400">sudah tayang</span> : scheduledOf(d.id) > 0 && <span className="rounded bg-accent/15 px-1.5 py-px font-bold text-accent">dijadwalkan</span>}
                  </span>
                </button>
              ))}
              {shownDecks.length === 0 && <p className="p-2 text-xs text-fg/40">Tidak ada deck yang cocok.</p>}
            </div>
          </>
        ) : (
          <div className="grid max-h-[50vh] min-h-0 flex-1 content-start gap-3 overflow-auto pr-1 xl:max-h-none">
            {grouped.map(([pillar, list]) => (
              <div key={pillar}>
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-fg/40">{pillar}</p>
                {list.map((i) => (
                  <button key={i.title} onClick={() => addDeck(i.format, i)} className="mb-1.5 w-full rounded-lg border border-fg/10 p-2.5 text-left text-xs hover:border-accent">
                    <span className="block font-semibold">{i.title}</span><span className="block text-fg/50">{i.hook}</span>
                  </button>
                ))}
              </div>
            ))}
            {grouped.length === 0 && <p className="text-xs text-fg/40">Semua ide sudah punya deck. Untuk fitur baru, pakai tab Generator.</p>}
          </div>
        )}
      </aside>

      {/* ---- center: preview ---- */}
      <section className="min-w-0 rounded-2xl border border-fg/10 bg-fg/5 p-4 xl:sticky xl:top-2 xl:max-h-[calc(100dvh-170px)] xl:overflow-auto">
        {!draft || !slide ? <p className="text-sm text-fg/50">Pilih atau buat deck.</p> : (
          <div className="grid justify-items-center gap-3">
            <div className="flex w-full flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-sm font-bold">{draft.title}{dirty && <span className="ml-2 text-xs font-normal text-amber-600">● belum disimpan</span>}</p>
              <button disabled={busy || !dirty} onClick={save} className={btnPrimary}>{busy ? "Menyimpan…" : "Simpan"}</button>
              {draft.format !== "highlight" && <button disabled={busy} onClick={async () => { if (dirty || !decks.some((d) => d.id === draft.id)) { if (!(await save())) return; } setScheduling(true); }} className={btnAccent}>Jadwalkan…</button>}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {draft.slides.map((_, i) => <button key={i} onClick={() => setSel(i)} className={`h-8 min-w-8 rounded-full px-2.5 text-xs font-bold ${i === sel ? "bg-accent text-white" : "bg-fg/10 text-fg/70 hover:bg-fg/20"}`}>{i + 1}</button>)}
              <button onClick={() => { edit((d) => d.slides.push(blankSlide())); setSel(draft.slides.length); setTab("slide"); }} className="h-8 rounded-full border border-dashed border-fg/30 px-3 text-xs font-semibold hover:bg-fg/10">+ slide</button>
            </div>
            <div className="overflow-hidden rounded-2xl border border-fg/15 bg-black shadow-xl" style={{ width: previewW, height: size.h * scale }}>
              {html && canPreviewNow && <iframe key={replay} title="Preview" srcDoc={html} sandbox="allow-scripts" style={{ width: size.w, height: size.h, border: 0, transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none" }} />}
            </div>
            <div className="flex items-center gap-3 text-xs">
              <button onClick={() => setReplay((n) => n + 1)} className={btnGhost}>↻ Putar ulang animasi</button>
              <span className="text-fg/40">{size.w}×{size.h}{draft.format === "reel" ? " · dari awal" : ""}</span>
            </div>
            <NoticeLine n={note} />

            <details className="w-full rounded-xl border border-fg/10 bg-canvas p-3 text-xs" open={!!job}>
              <summary className="cursor-pointer font-bold">Ekspor file manual (PNG / MP4)</summary>
              <div className="mt-3 flex flex-wrap gap-2">
                <button disabled={!env?.chrome || job?.status === "running"} onClick={() => render("png")} className={btnPrimary}>PNG{draft.format === "reel" ? " (tiap scene)" : ` (${draft.slides.length} ${draft.format === "highlight" ? "cover" : "slide"})`}</button>
                {draft.format === "reel" && <button disabled={!env?.chrome || !env?.ffmpeg || job?.status === "running"} onClick={() => render("mp4")} className={btnAccent}>MP4 HD (30 fps)</button>}
                {draft.format === "carousel" && <>
                  <button disabled={!env?.chrome || !env?.ffmpeg || job?.status === "running"} onClick={() => render("mp4-slides")} title="Satu video beranimasi per slide" className={btnAccent}>MP4 per slide</button>
                  <button disabled={!env?.chrome || !env?.ffmpeg || job?.status === "running"} onClick={() => render("mp4")} title="Seluruh carousel jadi satu Reel 9:16" className={btnAccent}>MP4 Reel gabungan</button>
                </>}
              </div>
              {dirty && <p className="mt-2 text-amber-600">Render memakai versi yang sedang diedit.</p>}
              {job && (
                <div className="mt-3">
                  {job.status === "running" && <><div className="h-2 overflow-hidden rounded-full bg-fg/10"><div className="h-full bg-accent transition-all" style={{ width: `${Math.round(job.progress * 100)}%` }} /></div><p className="mt-1 text-fg/60">{job.label} · {Math.round(job.progress * 100)}%</p></>}
                  {job.status === "error" && <p className="text-red-500">Gagal: {job.error}</p>}
                  {job.status === "done" && (
                    <div className="grid gap-1.5">
                      <div className="flex items-center justify-between"><span className="font-semibold text-emerald-600">Selesai ✓</span>{job.files.length > 1 && <button onClick={downloadAll} className="font-semibold text-accent underline">Unduh semua</button>}</div>
                      {job.files.map((f) => <button key={f.name} onClick={() => download(f.name)} className="flex items-center justify-between rounded-lg bg-fg/5 px-3 py-2 text-left hover:bg-fg/10"><span className="truncate">{f.name}</span><span className="ml-3 shrink-0 text-fg/50">{fileSize(f.size)} ↓</span></button>)}
                    </div>
                  )}
                </div>
              )}
            </details>
          </div>
        )}
      </section>

      {/* ---- right: editor ---- */}
      <aside className="rounded-2xl border border-fg/10 bg-fg/5 p-4 xl:sticky xl:top-2 xl:max-h-[calc(100dvh-170px)] xl:overflow-auto">
        {draft && slide ? (
          <div className="grid gap-4">
            <div className="flex gap-1 rounded-full bg-fg/10 p-1 text-xs font-bold">
              {([["slide", `Slide ${sel + 1}`], ["deck", "Deck"], ["caption", "Caption"]] as const).map(([v, l]) => <button key={v} onClick={() => setTab(v)} className={`flex-1 rounded-full py-1.5 ${tab === v ? "bg-fg text-canvas" : "text-fg/60"}`}>{l}</button>)}
            </div>

            {tab === "deck" && (
              <div className="grid gap-3">
                <F label="Nama deck (internal)"><input className={inputClass} value={draft.title} onChange={(e) => edit((d) => { d.title = e.target.value; })} /></F>
                <div className="grid grid-cols-2 gap-3">
                  <F label="Format"><Select className={inputClass} value={draft.format} onChange={(e) => edit((d) => { d.format = e.target.value as CsDeck["format"]; })}><option value="carousel">Carousel 4:5</option><option value="reel">Reel 9:16</option><option value="highlight">Cover Sorotan</option></Select></F>
                  <F label="Warna dasar"><Select className={inputClass} value={draft.tone} onChange={(e) => edit((d) => { d.tone = e.target.value as CsTone; })}>{TONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></F>
                </div>
                <F label="Gaya visual"><Select className={inputClass} value={draft.style ?? "klasik"} onChange={(e) => edit((d) => { d.style = e.target.value === "kontak" ? "kontak" : e.target.value === "kaca" ? "kaca" : undefined; })}><option value="kaca">Kaca (gelap, kaca buram, tema warna)</option><option value="kontak">Contact Sheet (kertas, film, stop-motion)</option><option value="klasik">Klasik (terang & gradien)</option></Select></F>{draft.style === "kaca" && <F label="Tema warna"><Select className={inputClass} value={draft.theme ?? "biru"} onChange={(e) => edit((d) => { d.theme = e.target.value as CsDeck["theme"]; })}>{(["biru", "ungu", "rose", "senja", "tosca"] as const).map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}</Select></F>}
                <F label="Handle Instagram"><input className={inputClass} value={draft.handle} onChange={(e) => edit((d) => { d.handle = e.target.value; })} /></F>
                <div className="flex flex-wrap gap-2">
                  {(draft.builtin ? draft.updatedAt : decks.some((d) => d.id === draft.id)) && <button onClick={reset} className="rounded-full px-3.5 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-500/10">{draft.builtin ? "Reset ke bawaan" : "Hapus deck"}</button>}
                  <button onClick={() => copy(JSON.stringify({ ...draft, builtin: undefined, updatedAt: undefined }, null, 2), "JSON deck")} className={btnGhost}>Salin JSON</button>
                </div>
              </div>
            )}

            {tab === "caption" && (
              <div className="grid gap-3">
                {draft.featureId && <CaptionVariants featureId={draft.featureId} onPick={(c) => edit((d) => { d.caption = c; })} />}
                <F label="Caption Instagram"><textarea rows={12} className={inputClass} value={draft.caption} onChange={(e) => edit((d) => { d.caption = e.target.value; })} /></F>
                <F label="Hashtag (pisah spasi)"><textarea rows={3} className={inputClass} value={draft.hashtags.join(" ")} onChange={(e) => edit((d) => { d.hashtags = e.target.value.split(/\s+/).filter(Boolean); })} /></F>
                <div className="flex items-center justify-between text-xs"><span className={draft.caption.length > 2200 ? "text-red-500" : "text-fg/50"}>{draft.caption.length} / 2200 · {draft.hashtags.length} / 30 hashtag</span>
                  <button onClick={() => copy(`${draft.caption}\n\n${draft.hashtags.join(" ")}`, "Caption + hashtag")} className={btnGhost}>Salin</button></div>
              </div>
            )}

            {tab === "slide" && (
              <div className="grid gap-3">
                <div className="flex items-center justify-end gap-1 text-xs">
                  <button disabled={sel === 0} onClick={() => { edit((d) => { [d.slides[sel - 1], d.slides[sel]] = [d.slides[sel], d.slides[sel - 1]]; }); setSel(sel - 1); }} className="rounded-full bg-fg/10 px-3 py-1 disabled:opacity-30" title="Geser ke kiri">←</button>
                  <button disabled={sel === draft.slides.length - 1} onClick={() => { edit((d) => { [d.slides[sel + 1], d.slides[sel]] = [d.slides[sel], d.slides[sel + 1]]; }); setSel(sel + 1); }} className="rounded-full bg-fg/10 px-3 py-1 disabled:opacity-30" title="Geser ke kanan">→</button>
                  <button disabled={draft.slides.length < 2} onClick={() => { edit((d) => { d.slides.splice(sel, 1); }); setSel(Math.max(0, sel - 1)); }} className="rounded-full bg-red-500/15 px-3 py-1 text-red-500 disabled:opacity-30">Hapus slide</button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <F label="Jenis"><Select className={inputClass} value={slide.kind} onChange={(e) => editSlide((s) => { s.kind = e.target.value as CsSlideKind; })}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></F>
                  <F label="Warna slide"><Select className={inputClass} value={slide.tone ?? ""} onChange={(e) => editSlide((s) => { s.tone = (e.target.value || undefined) as CsTone | undefined; })}><option value="">Ikut deck</option>{TONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></F>
                </div>
                {slide.kind !== "badge" && <F label="Label kecil"><input className={inputClass} value={slide.eyebrow ?? ""} onChange={(e) => editSlide((s) => { s.eyebrow = e.target.value; })} /></F>}
                <F label={slide.kind === "badge" ? "Nama sorotan" : "Judul  ( | baris baru · *kata* disorot )"}><textarea rows={2} className={inputClass} value={slide.title} onChange={(e) => editSlide((s) => { s.title = e.target.value; })} /></F>
                {!["compare", "badge", "chat"].includes(slide.kind) && <F label="Teks pendukung"><textarea rows={2} className={inputClass} value={slide.body ?? ""} onChange={(e) => editSlide((s) => { s.body = e.target.value; })} /></F>}
                {slide.kind === "badge" && <F label="Ikon"><Select className={inputClass} value={slide.icon ?? "spark"} onChange={(e) => editSlide((s) => { s.icon = e.target.value; })}>{ICON_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></F>}
                {["cover", "feature", "steps", "cta", "hook", "note"].includes(slide.kind) && <F label="Mockup"><Select className={inputClass} value={slide.mockup ?? "none"} onChange={(e) => editSlide((s) => { s.mockup = e.target.value as CsMockup; })}>{MOCKUPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></F>}
                {["feature", "stat", "compare", "hook", "chat", "note"].includes(slide.kind) && <F label="Catatan bawah"><input className={inputClass} value={slide.note ?? ""} onChange={(e) => editSlide((s) => { s.note = e.target.value; })} /></F>}
                {slide.kind === "hook" && <F label="Emoji (satu)"><input className={inputClass} value={slide.emoji ?? ""} onChange={(e) => editSlide((s) => { s.emoji = e.target.value; })} /></F>}
                {slide.kind === "chat" && <F label="Obrolan (Q: penanya, A: STUDIODO)"><textarea rows={7} className={inputClass} value={(slide.chat ?? []).map((m) => `${m.from === "us" ? "A" : "Q"}: ${m.text}`).join("\n")} onChange={(e) => editSlide((s) => { s.chat = lines(e.target.value).map((l) => (/^a\s*:/i.test(l) ? { from: "us" as const, text: l.replace(/^a\s*:\s*/i, "") } : { from: "them" as const, text: l.replace(/^q\s*:\s*/i, "") })); })} /></F>}
                {(slide.kind === "steps" || slide.kind === "compare" || slide.kind === "note") && <F label={slide.kind === "steps" ? "Langkah (satu per baris)" : slide.kind === "note" ? "Catatan (satu per baris)" : "Kolom kanan (satu per baris)"}><textarea rows={4} className={inputClass} value={(slide.items ?? []).join("\n")} onChange={(e) => editSlide((s) => { s.items = lines(e.target.value); })} /></F>}
                {slide.kind === "compare" && <>
                  <div className="grid grid-cols-2 gap-3">
                    <F label="Judul kiri"><input className={inputClass} placeholder="Tanpa sistem" value={slide.labelBefore ?? ""} onChange={(e) => editSlide((s) => { s.labelBefore = e.target.value; })} /></F>
                    <F label="Judul kanan"><input className={inputClass} placeholder="Dengan STUDIODO" value={slide.labelAfter ?? ""} onChange={(e) => editSlide((s) => { s.labelAfter = e.target.value; })} /></F>
                  </div>
                  <F label="Kolom kiri (satu per baris)"><textarea rows={4} className={inputClass} value={(slide.itemsBefore ?? []).join("\n")} onChange={(e) => editSlide((s) => { s.itemsBefore = lines(e.target.value); })} /></F>
                </>}
                {slide.kind === "stat" && (
                  <div className="grid grid-cols-3 gap-2">
                    <F label="Angka"><input type="number" className={inputClass} value={slide.stat?.value ?? 0} onChange={(e) => editSlide((s) => { s.stat = { label: "", ...s.stat, value: Number(e.target.value) }; })} /></F>
                    <F label="Akhiran"><input className={inputClass} value={slide.stat?.suffix ?? ""} onChange={(e) => editSlide((s) => { s.stat = { value: 0, label: "", ...s.stat, suffix: e.target.value }; })} /></F>
                    <F label="Awalan"><input className={inputClass} value={slide.stat?.prefix ?? ""} onChange={(e) => editSlide((s) => { s.stat = { value: 0, label: "", ...s.stat, prefix: e.target.value }; })} /></F>
                    <div className="col-span-3"><F label="Keterangan angka"><input className={inputClass} value={slide.stat?.label ?? ""} onChange={(e) => editSlide((s) => { s.stat = { value: 0, ...s.stat, label: e.target.value }; })} /></F></div>
                  </div>
                )}
                {draft.format === "reel" && <F label="Durasi scene (detik)"><input type="number" step="0.2" min="1.8" className={inputClass} value={slide.seconds ?? 3.4} onChange={(e) => editSlide((s) => { s.seconds = Number(e.target.value); })} /></F>}
                <div>
                  <p className="text-xs font-semibold text-fg/60">Foto latar penuh {slide.bgImage ? "(terpasang)" : "(opsional)"}</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <button onClick={() => bgRef.current?.click()} className={btnGhost}>{slide.bgImage ? "Ganti foto" : "+ Unggah foto latar"}</button>
                    {slide.bgImage && <button onClick={() => editSlide((s) => { s.bgImage = undefined; })} className="px-3 py-1.5 text-xs text-red-500">Hapus</button>}
                    <input ref={bgRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, "bg"); e.target.value = ""; }} />
                  </div>
                </div>
                {["gallery", "booth", "strip", "booth-l", "gallery-l", "print-l"].includes(slide.mockup ?? "") && (
                  <div>
                    <p className="text-xs font-semibold text-fg/60">Foto asli untuk mockup ({slide.images?.length ?? 0})</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <button onClick={() => fileRef.current?.click()} className={btnGhost}>+ Unggah foto</button>
                      {(slide.images?.length ?? 0) > 0 && <button onClick={() => editSlide((s) => { s.images = []; })} className="px-3 py-1.5 text-xs text-red-500">Kosongkan</button>}
                      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, "images"); e.target.value = ""; }} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : <p className="text-sm text-fg/50">Pilih deck untuk mengedit.</p>}
      </aside>

      {scheduling && draft && (
        <ScheduleDialog deck={draft} settings={queue.settings} connected={queue.connected} takenIso={queue.posts.map((p) => p.scheduledAt)} onClose={() => setScheduling(false)} onDone={(m) => { setScheduling(false); onScheduled(m); }} />
      )}
    </div>
  );
}

function CaptionVariants({ featureId, onPick }: { featureId: string; onPick: (c: string) => void }) {
  const [vars, setVars] = useState<string[] | null>(null);
  useEffect(() => { contentStudioApi.captionVariants(featureId).then((r) => setVars(r?.captions ?? null)).catch(() => setVars(null)); }, [featureId]);
  if (!vars) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-fg/60">Variasi caption otomatis</p>
      <div className="mt-1 flex gap-1.5">{vars.map((c, i) => <button key={i} onClick={() => onPick(c)} className={btnGhost}>{["Pertanyaan", "Dulu vs kini", "Langkah"][i] ?? `Gaya ${i + 1}`}</button>)}</div>
    </div>
  );
}
