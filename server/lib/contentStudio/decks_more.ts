import type { Deck } from "./types.js";

const TAGS = ["#studiodo", "#photobooth", "#bisnisphotobooth", "#photoboothindonesia", "#usahaphotobooth"];
const H = "studiodo.id";
const CTA = (body: string, tone: Deck["tone"] = "dark") => ({ kind: "cta" as const, tone, eyebrow: "Mulai sekarang", title: "Siap coba *sendiri?*", body, mockup: "none" as const });

// Second batch of built-in decks (one per backlog pillar). Same rule as decks.ts: every claim maps to a real feature.
export const MORE_DECKS: Deck[] = [
  {
    id: "carousel-voucher-event", title: "Carousel · Voucher & promo event", format: "carousel", tone: "mint", handle: H,
    caption: "Lagi pegang event wedding atau gathering dan mau kasih akses foto gratis ke tamu? 🎟️\n\nDi STUDIODO kamu cukup buat kode voucher dari dashboard. Tamu masukkan kode di kiosk, sesi langsung jalan, dan pemakaiannya tercatat rapi.\n\n✅ Voucher & kode promo per event\n✅ Gratis atau diskon, kamu yang atur\n✅ Paket & harga fleksibel\n✅ Terlihat di riwayat transaksi\n\nSimpan buat referensi event berikutnya.\nstudiodo.id (link di bio)",
    hashtags: [...TAGS, "#voucher", "#weddingphotobooth", "#eventorganizer"],
    slides: [
      { kind: "cover", eyebrow: "Promo & event", title: "Promo event,|*beres dari dashboard.*", body: "Buat kode voucher, bagikan ke tamu, selesai.", mockup: "booth" },
      { kind: "steps", eyebrow: "Caranya", title: "Tiga langkah *voucher*", items: ["Buat kode voucher di dashboard", "Bagikan kodenya ke tamu event", "Tamu masukkan kode di kiosk, sesi jalan"] },
      { kind: "feature", eyebrow: "Fleksibel", title: "Gratis atau diskon, *kamu yang atur*", body: "Cocok untuk wedding, gathering kantor, atau kampanye brand. Harga paket juga bebas, termasuk gratis.", mockup: "dashboard", note: "Pemakaian voucher tercatat di *riwayat transaksi*" },
      { kind: "compare", eyebrow: "Sebelum vs sesudah", title: "Event jadi lebih *tenang*", itemsBefore: ["Atur akses tamu manual", "Operator jaga seharian", "Susah tahu siapa sudah pakai"], items: ["Satu kode per event", "Kiosk jalan sendiri", "Pemakaian tercatat otomatis"] },
      CTA("Daftar gratis di studiodo.id dan coba fitur voucher.", "light"),
    ],
  },
  {
    id: "carousel-antrian-digital", title: "Carousel · Antrian digital", format: "carousel", tone: "light", handle: H,
    caption: "Antrean booth lagi rame dan semua orang nanya \"kapan giliranku?\" 😵\n\nAntrian digital STUDIODO kasih nomor harian, tombol panggil berikutnya, dan bisa langsung kirim pelanggan ke booth yang kosong. Pelanggan yang masih di booth lain tidak ikut terpanggil.\n\n🔢 Nomor antrian harian\n📣 Panggil berikutnya\n🧭 Kirim ke booth yang kosong\n\nCocok buat booth di mall atau event ramai.\nstudiodo.id (link di bio)",
    hashtags: [...TAGS, "#antriandigital", "#kasirphotobooth"],
    slides: [
      { kind: "cover", eyebrow: "Antrian digital", title: "Antrian rapi,|*tanpa teriak-teriak.*", body: "Nomor harian, panggil berikutnya, kirim ke booth.", mockup: "queue" },
      { kind: "feature", eyebrow: "Panggil", title: "Satu tombol, *giliran berikutnya*", body: "Pelanggan yang masih di booth lain tidak ikut terpanggil, jadi tidak ada yang saling serobot.", mockup: "queue", note: "Kirim pelanggan ke *booth yang kosong*" },
      { kind: "steps", eyebrow: "Alurnya", title: "Dari datang sampai *foto*", items: ["Pelanggan dapat nomor antrian", "Kasir panggil berikutnya", "Dikirim ke booth, sesi dimulai"] },
      { kind: "compare", eyebrow: "Sebelum vs sesudah", title: "Event ramai tetap *terkendali*", itemsBefore: ["Antre tanpa kejelasan", "Pelanggan serobot giliran", "Operator kewalahan"], items: ["Nomor harian jelas", "Dipanggil sesuai urutan", "Kasir tinggal tekan tombol"] },
      CTA("Antrian digital sudah ada di STUDIODO. Coba gratis.", "dark"),
    ],
  },
  {
    id: "carousel-kamera-iso", title: "Carousel · Kamera & pengaturan jarak jauh", format: "carousel", tone: "dark", handle: H,
    caption: "Kamera bagus saja belum cukup kalau settingannya meleset dan kamu tidak ada di lokasi 📷\n\nSTUDIODO bisa pakai webcam atau DSLR/mirrorless (lewat digiCamControl), dan kamu bisa atur ISO, shutter, aperture, dan white balance langsung dari dashboard. Ada live view juga saat sesi berjalan.\n\nHasil terlalu gelap? Atur dari mana saja.\nstudiodo.id (link di bio)",
    hashtags: [...TAGS, "#dslr", "#mirrorless", "#digicamcontrol"],
    slides: [
      { kind: "cover", eyebrow: "Kamera & cetak", title: "Kamera bagus saja|*belum cukup.*", body: "Hasil foto tetap harus terang, tajam, dan konsisten.", mockup: "booth" },
      { kind: "steps", eyebrow: "Atur dari dashboard", title: "Empat pengaturan *kunci*", items: ["ISO", "Shutter speed", "Aperture", "White balance"] },
      { kind: "feature", eyebrow: "Live view", title: "Lihat langsung saat *sesi berjalan*", body: "Pantau tampilan kamera tanpa harus berdiri di depan booth.", mockup: "dashboard", note: "Webcam atau *DSLR / mirrorless*" },
      { kind: "feature", eyebrow: "Cetak", title: "Printer apa saja yang *punya driver Windows*", body: "Cetak strip, grid, atau satu foto. Tidak harus beli printer tertentu.", mockup: "strip", note: "Mode cermin / asli untuk *hasil cetak*" },
      CTA("Atur kamera booth dari dashboard. Coba gratis di studiodo.id.", "indigo"),
    ],
  },
  {
    id: "carousel-offline-aman", title: "Carousel · Sesi aman saat internet putus", format: "carousel", tone: "indigo", handle: H,
    caption: "Internet venue mati di tengah event, apa kabar antrean fotonya? 😬\n\nDi STUDIODO sesi tetap tersimpan walau internet putus, dan aplikasi kiosk update otomatis (bisa diatur per kiosk).\n\n🛡️ Sesi tetap tersimpan saat internet putus\n🔄 Update otomatis, bisa diatur per kiosk\n📊 Status kiosk terpantau di dashboard\n\nBuat kamu yang sering pegang event.\nstudiodo.id (link di bio)",
    hashtags: [...TAGS, "#eventphotobooth", "#andal"],
    slides: [
      { kind: "cover", eyebrow: "Andal", title: "Internet putus,|*sesi tetap aman.*", body: "Karena event tidak bisa diulang.", mockup: "hub" },
      { kind: "compare", eyebrow: "Sebelum vs sesudah", title: "Tidak perlu *panik* di lokasi", itemsBefore: ["Internet mati, sesi hilang", "Harus datang buat update", "Baru tahu masalah dari customer"], items: ["Sesi tersimpan walau offline", "Update otomatis per kiosk", "Status kiosk terpantau"] },
      { kind: "feature", eyebrow: "Update", title: "Aplikasi *update sendiri*", body: "Kiosk mengecek versi baru secara berkala dan bisa diatur per kiosk, jadi tidak perlu datang ke lokasi.", mockup: "dashboard", note: "Status kiosk terpantau *real-time*" },
      CTA("Booth yang tenang buat kamu yang sering pegang event.", "dark"),
    ],
  },
  {
    id: "carousel-gaya-kiosk", title: "Carousel · Tampilan kiosk sesuai brand", format: "carousel", tone: "mint", handle: H,
    caption: "Booth kamu seharusnya terlihat seperti brand kamu, bukan template orang lain 🎨\n\nDi STUDIODO kamu bisa pilih gaya tampilan kiosk, atur layar lewat Screen Builder, pakai frame kustom, dan pasang template dari marketplace kreator.\n\n✨ Gaya kiosk siap pakai\n🧩 Screen Builder\n🖼️ Frame kustom untuk tiap event\n🏪 Template dari kreator\n\nSatu booth, banyak suasana.\nstudiodo.id (link di bio)",
    hashtags: [...TAGS, "#brandingbooth", "#frameevent"],
    slides: [
      { kind: "cover", eyebrow: "Tampilan kiosk", title: "Booth kamu,|*identitas kamu.*", body: "Ganti suasana tanpa desain ulang dari nol.", mockup: "booth" },
      { kind: "feature", eyebrow: "Screen Builder", title: "Atur layar kiosk *sesuai brand*", body: "Pilih gaya, susun layar, sesuaikan dengan event.", mockup: "qris", note: "Portrait atau landscape, *bebas*" },
      { kind: "feature", eyebrow: "Frame", title: "Frame kustom untuk *tiap event*", body: "Wedding, gathering, atau kampanye brand bisa punya frame sendiri.", mockup: "strip", note: "Foto, GIF, dan video dalam *satu sesi*" },
      { kind: "steps", eyebrow: "Alurnya", title: "Dari desain ke *kiosk*", items: ["Pilih gaya atau buat frame kustom", "Atur tampilan di Screen Builder", "Kiosk langsung memakai tampilannya"] },
      CTA("Bikin tampilan booth yang beda. Coba gratis.", "light"),
    ],
  },
  {
    id: "carousel-kreator-marketplace", title: "Carousel · Jadi kreator, jual frame", format: "carousel", tone: "light", handle: H,
    caption: "Punya skill desain dan ngerti kebutuhan photobooth? Frame buatanmu bisa dipakai banyak booth 🖼️\n\nDi STUDIODO kamu bisa daftar jadi kreator, kirim template frame, lalu tampil di marketplace setelah ditinjau tim. Pemilik booth bisa memasangnya langsung ke kiosk.\n\nCerita proses lengkapnya ada di slide. Geser →\nstudiodo.id (link di bio)",
    hashtags: [...TAGS, "#desainframe", "#kreatorindonesia", "#marketplace"],
    slides: [
      { kind: "cover", eyebrow: "Untuk kreator", title: "Desain kamu bisa|*dipakai banyak booth.*", body: "Daftar jadi kreator dan jual template frame.", mockup: "strip" },
      { kind: "steps", eyebrow: "Alurnya", title: "Dari desain ke *marketplace*", items: ["Daftar jadi kreator", "Kirim template frame buatanmu", "Tim meninjau template-nya", "Tampil di marketplace untuk pemilik booth"] },
      { kind: "feature", eyebrow: "Untuk pemilik booth", title: "Template baru, *tinggal pasang*", body: "Cari frame dari kreator dan pasang langsung ke kiosk kamu.", mockup: "booth", note: "Frame kustom untuk *tiap event*" },
      CTA("Daftar jadi kreator STUDIODO di studiodo.id.", "dark"),
    ],
  },
  {
    id: "carousel-checklist-mulai-usaha", title: "Carousel · Checklist mulai usaha photobooth", format: "carousel", tone: "dark", handle: H,
    caption: "Mau mulai usaha photobooth tapi bingung mulai dari mana? 🤔\n\nIni lima hal yang perlu kamu siapkan. Dari sistem sampai frame, semuanya bisa dipegang dari satu platform.\n\nSimpan postingan ini, nanti kamu butuh. Bagikan ke teman yang lagi mikir mau buka booth!\nstudiodo.id (link di bio)",
    hashtags: [...TAGS, "#mulaiusaha", "#peluangusaha", "#bisnisrumahan"],
    slides: [
      { kind: "cover", eyebrow: "Checklist", title: "Mau buka|*photobooth?*", body: "Lima hal yang perlu kamu siapkan dulu.", mockup: "hub" },
      { kind: "steps", eyebrow: "Checklist awal", title: "Lima hal *wajib siap*", items: ["Sistem kiosk & dashboard", "Pembayaran (QRIS)", "Kamera: webcam atau DSLR", "Printer untuk cetak", "Frame & desain tampilan"] },
      { kind: "feature", eyebrow: "Sistem", title: "Satu platform untuk *semuanya*", body: "Kiosk, kasir, pembayaran, kamera, sampai galeri hasil. Tidak perlu tempel-tempel banyak aplikasi.", mockup: "dashboard", note: "Satu akun untuk *banyak kiosk*" },
      { kind: "stat", eyebrow: "Fitur", title: "Yang kamu dapat|dalam satu tempat", stat: { value: 44, suffix: "+", label: "fitur lengkap" }, body: "Dari kasir sampai galeri hasil, semuanya sudah ada.", tone: "indigo" },
      CTA("Mulai dari sistem yang tepat. Coba gratis di studiodo.id.", "light"),
    ],
  },
  {
    id: "reel-alur-customer", title: "Reel · Alur customer: bayar, foto, hasil", format: "reel", tone: "light", handle: H,
    caption: "Dari bayar sampai hasil di HP, semuanya jalan sendiri. 📱✨\n\nQRIS di layar kiosk → sesi foto → galeri dengan QR. Itu alur customer di booth STUDIODO.\n\nCoba gratis di studiodo.id (link di bio)",
    hashtags: [...TAGS, "#reels", "#alurcustomer"],
    slides: [
      { kind: "cover", seconds: 3.4, eyebrow: "Alur customer", title: "Dari bayar sampai|*hasil di HP.*", body: "Semua jalan sendiri.", mockup: "none" },
      { kind: "feature", seconds: 4.2, eyebrow: "1 · Bayar", title: "Scan *QRIS*", mockup: "qris" },
      { kind: "feature", seconds: 4.0, eyebrow: "2 · Foto", title: "Sesi *dimulai*", mockup: "booth" },
      { kind: "feature", seconds: 4.0, eyebrow: "3 · Hasil", title: "Unduh *dari HP*", mockup: "gallery" },
      { kind: "cta", seconds: 3.4, tone: "dark", eyebrow: "Mulai sekarang", title: "Coba *gratis* di studiodo.id", mockup: "none" },
    ],
  },
];
