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
