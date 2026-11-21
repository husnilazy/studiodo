import type { Hair, Expr, SceneId } from "./art.js";

// Which illustration tells each feature's story. `cover` shows the PROBLEM the hook talks about (a person who is confused, shocked or
// worried), `fix` shows the same scene once the feature solves it (happy / relieved). Keeping both per feature is what makes the
// picture match the headline: "Booth bermasalah pas event?" gets a worried person next to a kiosk with a warning, not a dashboard.

export type Art = { scene: SceneId; expr: Expr; hair?: Hair; skin?: number };
type Pair = { cover: Art; fix: Art };
const A = (scene: SceneId, expr: Expr, hair?: Hair, skin?: number): Art => ({ scene, expr, hair, skin });
const P = (cover: Art, fix: Art): Pair => ({ cover, fix });

export const FEATURE_ART: Record<string, Pair> = {
  "qris-otomatis": P(A("kasir", "bingung", "hijab"), A("scan", "senang", "bun")),
  "pilih-penerima-qris": P(A("kasir", "bingung", "short", 2), A("omzet", "senang", "hijab")),
  "saldo-penarikan": P(A("kasir", "khawatir", "hijab"), A("omzet", "senang", "short")),
  "persetujuan-dua-orang": P(A("aman", "kaget", "short", 2), A("aman", "lega", "hijab")),
  "voucher-promo": P(A("kasir", "berpikir", "curly", 2), A("scan", "senang", "long")),
  "invoice-tercatat": P(A("kasir", "khawatir", "short", 1), A("omzet", "lega", "hijab")),
  "bayar-langganan": P(A("kasir", "bingung", "long", 1), A("scan", "senang", "short")),
  "mode-alur": P(A("antrean", "khawatir"), A("antrean", "senang")),
  "gaya-kiosk": P(A("desain", "berpikir", "curly", 2), A("desain", "senang", "long")),
  "frame-portrait-landscape": P(A("desain", "khawatir", "short"), A("cetak", "senang", "long")),
  "edit-di-kiosk": P(A("hasil", "bingung", "short", 1), A("hasil", "senang", "hijab")),
  "foto-gif-video": P(A("hasil", "berpikir", "bun"), A("hasil", "kaget", "short", 2)),
  "stop-motion": P(A("hasil", "bingung", "long", 1), A("hasil", "senang", "curly", 2)),
  "mirror-asli": P(A("cetak", "kaget", "short"), A("cetak", "lega", "hijab")),
  "zoom-shutter": P(A("kamera", "bingung", "hijab"), A("kamera", "senang", "short", 2)),
  "multi-kamera": P(A("kamera", "berpikir", "short", 1), A("kamera", "senang", "long")),
  "sosmed-izin": P(A("aman", "berpikir", "bun"), A("aman", "lega", "short")),
  "pin-operator": P(A("aman", "khawatir", "short", 2), A("aman", "lega", "hijab")),
  "galeri-qr": P(A("hasil", "bingung", "hijab"), A("scan", "senang", "bun")),
  "layar-hasil": P(A("hasil", "bingung", "short"), A("hasil", "senang", "long")),
  "cetak-tambahan": P(A("cetak", "berpikir", "curly"), A("cetak", "senang", "short", 2)),
  "data-pelanggan": P(A("omzet", "berpikir", "short", 1), A("omzet", "senang", "hijab")),
  "kontrol-kamera": P(A("kamera", "khawatir", "short", 2), A("kamera", "lega", "long")),
  "kamera-sdk": P(A("kamera", "bingung", "curly", 2), A("kamera", "senang", "short")),
  "live-view": P(A("kamera", "kaget", "short"), A("kamera", "lega", "hijab")),
  "printer-kertas": P(A("cetak", "khawatir", "long", 1), A("cetak", "senang", "short")),
  "dashboard-realtime": P(A("omzet", "bingung", "short", 1), A("omzet", "senang", "hijab")),
  "banyak-kiosk": P(A("antrean", "berpikir"), A("omzet", "senang", "long")),
  "update-otomatis": P(A("error", "bingung", "short", 2), A("offline", "lega", "hijab")),
  "kesiapan-booth": P(A("mulai", "khawatir", "bun"), A("mulai", "senang", "short")),
  "kasir-pos": P(A("kasir", "khawatir", "short"), A("omzet", "senang", "long", 1)),
  "bantuan-chat": P(A("error", "khawatir", "hijab"), A("chat", "senang", "long")),
  "monitor-error": P(A("error", "kaget", "short", 1), A("omzet", "lega", "hijab")),
  "offline-aman": P(A("offline", "khawatir", "short", 2), A("offline", "lega", "long")),
  "trial-lisensi": P(A("mulai", "berpikir", "short"), A("mulai", "senang", "hijab")),
  "login-tanpa-password": P(A("aman", "bingung", "long"), A("aman", "senang", "short", 2)),
  "paket-plan": P(A("kasir", "berpikir", "hijab"), A("omzet", "senang", "short")),
  "marketplace-frame": P(A("desain", "bingung", "short", 1), A("desain", "senang", "hijab")),
  "direktori-booth": P(A("scan", "berpikir", "long"), A("antrean", "senang")),
  "panduan-onboarding": P(A("mulai", "bingung", "short", 2), A("mulai", "senang", "bun")),
  "tips-harga-paket": P(A("kasir", "berpikir", "short", 1), A("omzet", "senang", "hijab")),
  "tips-antrean-event": P(A("antrean", "khawatir"), A("antrean", "senang")),
  "tips-lokasi-booth": P(A("scan", "bingung", "short", 2), A("antrean", "senang")),
  "tips-frame-event": P(A("desain", "bingung", "hijab"), A("desain", "senang", "short", 1)),
  "tips-cek-sebelum-event": P(A("mulai", "khawatir", "short"), A("mulai", "lega", "hijab")),
  "tips-konten-booth": P(A("hasil", "bingung", "long", 1), A("hasil", "senang", "bun")),
  "tips-pelanggan-kembali": P(A("omzet", "berpikir", "short", 2), A("antrean", "senang")),
  "tips-perawatan-printer": P(A("cetak", "khawatir", "short"), A("cetak", "lega", "long")),
  "tips-pencahayaan": P(A("kamera", "bingung", "short", 2), A("kamera", "senang", "hijab")),
  "tips-kesepakatan-event": P(A("aman", "bingung", "long"), A("aman", "lega", "short", 2)),
  "tips-mulai-bisnis": P(A("mulai", "bingung", "hijab"), A("mulai", "senang", "short", 1)),
};

export const artFor = (featureId: string, which: "cover" | "fix"): Art | undefined => FEATURE_ART[featureId]?.[which];
/** "scene:expr:hair:skin" - how a slide stores its illustration (plain string so decks stay JSON-friendly and editable). */
export const encodeArt = (a: Art): string => [a.scene, a.expr, a.hair ?? "", a.skin ?? ""].join(":");
export function decodeArt(s: string | undefined): Art | null {
  if (!s) return null;
  const [scene, expr, hair, skin] = s.split(":");
  return scene && expr ? { scene: scene as SceneId, expr: expr as Expr, hair: (hair || undefined) as Hair | undefined, skin: skin ? Number(skin) : undefined } : null;
}
