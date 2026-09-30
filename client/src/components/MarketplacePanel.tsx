import { useEffect, useState } from "react";
import { superadminApi, type MarketplaceCategory, type MarketplaceItem, type MarketplaceSource, type SuperadminTenant } from "@/lib/superadminApi";

// Superadmin curation of the template marketplace: publish a template from any tenant's library into
// the shared catalog, then feature, hide, edit or remove entries. Tenants install from the website.

const inputClass = "mt-1 w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm outline-none focus:border-accent";

function PublishForm({ categories, onPublished }: { categories: MarketplaceCategory[]; onPublished: () => void }) {
  const [tenants, setTenants] = useState<SuperadminTenant[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [sources, setSources] = useState<MarketplaceSource[] | null>(null);
  const [sourceId, setSourceId] = useState("");
  const [form, setForm] = useState({ name: "", description: "", creatorName: "", category: "custom", featured: false });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { superadminApi.getTenants().then((rows) => setTenants(rows ?? [])).catch(() => undefined); }, []);

  const pickTenant = async (id: string) => {
    setTenantId(id); setSourceId(""); setSources(null); setMessage("");
    if (!id) return;
    try { setSources((await superadminApi.getMarketplaceSources(id)) ?? []); } catch (e) { setMessage(e instanceof Error ? e.message : "Gagal memuat template"); }
  };
  const pickSource = (s: MarketplaceSource) => {
    setSourceId(s.id);
    setForm((f) => ({ ...f, name: s.name, category: categories.some((c) => c.key === s.category) ? s.category : "custom" }));
  };

  const publish = async () => {
    setBusy(true); setMessage("");
    try {
      await superadminApi.publishToMarketplace({ fromTemplateId: sourceId, name: form.name, description: form.description, creatorName: form.creatorName, category: form.category, featured: form.featured });
      setSourceId(""); setForm({ name: "", description: "", creatorName: "", category: "custom", featured: false });
      onPublished();
      setMessage("Template diterbitkan ke marketplace.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Gagal menerbitkan"); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-black/10 p-5">
      <h3 className="font-display text-lg font-semibold">Terbitkan template baru</h3>
      <p className="mt-1 text-xs text-white/40">Pilih tenant pemilik template (mis. akun STUDIODO sendiri), lalu template-nya. Yang diterbitkan adalah salinan; mengubah aslinya tidak memengaruhi katalog.</p>
      <label className="mt-4 block text-sm text-white/60">
        Tenant sumber
        <select className={inputClass} value={tenantId} onChange={(e) => pickTenant(e.target.value)}>
          <option value="">— pilih tenant —</option>
          {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>

      {sources !== null && (
        sources.length === 0 ? <p className="mt-3 text-sm text-white/45">Tenant ini belum punya template.</p> : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {sources.map((s) => (
              <button key={s.id} type="button" disabled={!s.publishable} onClick={() => pickSource(s)} title={s.publishable ? s.name : "Simpan ulang di aplikasi dulu"}
                className={`rounded-xl border p-2 text-left transition ${sourceId === s.id ? "border-accent bg-accent/10" : "border-white/10 hover:border-white/30"} ${s.publishable ? "" : "opacity-40"}`}>
                <div className="flex h-24 items-center justify-center rounded-lg bg-white/5">
                  {s.publishable && <img src={s.imageUrl} alt="" loading="lazy" className="max-h-full max-w-full object-contain" />}
                </div>
                <div className="mt-2 truncate text-xs font-semibold">{s.name}</div>
                <div className="text-[11px] text-white/40">{s.slotCount} slot · {s.orientation}</div>
              </button>
            ))}
          </div>
        )
      )}

      {sourceId && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-white/60">Nama<input maxLength={80} className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="text-sm text-white/60">Kreator (kredit, opsional)<input maxLength={60} className={inputClass} value={form.creatorName} onChange={(e) => setForm({ ...form, creatorName: e.target.value })} placeholder="kosong = STUDIODO" /></label>
          <label className="text-sm text-white/60">Kategori
            <select className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm text-white/60"><input type="checkbox" checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} /> Tampilkan sebagai unggulan</label>
          <label className="text-sm text-white/60 sm:col-span-2">Deskripsi (opsional)<textarea rows={2} maxLength={300} className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        </div>
      )}
      <div className="mt-4 flex items-center gap-3">
        <button type="button" disabled={busy || !sourceId || !form.name.trim()} onClick={publish} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold disabled:opacity-40">{busy ? "Menerbitkan…" : "Terbitkan ke marketplace"}</button>
        {message && <span role="status" className="text-sm text-white/55">{message}</span>}
      </div>
    </div>
  );
}

export function MarketplacePanel() {
  const [data, setData] = useState<{ categories: MarketplaceCategory[]; items: MarketplaceItem[] } | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => { superadminApi.getMarketplace().then((d) => { setData(d ?? { categories: [], items: [] }); setError(""); }).catch((e) => setError(e instanceof Error ? e.message : "Gagal memuat marketplace")); };
  useEffect(load, []);

  const patch = async (id: string, body: Parameters<typeof superadminApi.updateMarketplaceItem>[1]) => {
    setBusyId(id);
    try { await superadminApi.updateMarketplaceItem(id, body); load(); } catch (e) { setError(e instanceof Error ? e.message : "Gagal menyimpan"); } finally { setBusyId(null); }
  };
  const remove = async (item: MarketplaceItem) => {
    if (!window.confirm(`Hapus "${item.name}" dari marketplace? Tenant yang sudah memasangnya tetap memiliki salinannya.`)) return;
    setBusyId(item.id);
    try { await superadminApi.deleteMarketplaceItem(item.id); load(); } catch (e) { setError(e instanceof Error ? e.message : "Gagal menghapus"); } finally { setBusyId(null); }
  };

  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-6">
      <p className="text-xs uppercase tracking-[.16em] text-accent">MARKETPLACE</p>
      <h2 className="mt-2 font-display text-xl font-semibold">Katalog template</h2>
      <p className="mt-1 text-sm text-white/45">Template yang diterbitkan tampil di halaman /template dan bisa dipasang tenant dengan satu klik dari dashboard mereka.</p>
      {error && <p role="alert" className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}

      {data && <div className="mt-5"><PublishForm categories={data.categories} onPublished={load} /></div>}

      {data && (
        <div className="mt-6">
          <h3 className="mb-3 font-display text-lg font-semibold">Di katalog ({data.items.length})</h3>
          {data.items.length === 0 ? <p className="text-sm text-white/45">Belum ada template di katalog.</p> : (
            <div className="grid gap-3">
              {data.items.map((it) => (
                <div key={it.id} className={`flex flex-wrap items-center gap-4 rounded-2xl border p-3 ${it.active ? "border-white/10 bg-white/[0.03]" : "border-white/5 bg-white/[0.015] opacity-70"}`}>
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-white/5"><img src={it.imageUrl} alt="" loading="lazy" className="max-h-full max-w-full object-contain" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{it.name} {it.featured && <span className="ml-1 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">unggulan</span>}</div>
                    <div className="text-xs text-white/40">{it.category} · {it.orientation} · {it.slotCount} slot · {it.installCount}× dipasang{it.creatorName ? ` · oleh ${it.creatorName}` : ""}</div>
                  </div>
                  <button type="button" disabled={busyId === it.id} onClick={() => patch(it.id, { featured: !it.featured })} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/15">{it.featured ? "Lepas unggulan" : "Jadikan unggulan"}</button>
                  <button type="button" disabled={busyId === it.id} onClick={() => patch(it.id, { active: !it.active })} className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${it.active ? "bg-emerald-500/20 text-emerald-200" : "bg-white/10 text-white/50"}`} aria-pressed={it.active}>{it.active ? "Tampil" : "Disembunyikan"}</button>
                  <button type="button" disabled={busyId === it.id} onClick={() => remove(it)} className="rounded-xl px-3 py-2 text-xs text-red-300 hover:bg-red-500/15">Hapus</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
