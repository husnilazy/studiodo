import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { getApiBaseUrl } from "@/lib/apiConfig";
import { useBoothConfig } from "@/lib/boothConfigStore";
import { inputClass, sectionClass } from "@/lib/adminUi";

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm text-fg/60">{label}</span>
      {children}
    </label>
  );
}

// Pindahan dari AdminPlaceholder.tsx (dulu tab "Paket & pembayaran") — dipisah
// dari branding kiosk karena ini soal harga/transaksi, bukan tampilan. Sekarang
// dirender di bawah Finance ("Database / CRM" tetap terpisah, itu soal kontak
// customer, bukan uang).
export default function PaymentSettings() {
  const { config, update } = useBoothConfig();
  const set = <K extends keyof typeof config>(key: K, value: (typeof config)[K]) => update({ [key]: value } as any);

  const [paymentSaved, setPaymentSaved] = useState(false);
  const [paymentConfig, setPaymentConfig] = useState({ secretKey: "", webhookToken: "" });
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [webhookCopied, setWebhookCopied] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState({ hasSecretKey: false, hasWebhookToken: false, demoMode: false, cashPaymentEnabled: false });
  const [cashPaymentSaved, setCashPaymentSaved] = useState(false);
  const [packages, setPackages] = useState<any[]>([]);
  const [packageDraft, setPackageDraft] = useState({ name: "", price: "50000", photoCount: 3, hasGif: false, hasVideo: false, hasStopMotion: false, thumbnailUrl: "", description: "" });
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  const [editingPackage, setEditingPackage] = useState<Record<string, any>>({});
  const [packageError, setPackageError] = useState<string | null>(null);
  const [packageNotice, setPackageNotice] = useState<string | null>(null);
  const [extraDrafts, setExtraDrafts] = useState<Record<string, { name: string; price: string }>>({});
  const [gifVideoEnabled, setGifVideoEnabled] = useState(true);
  const [planName, setPlanName] = useState<string | null>(null);

  useEffect(() => {
    api.getMe().then((me) => setTenantId(me?.tenantId ?? null)).catch(() => setTenantId(null));
  }, []);

  useEffect(() => {
    api.getPlanFeatures().then((result) => {
      if (!result) return;
      setGifVideoEnabled(result.gifVideoEnabled);
      setPlanName(result.planName);
    }).catch(() => undefined);
  }, []);

  const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  const readEventImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => set("eventImageUrl", String(reader.result));
    reader.readAsDataURL(file);
  };

  const refreshPackages = () => api.getPackagesAll().then((result) => setPackages(result ?? [])).catch((error) => console.error("Gagal memuat paket", error));
  useEffect(() => { refreshPackages(); }, []);
  useEffect(() => {
    api.getPaymentConfig().then((result) => { if (result) setPaymentStatus(result); }).catch((error) => console.error("Gagal memuat konfigurasi pembayaran", error));
  }, []);

  const savePaymentConfig = async () => {
    await api.updatePaymentConfig(paymentConfig);
    setPaymentConfig({ secretKey: "", webhookToken: "" });
    setPaymentSaved(true);
    setPaymentStatus((state) => ({
      ...state,
      hasSecretKey: Boolean(paymentConfig.secretKey.trim()) || state.hasSecretKey,
      hasWebhookToken: Boolean(paymentConfig.webhookToken.trim()) || state.hasWebhookToken,
    }));
  };

  const toggleCashPayment = async (enabled: boolean) => {
    const result = await api.updateCashPaymentConfig(enabled);
    setPaymentStatus((state) => ({ ...state, cashPaymentEnabled: result?.enabled ?? state.cashPaymentEnabled }));
    setCashPaymentSaved(true);
    window.setTimeout(() => setCashPaymentSaved(false), 1800);
  };

  const createPackage = async () => {
    if (!packageDraft.name.trim()) return;
    setPackageError(null);
    try {
      await api.createPackage({
        ...packageDraft,
        name: packageDraft.name.trim(),
        price: Number(packageDraft.price) || 0,
        photoCount: Math.max(1, Number(packageDraft.photoCount) || 1),
        sortOrder: packages.length + 1,
        extraPrints: [],
        thumbnailUrl: packageDraft.thumbnailUrl || null,
        description: packageDraft.description.trim() || null,
      });
      setPackageDraft({ name: "", price: "50000", photoCount: 3, hasGif: false, hasVideo: false, hasStopMotion: false, thumbnailUrl: "", description: "" });
      refreshPackages();
    } catch (err) {
      setPackageError(err instanceof Error ? err.message : "Gagal membuat paket");
    }
  };

  const togglePackageActive = async (pkg: any) => {
    setPackageError(null);
    try {
      await api.updatePackage(pkg.id, { active: !Boolean(pkg.active) });
      refreshPackages();
    } catch (err) {
      setPackageError(err instanceof Error ? err.message : "Gagal mengubah status paket");
    }
  };

  const beginPackageEdit = (pkg: any) => {
    setEditingPackageId(pkg.id);
    setEditingPackage({
      name: pkg.name ?? "",
      description: pkg.description ?? "",
      price: String(Number(pkg.price) || 0),
      photoCount: String(pkg.photoCount ?? 1),
      hasGif: Boolean(pkg.hasGif),
      hasVideo: Boolean(pkg.hasVideo),
      hasStopMotion: Boolean(pkg.hasStopMotion),
      thumbnailUrl: pkg.thumbnailUrl ?? "",
    });
  };

  const savePackageEdit = async () => {
    if (!editingPackageId) return;
    setPackageError(null);
    try {
      await api.updatePackage(editingPackageId, {
        name: String(editingPackage.name ?? "").trim() || undefined,
        description: String(editingPackage.description ?? "").trim() || null,
        price: Number(editingPackage.price) || 0,
        photoCount: Math.max(1, Math.min(10, Number(editingPackage.photoCount) || 1)),
        hasGif: Boolean(editingPackage.hasGif),
        hasVideo: Boolean(editingPackage.hasVideo),
        hasStopMotion: Boolean(editingPackage.hasStopMotion),
        thumbnailUrl: editingPackage.thumbnailUrl || null,
      });
      setEditingPackageId(null);
      refreshPackages();
    } catch (err) {
      setPackageError(err instanceof Error ? err.message : "Gagal menyimpan perubahan paket");
    }
  };

  const deleteExtra = async (pkg: any, extraId: string) => {
    const extraPrints = (pkg.extraPrints ?? []).filter((extra: { id: string }) => extra.id !== extraId);
    await api.updatePackage(pkg.id, { extraPrints });
    refreshPackages();
  };

  const addExtra = async (pkg: any) => {
    const draft = extraDrafts[pkg.id];
    if (!draft?.name.trim()) return;
    const extraPrints = [...(pkg.extraPrints ?? []), { id: crypto.randomUUID(), name: draft.name, price: Number(draft.price) || 0 }];
    await api.updatePackage(pkg.id, { extraPrints });
    setExtraDrafts((state) => ({ ...state, [pkg.id]: { name: "", price: "0" } }));
    refreshPackages();
  };

  return (
    <div className="flex flex-col items-stretch gap-5">
      <section className={sectionClass}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">PROMO CONTROL</p>
            <h2 className="font-display text-xl font-semibold">Event Gratis</h2>
            <p className="mt-1 text-sm text-[var(--kiosk-muted)]">Jadwalkan periode booth gratis (bazar, kantor, sekolah) — otomatis aktif/nonaktif sesuai jadwal.</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${config.eventEnabled ? "bg-emerald-400/15 text-emerald-200" : "bg-fg/10 text-fg/50"}`}>
            {config.eventEnabled ? "Aktif" : "Nonaktif"}
          </span>
        </div>
        <div className="mt-4 rounded-2xl border border-accent/20 bg-accent/[0.04] p-4">
          <div className="grid gap-4 md:grid-cols-[140px_minmax(0,1fr)]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-fg/50">Foto event</p>
              <div className="mt-2 flex h-24 w-full items-center justify-center overflow-hidden rounded-xl border border-fg/10 bg-fg/[0.07] md:h-28">
                {config.eventImageUrl ? <img src={config.eventImageUrl} alt="" className="h-full w-full object-cover" /> : <span className="text-2xl opacity-30">🎉</span>}
              </div>
              <input className="mt-2 text-xs" type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) readEventImage(file); }} />
              {config.eventImageUrl && <button type="button" onClick={() => set("eventImageUrl", null)} className="mt-1 text-xs text-red-300 hover:text-red-200">Hapus foto</button>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <label className="flex items-center gap-2 text-sm text-fg/70"><input type="checkbox" checked={config.eventEnabled} onChange={(e) => set("eventEnabled", e.target.checked)} /> Event aktif</label>
              <label className="flex items-center gap-2 text-sm text-fg/70"><input type="checkbox" checked={config.eventFreeEntry} onChange={(e) => set("eventFreeEntry", e.target.checked)} /> Kiosk gratis saat event aktif</label>
              <label className="flex items-center gap-2 text-sm text-fg/70"><input type="checkbox" checked={config.eventTimerEnabled} onChange={(e) => set("eventTimerEnabled", e.target.checked)} /> Timer event aktif</label>
              <Field label="Nama event"><input className={inputClass} value={config.eventName} onChange={(e) => set("eventName", e.target.value)} /></Field>
              <Field label="Timer sesi (menit)"><input className={inputClass} type="number" min={1} max={30} disabled={!config.eventTimerEnabled} value={config.eventSessionTimerMinutes} onChange={(e) => set("eventSessionTimerMinutes", Math.max(1, Math.min(30, Number(e.target.value) || 1)))} /></Field>
              <Field label="Maksimal shot (0 = ikut paket)"><input className={inputClass} type="number" min={0} max={50} value={config.eventMaxPhotosPerSession} onChange={(e) => set("eventMaxPhotosPerSession", Math.max(0, Math.min(50, Number(e.target.value) || 0)))} /></Field>
              <label className="flex items-center gap-2 text-sm text-fg/70"><input type="checkbox" checked={config.eventHasGif} onChange={(e) => set("eventHasGif", e.target.checked)} /> Rekam GIF</label>
              <label className="flex items-center gap-2 text-sm text-fg/70"><input type="checkbox" checked={config.eventHasVideo} onChange={(e) => set("eventHasVideo", e.target.checked)} /> Rekam video</label>
              <Field label="Mulai"><input className={inputClass} type="datetime-local" value={config.eventStartAt} onChange={(e) => set("eventStartAt", e.target.value)} /></Field>
              <Field label="Selesai"><input className={inputClass} type="datetime-local" value={config.eventEndAt} onChange={(e) => set("eventEndAt", e.target.value)} /></Field>
              <Field label="Deskripsi event" className="sm:col-span-2 xl:col-span-3"><input className={inputClass} value={config.eventDescription} onChange={(e) => set("eventDescription", e.target.value)} /></Field>
            </div>
          </div>
        </div>
      </section>

      <section className={sectionClass}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">PACKAGE CONTROL</p>
            <h2 className="font-display text-xl font-semibold">Paket Foto</h2>
            <p className="mt-1 text-sm text-[var(--kiosk-muted)]">Paket pertama (urutan teratas) tampil sebagai "Paling Populer" di kiosk.</p>
          </div>
          <span className="rounded-full border border-accent/30 px-3 py-1 text-xs text-accent">{packages.length} paket</span>
        </div>

        <div className="mt-5 rounded-2xl border border-accent/20 bg-accent/[0.04] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Buat paket baru</p>
          <div className="mt-3 grid gap-4 md:grid-cols-[96px_minmax(0,1fr)]">
            <div>
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl border border-fg/10 bg-fg/[0.07]">
                {packageDraft.thumbnailUrl ? <img src={packageDraft.thumbnailUrl} alt="" className="h-full w-full object-cover" /> : <span className="text-2xl opacity-30">📷</span>}
              </div>
              <input
                className="mt-2 w-24 text-[10px]"
                type="file"
                accept="image/*"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setPackageDraft((state) => ({ ...state, thumbnailUrl: "" }));
                  const dataUrl = await readFileAsDataUrl(file);
                  setPackageDraft((state) => ({ ...state, thumbnailUrl: dataUrl }));
                }}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Nama paket"><input className={inputClass} placeholder="mis. Premium Session" value={packageDraft.name} onChange={(e) => setPackageDraft({ ...packageDraft, name: e.target.value })} /></Field>
              <Field label="Harga"><input className={inputClass} type="number" placeholder="50000" value={packageDraft.price} onChange={(e) => setPackageDraft({ ...packageDraft, price: e.target.value })} /></Field>
              <Field label="Jumlah foto (maks 10)"><input className={inputClass} type="number" min={1} max={10} value={packageDraft.photoCount} onChange={(e) => setPackageDraft({ ...packageDraft, photoCount: Math.max(1, Math.min(10, Number(e.target.value))) })} /></Field>
              <Field label="Deskripsi singkat" className="sm:col-span-2 lg:col-span-3"><input className={inputClass} placeholder="mis. Termasuk 1 GIF + cetak 4R" value={packageDraft.description} onChange={(e) => setPackageDraft({ ...packageDraft, description: e.target.value })} /></Field>
              <label className={`flex items-center gap-2 text-xs ${gifVideoEnabled ? "text-fg/60" : "text-fg/25"}`} title={gifVideoEnabled ? undefined : `Tidak termasuk paket${planName ? ` "${planName}"` : ""} kamu saat ini`}>
                <input type="checkbox" disabled={!gifVideoEnabled} checked={packageDraft.hasGif} onChange={(e) => setPackageDraft({ ...packageDraft, hasGif: e.target.checked })} /> Termasuk GIF{!gifVideoEnabled && " 🔒"}
              </label>
              <label className={`flex items-center gap-2 text-xs ${gifVideoEnabled ? "text-fg/60" : "text-fg/25"}`} title={gifVideoEnabled ? undefined : `Tidak termasuk paket${planName ? ` "${planName}"` : ""} kamu saat ini`}>
                <input type="checkbox" disabled={!gifVideoEnabled} checked={packageDraft.hasVideo} onChange={(e) => setPackageDraft({ ...packageDraft, hasVideo: e.target.checked })} /> Termasuk video{!gifVideoEnabled && " 🔒"}
              </label>
              <label className={`flex items-center gap-2 text-xs ${gifVideoEnabled ? "text-fg/60" : "text-fg/25"}`} title="Video lambat dari semua hasil jepretan, pakai frame khusus dari Kelola Frame">
                <input type="checkbox" disabled={!gifVideoEnabled} checked={packageDraft.hasStopMotion} onChange={(e) => setPackageDraft({ ...packageDraft, hasStopMotion: e.target.checked })} /> Termasuk video stop motion{!gifVideoEnabled && " 🔒"}
              </label>
            </div>
          </div>
          <button onClick={createPackage} disabled={!packageDraft.name.trim()} className="mt-4 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">+ Tambah paket</button>
        </div>
        {packageError && <p className="mt-3 text-sm text-red-300">{packageError}</p>}
        {packageNotice && <p className="mt-3 text-sm text-amber-300">{packageNotice}</p>}

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {packages.map((pkg) => (
            <div key={pkg.id} className={`rounded-2xl border p-4 ${pkg.active === false ? "border-fg/10 bg-fg/5 opacity-60" : "border-fg/10 bg-fg/5"}`}>
              {editingPackageId === pkg.id ? (
                <div className="grid gap-3">
                  <div className="grid gap-3 sm:grid-cols-[80px_minmax(0,1fr)]">
                    <div>
                      <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-fg/10 bg-fg/[0.07]">
                        {editingPackage.thumbnailUrl ? <img src={editingPackage.thumbnailUrl} alt="" className="h-full w-full object-cover" /> : <span className="text-xl opacity-30">📷</span>}
                      </div>
                      <input
                        className="mt-2 w-20 text-[10px]"
                        type="file"
                        accept="image/*"
                        onChange={async (event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          const dataUrl = await readFileAsDataUrl(file);
                          setEditingPackage((state) => ({ ...state, thumbnailUrl: dataUrl }));
                        }}
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Nama"><input className={inputClass} value={editingPackage.name ?? ""} onChange={(e) => setEditingPackage({ ...editingPackage, name: e.target.value })} /></Field>
                      <Field label="Harga"><input className={inputClass} type="number" value={editingPackage.price ?? "0"} onChange={(e) => setEditingPackage({ ...editingPackage, price: e.target.value })} /></Field>
                      <Field label="Jumlah foto"><input className={inputClass} type="number" min={1} max={10} value={editingPackage.photoCount ?? "1"} onChange={(e) => setEditingPackage({ ...editingPackage, photoCount: e.target.value })} /></Field>
                      <Field label="Deskripsi"><input className={inputClass} value={editingPackage.description ?? ""} onChange={(e) => setEditingPackage({ ...editingPackage, description: e.target.value })} /></Field>
                      <label className={`flex items-center gap-2 text-xs ${gifVideoEnabled ? "text-fg/60" : "text-fg/25"}`} title={gifVideoEnabled ? undefined : `Tidak termasuk paket${planName ? ` "${planName}"` : ""} kamu saat ini`}>
                        <input type="checkbox" disabled={!gifVideoEnabled} checked={Boolean(editingPackage.hasGif)} onChange={(e) => setEditingPackage({ ...editingPackage, hasGif: e.target.checked })} /> Termasuk GIF{!gifVideoEnabled && " 🔒"}
                      </label>
                      <label className={`flex items-center gap-2 text-xs ${gifVideoEnabled ? "text-fg/60" : "text-fg/25"}`} title={gifVideoEnabled ? undefined : `Tidak termasuk paket${planName ? ` "${planName}"` : ""} kamu saat ini`}>
                        <input type="checkbox" disabled={!gifVideoEnabled} checked={Boolean(editingPackage.hasVideo)} onChange={(e) => setEditingPackage({ ...editingPackage, hasVideo: e.target.checked })} /> Termasuk video{!gifVideoEnabled && " 🔒"}
                      </label>
                      <label className={`flex items-center gap-2 text-xs ${gifVideoEnabled ? "text-fg/60" : "text-fg/25"}`} title="Video lambat dari semua hasil jepretan, pakai frame khusus dari Kelola Frame">
                        <input type="checkbox" disabled={!gifVideoEnabled} checked={Boolean(editingPackage.hasStopMotion)} onChange={(e) => setEditingPackage({ ...editingPackage, hasStopMotion: e.target.checked })} /> Termasuk video stop motion{!gifVideoEnabled && " 🔒"}
                      </label>
                    </div>
                  </div>
                  <div className="flex gap-2"><button onClick={savePackageEdit} className="rounded-xl bg-accent px-4 py-2 text-xs font-semibold">Simpan perubahan</button><button onClick={() => setEditingPackageId(null)} className="rounded-xl border border-fg/15 px-4 py-2 text-xs">Batal</button></div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-fg/10 bg-fg/[0.07]">
                    {pkg.thumbnailUrl ? <img src={pkg.thumbnailUrl} alt="" className="h-full w-full object-cover" /> : <span className="text-xl opacity-30">📷</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{pkg.name}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${pkg.active === false ? "bg-fg/10 text-fg/50" : "bg-emerald-400/15 text-emerald-200"}`}>{pkg.active === false ? "Nonaktif" : "Aktif"}</span>
                    </div>
                    {pkg.description && <p className="mt-0.5 truncate text-xs text-fg/45">{pkg.description}</p>}
                    <p className="mt-1 text-xs text-fg/50">Rp {Number(pkg.price).toLocaleString("id-ID")} · {pkg.photoCount} foto {pkg.hasGif ? "· GIF" : ""} {pkg.hasVideo ? "· Video" : ""} {pkg.hasStopMotion ? "· Stop motion" : ""}</p>
                  </div>
                </div>
              )}

              {editingPackageId !== pkg.id && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-fg/10 pt-3">
                  <button onClick={() => beginPackageEdit(pkg)} className="rounded-full border border-fg/15 px-3 py-1 text-xs">Edit</button>
                  <button onClick={() => togglePackageActive(pkg)} className="rounded-full border border-fg/15 px-3 py-1 text-xs">{pkg.active === false ? "Aktifkan" : "Nonaktifkan"}</button>
                  <button
                    onClick={async () => {
                      if (!window.confirm(`Hapus paket ${pkg.name}?`)) return;
                      setPackageError(null);
                      setPackageNotice(null);
                      try {
                        const result = await api.deletePackage(pkg.id);
                        // The server won't hard-delete a package that a past
                        // session already used (it would orphan that session's
                        // history) — it deactivates it instead. Say so explicitly,
                        // otherwise "Hapus" just silently turns the card gray
                        // and looks like the button did nothing.
                        if (result?.softDeleted) {
                          setPackageNotice(`"${pkg.name}" masih dipakai di riwayat sesi lama, jadi tidak bisa dihapus permanen — dinonaktifkan saja (tidak akan muncul di kiosk).`);
                        }
                        refreshPackages();
                      } catch (err) {
                        setPackageError(err instanceof Error ? err.message : "Gagal menghapus paket");
                      }
                    }}
                    className="text-xs text-red-300 hover:text-red-200"
                  >
                    Hapus
                  </button>
                </div>
              )}

              {editingPackageId !== pkg.id && (
                <div className="mt-3 border-t border-fg/10 pt-3">
                  <div className="flex flex-wrap gap-2">
                    {(pkg.extraPrints ?? []).map((extra: { id: string; name: string; price: number }) => (
                      <span key={extra.id} className="inline-flex items-center gap-2 rounded-full border border-accent/30 px-3 py-1 text-xs">
                        {extra.name} +Rp {Number(extra.price).toLocaleString("id-ID")}
                        <button type="button" onClick={() => deleteExtra(pkg, extra.id)} className="text-[10px] text-red-300 hover:text-red-200">×</button>
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input className={inputClass} placeholder="Nama extra cetak" value={extraDrafts[pkg.id]?.name ?? ""} onChange={(e) => setExtraDrafts((state) => ({ ...state, [pkg.id]: { name: e.target.value, price: state[pkg.id]?.price ?? "0" } }))} />
                    <input className={`${inputClass} max-w-32`} type="number" placeholder="Biaya" value={extraDrafts[pkg.id]?.price ?? "0"} onChange={(e) => setExtraDrafts((state) => ({ ...state, [pkg.id]: { name: state[pkg.id]?.name ?? "", price: e.target.value } }))} />
                    <button onClick={() => addExtra(pkg)} className="border border-fg/20 px-3 text-sm">Tambah extra</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {packages.length === 0 && <p className="text-sm text-fg/40">Belum ada paket. Tambahkan paket pertama di atas.</p>}
        </div>
      </section>

      <section className={sectionClass}>
        <h2 className="font-display text-xl font-semibold">Pembayaran QRIS Xendit</h2>
        <p className="mt-1 text-sm text-[var(--kiosk-muted)]">
          Kredensial disimpan di server dan tidak pernah dikirim kembali ke kiosk.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label={`Xendit Secret Key${paymentStatus.hasSecretKey ? " (sudah tersimpan, isi untuk mengganti)" : ""}`}>
            <input className={inputClass} type="password" value={paymentConfig.secretKey} onChange={(e) => setPaymentConfig({ ...paymentConfig, secretKey: e.target.value })} placeholder="xnd_production_..." autoComplete="new-password" />
          </Field>
          <Field label={`Xendit Webhook Token${paymentStatus.hasWebhookToken ? " (sudah tersimpan, isi untuk mengganti)" : ""}`}>
            <input className={inputClass} type="password" value={paymentConfig.webhookToken} onChange={(e) => setPaymentConfig({ ...paymentConfig, webhookToken: e.target.value })} placeholder="Webhook token" autoComplete="new-password" />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button onClick={savePaymentConfig} className="bg-accent px-4 py-2 text-sm font-semibold">
            {paymentSaved ? "Tersimpan" : "Simpan API Xendit"}
          </button>
          <span className="text-xs text-fg/50">
            {paymentStatus.demoMode ? "Mode demo aktif dari PAYMENT_DEMO_MODE." : paymentStatus.hasSecretKey ? "Mode Xendit aktif." : "Belum ada Secret Key; pembayaran belum siap."}
          </span>
        </div>
        {tenantId && (
          <div className="mt-5 rounded-2xl border border-amber-400/25 bg-amber-500/[0.06] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-300">Setup webhook wajib di Xendit</p>
            <p className="mt-2 text-sm text-fg/60">
              Secret Key di atas saja tidak cukup — Xendit tidak akan pernah tahu sesi ini sudah lunas kalau webhook belum didaftarkan.
              Buka <span className="text-fg/80">Xendit Dashboard → Settings → Webhooks</span>, tempel URL di bawah untuk event <span className="text-fg/80">qr.payment</span>,
              lalu salin "Verification Token" yang Xendit tampilkan di sana ke kolom "Xendit Webhook Token" di atas.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-xs text-white/80">
                {(() => { const base = getApiBaseUrl(); const abs = base.startsWith("http") ? base : `${window.location.origin}${base}`; return `${abs}/payment/webhook/xendit/${tenantId}`; })()}
              </code>
              <button
                type="button"
                onClick={() => {
                  const base = getApiBaseUrl();
                  const abs = base.startsWith("http") ? base : `${window.location.origin}${base}`;
                  navigator.clipboard?.writeText(`${abs}/payment/webhook/xendit/${tenantId}`);
                  setWebhookCopied(true);
                  window.setTimeout(() => setWebhookCopied(false), 1800);
                }}
                className="shrink-0 rounded-lg border border-fg/15 px-3 py-2 text-xs text-fg/70 hover:border-accent hover:text-fg"
              >
                {webhookCopied ? "Tersalin!" : "Salin"}
              </button>
            </div>
            <p className="mt-2 text-xs text-fg/35">Tanpa langkah ini, pembayaran QRIS asli tidak akan pernah otomatis lanjut ke step berikutnya di kiosk — kiosk akan menunggu selamanya.</p>
          </div>
        )}
        <div className="mt-6 border-t border-fg/10 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="font-display text-lg font-semibold">Pembayaran Cash</h3><p className="mt-1 text-xs text-fg/45">Aktifkan untuk membuka form invoice cash di Finance → Promosi.</p></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={paymentStatus.cashPaymentEnabled} onChange={(event) => toggleCashPayment(event.target.checked)} /> Aktifkan cash {cashPaymentSaved && <span className="text-emerald-300">Tersimpan</span>}</label>
          </div>
        </div>
      </section>
    </div>
  );
}
