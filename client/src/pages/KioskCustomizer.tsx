import { Link } from "wouter";
import { useBoothConfig, type BoothConfig } from "@/lib/boothConfigStore";

export default function KioskCustomizer() {
  const { config, update } = useBoothConfig();
  const set = <K extends keyof BoothConfig>(key: K, value: BoothConfig[K]) => update({ [key]: value });
  return (
    <div className="h-full overflow-y-auto bg-[var(--kiosk-background)] px-5 py-8 text-[var(--kiosk-text)] md:px-10">
      <header className="mx-auto max-w-7xl"><Link href="/admin" className="text-sm text-white/50 hover:text-white">← Admin OS</Link><p className="eyebrow mt-6">ADMIN / KIOSK CUSTOMIZER</p><h1 className="mt-2 font-display text-4xl font-bold md:text-6xl">Kiosk Customizer</h1><p className="mt-2 text-white/50">Atur tampilan global kiosk dan lihat preview secara langsung.</p></header>
      <main className="mx-auto mt-8 grid max-w-7xl gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 md:p-8">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="text-sm text-white/60">Nama brand<input value={config.brandName} onChange={(e) => set("brandName", e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white" /></label>
            <label className="text-sm text-white/60">Tagline<input value={config.tagline} onChange={(e) => set("tagline", e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white" /></label>
            <label className="text-sm text-white/60">Teks promo<input value={config.promoText} onChange={(e) => set("promoText", e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white sm:col-span-2" /></label>
            <label className="text-sm text-white/60 sm:col-span-2">Logo kiosk<input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => set("logoUrl", String(reader.result)); reader.readAsDataURL(file); }} className="mt-1 block w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white" /></label>
            {([["backgroundColor", "Warna background"], ["surfaceColor", "Warna panel"], ["accentColor", "Warna aksen"], ["textColor", "Warna teks"]] as const).map(([key, label]) => <label key={key} className="text-sm text-white/60">{label}<input type="color" value={config[key]} onChange={(e) => set(key, e.target.value)} className="mt-1 block h-12 w-full rounded-xl bg-transparent" /></label>)}
            <label className="text-sm text-white/60">Bentuk tombol<select value={config.buttonStyle} onChange={(e) => set("buttonStyle", e.target.value as BoothConfig["buttonStyle"])} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white"><option value="rounded">Rounded</option><option value="pill">Pill</option><option value="square">Square</option></select></label>
            <label className="text-sm text-white/60">Kepadatan layout<select value={config.kioskDensity} onChange={(e) => set("kioskDensity", e.target.value as BoothConfig["kioskDensity"])} className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white"><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
          </div>
        </section>
        <section className="sticky top-4 h-fit rounded-[2rem] border border-white/10 bg-black/20 p-5"><p className="eyebrow">LIVE PREVIEW</p><div className="mt-4 min-h-80 rounded-3xl p-6" style={{ background: config.backgroundColor, color: config.textColor }}><div className="rounded-2xl p-5" style={{ background: config.surfaceColor }}>{config.logoUrl && <img src={config.logoUrl} className="mb-4 h-10 max-w-32 object-contain" />}<p className="text-xs uppercase tracking-widest" style={{ color: config.accentColor }}>{config.brandName}</p><h2 className="mt-4 text-3xl font-bold">{config.tagline}</h2><p className="mt-3 opacity-60">{config.promoText}</p><button className="mt-8 px-5 py-3 font-semibold text-white" style={{ background: config.accentColor, borderRadius: config.buttonStyle === "pill" ? 999 : config.buttonStyle === "square" ? 4 : 16 }}>Mulai sesi</button></div></div><Link href="/" className="mt-4 block text-center text-sm text-accent">Buka kiosk →</Link></section>
      </main>
    </div>
  );
}
