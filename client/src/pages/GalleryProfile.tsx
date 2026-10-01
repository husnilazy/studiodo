import { useEffect, useState } from "react";
import { Link } from "wouter";
import { api } from "@/lib/api";
import { pushConfigNow, useBoothConfig, type BoothConfig } from "@/lib/boothConfigStore";

import { inputClass } from "@/lib/adminUi";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm text-fg/60">{label}{children}</label>;
}

export default function GalleryProfile() {
  const config = useBoothConfig((state) => state.config);
  const update = useBoothConfig((state) => state.update);
  const [saved, setSaved] = useState(false);
  // The real public address customers land on after scanning the QR (was a hard-coded example string).
  const [shareBase, setShareBase] = useState<string | null>(null);
  useEffect(() => { api.getPublicConfig().then((r) => setShareBase(r?.baseUrl ?? null)).catch(() => setShareBase(null)); }, []);
  const set = <K extends keyof BoothConfig>(key: K, value: BoothConfig[K]) => update({ [key]: value } as Partial<BoothConfig>);

  const save = async () => {
    await api.updateGalleryProfile({
      brandName: config.brandName,
      tagline: config.tagline,
      logoUrl: config.logoUrl,
      contactWhatsapp: config.contactWhatsapp,
      socialInstagram: config.socialInstagram,
      socialTiktok: config.socialTiktok,
      socialFacebook: config.socialFacebook,
      websiteUrl: config.websiteUrl,
      address: config.address,
    });
    await pushConfigNow(); // keeps the saved design (and any new logo file) in step with the profile
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <section className="rounded-[2rem] border border-fg/10 bg-fg/[0.045] p-5 shadow-2xl shadow-black/10 backdrop-blur-xl md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="eyebrow">PUBLIC GALLERY</p><h3 className="mt-2 font-display text-3xl font-semibold">Profil halaman hasil</h3><p className="mt-2 max-w-xl text-sm text-fg/45">Informasi ini tampil di halaman yang dibuka customer setelah scan QR.</p></div>
          <Link href="/" className="rounded-xl border border-fg/15 px-4 py-2 text-sm text-fg/60 hover:border-accent hover:text-fg">Lihat kiosk</Link>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Field label="Nama brand"><input className={inputClass} value={config.brandName} onChange={(e) => set("brandName", e.target.value)} /></Field>
          <Field label="Tagline"><input className={inputClass} value={config.tagline} onChange={(e) => set("tagline", e.target.value)} /></Field>
          <Field label="WhatsApp"><input className={inputClass} placeholder="628123456789" value={config.contactWhatsapp} onChange={(e) => set("contactWhatsapp", e.target.value)} /></Field>
          <Field label="Instagram"><input className={inputClass} placeholder="https://instagram.com/studiodo" value={config.socialInstagram} onChange={(e) => set("socialInstagram", e.target.value)} /></Field>
          <Field label="TikTok"><input className={inputClass} placeholder="https://tiktok.com/@studiodo" value={config.socialTiktok} onChange={(e) => set("socialTiktok", e.target.value)} /></Field>
          <Field label="Facebook"><input className={inputClass} placeholder="https://facebook.com/studiodo" value={config.socialFacebook} onChange={(e) => set("socialFacebook", e.target.value)} /></Field>
          <Field label="Website"><input className={inputClass} placeholder="https://studiodo.id" value={config.websiteUrl} onChange={(e) => set("websiteUrl", e.target.value)} /></Field>
          <Field label="Alamat"><input className={inputClass} placeholder="Alamat studio" value={config.address} onChange={(e) => set("address", e.target.value)} /></Field>
        </div>
        <Field label="Logo halaman hasil (PNG)">
          <input className={inputClass} type="file" accept="image/png" onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => set("logoUrl", String(reader.result));
            reader.readAsDataURL(file);
          }} />
        </Field>
        {config.logoUrl && <img src={config.logoUrl} alt={config.brandName} className="mt-3 h-20 w-20 rounded-xl bg-fg/10 object-contain p-2" />}
        <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-fg/10 pt-5">
          <button type="button" onClick={save} className="k-btn k-btn-accent !min-h-0 !py-3 !text-sm">{saved ? "Profil tersimpan" : "Simpan profil gallery"}</button>
          <span className="text-xs text-fg/45">{shareBase ? `Link hasil pelanggan: ${shareBase}/#/share/<id-sesi>` : "Link hasil pelanggan dibuat otomatis per sesi."}</span>
        </div>
      </section>
    </div>
  );
}
