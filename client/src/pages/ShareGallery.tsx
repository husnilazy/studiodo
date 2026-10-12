import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";

/** Simple confetti burst — pure CSS/JS, no dependencies */
function ConfettiParticle({ x, color, delay }: { x: number; color: string; delay: number }) {
  return (
    <motion.div
      className="pointer-events-none fixed top-0 z-50 h-3 w-1.5 rounded-full"
      style={{ left: `${x}%`, backgroundColor: color }}
      initial={{ y: -20, opacity: 1, rotate: 0 }}
      animate={{ y: "110vh", opacity: [1, 1, 0], rotate: 720 }}
      transition={{ duration: 2.2 + Math.random() * 0.8, delay, ease: "easeIn" }}
    />
  );
}

const CONFETTI_COLORS = ["#D97757", "#06B6D4", "#F472B6", "#34D399", "#FBBF24", "#F97316"];
const confettiItems = Array.from({ length: 36 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  delay: Math.random() * 1.1,
}));

// One of these is picked per visit so the page doesn't read like a template.
const HEADLINES = [
  { title: "Senyum kamu, sudah kami simpan.", sub: "Unduh, pamerkan, dan bagikan — momen ini terlalu bagus untuk disimpan sendiri." },
  { title: "Hasilnya keren banget, lho!", sub: "Tinggal satu ketukan untuk membawa pulang semua gayamu hari ini." },
  { title: "Gaya hari ini: abadi.", sub: "Semua foto dan klip dari sesimu ada di sini, siap diunduh." },
];

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(star)}
          className="text-3xl transition-transform hover:scale-110 active:scale-90"
          aria-label={`${star} bintang`}
        >
          <span style={{ color: star <= (hovered || value) ? "#FBBF24" : "rgba(120,120,140,0.3)" }}>★</span>
        </button>
      ))}
    </div>
  );
}

const DownloadIcon = () => (
  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
);

type MediaTab = "foto" | "video" | "gif" | "stopmotion" | "klip";
const TAB_LABEL: Record<MediaTab, string> = { foto: "Foto", video: "Video", gif: "GIF", stopmotion: "Stop Motion", klip: "Klip" };

const isGifFile = (url: string) => url.split(/[?#]/)[0].toLowerCase().endsWith(".gif");
const videoExt = (url: string) => (/\.webm($|[?#])/i.test(url) ? "webm" : "mp4");

export default function ShareGallery({ id }: { id: string }) {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>({ brandName: "STUDIODO", tagline: "" });
  const [form, setForm] = useState({ whatsapp: "", email: "", publishConsent: false, feedback: "", rating: 0 });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [activePhoto, setActivePhoto] = useState<string | null>(null);
  const [tab, setTab] = useState<MediaTab>("foto");
  const [copied, setCopied] = useState(false);
  const didMount = useRef(false);
  const headline = useMemo(() => HEADLINES[Math.floor(Math.random() * HEADLINES.length)], []);

  useEffect(() => {
    document.documentElement.classList.add("public-gallery-mode");
    document.body.classList.add("public-gallery-mode");
    return () => {
      document.documentElement.classList.remove("public-gallery-mode");
      document.body.classList.remove("public-gallery-mode");
    };
  }, []);

  useEffect(() => {
    Promise.all([api.getPublicSession(id), api.getPublicConfig(id)]).then(([data, publicConfig]) => {
      setSession(data);
      setProfile((current: any) => publicConfig ?? current);
      if (!didMount.current) {
        didMount.current = true;
        setTimeout(() => setShowConfetti(true), 400);
        setTimeout(() => setShowConfetti(false), 3000);
      }
    }).catch(() => setSession(false));
  }, [id]);

  if (session === false) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas p-10 text-center font-body text-fg">
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-7xl opacity-25">📷</motion.span>
        <p className="font-display text-2xl font-semibold">Hasil tidak ditemukan</p>
        <p className="text-fg/40">Link mungkin sudah kadaluarsa atau tidak valid.</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas font-body text-fg">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-fg/15 border-t-accent" />
        <p className="text-fg/50">Memuat hasil foto...</p>
      </div>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.updateCustomer(id, { whatsapp: form.whatsapp, email: form.email, publishConsent: form.publishConsent, feedback: form.feedback });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  // Prefer Drive links when available, fallback to local URLs
  const driveLinks = session.driveLinks;
  const photoUrls: string[] = driveLinks?.photos?.length
    ? driveLinks.photos.map((p: any) => p.previewUrl).filter(Boolean)
    : (session.photoUrls ?? []).filter(Boolean);
  const photoDownloadUrls: string[] = driveLinks?.photos?.length
    ? driveLinks.photos.map((p: any) => p.downloadUrl)
    : photoUrls;
  const stripDisplayUrl = driveLinks?.stripPreviewUrl ?? session.stripUrl;
  const stripDownloadUrl = session.stripUrl; // stripUrl is already download URL when gdrive
  const slotClips: string[] = Array.isArray(session.slotClipUrls) ? session.slotClipUrls.filter(Boolean) : [];
  const shareLink = window.location.href;
  const waText = encodeURIComponent(`Lihat hasil foto aku di ${profile.brandName || "STUDIODO"}! 📸\n${shareLink}`);
  const profileBrand = profile.brandName || "STUDIODO";
  const whatsappUrl = profile.contactWhatsapp ? `https://wa.me/${profile.contactWhatsapp.replace(/\D/g, "")}` : null;

  const tabs: MediaTab[] = [
    ...(photoUrls.length > 0 ? ["foto" as const] : []),
    ...(session.videoUrl ? ["video" as const] : []),
    ...(session.gifUrl ? ["gif" as const] : []),
    ...(session.stopMotionUrl ? ["stopmotion" as const] : []),
    ...(slotClips.length > 0 ? ["klip" as const] : []),
  ];
  const currentTab: MediaTab = tabs.includes(tab) ? tab : (tabs[0] ?? "foto");

  const copyLink = async () => {
    try {
      await navigator.clipboard?.writeText(shareLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard blocked (non-https / permissions) — nothing useful to do
    }
  };

  const fieldClass = "w-full rounded-xl border border-fg/[0.12] bg-fg/[0.05] px-4 py-3 text-sm outline-none transition focus:border-accent/60";
  const card = "rounded-3xl border border-fg/10 bg-fg/[0.03] p-4 sm:p-6";
  const ghostBtn = "mt-3 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-fg/15 text-sm font-semibold hover:border-accent hover:text-accent";

  return (
    <div className="public-gallery min-h-screen overflow-x-hidden bg-canvas font-body text-fg">
      <AnimatePresence>
        {showConfetti && confettiItems.map((p) => <ConfettiParticle key={p.id} x={p.x} color={p.color} delay={p.delay} />)}
      </AnimatePresence>

      <AnimatePresence>
        {activePhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setActivePhoto(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          >
            <motion.img
              src={activePhoto}
              alt="Foto penuh"
              initial={{ scale: 0.88, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="max-h-[88vh] max-w-full rounded-2xl object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            <button onClick={() => setActivePhoto(null)} aria-label="Tutup" className="absolute right-4 top-4 rounded-full bg-white/15 p-2.5 text-white hover:bg-white/25">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero */}
      <header className="relative overflow-hidden border-b border-fg/[0.06]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,color-mix(in_srgb,var(--accent)_26%,transparent),transparent_60%),radial-gradient(ellipse_at_bottom_right,color-mix(in_srgb,var(--accent)_12%,transparent),transparent_60%)]" />
        <div className="relative mx-auto max-w-3xl px-4 pb-8 pt-6 text-center sm:px-6 sm:pb-12 sm:pt-8">
          <div className="flex justify-center">
            {profile.logoUrl
              ? <img src={profile.logoUrl} alt={profileBrand} className="h-14 w-auto max-w-[60vw] object-contain sm:h-16" />
              : <span className="font-display text-xl font-bold tracking-wide">{profileBrand}</span>}
          </div>
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
            <h1 className="mx-auto mt-6 max-w-xl font-display text-3xl font-bold leading-tight sm:text-4xl">{headline.title}</h1>
            <p className="mx-auto mt-3 max-w-md text-sm text-fg/55 sm:text-base">{headline.sub}</p>
          </motion.div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 pb-12 sm:px-6 sm:py-8">
        {/* Hasil utama: the finished frame */}
        {session.stripUrl && (
          <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className={card}>
            <div className="flex justify-center rounded-2xl bg-fg/[0.04] p-3 sm:p-5">
              <img
                src={stripDisplayUrl}
                alt="Hasil foto berframe"
                onClick={() => setActivePhoto(session.stripUrl)}
                className="max-h-[68vh] w-auto max-w-full cursor-zoom-in rounded-xl object-contain shadow-xl shadow-black/30"
              />
            </div>
            <a href={stripDownloadUrl} download className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-accent px-5 text-sm font-semibold shadow-lg shadow-accent/25 transition active:scale-[0.98]">
              <DownloadIcon /> Unduh hasil foto
            </a>
          </motion.section>
        )}

        {/* Semua media dalam satu viewer bertab, supaya halaman tetap ringkas */}
        {tabs.length > 0 && (
          <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }} className={card}>
            <div className="mb-4 flex gap-1.5 overflow-x-auto rounded-full border border-fg/10 bg-fg/[0.04] p-1">
              {tabs.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setTab(item)}
                  className={`flex-1 shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${currentTab === item ? "bg-fg text-canvas shadow" : "text-fg/55 hover:text-fg"}`}
                >
                  {TAB_LABEL[item]}{item === "foto" ? ` (${photoUrls.length})` : item === "klip" ? ` (${slotClips.length})` : ""}
                </button>
              ))}
            </div>

            {currentTab === "foto" && (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {photoUrls.map((url, index) => (
                  <div key={url} className="overflow-hidden rounded-2xl border border-fg/[0.08] bg-fg/[0.04]">
                    <button type="button" onClick={() => setActivePhoto(url)} className="block aspect-[4/5] w-full cursor-zoom-in overflow-hidden">
                      <img src={url} alt={`Foto ${index + 1}`} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 hover:scale-105" />
                    </button>
                    <a href={photoDownloadUrls[index] ?? url} download={`foto-${index + 1}.jpg`} className="flex items-center justify-center gap-1.5 border-t border-fg/[0.08] py-2.5 text-xs font-semibold text-accent">
                      <DownloadIcon /> Foto {index + 1}
                    </a>
                  </div>
                ))}
              </div>
            )}

            {currentTab === "video" && session.videoUrl && (
              <div>
                <video src={session.videoUrl} controls loop playsInline preload="metadata" className="max-h-[70vh] w-full rounded-2xl border border-fg/[0.08] bg-black" />
                <a href={session.videoUrl} download={`video-sesi.${videoExt(session.videoUrl)}`} className={ghostBtn}><DownloadIcon /> Unduh video</a>
              </div>
            )}

            {currentTab === "gif" && session.gifUrl && (
              <div>
                <img src={session.gifUrl} alt="GIF sesi" className="mx-auto max-h-[70vh] w-full rounded-2xl border border-fg/[0.08] object-contain" />
                <a href={session.gifUrl} download="gif-sesi.gif" className={ghostBtn}><DownloadIcon /> Unduh GIF</a>
              </div>
            )}

            {currentTab === "stopmotion" && session.stopMotionUrl && (
              <div>
                <video src={session.stopMotionUrl} controls loop playsInline preload="metadata" className="max-h-[70vh] w-full rounded-2xl border border-fg/[0.08] bg-black" />
                <a href={session.stopMotionUrl} download={`stop-motion.${videoExt(session.stopMotionUrl)}`} className={ghostBtn}><DownloadIcon /> Unduh stop motion</a>
              </div>
            )}

            {currentTab === "klip" && (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {slotClips.map((clipUrl, index) => {
                  const gif = isGifFile(clipUrl);
                  return (
                    <div key={clipUrl} className="overflow-hidden rounded-2xl border border-fg/[0.08] bg-fg/[0.04]">
                      <div className="aspect-[4/5] w-full overflow-hidden">
                        {gif
                          ? <img src={clipUrl} alt={`Klip ${index + 1}`} loading="lazy" className="h-full w-full object-cover" />
                          : <video src={clipUrl} muted loop autoPlay playsInline className="h-full w-full object-cover" />}
                      </div>
                      <a href={clipUrl} download={`klip-${index + 1}.${gif ? "gif" : videoExt(clipUrl)}`} className="flex items-center justify-center gap-1.5 border-t border-fg/[0.08] py-2.5 text-xs font-semibold text-accent"><DownloadIcon /> Klip {index + 1}</a>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.section>
        )}

        {/* Bagikan */}
        <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }} className={card}>
          <h2 className="font-display text-lg font-semibold">Bagikan keseruannya</h2>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <a href={`https://wa.me/?text=${waText}`} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#25D366]/40 bg-[#25D366]/10 px-3 text-sm font-semibold text-[#1da851] hover:bg-[#25D366]/20">
              Kirim via WA
            </a>
            <button type="button" onClick={copyLink} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-fg/15 px-3 text-sm font-semibold text-fg/75 hover:border-accent hover:text-accent">
              {copied ? "Tersalin ✓" : "Salin link"}
            </button>
            {driveLinks?.folderUrl && (
              <a href={driveLinks.folderUrl} target="_blank" rel="noopener noreferrer" className="col-span-2 flex min-h-11 items-center justify-center rounded-xl border border-fg/15 px-3 text-sm font-semibold text-fg/75 hover:border-accent hover:text-accent">
                Buka folder lengkap di Google Drive
              </a>
            )}
          </div>
        </motion.section>

        {/* Feedback */}
        <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className={`${card} bg-gradient-to-b from-accent/[0.06] to-transparent`}>
          <h2 className="font-display text-lg font-semibold">Gimana pengalamanmu?</h2>
          <p className="mt-1 text-sm text-fg/50">Kasih bintang & tinggalkan kontak untuk kabar promo dan event berikutnya.</p>

          {saved ? (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-5 text-center">
              <div className="mb-1 text-3xl">🙌</div>
              <p className="font-display text-lg font-semibold text-emerald-500">Makasih banyak!</p>
              <p className="mt-1 text-sm text-fg/55">Sampai ketemu di sesi foto berikutnya.</p>
            </motion.div>
          ) : (
            <form onSubmit={submit} className="mt-4 space-y-3">
              <StarRating value={form.rating} onChange={(v) => setForm({ ...form, rating: v })} />
              <div className="grid gap-2.5 sm:grid-cols-2">
                <input className={fieldClass} type="tel" inputMode="tel" placeholder="Nomor WhatsApp" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
                <input className={fieldClass} type="email" placeholder="Email (opsional)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <textarea className={fieldClass} placeholder="Ceritakan kesanmu (opsional)" rows={3} value={form.feedback} onChange={(e) => setForm({ ...form, feedback: e.target.value })} />
              <label className="flex items-start gap-3 text-sm text-fg/55">
                <input type="checkbox" className="mt-0.5 h-4 w-4 rounded accent-[var(--accent)]" checked={form.publishConsent} onChange={(e) => setForm({ ...form, publishConsent: e.target.checked })} />
                <span>Boleh dipajang di galeri & media sosial {profileBrand}.</span>
              </label>
              <button type="submit" disabled={saving} className="min-h-12 w-full rounded-xl bg-accent px-5 text-sm font-semibold shadow-lg shadow-accent/20 transition active:scale-[0.98] disabled:opacity-50">
                {saving ? "Mengirim..." : "Kirim"}
              </button>
            </form>
          )}
        </motion.section>
      </main>

      <footer className="border-t border-fg/[0.06] px-4 py-8 text-center sm:px-6">
        <p className="text-sm font-semibold text-fg/70">{profileBrand}</p>
        {(profile.tagline || profile.address) && <p className="mt-1 text-xs text-fg/40">{profile.tagline || profile.address}</p>}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {whatsappUrl && <a href={whatsappUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-emerald-400/25 px-3 py-1.5 text-xs text-emerald-600">WhatsApp</a>}
          {profile.socialInstagram && <a href={profile.socialInstagram} target="_blank" rel="noreferrer" className="rounded-lg border border-fg/10 px-3 py-1.5 text-xs text-fg/60">Instagram</a>}
          {profile.socialTiktok && <a href={profile.socialTiktok} target="_blank" rel="noreferrer" className="rounded-lg border border-fg/10 px-3 py-1.5 text-xs text-fg/60">TikTok</a>}
          {profile.socialFacebook && <a href={profile.socialFacebook} target="_blank" rel="noreferrer" className="rounded-lg border border-fg/10 px-3 py-1.5 text-xs text-fg/60">Facebook</a>}
          {profile.websiteUrl && <a href={profile.websiteUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-fg/10 px-3 py-1.5 text-xs text-fg/60">Website</a>}
        </div>
      </footer>
    </div>
  );
}
