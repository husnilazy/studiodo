import { useEffect, useState } from "react";
import { superadminApi, type SiteContentField, type SiteContentSection } from "@/lib/superadminApi";
import { getApiBaseUrl } from "@/lib/apiConfig";

// Superadmin editor for the marketing website's content. Fully generic: it renders
// whatever field schema the server sends (server/lib/siteContent.ts), so adding a
// field or a whole section there needs no change here.

const inputClass = "mt-1 w-full rounded-lg border border-fg/15 bg-fg/5 px-3 py-2 text-sm outline-none focus:border-accent";
type Values = Record<string, unknown>;

function blankValues(fields: SiteContentField[]): Values {
  const out: Values = {};
  for (const f of fields) out[f.key] = f.type === "list" ? [] : "";
  return out;
}

const MAX_IMAGE_BYTES = 600 * 1024;

// Stored image values are API-relative paths ("/api/public/assets/<id>"); to preview one in the
// admin UI we need the API's origin, which getApiBaseUrl() knows.
function assetPreviewUrl(path: string): string {
  try { return new URL(path, new URL(getApiBaseUrl(), window.location.href).origin).toString(); } catch { return path; }
}

export function ImageField({ label, hint, value, onChange }: { label: string; hint?: string; value: string; onChange: (next: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setError("Format harus PNG, JPG, atau WebP"); return; }
    if (file.size > MAX_IMAGE_BYTES) { setError("Ukuran maksimal 600 KB"); return; }
    setBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Gagal membaca file"));
        reader.readAsDataURL(file);
      });
      const result = await superadminApi.uploadSiteAsset(file.name, dataUrl.split(",")[1] ?? "");
      if (result) onChange(result.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengunggah");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="text-sm text-fg/60">
      {label}
      <div className="mt-1 flex flex-wrap items-center gap-3 rounded-lg border border-fg/15 bg-fg/5 p-3">
        <div className="flex h-14 w-24 shrink-0 items-center justify-center rounded-md bg-fg/10">
          {value ? <img src={assetPreviewUrl(value)} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-fg/30">Belum ada</span>}
        </div>
        <label className="cursor-pointer rounded-lg bg-fg/10 px-3 py-2 text-xs font-semibold text-fg hover:bg-fg/15">
          {busy ? "Mengunggah…" : value ? "Ganti gambar" : "Unggah gambar"}
          <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} className="sr-only" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {value && <button type="button" onClick={() => onChange("")} className="rounded-lg px-3 py-2 text-xs text-red-300 hover:bg-red-500/15">Hapus</button>}
        {error && <span role="alert" className="text-xs text-red-300">{error}</span>}
      </div>
      {hint && <span className="mt-1 block text-xs text-fg/35">{hint}</span>}
    </div>
  );
}

function FieldsEditor({ fields, values, onChange }: { fields: SiteContentField[]; values: Values; onChange: (next: Values) => void }) {
  const set = (key: string, value: unknown) => onChange({ ...values, [key]: value });
  return (
    <div className="grid gap-4">
      {fields.map((f) => {
        if (f.type === "list") {
          const items = (Array.isArray(values[f.key]) ? values[f.key] : []) as Values[];
          const max = f.maxItems ?? 12;
          const update = (next: Values[]) => set(f.key, next);
          const move = (i: number, dir: -1 | 1) => {
            const j = i + dir;
            if (j < 0 || j >= items.length) return;
            const next = [...items];
            [next[i], next[j]] = [next[j], next[i]];
            update(next);
          };
          return (
            <div key={f.key} className="rounded-2xl border border-fg/10 bg-fg/5 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-fg/80">{f.label} <span className="font-normal text-fg/35">({items.length}/{max})</span></span>
                <button type="button" disabled={items.length >= max} onClick={() => update([...items, blankValues(f.itemFields)])} className="rounded-lg bg-fg/10 px-3 py-1.5 text-xs font-semibold hover:bg-fg/15 disabled:opacity-40">
                  + Tambah {f.itemLabel.toLowerCase()}
                </button>
              </div>
              {items.length === 0 && <p className="text-xs text-fg/35">Belum ada item.</p>}
              <div className="grid gap-3">
                {items.map((item, i) => (
                  <div key={i} className="rounded-xl border border-fg/10 bg-fg/[0.03] p-3">
                    <div className="mb-2 flex items-center justify-between text-xs text-fg/45">
                      <span>{f.itemLabel} #{i + 1}</span>
                      <span className="flex gap-1">
                        <button type="button" aria-label="Naikkan" onClick={() => move(i, -1)} disabled={i === 0} className="rounded px-2 py-0.5 hover:bg-fg/10 disabled:opacity-30">↑</button>
                        <button type="button" aria-label="Turunkan" onClick={() => move(i, 1)} disabled={i === items.length - 1} className="rounded px-2 py-0.5 hover:bg-fg/10 disabled:opacity-30">↓</button>
                        <button type="button" aria-label="Hapus" onClick={() => update(items.filter((_, k) => k !== i))} className="rounded px-2 py-0.5 text-red-300 hover:bg-red-500/15">Hapus</button>
                      </span>
                    </div>
                    <FieldsEditor fields={f.itemFields} values={item} onChange={(next) => update(items.map((it, k) => (k === i ? next : it)))} />
                  </div>
                ))}
              </div>
            </div>
          );
        }
        const value = typeof values[f.key] === "string" ? (values[f.key] as string) : "";
        if (f.type === "image") {
          return <ImageField key={f.key} label={f.label} hint={f.hint} value={value} onChange={(next) => set(f.key, next)} />;
        }
        if (f.type === "select") {
          return (
            <label key={f.key} className="text-sm text-fg/60">
              {f.label}
              <select className={inputClass} value={value} onChange={(e) => set(f.key, e.target.value)}>
                <option value="">— tanpa ikon —</option>
                {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {f.hint && <span className="mt-1 block text-xs text-fg/35">{f.hint}</span>}
            </label>
          );
        }
        return (
          <label key={f.key} className="text-sm text-fg/60">
            {f.label}
            {f.type === "textarea" ? (
              <textarea rows={3} maxLength={f.max} className={inputClass} value={value} onChange={(e) => set(f.key, e.target.value)} />
            ) : (
              <input maxLength={f.max} className={inputClass} value={value} onChange={(e) => set(f.key, e.target.value)} />
            )}
            {f.hint && <span className="mt-1 block text-xs text-fg/35">{f.hint}</span>}
          </label>
        );
      })}
    </div>
  );
}

function SectionEditor({ section, onSaved }: { section: SiteContentSection; onSaved: () => void }) {
  const [draft, setDraft] = useState<Values>(section.data);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const dirty = JSON.stringify(draft) !== JSON.stringify(section.data);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      setMessage(ok);
      onSaved();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 border-t border-fg/10 pt-4">
      <FieldsEditor fields={section.fields} values={draft} onChange={setDraft} />
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy || !dirty} onClick={() => run(() => superadminApi.saveSiteContent(section.key, { data: draft }), "Tersimpan. Tampil di website dalam ±1 menit.")} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold disabled:opacity-40">
          {busy ? "Menyimpan…" : "Simpan"}
        </button>
        <button type="button" disabled={busy || !dirty} onClick={() => { setDraft(section.data); setMessage(""); }} className="rounded-xl bg-fg/10 px-4 py-2.5 text-sm font-semibold disabled:opacity-40">
          Batalkan perubahan
        </button>
        {section.customized && (
          <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Kembalikan "${section.label}" ke teks bawaan? Perubahan Anda akan hilang.`)) run(() => superadminApi.resetSiteContent(section.key), "Dikembalikan ke default."); }} className="rounded-xl px-4 py-2.5 text-sm text-fg/50 hover:bg-fg/10">
            Kembalikan ke default
          </button>
        )}
        {message && <span className="text-sm text-fg/55" role="status">{message}</span>}
      </div>
    </div>
  );
}

export function SiteContentPanel() {
  const [sections, setSections] = useState<SiteContentSection[] | null>(null);
  const [error, setError] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = () => {
    superadminApi.getSiteContent()
      .then((rows) => { setSections(rows ?? []); setError(""); })
      .catch((err) => setError(err instanceof Error ? err.message : "Gagal memuat konten"));
  };
  useEffect(load, []);

  if (error) return <p className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</p>;
  if (!sections) return <p role="status" className="rounded-[2rem] border border-fg/10 bg-fg/[0.045] p-6 text-sm text-fg/50">Memuat konten website…</p>;

  const reorderable = sections.filter((s) => !s.fixed);
  const fixed = sections.filter((s) => s.fixed);

  const toggle = async (s: SiteContentSection) => {
    setBusyKey(s.key);
    try { await superadminApi.saveSiteContent(s.key, { enabled: !s.enabled }); load(); } catch (err) { setError(err instanceof Error ? err.message : "Gagal"); } finally { setBusyKey(null); }
  };
  const move = async (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= reorderable.length) return;
    const keys = reorderable.map((s) => s.key);
    [keys[index], keys[j]] = [keys[j], keys[index]];
    setBusyKey(reorderable[index].key);
    try { await superadminApi.reorderSiteContent(keys); load(); } catch (err) { setError(err instanceof Error ? err.message : "Gagal mengubah urutan"); } finally { setBusyKey(null); }
  };

  const card = (s: SiteContentSection, index?: number) => (
    <div key={s.key} className={`rounded-2xl border p-4 ${s.enabled ? "border-fg/10 bg-fg/[0.03]" : "border-fg/5 bg-fg/[0.015] opacity-70"}`}>
      <div className="flex flex-wrap items-center gap-3">
        {index !== undefined && (
          <span className="flex flex-col">
            <button type="button" aria-label={`Naikkan ${s.label}`} disabled={busyKey !== null || index === 0} onClick={() => move(index, -1)} className="rounded px-2 text-xs leading-4 hover:bg-fg/10 disabled:opacity-30">▲</button>
            <button type="button" aria-label={`Turunkan ${s.label}`} disabled={busyKey !== null || index === reorderable.length - 1} onClick={() => move(index, 1)} className="rounded px-2 text-xs leading-4 hover:bg-fg/10 disabled:opacity-30">▼</button>
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{s.label} {s.customized && <span className="ml-1 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">diubah</span>}</div>
          <div className="text-xs text-fg/40">{s.description}</div>
        </div>
        {!s.fixed && (
          <button type="button" disabled={busyKey !== null} onClick={() => toggle(s)} className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${s.enabled ? "bg-emerald-500/20 text-emerald-200" : "bg-fg/10 text-fg/50"}`} aria-pressed={s.enabled}>
            {s.enabled ? "Tampil" : "Disembunyikan"}
          </button>
        )}
        <button type="button" onClick={() => setOpenKey(openKey === s.key ? null : s.key)} className="rounded-xl bg-fg/10 px-4 py-2 text-sm font-semibold hover:bg-fg/15">
          {openKey === s.key ? "Tutup" : "Edit"}
        </button>
      </div>
      {openKey === s.key && <SectionEditor section={s} onSaved={load} />}
    </div>
  );

  return (
    <section className="rounded-[2rem] border border-fg/10 bg-fg/[0.045] p-6">
      <p className="text-xs uppercase tracking-[.16em] text-accent">KONTEN WEBSITE</p>
      <h2 className="mt-2 font-display text-xl font-semibold">Landing page STUDIODO</h2>
      <p className="mt-1 text-sm text-fg/45">Ubah teks, tampilkan/sembunyikan, dan atur urutan bagian di halaman utama website. Bagian Harga otomatis mengikuti menu Plans.</p>
      <div className="mt-5 grid gap-3">{reorderable.map((s, i) => card(s, i))}</div>
      {fixed.length > 0 && <div className="mt-6"><p className="mb-2 text-xs uppercase tracking-[.16em] text-fg/35">Umum</p><div className="grid gap-3">{fixed.map((s) => card(s))}</div></div>}
    </section>
  );
}
