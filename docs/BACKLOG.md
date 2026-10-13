# Backlog STUDIODO Kiosk

Ide dan temuan yang ditampung untuk rencana ke depan. Belum dikerjakan. Urutan di tiap bagian kira-kira berdasarkan manfaat.

## Rilis & distribusi
- **Rilis otomatis lewat GitHub Actions.** Saat ini build dan unggah file rilis dilakukan manual. Satu workflow yang berjalan saat tag `v*` didorong akan membuild lalu mempublikasikan rilis. Ini menghapus risiko salah nama file (spasi jadi titik di GitHub) dan lupa mengunggah `latest.yml`.
- **Tanda tangan kode (code signing) untuk installer.** Tanpa itu Windows SmartScreen menampilkan "Windows protected your PC" di setiap PC baru, dan ini membingungkan crew.
- **Angka persyaratan sistem di halaman `/unduh` masih rekomendasi, belum diukur.** Ukur pemakaian RAM/CPU kiosk saat paket GIF+video berjalan di PC booth sungguhan, lalu perbarui angkanya.
- Halaman riwayat versi di website sendiri, supaya tautan "Catatan rilis" tidak mengarah ke GitHub.

## Admin kiosk
- Halaman admin lain (Kamera, Printer, Kunci Kiosk, Pembayaran, Voucher, Profil Gallery, Flow, Kelola Frame, CRM detail) sudah ikut tema dan warna baru lewat token, tapi tata letak masing-masing belum didesain ulang satu per satu.
- Dashboard Superadmin belum memakai tema terang/gelap, tampilan baru, maupun keyboard layar. Perlu disatukan dengan admin tenant.
- Pintu masuk tersembunyi: jumlah ketukan dan posisi pojok dibuat bisa diatur per tenant, dan opsi PIN singkat sebelum form login admin.
- Tombol "Keluar admin" yang menutup jendela admin dan kembali ke kiosk (sekarang crew menutup jendelanya sendiri).
- Notifikasi error admin menumpuk saat offline ("Gagal memuat data terbaru" muncul berulang). Perlu digabung menjadi satu notifikasi.
- Keyboard layar: tambah dukungan editor teks di Screen Builder dan kolom di konsol Superadmin; opsi ukuran keyboard.

## Kamera & sesi foto
- Jendela Live View digiCamControl bisa sempat berkedip di depan kiosk saat dinyalakan. Cari cara menyembunyikannya sepenuhnya (mis. posisi jendela di luar layar).
- Uji rekaman klip (mulai 1,5 detik setelah ketukan, atau langsung saat hitung mundur di mode otomatis) dengan DSLR sungguhan pada paket GIF+video.
- Tampilan halaman Hasil (tab Foto/GIF/Video dan bilah bawah menempel) belum dilihat langsung di layar kiosk.
- Pemeriksaan baterai dan kartu memori kamera lewat digiCamControl (jika propertinya tersedia) agar crew diberi tahu sebelum sesi.
- Bunyi/indikator "sedang merekam" kecil di layar kamera supaya pelanggan tahu klip sedang diambil.

## Kualitas & pemeliharaan
- Tes otomatis untuk alur kiosk (ada kamera palsu dan printer palsu). Saat ini hanya ada 12 tes unit.
- `.env` punya `STORAGE_DRIVER` ganda (r2 di baris 17, gdrive di baris 25; yang terakhir menang). Rapikan, dan periksa juga environment service NSSM.
- Penanganan konflik Git credential manager: push dari PC ini pernah macet saat butuh login GitHub interaktif.
- Perbarui README dengan cara rilis, struktur admin, dan catatan `&` pada path yang merusak `npx`.

## Langganan per booth & audit (Oktober 2026)
- **Harga paket sekarang dihitung per booth.** Periksa harga di Superadmin → Plans: angka lama (mis. Starter/Pro/Business dengan batas 1/3/10 kiosk) tadinya harga paket bundel, sekarang dianggap harga satu booth. "Batas kiosk" pada plan hanya tampilan, tidak lagi membatasi.
- Gateway langganan baru mendukung Midtrans dan Xendit. DOKU belum tersedia untuk bayar langganan (hanya untuk QRIS kiosk milik tenant).
- Tes koneksi Xendit milik tenant (cek izin QR code) dan fungsi "Cek ulang" status order ke Midtrans/Xendit belum diuji dengan kunci sungguhan; bentuk respons API-nya diasumsikan dari dokumentasi.
- Kredensial R2 dan Google Drive per tenant masih tersimpan polos di database (kunci Xendit/DOKU sudah terenkripsi). Enkripsi dengan `lib/secretBox.ts` dan jalankan `server/scripts/encryptTenantSecrets.ts --apply` untuk kunci Xendit lama.
- Token login admin (JWT 12 jam) tidak bisa dicabut dari server; ganti password belum membatalkan sesi yang sudah ada. Pembatasan percobaan login memakai memori satu proses.
- Dashboard web belum mencakup Screen Builder, pengaturan alur kiosk, CRM pelanggan, dan penyimpanan cloud (R2/Drive); semuanya masih di aplikasi kiosk.
- Notifikasi otomatis (email/WhatsApp) saat trial atau langganan booth hampir habis belum ada; sekarang hanya banner di dashboard dan layar kunci.

## CRM & monitor booth (Oktober 2026)
- "Antrian" di Monitor Booth berarti sesi yang menunggu pembayaran. Server tidak tahu antrean fisik di depan booth; antrean sungguhan butuh fitur nomor antrean di kiosk.
- Tahap sesi (bayar / foto / preview) disimpulkan dari data sesi, bukan dilaporkan layar kiosk, jadi bisa tertinggal beberapa detik. Untuk akurasi penuh, kiosk bisa mengirim "layar saat ini" ke server.
- Sesi lama (sebelum kolom `kiosk_key_id`) tidak diketahui asal boothnya, jadi riwayat per booth di CRM kosong untuk sesi lama.
- Pelanggan digabung per nomor WhatsApp (format 08…/+62…/62… dianggap sama), lalu email. Orang yang memakai nomor dan email berbeda di kunjungan berbeda tercatat sebagai dua pelanggan.
- Kirim promo massal lewat WhatsApp sengaja belum ada (risiko pemblokiran nomor); sekarang satu per satu lewat tombol WhatsApp.
