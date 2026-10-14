import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ContentPlanPanel } from "@/components/ContentPlanPanel";
import { contentStudioApi, type CsDeck, type CsIdea, type CsJob, type CsMockup, type CsSlide, type CsSlideKind, type CsTone } from "@/lib/superadminApi";

// Superadmin → Konten Instagram. Decks (carousel / reel) are rendered by the server PC from the same HTML templates the
// preview uses: PNG per carousel slide, MP4 (30 fps, 1080×1920) for reels. See server/lib/contentStudio.

const inputClass = "mt-1 w-full rounded-lg border border-fg/15 bg-fg/5 px-3 py-2 text-sm outline-none focus:border-accent";
const KINDS: [CsSlideKind, string][] = [["cover", "Cover"], ["feature", "Fitur + mockup"], ["steps", "Langkah-langkah"], ["stat", "Angka besar"], ["compare", "Sebelum vs sesudah"], ["cta", "Ajakan (CTA)"]];
const MOCKUPS: [CsMockup, string][] = [["none", "Tanpa mockup"], ["dashboard", "Dashboard"], ["qris", "Kiosk QRIS"], ["gallery", "Galeri HP"], ["booth", "Kiosk sesi foto"], ["strip", "Strip foto"], ["queue", "Antrian"], ["hub", "Hub dashboard (diagram)"]];
const TONES: [CsTone, string][] = [["light", "Terang"], ["dark", "Gelap"], ["indigo", "Indigo"], ["mint", "Mint"]];
const SIZES = { carousel: { w: 1080, h: 1350 }, reel: { w: 1080, h: 1920 } } as const;
const PREVIEW_W = 400;

const newId = () => `custom-${Date.now().toString(36)}`;
const blankSlide = (kind: CsSlideKind = "feature"): CsSlide => ({ kind, eyebrow: "Fitur", title: "Judul *utama*", body: "", mockup: "none" });
const lines = (v: string) => v.split("\n").map((x) => x.trim()).filter(Boolean);
const fileSize = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.round(n / 1000)} KB`);

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-fg/60">{label}{children}</label>;
}

export function ContentStudioPanel() {
  const [decks, setDecks] = useState<CsDeck[] | null>(null);
  const [ideas, setIdeas] = useState<CsIdea[]>([]);
  const [env, setEnv] = useState<{ chrome: string | null; ffmpeg: boolean } | null>(null);
  const [view, setView] = useState<"studio" | "plan">("studio");
  const [tab, setTab] = useState<"decks" | "ideas">("decks");
  const [hideBuilt, setHideBuilt] = useState(false);
  const [draft, setDraft] = useState<CsDeck | null>(null);
  const [dirty, setDirty] = useState(false);
  const [sel, setSel] = useState(0);
  const [html, setHtml] = useState("");
  const [replay, setReplay] = useState(0);
  const [job, setJob] = useState<CsJob | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bgRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");

  const load = useCallback(async () => {
    const [d, i, e] = await Promise.all([contentStudioApi.decks(), contentStudioApi.ideas(), contentStudioApi.status()]);
    setDecks(d ?? []); setIdeas(i ?? []); setEnv(e ?? null);
    return d ?? [];
  }, []);
  useEffect(() => { load().then((d) => { if (d[0]) setDraft(d[0]); }).catch((e) => setMessage({ ok: false, text: e instanceof Error ? e.message : "Gagal memuat" })); }, [load]);

  const open = (d: CsDeck) => {
    if (dirty && !window.confirm("Perubahan belum disimpan akan hilang. Lanjut?")) return;
    setDraft(structuredClone(d)); setDirty(false); setSel(0); setJob(null); setMessage(null);
  };
  const edit = (fn: (d: CsDeck) => void) => {
    setDraft((cur) => { if (!cur) return cur; const next = structuredClone(cur); fn(next); return next; });
    setDirty(true);
  };
  const editSlide = (fn: (s: CsSlide) => void) => edit((d) => fn(d.slides[sel]));

  // Live preview: the server renders the very template that gets exported.
  useEffect(() => {
    if (!draft || !draft.slides.length) { setHtml(""); return; }
    const t = setTimeout(() => {
      contentStudioApi.preview(draft, sel).then((r) => { if (r) { setHtml(r.html); setReplay((n) => n + 1); } })
        .catch((e) => setMessage({ ok: false, text: e instanceof Error ? e.message : "Preview gagal" }));
    }, 450);
    return () => clearTimeout(t);
  }, [draft, sel]);

  // Poll a running render job.
  useEffect(() => {
    if (!job || job.status !== "running") return;
    const t = setInterval(() => {
      contentStudioApi.job(job.id).then((j) => { if (j) setJob(j); }).catch((e) => { setJob({ ...job, status: "error", error: e instanceof Error ? e.message : "Gagal cek status" }); });
    }, 1000);
    return () => clearInterval(t);
  }, [job]);

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try { await contentStudioApi.saveDeck(draft); setDirty(false); await load(); setMessage({ ok: true, text: "Tersimpan." }); }
    catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "Gagal menyimpan" }); }
    finally { setBusy(false); }
  };
  const reset = async () => {
    if (!draft || !window.confirm(draft.builtin ? "Kembalikan deck ini ke versi bawaan?" : "Hapus deck ini?")) return;
    await contentStudioApi.deleteDeck(draft.id);
    const d = await load(); setDirty(false); setDraft(d.find((x) => x.id === draft.id) ?? d[0] ?? null); setSel(0);
  };
  const render = async (mode: "png" | "mp4") => {
    if (!draft) return;
    setMessage(null);
    try { const j = await contentStudioApi.render(draft, mode); if (j) setJob(j); }
    catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "Gagal memulai render" }); }
  };
  const download = (name: string) => job && contentStudioApi.download(job.id, name).catch((e) => setMessage({ ok: false, text: e instanceof Error ? e.message : "Gagal" }));
  const downloadAll = async () => { for (const f of job?.files ?? []) { await contentStudioApi.download(job!.id, f.name); await new Promise((r) => setTimeout(r, 400)); } };

  const addDeck = (format: "carousel" | "reel", seed?: CsIdea) => {
    if (dirty && !window.confirm("Perubahan belum disimpan akan hilang. Lanjut?")) return;
    setDraft({
      id: newId(), title: seed?.title ?? "Deck baru", format, tone: "light", handle: "studiodo.id",
      caption: seed ? `${seed.hook}\n\n` : "", hashtags: ["#studiodo", "#photobooth", "#bisnisphotobooth"],
      slides: [
        { kind: "cover", eyebrow: seed?.pillar ?? "STUDIODO", title: seed ? `${seed.title}` : "Judul *cover*", body: seed?.hook ?? "", mockup: "none", seconds: 3.4 },
        { ...blankSlide("cta"), eyebrow: "Mulai sekarang", title: "Coba *gratis* di studiodo.id", mockup: "none" },
      ],
    });
    setDirty(true); setSel(0); setTab("decks"); setJob(null); setMessage(null);
  };

  const upload = async (file: File, target: "images" | "bg" = "images") => {
    const dataUrl = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
    try {
      const { name } = (await contentStudioApi.uploadAsset(file.name, dataUrl))!;
      editSlide((s) => { if (target === "bg") s.bgImage = `asset:${name}`; else s.images = [...(s.images ?? []), `asset:${name}`]; });
    } catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "Gagal unggah" }); }
  };

  // Decks can be pasted in as JSON (e.g. written by Claude in chat): no coding, no rebuild. Always a new, unsaved deck.
  const importDeck = () => {
    try {
      const raw = JSON.parse(importText);
      const d = raw?.deck ?? raw;
      if (!d || !Array.isArray(d.slides) || !d.slides.length) throw new Error('JSON harus berisi deck dengan daftar "slides"');
      setDraft({
        id: newId(), title: String(d.title ?? "Deck impor"), format: d.format === "reel" ? "reel" : "carousel",
        tone: (["light", "dark", "indigo", "mint"].includes(d.tone) ? d.tone : "light") as CsTone, handle: String(d.handle ?? "studiodo.id").replace(/^@/, ""),
        caption: String(d.caption ?? ""), hashtags: Array.isArray(d.hashtags) ? d.hashtags.map(String) : [], slides: d.slides,
      });
      setDirty(true); setSel(0); setJob(null); setImportOpen(false); setImportText(""); setTab("decks");
      setMessage({ ok: true, text: "Deck dimuat. Cek preview, lalu klik Simpan." });
    } catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : "JSON tidak valid" }); }
  };

  const slide = draft?.slides[sel];
  const size = draft ? SIZES[draft.format] : SIZES.carousel;
  const scale = PREVIEW_W / size.w;
  const builtCount = useMemo(() => ideas.filter((i) => i.deckId).length, [ideas]);
  const grouped = useMemo(() => { const m = new Map<string, CsIdea[]>(); ideas.filter((i) => !(hideBuilt && i.deckId)).forEach((i) => m.set(i.pillar, [...(m.get(i.pillar) ?? []), i])); return [...m.entries()]; }, [ideas, hideBuilt]);
  const copy = (text: string, what: string) => navigator.clipboard.writeText(text).then(() => setMessage({ ok: true, text: `${what} disalin.` }));

  if (!decks) return <p className="text-sm text-fg/50">Memuat…</p>;
  return (
    <div className="grid gap-4">
      <div className="flex w-fit gap-1 rounded-full bg-fg/10 p-1 text-xs font-bold">
        {([["studio", "Studio desain"], ["plan", "Rencana & jadwal"]] as const).map(([v, l]) => (
          <button key={v} onClick={() => setView(v)} className={`rounded-full px-5 py-2 ${view === v ? "bg-fg text-canvas" : "text-fg/60"}`}>{l}</button>
        ))}
      </div>
      {view === "plan" && (
        <ContentPlanPanel decks={decks} onOpenDeck={(id) => { const d = decks.find((x) => x.id === id); if (d) { open(d); setView("studio"); } }} />
      )}
      {view === "studio" && <>
      {env && (!env.chrome || !env.ffmpeg) && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700">
          {!env.chrome && <p>Chrome/Edge tidak ditemukan di PC server, jadi render PNG/MP4 belum bisa jalan. Pasang Google Chrome atau isi CHROME_PATH di .env lalu restart server.</p>}
          {!env.ffmpeg && <p>ffmpeg tidak ditemukan; MP4 belum bisa dibuat (PNG tetap bisa).</p>}
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)_340px]">
        {/* ---- left: decks / ideas ---- */}
        <aside className="rounded-2xl border border-fg/10 bg-fg/5 p-3">
          <div className="mb-3 flex gap-1 rounded-full bg-fg/10 p-1 text-xs font-semibold">
            {(["decks", "ideas"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-full py-1.5 ${tab === t ? "bg-fg text-canvas" : "text-fg/60"}`}>{t === "decks" ? "Deck" : `Ide (${ideas.length - builtCount} baru)`}</button>
            ))}
          </div>
          {tab === "decks" ? (
            <div className="grid gap-2">
              {decks.map((d) => (
                <button key={d.id} onClick={() => open(d)} className={`rounded-xl border p-3 text-left text-sm transition ${draft?.id === d.id ? "border-accent bg-accent/10" : "border-fg/10 hover:border-fg/30"}`}>
                  <span className="block font-semibold leading-snug">{d.title}</span>
                  <span className="mt-1 block text-[11px] text-fg/50">{d.format === "reel" ? "Reel · MP4" : "Carousel · PNG"} · {d.slides.length} slide{d.updatedAt ? " · diedit" : ""}</span>
                </button>
              ))}
              {draft && !decks.some((d) => d.id === draft.id) && <div className="rounded-xl border border-dashed border-accent p-3 text-sm font-semibold">{draft.title} <span className="text-[11px] font-normal text-fg/50">(belum disimpan)</span></div>}
              <div className="mt-1 grid grid-cols-2 gap-2">
                <button onClick={() => addDeck("carousel")} className="rounded-full border border-fg/20 py-2 text-xs font-semibold hover:bg-fg/10">+ Carousel</button>
                <button onClick={() => addDeck("reel")} className="rounded-full border border-fg/20 py-2 text-xs font-semibold hover:bg-fg/10">+ Reel</button>
              </div>
              <button onClick={() => setImportOpen((v) => !v)} className="rounded-full border border-dashed border-fg/30 py-2 text-xs font-semibold hover:bg-fg/10">{importOpen ? "Tutup impor" : "Impor deck (JSON)"}</button>
              {importOpen && (
                <div className="grid gap-2">
                  <textarea rows={8} className={inputClass} placeholder="Tempel JSON deck di sini…" value={importText} onChange={(e) => setImportText(e.target.value)} />
                  <button disabled={!importText.trim()} onClick={importDeck} className="rounded-full bg-fg py-2 text-xs font-bold text-canvas disabled:opacity-40">Muat deck</button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid max-h-[70vh] gap-3 overflow-auto pr-1">
              {grouped.map(([pillar, list]) => (
                <div key={pillar}>
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-fg/40">{pillar}</p>
                  {list.map((i) => (
                    <button key={i.title} onClick={() => { const built = i.deckId ? decks.find((d) => d.id === i.deckId) : undefined; if (built) { open(built); setTab("decks"); } else addDeck(i.format, i); }} className={`mb-1.5 w-full rounded-lg border p-2.5 text-left text-xs hover:border-accent ${i.deckId ? "border-emerald-500/30 bg-emerald-500/5" : "border-fg/10"}`}>
                      <span className="block font-semibold">{i.title}</span>
                      <span className="block text-fg/50">{i.hook}</span>
                      <span className="mt-1 inline-block rounded-full bg-fg/10 px-2 py-0.5 text-[10px]">{i.format}</span>
                      {i.deckId && <span className="ml-1.5 inline-block rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">✓ sudah dibuat · buka deck</span>}
                    </button>
                  ))}
                </div>
              ))}
              <label className="flex items-center gap-2 text-[11px] text-fg/60"><input type="checkbox" checked={hideBuilt} onChange={(e) => setHideBuilt(e.target.checked)} />Sembunyikan yang sudah dibuat ({builtCount})</label>
              <p className="text-[11px] text-fg/40">Klik ide baru untuk membuat deck kerangka. Ide yang sudah dibuat membuka deck-nya.</p>
            </div>
          )}
        </aside>

        {/* ---- center: preview ---- */}
        <section className="min-w-0 rounded-2xl border border-fg/10 bg-fg/5 p-4">
          {!draft || !slide ? <p className="text-sm text-fg/50">Pilih atau buat deck.</p> : (
            <div className="grid justify-items-center gap-3">
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {draft.slides.map((_, i) => (
                  <button key={i} onClick={() => setSel(i)} className={`h-8 min-w-8 rounded-full px-2.5 text-xs font-bold ${i === sel ? "bg-accent text-white" : "bg-fg/10 text-fg/70 hover:bg-fg/20"}`}>{i + 1}</button>
                ))}
                <button onClick={() => { edit((d) => d.slides.push(blankSlide())); setSel(draft.slides.length); }} className="h-8 rounded-full border border-dashed border-fg/30 px-3 text-xs font-semibold hover:bg-fg/10">+ slide</button>
              </div>
              <div className="overflow-hidden rounded-2xl border border-fg/15 bg-black shadow-xl" style={{ width: PREVIEW_W, height: size.h * scale }}>
                {html && <iframe key={replay} title="Preview" srcDoc={html} sandbox="allow-scripts" style={{ width: size.w, height: size.h, border: 0, transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none" }} />}
              </div>
              <div className="flex gap-2 text-xs">
                <button onClick={() => setReplay((n) => n + 1)} className="rounded-full border border-fg/20 px-4 py-1.5 font-semibold hover:bg-fg/10">↻ Putar ulang animasi</button>
                <span className="self-center text-fg/40">{size.w}×{size.h}{draft.format === "reel" ? " · tampil dari awal" : ""}</span>
              </div>

              {/* render */}
              <div className="mt-2 w-full max-w-[520px] rounded-xl border border-fg/10 bg-canvas p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button disabled={!env?.chrome || job?.status === "running"} onClick={() => render("png")} className="rounded-full bg-fg px-4 py-2 text-xs font-bold text-canvas disabled:opacity-40">Render PNG{draft.format === "carousel" ? ` (${draft.slides.length} slide)` : " (tiap scene)"}</button>
                  {draft.format === "reel" && <button disabled={!env?.chrome || !env?.ffmpeg || job?.status === "running"} onClick={() => render("mp4")} className="rounded-full bg-accent px-4 py-2 text-xs font-bold text-white disabled:opacity-40">Render MP4 (30 fps)</button>}
                  {dirty && <span className="text-[11px] text-amber-600">Render memakai versi yang sedang diedit.</span>}
                </div>
                {job && (
                  <div className="mt-3 text-xs">
                    {job.status === "running" && (<><div className="h-2 overflow-hidden rounded-full bg-fg/10"><div className="h-full bg-accent transition-all" style={{ width: `${Math.round(job.progress * 100)}%` }} /></div><p className="mt-1 text-fg/60">{job.label} · {Math.round(job.progress * 100)}%{job.mode === "mp4" ? " (±30–60 detik)" : ""}</p></>)}
                    {job.status === "error" && <p className="text-red-500">Gagal: {job.error}</p>}
                    {job.status === "done" && (
                      <div className="grid gap-1.5">
                        <div className="flex items-center justify-between"><span className="font-semibold text-emerald-600">Selesai ✓</span>{job.files.length > 1 && <button onClick={downloadAll} className="font-semibold text-accent underline">Unduh semua</button>}</div>
                        {job.files.map((f) => (<button key={f.name} onClick={() => download(f.name)} className="flex items-center justify-between rounded-lg bg-fg/5 px-3 py-2 text-left hover:bg-fg/10"><span className="truncate">{f.name}</span><span className="ml-3 shrink-0 text-fg/50">{fileSize(f.size)} ↓</span></button>))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ---- right: editor ---- */}
        <aside className="grid content-start gap-4">
          {draft && slide && (
            <>
              <div className="grid gap-3 rounded-2xl border border-fg/10 bg-fg/5 p-4">
                <Field label="Nama deck (internal)"><input className={inputClass} value={draft.title} onChange={(e) => edit((d) => { d.title = e.target.value; })} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Format"><select className={inputClass} value={draft.format} onChange={(e) => edit((d) => { d.format = e.target.value as "carousel" | "reel"; })}><option value="carousel">Carousel 4:5</option><option value="reel">Reel 9:16</option></select></Field>
                  <Field label="Tema dasar"><select className={inputClass} value={draft.tone} onChange={(e) => edit((d) => { d.tone = e.target.value as CsTone; })}>{TONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                </div>
                <Field label="Handle Instagram"><input className={inputClass} value={draft.handle} onChange={(e) => edit((d) => { d.handle = e.target.value; })} /></Field>
                <div className="flex gap-2">
                  <button disabled={busy || !dirty} onClick={save} className="flex-1 rounded-full bg-fg py-2 text-xs font-bold text-canvas disabled:opacity-40">{busy ? "Menyimpan…" : dirty ? "Simpan perubahan" : "Tersimpan"}</button>
                  {(draft.builtin ? draft.updatedAt : decks.some((d) => d.id === draft.id)) && <button onClick={reset} className="rounded-full border border-fg/20 px-4 py-2 text-xs font-semibold hover:bg-fg/10">{draft.builtin ? "Reset" : "Hapus"}</button>}
                </div>
                <button onClick={() => copy(JSON.stringify({ ...draft, builtin: undefined, updatedAt: undefined }, null, 2), "JSON deck")} className="rounded-full border border-fg/20 py-1.5 text-xs font-semibold hover:bg-fg/10">Salin sebagai JSON</button>
                {message && <p className={`text-xs ${message.ok ? "text-emerald-600" : "text-red-500"}`}>{message.text}</p>}
              </div>

              <div className="grid gap-3 rounded-2xl border border-fg/10 bg-fg/5 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold">Slide {sel + 1}</p>
                  <div className="flex gap-1 text-xs">
                    <button disabled={sel === 0} onClick={() => { edit((d) => { [d.slides[sel - 1], d.slides[sel]] = [d.slides[sel], d.slides[sel - 1]]; }); setSel(sel - 1); }} className="rounded-full bg-fg/10 px-2.5 py-1 disabled:opacity-30">←</button>
                    <button disabled={sel === draft.slides.length - 1} onClick={() => { edit((d) => { [d.slides[sel + 1], d.slides[sel]] = [d.slides[sel], d.slides[sel + 1]]; }); setSel(sel + 1); }} className="rounded-full bg-fg/10 px-2.5 py-1 disabled:opacity-30">→</button>
                    <button disabled={draft.slides.length < 2} onClick={() => { edit((d) => { d.slides.splice(sel, 1); }); setSel(Math.max(0, sel - 1)); }} className="rounded-full bg-red-500/15 px-2.5 py-1 text-red-500 disabled:opacity-30">Hapus</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Jenis"><select className={inputClass} value={slide.kind} onChange={(e) => editSlide((s) => { s.kind = e.target.value as CsSlideKind; })}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                  <Field label="Tema slide"><select className={inputClass} value={slide.tone ?? ""} onChange={(e) => editSlide((s) => { s.tone = (e.target.value || undefined) as CsTone | undefined; })}><option value="">Ikut deck</option>{TONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                </div>
                <Field label="Label kecil (eyebrow)"><input className={inputClass} value={slide.eyebrow ?? ""} onChange={(e) => editSlide((s) => { s.eyebrow = e.target.value; })} /></Field>
                <Field label="Judul  ( | = baris baru, *kata* = warna aksen )"><textarea rows={2} className={inputClass} value={slide.title} onChange={(e) => editSlide((s) => { s.title = e.target.value; })} /></Field>
                {slide.kind !== "compare" && <Field label="Teks pendukung"><textarea rows={2} className={inputClass} value={slide.body ?? ""} onChange={(e) => editSlide((s) => { s.body = e.target.value; })} /></Field>}
                {["cover", "feature", "steps", "cta"].includes(slide.kind) && <Field label="Mockup"><select className={inputClass} value={slide.mockup ?? "none"} onChange={(e) => editSlide((s) => { s.mockup = e.target.value as CsMockup; })}>{MOCKUPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>}
                {["feature", "stat", "compare"].includes(slide.kind) && <Field label="Catatan di bawah (pill)"><input className={inputClass} value={slide.note ?? ""} onChange={(e) => editSlide((s) => { s.note = e.target.value; })} /></Field>}
                {(slide.kind === "steps" || slide.kind === "compare") && <Field label={slide.kind === "steps" ? "Langkah (satu per baris)" : "Kolom kanan (satu per baris)"}><textarea rows={4} className={inputClass} value={(slide.items ?? []).join("\n")} onChange={(e) => editSlide((s) => { s.items = lines(e.target.value); })} /></Field>}
                {slide.kind === "compare" && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Judul kolom kiri"><input className={inputClass} placeholder="Tanpa sistem" value={slide.labelBefore ?? ""} onChange={(e) => editSlide((s) => { s.labelBefore = e.target.value; })} /></Field>
                    <Field label="Judul kolom kanan"><input className={inputClass} placeholder="Dengan STUDIODO" value={slide.labelAfter ?? ""} onChange={(e) => editSlide((s) => { s.labelAfter = e.target.value; })} /></Field>
                  </div>
                )}
                {slide.kind === "compare" && <Field label="Kolom kiri (satu per baris)"><textarea rows={4} className={inputClass} value={(slide.itemsBefore ?? []).join("\n")} onChange={(e) => editSlide((s) => { s.itemsBefore = lines(e.target.value); })} /></Field>}
                {slide.kind === "stat" && (
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Angka"><input type="number" className={inputClass} value={slide.stat?.value ?? 0} onChange={(e) => editSlide((s) => { s.stat = { label: "", ...s.stat, value: Number(e.target.value) }; })} /></Field>
                    <Field label="Akhiran"><input className={inputClass} value={slide.stat?.suffix ?? ""} onChange={(e) => editSlide((s) => { s.stat = { value: 0, label: "", ...s.stat, suffix: e.target.value }; })} /></Field>
                    <Field label="Awalan"><input className={inputClass} value={slide.stat?.prefix ?? ""} onChange={(e) => editSlide((s) => { s.stat = { value: 0, label: "", ...s.stat, prefix: e.target.value }; })} /></Field>
                    <div className="col-span-3"><Field label="Keterangan angka"><input className={inputClass} value={slide.stat?.label ?? ""} onChange={(e) => editSlide((s) => { s.stat = { value: 0, ...s.stat, label: e.target.value }; })} /></Field></div>
                  </div>
                )}
                {draft.format === "reel" && <Field label="Durasi scene (detik)"><input type="number" step="0.2" min="1.8" className={inputClass} value={slide.seconds ?? 3.4} onChange={(e) => editSlide((s) => { s.seconds = Number(e.target.value); })} /></Field>}
                <div>
                  <p className="text-xs font-semibold text-fg/60">Foto latar penuh {slide.bgImage ? "(terpasang)" : "(opsional)"}</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <button onClick={() => bgRef.current?.click()} className="rounded-full border border-fg/20 px-3 py-1.5 text-xs font-semibold hover:bg-fg/10">{slide.bgImage ? "Ganti foto" : "+ Unggah foto latar"}</button>
                    {slide.bgImage && <button onClick={() => editSlide((s) => { s.bgImage = undefined; })} className="rounded-full px-3 py-1.5 text-xs text-red-500">Hapus</button>}
                    <input ref={bgRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, "bg"); e.target.value = ""; }} />
                  </div>
                </div>
                {["gallery", "booth", "strip"].includes(slide.mockup ?? "") && (
                  <div>
                    <p className="text-xs font-semibold text-fg/60">Foto asli untuk mockup ({slide.images?.length ?? 0})</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <button onClick={() => fileRef.current?.click()} className="rounded-full border border-fg/20 px-3 py-1.5 text-xs font-semibold hover:bg-fg/10">+ Unggah foto</button>
                      {(slide.images?.length ?? 0) > 0 && <button onClick={() => editSlide((s) => { s.images = []; })} className="rounded-full px-3 py-1.5 text-xs text-red-500">Kosongkan</button>}
                      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
                    </div>
                  </div>
                )}
              </div>

              <div className="grid gap-3 rounded-2xl border border-fg/10 bg-fg/5 p-4">
                <Field label="Caption Instagram"><textarea rows={9} className={inputClass} value={draft.caption} onChange={(e) => edit((d) => { d.caption = e.target.value; })} /></Field>
                <Field label="Hashtag (pisah spasi)"><textarea rows={2} className={inputClass} value={draft.hashtags.join(" ")} onChange={(e) => edit((d) => { d.hashtags = e.target.value.split(/\s+/).filter(Boolean); })} /></Field>
                <div className="flex items-center justify-between text-xs"><span className="text-fg/50">{draft.caption.length} / 2200 karakter</span>
                  <button onClick={() => copy(`${draft.caption}\n\n${draft.hashtags.join(" ")}`, "Caption + hashtag")} className="rounded-full bg-fg px-4 py-1.5 font-bold text-canvas">Salin caption + hashtag</button></div>
              </div>
            </>
          )}
        </aside>
      </div>
      </>}
    </div>
  );
}
