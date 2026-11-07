import { useEffect, useState } from "react";
import { api, type BoothDetail } from "@/lib/api";
import { inputClass } from "@/lib/adminUi";
import { pushToast } from "@/lib/toastStore";

// "Pengaturan booth": what is special about ONE booth (kiosk key). Everything left empty follows the main settings, so a tenant can price
// Jakarta differently from Jogja, hide a package at one location, or give one booth its own colours and texts, without touching the others.

const rupiah = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

const COLORS: { key: string; label: string; hint: string }[] = [
  { key: "accentColor", label: "Warna utama (tombol)", hint: "Warna tombol dan aksen" },
  { key: "backgroundColor", label: "Warna latar", hint: "Latar layar kiosk" },
  { key: "surfaceColor", label: "Warna kartu", hint: "Kotak dan kartu di layar" },
  { key: "textColor", label: "Warna teks", hint: "Teks utama" },
];
const TEXTS: { key: string; label: string; placeholder: string }[] = [
  { key: "brandName", label: "Nama brand di layar", placeholder: "mis. Fotobox Jakarta" },
  { key: "tagline", label: "Slogan", placeholder: "mis. Abadikan momenmu" },
  { key: "idleHeadline", label: "Judul layar awal", placeholder: "Teks besar saat kiosk menunggu" },
  { key: "idleSubheadline", label: "Teks kecil layar awal", placeholder: "Keterangan di bawah judul" },
  { key: "idleStartText", label: "Tulisan tombol mulai", placeholder: "mis. Sentuh untuk mulai" },
  { key: "promoText", label: "Teks promo", placeholder: "mis. Diskon 10% hari ini" },
  { key: "packageHeadline", label: "Judul layar pilih paket", placeholder: "mis. Pilih paket fotomu" },
];

export default function BoothSettingsModal({ boothId, onClose, onSaved }: { boothId: string; onClose: () => void; onSaved: () => void }) {
  const [data, setData] = useState<BoothDetail | null>(null);
  const [label, setLabel] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [look, setLook] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api.getBooth(boothId).then((r) => {
      if (cancelled || !r) return;
      setData(r);
      setLabel(r.booth.label ?? "");
      setPrices(Object.fromEntries(Object.entries(r.packageOverrides).filter(([, o]) => o.price !== undefined).map(([id, o]) => [id, String(o.price)])));
      setHidden(Object.fromEntries(Object.entries(r.packageOverrides).filter(([, o]) => o.active === false).map(([id]) => [id, true])));
      setLook(r.overrides);
    }).catch((err) => setError(err instanceof Error ? err.message : "Gagal memuat pengaturan booth"));
    return () => { cancelled = true; };
  }, [boothId]);

  const save = async () => {
    if (!data || busy) return;
    setBusy(true); setError("");
    try {
      const packageOverrides: Record<string, { price?: number; active?: boolean }> = {};
      for (const p of data.packages) {
        const entry: { price?: number; active?: boolean } = {};
        const raw = (prices[p.id] ?? "").replace(/[^\d]/g, "");
        if (raw !== "" && Number(raw) !== p.price) entry.price = Number(raw); // same as the main price = nothing special
        if (hidden[p.id]) entry.active = false;
        if (Object.keys(entry).length > 0) packageOverrides[p.id] = entry;
      }
      await api.saveBooth(boothId, { label: label.trim() || undefined, overrides: look, packageOverrides });
      pushToast({ type: "success", title: "Pengaturan booth disimpan", sub: "Kiosk memakainya saat sesi berikutnya dimulai." });
      onSaved();
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : "Gagal menyimpan"); } finally { setBusy(false); }
  };

  const resetAll = () => { setPrices({}); setHidden({}); setLook({}); };
  const setLookValue = (key: string, value: string) => setLook((prev) => { const next = { ...prev }; if (value) next[key] = value; else delete next[key]; return next; });
  const customCount = Object.keys(prices).filter((k) => prices[k] !== "").length + Object.values(hidden).filter(Boolean).length + Object.keys(look).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Pengaturan booth" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-fg/10 bg-surface shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-fg/10 px-6 py-4">
          <div>
            <p className="eyebrow">PENGATURAN BOOTH</p>
            <h3 className="font-display text-xl font-semibold">{data?.booth.label || "Booth"}</h3>
            <p className="mt-1 text-sm text-fg/55">Pengaturan di sini <b>hanya berlaku untuk booth ini</b>. Bagian yang dikosongkan otomatis mengikuti pengaturan utama, jadi tidak ada yang perlu diisi kalau tidak berbeda.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" className="rounded-full border border-fg/15 px-3 py-1.5 text-sm">✕</button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {!data && !error && <p className="py-10 text-center text-fg/40">Memuat…</p>}
          {data && (
            <>
              <section>
                <h4 className="font-semibold">1. Nama booth</h4>
                <p className="text-xs text-fg/50">Nama yang kamu lihat di dashboard, misalnya lokasinya.</p>
                <input className={inputClass} value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder="mis. Booth Mall Jakarta" />
              </section>

              <section>
                <h4 className="font-semibold">2. Harga dan paket di booth ini</h4>
                <p className="text-xs text-fg/50">Isi kolom "Harga di booth ini" hanya kalau harganya berbeda dari harga utama. Matikan "Tampil" untuk menyembunyikan paket di booth ini saja.</p>
                {data.packages.length === 0 ? (
                  <p className="mt-3 rounded-xl bg-fg/[0.05] px-4 py-3 text-sm text-fg/60">Belum ada paket. Buat paket dulu di menu Paket.</p>
                ) : (
                  <div className="mt-3 overflow-x-auto rounded-2xl border border-fg/10">
                    <table className="w-full min-w-[520px] text-sm">
                      <thead className="bg-fg/[0.04] text-left text-xs text-fg/50">
                        <tr><th className="px-4 py-2 font-medium">Paket</th><th className="px-4 py-2 font-medium">Harga utama</th><th className="px-4 py-2 font-medium">Harga di booth ini</th><th className="px-4 py-2 text-center font-medium">Tampil</th></tr>
                      </thead>
                      <tbody className="divide-y divide-fg/8">
                        {data.packages.map((p) => (
                          <tr key={p.id} className={hidden[p.id] ? "opacity-50" : ""}>
                            <td className="px-4 py-2.5"><p className="font-medium">{p.name}</p><p className="text-xs text-fg/40">{p.photoCount} foto{!p.active ? " · nonaktif di pengaturan utama" : ""}</p></td>
                            <td className="px-4 py-2.5 text-fg/60">{rupiah(p.price)}</td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-fg/40">Rp</span>
                                <input inputMode="numeric" value={prices[p.id] ?? ""} onChange={(e) => setPrices({ ...prices, [p.id]: e.target.value.replace(/[^\d]/g, "") })} placeholder={String(p.price)} aria-label={`Harga ${p.name} di booth ini`} className="w-28 rounded-lg border border-fg/15 bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent" />
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <input type="checkbox" checked={!hidden[p.id]} onChange={(e) => setHidden({ ...hidden, [p.id]: !e.target.checked })} aria-label={`Tampilkan ${p.name} di booth ini`} className="h-4 w-4 accent-[var(--accent,#7c6cff)]" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="mt-2 text-xs text-fg/45">Harga dihitung ulang di server saat sesi dimulai, jadi harga booth ini pasti yang dibayar customer.</p>
              </section>

              <section>
                <h4 className="font-semibold">3. Tampilan khusus (opsional)</h4>
                <p className="text-xs text-fg/50">Beda warna atau teks hanya untuk booth ini. Kosongkan atau klik "Ikuti utama" untuk kembali ke pengaturan utama.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {COLORS.map((c) => (
                    <div key={c.key} className="rounded-xl border border-fg/10 p-3">
                      <p className="text-sm font-medium">{c.label}</p>
                      <p className="text-[11px] text-fg/40">{c.hint}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <input type="color" value={look[c.key] ?? "#7c6cff"} onChange={(e) => setLookValue(c.key, e.target.value)} className="h-9 w-12 cursor-pointer rounded-lg border border-fg/15 bg-transparent" aria-label={c.label} />
                        <span className="text-xs text-fg/55">{look[c.key] ? look[c.key] : "Ikuti pengaturan utama"}</span>
                        {look[c.key] && <button type="button" onClick={() => setLookValue(c.key, "")} className="ml-auto rounded-lg border border-fg/15 px-2.5 py-1 text-xs">Ikuti utama</button>}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {TEXTS.map((t) => (
                    <label key={t.key} className="text-sm text-fg/60">{t.label}
                      <input className={inputClass} value={look[t.key] ?? ""} maxLength={200} onChange={(e) => setLookValue(t.key, e.target.value)} placeholder={t.placeholder} />
                    </label>
                  ))}
                </div>
              </section>
            </>
          )}
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-fg/10 px-6 py-4">
          <button type="button" onClick={resetAll} disabled={!data || customCount === 0} className="rounded-xl border border-fg/15 px-4 py-2.5 text-sm text-fg/65 disabled:opacity-40">Kembalikan semua ke pengaturan utama</button>
          <span className="text-xs text-fg/45">{customCount > 0 ? `${customCount} pengaturan khusus` : "Booth ini mengikuti pengaturan utama"}</span>
          <button type="button" onClick={onClose} className="ml-auto rounded-xl border border-fg/15 px-5 py-2.5 text-sm">Batal</button>
          <button type="button" onClick={() => void save()} disabled={!data || busy} className="rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/20 disabled:opacity-50">{busy ? "Menyimpan…" : "Simpan"}</button>
        </div>
      </div>
    </div>
  );
}
