import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type EventForm, type EventFrameOption, type EventItem, type EventState, type EventStats } from "@/lib/api";
import { fileToDataUrl } from "@/lib/imageDownscale";
import { OUTPUT_PRESETS, orientCanvas, presetSize, type LocalTemplate, type OutputPreset } from "@/lib/templateStore";
import TemplateEditor from "@/components/TemplateEditor";
import EventGallery from "@/components/EventGallery";
import { inputClass, panel } from "@/lib/adminUi";
import { Icon } from "@/components/kiosk/Icons";
import { pushToast } from "@/lib/toastStore";

// "Event": a tenant runs many events (a wedding, a company gathering, a mall weekend…), each on its own booths and schedule, and
// gets one dashboard per event. Whether an event is live is decided by the server; this screen only edits the plan and reads the results.

const money = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null);
const pad = (n: number) => String(n).padStart(2, "0");
/** ISO → the value a datetime-local input wants (the browser's own time zone). */
const toLocalInput = (iso: string | null) => { if (!iso) return ""; const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);

const STATE_STYLE: Record<EventState, { label: string; chip: string }> = {
  live: { label: "Berlangsung", chip: "bg-emerald-400/15 text-emerald-600 dark:text-emerald-300" },
  scheduled: { label: "Terjadwal", chip: "bg-sky-400/15 text-sky-600 dark:text-sky-300" },
  ended: { label: "Selesai", chip: "bg-fg/10 text-fg/55" },
  off: { label: "Nonaktif", chip: "bg-fg/10 text-fg/45" },
  full: { label: "Kuota penuh", chip: "bg-amber-400/20 text-amber-600 dark:text-amber-300" },
};

const emptyForm = (): EventForm => ({
  name: "", description: "", enabled: true, startsAt: null, endsAt: null, freeEntry: true, timerEnabled: true, sessionTimerMinutes: 5,
  maxPhotos: 0, hasGif: false, hasVideo: true, sessionCap: null, kioskKeyIds: [], frameIds: [], revertToStandard: false, branding: {}, imageUrl: undefined,
});

function StateChip({ state }: { state: EventState }) {
  const s = STATE_STYLE[state];
  return <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${s.chip}`}>{s.label}</span>;
}

function Stat({ label, value, detail, icon }: { label: string; value: string; detail?: string; icon: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-fg/10 bg-surface px-4 py-3 shadow-glass">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><Icon name={icon} className="h-5 w-5" /></span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-fg/45">{label}</p>
        <p className="truncate font-display text-2xl font-semibold leading-tight tracking-tight">{value}</p>
        {detail && <p className="truncate text-[11px] font-medium text-accent">{detail}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Per-event dashboard
// ---------------------------------------------------------------------------------------------------------------------

function EventDashboard({ event, boothNames, onBack, onEdit }: { event: EventItem; boothNames: Map<string, string>; onBack: () => void; onEdit: () => void }) {
  const [stats, setStats] = useState<EventStats | null>(null);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [tab, setTab] = useState<"summary" | "gallery">("summary");

  const load = useCallback(() => {
    api.getEventStats(event.id).then((r) => { if (r) { setStats(r); setError(""); } }).catch((e) => setError(e instanceof Error ? e.message : "Gagal memuat dashboard event"));
  }, [event.id]);
  useEffect(() => {
    load();
    const t = window.setInterval(() => { if (!document.hidden) load(); }, 20_000); // live while the event runs
    return () => window.clearInterval(t);
  }, [load]);

  const exportContacts = async () => {
    setExporting(true);
    try {
      const r = await api.getEventContacts(event.id);
      const rows = r?.contacts ?? [];
      if (rows.length === 0) { pushToast({ type: "info", title: "Belum ada kontak", sub: "Tamu belum mengisi WhatsApp atau email di event ini." }); return; }
      const esc = (v: string | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const csv = ["Waktu,WhatsApp,Email,Boleh dipublikasikan,Booth,Masukan", ...rows.map((c) => [esc(new Date(c.at).toLocaleString("id-ID")), esc(c.whatsapp), esc(c.email), esc(c.consent ? "ya" : "tidak"), esc(c.booth), esc(c.feedback)].join(","))].join("\r\n");
      const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url; a.download = `kontak-${event.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { pushToast({ type: "error", title: "Gagal mengekspor", sub: e instanceof Error ? e.message : undefined }); } finally { setExporting(false); }
  };

  // Hour-by-hour bars with the empty hours filled in, so a quiet afternoon shows as a gap rather than disappearing.
  const bars = useMemo(() => {
    if (!stats || stats.timeline.length === 0) return [];
    const counts = new Map(stats.timeline.map((t) => [new Date(t.hour).getTime(), t.count]));
    const first = Math.min(...counts.keys());
    const last = Math.max(...counts.keys());
    const out: { at: number; count: number }[] = [];
    for (let at = first; at <= last && out.length < 96; at += 3_600_000) out.push({ at, count: counts.get(at) ?? 0 });
    return out.slice(-48);
  }, [stats]);
  const peak = Math.max(1, ...bars.map((b) => b.count));
  const t = stats?.totals;
  const e = stats?.event ?? event;
  const target = e.sessionCap;
  const boothList = e.kioskKeyIds.length === 0 ? "Semua booth" : e.kioskKeyIds.map((id) => boothNames.get(id) ?? "Booth dihapus").join(", ");

  return (
    <div className="space-y-4">
      <div className={`${panel} flex flex-wrap items-start gap-4`}>
        <button type="button" onClick={onBack} className="rounded-xl border border-fg/15 px-3 py-2 text-sm text-fg/70 hover:text-fg">← Semua event</button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3"><h2 className="font-display text-2xl font-semibold">{e.name}</h2><StateChip state={e.state} /></div>
          <p className="mt-1 text-sm text-fg/55">
            {when(e.startsAt) || "Tanpa batas mulai"} → {when(e.endsAt) || "tanpa batas selesai"} · {boothList} · {e.freeEntry ? "Gratis untuk tamu" : "Berbayar normal"}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void exportContacts()} disabled={exporting} className="rounded-xl border border-fg/15 px-4 py-2 text-sm font-medium disabled:opacity-50">{exporting ? "Menyiapkan…" : "Ekspor kontak (CSV)"}</button>
          <button type="button" onClick={onEdit} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white">Atur event</button>
        </div>
      </div>

      <nav className="flex gap-1 rounded-full border border-fg/10 bg-fg/[0.05] p-1" aria-label="Tampilan event">
        {([["summary", "Ringkasan"], ["gallery", "Galeri & cetak"]] as const).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${tab === id ? "bg-accent text-white shadow-md shadow-accent/25" : "text-fg/55 hover:text-fg"}`}>{label}</button>
        ))}
      </nav>

      {tab === "gallery" && <EventGallery eventId={event.id} />}
      {tab === "summary" && error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {tab === "summary" && !stats && !error && <p className="py-12 text-center text-fg/40">Memuat dashboard…</p>}

      {tab === "summary" && stats && t && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat icon="camera" label="Sesi" value={String(t.sessions)} detail={target ? `${t.sessions} dari ${target} kuota` : `${t.completed} selesai berfoto`} />
            <Stat icon="image" label="Foto" value={String(t.photos)} detail={t.sessions ? `${(t.photos / Math.max(1, t.completed)).toFixed(1)} foto per sesi selesai` : undefined} />
            <Stat icon="users" label="Kontak tamu" value={String(t.contacts)} detail={t.consents ? `${t.consents} setuju dipublikasikan` : "WhatsApp / email terkumpul"} />
            <Stat icon="wallet" label="Pendapatan" value={money(t.revenue)} detail={`${t.free} sesi gratis · ${t.paid} berbayar`} />
          </div>

          {target ? (
            <div className={panel}>
              <div className="flex items-center justify-between text-sm"><span className="font-medium">Kuota sesi</span><span className="text-fg/55">{t.sessions} / {target}</span></div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-fg/10"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.min(100, (t.sessions / target) * 100)}%` }} /></div>
              <p className="mt-2 text-xs text-fg/45">Setelah kuota penuh, event berhenti menerima sesi baru.</p>
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <div className={panel}>
              <h3 className="font-semibold">Keramaian per jam</h3>
              {bars.length === 0 ? <p className="mt-6 text-center text-sm text-fg/40">Belum ada sesi di event ini.</p> : (
                <div className="mt-4 flex h-44 items-end gap-1" role="img" aria-label="Grafik jumlah sesi per jam">
                  {bars.map((b) => (
                    <div key={b.at} className="group relative flex h-full min-w-[6px] flex-1 flex-col justify-end" title={`${new Date(b.at).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · ${b.count} sesi`}>
                      <div className="w-full rounded-t-md bg-accent/80 transition group-hover:bg-accent" style={{ height: `${Math.max(b.count ? 4 : 0, (b.count / peak) * 100)}%` }} />
                    </div>
                  ))}
                </div>
              )}
              {bars.length > 0 && <div className="mt-2 flex justify-between text-[11px] text-fg/40"><span>{new Date(bars[0].at).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span><span>puncak {peak} sesi/jam</span><span>{new Date(bars[bars.length - 1].at).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></div>}
            </div>

            <div className={panel}>
              <h3 className="font-semibold">Per booth</h3>
              {stats.perBooth.length === 0 ? <p className="mt-6 text-center text-sm text-fg/40">Belum ada data.</p> : (
                <ul className="mt-3 space-y-3">
                  {stats.perBooth.map((b) => (
                    <li key={b.kioskKeyId ?? "none"}>
                      <div className="flex items-baseline justify-between text-sm"><span className="truncate font-medium">{b.label}</span><span className="text-fg/55">{b.sessions} sesi · {b.photos} foto</span></div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-fg/10"><div className="h-full rounded-full bg-accent" style={{ width: `${(b.sessions / Math.max(1, stats.perBooth[0].sessions)) * 100}%` }} /></div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-5 grid grid-cols-2 gap-2 text-center text-sm">
                <div className="rounded-xl bg-fg/[0.05] px-3 py-2"><p className="font-display text-xl font-semibold">{t.gifs}</p><p className="text-[11px] text-fg/50">GIF</p></div>
                <div className="rounded-xl bg-fg/[0.05] px-3 py-2"><p className="font-display text-xl font-semibold">{t.videos}</p><p className="text-[11px] text-fg/50">Video</p></div>
              </div>
            </div>
          </div>

          <div className={panel}>
            <h3 className="font-semibold">Hasil terbaru</h3>
            {stats.recent.length === 0 ? <p className="mt-6 text-center text-sm text-fg/40">Belum ada hasil foto. Foto tamu muncul di sini begitu sesi selesai.</p> : (
              <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {stats.recent.map((r) => (
                  <a key={r.id} href={r.shareUrl || r.thumb || undefined} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-2xl border border-fg/10 bg-fg/[0.04]">
                    <div className="aspect-[3/4] w-full overflow-hidden bg-fg/5">{r.thumb ? <img src={r.thumb} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" /> : null}</div>
                    <p className="truncate px-2 py-1.5 text-[11px] text-fg/50">{new Date(r.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}{r.booth ? ` · ${r.booth}` : ""}</p>
                  </a>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Branding of one event
// ---------------------------------------------------------------------------------------------------------------------

const BRAND_COLORS: { key: string; label: string; fallback: string }[] = [
  { key: "accentColor", label: "Warna utama (tombol)", fallback: "#7c6cff" },
  { key: "backgroundColor", label: "Warna latar", fallback: "#ffffff" },
  { key: "surfaceColor", label: "Warna kartu", fallback: "#f4f4f6" },
  { key: "textColor", label: "Warna teks", fallback: "#111111" },
];
const BRAND_TEXTS: { key: string; label: string; placeholder: string }[] = [
  { key: "brandName", label: "Nama di layar", placeholder: "mis. Sari & Dimas" },
  { key: "tagline", label: "Slogan", placeholder: "mis. 12 Desember 2026" },
  { key: "idleHeadline", label: "Judul layar awal", placeholder: "mis. Welcome to our wedding" },
  { key: "idleSubheadline", label: "Teks kecil layar awal", placeholder: "mis. Abadikan momen bersama kami" },
  { key: "idleStartText", label: "Tulisan tombol mulai", placeholder: "mis. Sentuh untuk berfoto" },
  { key: "promoText", label: "Teks promo / pesan", placeholder: "mis. Jangan lupa bagikan hasilnya!" },
  { key: "packageHeadline", label: "Judul layar pilih paket", placeholder: "mis. Pilih gaya fotomu" },
  { key: "resultHeadline", label: "Judul layar hasil", placeholder: "mis. Terima kasih sudah hadir" },
  { key: "hashtag", label: "Hashtag", placeholder: "mis. #SariDimas2026" },
];
const BRAND_IMAGES: { key: string; label: string; hint: string; accept: string }[] = [
  { key: "logoUrl", label: "Logo event", hint: "Pengganti logo di layar awal", accept: "image/*" },
  { key: "idleCoverUrl", label: "Cover layar awal", hint: "Foto atau video latar", accept: "image/*,video/mp4,video/webm" },
  { key: "idleBannerUrl", label: "Banner", hint: "Gambar kecil di sudut layar awal", accept: "image/*" },
];

/** Look & text used only while THIS event is live on its booths. Empty = follow the booth's normal design, so other booths and other events stay untouched. */
function BrandingSection({ branding, onChange }: { branding: Record<string, string>; onChange: (b: Record<string, string>) => void }) {
  const setKey = (key: string, value: string | null) => {
    const next = { ...branding };
    if (value) next[key] = value; else { delete next[key]; if (key === "idleCoverUrl") delete next.idleCoverType; }
    onChange(next);
  };
  const readFile = (key: string, file: File | undefined) => {
    if (!file) return;
    if (file.size > 40 * 1024 * 1024) { pushToast({ type: "error", title: "File terlalu besar", sub: "Maksimal 40 MB." }); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      onChange({ ...branding, [key]: url, ...(key === "idleCoverUrl" ? { idleCoverType: file.type.startsWith("video/") ? "video" : "image" } : {}) });
    };
    reader.readAsDataURL(file);
  };
  const count = Object.keys(branding).filter((k) => k !== "idleCoverType").length;
  const bg = branding.backgroundColor ?? "#ffffff";
  const fg = branding.textColor ?? "#111111";
  const accent = branding.accentColor ?? "#7c6cff";
  const isVideo = branding.idleCoverType === "video";

  return (
    <section>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold">Branding khusus event</h4>
          <p className="text-xs text-fg/50">Warna, teks, dan gambar yang hanya dipakai selama event ini berlangsung di booth-nya. Yang dikosongkan mengikuti tampilan booth seperti biasa, dan kembali otomatis begitu event selesai. Booth lain tidak terpengaruh.</p>
        </div>
        {count > 0 && <button type="button" onClick={() => onChange({})} className="shrink-0 rounded-lg border border-fg/15 px-3 py-1.5 text-xs">Kosongkan semua</button>}
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_16rem]">
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {BRAND_COLORS.map((c) => (
              <div key={c.key} className="rounded-xl border border-fg/10 p-3">
                <p className="text-sm font-medium">{c.label}</p>
                <div className="mt-2 flex items-center gap-2">
                  <input type="color" value={branding[c.key] ?? c.fallback} onChange={(e) => setKey(c.key, e.target.value)} className="h-9 w-12 cursor-pointer rounded-lg border border-fg/15 bg-transparent" aria-label={c.label} />
                  <span className="text-xs text-fg/55">{branding[c.key] ?? "Ikuti booth"}</span>
                  {branding[c.key] && <button type="button" onClick={() => setKey(c.key, null)} className="ml-auto rounded-lg border border-fg/15 px-2.5 py-1 text-xs">Ikuti booth</button>}
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {BRAND_IMAGES.map((img) => (
              <div key={img.key} className="rounded-xl border border-fg/10 p-3">
                <p className="text-sm font-medium">{img.label}</p>
                <p className="text-[11px] text-fg/40">{img.hint}</p>
                <div className="mt-2 flex h-16 items-center justify-center overflow-hidden rounded-lg bg-fg/[0.05]">
                  {branding[img.key] ? (img.key === "idleCoverUrl" && isVideo ? <video src={branding[img.key]} muted className="h-full w-full object-cover" /> : <img src={branding[img.key]} alt="" className="h-full w-full object-contain" />) : <Icon name="image" className="h-5 w-5 text-fg/30" />}
                </div>
                <input type="file" accept={img.accept} className="mt-2 w-full text-[11px]" onChange={(e) => { readFile(img.key, e.target.files?.[0]); e.target.value = ""; }} />
                {branding[img.key] && <button type="button" onClick={() => setKey(img.key, null)} className="mt-1 text-xs text-red-400">Hapus</button>}
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {BRAND_TEXTS.map((t) => (
              <label key={t.key} className="text-sm text-fg/60">{t.label}
                <input className={inputClass} value={branding[t.key] ?? ""} maxLength={200} placeholder={t.placeholder} onChange={(e) => setKey(t.key, e.target.value)} />
              </label>
            ))}
          </div>
        </div>

        <div className="lg:sticky lg:top-0 lg:self-start">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg/45">Pratinjau layar awal</p>
          <div className="relative flex aspect-[3/4] flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border border-fg/10 px-4 text-center" style={{ background: bg, color: fg }}>
            {branding.idleCoverUrl && (isVideo ? <video src={branding.idleCoverUrl} muted autoPlay loop className="absolute inset-0 h-full w-full object-cover" /> : <img src={branding.idleCoverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />)}
            {branding.idleCoverUrl && <div className="absolute inset-0 bg-black/35" />}
            <div className="relative z-10 flex flex-col items-center gap-2" style={branding.idleCoverUrl ? { color: "#fff" } : undefined}>
              {branding.logoUrl && <img src={branding.logoUrl} alt="" className="max-h-12 max-w-[70%] object-contain" />}
              <p className="font-display text-lg font-semibold leading-tight">{branding.idleHeadline || branding.brandName || "Judul event"}</p>
              {(branding.idleSubheadline || branding.tagline) && <p className="text-[11px] opacity-75">{branding.idleSubheadline || branding.tagline}</p>}
              <span className="mt-2 rounded-full px-4 py-1.5 text-[11px] font-semibold text-white" style={{ background: accent }}>{branding.idleStartText || "Sentuh untuk mulai"}</span>
            </div>
            {branding.idleBannerUrl && <img src={branding.idleBannerUrl} alt="" className="absolute bottom-2 right-2 z-10 max-h-10 max-w-[40%] rounded-lg object-contain" />}
          </div>
          <p className="mt-1.5 text-[11px] text-fg/40">Perkiraan saja; tata letak asli mengikuti gaya kiosk.</p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Create / edit
// ---------------------------------------------------------------------------------------------------------------------

function EventEditor({ event, booths, onClose, onSaved }: { event: EventItem | null; booths: { id: string; label: string | null; boothMode: string }[]; onClose: () => void; onSaved: (saved: EventItem) => void }) {
  const [form, setForm] = useState<EventForm>(() => (event ? { ...event } : emptyForm()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof EventForm>(key: K, value: EventForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const allBooths = form.kioskKeyIds.length === 0;

  // --- Frames: the templates this event offers (uploaded here, or borrowed from the normal library) ---
  const [library, setLibrary] = useState<EventFrameOption[]>([]);
  const [uploaded, setUploaded] = useState<string[]>([]); // frames made in this editor session (removed again if the editor is cancelled)
  const [working, setWorking] = useState<LocalTemplate | null>(null);
  const [workingMeta, setWorkingMeta] = useState<{ isNew: boolean; native: { w: number; h: number } }>({ isNew: true, native: { w: 1200, h: 1800 } });
  const [savingFrame, setSavingFrame] = useState(false);
  const loadLibrary = useCallback(() => { api.getEventFrames().then((r) => setLibrary(r ?? [])).catch(() => undefined); }, []);
  useEffect(() => { loadLibrary(); }, [loadLibrary]);
  const frameById = useMemo(() => new Map(library.map((f) => [f.id, f])), [library]);
  const chosen = form.frameIds.map((id) => frameById.get(id)).filter((f): f is EventFrameOption => Boolean(f));
  const pickable = library.filter((f) => !f.eventOnly && !form.frameIds.includes(f.id));
  const toggleFrame = (id: string) => set("frameIds", form.frameIds.includes(id) ? form.frameIds.filter((x) => x !== id) : [...form.frameIds, id]);

  const startUpload = async (file: File | undefined) => {
    if (!file) return;
    if (file.type !== "image/png") { pushToast({ type: "error", title: "Pakai file PNG", sub: "Frame harus PNG dengan bagian tengah transparan (lubang foto)." }); return; }
    try {
      const frameDataUrl = await fileToDataUrl(file, 2400);
      const bitmap = await createImageBitmap(file);
      const orientation = bitmap.width > bitmap.height ? "landscape" : "portrait";
      setWorkingMeta({ isNew: true, native: { w: bitmap.width, h: bitmap.height } });
      bitmap.close();
      const size = presetSize("4r", orientation);
      const slotH = (0.4 * size.width) / size.height / (4 / 3);
      setWorking({
        id: crypto.randomUUID(), name: file.name.replace(/\.png$/i, "") || "Frame event", category: "__event", style: "Event", orientation, outputPreset: "4r",
        frameDataUrl, canvasWidth: size.width, canvasHeight: size.height,
        slots: orientation === "landscape"
          ? [{ x: 0.08, y: (1 - slotH) / 2, w: 0.4, h: slotH }, { x: 0.52, y: (1 - slotH) / 2, w: 0.4, h: slotH }]
          : [{ x: 0.1, y: 0.08, w: 0.4, h: slotH }, { x: 0.5, y: 0.08, w: 0.4, h: slotH }, { x: 0.1, y: 0.5, w: 0.4, h: slotH }],
      });
    } catch (e) { pushToast({ type: "error", title: "Gagal membaca file", sub: e instanceof Error ? e.message : undefined }); }
  };
  /** Open a frame uploaded earlier for this event to move its photo windows or change its size. */
  const editFrame = (f: EventFrameOption) => {
    if (!f.imageUrl) { pushToast({ type: "error", title: "Frame ini tidak bisa diedit", sub: "Unggah ulang file PNG-nya." }); return; }
    setWorkingMeta({ isNew: false, native: { w: f.canvasWidth, h: f.canvasHeight } });
    setWorking({ id: f.id, name: f.name, category: "__event", style: "Event", orientation: f.orientation === "landscape" ? "landscape" : "portrait", outputPreset: (f.outputPreset || "4r") as OutputPreset, frameDataUrl: f.imageUrl, canvasWidth: f.canvasWidth, canvasHeight: f.canvasHeight, slots: f.slots ?? [] });
  };
  /** Orientation and output size decide the canvas the photos are composed on (and the paper the frame prints on). */
  const applyShape = (orientation: "portrait" | "landscape", preset: OutputPreset) => {
    if (!working) return;
    const size = preset === "custom" ? orientCanvas(workingMeta.native.w, workingMeta.native.h, orientation) : presetSize(preset, orientation);
    setWorking({ ...working, orientation, outputPreset: preset, canvasWidth: size.width, canvasHeight: size.height });
  };
  const saveFrame = async () => {
    if (!working || savingFrame) return;
    setSavingFrame(true);
    try {
      if (workingMeta.isNew) {
        await api.createFrame(working);
        setUploaded((u) => [...u, working.id]);
        set("frameIds", [...form.frameIds, working.id]);
      } else {
        await api.updateFrame(working.id, { name: working.name, slots: working.slots, canvasWidth: working.canvasWidth, canvasHeight: working.canvasHeight, orientation: working.orientation, outputPreset: working.outputPreset });
      }
      setWorking(null);
      loadLibrary();
      pushToast({ type: "success", title: workingMeta.isNew ? "Frame ditambahkan ke event" : "Frame diperbarui", sub: workingMeta.isNew ? "Frame ikut tersimpan saat kamu menyimpan event." : "Kiosk memakainya di sesi berikutnya." });
    } catch (e) { pushToast({ type: "error", title: "Frame gagal disimpan", sub: e instanceof Error ? e.message : undefined }); } finally { setSavingFrame(false); }
  };
  /** Closing without saving throws away frames uploaded in this session that no saved event points to. */
  const cancel = () => {
    const stray = uploaded.filter((id) => !(event?.frameIds ?? []).includes(id));
    for (const id of stray) void api.deleteFrame(id).catch(() => undefined);
    onClose();
  };
  const toggleBooth = (id: string) => set("kioskKeyIds", form.kioskKeyIds.includes(id) ? form.kioskKeyIds.filter((k) => k !== id) : [...form.kioskKeyIds, id]);

  const readImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => set("imageUrl", String(reader.result));
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const r = await api.saveEvent(event?.id ?? null, form);
      if (r?.event) { pushToast({ type: "success", title: event ? "Event diperbarui" : "Event dibuat", sub: "Kiosk memakainya otomatis sesuai jadwal." }); onSaved(r.event); }
    } catch (e) { setError(e instanceof Error ? e.message : "Gagal menyimpan event"); } finally { setBusy(false); }
  };

  const check = (key: "enabled" | "freeEntry" | "timerEnabled" | "hasGif" | "hasVideo", label: string, hint?: string) => (
    <label className="flex items-start gap-3 rounded-xl border border-fg/10 px-3.5 py-3 text-sm">
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--accent,#7c6cff)]" checked={form[key]} onChange={(e) => set(key, e.target.checked)} />
      <span><span className="font-medium">{label}</span>{hint && <span className="block text-xs text-fg/50">{hint}</span>}</span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Atur event" onMouseDown={(e) => { if (e.target === e.currentTarget && !working) cancel(); }}>
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-fg/10 bg-surface shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-fg/10 px-6 py-4">
          <div><p className="eyebrow">EVENT</p><h3 className="font-display text-xl font-semibold">{event ? "Atur event" : "Event baru"}</h3></div>
          <button type="button" onClick={cancel} aria-label="Tutup" className="rounded-full border border-fg/15 px-3 py-1.5 text-sm">✕</button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <section className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-fg/60 sm:col-span-2">Nama event
              <input className={inputClass} value={form.name} maxLength={80} onChange={(e) => set("name", e.target.value)} placeholder="mis. Pernikahan Sari & Dimas" autoFocus />
            </label>
            <label className="text-sm text-fg/60 sm:col-span-2">Keterangan (tampil di kiosk)
              <input className={inputClass} value={form.description} maxLength={300} onChange={(e) => set("description", e.target.value)} placeholder="mis. Abadikan momen bahagia kami" />
            </label>
            <label className="text-sm text-fg/60">Mulai
              <input className={inputClass} type="datetime-local" value={toLocalInput(form.startsAt)} onChange={(e) => set("startsAt", fromLocalInput(e.target.value))} />
            </label>
            <label className="text-sm text-fg/60">Selesai
              <input className={inputClass} type="datetime-local" value={toLocalInput(form.endsAt)} onChange={(e) => set("endsAt", fromLocalInput(e.target.value))} />
            </label>
            <p className="text-xs text-fg/45 sm:col-span-2">Kosongkan jadwal kalau event dijalankan manual lewat tombol aktif / nonaktif. Waktu mengikuti zona waktu komputer ini.</p>
          </section>

          <section>
            <h4 className="font-semibold">Booth yang menjalankan event ini</h4>
            <p className="text-xs text-fg/50">Satu booth bisa punya beberapa event di hari berbeda. Event yang tidak memilih booth berlaku di semua booth.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-sm ${allBooths ? "border-accent bg-accent/5" : "border-fg/10"}`}>
                <input type="radio" name="boothScope" checked={allBooths} onChange={() => set("kioskKeyIds", [])} className="accent-[var(--accent,#7c6cff)]" /> <span className="font-medium">Semua booth</span>
              </label>
              {booths.map((b) => (
                <label key={b.id} className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-sm ${form.kioskKeyIds.includes(b.id) ? "border-accent bg-accent/5" : "border-fg/10"}`}>
                  <input type="checkbox" checked={form.kioskKeyIds.includes(b.id)} onChange={() => toggleBooth(b.id)} className="h-4 w-4 accent-[var(--accent,#7c6cff)]" />
                  <span className="min-w-0 truncate font-medium">{b.label || "Booth tanpa nama"}</span>
                  {b.boothMode === "event_only" && <span className="ml-auto shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-accent">Khusus event</span>}
                </label>
              ))}
            </div>
            {booths.length === 0 && <p className="mt-2 text-xs text-amber-500">Belum ada booth. Buat kiosk key dulu di menu Kiosk.</p>}
            <div className="mt-3 rounded-xl bg-fg/[0.05] px-4 py-3 text-xs leading-relaxed text-fg/65">
              <p><b>Booth Standar</b> tetap berjualan seperti biasa di luar event, dan memakai tampilan event hanya saat event ini berlangsung.</p>
              <p className="mt-1"><b>Booth Khusus event</b> terkunci di luar jadwal event. Ubah mode booth kapan saja di menu Kiosk.</p>
            </div>
            <label className="mt-3 flex items-start gap-3 rounded-xl border border-fg/10 px-3.5 py-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--accent,#7c6cff)]" checked={form.revertToStandard} onChange={(e) => set("revertToStandard", e.target.checked)} />
              <span><span className="font-medium">Kembalikan booth ke mode standar setelah event selesai</span><span className="block text-xs text-fg/50">Khusus booth bermode "Khusus event": begitu event ini lewat dan tidak ada event lain yang berlangsung atau akan datang, booth otomatis bisa dipakai untuk photobooth biasa lagi. Perlu tanggal selesai.</span></span>
            </label>
            {form.revertToStandard && !form.endsAt && <p className="mt-1 text-xs text-amber-500">Isi waktu selesai agar booth bisa kembali ke mode standar otomatis.</p>}
          </section>

          <section>
            <h4 className="font-semibold">Frame untuk event ini</h4>
            <p className="text-xs text-fg/50">Saat event berlangsung, tamu hanya melihat frame di bawah ini. Kalau hanya satu frame, langsung terpilih otomatis. Tanpa frame di sini, kiosk memakai frame biasa.</p>
            <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
              {chosen.map((f) => (
                <div key={f.id} className="relative overflow-hidden rounded-2xl border border-fg/10 bg-fg/[0.04]">
                  <div className="flex aspect-[3/4] items-center justify-center bg-[repeating-conic-gradient(rgba(128,128,128,.18)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">{f.imageUrl ? <img src={f.imageUrl} alt="" className="h-full w-full object-contain" /> : <Icon name="image" className="h-6 w-6 text-fg/30" />}</div>
                  <p className="truncate px-2 py-1.5 text-[11px] text-fg/60">{f.name}{f.eventOnly ? "" : " · dari library"}</p>
                  <button type="button" onClick={() => toggleFrame(f.id)} aria-label={`Lepas frame ${f.name}`} className="absolute right-1.5 top-1.5 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">✕</button>
                  {f.eventOnly && <button type="button" onClick={() => editFrame(f)} className="absolute left-1.5 top-1.5 rounded-full bg-black/60 px-2.5 py-0.5 text-xs text-white">Atur</button>}
                  <p className="px-2 pb-1.5 text-[10px] text-fg/40">{f.orientation === "landscape" ? "Landscape" : "Portrait"} · {f.outputPreset in OUTPUT_PRESETS ? f.outputPreset.toUpperCase() : "Ukuran asli"}</p>
                </div>
              ))}
              <label className="flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-fg/25 text-center text-xs font-medium text-fg/55 transition hover:border-accent hover:text-accent">
                <span className="text-2xl leading-none">+</span>Unggah frame PNG
                <input type="file" accept="image/png" className="hidden" onChange={(e) => { void startUpload(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
            </div>
            {pickable.length > 0 && (
              <details className="mt-3 rounded-xl border border-fg/10 px-3.5 py-2.5 text-sm">
                <summary className="cursor-pointer font-medium text-fg/70">Pilih dari frame yang sudah ada ({pickable.length})</summary>
                <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {pickable.map((f) => (
                    <button key={f.id} type="button" onClick={() => toggleFrame(f.id)} className="overflow-hidden rounded-xl border border-fg/10 text-left transition hover:border-accent">
                      <div className="flex aspect-[3/4] items-center justify-center bg-fg/[0.04]">{f.imageUrl ? <img src={f.imageUrl} alt="" loading="lazy" className="h-full w-full object-contain" /> : null}</div>
                      <p className="truncate px-1.5 py-1 text-[10px] text-fg/60">{f.name}</p>
                    </button>
                  ))}
                </div>
              </details>
            )}
          </section>

          <BrandingSection branding={form.branding} onChange={(b) => set("branding", b)} />

          <section>
            <h4 className="font-semibold">Aturan sesi saat event berlangsung</h4>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {check("freeEntry", "Gratis untuk tamu", "Sesi tidak perlu bayar. Matikan kalau event tetap memakai harga normal.")}
              {check("timerEnabled", "Batasi waktu per sesi")}
              {check("hasVideo", "Rekam video")}
              {check("hasGif", "Rekam GIF")}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="text-sm text-fg/60">Waktu per sesi (menit)
                <input className={inputClass} type="number" min={1} max={30} disabled={!form.timerEnabled} value={form.sessionTimerMinutes} onChange={(e) => set("sessionTimerMinutes", Math.max(1, Math.min(30, Number(e.target.value) || 1)))} />
              </label>
              <label className="text-sm text-fg/60">Maks. foto per sesi
                <input className={inputClass} type="number" min={0} max={50} value={form.maxPhotos} onChange={(e) => set("maxPhotos", Math.max(0, Math.min(50, Number(e.target.value) || 0)))} placeholder="0 = ikut pengaturan booth" />
                <span className="text-[11px] text-fg/40">0 = ikut pengaturan booth</span>
              </label>
              <label className="text-sm text-fg/60">Kuota total sesi
                <input className={inputClass} type="number" min={1} value={form.sessionCap ?? ""} onChange={(e) => set("sessionCap", e.target.value === "" ? null : Math.max(1, Math.round(Number(e.target.value) || 1)))} placeholder="Tanpa batas" />
                <span className="text-[11px] text-fg/40">Kosong = tanpa batas</span>
              </label>
            </div>
          </section>

          <section>
            <h4 className="font-semibold">Foto event (opsional)</h4>
            <div className="mt-2 flex items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-fg/10 bg-fg/[0.04]">
                {form.imageUrl ? <img src={form.imageUrl} alt="" className="h-full w-full object-cover" /> : <Icon name="image" className="h-6 w-6 text-fg/30" />}
              </div>
              <div className="text-sm">
                <input type="file" accept="image/*" className="text-xs" onChange={(e) => { const f = e.target.files?.[0]; if (f) readImage(f); }} />
                {form.imageUrl && <button type="button" onClick={() => set("imageUrl", null)} className="mt-1 block text-xs text-red-400">Hapus foto</button>}
              </div>
            </div>
          </section>

          {check("enabled", "Event aktif", "Matikan untuk menjeda event tanpa menghapus jadwalnya. Event hanya berlangsung kalau aktif DAN sesuai jadwal.")}
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-fg/10 px-6 py-4">
          <button type="button" onClick={cancel} className="rounded-xl border border-fg/15 px-5 py-2.5 text-sm">Batal</button>
          <button type="button" onClick={() => void save()} disabled={busy || !form.name.trim()} className="rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/20 disabled:opacity-50">{busy ? "Menyimpan…" : event ? "Simpan perubahan" : "Buat event"}</button>
        </div>
      </div>

      {working && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Atur lubang foto frame">
          <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-fg/10 bg-surface shadow-2xl">
            <div className="border-b border-fg/10 px-6 py-4">
              <p className="eyebrow">FRAME EVENT</p>
              <h3 className="font-display text-xl font-semibold">Atur lubang foto</h3>
              <p className="text-sm text-fg/55">Geser dan ubah ukuran kotak agar pas dengan bagian transparan di frame.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="block text-sm text-fg/60">Nama frame
                  <input className={inputClass} value={working.name} maxLength={80} onChange={(e) => setWorking({ ...working, name: e.target.value })} />
                </label>
                <label className="block text-sm text-fg/60">Orientasi
                  <select className={inputClass} value={working.orientation} onChange={(e) => applyShape(e.target.value as "portrait" | "landscape", working.outputPreset)}>
                    <option value="portrait">Portrait (tegak)</option>
                    <option value="landscape">Landscape (mendatar)</option>
                  </select>
                </label>
                <label className="block text-sm text-fg/60">Ukuran output
                  <select className={inputClass} value={working.outputPreset} onChange={(e) => applyShape(working.orientation, e.target.value as OutputPreset)}>
                    {(Object.keys(OUTPUT_PRESETS) as (keyof typeof OUTPUT_PRESETS)[]).map((k) => <option key={k} value={k}>{OUTPUT_PRESETS[k].label}</option>)}
                    <option value="custom">Ukuran asli PNG</option>
                  </select>
                </label>
              </div>
              {Math.abs(working.canvasWidth / working.canvasHeight - workingMeta.native.w / workingMeta.native.h) > 0.03 && (
                <p className="mt-2 rounded-lg bg-amber-400/15 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">Bentuk PNG berbeda dari ukuran output ini, jadi gambar frame akan melar. Pilih "Ukuran asli PNG" atau ukuran lain yang sebentuk.</p>
              )}
              <p className="mt-2 text-xs text-fg/45">Hasil cetak otomatis memakai kertas {["4r", "2r", "a4"].includes(working.outputPreset) ? working.outputPreset.toUpperCase() : "bawaan booth"} dan arah {working.orientation === "landscape" ? "mendatar" : "tegak"}.</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4"><TemplateEditor template={working} onChange={(patch) => setWorking((w) => (w ? { ...w, ...patch } : w))} /></div>
            <div className="flex items-center justify-end gap-3 border-t border-fg/10 px-6 py-4">
              <button type="button" onClick={() => setWorking(null)} className="rounded-xl border border-fg/15 px-5 py-2.5 text-sm">Batal</button>
              <button type="button" onClick={() => void saveFrame()} disabled={savingFrame || !working.name.trim() || working.slots.length === 0} className="rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{savingFrame ? "Menyimpan…" : "Simpan frame"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------------------------------------------------

export default function EventManager() {
  const [data, setData] = useState<{ booths: { id: string; label: string | null; boothMode: string }[]; events: EventItem[] } | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<EventItem | "new" | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    api.getEvents().then((r) => { if (r) { setData(r); setError(""); } }).catch((e) => setError(e instanceof Error ? e.message : "Gagal memuat event"));
  }, []);
  useEffect(() => { load(); }, [load]);

  const boothNames = useMemo(() => new Map((data?.booths ?? []).map((b) => [b.id, b.label || "Booth tanpa nama"])), [data]);
  const opened = data?.events.find((e) => e.id === openId) ?? null;

  const toggle = async (e: EventItem) => {
    try { await api.setEventEnabled(e.id, !e.enabled); load(); } catch (err) { pushToast({ type: "error", title: "Gagal mengubah event", sub: err instanceof Error ? err.message : undefined }); }
  };
  const remove = async (e: EventItem) => {
    if (!window.confirm(`Hapus event "${e.name}"?\n\nSesi dan foto yang sudah terkumpul tetap tersimpan, hanya tidak lagi terhubung ke event ini.`)) return;
    try { await api.deleteEvent(e.id); if (openId === e.id) setOpenId(null); load(); } catch (err) { pushToast({ type: "error", title: "Gagal menghapus", sub: err instanceof Error ? err.message : undefined }); }
  };

  const liveCount = data?.events.filter((e) => e.state === "live").length ?? 0;

  return (
    <div className="space-y-4">
      {opened ? (
        <EventDashboard event={opened} boothNames={boothNames} onBack={() => setOpenId(null)} onEdit={() => setEditing(opened)} />
      ) : (
        <>
          <div className={`${panel} flex flex-wrap items-center gap-4`}>
            <div className="min-w-0 flex-1">
              <p className="eyebrow">EVENT</p>
              <h2 className="font-display text-2xl font-semibold">Acara &amp; event</h2>
              <p className="mt-1 text-sm text-fg/55">Atur event untuk setiap booth: jadwal, gratis atau berbayar, batas waktu, dan kuota. Tiap event punya dashboard sendiri.</p>
            </div>
            {liveCount > 0 && <span className="rounded-full bg-emerald-400/15 px-3 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-300">{liveCount} sedang berlangsung</span>}
            <button type="button" onClick={() => setEditing("new")} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/20">+ Event baru</button>
          </div>

          <div className={`${panel} grid gap-4 sm:grid-cols-3`}>
            {([
              ["1", "Buat event", "Isi nama, jadwal, booth yang menjalankan, dan aturan sesi (gratis, timer, kuota)."],
              ["2", "Atur frame & branding", "Unggah frame khusus dan sesuaikan warna, teks, dan logo untuk acara ini saja."],
              ["3", "Pantau & cetak", "Lihat dashboard dan galeri event, cetak tambahan langsung. Selesai acara, booth kembali normal."],
            ] as const).map(([n, title, text]) => (
              <div key={n} className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-semibold text-accent">{n}</span>
                <div><p className="text-sm font-semibold">{title}</p><p className="text-xs leading-relaxed text-fg/55">{text}</p></div>
              </div>
            ))}
          </div>

          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          {!data && !error && <p className="py-12 text-center text-fg/40">Memuat event…</p>}
          {data && data.events.length === 0 && (
            <div className={`${panel} py-14 text-center`}>
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent"><Icon name="ticket" className="h-7 w-7" /></span>
              <h3 className="mt-4 font-display text-lg font-semibold">Belum ada event</h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-fg/55">Buat event untuk pernikahan, gathering kantor, atau pameran. Pilih booth mana yang menjalankannya, lalu pantau hasilnya di dashboard event.</p>
              <button type="button" onClick={() => setEditing("new")} className="mt-5 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white">Buat event pertama</button>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {data?.events.map((e) => (
              <article key={e.id} className={`${panel} flex flex-col gap-3 ${e.state === "live" ? "!border-emerald-400/50" : ""}`}>
                <div className="flex items-start gap-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-accent/10 text-accent">
                    {e.imageUrl ? <img src={e.imageUrl} alt="" className="h-full w-full object-cover" /> : <Icon name="ticket" className="h-6 w-6" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-display text-lg font-semibold">{e.name}</h3>
                    <p className="truncate text-xs text-fg/50">{when(e.startsAt) || "Tanpa batas mulai"} → {when(e.endsAt) || "tanpa batas selesai"}</p>
                  </div>
                  <StateChip state={e.state} />
                </div>
                <p className="text-sm text-fg/60">
                  {e.kioskKeyIds.length === 0 ? "Semua booth" : e.kioskKeyIds.map((id) => boothNames.get(id) ?? "Booth dihapus").join(", ")}
                  {" · "}{e.freeEntry ? "Gratis" : "Berbayar"}{e.sessionCap ? ` · kuota ${e.sessionCap}` : ""}
                </p>
                <div className="flex items-center justify-between rounded-xl bg-fg/[0.05] px-4 py-2.5 text-sm"><span className="text-fg/55">Sesi berjalan</span><span className="font-display text-lg font-semibold">{e.sessionCount}</span></div>
                <div className="mt-auto flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setOpenId(e.id)} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white">Buka dashboard</button>
                  <button type="button" onClick={() => setEditing(e)} className="rounded-xl border border-fg/15 px-4 py-2 text-sm">Atur</button>
                  <button type="button" onClick={() => void toggle(e)} className="rounded-xl border border-fg/15 px-4 py-2 text-sm">{e.enabled ? "Jeda" : "Aktifkan"}</button>
                  <button type="button" onClick={() => void remove(e)} className="ml-auto rounded-xl px-3 py-2 text-sm text-red-400 hover:bg-red-400/10">Hapus</button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {editing && data && (
        <EventEditor
          event={editing === "new" ? null : editing}
          booths={data.booths}
          onClose={() => setEditing(null)}
          onSaved={(saved) => { setEditing(null); load(); if (editing !== "new") setOpenId(saved.id); }}
        />
      )}
    </div>
  );
}
