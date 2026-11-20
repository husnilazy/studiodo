// Tur aplikasi (Admin) — daftar langkah.
//
// CARA MENAMBAH FITUR BARU SAAT RILIS (lihat juga docs/app-tour.md):
//   1. Tambahkan satu objek di akhir TOUR_STEPS dengan `id` UNIK yang belum pernah dipakai (jangan pernah mengganti id lama:
//      id inilah yang mengingat langkah mana yang sudah dilihat tenant) dan `since` = versi aplikasi rilis itu.
//   2. Tenant lama yang sudah pernah melihat tur otomatis hanya diperlihatkan langkah BARU ("Yang baru di STUDIODO").
//      Tenant baru melihat semuanya. Tombol "Tur aplikasi" di sidebar memutar ulang semuanya kapan saja.
//   3. Mengubah teks langkah lama boleh; menghapus langkah juga aman.

export type TourSection = "monitor" | "control" | "gallery" | "kiosk" | "flow" | "finance" | "crm" | "traffic" | "media";

export interface TourStep {
  /** Unik dan tetap selamanya. */
  id: string;
  /** Versi aplikasi saat langkah ini ditambahkan (hanya catatan). */
  since: string;
  title: string;
  body: string;
  /** Bagian dashboard yang dibuka otomatis saat langkah ini tampil. */
  section?: TourSection;
  kioskSubtab?: "keys" | "camera" | "printer" | "access";
  financeSubtab?: "transactions" | "packages" | "gateway" | "event" | "promo" | "withdraw";
}

export const TOUR_STEPS: TourStep[] = [
  { id: "welcome", since: "0.1.40", title: "Selamat datang di STUDIODO", body: "Ini tur singkat Admin: tempat kamu mengatur booth, harga, tampilan kiosk, dan melihat penghasilan. Cukup 2 menit. Kamu bisa keluar kapan saja dan memutarnya lagi lewat tombol “Tur aplikasi” di menu samping." },
  { id: "launch-kiosk", since: "0.1.40", section: "monitor", title: "Luncurkan & tutup kiosk", body: "Kiosk adalah layar yang dipakai customer. Tombol “Buka Kiosk” / “Tutup Kiosk” ada di bagian bawah menu samping. Saat kiosk berjalan layar penuh, kembali ke Admin dengan Ctrl+Shift+A atau ketuk sudut layar kiosk 5 kali." },
  { id: "monitor", since: "0.1.40", section: "monitor", title: "Monitor Booth", body: "Pantau semua booth dalam satu layar: siapa yang sedang sesi, menunggu bayar, atau offline. Di atasnya ada daftar “Kesiapan booth” yang menunjukkan apa lagi yang perlu dilengkapi sebelum dipakai customer." },
  { id: "control", since: "0.1.40", section: "control", title: "Kustomisasi Kiosk", body: "Ubah logo, warna, teks, dan tombol kiosk. Pratinjau di sebelahnya memakai kiosk asli, jadi apa yang kamu lihat sama dengan yang customer lihat." },
  { id: "gallery", since: "0.1.40", section: "gallery", title: "Profil Gallery", body: "Customer menerima foto lewat halaman galeri publik. Atur nama, logo, dan tampilannya di sini supaya terasa seperti brand kamu." },
  { id: "kiosk-keys", since: "0.1.40", section: "kiosk", kioskSubtab: "keys", title: "Key booth", body: "Setiap booth punya key. Tempel key di komputer booth untuk mengaktifkannya (satu key = satu komputer). Punya booth tambahan? Buat key baru di sini lalu masukkan di aplikasi komputer lain." },
  { id: "kiosk-camera-printer", since: "0.1.40", section: "kiosk", kioskSubtab: "camera", title: "Kamera & printer", body: "Pilih kamera, atur ISO / shutter / white balance, dan pilih printer + ukuran kertas. Lakukan satu kali uji sesi setelah mengubahnya." },
  { id: "kiosk-access", since: "0.1.40", section: "kiosk", kioskSubtab: "access", title: "Akses operator", body: "Atur PIN kru dan sudut layar yang diketuk untuk membuka konsol operator di kiosk, supaya staf bisa masuk tanpa keyboard." },
  { id: "flow", since: "0.1.40", section: "flow", title: "Flow Kiosk", body: "Atur urutan layar yang dilalui customer: pilih paket, bayar, foto, pilih frame, hasil. Layar yang tidak dibutuhkan bisa dimatikan." },
  { id: "finance-packages", since: "0.1.40", section: "finance", financeSubtab: "packages", title: "Paket & harga", body: "Buat paket foto (jumlah foto, harga, cetak). Ini yang customer pilih di kiosk." },
  { id: "finance-gateway", since: "0.1.40", section: "finance", financeSubtab: "gateway", title: "Pembayaran QRIS", body: "Hubungkan pembayaran supaya customer bisa bayar QRIS di kiosk. Tanpa ini kiosk hanya bisa dipakai gratis atau dengan voucher." },
  { id: "finance-promo", since: "0.1.40", section: "finance", financeSubtab: "promo", title: "Voucher & promosi", body: "Buat kode voucher untuk diskon atau sesi gratis, lalu cetak atau bagikan ke customer." },
  { id: "finance-withdraw", since: "0.1.40", section: "finance", financeSubtab: "withdraw", title: "Saldo & penarikan", body: "Lihat saldo dari pembayaran QRIS dan ajukan penarikan ke rekening kamu. Kebijakan jeda dan batas penarikan tampil di panel ini." },
  { id: "crm", since: "0.1.40", section: "crm", title: "Pelanggan / CRM", body: "Semua customer di satu tempat: hubungi lewat WhatsApp, beri catatan dan label, dan lihat riwayat sesinya." },
  { id: "traffic", since: "0.1.40", section: "traffic", title: "Traffic", body: "Jumlah sesi dan performa booth per hari, supaya kamu tahu jam ramai dan paket yang paling laku." },
  { id: "media", since: "0.1.40", section: "media", title: "Database Foto & Video", body: "Semua foto, GIF, dan video dari setiap sesi. Unduh, cetak ulang, atau kirim ulang ke customer." },
  { id: "frames", since: "0.1.40", section: "monitor", title: "Kelola Frame", body: "Menu “Kelola Frame” di sidebar adalah tempat mengunggah dan menyusun frame (bingkai foto) yang dipilih customer." },
  { id: "offline-mode", since: "0.1.40", section: "kiosk", kioskSubtab: "printer", title: "Internet putus? Sesi tetap jalan", body: "Foto disimpan di komputer booth lalu dikirim otomatis saat internet kembali. Pembayaran tunai saat offline butuh PIN petugas, jadi atur PIN di Kiosk → Akses operator. Sesi offline tampil sebagai “Offline (cek manual)” di Transaksi. Pengaturannya ada di Kiosk → Printer → Offline Mode." },
  { id: "phone", since: "0.1.40", section: "monitor", title: "Admin di HP", body: "Tombol “Luncurkan di HP” di menu samping membuat QR sekali pakai. Pindai dengan HP dan Admin langsung terbuka tanpa login, lalu HP itu tetap masuk selama 30 hari." },
];

const seenKey = (tenantId: string) => `studiodo-tour-seen:${tenantId || "-"}`;

export function readSeenTourSteps(tenantId: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(seenKey(tenantId)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function markTourSeen(tenantId: string) {
  try { localStorage.setItem(seenKey(tenantId), JSON.stringify(TOUR_STEPS.map((s) => s.id))); } catch { /* the tour just shows again next time */ }
}

/** What to show automatically: everything for a first-timer, only the new steps for someone who finished the tour before, nothing otherwise. */
export function pendingTour(tenantId: string): { mode: "welcome" | "whatsnew"; steps: TourStep[] } | null {
  const seen = readSeenTourSteps(tenantId);
  if (seen.length === 0) return { mode: "welcome", steps: TOUR_STEPS };
  const fresh = TOUR_STEPS.filter((s) => !seen.includes(s.id));
  return fresh.length ? { mode: "whatsnew", steps: fresh } : null;
}
