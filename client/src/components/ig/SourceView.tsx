import { useEffect, useMemo, useState } from "react";
import Select from "@/components/Select";
import { contentStudioApi, type CsSourceSession } from "@/lib/superadminApi";
import { btnAccent, btnGhost, dayKey, dayLabel, errText, inputClass, type Notice, NoticeLine } from "./shared";
import type { Tab } from "./OverviewView";

// Bahan foto: pick real photos from a tenant's finished sessions (our own booths), then have the generator put them into a post.
// Consent first: by default only sessions whose customer allowed publishing are listed; anything else needs an explicit tick.

const TENANT_KEY = "studiodo-ig-source-tenant";
type Sel = { sid: string; kind: "p" | "s"; i: number };
const keyOf = (s: Sel) => `${s.sid}:${s.kind}${s.i}`;

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
  const toggle = (s: Sel) => setSel((cur) => (cur.some((c) => keyOf(c) === keyOf(s)) ? cur.filter((c) => keyOf(c) !== keyOf(s)) : cur.length >= 8 ? cur : [...cur, s]));
  const needsConfirm = sel.some((s) => rows.find((r) => r.id === s.sid && !r.consent));
  const today = dayKey(new Date().toISOString(), 420);

  const generate = async () => {
    if (!featureId || !sel.length) return;
    setBusy(true); setN(null);
    try {
      const photos: string[] = []; const strips: string[] = [];
      for (const sid of [...new Set(sel.map((s) => s.sid))]) {
        const mine = sel.filter((s) => s.sid === sid);
        const r = await contentStudioApi.sourceImport({ sessionId: sid, photoIndexes: mine.filter((s) => s.kind === "p").map((s) => s.i), strip: mine.some((s) => s.kind === "s"), confirmedConsent: confirmed });
        photos.push(...(r?.photos ?? [])); if (r?.strip) strips.push(r.strip);
      }
      const decks = (await contentStudioApi.generate([featureId], [format], 0, { photos, strips })) ?? [];
      await onGenerated();
      setN({ ok: true, text: `${decks.length} konten dibuat dari ${photos.length + strips.length} foto. Buka tab Generator atau Studio untuk menjadwalkan; hasilnya tetap draf sampai Anda setujui.` });
      setSel([]);
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
            <span className="text-xs font-bold">{sel.length}/8 dipilih</span>
            <Select className="min-w-0 flex-1 rounded-lg border border-fg/15 bg-fg/5 px-2 py-1.5 text-xs" value={featureId} onChange={(e) => setFeatureId(e.target.value)}>
              {features.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
            <Select className="rounded-lg border border-fg/15 bg-fg/5 px-2 py-1.5 text-xs" value={format} onChange={(e) => setFormat(e.target.value as "carousel" | "reel")}><option value="carousel">Carousel</option><option value="reel">Reel</option></Select>
            <button className={btnAccent} disabled={busy || !sel.length || !featureId || (needsConfirm && !confirmed)} onClick={() => void generate()}>{busy ? "Membuat…" : "Buat konten"}</button>
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
      <img src={src} alt={label} loading="lazy" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      {on && <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-accent text-xs font-black text-white">✓</span>}
      <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white">{label}</span>
    </button>
  );
}
