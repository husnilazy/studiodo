import { useEffect, useRef, useState } from "react";
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

const CONFETTI_COLORS = ["#7C3AED", "#06B6D4", "#F472B6", "#34D399", "#FBBF24", "#F97316"];
const confettiItems = Array.from({ length: 50 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  delay: Math.random() * 1.2,
}));

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
          className="text-2xl transition-transform hover:scale-110"
          aria-label={`${star} bintang`}
        >
          <span style={{ color: star <= (hovered || value) ? "#FBBF24" : "rgba(255,255,255,0.2)" }}>★</span>
        </button>
      ))}
    </div>
  );
}

export default function ShareGallery({ id }: { id: string }) {
  const [session, setSession] = useState<any>(null);
  const [form, setForm] = useState({ whatsapp: "", email: "", publishConsent: false, feedback: "", rating: 0 });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [activePhoto, setActivePhoto] = useState<string | null>(null);
  const didMount = useRef(false);

  useEffect(() => {
    api.getPublicSession(id).then((data) => {
      setSession(data);
      if (!didMount.current) {
        didMount.current = true;
        setTimeout(() => setShowConfetti(true), 400);
        setTimeout(() => setShowConfetti(false), 3000);
      }
    }).catch(() => setSession(false));
  }, [id]);

  if (session === false) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#07070a] p-10 text-center text-white">
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-7xl opacity-25">📷</motion.span>
        <p className="font-display text-2xl font-semibold">Hasil tidak ditemukan</p>
        <p className="text-white/40">Link mungkin sudah kadaluarsa atau tidak valid.</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#07070a] text-white">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-white/15 border-t-[#7C3AED]" />
        <p className="text-white/50">Memuat hasil foto...</p>
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
  const shareLink = window.location.href;
  const waText = encodeURIComponent(`✨ Lihat hasil foto saya di STUDIODO!\n${shareLink}`);

  return (
    <div className="min-h-screen bg-[#07070a] text-white">
      {/* Confetti burst */}
      <AnimatePresence>
        {showConfetti && confettiItems.map((p) => (
          <ConfettiParticle key={p.id} x={p.x} color={p.color} delay={p.delay} />
        ))}
      </AnimatePresence>

      {/* Lightbox */}
      <AnimatePresence>
        {activePhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setActivePhoto(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm cursor-zoom-out"
          >
            <motion.img
              src={activePhoto}
              alt="Foto penuh"
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            <button onClick={() => setActivePhoto(null)} className="absolute right-5 top-5 rounded-full bg-white/10 p-2 text-white/70 hover:bg-white/20">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero header */}
      <div className="relative overflow-hidden border-b border-white/[0.06]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(124,58,237,0.25),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(6,182,212,0.15),transparent_55%)]" />
        <div className="relative mx-auto max-w-5xl px-6 py-10 md:py-14">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#7C3AED]">STUDIODO Gallery</p>
            <h1 className="mt-3 font-display text-4xl font-bold leading-tight md:text-5xl">
              Momenmu sudah siap! <span className="inline-block animate-bounce">✨</span>
            </h1>
            <p className="mt-3 max-w-lg text-white/50">Download, bagikan, atau simpan kenangan ini. Foto kamu tersimpan di galeri pribadi STUDIODO.</p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="mt-6 flex flex-wrap gap-3"
          >
            {session.stripUrl && (
              <a
                href={stripDownloadUrl}
                download
                className="inline-flex items-center gap-2 rounded-xl bg-[#7C3AED] px-5 py-2.5 text-sm font-semibold shadow-lg shadow-[#7C3AED]/25 transition hover:bg-[#6D28D9]"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Download Strip
              </a>
            )}
            {driveLinks?.folderUrl && (
              <a
                href={driveLinks.folderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-blue-400/30 bg-blue-400/10 px-5 py-2.5 text-sm font-semibold text-blue-300 transition hover:bg-blue-400/20"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>
                Lihat di Google Drive
              </a>
            )}
            <a
              href={`https://wa.me/?text=${waText}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-[#25D366]/40 bg-[#25D366]/10 px-5 py-2.5 text-sm font-semibold text-[#25D366] transition hover:bg-[#25D366]/20"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.558 4.12 1.533 5.853L.057 23.707l5.992-1.569A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.017-1.38l-.36-.213-3.727.977.997-3.645-.235-.374A9.818 9.818 0 1112 21.818z"/></svg>
              Bagikan via WA
            </a>
            <button
              onClick={() => navigator.clipboard?.writeText(shareLink)}
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold text-white/70 transition hover:border-white/30 hover:text-white"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              Salin link
            </button>
          </motion.div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl space-y-10 px-6 py-10">
        {/* Strip final */}
        {session.stripUrl && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="overflow-hidden rounded-[2rem] border border-white/[0.07] bg-gradient-to-b from-white/[0.04] to-transparent p-6 md:p-8"
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="eyebrow text-xs font-bold uppercase tracking-[0.2em] text-[#7C3AED]">STRIP FINAL</p>
                <h2 className="mt-1 font-display text-2xl font-bold">Hasil foto kamu</h2>
              </div>
              <a
                href={session.stripUrl}
                download
                className="flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white/70 transition hover:border-[#7C3AED]/60 hover:text-[#7C3AED]"
              >
                ↓ Download
              </a>
            </div>
            <div className="flex justify-center">
              <motion.img
                src={stripDisplayUrl}
                alt="Strip foto"
                whileHover={{ scale: 1.02 }}
                transition={{ duration: 0.2 }}
                className="max-h-[70vh] max-w-full cursor-zoom-in rounded-2xl border border-white/[0.08] object-contain shadow-2xl shadow-black/60"
                onClick={() => setActivePhoto(session.stripUrl)}
              />
            </div>
          </motion.section>
        )}

        {/* Individual photos */}
        {photoUrls.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
          >
            <div className="mb-5">
              <p className="eyebrow text-xs font-bold uppercase tracking-[0.2em] text-white/40">FOTO INDIVIDUAL</p>
              <h2 className="mt-1 font-display text-2xl font-bold">{photoUrls.length} foto dari sesi kamu</h2>
            </div>
            <div className={`grid gap-3 ${photoUrls.length === 1 ? "max-w-xs" : photoUrls.length <= 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
              {photoUrls.map((url, index) => (
                <motion.button
                  key={url}
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 + index * 0.06 }}
                  onClick={() => setActivePhoto(url)}
                  className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] cursor-zoom-in"
                >
                  <img
                    src={url}
                    alt={`Foto ${index + 1}`}
                    className="w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 p-3">
                    <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur-sm">Foto {index + 1}</span>
                  </div>
                  <div className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 opacity-0 transition group-hover:opacity-100 backdrop-blur-sm">
                    <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                  </div>
                </motion.button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {photoUrls.map((url, index) => (
                <a
                  key={url}
                  href={url}
                  download={`foto-${index + 1}.jpg`}
                  className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/60 transition hover:border-white/25 hover:text-white"
                >
                  ↓ Foto {index + 1}
                </a>
              ))}
            </div>
          </motion.section>
        )}

        {/* Video */}
        {session.videoUrl && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="rounded-[2rem] border border-white/[0.07] bg-white/[0.03] p-6"
          >
            <p className="eyebrow mb-3 text-xs font-bold uppercase tracking-[0.2em] text-white/40">VIDEO MOMEN</p>
            <video src={session.videoUrl} controls playsInline className="w-full rounded-2xl border border-white/[0.08]" />
            <a href={session.videoUrl} download className="mt-3 inline-block text-sm font-semibold text-[#7C3AED] hover:underline">
              ↓ Download video
            </a>
          </motion.section>
        )}

        {/* Feedback & contact */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="rounded-[2rem] border border-white/[0.07] bg-gradient-to-b from-[#7C3AED]/[0.06] to-transparent p-6 md:p-8"
        >
          <div className="mb-6">
            <p className="eyebrow text-xs font-bold uppercase tracking-[0.2em] text-[#7C3AED]">KONTAK & FEEDBACK</p>
            <h2 className="mt-1 font-display text-2xl font-bold">Bagaimana pengalaman kamu?</h2>
            <p className="mt-2 text-sm text-white/45">Simpan kontak untuk promo & event berikutnya dari STUDIODO.</p>
          </div>

          {saved ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-6 text-center"
            >
              <div className="mb-2 text-3xl">🙌</div>
              <p className="font-display text-lg font-semibold text-emerald-300">Terima kasih!</p>
              <p className="mt-1 text-sm text-emerald-200/60">Kami akan mengabari kamu untuk promo dan event berikutnya.</p>
            </motion.div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {/* Star rating */}
              <div>
                <label className="mb-2 block text-sm text-white/60">Rating pengalaman</label>
                <StarRating value={form.rating} onChange={(v) => setForm({ ...form, rating: v })} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  className="rounded-xl border border-white/[0.12] bg-white/[0.05] px-4 py-3 text-sm outline-none transition focus:border-[#7C3AED]/60 focus:ring-1 focus:ring-[#7C3AED]/30"
                  placeholder="Nomor WhatsApp"
                  value={form.whatsapp}
                  onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                />
                <input
                  className="rounded-xl border border-white/[0.12] bg-white/[0.05] px-4 py-3 text-sm outline-none transition focus:border-[#7C3AED]/60 focus:ring-1 focus:ring-[#7C3AED]/30"
                  type="email"
                  placeholder="Email (opsional)"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <textarea
                className="w-full rounded-xl border border-white/[0.12] bg-white/[0.05] px-4 py-3 text-sm outline-none transition focus:border-[#7C3AED]/60 focus:ring-1 focus:ring-[#7C3AED]/30"
                placeholder="Cerita pengalaman kamu di sini... (opsional)"
                rows={3}
                value={form.feedback}
                onChange={(e) => setForm({ ...form, feedback: e.target.value })}
              />
              <label className="flex items-start gap-3 text-sm text-white/50">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded accent-[#7C3AED]"
                  checked={form.publishConsent}
                  onChange={(e) => setForm({ ...form, publishConsent: e.target.checked })}
                />
                <span>Saya mengizinkan foto digunakan untuk galeri dan promosi STUDIODO.</span>
              </label>
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-xl bg-[#7C3AED] px-5 py-3 text-sm font-semibold shadow-lg shadow-[#7C3AED]/20 transition hover:bg-[#6D28D9] disabled:opacity-50"
              >
                {saving ? "Menyimpan..." : "Kirim feedback"}
              </button>
            </form>
          )}
        </motion.section>
      </main>

      <footer className="border-t border-white/[0.06] px-6 py-8 text-center">
        <p className="text-sm text-white/30">Dibuat dengan 📷 oleh <span className="text-white/50 font-semibold">STUDIODO Photobooth</span></p>
      </footer>
    </div>
  );
}
