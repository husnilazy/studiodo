import { useEffect, useMemo, useRef, useState } from "react";
import Select from "@/components/Select";
import { contentStudioApi, type CsSourceSession } from "@/lib/superadminApi";
import { btnAccent, btnGhost, dayKey, dayLabel, errText, inputClass, type Notice, NoticeLine } from "./shared";
import type { Tab } from "./OverviewView";

// Bahan foto: pick real photos from a tenant's finished sessions (our own booths), then have the generator put them into a post.
// Consent first: by default only sessions whose customer allowed publishing are listed; anything else needs an explicit tick.

const TENANT_KEY = "studiodo-ig-source-tenant";
type Sel = { sid: string; kind: "p" | "s"; i: number };
const keyOf = (s: Sel) => `${s.sid}:${s.kind}${s.i}`;
const MAX_PICK = 8;

/** Phone photos are huge; shrink to 2000 px JPEG before uploading (also applies the EXIF rotation). */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(`${file.name}: gambar tidak bisa dibaca (pakai JPG/PNG/WebP)`)); i.src = url; });
    const k = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.88);
  } finally { URL.revokeObjectURL(url); }
}

export function SourceView({ onGenerated, go }: { onGenerated: () => Promise<void>; go: (t: Tab) => void }) {
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);
  const [tenantId, setTenantId] = useState(() => { try { return localStorage.getItem(TENANT_KEY) ?? ""; } catch { return ""; } });
  const [all, setAll] = useState(false);
  const [rows, setRows] = useState<CsSourceSession[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<Sel[]>([]);
  const [features, setFeatures] = useState<{ id: string; name: string }[]>([]);
  const [featureId, setFeatureId] = useState("");
  const [format, setFormat] = useState<"carousel" | "reel">("carousel");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [n, setN] = useState<Notice>(null);
  const [assets, setAssets] = useState<{ name: string; size: number }[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [usel, setUsel] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadAssets = async () => { const a = (await contentStudioApi.assets()) ?? []; setAssets(a.sort((x, y) => y.name.localeCompare(x.name))); };
  useEffect(() => { void loadAssets().catch(() => undefined); }, []);
  useEffect(() => {
    let live = true;
    for (const a of assets.slice(0, 60)) {
      if (thumbs[a.name]) continue;
      contentStudioApi.assetBlobUrl(a.name).then((u) => { if (live) setThumbs((t) => (t[a.name] ? t : { ...t, [a.name]: u })); }).catch(() => undefined);
    }
    return () => { live = false; };
  }, [assets]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = sel.length + usel.length;
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true); setN(null);
    const added: string[] = [];
    try {
      for (const f of [...files].slice(0, 12)) {
        const r = await contentStudioApi.uploadAsset(f.name, await shrink(f));
        if (r?.name) added.push(r.name);
      }
      await loadAssets();
      setUsel((cur) => [...cur, ...added].slice(0, MAX_PICK - sel.length));
      setN({ ok: true, text: `${added.length} foto diunggah dan dipilih.` });
    } catch (e) { setN({ ok: false, text: errText(e, "Gagal mengunggah") }); await loadAssets().catch(() => undefined); } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const removeAsset = async (name: string) => {
    if (!window.confirm("Hapus foto ini dari bahan Studio?")) return;
    try { await contentStudioApi.deleteAsset(name); setUsel((c) => c.filter((x) => x !== name)); await loadAssets(); } catch (e) { setN({ ok: false, text: errText(e) }); }
  };
  const toggleUp = (name: string) => setUsel((cur) => (cur.includes(name) ? cur.filter((x) => x !== name) : sel.length + cur.length >= MAX_PICK ? cur : [...cur, name]));

  useEffect(() => {
    contentStudioApi.sourceTenants().then((t) => setTenants(t ?? [])).catch((e) => setN({ ok: false, text: errText(e) }));
    contentStudioApi.features().then((r) => { const f = (r?.features ?? []).map((x) => ({ id: x.id, name: x.name })); setFeatures(f); setFeatureId((cur) => cur || f[0]?.id || ""); }).catch(() => undefined);
  }, []);

  const load = async (more = false) => {
    if (!tenantId) return;
    setLoading(true); setN(null);
    try {
      const r = await contentStudioApi.sourceSessions(tenantId, all, more ? next ?? undefined : undefined);
      setRows((cur) => (more ? [...cur, ...(r?.sessions ?? [])] : r?.sessions ?? []));
      setNext(r?.next ?? null);
    } catch (e) { setN({ ok: false, text: errText(e) }); } finally { setLoading(false); }
  };
  useEffect(() => {
    setSel([]); setRows([]); setNext(null); setConfirmed(false); void load(false);
    try { localStorage.setItem(TENANT_KEY, tenantId); } catch { /* optional */ }
  }, [tenantId, all]); // eslint-disable-line react-hooks/exhaustive-deps

  const picked = useMemo(() => new Set(sel.map(keyOf)), [sel]);
  const toggle = (s: Sel) => setSel((cur) => (cur.some((c) => keyOf(c) === keyOf(s)) ? cur.filter((c) => keyOf(c) !== keyOf(s)) : cur.length + usel.length >= MAX_PICK ? cur : [...cur, s]));
  const needsConfirm = sel.some((s) => rows.find((r) => r.id === s.sid && !r.consent));
  const today = dayKey(new Date().toISOString(), 420);

  const generate = async () => {
    if (!featureId || !total) return;
    setBusy(true); setN(null);
    try {
      const photos: string[] = [...usel]; const strips: string[] = [];
      for (const sid of [...new Set(sel.map((s) => s.sid))]) {
        const mine = sel.filter((s) => s.sid === sid);
        const r = await contentStudioApi.sourceImport({ sessionId: sid, photoIndexes: mine.filter((s) => s.kind === "p").map((s) => s.i), strip: mine.some((s) => s.kind === "s"), confirmedConsent: confirmed });
        photos.push(...(r?.photos ?? [])); if (r?.strip) strips.push(r.strip);
      }
      const decks = (await contentStudioApi.generate([featureId], [format], 0, { photos, strips })) ?? [];
      await onGenerated();
      setN({ ok: true, text: `${decks.length} konten dibuat dari ${photos.length + strips.length} foto. Buka tab Generator atau Studio untuk menjadwalkan; hasilnya tetap draf sampai Anda setujui.` });
      setSel([]); setUsel([]);
    } catch (e) { setN({ ok: false, text: errText(e) }); } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto grid w-full min-w-0 max-w-3xl grid-cols-[minmax(0,1fr)] gap-3 pb-28">
      <div className="grid gap-2 rounded-2xl border border-fg/10 bg-fg/5 p-3">
        <label className="text-xs font-semibold text-fg/60">Tenant (booth kita sendiri)
          <Select className={inputClass} value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
            <option value="">— pilih tenant —</option>
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </label>
        <label className="flex items-start gap-2 text-xs text-fg/70"><input type="checkbox" className="mt-0.5" checked={all} onChange={(e) => setAll(e.target.checked)} /><span>Tampilkan juga sesi <b>tanpa izin publikasi</b>. Foto customer hanya dipakai bila izin sudah didapat.</span></label>
      </div>
      <NoticeLine n={n} />

      <section className="grid min-w-0 gap-2 rounded-2xl border border-fg/10 bg-fg/5 p-3">
        <header className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold">Foto saya</h3>
          <span className="text-[11px] text-fg/50">Unggah dari galeri HP atau komputer, di luar kiosk.</span>
          <button className={`${btnAccent} ml-auto`} disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? "Mengunggah…" : "+ Unggah foto"}</button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => void upload(e.target.files)} />
        </header>
        {assets.length === 0 ? <p className="py-3 text-center text-xs text-fg/50">Belum ada foto unggahan.</p> : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {assets.slice(0, 60).map((a) => (
              <div key={a.name} className="relative">
                <Thumb src={thumbs[a.name] ?? ""} label={a.name.replace(/^[a-z0-9]+-/, "").slice(0, 14)} on={usel.includes(a.name)} onClick={() => toggleUp(a.name)} />
                <button type="button" aria-label={`Hapus ${a.name}`} onClick={() => void removeAsset(a.name)} className="absolute left-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-xs font-bold text-white">×</button>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-fg/45">Pastikan Anda berhak memakai foto ini dan orang di dalamnya setuju fotonya dipublikasikan.</p>
      </section>

      {!tenantId && <p className="rounded-2xl border border-dashed border-fg/20 p-8 text-center text-sm text-fg/50">Pilih tenant untuk melihat foto sesinya.</p>}
      {tenantId && !loading && rows.length === 0 && <p className="rounded-2xl border border-dashed border-fg/20 p-8 text-center text-sm text-fg/50">{all ? "Belum ada sesi dengan foto." : "Belum ada sesi dengan izin publikasi. Nyalakan pop-up izin media sosial di Flow Kiosk, atau tampilkan sesi tanpa izin di atas."}</p>}

      {rows.map((r) => (
        <article key={r.id} className="grid min-w-0 gap-2 rounded-2xl border border-fg/10 bg-fg/5 p-3">
          <header className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
            <span className="text-fg/60">{dayLabel(dayKey(r.createdAt, 420), today)}</span>
            <span className={`rounded-full px-2.5 py-1 font-bold ${r.consent ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300"}`}>{r.consent ? "Izin publikasi ✓" : "Tanpa izin"}</span>
            {r.hasVideo && <span className="rounded-full bg-fg/10 px-2.5 py-1 text-fg/60">ada video</span>}
          </header>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {r.strip && <Thumb src={r.strip} label="Strip" on={picked.has(`${r.id}:s0`)} onClick={() => toggle({ sid: r.id, kind: "s", i: 0 })} />}
            {r.photos.map((src, i) => <Thumb key={i} src={src} label={`Foto ${i + 1}`} on={picked.has(`${r.id}:p${i}`)} onClick={() => toggle({ sid: r.id, kind: "p", i })} />)}
          </div>
        </article>
      ))}
      {next && <button className={btnGhost} disabled={loading} onClick={() => void load(true)}>{loading ? "Memuat…" : "Muat lebih banyak"}</button>}
      {loading && rows.length === 0 && tenantId && <p className="text-xs text-fg/50">Memuat…</p>}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-fg/15 bg-canvas/95 p-3 backdrop-blur" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto grid max-w-3xl gap-2">
          {needsConfirm && <label className="flex items-start gap-2 text-[11px] text-amber-700 dark:text-amber-300"><input type="checkbox" className="mt-0.5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /><span>Ada foto tanpa izin di kiosk. Saya sudah mendapat izin customer di luar aplikasi.</span></label>}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold">{total}/{MAX_PICK} dipilih</span>
            <Select className="min-w-0 flex-1 rounded-lg border border-fg/15 bg-fg/5 px-2 py-1.5 text-xs" value={featureId} onChange={(e) => setFeatureId(e.target.value)}>
              {features.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
            <Select className="rounded-lg border border-fg/15 bg-fg/5 px-2 py-1.5 text-xs" value={format} onChange={(e) => setFormat(e.target.value as "carousel" | "reel")}><option value="carousel">Carousel</option><option value="reel">Reel</option></Select>
            <button className={btnAccent} disabled={busy || !total || !featureId || (needsConfirm && !confirmed)} onClick={() => void generate()}>{busy ? "Membuat…" : "Buat konten"}</button>
            {n?.ok && <button className={btnGhost} onClick={() => go("generator")}>Buka Generator</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Thumb({ src, label, on, onClick }: { src: string; label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} aria-label={label} className={`relative overflow-hidden rounded-xl bg-black/20 ${on ? "ring-4 ring-accent" : "ring-1 ring-fg/15"}`} style={{ aspectRatio: "3 / 4" }}>
      {src ? <img src={src} alt={label} loading="lazy" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : <span className="grid h-full w-full place-items-center text-[10px] text-fg/40">Memuat…</span>}
      {on && <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-accent text-xs font-black text-white">✓</span>}
      <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white">{label}</span>
    </button>
  );
}
