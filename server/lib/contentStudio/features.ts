import type { Mockup } from "./types.js";

// Feature catalog: every capability STUDIODO Photobooth SaaS ships, written as content material.
// The generator turns each entry into a carousel and a reel. Keep claims literal: nothing here may promise more than the app does.
// `check` marks claims that were built but not yet proven on real hardware / a live account: the UI shows a warning before posting.

export const PILLARS = ["Pembayaran", "Pengalaman booth", "Hasil digital", "Kamera & cetak", "Operasional", "Bisnis & growth", "Tips bisnis"] as const;
export type Pillar = (typeof PILLARS)[number];

export type Feature = {
  id: string;
  name: string; // short, shown in the UI
  pillar: Pillar;
  since: string; // YYYY-MM when it shipped
  hook: string; // cover title ("|" = line break, *word* = highlighted)
  tagline: string; // one sentence under the cover title
  emoji: string; // reel hook sticker
  pain: string[]; // "before" column (3)
  gain: string[]; // "after" column (3)
  how: string[]; // numbered steps (3-4)
  mockup: Mockup;
  tip: string; // closing note under the last content slide
  stat?: { value: number; prefix?: string; suffix?: string; label: string }; // only literal, countable facts
  check?: string;
  kind?: "fitur" | "tips"; // "tips" = general advice for booth owners (no product claim), told with the same layouts
};

type Opts = { stat?: Feature["stat"]; check?: string; since?: string; kind?: Feature["kind"] };
const F = (id: string, name: string, pillar: Pillar, hook: string, tagline: string, emoji: string, pain: string[], gain: string[], how: string[], mockup: Mockup, tip: string, o: Opts = {}): Feature =>
  ({ id, name, pillar, since: o.since ?? "2026-10", hook, tagline, emoji, pain, gain, how, mockup, tip, stat: o.stat, check: o.check, kind: o.kind });

export const FEATURES: Feature[] = [
  // ---------- Pembayaran ----------
  F("qris-otomatis", "QRIS otomatis di kiosk", "Pembayaran", "Scan, bayar,|*langsung foto.*", "QRIS muncul di layar kiosk. Begitu lunas, sesi foto jalan sendiri.", "📲",
    ["Cek mutasi satu per satu", "Customer menunggu konfirmasi", "Harus ada yang jaga kasir"], ["QRIS tampil di layar kiosk", "Lunas, sesi mulai otomatis", "Tercatat rapi di dashboard"],
    ["Customer pilih paket", "Scan QRIS, bayar", "Sesi foto otomatis mulai"], "qris", "Tanpa operator, booth tetap jalan.", { since: "2026-09" }),
  F("pilih-penerima-qris", "Pilih penerima uang QRIS", "Pembayaran", "Uang QRIS masuk|ke *mana?*", "Pilih sendiri: lewat akun STUDIODO atau lewat gateway milikmu.", "🏦",
    ["Bingung uang customer lewat siapa", "Satu cara bayar untuk semua orang", "Rekonsiliasi manual di akhir bulan"], ["Penerima QRIS bisa kamu pilih", "Penjelasan jelas di tiap pilihan", "Saldo & riwayat terpantau"],
    ["Buka pengaturan pembayaran", "Pilih akun STUDIODO atau gateway sendiri", "Simpan, QRIS langsung memakai pilihanmu"], "dashboard", "Kamu yang menentukan alur uangnya.", { since: "2026-11", check: "Cek ulang alur DOKU/Xendit di akun live sebelum posting." }),
  F("saldo-penarikan", "Saldo & penarikan dana", "Pembayaran", "Saldo booth,|*tarik kapan perlu*", "Pantau saldo, ajukan penarikan, dan lihat riwayat tiap mutasi.", "💸",
    ["Saldo tidak jelas masuk dari mana", "Tarik dana lewat chat manual", "Tidak ada catatan mutasi"], ["Saldo dan riwayat dalam satu layar", "Pengajuan penarikan lewat dashboard", "Setiap perubahan saldo tercatat"],
    ["Buka menu saldo", "Ajukan penarikan ke rekening", "Pantau statusnya sampai selesai"], "dashboard", "Uang masuk dan keluar selalu bisa ditelusuri.", { since: "2026-11" }),
  F("persetujuan-dua-orang", "Penarikan besar butuh 2 persetujuan", "Pembayaran", "Penarikan besar?|*Dicek dua orang.*", "Pengaman ekstra untuk penarikan dana bernilai besar.", "🔐",
    ["Satu orang bisa menarik sendirian", "Rekening baru langsung dipakai", "Susah melacak siapa yang setuju"], ["Penarikan besar perlu persetujuan kedua", "Rekening baru ditahan dulu", "Ada jejak siapa menyetujui"],
    ["Penarikan melewati batas diajukan", "Orang kedua menyetujui", "Dana diproses dan tercatat"], "dashboard", "Keamanan uang bukan urusan belakangan.", { since: "2026-11" }),
  F("voucher-promo", "Voucher & kode promo", "Pembayaran", "Voucher untuk|*tiap event*", "Buat kode untuk wedding, gathering, atau kampanye. Gratis atau diskon.", "🎟️",
    ["Promo dicatat manual", "Kode dipakai melebihi kuota", "Susah tahu event mana yang laris"], ["Kode promo per event", "Kuota dijaga, tidak bisa lewat batas", "Pemakaian terlihat di dashboard"],
    ["Buat kode & kuota", "Bagikan ke tamu event", "Tamu masukkan kode di kiosk"], "booth", "Satu kode, satu event, satu laporan.", { since: "2026-10" }),
  F("invoice-tercatat", "Pembayaran telat tetap tercatat", "Pembayaran", "Bayar telat?|*Tetap tercatat.*", "Setiap invoice QRIS per sesi disimpan, termasuk yang lunas terlambat.", "🧾",
    ["Customer bayar setelah QR kedaluwarsa", "Uang masuk tapi sesi tidak jalan", "Selisih kas sulit dicari"], ["Semua invoice QRIS per sesi tersimpan", "Pembayaran terlambat diberi tanda", "Selisih bisa ditelusuri"],
    ["Sesi membuat invoice QRIS", "Pembayaran masuk, status diperbarui", "Yang terlambat ditandai di riwayat"], "queue", "Uang yang masuk tidak pernah hilang jejak.", { since: "2026-11" }),
  F("bayar-langganan", "Bayar langganan beragam metode", "Pembayaran", "Langganan, bayar|*sesukamu*", "QRIS, virtual account, minimarket, sampai kartu lewat halaman bayar STUDIODO.", "💳",
    ["Hanya satu cara bayar", "Konfirmasi lewat chat", "Tagihan tidak jelas"], ["Beberapa metode bayar tersedia", "Invoice dikirim ke email", "Status langganan langsung aktif"],
    ["Pilih plan", "Pilih metode bayar", "Lunas, akun & booth aktif"], "qris-l", "Bayar sesuai cara yang paling nyaman.", { since: "2026-11", check: "Metode yang tampil bergantung aktivasi akun Midtrans." }),

  // ---------- Pengalaman booth ----------
  F("mode-alur", "4 mode alur kiosk", "Pengalaman booth", "Alur kiosk,|*pilih yang pas*", "Lengkap, Ringkas, Satu harga, atau Kilat, sesuai tipe event.", "⚡",
    ["Alur sama untuk semua situasi", "Antrian panjang di event ramai", "Customer bingung terlalu banyak langkah"], ["4 mode alur siap pakai", "Event ramai? pakai Kilat", "Booth premium? pakai Lengkap"],
    ["Buka pengaturan Flow Kiosk", "Pilih mode alur", "Kiosk langsung mengikuti"], "booth", "Satu aplikasi, banyak gaya layanan.", { stat: { value: 4, label: "mode alur siap pakai" }, since: "2026-11" }),
  F("gaya-kiosk", "Gaya tampilan kiosk", "Pengalaman booth", "Kiosk yang|*berwajah brand-mu*", "Pilih gaya tampilan, ubah warna dan teks, lihat hasilnya langsung.", "🎨",
    ["Tampilan seragam dengan booth lain", "Mengubah desain butuh programmer", "Teks tidak sesuai brand"], ["Beberapa gaya siap pakai", "Warna & teks bisa diubah sendiri", "Pratinjau persis tampilan kiosk"],
    ["Buka Kustomisasi", "Pilih gaya & atur tampilan", "Simpan, kiosk ikut berubah"], "booth-l", "Booth-mu, rasa brand-mu.", { since: "2026-10" }),
  F("frame-portrait-landscape", "Frame portrait & landscape", "Pengalaman booth", "Portrait atau|*landscape?* Dua-duanya", "Frame dan hasil cetak mengikuti orientasi yang kamu pilih.", "🖼️",
    ["Frame hanya satu orientasi", "Foto landscape terpotong", "Thumbnail tidak sesuai hasil"], ["Frame portrait dan landscape", "Pemilih frame menampilkan orientasi benar", "Cetak sesuai bentuk frame"],
    ["Unggah frame", "Atur slot foto", "Kiosk & cetak mengikuti frame"], "print-l", "Satu booth, dua gaya frame.", { since: "2026-11" }),
  F("edit-di-kiosk", "Edit foto langsung di kiosk", "Pengalaman booth", "Geser, zoom,|*selesai.*", "Customer mengatur posisi foto di slot frame dengan sentuhan.", "👆",
    ["Foto bergeser dan tidak bisa diatur", "Harus retake karena posisi kurang pas", "Edit rumit di layar kecil"], ["Geser foto di dalam slot", "Zoom dengan cubit atau scroll", "Ketuk dua kali untuk reset"],
    ["Pilih foto di slot", "Geser & zoom sesuai selera", "Lanjut ke hasil"], "booth", "Foto pas, tanpa retake berulang.", { since: "2026-11" }),
  F("foto-gif-video", "Foto, GIF, dan video satu sesi", "Pengalaman booth", "Satu sesi,|*tiga hasil*", "Foto, GIF, dan video sesi lengkap keluar dari satu kali pemotretan.", "🎞️",
    ["Hanya foto statis", "Konten video harus dibuat terpisah", "Customer minta lebih dari sekadar cetak"], ["Foto, GIF, dan video sekaligus", "Video menampilkan pose tiap slot", "Semua tersedia di galeri QR"],
    ["Customer berfoto seperti biasa", "Sistem merekam tiap pose", "GIF & video muncul di hasil"], "strip", "Nilai lebih tanpa kerja ekstra.", { since: "2026-10", check: "Cek hasil GIF/video di perangkat live sebelum posting." }),
  F("stop-motion", "Mode stop-motion", "Pengalaman booth", "Stop-motion,|*langsung jadi*", "Rangkaian foto cepat menjadi video yang lucu dan siap dibagikan.", "🎬",
    ["Hasil booth terasa itu-itu saja", "Tidak ada konten untuk dibagikan", "Customer cepat bosan"], ["Video stop-motion dari satu sesi", "Putar ulang di layar hasil", "Mudah dibagikan ke media sosial"],
    ["Pilih paket dengan stop-motion", "Berpose beberapa kali", "Video jadi otomatis"], "strip", "Satu alasan lagi untuk customer berbagi.", { since: "2026-10" }),
  F("mirror-asli", "Mode cermin & asli", "Pengalaman booth", "Cermin atau|*asli?* Kamu pilih", "Atur apakah hasil cetak mengikuti tampilan cermin atau gambar asli.", "🪞",
    ["Hasil cetak terbalik dari yang dilihat", "Tulisan di foto jadi terbalik", "Customer protes hasilnya beda"], ["Tombol Cermin/Asli di editor", "Hasil cetak cocok dengan tampilan live", "Teks tidak terbalik"],
    ["Buka pratinjau foto", "Pilih Cermin atau Asli", "Cetak sesuai pilihan"], "booth", "Detail kecil yang bikin customer puas.", { since: "2026-09" }),
  F("zoom-shutter", "Zoom digital & shutter", "Pengalaman booth", "Zoom, lalu|*klik sendiri*", "Customer bisa zoom digital dan memilih shutter otomatis atau manual.", "🔍",
    ["Posisi kamera terlalu jauh atau dekat", "Hitung mundur tidak bisa dikontrol", "Semua orang dipaksa satu cara"], ["Zoom digital in/out di layar capture", "Pilih shutter otomatis atau manual", "Foto terpotong sesuai zoom"],
    ["Atur zoom di layar capture", "Pilih auto atau manual", "Mulai berfoto"], "booth", "Kontrol di tangan customer.", { since: "2026-11" }),
  F("multi-kamera", "Multi kamera (sudut ke-2)", "Pengalaman booth", "Dua kamera,|*dua sudut*", "Pakai kamera kedua untuk gantian atau dual capture.", "📷",
    ["Satu sudut pandang saja", "Variasi foto terbatas", "Setup kamera tambahan rumit"], ["Dukungan kamera kedua", "Mode gantian atau bersamaan", "Diatur lewat satu panel"],
    ["Hubungkan kamera kedua", "Pilih mode alternate/dual", "Sesi memakai kedua kamera"], "booth-l", "Variasi foto tanpa ribet.", { since: "2026-11", check: "Belum diuji dengan dua kamera fisik." }),
  F("sosmed-izin", "Pop-up izin media sosial", "Pengalaman booth", "Tanya izin|*sebelum posting*", "Pop-up opsional menanyakan izin customer untuk dibagikan di media sosial.", "🙋",
    ["Posting foto customer tanpa izin jelas", "Tidak ada catatan persetujuan", "Takut salah langkah"], ["Pop-up izin sebelum layar hasil", "Jawaban tersimpan di sesi", "Bisa dinyalakan atau dimatikan"],
    ["Aktifkan di Flow Kiosk", "Customer menjawab di kiosk", "Jawaban tersimpan di data sesi"], "booth", "Konten aman, customer dihargai.", { since: "2026-11" }),
  F("pin-operator", "PIN operator", "Pengalaman booth", "Konsol operator,|*dikunci PIN*", "Hanya kru yang tahu PIN yang bisa membuka konsol operator.", "🔒",
    ["Customer iseng membuka pengaturan", "Layar admin terbuka di event", "Akses tidak dibatasi"], ["PIN pad sebelum konsol operator", "Sudut dan jumlah ketukan bisa diatur", "Akses khusus kru"],
    ["Atur PIN di Akses operator", "Ketuk sudut layar sesuai aturan", "Masukkan PIN"], "booth", "Aman dipakai di tempat ramai.", { since: "2026-11" }),

  // ---------- Hasil digital ----------
  F("galeri-qr", "Hasil digital & galeri QR", "Hasil digital", "Scan QR,|*foto di HP*", "Setiap sesi punya galeri online. Customer scan QR dan unduh hasilnya.", "📱",
    ["Foto dikirim manual lewat chat", "Customer lupa minta softcopy", "Hasil tidak punya halaman rapi"], ["Galeri online per sesi", "QR di layar hasil", "Foto, GIF, dan video dalam satu halaman"],
    ["Sesi selesai", "Scan QR di layar hasil", "Unduh atau bagikan"], "gallery", "Hasil sampai ke tangan customer sebelum mereka pulang.", { since: "2026-09" }),
  F("layar-hasil", "Layar hasil tanpa scroll", "Hasil digital", "Satu layar,|*semua aksi*", "Pratinjau, QR, cetak, dan kirim ada dalam satu layar tanpa scroll.", "✅",
    ["Customer bingung mencari tombol", "Harus scroll di layar kiosk", "Aksi tersebar di banyak halaman"], ["Pratinjau + QR + cetak + kirim dalam satu layar", "Form kontak & cetak tambahan muncul sebagai panel", "Alur lebih cepat"],
    ["Lihat hasil", "Pilih cetak, kirim, atau QR", "Selesai"], "gallery-l", "Semakin sedikit langkah, semakin banyak yang tuntas.", { since: "2026-11" }),
  F("cetak-tambahan", "Cetak tambahan & paket ukuran", "Hasil digital", "Mau cetak lagi?|*Satu ketukan.*", "Customer bisa menambah cetakan dan paket bisa memadukan beberapa ukuran kertas.", "🖨️",
    ["Cetak tambahan diurus manual", "Satu paket satu ukuran", "Total harga tidak terlihat"], ["Stepper cetak tambahan di pop-up", "Paket gabungan 2R + 4R", "Total harga langsung terlihat"],
    ["Pilih paket", "Atur jumlah cetak tambahan", "Bayar dan cetak"], "print-l", "Pendapatan tambahan tanpa tambahan kerja.", { since: "2026-11" }),
  F("data-pelanggan", "Data pelanggan & follow-up", "Hasil digital", "Dari foto,|*jadi data*", "Kontak customer tersimpan sebagai bahan follow-up dan promosi.", "📇",
    ["Customer pergi tanpa jejak", "Tidak ada daftar kontak", "Promosi ulang sulit"], ["Form kontak di layar hasil", "Data tersimpan per sesi", "Bahan untuk follow-up"],
    ["Customer isi kontak (opsional)", "Data masuk ke dashboard", "Gunakan untuk promo berikutnya"], "gallery", "Customer hari ini, pelanggan besok.", { since: "2026-10" }),

  // ---------- Kamera & cetak ----------
  F("kontrol-kamera", "Atur kamera dari dashboard", "Kamera & cetak", "ISO, shutter,|*dari jauh*", "Atur ISO, shutter, aperture, dan white balance tanpa menyentuh kameranya.", "🎛️",
    ["Harus ke booth untuk ubah setelan", "Cahaya venue berubah-ubah", "Setelan sulit diulang"], ["ISO, shutter, aperture, WB dari dashboard", "Live view berdampingan", "Setelan tersimpan"],
    ["Buka Admin > Kiosk > Kamera", "Ubah setelan eksposur", "Lihat hasilnya di live view"], "dashboard", "Setelan pas tanpa lari-lari ke booth.", { stat: { value: 4, label: "setelan eksposur utama dari jauh" }, since: "2026-09", check: "Berlaku untuk kamera yang didukung digiCamControl." }),
  F("kamera-sdk", "Dukungan kamera Canon & Sony langsung", "Kamera & cetak", "Canon & Sony,|*tersambung langsung*", "Bridge kamera bawaan, deteksi kamera otomatis, tanpa instalasi tambahan.", "📸",
    ["Setup kamera bertele-tele", "Harus pasang software tambahan", "Kamera tidak terdeteksi"], ["Bridge Canon/Sony bawaan aplikasi", "Kamera terdeteksi otomatis", "Panduan kamera yang didukung"],
    ["Hubungkan kamera ke PC", "Aplikasi mendeteksi otomatis", "Pilih kamera lalu mulai sesi"], "booth-l", "Kamera terhubung, booth siap.", { since: "2026-11", check: "Canon: sudah diuji pada kamera fisik dan berhasil, memakai SDK resmi dari Canon (konfirmasi pemilik, 2026-11-21). Sony: belum diuji pada kamera fisik, jangan klaim 'terbukti' untuk Sony." }),
  F("live-view", "Live view saat dibutuhkan", "Kamera & cetak", "Live view,|*hanya saat perlu*", "Live view menyala saat sesi berjalan dan hemat daya di waktu lain.", "👁️",
    ["Kamera menyala terus", "Baterai & suhu cepat naik", "Live view tidak stabil"], ["Live view on demand", "Mode hemat daya", "Mirror toggle untuk webcam & DSLR"],
    ["Customer mulai sesi", "Live view menyala otomatis", "Sesi selesai, kembali hemat"], "booth", "Kamera lebih awet, sesi tetap lancar.", { since: "2026-10", check: "Perintah live view belum diverifikasi di kamera nyata." }),
  F("printer-kertas", "Printer & ukuran kertas", "Kamera & cetak", "Cetak pas|*di kertas apa pun*", "Atur ukuran 4R/5R/6R/A4, margin, fit, dan 2-up.", "🖨️",
    ["Hasil cetak terpotong", "Ukuran kertas tidak pas", "Setting printer berantakan"], ["Ukuran kertas siap pilih", "Margin & fit bisa diatur", "Mode 2-up hemat kertas"],
    ["Buka pengaturan printer", "Pilih ukuran & margin", "Cetak uji"], "print-l", "Satu kali atur, cetak rapi terus.", { since: "2026-11" }),

  // ---------- Operasional ----------
  F("dashboard-realtime", "Dashboard real-time", "Operasional", "Semua booth,|*satu layar*", "Omzet, transaksi, dan status kiosk, real-time.", "📊",
    ["Laporan lewat chat tiap malam", "Tidak tahu booth mana yang offline", "Rekap manual"], ["Omzet harian & grafik", "Status booth online/offline", "Riwayat transaksi lengkap"],
    ["Masuk ke dashboard", "Pilih booth atau lihat semua", "Pantau angka real-time"], "macbook", "Keputusan berdasarkan data, bukan tebakan.", { since: "2026-09" }),
  F("banyak-kiosk", "Dari 1 booth ke banyak", "Operasional", "Satu booth,|*lalu sepuluh*", "Tambah kiosk lewat kunci kiosk, semua dikelola dari satu akun.", "🧩",
    ["Setiap booth dikelola terpisah", "Data booth tercecer", "Naik skala bikin pusing"], ["Kunci kiosk per booth", "Semua booth dalam satu akun", "Pantau lintas booth"],
    ["Buat kunci kiosk", "Pasang di PC booth baru", "Booth muncul di dashboard"], "hub", "Skala naik, kerjaan tidak ikut berlipat.", { since: "2026-10" }),
  F("update-otomatis", "Update otomatis per kiosk", "Operasional", "Update sendiri,|*tanpa kunjungan*", "Kiosk mengunduh pembaruan dan memberi tahu customer dengan jelas.", "🔄",
    ["Update harus datang ke tiap booth", "Versi booth beda-beda", "Kiosk restart tiba-tiba"], ["Update otomatis (bisa dimatikan per kiosk)", "Notifikasi unduh & hitung mundur restart", "Versi kiosk terpantau"],
    ["Rilis versi baru", "Kiosk mengunduh di latar belakang", "Terpasang saat idle"], "dashboard", "Semua booth selalu terbaru.", { since: "2026-10" }),
  F("kesiapan-booth", "Pengaturan & kesiapan booth", "Operasional", "Booth siap?|*Ada ceklisnya.*", "Atur harga paket, tampilan, dan lihat checklist kesiapan tiap booth.", "☑️",
    ["Lupa setting sebelum event", "Harga paket sama semua booth", "Tidak tahu apa yang kurang"], ["Harga & ketersediaan paket per booth", "Teks dan tampilan per booth", "Ceklis kesiapan booth"],
    ["Buka pengaturan booth", "Atur paket dan tampilan", "Cek ceklis kesiapan"], "queue", "Datang ke event dengan tenang.", { since: "2026-11" }),
  F("kasir-pos", "Kasir satu layar", "Operasional", "Kasir & booth,|*satu sistem*", "Shift kasir, pesanan, antrian, dan refund dengan PIN supervisor.", "🧮",
    ["Kasir dan booth beda sistem", "Selisih kas tiap shift", "Refund tanpa kontrol"], ["Shift kasir dengan rekap", "Pesanan & antrian digital", "Refund dengan PIN supervisor"],
    ["Buka shift", "Catat pesanan & antrian", "Tutup shift, lihat laporan"], "queue", "Uang kas jelas, urusan antrian rapi.", { since: "2026-10", check: "Fitur POS belum tampil di landing; cek dulu sebelum dipromosikan." }),
  F("bantuan-chat", "Chat bantuan & laporan masalah", "Operasional", "Ada masalah?|*Tinggal chat.*", "Chat bantuan, lampiran screenshot, dan riwayat laporan masalah.", "💬",
    ["Minta bantuan lewat banyak jalur", "Masalah tidak tercatat", "Susah menjelaskan tanpa gambar"], ["Chat bantuan di dashboard", "Kirim screenshot dan tautan", "Riwayat laporan masalah"],
    ["Buka chat bantuan", "Jelaskan masalah + lampirkan", "Pantau balasan"], "dashboard", "Bantuan tidak pernah jauh.", { since: "2026-11" }),
  F("monitor-error", "Pantau error kiosk", "Operasional", "Kiosk bermasalah?|*Kamu tahu duluan.*", "Error dari kiosk dilaporkan ke dashboard, lengkap dengan konteks.", "🚨",
    ["Baru tahu setelah customer komplain", "Kiosk offline tidak terdeteksi", "Susah melacak penyebab"], ["Laporan error dari kiosk", "Status online/offline", "Notifikasi langsung"],
    ["Kiosk mengirim laporan", "Muncul di log aktivitas", "Kamu tindak lanjuti"], "dashboard", "Masalah kecil selesai sebelum jadi besar.", { since: "2026-09" }),
  F("offline-aman", "Sesi aman saat internet putus", "Operasional", "Internet putus?|*Sesi tetap jalan.*", "Sesi tersimpan lokal dan tersinkron lagi saat koneksi kembali.", "📶",
    ["Sesi gagal saat sinyal hilang", "Data foto hilang", "Antrian terhenti"], ["Sesi berjalan tanpa internet", "Data aman tersimpan", "Sinkron otomatis saat online"],
    ["Internet putus di tengah event", "Sesi lanjut berjalan", "Data tersinkron setelah pulih"], "booth", "Event tidak boleh berhenti hanya karena sinyal.", { since: "2026-10" }),

  // ---------- Bisnis & growth ----------
  F("trial-lisensi", "Coba gratis & lisensi per booth", "Bisnis & growth", "Coba dulu,|*baru putuskan*", "Daftar, dapat kunci uji coba, dan pasang di booth pertamamu.", "🗝️",
    ["Takut beli sebelum mencoba", "Setup sebelum tahu cocok atau tidak", "Lisensi membingungkan"], ["Daftar dan langsung masuk", "Kunci uji coba untuk booth", "Lisensi per booth yang jelas"],
    ["Daftar di studiodo.id", "Dapatkan kunci uji coba", "Pasang di kiosk & coba"], "dashboard", "Coba dulu, tanpa komitmen berat.", { since: "2026-10" }),
  F("login-tanpa-password", "Masuk dengan Google atau tautan email", "Bisnis & growth", "Masuk tanpa|*ribet password*", "Login pakai akun Google atau tautan sekali klik lewat email.", "✨",
    ["Lupa password", "Banyak akun yang diingat", "Reset berulang"], ["Masuk dengan Google", "Tautan email sekali klik", "Tetap aman"],
    ["Pilih Masuk dengan Google atau email", "Konfirmasi", "Langsung ke dashboard"], "dashboard", "Satu klik, langsung kerja.", { since: "2026-11", check: "Belum diuji dengan Google OAuth live." }),
  F("paket-plan", "Plan & fitur per paket", "Bisnis & growth", "Plan yang pas|*untuk skala-mu*", "Pilih plan sesuai kebutuhan: bulanan atau tahunan, dengan diskon.", "🧭",
    ["Bayar fitur yang tidak dipakai", "Harga sulit dibandingkan", "Tidak jelas fitur tiap plan"], ["Perbandingan plan yang jelas", "Opsi bulanan atau tahunan", "Fitur sesuai plan diterapkan per booth"],
    ["Bandingkan plan", "Pilih periode", "Aktifkan di booth"], "dashboard", "Mulai kecil, naik saat siap.", { since: "2026-10" }),
  F("marketplace-frame", "Marketplace template & kreator", "Bisnis & growth", "Frame baru,|*tinggal pasang*", "Pasang template dari marketplace, atau jadi kreator dan jual frame-mu.", "🛍️",
    ["Desain frame dari nol", "Tidak ada tempat jual desain", "Frame itu-itu saja"], ["Katalog template siap pasang", "Kreator bisa mengajukan template", "Tenant memasang sekali klik"],
    ["Buka marketplace", "Pilih template", "Pasang ke booth"], "gallery", "Desainer dan pemilik booth sama-sama untung.", { since: "2026-10" }),
  F("direktori-booth", "Direktori booth publik", "Bisnis & growth", "Booth-mu,|*bisa ditemukan*", "Tampilkan booth di direktori publik (opsional) agar mudah dicari.", "📍",
    ["Customer tidak tahu lokasi booth", "Tidak ada etalase online", "Promosi mengandalkan mulut ke mulut"], ["Direktori booth publik", "Opt-in, kamu yang kontrol", "Informasi booth rapi"],
    ["Aktifkan di pengaturan", "Lengkapi info booth", "Booth tampil di direktori"], "hub", "Dilihat orang tanpa iklan ekstra.", { since: "2026-10" }),
  F("panduan-onboarding", "Panduan onboarding bergambar", "Bisnis & growth", "Mulai dari nol?|*Ada panduannya.*", "Panduan bergambar dengan tangkapan layar asli dari login sampai printer.", "📖",
    ["Bingung mulai dari mana", "Panduan teks panjang", "Takut salah setting"], ["Panduan bergambar langkah demi langkah", "Screenshot dashboard asli", "Mencakup kamera & printer"],
    ["Buka panduan", "Ikuti langkah bergambar", "Booth siap dipakai"], "dashboard", "Pemula pun bisa mulai sendiri.", { since: "2026-11" }),

  // ---------- Tips bisnis (saran umum untuk pemilik booth; tanpa klaim produk) ----------
  F("tips-harga-paket", "Menentukan harga paket", "Tips bisnis", "Harga paket booth-mu|*asal tembak?*", "Mulai dari biaya per sesi, bukan dari harga kompetitor.", "🧮",
    ["Harga ikut-ikutan kompetitor", "Biaya cetak dan sewa tidak dihitung", "Untung tipis tanpa sadar"], ["Hitung biaya per sesi dulu", "Sisihkan margin untuk perawatan", "Tinjau harga tiap beberapa bulan"],
    ["Jumlahkan kertas, tinta, dan listrik per sesi", "Tambahkan sewa tempat dan perawatan", "Tentukan harga, lalu uji di event"], "none", "Harga yang sehat dimulai dari angka yang kamu hitung sendiri.", { kind: "tips" }),
  F("tips-antrean-event", "Mengatasi antrean event", "Tips bisnis", "Antrean event panjang?|*Ini caranya.*", "Antrean yang diatur rapi bikin customer sabar dan booth tetap produktif.", "⏳",
    ["Satu paket lama untuk semua orang", "Customer menunggu tanpa kabar", "Booth penuh tapi tidak ada yang selesai cepat"], ["Sediakan satu paket cepat", "Beri perkiraan waktu tunggu", "Pisahkan tempat ambil hasil dari area foto"],
    ["Tandai paket yang paling cepat", "Pasang papan perkiraan waktu", "Siapkan satu orang untuk mengatur antrean"], "none", "Antrean yang jelas terasa lebih pendek.", { kind: "tips" }),
  F("tips-lokasi-booth", "Memilih posisi booth", "Tips bisnis", "Booth-mu di pojok|*yang tidak kelihatan?*", "Posisi dan penerangan menentukan seberapa sering orang mampir.", "📍",
    ["Booth di sudut yang tersembunyi", "Tidak ada papan penunjuk", "Cahaya sekitar terlalu gelap"], ["Taruh dekat jalur orang lewat", "Pasang papan yang terlihat dari jauh", "Pastikan cahaya cukup dan lembut"],
    ["Jalan sekali di venue, cari jalur ramai", "Pasang papan di tinggi mata", "Tes cahaya sebelum tamu datang"], "none", "Orang mampir ke apa yang mereka lihat.", { kind: "tips" }),
  F("tips-frame-event", "Desain frame event", "Tips bisnis", "Frame event wedding|*asal jadi?*", "Frame yang terbaca jelas dan senada dengan acara terlihat lebih mahal.", "🖼️",
    ["Desain terlalu ramai", "Teks kecil dan susah dibaca", "Warna beda dari tema acara"], ["Selaraskan warna dengan tema", "Pakai teks singkat dan besar", "Cetak uji sebelum hari H"],
    ["Minta warna dan nama acara dari klien", "Beri ruang kosong untuk wajah", "Cetak satu contoh dan cek"], "none", "Frame yang rapi dibawa pulang dan dipajang.", { kind: "tips" }),
  F("tips-cek-sebelum-event", "Cek sebelum event", "Tips bisnis", "H-1 event,|*sudah cek ini?*", "Lima menit memeriksa hal kecil mencegah masalah di hari acara.", "✅",
    ["Printer belum diuji", "Kertas tinggal sedikit", "Koneksi venue tidak dicek"], ["Cetak uji satu sesi penuh", "Bawa kertas dan tinta cadangan", "Siapkan cadangan koneksi"],
    ["Jalankan satu sesi lengkap", "Hitung kertas untuk perkiraan tamu", "Cek sinyal di titik booth"], "none", "Persiapan kecil, hari acara tenang.", { kind: "tips" }),
  F("tips-konten-booth", "Booth ramai di Instagram", "Tips bisnis", "Ramai di lokasi,|*sepi di Instagram?*", "Hasil foto customer adalah materi promosi terbaikmu, kalau izinnya jelas.", "📣",
    ["Hasil foto tidak pernah dibagikan", "Tidak ada akun yang bisa di-tag", "Tidak ada ajakan ikut serta"], ["Minta izin lalu posting hasil terbaik", "Buat hashtag khas booth", "Ajak customer men-tag akunmu"],
    ["Pasang tulisan izin di booth", "Pilih hasil yang paling ceria", "Cantumkan akun dan hashtag di frame"], "none", "Izin dulu, baru posting.", { kind: "tips" }),
  F("tips-pelanggan-kembali", "Membuat customer kembali", "Tips bisnis", "Sekali datang,|*lalu hilang?*", "Alasan kecil untuk kembali bikin booth punya pelanggan, bukan hanya pengunjung.", "🔁",
    ["Tidak ada cara menghubungi lagi", "Promo hanya untuk orang baru", "Tidak ada alasan untuk datang lagi"], ["Kumpulkan kontak dengan izin", "Beri promo untuk yang kembali", "Umumkan frame atau tema baru"],
    ["Tanyakan kontak secara opsional", "Siapkan promo kembali sederhana", "Kabari saat ada frame baru"], "none", "Pelanggan dibangun dari alasan untuk kembali.", { kind: "tips" }),
  F("tips-perawatan-printer", "Merawat printer", "Tips bisnis", "Printer sering macet?|*Cek tiga hal ini.*", "Perawatan rutin lebih murah daripada printer mati di tengah event.", "🖨️",
    ["Kertas lembap atau salah jenis", "Kepala cetak jarang dibersihkan", "Driver dan setelan tidak diperiksa"], ["Simpan kertas di tempat kering", "Bersihkan sesuai petunjuk pabrik", "Cek setelan sebelum event"],
    ["Simpan kertas tertutup", "Jadwalkan pembersihan berkala", "Uji cetak sebelum dipakai"], "none", "Printer yang dirawat jarang mogok.", { kind: "tips" }),
  F("tips-pencahayaan", "Pencahayaan booth", "Tips bisnis", "Wajah customer gelap?|*Periksa cahayanya.*", "Cahaya yang tepat membuat foto terlihat bagus tanpa banyak setelan.", "💡",
    ["Cahaya datang dari belakang", "Ruangan terlalu gelap", "Ada pantulan di layar"], ["Arahkan cahaya dari depan", "Pakai lampu yang lembut", "Ubah posisi booth atau layar"],
    ["Cek bayangan di wajah", "Tambah lampu depan yang lembut", "Geser booth menjauh dari jendela"], "none", "Cahaya yang baik mengalahkan kamera mahal.", { kind: "tips" }),
  F("tips-kesepakatan-event", "Kesepakatan job event", "Tips bisnis", "Job event tanpa|*kesepakatan tertulis?*", "Catatan sederhana mencegah salah paham soal durasi, cetak, dan biaya.", "📝",
    ["Durasi dan jumlah cetak tidak jelas", "Biaya tambahan baru dibahas di akhir", "Pembayaran tidak tercatat"], ["Tulis durasi dan jumlah cetak", "Sepakati biaya tambahan di awal", "Simpan bukti pembayaran"],
    ["Buat daftar yang disepakati", "Kirim ke klien untuk dikonfirmasi", "Simpan di tempat yang mudah dicari"], "none", "Jelas di awal, tenang di akhir.", { kind: "tips" }),
  F("tips-mulai-bisnis", "Memulai bisnis booth", "Tips bisnis", "Baru mau buka booth?|*Mulai dari sini.*", "Mulai kecil, hitung dulu, dan belajar dari event pertama.", "🚀",
    ["Beli alat sebelum riset", "Tidak ada hitungan balik modal", "Desain dan paket belum jelas"], ["Riset lokasi dan jenis acara", "Hitung biaya per sesi", "Mulai kecil lalu perbaiki"],
    ["Amati acara di sekitarmu", "Hitung modal dan biaya per sesi", "Uji di satu event sebelum menambah alat"], "none", "Langkah pertama yang rapi menghemat banyak biaya.", { kind: "tips" }),
];

export const featureById = (id: string): Feature | undefined => FEATURES.find((f) => f.id === id);
