import { useEffect, useState } from "react";
import { useBoothConfig, type BoothConfig } from "@/lib/boothConfigStore";
import { OUTPUT_PRESETS, useTemplateLibrary, type LocalTemplate, type OutputPreset, type TemplateCategory } from "@/lib/templateStore";
import type { Orientation } from "@/lib/sessionStore";
import TemplateEditor from "@/components/TemplateEditor";
import { useStickerLibrary } from "@/lib/stickerStore";
import { api } from "@/lib/api";
import { Link } from "wouter";

const inputClass =
  "mt-1 w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm outline-none focus:border-accent";
const sectionClass = "rounded-2xl border border-white/10 bg-ink-900/70 p-5";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm text-white/60">{label}</span>
      {children}
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="mt-1 flex gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-14 rounded-lg bg-transparent" />
        <input className={inputClass.replace("mt-1 ", "")} value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </Field>
  );
}

export default function AdminPlaceholder() {
  const { config, update, reset } = useBoothConfig();
  const { templates, addTemplate, updateTemplate, removeTemplate } = useTemplateLibrary();
  const { stickers, addSticker, removeSticker } = useStickerLibrary();
  const [saved, setSaved] = useState(false);
  const [paymentSaved, setPaymentSaved] = useState(false);
  const [paymentConfig, setPaymentConfig] = useState({ secretKey: "", webhookToken: "" });
  const [paymentStatus, setPaymentStatus] = useState({ hasSecretKey: false, hasWebhookToken: false, demoMode: false });
  const [templateDraft, setTemplateDraft] = useState<LocalTemplate | null>(null);
  const [packages, setPackages] = useState<any[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [voucherDraft, setVoucherDraft] = useState({ code: "", discountType: "percent", discountValue: "10", maxUses: "", startsAt: "", expiresAt: "" });
  const [editingVoucherId, setEditingVoucherId] = useState<string | null>(null);
  const [editingVoucher, setEditingVoucher] = useState<Record<string, string>>({});
  const [packageDraft, setPackageDraft] = useState({ name: "", price: "50000", photoCount: 3, hasGif: false, hasVideo: false });
  const [extraDrafts, setExtraDrafts] = useState<Record<string, { name: string; price: string }>>({});
  const set = <K extends keyof BoothConfig>(key: K, value: BoothConfig[K]) => {
    update({ [key]: value } as Partial<BoothConfig>);
    setSaved(false);
  };
  const readMedia = (file: File, key: "idleCoverUrl" | "idleBannerUrl") => {
    const reader = new FileReader();
    reader.onload = () => set(key, String(reader.result));
    reader.readAsDataURL(file);
  };

  const refreshPackages = () => api.getPackagesAll().then(setPackages).catch((error) => console.error("Gagal memuat paket", error));
  useEffect(() => { refreshPackages(); }, []);
  const refreshVouchers = () => api.getVouchers().then(setVouchers).catch((error) => console.error("Gagal memuat voucher", error));
  useEffect(() => { refreshVouchers(); }, []);
  useEffect(() => {
    api.getPaymentConfig().then(setPaymentStatus).catch((error) => console.error("Gagal memuat konfigurasi pembayaran", error));
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

  const createPackage = async () => {
    if (!packageDraft.name.trim()) return;
    await api.createPackage({ ...packageDraft, price: packageDraft.price, sortOrder: packages.length + 1, extraPrints: [] });
    setPackageDraft({ name: "", price: "50000", photoCount: 3, hasGif: false, hasVideo: false });
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

  const createVoucher = async () => {
    if (!voucherDraft.code.trim()) return;
    await api.createVoucher({
      ...voucherDraft,
      maxUses: voucherDraft.maxUses || null,
      active: true,
    });
    setVoucherDraft({ code: "", discountType: "percent", discountValue: "10", maxUses: "", startsAt: "", expiresAt: "" });
    refreshVouchers();
  };

  const beginVoucherEdit = (voucher: any) => {
    setEditingVoucherId(voucher.id);
    setEditingVoucher({
      code: voucher.code,
      discountType: voucher.discountType,
      discountValue: String(voucher.discountValue),
      maxUses: voucher.maxUses == null ? "" : String(voucher.maxUses),
      startsAt: voucher.startsAt ? String(voucher.startsAt).slice(0, 16) : "",
      expiresAt: voucher.expiresAt ? String(voucher.expiresAt).slice(0, 16) : "",
    });
  };

  const saveVoucherEdit = async () => {
    if (!editingVoucherId) return;
    await api.updateVoucher(editingVoucherId, { ...editingVoucher, maxUses: editingVoucher.maxUses || null });
    setEditingVoucherId(null);
    refreshVouchers();
  };

  const addPngTemplate = (file: File) => {
    if (!file.type.includes("png")) return;
    const reader = new FileReader();
    reader.onload = () => setTemplateDraft({
      id: crypto.randomUUID(),
      name: file.name.replace(/\.png$/i, ""),
      category: "custom",
      style: "Custom",
      orientation: "portrait",
      outputPreset: "4r",
      frameDataUrl: String(reader.result),
      canvasWidth: OUTPUT_PRESETS["4r"].width,
      canvasHeight: OUTPUT_PRESETS["4r"].height,
      slots: [
        { x: 0.1, y: 0.08, w: 0.4, h: 0.4 * OUTPUT_PRESETS["4r"].width / OUTPUT_PRESETS["4r"].height / (4 / 3) },
        { x: 0.5, y: 0.08, w: 0.4, h: 0.4 * OUTPUT_PRESETS["4r"].width / OUTPUT_PRESETS["4r"].height / (4 / 3) },
        { x: 0.1, y: 0.5, w: 0.4, h: 0.4 * OUTPUT_PRESETS["4r"].width / OUTPUT_PRESETS["4r"].height / (4 / 3) },
      ],
    });
    reader.readAsDataURL(file);
  };

  const saveTemplate = async () => {
    if (!templateDraft) return;
    addTemplate(templateDraft);
    try {
      await api.createFrame(templateDraft);
    } catch (error) {
      console.error("Gagal menyimpan frame ke server", error);
    }
    setTemplateDraft(null);
  };

  const uploadSticker = (file: File) => {
    if (!file.type.includes("png")) return;
    const reader = new FileReader();
    reader.onload = () => addSticker({
      id: crypto.randomUUID(),
      name: file.name.replace(/\.png$/i, ""),
      category: "custom",
      dataUrl: String(reader.result),
    });
    reader.readAsDataURL(file);
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-8 text-[var(--kiosk-text)] md:px-10">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-accent">STUDIODO Control Center</p>
            <h1 className="mt-2 font-display text-4xl font-bold">Kustomisasi Kiosk</h1>
            <p className="mt-2 max-w-2xl text-[var(--kiosk-muted)]">
              Semua perubahan tersimpan lokal di booth ini dan langsung terlihat di layar kiosk.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/customers" className="border border-white/15 px-4 py-2 text-sm text-white/70 hover:text-white">
              Customer
            </Link>
            <button onClick={reset} className="border border-white/15 px-4 py-2 text-sm text-white/60 hover:text-white">
              Reset default
            </button>
            <button onClick={() => setSaved(true)} className="bg-accent px-5 py-2 text-sm font-semibold">
              {saved ? "Tersimpan" : "Simpan tampilan"}
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <section className={`${sectionClass} lg:col-span-2`}>
            <h2 className="font-display text-xl font-semibold">Paket & Extra Cetak</h2>
            <div className="mt-4 grid gap-2 md:grid-cols-[1fr_140px_100px_auto_auto_auto]">
              <input className={inputClass} placeholder="Nama paket" value={packageDraft.name} onChange={(e) => setPackageDraft({ ...packageDraft, name: e.target.value })} />
              <input className={inputClass} type="number" placeholder="Harga" value={packageDraft.price} onChange={(e) => setPackageDraft({ ...packageDraft, price: e.target.value })} />
              <input className={inputClass} type="number" min={1} max={10} placeholder="Foto (maks 10)" value={packageDraft.photoCount} onChange={(e) => setPackageDraft({ ...packageDraft, photoCount: Math.max(1, Math.min(10, Number(e.target.value))) })} />
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={packageDraft.hasGif} onChange={(e) => setPackageDraft({ ...packageDraft, hasGif: e.target.checked })} /> GIF</label>
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={packageDraft.hasVideo} onChange={(e) => setPackageDraft({ ...packageDraft, hasVideo: e.target.checked })} /> Video</label>
              <button onClick={createPackage} className="bg-accent px-4 py-2 text-sm font-semibold">Tambah</button>
            </div>
            <div className="mt-5 space-y-3">
              {packages.map((pkg) => (
                <div key={pkg.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><p className="font-semibold">{pkg.name}</p><p className="text-xs text-white/50">Rp {Number(pkg.price).toLocaleString("id-ID")} · {pkg.photoCount} foto {pkg.hasGif ? "· GIF" : ""} {pkg.hasVideo ? "· Video" : ""}</p></div>
                    <button onClick={async () => { await api.deletePackage(pkg.id); refreshPackages(); }} className="text-xs text-red-300">Hapus paket</button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(pkg.extraPrints ?? []).map((extra: { id: string; name: string; price: number }) => <span key={extra.id} className="rounded-full border border-accent/30 px-3 py-1 text-xs">{extra.name} +Rp {Number(extra.price).toLocaleString("id-ID")}</span>)}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <label className="flex items-center gap-2 text-xs text-white/60">Jumlah foto
                      <input className={`${inputClass} mt-0 w-20`} type="number" min={1} max={10} value={pkg.photoCount} onChange={async (event) => { const photoCount = Math.max(1, Math.min(10, Number(event.target.value))); await api.updatePackage(pkg.id, { photoCount }); refreshPackages(); }} />
                    </label>
                    <input className={inputClass} placeholder="Nama extra cetak" value={extraDrafts[pkg.id]?.name ?? ""} onChange={(e) => setExtraDrafts((state) => ({ ...state, [pkg.id]: { name: e.target.value, price: state[pkg.id]?.price ?? "0" } }))} />
                    <input className={`${inputClass} max-w-32`} type="number" placeholder="Biaya" value={extraDrafts[pkg.id]?.price ?? "0"} onChange={(e) => setExtraDrafts((state) => ({ ...state, [pkg.id]: { name: state[pkg.id]?.name ?? "", price: e.target.value } }))} />
                    <button onClick={() => addExtra(pkg)} className="border border-white/20 px-3 text-sm">Tambah extra</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className={`${sectionClass} lg:col-span-2`}>
            <h2 className="font-display text-xl font-semibold">Idle Screen & Pop-up Banner</h2>
            <p className="mt-1 text-sm text-[var(--kiosk-muted)]">Atur tampilan default branding, cover foto/video, dan banner promo saat kiosk menunggu.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Cover idle (gambar / video)">
                <input className={inputClass} type="file" accept="image/*,video/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) { set("idleCoverType", file.type.startsWith("video/") ? "video" : "image"); readMedia(file, "idleCoverUrl"); } }} />
                <div className="mt-2 flex gap-2">
                  <button onClick={() => set("idleCoverUrl", null)} className="text-xs text-red-300">Hapus cover</button>
                  <span className="text-xs text-white/40">{config.idleCoverUrl ? `Cover ${config.idleCoverType} aktif` : "Cover default gradient"}</span>
                </div>
              </Field>
              <Field label="Pop-up / banner promo">
                <input className={inputClass} type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) readMedia(file, "idleBannerUrl"); }} />
                <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={config.idleBannerEnabled} onChange={(event) => set("idleBannerEnabled", event.target.checked)} /> Tampilkan banner</label>
              </Field>
            </div>
          </section>
          <section className={`${sectionClass} lg:col-span-2`}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="eyebrow">PROMO CONTROL</p>
                <h2 className="font-display text-xl font-semibold">Voucher & Diskon</h2>
                <p className="mt-1 text-sm text-[var(--kiosk-muted)]">Kelola kode, nilai diskon, kuota, periode aktif, dan penggunaan.</p>
              </div>
              <span className="rounded-full border border-accent/30 px-3 py-1 text-xs text-accent">{vouchers.length} voucher</span>
            </div>
            <div className="mt-5 rounded-2xl border border-accent/20 bg-accent/[0.04] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Buat voucher baru</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Kode voucher"><input className={inputClass} placeholder="HEMAT50" value={voucherDraft.code} onChange={(e) => setVoucherDraft({ ...voucherDraft, code: e.target.value.toUpperCase() })} /></Field>
                <Field label="Jenis diskon"><select className={inputClass} value={voucherDraft.discountType} onChange={(e) => setVoucherDraft({ ...voucherDraft, discountType: e.target.value })}><option value="percent">Persen (%)</option><option value="fixed">Potongan Rp</option><option value="free">Gratis</option></select></Field>
                <Field label="Nilai diskon"><input className={inputClass} type="number" min={0} placeholder="10" value={voucherDraft.discountValue} onChange={(e) => setVoucherDraft({ ...voucherDraft, discountValue: e.target.value })} /></Field>
                <Field label="Kuota penggunaan"><input className={inputClass} type="number" min={1} placeholder="Tanpa batas" value={voucherDraft.maxUses} onChange={(e) => setVoucherDraft({ ...voucherDraft, maxUses: e.target.value })} /></Field>
                <Field label="Mulai aktif"><input className={inputClass} type="datetime-local" value={voucherDraft.startsAt} onChange={(e) => setVoucherDraft({ ...voucherDraft, startsAt: e.target.value })} /></Field>
                <Field label="Berakhir"><input className={inputClass} type="datetime-local" value={voucherDraft.expiresAt} onChange={(e) => setVoucherDraft({ ...voucherDraft, expiresAt: e.target.value })} /></Field>
              </div>
              <button onClick={createVoucher} disabled={!voucherDraft.code.trim()} className="mt-4 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">+ Tambah voucher</button>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {vouchers.map((voucher) => (
                <div key={voucher.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  {editingVoucherId === voucher.id ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Kode"><input className={inputClass} value={editingVoucher.code ?? ""} onChange={(e) => setEditingVoucher({ ...editingVoucher, code: e.target.value.toUpperCase() })} /></Field>
                      <Field label="Jenis"><select className={inputClass} value={editingVoucher.discountType ?? "percent"} onChange={(e) => setEditingVoucher({ ...editingVoucher, discountType: e.target.value })}><option value="percent">Persen</option><option value="fixed">Nominal</option><option value="free">Gratis</option></select></Field>
                      <Field label="Nilai"><input className={inputClass} type="number" value={editingVoucher.discountValue ?? "0"} onChange={(e) => setEditingVoucher({ ...editingVoucher, discountValue: e.target.value })} /></Field>
                      <Field label="Kuota"><input className={inputClass} type="number" placeholder="Tanpa batas" value={editingVoucher.maxUses ?? ""} onChange={(e) => setEditingVoucher({ ...editingVoucher, maxUses: e.target.value })} /></Field>
                      <Field label="Mulai aktif"><input className={inputClass} type="datetime-local" value={editingVoucher.startsAt ?? ""} onChange={(e) => setEditingVoucher({ ...editingVoucher, startsAt: e.target.value })} /></Field>
                      <Field label="Berakhir"><input className={inputClass} type="datetime-local" value={editingVoucher.expiresAt ?? ""} onChange={(e) => setEditingVoucher({ ...editingVoucher, expiresAt: e.target.value })} /></Field>
                      <div className="flex gap-2 sm:col-span-2"><button onClick={saveVoucherEdit} className="rounded-xl bg-accent px-4 py-2 text-xs font-semibold">Simpan perubahan</button><button onClick={() => setEditingVoucherId(null)} className="rounded-xl border border-white/15 px-4 py-2 text-xs">Batal</button></div>
                    </div>
                  ) : <div className="flex items-start justify-between gap-3">
                    <div><p className="font-semibold tracking-[0.16em] text-accent">{voucher.code}</p><p className="mt-1 text-lg font-semibold">{voucher.discountType === "percent" ? `${voucher.discountValue}%` : voucher.discountType === "free" ? "Gratis" : `Rp ${Number(voucher.discountValue).toLocaleString("id-ID")}`}</p><p className="mt-1 text-xs text-white/45">Dipakai {voucher.usedCount}{voucher.maxUses === null ? " · Tanpa batas" : ` dari ${voucher.maxUses}`} · {voucher.startsAt ? new Date(voucher.startsAt).toLocaleDateString("id-ID") : "Mulai sekarang"}</p></div>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${voucher.active ? "bg-emerald-400/15 text-emerald-200" : "bg-white/10 text-white/50"}`}>{voucher.active ? "Aktif" : "Nonaktif"}</span>
                  </div>}
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                    <button onClick={() => beginVoucherEdit(voucher)} className="rounded-full border border-white/15 px-3 py-1 text-xs">Edit</button>
                    <button onClick={async () => { await api.updateVoucher(voucher.id, { active: !voucher.active }); refreshVouchers(); }} className="rounded-full border border-white/15 px-3 py-1 text-xs">{voucher.active ? "Nonaktifkan" : "Aktifkan"}</button>
                    <button onClick={async () => { await api.deleteVoucher(voucher.id); refreshVouchers(); }} className="text-xs text-red-300">Hapus</button>
                  </div>
                </div>
              ))}
              {vouchers.length === 0 && <p className="text-sm text-white/40">Belum ada voucher. Buat promo pertama untuk customer.</p>}
            </div>
          </section>
          <section className={`${sectionClass} lg:col-span-2`}>
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
              <span className="text-xs text-white/50">
                {paymentStatus.demoMode ? "Mode demo aktif dari PAYMENT_DEMO_MODE." : paymentStatus.hasSecretKey ? "Mode Xendit aktif." : "Belum ada Secret Key; pembayaran belum siap."}
              </span>
            </div>
          </section>
          <section className={sectionClass}>
            <h2 className="font-display text-xl font-semibold">Branding</h2>
            <div className="mt-4 space-y-4">
              <Field label="Nama brand">
                <input className={inputClass} value={config.brandName} onChange={(e) => set("brandName", e.target.value)} />
              </Field>
              <Field label="Tagline">
                <input className={inputClass} value={config.tagline} onChange={(e) => set("tagline", e.target.value)} />
              </Field>
              <Field label="Teks promo idle">
                <input className={inputClass} value={config.promoText} onChange={(e) => set("promoText", e.target.value)} />
              </Field>
              <Field label="Logo PNG">
                <input className={inputClass} type="file" accept="image/png" onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => set("logoUrl", String(reader.result));
                  reader.readAsDataURL(file);
                }} />
                {config.logoUrl && <img src={config.logoUrl} className="mt-3 h-16 w-auto rounded-lg bg-white/10 p-2 object-contain" />}
              </Field>
            </div>
          </section>
          <section className={sectionClass}>
            <h2 className="font-display text-xl font-semibold">Output & Capture</h2>
            <div className="mt-4 space-y-4">
              <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={config.outputPresetEnabled} onChange={(event) => set("outputPresetEnabled", event.target.checked)} /><span>Aktifkan pilihan ukuran output (4R, 2R, A4)</span></label>
              <Field label="Maksimal foto dalam satu sesi">
                <input type="number" min={1} max={50} className={inputClass} value={config.maxPhotosPerSession} onChange={(event) => set("maxPhotosPerSession", Math.max(1, Math.min(50, Number(event.target.value))))} />
              </Field>
              <p className="text-xs text-white/45">Jumlah foto paket tetap menjadi default; nilai ini menjadi batas maksimal agar sesi tidak melebihi kuota capture admin.</p>
            </div>
          </section>

          <section className={`${sectionClass} lg:col-span-2`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold">Frame PNG & Template</h2>
                <p className="mt-1 text-sm text-[var(--kiosk-muted)]">Upload frame transparan, kategorikan, dan tentukan ukuran output.</p>
              </div>
              <label className="cursor-pointer bg-accent px-4 py-2 text-sm font-semibold">
                Upload PNG
                <input type="file" accept="image/png" className="hidden" onChange={(event) => event.target.files?.[0] && addPngTemplate(event.target.files[0])} />
              </label>
            </div>
            {templateDraft && (
              <div className="mt-5 grid gap-4 rounded-xl border border-accent/40 bg-black/20 p-4 md:grid-cols-[160px_1fr]">
                <div className="md:col-span-2">
                  <TemplateEditor template={templateDraft} onChange={(patch) => setTemplateDraft({ ...templateDraft, ...patch })} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2 md:col-span-2">
                  <Field label="Nama template"><input className={inputClass} value={templateDraft.name} onChange={(e) => setTemplateDraft({ ...templateDraft, name: e.target.value })} /></Field>
                  <Field label="Kategori">
                    <select className={inputClass} value={templateDraft.category} onChange={(e) => setTemplateDraft({ ...templateDraft, category: e.target.value as TemplateCategory })}>
                      {["custom", "minimal", "wedding", "birthday", "corporate", "seasonal"].map((value) => <option key={value}>{value}</option>)}
                    </select>
                  </Field>
                  <Field label="Style / tema"><input className={inputClass} value={templateDraft.style} onChange={(e) => setTemplateDraft({ ...templateDraft, style: e.target.value })} placeholder="Contoh: Neon Glow" /></Field>
                  <Field label="Orientasi">
                    <select className={inputClass} value={templateDraft.orientation} onChange={(e) => setTemplateDraft({ ...templateDraft, orientation: e.target.value as Orientation })}>
                      <option value="portrait">Portrait</option><option value="landscape">Landscape</option>
                    </select>
                  </Field>
                  <Field label="Ukuran output">
                    <select className={inputClass} value={templateDraft.outputPreset} onChange={(e) => {
                      const outputPreset = e.target.value as OutputPreset;
                      const preset = outputPreset === "custom" ? { width: 1200, height: 1800 } : OUTPUT_PRESETS[outputPreset];
                      setTemplateDraft({ ...templateDraft, outputPreset, canvasWidth: preset.width, canvasHeight: preset.height });
                    }}>
                      {Object.entries(OUTPUT_PRESETS).map(([value, preset]) => <option key={value} value={value}>{preset.label}</option>)}
                    </select>
                  </Field>
                  <div className="flex items-end gap-2">
                    <button onClick={saveTemplate} className="bg-accent px-4 py-2 text-sm font-semibold">Simpan template</button>
                    <button onClick={() => setTemplateDraft(null)} className="border border-white/20 px-4 py-2 text-sm">Batal</button>
                  </div>
                </div>
              </div>
            )}
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {templates.map((template) => (
                <div key={template.id} className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
                  <img src={template.frameDataUrl} className="h-40 w-full object-contain" />
                  <div className="p-3">
                    <p className="font-semibold">{template.name}</p>
                    <p className="text-xs text-[var(--kiosk-muted)]">{template.category} · {template.style} · {template.outputPreset}</p>
                    <p className="mt-3 text-xs font-semibold text-white/60">Posisi slot (persen)</p>
                    <div className="mt-2 space-y-2">
                      {template.slots.map((slot, index) => (
                        <div key={index} className="grid grid-cols-4 gap-1">
                          {(["x", "y", "w", "h"] as const).map((key) => (
                            <input
                              key={key}
                              type="number"
                              min={0}
                              max={1}
                              step={0.01}
                              aria-label={`Slot ${index + 1} ${key}`}
                              className="w-full rounded border border-white/10 bg-black/30 px-1 py-1 text-xs"
                              value={slot[key]}
                              onChange={(event) => {
                                const slots = template.slots.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, [key]: Number(event.target.value) } : item,
                                );
                                updateTemplate(template.id, { slots });
                              }}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                    <button onClick={() => removeTemplate(template.id)} className="mt-2 text-xs text-red-300">Hapus</button>
                  </div>
                </div>
              ))}
              {templates.length === 0 && <p className="text-sm text-[var(--kiosk-muted)]">Belum ada template lokal.</p>}
            </div>
          </section>

          <section className={`${sectionClass} lg:col-span-2`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold">Stiker PNG</h2>
                <p className="mt-1 text-sm text-[var(--kiosk-muted)]">Upload stiker transparan yang bisa dipilih customer saat preview.</p>
              </div>
              <label className="cursor-pointer bg-accent px-4 py-2 text-sm font-semibold">
                Upload stiker
                <input type="file" accept="image/png" className="hidden" onChange={(event) => event.target.files?.[0] && uploadSticker(event.target.files[0])} />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              {stickers.map((sticker) => (
                <div key={sticker.id} className="w-24 rounded-lg border border-white/10 bg-black/20 p-2 text-center">
                  <img src={sticker.dataUrl} className="h-16 w-full object-contain" />
                  <p className="mt-1 truncate text-xs">{sticker.name}</p>
                  <button onClick={() => removeSticker(sticker.id)} className="mt-1 text-xs text-red-300">Hapus</button>
                </div>
              ))}
              {stickers.length === 0 && <p className="text-sm text-[var(--kiosk-muted)]">Belum ada stiker.</p>}
            </div>
          </section>

          <section className={sectionClass}>
            <h2 className="font-display text-xl font-semibold">Warna & Tipografi</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <ColorField label="Warna aksen" value={config.accentColor} onChange={(v) => set("accentColor", v)} />
              <ColorField label="Background kiosk" value={config.backgroundColor} onChange={(v) => set("backgroundColor", v)} />
              <ColorField label="Surface kartu" value={config.surfaceColor} onChange={(v) => set("surfaceColor", v)} />
              <ColorField label="Warna teks" value={config.textColor} onChange={(v) => set("textColor", v)} />
              <ColorField label="Teks sekunder" value={config.mutedTextColor} onChange={(v) => set("mutedTextColor", v)} />
              <Field label="Font display">
                <select className={inputClass} value={config.fontFamily} onChange={(e) => set("fontFamily", e.target.value)}>
                  <option>Space Grotesk</option>
                  <option>Inter</option>
                  <option>DM Sans</option>
                  <option>Playfair Display</option>
                  <option>Montserrat</option>
                </select>
              </Field>
            </div>
          </section>

          <section className={sectionClass}>
            <h2 className="font-display text-xl font-semibold">Gaya UI Kiosk</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Bentuk tombol">
                <select className={inputClass} value={config.buttonStyle} onChange={(e) => set("buttonStyle", e.target.value as BoothConfig["buttonStyle"])}>
                  <option value="rounded">Rounded</option>
                  <option value="pill">Pill</option>
                  <option value="square">Square</option>
                </select>
              </Field>
              <Field label="Kepadatan layout">
                <select className={inputClass} value={config.kioskDensity} onChange={(e) => set("kioskDensity", e.target.value as BoothConfig["kioskDensity"])}>
                  <option value="comfortable">Comfortable</option>
                  <option value="compact">Compact</option>
                </select>
              </Field>
              <Field label="Layout per sesi foto">
                <select className={inputClass} value={config.sessionLayout ?? "immersive"} onChange={(e) => set("sessionLayout", e.target.value as BoothConfig["sessionLayout"])}>
                  <option value="immersive">Immersive — fokus visual</option>
                  <option value="split">Split — kamera + panel kontrol</option>
                  <option value="centered">Centered — fokus tengah</option>
                  <option value="gallery">Gallery — thumbnail dan hasil lebih dominan</option>
                </select>
              </Field>
              <label className="flex items-center gap-3 sm:col-span-2">
                <input type="checkbox" checked={config.animationsEnabled} onChange={(e) => set("animationsEnabled", e.target.checked)} />
                <span className="text-sm text-white/70">Aktifkan animasi dan transisi</span>
              </label>
            </div>
            <div className="mt-5 rounded-xl border border-white/10 p-4" style={{ backgroundColor: "var(--kiosk-surface)" }}>
              <p className="text-sm text-[var(--kiosk-muted)]">Live preview</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button className="bg-accent px-5 py-2 font-semibold">Tombol utama</button>
                <button className="border border-white/20 px-5 py-2">Tombol sekunder</button>
              </div>
            </div>
          </section>

          <section className={sectionClass}>
            <h2 className="font-display text-xl font-semibold">Sesi Foto & Kamera</h2>
            <div className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Countdown (detik)">
                  <input type="number" min={1} max={15} className={inputClass} value={config.countdownSeconds} onChange={(e) => set("countdownSeconds", Math.max(1, Number(e.target.value)))} />
                </Field>
                <Field label="Capture vibe">
                  <select className={inputClass} value={config.captureVibe} onChange={(e) => set("captureVibe", e.target.value as BoothConfig["captureVibe"])}>
                    {["Electric", "Cotton Candy", "Ocean", "Sunset", "Mono"].map((v) => <option key={v}>{v}</option>)}
                  </select>
                </Field>
              </div>
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={config.beepEnabled} onChange={(e) => set("beepEnabled", e.target.checked)} />
                <span className="text-sm text-white/70">Suara beep countdown</span>
              </label>
              <Field label="Mode kamera">
                <select className={inputClass} value={config.cameraMode} onChange={(e) => set("cameraMode", e.target.value as BoothConfig["cameraMode"])}>
                  <option value="webcam">Webcam / virtual camera</option>
                  <option value="tether">Canon DSLR / tether bridge</option>
                </select>
              </Field>
              {config.cameraMode === "tether" && (
                <Field label="URL tether bridge">
                  <input className={inputClass} value={config.tetherBridgeUrl} onChange={(e) => set("tetherBridgeUrl", e.target.value)} placeholder="http://127.0.0.1:5513" />
                </Field>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
