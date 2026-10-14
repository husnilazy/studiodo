import type { Deck } from "./types.js";
import { MORE_DECKS } from "./decks_more.js";
import { BATCH3_DECKS } from "./decks_batch3.js";
import { BATCH4_DECKS } from "./decks_batch4.js";

const TAGS = ["#studiodo", "#photobooth", "#bisnisphotobooth", "#photoboothindonesia", "#usahaphotobooth", "#selfphotostudio"];

// Phase-1 decks. Every claim maps to a real feature in the app / landing page (featureData.ts). Edit freely in the UI;
// edits are stored separately, so "Reset" always brings these back.
export const BUILTIN_DECKS: Deck[] = [
  {
    id: "carousel-bayar-qris",
    title: "Carousel · Bayar QRIS otomatis",
    format: "carousel",
    tone: "light",
    handle: "studiodo.id",
    caption:
      "Masih ada customer yang harus nunggu kamu cek mutasi dulu baru boleh foto? 😅\n\nDengan STUDIODO, QRIS muncul langsung di layar kiosk. Begitu dibayar, sesi foto otomatis jalan, tanpa operator, tanpa antre di kasir.\n\n✅ QRIS otomatis di layar kiosk\n✅ Pakai payment gateway kamu sendiri (Xendit atau DOKU)\n✅ Voucher & kode promo per event\n✅ Saldo & penarikan dana dari dashboard\n\nGeser buat lihat alurnya →\nCoba gratis di studiodo.id (link di bio)",
    hashtags: [...TAGS, "#qris", "#photoboothqris"],
    slides: [
      { kind: "cover", eyebrow: "Pembayaran photobooth", title: "Scan, bayar,|*langsung foto.*", body: "QRIS otomatis di layar kiosk. Tanpa operator, tanpa cek mutasi manual.", mockup: "qris" },
      { kind: "compare", eyebrow: "Sebelum vs sesudah", title: "Bayar tidak perlu *ribet* lagi", itemsBefore: ["Cek mutasi satu per satu", "Customer menunggu konfirmasi", "Salah hitung kembalian", "Harus ada yang jaga"], items: ["QRIS tampil di layar kiosk", "Terkonfirmasi otomatis", "Nominal pas, tercatat rapi", "Booth jalan sendiri"] },
      { kind: "feature", eyebrow: "Gateway sendiri", title: "Uangnya masuk ke *rekening kamu*", body: "Hubungkan akun Xendit atau DOKU milikmu. Saldo dan penarikan dana bisa dipantau dari dashboard.", mockup: "dashboard", note: "Transaksi masuk tercatat *real-time*" },
      { kind: "feature", eyebrow: "Promo", title: "Voucher & kode promo *per event*", body: "Buat kode untuk wedding, gathering, atau kampanye. Gratis atau diskon, kamu yang atur.", mockup: "booth", note: "Paket dan harga fleksibel, termasuk *gratis*" },
      { kind: "steps", eyebrow: "Cara kerja", title: "Tiga langkah, *selesai*", items: ["Customer pilih paket di kiosk", "Scan QRIS, bayar", "Sesi foto otomatis dimulai"] },
      { kind: "cta", tone: "dark", eyebrow: "Mulai sekarang", title: "Siap bikin booth yang *jalan sendiri?*", body: "Daftar gratis dan coba semua fitur pembayarannya.", mockup: "none" },
    ],
  },
  {
    id: "carousel-dashboard-realtime",
    title: "Carousel · Dashboard & monitor booth",
    format: "carousel",
    tone: "dark",
    handle: "studiodo.id",
    caption:
      "Punya lebih dari satu booth tapi laporan masih lewat chat? 📲\n\nSatu akun STUDIODO bisa pantau semua kiosk: status online, omzet harian, riwayat transaksi, sampai notifikasi langsung di dashboard.\n\n📊 Grafik omzet harian\n🟢 Monitor status booth real-time\n🧾 Riwayat transaksi + ekspor CSV\n🔔 Notifikasi di dashboard\n\nSimpan postingan ini kalau kamu lagi mikirin cara kelola banyak booth.\nstudiodo.id (link di bio)",
    hashtags: [...TAGS, "#dashboard", "#manajemenbooth"],
    slides: [
      { kind: "cover", eyebrow: "Dashboard STUDIODO", title: "Lihat semua booth|dalam *satu layar.*", body: "Omzet, transaksi, dan status kiosk, real-time.", mockup: "dashboard" },
      { kind: "feature", eyebrow: "Monitor", title: "Tahu booth mana yang *online*", body: "Status setiap kiosk terpantau langsung. Ada yang mati, kamu tahu lebih dulu dari customer.", mockup: "hub", note: "Satu akun untuk *banyak kiosk*" },
      { kind: "stat", eyebrow: "Fitur lengkap", title: "Semua yang dibutuhkan|operasional booth", stat: { value: 44, suffix: "+", label: "fitur dalam satu platform" }, body: "Dari kasir, antrian, pembayaran, kamera, sampai galeri hasil.", tone: "indigo" },
      { kind: "steps", eyebrow: "Yang bisa kamu pantau", title: "Dari satu *dashboard*", items: ["Grafik omzet harian", "Riwayat transaksi & ekspor CSV", "Notifikasi langsung di dashboard", "Tampil di direktori booth publik"] },
      { kind: "cta", tone: "indigo", eyebrow: "Coba gratis", title: "Kelola booth tanpa *pusing laporan*", body: "Daftar di studiodo.id dan pasang kiosk pertamamu.", mockup: "none" },
    ],
  },
  {
    id: "carousel-hasil-digital",
    title: "Carousel · Hasil digital & galeri QR",
    format: "carousel",
    tone: "mint",
    handle: "studiodo.id",
    caption:
      "Customer foto, pulang, lalu minta hasilnya dikirim satu-satu lewat WhatsApp? Capek 😮‍💨\n\nDi STUDIODO, hasil foto, GIF, dan video otomatis masuk galeri cloud. Customer tinggal scan QR di layar, lalu unduh sendiri.\n\n📱 Galeri bermerek dengan QR\n🎞️ Foto, GIF, dan video dalam satu sesi\n💬 Kirim lewat WhatsApp & email\n📇 Data pelanggan untuk follow-up\n\nHasil lebih cepat sampai, kamu lebih ringan.\nstudiodo.id (link di bio)",
    hashtags: [...TAGS, "#galerifoto", "#photoboothevent"],
    slides: [
      { kind: "cover", eyebrow: "Hasil digital", title: "Foto selesai,|customer *langsung unduh.*", body: "Galeri cloud dengan QR. Tidak perlu kirim satu-satu.", mockup: "gallery" },
      { kind: "steps", eyebrow: "Alurnya", title: "Dari foto sampai *di HP*", items: ["Sesi foto selesai di booth", "Customer scan QR di layar kiosk", "Unduh foto, GIF, dan video sendiri"] },
      { kind: "feature", eyebrow: "Satu sesi, banyak hasil", title: "Foto, GIF, dan *video* sekaligus", body: "Mode stop-motion, filter, dan stiker bawaan juga ada. Customer pulang dengan konten yang siap diposting.", mockup: "strip", note: "Mode cermin / asli untuk *hasil cetak*" },
      { kind: "feature", eyebrow: "Brand kamu", title: "Galeri dengan *identitas* booth kamu", body: "Halaman galeri bermerek dan data pelanggan untuk follow-up berikutnya.", mockup: "gallery", note: "Kirim hasil lewat *WhatsApp & email*" },
      { kind: "cta", tone: "light", eyebrow: "Mulai sekarang", title: "Bikin hasilnya *sampai lebih cepat*", body: "Coba gratis di studiodo.id.", mockup: "none" },
    ],
  },
  {
    id: "reel-dashboard-realtime",
    title: "Reel · Dashboard real-time (motion)",
    format: "reel",
    tone: "dark",
    handle: "studiodo.id",
    caption:
      "Lihat dan kelola transaksi photobooth secara real-time, dari satu dashboard. 📊\n\nQRIS, voucher, galeri, sampai status kiosk, semuanya terhubung.\n\nCoba gratis di studiodo.id (link di bio)",
    hashtags: [...TAGS, "#reels", "#motiongraphic"],
    slides: [
      { kind: "cover", seconds: 3.6, eyebrow: "STUDIODO Platform", title: "Kelola photobooth|*tanpa ribet.*", body: "Satu platform untuk kiosk, pembayaran, dan hasil.", mockup: "none" },
      { kind: "feature", seconds: 4.2, eyebrow: "Dashboard", title: "Lihat transaksi *real-time*", body: "Untuk transparansi dan efisiensi.", mockup: "hub" },
      { kind: "feature", seconds: 4.2, eyebrow: "Pembayaran", title: "QRIS langsung di *layar kiosk*", mockup: "qris" },
      { kind: "stat", seconds: 3.6, tone: "indigo", eyebrow: "Satu platform", title: "Semua fitur|dalam satu tempat", stat: { value: 44, suffix: "+", label: "fitur lengkap" } },
      { kind: "cta", seconds: 3.4, tone: "dark", eyebrow: "Mulai sekarang", title: "Coba *gratis* di studiodo.id", mockup: "none" },
    ],
  },
  ...MORE_DECKS,
  ...BATCH3_DECKS,
  ...BATCH4_DECKS,
];

export type Idea = { pillar: string; title: string; hook: string; format: "carousel" | "reel"; source: string; deckId?: string };

// Backlog mined from the landing page's feature groups + app features. Turn any of these into a deck.
const RAW_IDEAS: Idea[] = [
  { pillar: "Pembayaran", format: "carousel", title: "QRIS otomatis di layar kiosk", hook: "Customer bayar, sesi langsung jalan", source: "QRIS otomatis · built (carousel-bayar-qris)" },
  { pillar: "Pembayaran", format: "carousel", title: "Pakai gateway sendiri: Xendit atau DOKU", hook: "Uang masuk ke rekening kamu, bukan ke platform", source: "Pembayaran → payment gateway sendiri" },
  { pillar: "Pembayaran", format: "carousel", title: "Voucher & kode promo per event", hook: "Wedding, gathering, kampanye: promo beres dari dashboard", source: "Voucher dan kode promo per event" },
  { pillar: "Pembayaran", format: "reel", title: "Saldo & penarikan dana", hook: "Tarik dana dari dashboard tanpa ribet", source: "Saldo dan penarikan dana" },
  { pillar: "Kasir", format: "carousel", title: "Kasir satu layar: paket, cetak tambahan, produk", hook: "Semua penjualan booth di satu layar", source: "Kasir satu layar" },
  { pillar: "Kasir", format: "carousel", title: "Antrian digital: panggil berikutnya", hook: "Nomor antrian harian, tanpa teriak-teriak", source: "Antrian digital" },
  { pillar: "Kasir", format: "carousel", title: "Shift kasir: modal, hitung laci, selisih kas", hook: "Selisih kas ketahuan hari itu juga", source: "Shift kasir" },
  { pillar: "Kasir", format: "carousel", title: "Refund per item dengan PIN supervisor", hook: "Refund aman, tidak bisa sembarang orang", source: "Refund per item" },
  { pillar: "Kasir", format: "carousel", title: "Struk dengan kop sendiri", hook: "Struk yang kelihatan profesional", source: "Struk yang bisa dicetak" },
  { pillar: "Kasir", format: "carousel", title: "Laporan harian & item terlaris", hook: "Tahu paket apa yang paling laku", source: "Laporan penjualan harian" },
  { pillar: "Pengalaman booth", format: "reel", title: "Foto, GIF, dan video dalam satu sesi", hook: "Satu sesi, tiga jenis konten", source: "Foto, GIF, dan video" },
  { pillar: "Pengalaman booth", format: "reel", title: "Mode stop-motion", hook: "Konten yang bikin customer share", source: "Mode stop-motion" },
  { pillar: "Pengalaman booth", format: "carousel", title: "Screen Builder: tampilan kiosk sesuai brand", hook: "Kiosk kamu, identitas kamu", source: "Screen Builder" },
  { pillar: "Pengalaman booth", format: "carousel", title: "Gaya kiosk: sekali pilih, tampilan berubah", hook: "Ganti suasana booth tanpa desain ulang", source: "Gaya kiosk system" },
  { pillar: "Pengalaman booth", format: "carousel", title: "Mode cermin vs asli untuk hasil cetak", hook: "Kenapa foto cetak kadang terbalik?", source: "Mirror/Asli toggle" },
  { pillar: "Pengalaman booth", format: "carousel", title: "Frame kustom & marketplace template", hook: "Setiap event punya frame sendiri", source: "Frame kustom, marketplace template" },
  { pillar: "Pengalaman booth", format: "carousel", title: "Portrait atau landscape, bebas", hook: "Booth kamu, orientasi kamu", source: "Orientasi portrait dan landscape" },
  { pillar: "Hasil digital", format: "carousel", title: "Galeri cloud dengan QR", hook: "Customer unduh sendiri, kamu tidak kirim satu-satu", source: "built (carousel-hasil-digital)" },
  { pillar: "Hasil digital", format: "carousel", title: "Data pelanggan untuk follow-up", hook: "Dari customer sekali foto jadi pelanggan tetap", source: "Data pelanggan untuk follow-up" },
  { pillar: "Operasional", format: "carousel", title: "Dashboard & monitor booth real-time", hook: "Lihat semua booth dalam satu layar", source: "built (carousel-dashboard-realtime)" },
  { pillar: "Operasional", format: "carousel", title: "Satu akun untuk banyak kiosk", hook: "Dari 1 booth ke 10 booth tanpa ganti sistem", source: "Satu akun untuk banyak kiosk" },
  { pillar: "Operasional", format: "carousel", title: "Tampil di direktori booth publik", hook: "Biar calon customer menemukan booth kamu", source: "Tampil di direktori booth publik" },
  { pillar: "Kamera & cetak", format: "carousel", title: "Webcam atau DSLR/mirrorless", hook: "Kamera bagus saja belum cukup, aturannya juga", source: "digiCamControl" },
  { pillar: "Kamera & cetak", format: "carousel", title: "Atur ISO, shutter, aperture dari dashboard", hook: "Hasil foto terlalu gelap? Atur tanpa ke lokasi", source: "Live camera control" },
  { pillar: "Kamera & cetak", format: "carousel", title: "Printer apa saja yang punya driver Windows", hook: "Tidak harus beli printer tertentu", source: "Printer apa saja" },
  { pillar: "Kamera & cetak", format: "carousel", title: "Cetak strip, grid, atau satu foto", hook: "Satu booth, banyak format cetak", source: "Cetak strip, grid, atau satu foto" },
  { pillar: "Andal & terbuka", format: "carousel", title: "Sesi tetap tersimpan saat internet putus", hook: "Internet mati di tengah event? Aman.", source: "Sesi tetap tersimpan saat internet putus" },
  { pillar: "Andal & terbuka", format: "carousel", title: "Update aplikasi otomatis, bisa diatur per kiosk", hook: "Kiosk selalu terbaru tanpa datang ke lokasi", source: "Auto-update per kiosk" },
  { pillar: "Andal & terbuka", format: "carousel", title: "Lisensi per booth, tambah kapan saja", hook: "Bayar sesuai jumlah booth yang kamu pakai", source: "Lisensi per booth" },
  { pillar: "Kreator", format: "carousel", title: "Jadi kreator, jual desain frame", hook: "Punya skill desain? Frame kamu bisa menghasilkan", source: "Marketplace template dari kreator" },
  { pillar: "Edukasi", format: "carousel", title: "Mau mulai usaha photobooth? Checklist awalnya", hook: "Sistem, pembayaran, kamera, printer: apa saja yang perlu?", source: "Edukasi bisnis" },
  { pillar: "Edukasi", format: "carousel", title: "5 kesalahan owner photobooth baru", hook: "Nomor 3 sering bikin rugi diam-diam", source: "Edukasi bisnis" },
  { pillar: "Edukasi", format: "carousel", title: "Cara menentukan harga paket foto", hook: "Terlalu murah rugi, terlalu mahal sepi", source: "Edukasi bisnis" },
  { pillar: "Edukasi", format: "carousel", title: "Booth event vs booth tetap: bedanya apa?", hook: "Model bisnis yang cocok untuk modalmu", source: "Edukasi bisnis" },
  { pillar: "Promosi", format: "reel", title: "Behind the scene: satu hari di booth", hook: "Dari customer datang sampai omzet tercatat", source: "Butuh aset foto/video asli" },
  { pillar: "Promosi", format: "carousel", title: "Testimoni owner booth", hook: "Cerita nyata pengguna STUDIODO", source: "Butuh testimoni asli dari pengguna" },
];

// Ideas already turned into a built-in deck (the editor marks them and can hide them).
const IDEA_DECK: Record<string, string> = {
  "QRIS otomatis di layar kiosk": "carousel-bayar-qris",
  "Pakai gateway sendiri: Xendit atau DOKU": "carousel-gateway-sendiri",
  "Voucher & kode promo per event": "carousel-voucher-event",
  "Saldo & penarikan dana": "reel-saldo-penarikan",
  "Kasir satu layar: paket, cetak tambahan, produk": "carousel-kasir-satu-layar",
  "Antrian digital: panggil berikutnya": "carousel-antrian-digital",
  "Shift kasir: modal, hitung laci, selisih kas": "carousel-shift-kasir",
  "Refund per item dengan PIN supervisor": "carousel-shift-kasir",
  "Struk dengan kop sendiri": "carousel-kasir-satu-layar",
  "Laporan harian & item terlaris": "carousel-kasir-satu-layar",
  "Foto, GIF, dan video dalam satu sesi": "reel-foto-gif-video",
  "Screen Builder: tampilan kiosk sesuai brand": "carousel-gaya-kiosk",
  "Gaya kiosk: sekali pilih, tampilan berubah": "carousel-gaya-kiosk",
  "Mode cermin vs asli untuk hasil cetak": "carousel-mirror-asli",
  "Frame kustom & marketplace template": "carousel-gaya-kiosk",
  "Galeri cloud dengan QR": "carousel-hasil-digital",
  "Data pelanggan untuk follow-up": "carousel-data-pelanggan",
  "Dashboard & monitor booth real-time": "carousel-dashboard-realtime",
  "Satu akun untuk banyak kiosk": "carousel-banyak-kiosk",
  "Mode stop-motion": "reel-stop-motion",
  "Portrait atau landscape, bebas": "carousel-portrait-landscape",
  "Tampil di direktori booth publik": "carousel-banyak-kiosk",
  "Webcam atau DSLR/mirrorless": "carousel-kamera-iso",
  "Atur ISO, shutter, aperture dari dashboard": "carousel-kamera-iso",
  "Printer apa saja yang punya driver Windows": "carousel-printer-cetak",
  "Cetak strip, grid, atau satu foto": "carousel-printer-cetak",
  "Sesi tetap tersimpan saat internet putus": "carousel-offline-aman",
  "Update aplikasi otomatis, bisa diatur per kiosk": "carousel-update-otomatis",
  "Lisensi per booth, tambah kapan saja": "carousel-banyak-kiosk",
  "Jadi kreator, jual desain frame": "carousel-kreator-marketplace",
  "Mau mulai usaha photobooth? Checklist awalnya": "carousel-checklist-mulai-usaha",
  "5 kesalahan owner photobooth baru": "carousel-kesalahan-owner-baru",
  "Cara menentukan harga paket foto": "carousel-menentukan-harga-paket",
  "Booth event vs booth tetap: bedanya apa?": "carousel-event-vs-tetap"
};
export const IDEA_BACKLOG: Idea[] = RAW_IDEAS.map((i) => ({ ...i, deckId: IDEA_DECK[i.title] }));
