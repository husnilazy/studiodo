import type { Deck } from "./types.js";

const TAGS = ["#studiodo", "#photobooth", "#bisnisphotobooth", "#photoboothindonesia", "#usahaphotobooth"];
const H = "studiodo.id";
const CTA = (body: string, tone: Deck["tone"] = "dark", title = "Siap coba *sendiri?*") => ({ kind: "cta" as const, tone, eyebrow: "Mulai sekarang", title, body, mockup: "none" as const });

// Third batch: the rest of the backlog that needs no real-world assets. Claims map to landing-page features
// (featureData.ts) or are plain business advice with no invented numbers.
export const BATCH3_DECKS: Deck[] = [
  {
    id: "carousel-gateway-sendiri", title: "Carousel · Xendit/DOKU milik sendiri", format: "carousel", tone: "light", handle: H,
    caption: "Uang transaksi booth masuk ke mana? 🤔\n\nDi STUDIODO kamu bisa menghubungkan payment gateway milikmu sendiri (Xendit atau DOKU), jadi pembayaran QRIS dari kiosk tercatat rapi di dashboard dan kamu bisa memantau saldo serta penarikan dananya.\n\nTransparan, dan kamu yang pegang kendali.\nstudiodo.id (link di bio)",
    hashtags: [...TAGS, "#xendit", "#doku", "#qris"],
    slides: [
      { kind: "cover", eyebrow: "Pembayaran", title: "Pakai gateway|*milikmu sendiri.*", body: "Hubungkan Xendit atau DOKU, kendali tetap di kamu.", mockup: "dashboard" },
      { kind: "steps", eyebrow: "Alurnya", title: "Dari kiosk ke *dashboard*", items: ["Hubungkan akun Xendit atau DOKU", "Customer bayar QRIS di kiosk", "Transaksi tercatat di dashboard"] },
      { kind: "feature", eyebrow: "Saldo", title: "Pantau saldo dan *tarik dana*", body: "Saldo dan penarikan dana bisa dilihat langsung dari dashboard.", mockup: "dashboard", note: "Riwayat transaksi + ekspor *CSV*" },
      CTA("Hubungkan gateway kamu di studiodo.id.", "dark"),
    ],
  },
  {
    id: "reel-saldo-penarikan", title: "Reel · Saldo & penarikan dana", format: "reel", tone: "dark", handle: H,
    caption: "Cek saldo dan tarik dana photobooth langsung dari dashboard. 💸\n\nQRIS masuk, tercatat, dan siap ditarik.\n\nCoba gratis di studiodo.id (link di bio)",
    hashtags: [...TAGS, "#reels", "#penarikandana"],
    slides: [
      { kind: "cover", seconds: 3.4, eyebrow: "Keuangan booth", title: "Saldo booth,|*semua terlihat.*", body: "Dari dashboard, tanpa hitung manual.", mockup: "none" },
      { kind: "feature", seconds: 4.4, eyebrow: "Pembayaran", title: "QRIS masuk *otomatis*", mockup: "qris" },
      { kind: "feature", seconds: 4.4, eyebrow: "Dashboard", title: "Transaksi tercatat *real-time*", mockup: "dashboard" },
      { kind: "cta", seconds: 3.4, tone: "indigo", eyebrow: "Mulai sekarang", title: "Coba *gratis* di studiodo.id", mockup: "none" },
    ],
  },
  {
    id: "carousel-kasir-satu-layar", title: "Carousel · Kasir satu layar", format: "carousel", tone: "mint", handle: H,
    caption: "Booth jual paket foto, cetak tambahan, dan produk? Semuanya bisa lewat satu layar kasir 🧾\n\nTunai, QRIS, atau transfer dengan kembalian otomatis. Untuk paket yang dibayar di kasir, kode kiosk dibuat otomatis. Struk bisa dicetak dengan kop sendiri.\n\nstudiodo.id (link di bio)",
    hashtags: [...TAGS, "#kasir", "#posphotobooth"],
    slides: [
      { kind: "cover", eyebrow: "Kasir", title: "Semua penjualan|*satu layar kasir.*", body: "Paket foto, cetak tambahan, produk, dan item bebas.", mockup: "dashboard" },
      { kind: "steps", eyebrow: "Alurnya", title: "Dari pesanan ke *struk*", items: ["Pilih paket, cetak tambahan, atau produk", "Terima tunai, QRIS, atau transfer", "Kode kiosk dibuat otomatis, struk dicetak"] },
      { kind: "feature", eyebrow: "Pembayaran", title: "Kembalian *dihitung otomatis*", body: "Tunai, QRIS, atau transfer. Struk bisa dicetak dengan kop sendiri.", mockup: "qris", note: "Laporan penjualan harian dan *item terlaris*" },
      CTA("Coba kasir STUDIODO gratis.", "light"),
    ],
  },
  {
    id: "carousel-shift-kasir", title: "Carousel · Shift kasir & selisih kas", format: "carousel", tone: "dark", handle: H,
    caption: "Selisih kas baru ketahuan di akhir bulan? Telat 😮‍💨\n\nDengan shift kasir STUDIODO: catat modal awal, hitung laci saat tutup, dan selisih kas langsung terlihat hari itu juga. Refund per item pun butuh PIN supervisor, jadi tidak bisa sembarangan.\n\nstudiodo.id (link di bio)",
    hashtags: [...TAGS, "#shiftkasir", "#kontrolkeuangan"],
    slides: [
      { kind: "cover", eyebrow: "Kontrol kas", title: "Selisih kas|*ketahuan hari itu juga.*", body: "Shift kasir lengkap dengan hitung laci.", mockup: "dashboard" },
      { kind: "steps", eyebrow: "Alur shift", title: "Tiga langkah *per shift*", items: ["Buka shift dengan modal awal", "Layani transaksi seperti biasa", "Tutup shift, hitung laci, lihat selisih"] },
      { kind: "feature", eyebrow: "Refund aman", title: "Refund per item butuh *PIN supervisor*", body: "Supaya refund tidak bisa dilakukan sembarang orang.", mockup: "queue", note: "Semua tercatat di *riwayat transaksi*" },
      { kind: "compare", eyebrow: "Sebelum vs sesudah", title: "Kas lebih *transparan*", itemsBefore: ["Hitung kas manual", "Selisih ketahuan telat", "Refund tanpa kontrol"], items: ["Modal awal tercatat", "Selisih terlihat langsung", "Refund dengan PIN supervisor"] },
      CTA("Rapikan kas booth kamu. Coba gratis.", "indigo"),
    ],
  },
  {
    id: "reel-foto-gif-video", title: "Reel · Foto, GIF, dan video satu sesi", format: "reel", tone: "indigo", handle: H,
    caption: "Satu sesi, tiga jenis konten. 📸🎞️🎬\n\nFoto, GIF, dan video dari satu sesi booth, plus mode stop-motion, filter, dan stiker. Customer pulang dengan konten yang siap diposting.\n\nCoba gratis di studiodo.id (link di bio)",
    hashtags: [...TAGS, "#reels", "#stopmotion", "#gifbooth"],
    slides: [
      { kind: "cover", seconds: 3.4, eyebrow: "Pengalaman booth", title: "Satu sesi,|*tiga jenis konten.*", body: "Foto, GIF, dan video.", mockup: "none" },
      { kind: "feature", seconds: 4.2, eyebrow: "Sesi foto", title: "Countdown, lalu *klik*", mockup: "booth" },
      { kind: "feature", seconds: 4.2, eyebrow: "Hasil cetak", title: "Strip foto *siap cetak*", mockup: "strip" },
      { kind: "feature", seconds: 4.0, eyebrow: "Hasil digital", title: "Foto, GIF, video *di HP*", mockup: "gallery" },
      { kind: "cta", seconds: 3.4, tone: "dark", eyebrow: "Mulai sekarang", title: "Coba *gratis* di studiodo.id", mockup: "none" },
    ],
  },
  {
    id: "carousel-mirror-asli", title: "Carousel · Mode cermin vs asli", format: "carousel", tone: "light", handle: H,
    caption: "Pernah foto di booth yang tulisan di bajunya kebalik? 😅\n\nLive view biasanya tampil seperti cermin, tapi hasil cetak bisa dibuat mengikuti tampilan cermin itu atau tampilan asli. Di STUDIODO kamu tinggal pilih Mirror atau Asli.\n\nsimpan buat referensi setting booth kamu.\nstudiodo.id (link di bio)",
    hashtags: [...TAGS, "#tipsphotobooth", "#mirror"],
    slides: [
      { kind: "cover", eyebrow: "Tips booth", title: "Foto cetak kok|*kadang terbalik?*", body: "Ini soal mode cermin dan mode asli.", mockup: "booth" },
      { kind: "compare", eyebrow: "Dua pilihan", title: "Mirror atau *Asli*", labelBefore: "Mirror", labelAfter: "Asli", itemsBefore: ["Hasil cetak mengikuti tampilan cermin di layar", "Terasa natural saat berpose"], items: ["Hasil cetak persis seperti dilihat orang lain", "Teks di baju tetap terbaca benar"] },
      { kind: "feature", eyebrow: "Pengaturan", title: "Pilih *satu kali*, berlaku di semua sesi", body: "Atur sekali, hasil cetak konsisten untuk setiap customer.", mockup: "strip", note: "Hasil cetak bisa *Mirror* atau *Asli*" },
      CTA("Atur mode hasil cetak kamu di STUDIODO.", "mint"),
    ],
  },
  {
    id: "carousel-data-pelanggan", title: "Carousel · Data pelanggan & follow-up", format: "carousel", tone: "mint", handle: H,
    caption: "Customer sekali foto, lalu hilang? 🕵️\n\nSTUDIODO menyimpan data pelanggan untuk follow-up, dan hasil bisa dikirim lewat WhatsApp serta email. Dari sekali foto, jadi pelanggan tetap.\n\nstudiodo.id (link di bio)",
    hashtags: [...TAGS, "#crm", "#followup", "#pelanggantetap"],
    slides: [
      { kind: "cover", eyebrow: "Hasil digital", title: "Sekali foto,|*jadi pelanggan tetap.*", body: "Data pelanggan untuk follow-up berikutnya.", mockup: "gallery" },
      { kind: "steps", eyebrow: "Alurnya", title: "Dari booth ke *relasi*", items: ["Customer foto di booth", "Hasil dikirim lewat WhatsApp atau email", "Data tersimpan untuk follow-up"] },
      { kind: "feature", eyebrow: "Kirim hasil", title: "WhatsApp dan *email*", body: "Customer menerima hasil tanpa kamu kirim satu-satu.", mockup: "gallery", note: "Halaman galeri *bermerek*" },
      CTA("Kenali pelanggan boothmu. Coba gratis.", "light"),
    ],
  },
  {
    id: "carousel-banyak-kiosk", title: "Carousel · Dari 1 booth ke banyak", format: "carousel", tone: "dark", handle: H,
    caption: "Booth pertama sudah jalan, mau tambah booth kedua dan ketiga? 🚀\n\nSatu akun STUDIODO bisa mengelola banyak kiosk. Status booth terpantau real-time, lisensi dihitung per booth, dan bisa ditambah kapan saja. Booth kamu juga bisa tampil di direktori booth publik.\n\nstudiodo.id (link di bio)",
    hashtags: [...TAGS, "#scaleup", "#multibooth"],
    slides: [
      { kind: "cover", eyebrow: "Skala usaha", title: "Dari satu booth|*ke banyak booth.*", body: "Tanpa ganti sistem.", mockup: "hub" },
      { kind: "feature", eyebrow: "Satu akun", title: "Banyak kiosk, *satu dashboard*", body: "Status setiap booth terpantau real-time dari satu tempat.", mockup: "dashboard", note: "Notifikasi langsung di *dashboard*" },
      { kind: "steps", eyebrow: "Lisensi", title: "Bayar sesuai jumlah *booth*", items: ["Mulai dari satu booth", "Lisensi dihitung per booth", "Tambah booth kapan saja saat usaha tumbuh"] },
      { kind: "feature", eyebrow: "Direktori", title: "Tampil di direktori *booth publik*", body: "Biar calon customer menemukan booth kamu.", mockup: "hub" },
      CTA("Siap menambah booth? Mulai dari satu.", "indigo"),
    ],
  },
  {
    id: "carousel-printer-cetak", title: "Carousel · Printer & format cetak", format: "carousel", tone: "light", handle: H,
    caption: "Harus beli printer tertentu supaya booth bisa jalan? Tidak di STUDIODO 🖨️\n\nPrinter apa saja yang punya driver Windows bisa dipakai. Cetak strip, grid, atau satu foto, dan hasil cetak bisa Mirror atau Asli.\n\nstudiodo.id (link di bio)",
    hashtags: [...TAGS, "#printerphotobooth", "#cetakfoto"],
    slides: [
      { kind: "cover", eyebrow: "Cetak", title: "Printer apa saja,|*selama ada driver Windows.*", body: "Tidak terkunci ke satu merek.", mockup: "strip" },
      { kind: "steps", eyebrow: "Format cetak", title: "Tiga pilihan *cetak*", items: ["Strip foto", "Grid beberapa foto", "Satu foto besar"] },
      { kind: "feature", eyebrow: "Cetak tambahan", title: "Cetak tambahan *berbayar*", body: "Customer bisa menambah cetakan, dan kasir mencatatnya otomatis.", mockup: "qris", note: "Mode cermin / asli untuk *hasil cetak*" },
      CTA("Pakai printer yang kamu punya. Coba gratis.", "dark"),
    ],
  },
  {
    id: "carousel-update-otomatis", title: "Carousel · Update otomatis per kiosk", format: "carousel", tone: "mint", handle: H,
    caption: "Update aplikasi booth harus datang ke lokasi? Ribet 🔧\n\nKiosk STUDIODO mengecek versi baru secara berkala dan memasangnya otomatis. Kamu juga bisa mengatur auto-update per kiosk dari dashboard.\n\nstudiodo.id (link di bio)",
    hashtags: [...TAGS, "#autoupdate", "#maintenance"],
    slides: [
      { kind: "cover", eyebrow: "Andal", title: "Kiosk selalu terbaru,|*tanpa datang ke lokasi.*", body: "Update otomatis, bisa diatur per kiosk.", mockup: "hub" },
      { kind: "steps", eyebrow: "Cara kerja", title: "Tiga langkah *otomatis*", items: ["Kiosk mengecek versi baru berkala", "Versi baru diunduh di latar belakang", "Terpasang saat aplikasi dibuka ulang"] },
      { kind: "feature", eyebrow: "Kendali", title: "Atur *per kiosk*", body: "Mau update otomatis di semua booth atau hanya sebagian? Kamu yang tentukan dari dashboard.", mockup: "dashboard", note: "Status kiosk terpantau *real-time*" },
      CTA("Kurangi kunjungan ke lokasi. Coba gratis.", "light"),
    ],
  },
  {
    id: "carousel-kesalahan-owner-baru", title: "Carousel · 5 kesalahan owner baru", format: "carousel", tone: "dark", handle: H,
    caption: "Lima kesalahan yang sering terjadi di awal usaha photobooth, dan cara menghindarinya. 🚫\n\nSimpan dulu, baca ulang sebelum beli alat. Bagikan ke teman yang lagi mau mulai!\nstudiodo.id (link di bio)",
    hashtags: [...TAGS, "#tipsusaha", "#pemulabisnis"],
    slides: [
      { kind: "cover", eyebrow: "Edukasi", title: "5 kesalahan|*owner photobooth baru.*", body: "Sebelum kamu beli alat, baca ini dulu.", mockup: "none" },
      { kind: "steps", eyebrow: "Lima kesalahan", title: "Hindari *lima* ini", items: ["Beli alat dulu, hitung belakangan", "Pembayaran masih manual", "Tidak punya frame yang beda", "Tidak memantau booth saat event", "Tidak menyimpan data pelanggan"] },
      { kind: "feature", eyebrow: "Solusinya", title: "Satu sistem untuk *menutup celahnya*", body: "QRIS otomatis, frame kustom, monitor booth, dan data pelanggan, semua dari satu platform.", mockup: "dashboard", note: "Semua dalam *satu platform*" },
      CTA("Mulai dengan sistem yang tepat.", "indigo"),
    ],
  },
  {
    id: "carousel-menentukan-harga-paket", title: "Carousel · Cara menentukan harga paket", format: "carousel", tone: "light", handle: H,
    caption: "Terlalu murah rugi, terlalu mahal sepi. Lalu harga paket foto idealnya berapa? 🤷\n\nKerangka sederhana buat kamu: hitung biaya, tentukan paket, lalu uji. Dan di STUDIODO harga paket bisa kamu atur sendiri, termasuk paket gratis dan voucher untuk event.\n\nstudiodo.id (link di bio)",
    hashtags: [...TAGS, "#hargapaket", "#strategibisnis"],
    slides: [
      { kind: "cover", eyebrow: "Edukasi", title: "Harga paket foto,|*berapa idealnya?*", body: "Kerangka sederhana, tanpa tebak-tebakan.", mockup: "none" },
      { kind: "steps", eyebrow: "Kerangka", title: "Empat langkah *menentukan harga*", items: ["Hitung biaya cetak dan operasional", "Tentukan paket: strip, grid, cetak tambahan", "Pasang harga, lalu pantau paket terlaris", "Atur ulang harga dan promo sesuai data"] },
      { kind: "feature", eyebrow: "Di STUDIODO", title: "Harga paket *bebas diatur*", body: "Paket dan harga fleksibel, termasuk gratis. Laporan harian menunjukkan item terlaris.", mockup: "dashboard", note: "Voucher untuk *event* ada juga" },
      CTA("Atur harga paketmu di studiodo.id.", "mint"),
    ],
  },
  {
    id: "carousel-event-vs-tetap", title: "Carousel · Booth event vs booth tetap", format: "carousel", tone: "mint", handle: H,
    caption: "Booth event atau booth tetap, mana yang cocok buat modalmu? 🧭\n\nKeduanya punya ritme dan kebutuhan berbeda. Booth event butuh voucher dan frame kustom, booth tetap butuh kasir, antrian, dan laporan harian. STUDIODO mendukung keduanya.\n\nstudiodo.id (link di bio)",
    hashtags: [...TAGS, "#boothevent", "#boothtetap", "#modalusaha"],
    slides: [
      { kind: "cover", eyebrow: "Edukasi", title: "Booth event atau|*booth tetap?*", body: "Pilih model usaha yang cocok dengan modalmu.", mockup: "none" },
      { kind: "compare", eyebrow: "Perbandingan", title: "Beda *ritme*, beda kebutuhan", labelBefore: "Booth event", labelAfter: "Booth tetap", itemsBefore: ["Disewa per acara", "Butuh voucher dan frame kustom", "Pindah lokasi tiap acara"], items: ["Pelanggan harian", "Butuh kasir, antrian, laporan", "Satu lokasi, jam operasional"] },
      { kind: "feature", eyebrow: "Dukungan", title: "STUDIODO *mendukung keduanya*", body: "Voucher dan frame kustom untuk event, kasir dan antrian untuk booth tetap.", mockup: "queue", note: "Satu akun untuk *banyak kiosk*" },
      CTA("Tentukan model usahamu, sistemnya sudah siap.", "dark"),
    ],
  },
  {
    id: "reel-stop-motion", title: "Reel · Mode stop-motion", format: "reel", tone: "mint", handle: H,
    caption: "Konten yang bikin customer mau share: stop-motion! 🎞️\n\nSelain foto dan GIF, booth STUDIODO punya mode stop-motion. Customer berpose beberapa kali, hasilnya jadi video singkat yang langsung bisa diunduh dari galeri.\n\nCoba gratis di studiodo.id (link di bio)",
    hashtags: [...TAGS, "#reels", "#stopmotion", "#kontenbooth"],
    slides: [
      { kind: "cover", seconds: 3.4, eyebrow: "Mode stop-motion", title: "Pose, pose,|*jadi video.*", body: "Konten yang customer senang bagikan.", mockup: "none" },
      { kind: "feature", seconds: 4.2, eyebrow: "1 · Berpose", title: "Countdown, lalu *gaya!*", mockup: "booth" },
      { kind: "feature", seconds: 4.2, eyebrow: "2 · Hasil", title: "Jadi *video singkat*", mockup: "strip" },
      { kind: "feature", seconds: 4.0, eyebrow: "3 · Unduh", title: "Langsung di *HP customer*", mockup: "gallery" },
      { kind: "cta", seconds: 3.4, tone: "dark", eyebrow: "Mulai sekarang", title: "Coba *gratis* di studiodo.id", mockup: "none" },
    ],
  },
  {
    id: "carousel-portrait-landscape", title: "Carousel · Portrait atau landscape", format: "carousel", tone: "light", handle: H,
    caption: "Booth kamu berdiri tegak atau layarnya lebar? 📐\n\nSTUDIODO mendukung orientasi portrait dan landscape, jadi tampilan kiosk bisa disesuaikan dengan bentuk booth dan kebutuhan eventmu. Tampilannya pun bisa diatur lewat Screen Builder.\n\nstudiodo.id (link di bio)",
    hashtags: [...TAGS, "#portrait", "#landscape", "#desainbooth"],
    slides: [
      { kind: "cover", eyebrow: "Tampilan kiosk", title: "Portrait atau|*landscape?*", body: "Dua-duanya didukung.", mockup: "booth" },
      { kind: "compare", eyebrow: "Dua orientasi", title: "Pilih yang *cocok dengan boothmu*", labelBefore: "Portrait", labelAfter: "Landscape", itemsBefore: ["Berdiri tegak, hemat tempat", "Pas untuk strip foto vertikal"], items: ["Layar lebar untuk foto grup", "Pas untuk layar horizontal"] },
      { kind: "feature", eyebrow: "Screen Builder", title: "Tata layar *sesuai orientasi*", body: "Atur tampilan kiosk lewat Screen Builder supaya tetap rapi di orientasi apa pun.", mockup: "qris", note: "Tampilan kiosk *sesuai brand*" },
      CTA("Atur orientasi booth kamu. Coba gratis.", "mint"),
    ],
  },
];
