import type { Deck, Slide } from "./types.js";

const TAGS = ["#studiodo", "#photobooth", "#bisnisphotobooth", "#usahaphotobooth", "#ownerbaru"];
const H = "studiodo.id";
const Q = (text: string) => ({ from: "them" as const, text });
const A = (text: string) => ({ from: "us" as const, text });
const CTA = (title: string, body: string): Slide => ({ kind: "cta", eyebrow: "Mulai santai aja", title, body, mockup: "none" });

// Fifth batch: casual "newcomer" series. Hooks first, chat bubbles / sticky notes / marker highlights instead of formal cards.
// Facts stay within the real feature list (featureData.ts); no prices, no invented numbers.
export const BATCH5_DECKS: Deck[] = [
  {
    id: "carousel-bingung-pilih-aplikasi", title: "Carousel · Bingung pilih aplikasi? (pemula)", format: "carousel", tone: "peach", handle: H,
    caption: "Baru mau buka usaha photobooth? Jangan beli alat dulu! 🛑\n\nBanyak owner baru beli kamera, printer, dan monitor duluan, lalu bingung: aplikasinya cocok nggak ya?\n\nCek 5 pertanyaan di slide ini sebelum memutuskan. Simpan dulu, nanti kepakai 📌\n\nPunya pertanyaan lain? Tulis di komentar, kami jawab!\nstudiodo.id (link di bio)",
    hashtags: [...TAGS, "#pemula", "#tipsusaha"],
    slides: [
      { kind: "hook", eyebrow: "PSST, OWNER BARU 👀", title: "Jangan beli *alat* dulu.|Pilih *aplikasinya* dulu!", body: "Banyak yang beli kamera, printer, dan monitor duluan, lalu bingung aplikasinya cocok atau tidak.", emoji: "🤔" },
      { kind: "chat", eyebrow: "Obrolan yang sering kami dengar", title: "Kamu pasti pernah *mikir gini*", chat: [Q("Kak, aku mau buka photobooth tapi bingung mulai dari mana 😭"), A("Tenang. Mulai dari satu pertanyaan: aplikasinya ngurus apa aja?"), Q("Emang aplikasi photobooth ngapain aja?"), A("Kamera, pembayaran, cetak, hasil digital, sampai laporan. Salah pilih = semuanya jadi ribet.")] },
      { kind: "note", eyebrow: "Catat ya", title: "5 pertanyaan sebelum *pilih aplikasi*", items: ["Bayarnya QRIS otomatis atau manual?", "Printer apa saja yang didukung?", "Hasil foto sampai ke HP customer gimana?", "Kalau internet mati, sesi aman?", "Bisa nambah booth tanpa ganti sistem?"] },
      { kind: "feature", eyebrow: "Jawaban STUDIODO", title: "Semua itu *sudah kejawab*", body: "QRIS otomatis di kiosk, printer berdriver Windows, galeri QR, sesi aman saat internet putus, satu akun untuk banyak booth.", mockup: "dashboard", note: "Cek sendiri di *studiodo.id*" },
      CTA("Coba dulu, *baru* belanja alat", "Daftar di studiodo.id dan lihat alurnya sendiri."),
    ],
  },
  {
    id: "carousel-aplikasi-ngapain-sih", title: "Carousel · Aplikasi photobooth ngapain sih? (pemula)", format: "carousel", tone: "peach", handle: H,
    caption: "\"Aplikasi photobooth itu ngapain sih, kan tinggal jepret?\" 🤨\n\nNyatanya ada 5 pekerjaan yang diurus di belakang layar, dari kamera sampai laporan omzet. Geser buat lihat daftarnya.\n\nBuat kamu yang baru mulai dan masih bingung: simpan postingan ini ya!\nstudiodo.id (link di bio)",
    hashtags: [...TAGS, "#edukasi", "#belajarbisnis"],
    slides: [
      { kind: "hook", eyebrow: "PERTANYAAN PALING SERING", title: "Aplikasi photobooth itu *ngapain* aja sih?", body: "Ternyata bukan cuma buat jepret. Ada 5 kerjaan yang diurus di belakangnya.", emoji: "📸" },
      { kind: "note", eyebrow: "Kerjaan di balik layar", title: "5 hal yang *diurus* aplikasi", items: ["Atur kamera dan sesi foto", "Terima pembayaran (QRIS)", "Cetak strip, grid, atau satu foto", "Kirim hasil ke HP customer", "Catat omzet dan laporan"] },
      { kind: "chat", title: "Jadi aku nggak perlu *jaga terus*?", chat: [Q("Berarti kalau aplikasinya bagus, aku nggak perlu jaga booth terus dong?"), A("Betul! QRIS terkonfirmasi otomatis dan hasil sampai lewat QR."), A("Kamu tinggal pantau dari dashboard 📊")] },
      { kind: "feature", eyebrow: "Contoh nyata", title: "Bayar tanpa *operator*", body: "Customer scan QRIS di layar kiosk, sesi langsung jalan.", mockup: "qris", note: "Terkonfirmasi *otomatis*" },
      CTA("Penasaran *tampilannya?*", "Lihat langsung di studiodo.id."),
    ],
  },
  {
    id: "carousel-urutan-beli-alat", title: "Carousel · Urutan beli alat biar nggak boncos (pemula)", format: "carousel", tone: "peach", handle: H,
    caption: "Beli alat photobooth itu ada urutannya, biar nggak boncos! 💸\n\nBanyak owner baru salah langkah: beli alat dulu, baru cari aplikasi, ternyata nggak cocok, beli ulang. Capek dan mahal.\n\nIni urutan aman versi kami. Simpan, bagikan ke temanmu yang lagi mau mulai!\nstudiodo.id (link di bio)",
    hashtags: [...TAGS, "#modalusaha", "#tipspemula"],
    slides: [
      { kind: "hook", eyebrow: "BIAR NGGAK BONCOS", title: "Beli alat photobooth itu *ada urutannya*", body: "Salah urutan, bisa beli dua kali.", emoji: "💸" },
      { kind: "compare", eyebrow: "Dua jalan", title: "Mau yang *mana?*", labelBefore: "Salah urutan", labelAfter: "Urutan aman", itemsBefore: ["Beli alat dulu", "Baru cari aplikasi", "Ternyata tidak cocok", "Beli ulang"], items: ["Pilih aplikasi dulu", "Cek kamera dan printer yang didukung", "Baru beli alat yang pas", "Langsung jalan"] },
      { kind: "note", eyebrow: "Urutan aman", title: "Lima langkah *tanpa drama*", items: ["Tentukan konsep dan lokasi", "Pilih aplikasinya dulu", "Cek kamera dan printer yang didukung", "Beli alat yang cocok", "Tes satu sesi sebelum buka"] },
      CTA("Mulai dari *aplikasinya*", "Cek dulu di studiodo.id sebelum belanja alat."),
    ],
  },
  {
    id: "carousel-mitos-fakta-pemula", title: "Carousel · 5 mitos usaha photobooth (pemula)", format: "carousel", tone: "peach", handle: H,
    caption: "5 mitos soal usaha photobooth yang bikin pemula ragu 🙅\n\n1️⃣ Harus pakai printer merek tertentu\n2️⃣ Harus beli DSLR dulu\n3️⃣ Harus jaga booth terus\n4️⃣ Hasil harus dikirim satu-satu\n5️⃣ Internet mati = sesi hilang\n\nSemuanya bisa dijawab, geser buat lihat faktanya. Mitos mana yang dulu kamu percaya? Tulis di komentar!\nstudiodo.id (link di bio)",
    hashtags: [...TAGS, "#mitosvsfakta", "#edukasi"],
    slides: [
      { kind: "hook", eyebrow: "JANGAN PERCAYA DULU", title: "5 *mitos* usaha photobooth yang bikin pemula ragu", body: "Geser, kita luruskan satu per satu.", emoji: "🙅" },
      { kind: "compare", eyebrow: "Mitos 1–3", title: "Benar atau *cuma mitos?*", labelBefore: "Mitos", labelAfter: "Fakta", itemsBefore: ["Harus pakai printer merek tertentu", "Harus beli DSLR dulu", "Harus jaga booth terus"], items: ["Printer berdriver Windows bisa dipakai", "Webcam atau DSLR/mirrorless sama-sama bisa", "QRIS otomatis, booth jalan sendiri"] },
      { kind: "compare", eyebrow: "Mitos 4–5", title: "Dua lagi, *yuk*", labelBefore: "Mitos", labelAfter: "Fakta", itemsBefore: ["Hasil harus dikirim satu-satu", "Internet mati, sesi hilang"], items: ["Galeri QR: customer unduh sendiri", "Sesi tersimpan saat internet putus"] },
      CTA("Mitos mana yang *kamu percaya?*", "Tulis di komentar, kami jawab satu-satu."),
    ],
  },
  {
    id: "carousel-hari-pertama-buka", title: "Carousel · Hari pertama buka booth (pemula)", format: "carousel", tone: "peach", handle: H,
    caption: "Hari pertama buka booth deg-degan? Wajar banget 😅\n\nSupaya tenang, cek 5 hal ini sebelum customer pertama datang. Cuma butuh sekitar 10 menit.\n\nSimpan dan screenshot buat dibaca lagi besok pagi ✅\nstudiodo.id (link di bio)",
    hashtags: [...TAGS, "#harupertama", "#checklist"],
    slides: [
      { kind: "hook", eyebrow: "H-10 MENIT", title: "Hari pertama buka booth? *Cek 5 hal* ini dulu", body: "Biar customer pertama dapat pengalaman yang mulus.", emoji: "✅" },
      { kind: "note", eyebrow: "Checklist 10 menit", title: "Sebelum *customer pertama*", items: ["Kiosk online di dashboard", "QRIS dan paket sudah diatur", "Kertas dan tinta printer cukup", "Kamera dan lampu sudah dites", "Coba satu sesi sampai cetak"] },
      { kind: "chat", title: "Deg-degan itu *normal*", chat: [Q("Aku takut ada yang error pas customer datang 😰"), A("Wajar! Coba satu sesi sendiri dulu, dari bayar sampai cetak."), A("Kalau lancar, kamu siap buka. Status kiosk juga bisa dipantau di dashboard.")] },
      CTA("Siap *buka booth?*", "Atur semuanya di studiodo.id."),
    ],
  },
  {
    id: "carousel-di-balik-satu-sesi", title: "Carousel · Di balik satu sesi foto (pemula)", format: "carousel", tone: "peach", handle: H,
    caption: "Dari customer scan QRIS sampai uang tercatat, apa yang sebenarnya terjadi? 🎬\n\nIni alur satu sesi di booth STUDIODO, tanpa operator, tanpa ribet. Geser buat lihat langkahnya.\n\nBuat yang baru mulai dan penasaran cara kerjanya: simpan ya!\nstudiodo.id (link di bio)",
    hashtags: [...TAGS, "#caraKerja", "#alurbooth"],
    slides: [
      { kind: "hook", eyebrow: "BEHIND THE SCENES", title: "Dari *scan QRIS* sampai omzet tercatat: ini yang terjadi", body: "Satu sesi foto, lima langkah, tanpa operator.", emoji: "🎬" },
      { kind: "steps", eyebrow: "Alur satu sesi", title: "Lima langkah *otomatis*", items: ["Customer pilih paket di kiosk", "Scan QRIS, bayar", "Terkonfirmasi, countdown 3-2-1 jalan", "Strip dicetak, galeri QR muncul", "Transaksi masuk dashboard"] },
      { kind: "feature", eyebrow: "Sisi kamu", title: "Tinggal *pantau* dari dashboard", body: "Omzet, transaksi, dan status kiosk, real-time.", mockup: "dashboard", note: "Satu akun untuk *banyak kiosk*" },
      CTA("Pengen *lihat sendiri?*", "Coba alurnya di studiodo.id."),
    ],
  },
  {
    id: "carousel-manual-vs-aplikasi", title: "Carousel · Manual vs aplikasi (pemula)", format: "carousel", tone: "peach", handle: H,
    caption: "Photobooth cuma modal kamera + WhatsApp? Capek, bro 😩\n\nBisa sih, tapi cek mutasi satu-satu, kirim hasil satu-satu, hitung omzet manual. Makin ramai, makin kewalahan.\n\nBandingin sendiri di slide ini. Kamu tim manual atau tim aplikasi? Komen ya!\nstudiodo.id (link di bio)",
    hashtags: [...TAGS, "#manualvsaplikasi", "#efisien"],
    slides: [
      { kind: "hook", eyebrow: "JUJUR AJA", title: "Photobooth pakai kamera + WhatsApp doang? *Capek*, bro.", body: "Bisa sih. Tapi lihat dulu apa yang kamu kerjakan manual.", emoji: "😩" },
      { kind: "chat", title: "Kan bisa *lewat WA* aja?", chat: [Q("Kan bisa kirim hasil lewat WA aja?"), A("Bisa, tapi tiap customer kamu kirim satu-satu."), A("Plus cek mutasi manual, hitung omzet manual. Makin ramai makin kewalahan.")] },
      { kind: "compare", eyebrow: "Bandingin", title: "Tim *mana* kamu?", labelBefore: "Cara manual", labelAfter: "Pakai STUDIODO", itemsBefore: ["Cek mutasi satu-satu", "Kirim hasil satu-satu", "Hitung omzet manual", "Antrian diatur manual"], items: ["QRIS otomatis", "Galeri QR, unduh sendiri", "Omzet tercatat di dashboard", "Antrian digital"] },
      CTA("Pindah ke *tim aplikasi?*", "Mulai dari studiodo.id."),
    ],
  },
  {
    id: "carousel-faq-pemula-santai", title: "Carousel · FAQ pemula, dijawab santai", format: "carousel", tone: "peach", handle: H,
    caption: "Pertanyaan pemula soal aplikasi photobooth, dijawab santai 💬\n\nPerlu printer khusus? Harus pakai DSLR? Hasilnya sampai ke customer gimana? Kalau internet mati? Semua ada di slide ini.\n\nMasih ada pertanyaan lain? Tulis di komentar, kami jawab di postingan berikutnya!\nstudiodo.id (link di bio)",
    hashtags: [...TAGS, "#faq", "#tanyajawab"],
    slides: [
      { kind: "hook", eyebrow: "TANYA JAWAB", title: "Pertanyaan pemula soal aplikasi photobooth, *dijawab santai*", body: "Dikumpulin dari yang paling sering ditanyain.", emoji: "💬" },
      { kind: "chat", eyebrow: "Alat", title: "Soal *alat*", chat: [Q("Perlu printer khusus nggak?"), A("Nggak. Printer apa saja yang punya driver Windows bisa dipakai."), Q("Harus pakai DSLR?"), A("Webcam bisa, DSLR/mirrorless juga bisa.")] },
      { kind: "chat", eyebrow: "Hasil", title: "Soal *hasil foto*", chat: [Q("Customer dapat hasilnya gimana?"), A("Scan QR di layar, galeri cloud terbuka di HP-nya. Bisa unduh foto, GIF, dan video."), Q("Kalau internet mati?"), A("Sesi tetap tersimpan, jadi nggak hilang.")] },
      { kind: "chat", eyebrow: "Bisnis", title: "Soal *bisnis*", chat: [Q("Kalau booth-ku nambah?"), A("Satu akun bisa untuk banyak kiosk, lisensinya per booth."), Q("Customer bayarnya gimana?"), A("QRIS tampil di layar kiosk, lewat Xendit atau DOKU milikmu.")] },
      CTA("Masih *penasaran?*", "Tulis pertanyaanmu di komentar."),
    ],
  },
];
