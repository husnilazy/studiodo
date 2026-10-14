import type { Deck } from "./types.js";

const TAGS = ["#studiodo", "#photobooth", "#bisnisphotobooth", "#photoboothindonesia", "#usahaphotobooth"];
const H = "studiodo.id";

// Fourth batch: the launch / introduction series ("perkenalan"). Facts are limited to the landing page's feature groups.
export const BATCH4_DECKS: Deck[] = [
  {
    id: "carousel-perkenalan-studiodo", title: "Carousel · Perkenalan STUDIODO (launching)", format: "carousel", tone: "light", handle: H,
    caption: "Halo, kenalan dulu ya! Kami STUDIODO 👋\n\nPlatform photobooth yang mengurus kiosk, pembayaran QRIS, kasir, kamera, sampai galeri hasil, semuanya dari satu tempat.\n\n📸 Foto, GIF, dan video dalam satu sesi\n💳 QRIS otomatis di layar kiosk\n🧾 Kasir, antrian, dan laporan\n📊 Dashboard untuk semua booth\n\nIkuti akun ini untuk tips, fitur, dan update dari kami. Punya pertanyaan? Tulis di kolom komentar!\nstudiodo.id (link di bio)",
    hashtags: [...TAGS, "#perkenalan", "#launching"],
    slides: [
      { kind: "cover", eyebrow: "Halo, kami STUDIODO", title: "Platform photobooth,|*satu tempat untuk semuanya.*", body: "Kiosk, pembayaran, kasir, kamera, dan hasil digital.", mockup: "hub" },
      { kind: "compare", eyebrow: "Kenapa STUDIODO", title: "Kelola booth *tanpa ribet*", itemsBefore: ["Pembayaran dicek manual", "Antrian tidak teratur", "Hasil dikirim satu-satu", "Laporan tersebar di banyak tempat"], items: ["QRIS otomatis di kiosk", "Antrian digital", "Galeri dengan QR", "Dashboard satu tempat"] },
      { kind: "feature", eyebrow: "Untuk customer", title: "Pengalaman foto yang *mulus*", body: "Bayar QRIS di layar, pilih frame, foto, lalu hasil langsung ada di HP.", mockup: "booth", note: "Foto, GIF, dan video dalam *satu sesi*" },
      { kind: "feature", eyebrow: "Untuk pemilik booth", title: "Semua terpantau di *dashboard*", body: "Omzet, transaksi, dan status kiosk, real-time.", mockup: "dashboard", note: "Satu akun untuk *banyak kiosk*" },
      { kind: "stat", tone: "indigo", eyebrow: "Fitur lengkap", title: "Semua yang dibutuhkan|operasional booth", stat: { value: 44, suffix: "+", label: "fitur dalam satu platform" }, body: "Dari kasir, antrian, pembayaran, kamera, sampai galeri hasil." },
      { kind: "steps", eyebrow: "Mulai", title: "Tiga langkah *memulai*", items: ["Daftar akun di studiodo.id", "Pasang aplikasi kiosk di PC booth", "Atur paket, pembayaran, dan frame"] },
      { kind: "cta", tone: "dark", eyebrow: "Kenalan lebih dekat", title: "Ikuti kami untuk *tips dan update*", body: "Fitur baru, panduan, dan ide konten untuk bisnis photobooth.", mockup: "none" },
    ],
  },
  {
    id: "reel-perkenalan-studiodo", title: "Reel · Kenalan dengan STUDIODO (launching)", format: "reel", tone: "dark", handle: H,
    caption: "Kenalan dengan STUDIODO! 🎉\n\nSatu platform untuk kiosk photobooth: QRIS otomatis, dashboard real-time, dan hasil langsung di HP customer.\n\nIkuti untuk tips dan update fitur. Coba di studiodo.id (link di bio)",
    hashtags: [...TAGS, "#reels", "#perkenalan", "#launching"],
    slides: [
      { kind: "cover", seconds: 3.6, eyebrow: "Halo, kami", title: "STUDIODO,|*platform photobooth.*", body: "Satu tempat untuk semuanya.", mockup: "none" },
      { kind: "feature", seconds: 4.2, eyebrow: "Satu platform", title: "Semua *terhubung*", mockup: "hub" },
      { kind: "feature", seconds: 4.4, eyebrow: "Bayar", title: "QRIS di *layar kiosk*", mockup: "qris" },
      { kind: "feature", seconds: 4.2, eyebrow: "Pantau", title: "Dashboard *real-time*", mockup: "dashboard" },
      { kind: "feature", seconds: 4.0, eyebrow: "Hasil", title: "Langsung di *HP customer*", mockup: "gallery" },
      { kind: "cta", seconds: 3.4, tone: "indigo", eyebrow: "Ikuti kami", title: "Kenalan lebih dekat di *studiodo.id*", mockup: "none" },
    ],
  },
  {
    id: "carousel-fitur-lengkap", title: "Carousel · Fitur lengkap dalam satu platform", format: "carousel", tone: "mint", handle: H,
    caption: "Apa saja yang ada di STUDIODO? Ini ringkasannya 👇\n\n🧾 Kasir & antrian\n📸 Pengalaman booth\n💳 Pembayaran\n🖼️ Hasil digital\n📊 Operasional\n🖨️ Kamera & cetak\n🛡️ Andal & terbuka\n\nSimpan postingan ini supaya mudah dicari lagi. Fitur mana yang paling kamu butuhkan? Tulis di komentar!\nstudiodo.id (link di bio)",
    hashtags: [...TAGS, "#fiturlengkap", "#semuadalamsatu"],
    slides: [
      { kind: "cover", eyebrow: "Fitur STUDIODO", title: "Semua fitur,|*satu platform.*", body: "Geser untuk melihat ringkasannya.", mockup: "dashboard" },
      { kind: "steps", eyebrow: "Kasir & antrian", title: "Penjualan *rapi*", items: ["Kasir satu layar", "Tunai, QRIS, atau transfer", "Antrian digital", "Shift kasir & refund PIN"] },
      { kind: "steps", eyebrow: "Pengalaman booth", title: "Foto yang *seru*", items: ["Foto, GIF, dan video", "Mode stop-motion", "Filter dan stiker", "Screen Builder sesuai brand"] },
      { kind: "steps", eyebrow: "Pembayaran", title: "Uang masuk *otomatis*", items: ["QRIS di layar kiosk", "Xendit atau DOKU milikmu", "Voucher dan kode promo", "Saldo dan penarikan dana"] },
      { kind: "steps", eyebrow: "Hasil digital", title: "Hasil sampai *ke HP*", items: ["Galeri cloud dengan QR", "Halaman galeri bermerek", "Kirim lewat WhatsApp dan email", "Data pelanggan untuk follow-up"] },
      { kind: "steps", eyebrow: "Operasional", title: "Semua *terpantau*", items: ["Satu akun, banyak kiosk", "Monitor status real-time", "Riwayat transaksi + CSV", "Notifikasi di dashboard"] },
      { kind: "steps", eyebrow: "Kamera, cetak, andal", title: "Siap untuk *event*", items: ["Webcam atau DSLR/mirrorless", "Printer berdriver Windows", "Sesi aman saat internet putus", "Update otomatis per kiosk"] },
      { kind: "cta", tone: "dark", eyebrow: "Mulai sekarang", title: "Lihat sendiri di *studiodo.id*", body: "Fitur mana yang paling kamu tunggu? Tulis di komentar.", mockup: "none" },
    ],
  },
  {
    id: "carousel-untuk-siapa", title: "Carousel · STUDIODO untuk siapa?", format: "carousel", tone: "light", handle: H,
    caption: "STUDIODO dibuat untuk siapa saja yang ingin menjalankan photobooth dengan lebih rapi 🎯\n\n1️⃣ Kamu yang baru mulai usaha photobooth\n2️⃣ Pemilik banyak booth yang butuh satu dashboard\n3️⃣ Penyelenggara event yang butuh voucher dan frame kustom\n4️⃣ Kreator desain yang ingin menjual frame\n\nKamu yang mana? Tulis di komentar!\nstudiodo.id (link di bio)",
    hashtags: [...TAGS, "#untuksiapa", "#eventorganizer", "#kreator"],
    slides: [
      { kind: "cover", eyebrow: "Untuk siapa?", title: "STUDIODO dibuat|*untuk kamu yang...*", body: "Geser untuk mencari tahu yang mana kamu.", mockup: "none" },
      { kind: "feature", eyebrow: "1 · Baru mulai", title: "Mau buka *usaha photobooth*", body: "Sistem kiosk, pembayaran, dan laporan sudah siap pakai. Kamu fokus ke pelanggan.", mockup: "booth", note: "Checklist awal ada di postingan kami" },
      { kind: "feature", eyebrow: "2 · Banyak booth", title: "Punya *banyak booth*", body: "Satu akun, satu dashboard, status semua kiosk terpantau.", mockup: "hub", note: "Lisensi per booth, tambah *kapan saja*" },
      { kind: "feature", eyebrow: "3 · Event", title: "Sering pegang *event*", body: "Voucher per event, frame kustom, dan sesi tetap aman walau internet putus.", mockup: "dashboard", note: "Voucher & kode promo *per event*" },
      { kind: "feature", eyebrow: "4 · Kreator", title: "Jago *mendesain frame*", body: "Daftar jadi kreator dan kirim template frame ke marketplace.", mockup: "strip", note: "Template ditinjau tim sebelum tampil" },
      { kind: "cta", tone: "indigo", eyebrow: "Kamu yang mana?", title: "Tulis nomornya di *komentar*", body: "Kami akan bahas yang paling banyak dipilih.", mockup: "none" },
    ],
  },
  {
    id: "carousel-cara-mulai", title: "Carousel · Cara mulai dengan STUDIODO", format: "carousel", tone: "dark", handle: H,
    caption: "Mau mulai pakai STUDIODO? Ini alurnya 🚀\n\n1. Daftar akun di studiodo.id\n2. Pasang aplikasi kiosk di PC booth (Windows)\n3. Hubungkan kiosk ke akunmu\n4. Atur paket, pembayaran, dan frame\n5. Booth siap dipakai\n\nAda yang masih bingung di langkah tertentu? Tanyakan di komentar!\nstudiodo.id (link di bio)",
    hashtags: [...TAGS, "#caramulai", "#panduan"],
    slides: [
      { kind: "cover", eyebrow: "Panduan singkat", title: "Mulai dengan|*STUDIODO.*", body: "Dari daftar sampai booth siap dipakai.", mockup: "none" },
      { kind: "steps", eyebrow: "Alurnya", title: "Lima langkah *mulai*", items: ["Daftar akun di studiodo.id", "Pasang aplikasi kiosk (Windows)", "Hubungkan kiosk ke akunmu", "Atur paket, pembayaran, dan frame", "Booth siap dipakai"] },
      { kind: "feature", eyebrow: "Aplikasi kiosk", title: "Dipasang di *PC booth*", body: "Aplikasi kiosk berjalan di Windows dan update otomatis, bisa diatur per kiosk.", mockup: "booth", note: "Webcam atau *DSLR / mirrorless*" },
      { kind: "feature", eyebrow: "Pengaturan", title: "Atur dari *dashboard*", body: "Paket dan harga fleksibel, pembayaran QRIS, frame kustom, sampai tampilan kiosk.", mockup: "dashboard", note: "Voucher & kode promo *per event*" },
      { kind: "cta", tone: "light", eyebrow: "Siap mulai?", title: "Daftar di *studiodo.id*", body: "Ada pertanyaan soal langkah-langkahnya? Tulis di komentar.", mockup: "none" },
    ],
  },
  {
    id: "highlight-covers", title: "Cover Sorotan Instagram", format: "highlight", tone: "indigo", handle: H,
    caption: "Cover Sorotan (Highlights) Instagram, 1080x1920. Unggah satu per satu sebagai cover sorotan: Instagram memotong menjadi lingkaran di tengah, jadi ikon sudah berada di area aman. Ganti 'Tema dasar' di sebelah kanan untuk varian warna lain.",
    hashtags: [],
    slides: [
      { kind: "badge", title: "Kenalan", icon: "user" },
      { kind: "badge", title: "Fitur", icon: "grid" },
      { kind: "badge", title: "Cara Mulai", icon: "play" },
      { kind: "badge", title: "FAQ", icon: "help" },
      { kind: "badge", title: "Update", icon: "bell" },
      { kind: "badge", title: "Event", icon: "ticket" },
    ],
  },
];
