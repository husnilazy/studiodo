# Content Studio (Superadmin → Konten Instagram)

Generator carousel / Reel Instagram dengan gaya STUDIODO. Render dilakukan di PC server (Chrome headless + ffmpeg).

## Alur kerja lewat chat dengan Claude

1. Minta di chat: *"Buatkan carousel 5 slide tentang voucher event, nada santai."* Sebutkan format (carousel/Reel) dan topiknya.
2. Claude membalas dengan **JSON deck** (format di bawah).
3. Di panel: **Impor deck (JSON)** → tempel → **Muat deck** → cek preview → **Simpan perubahan**.
4. **Render PNG** (carousel) atau **Render MP4** (Reel) → unduh → upload ke Instagram.

Deck yang ada juga bisa dibagikan ke chat lewat tombol **Salin sebagai JSON** ("tolong ubah slide 3 jadi …").
Tidak perlu coding atau build ulang untuk deck baru. Coding hanya untuk jenis slide / mockup / gaya baru.

## Format JSON

```json
{
  "title": "Carousel · Nama internal",
  "format": "carousel",
  "tone": "light",
  "handle": "studiodo.id",
  "caption": "Teks caption...\n\nBaris kedua.",
  "hashtags": ["#studiodo", "#photobooth"],
  "slides": [
    { "kind": "cover", "eyebrow": "Label kecil", "title": "Baris satu|*kata aksen* di baris dua", "body": "Teks pendukung.", "mockup": "dashboard" }
  ]
}
```

- `format`: `carousel` (1080×1350, PNG) atau `reel` (1080×1920, MP4).
- `tone` (deck dan per slide): `light` | `dark` | `indigo` | `mint`.
- Judul: `|` = baris baru, `*kata*` = warna aksen.

### Jenis slide (`kind`)

| kind | Field yang dipakai |
|---|---|
| `cover` | `eyebrow`, `title`, `body`, `mockup` |
| `feature` | `eyebrow`, `title`, `body`, `mockup`, `note` |
| `steps` | `eyebrow`, `title`, `items` (3–5 langkah), `body`, `mockup` |
| `stat` | `eyebrow`, `title`, `stat: {value, suffix, prefix, label}`, `body`, `note` |
| `compare` | `eyebrow`, `title`, `itemsBefore`, `items`, `labelBefore`, `labelAfter`, `note` |
| `cta` | `eyebrow`, `title`, `body`, `mockup` |

### Mockup (`mockup`)

`none` · `dashboard` · `qris` · `gallery` · `booth` · `strip` · `queue` · `hub` (portrait / netral) dan versi landscape di monitor: `qris-l` · `booth-l` · `gallery-l` · `print-l` (hasil cetak 4R landscape)

### Foto

- `bgImage`: foto latar penuh (`"asset:<nama-file>"`). Unggah lewat editor slide (**+ Unggah foto latar**); nama file muncul setelah diunggah.
- `images`: foto untuk mockup `gallery` / `booth` / `strip`, juga lewat tombol unggah di editor.

### Khusus Reel

- `seconds` per slide = durasi scene (default 3.4, minimal 1.8).
- Slide dengan mockup besar (`qris`, `hub`, `booth`) dibuat lebih panjang (±4 detik) supaya animasinya selesai.

## Aturan isi

- Hanya klaim yang ada di fitur nyata (lihat `studiodo-web/src/components/landing/featureData.ts`).
- Jangan mengarang angka, testimoni, atau nama pelanggan. Angka di mockup hanyalah contoh tampilan.
- Maksimal 14 slide per deck.

## Teknis

- Kode: `server/lib/contentStudio/*`, `server/routes/contentStudio.ts`, `client/src/components/ContentStudioPanel.tsx`.
- Deck tersimpan di `storage/content-studio/decks.json`, foto di `storage/content-studio/assets` (folder `storage` tidak masuk git, jadi ikutkan backup).
- Butuh Chrome/Edge di PC server (`CHROME_PATH` untuk lokasi khusus) dan ffmpeg (sudah ada lewat `ffmpeg-static`).

## Rencana & jadwal (tab kedua di panel)

Manajemen konten untuk launching: urutan prioritas, tanggal tayang, status, dan checklist.

- **Rencana awal**: 32 post dalam 4 fase (Perkenalan → Prioritas inti → Perluas topik → Pendalaman), 4 post per minggu (Sen, Rab, Jum, Min, jam 19.00), kira-kira 8 minggu. Semua deck bawaan masuk tepat sekali.
- **Per post**: status (Ide, Draf, Siap posting, Terjadwal di IG, Sudah tayang), checklist 6 langkah, tanggal/jam, catatan, tombol **Buka di Studio**, serta naik/turun prioritas.
- **Jadwal**: atur tanggal mulai, hari, dan jam, lalu **Susun ulang jadwal**. Post yang sudah tayang tidak berubah. Mengubah urutan tidak mengubah tanggal sampai jadwal disusun ulang.
- **Cek profil**: checklist 9 langkah sebelum tayang pertama + saran bio.
- **Salin jadwal (teks)** untuk dibagikan ke tim.
- Tersimpan otomatis di `storage/content-studio/plan.json`.
- Format `story` dan post tambahan bisa dibuat manual (tanpa deck).

Deck seri perkenalan: `carousel-perkenalan-studiodo`, `reel-perkenalan-studiodo`, `carousel-fitur-lengkap`, `carousel-untuk-siapa`, `carousel-cara-mulai` (`server/lib/contentStudio/decks_batch4.ts`).

## Cover Sorotan Instagram

- Format **Cover Sorotan 9:16** (1080×1920) dengan jenis slide **Cover Sorotan (ikon)**: hanya ikon + lingkaran di tengah, karena Instagram memotong cover menjadi lingkaran.
- Deck bawaan `highlight-covers` berisi 6 cover: Kenalan, Fitur, Cara Mulai, FAQ, Update, Event. Ganti **Tema dasar** (indigo, gelap, terang, mint) untuk varian warna, dan pilih ikon lain di editor slide.
- **Render PNG** menghasilkan satu file per cover dengan nama `sorotan-01-kenalan.png` dst. Unggah satu per satu sebagai cover di Instagram (Sorotan → Edit sorotan → Edit sampul).

## Unduh sebagai video (MP4 HD)

- **Reel**: Render MP4 HD (1080×1920, 30 fps).
- **Carousel**: dua pilihan. **MP4 per slide (HD)** menghasilkan satu video beranimasi 5 detik per slide (1080×1350), cocok diunggah sebagai slide video dalam carousel Instagram. **MP4 Reel gabungan (HD)** mengubah seluruh carousel menjadi satu Reel 9:16 (tiap slide jadi scene ±4,2 detik).
- Encode H.264 High, CRF 15, warna BT.709 (warna brand tetap akurat di HP). Tanpa audio: tambahkan musik langsung di Instagram.
- Cover Sorotan hanya PNG. Render video butuh Chrome + ffmpeg di PC server dan memakan ±1 menit per deck.

## Pembuka Feed (3 tile menyambung)

Tab ketiga di panel: tiga postingan yang menyatu jadi satu gambar bergerak di baris pertama grid profil (logo silver → COMING SOON → All-in-One Photobooth App & Software). Gelap, tipografi bergerak, dan kolase mockup produk yang longgar di sekelilingnya: printer yang mencetak strip, QRIS, dashboard admin, sesi foto, galeri, notifikasi pembayaran, kartu statistik, dan strip foto yang bergerak. Ukurannya berbeda-beda (besar-kecil), miring, melayang pelan, masuk dengan gerakan berbeda, dan beberapa melintasi sambungan antar-tile. Satu sapuan cahaya melintasi ketiga tile.

- **Mode sambungan**: *Panorama* (default): tile persis berdampingan, ketiga PNG menyambung sempurna. *Grid 3:4*: tile bertumpang-tindih 72 px supaya bagian yang terlihat di grid Instagram (dipotong 36 px kiri-kanan) menyambung; PNG-nya sendiri tampak tumpang-tindih jika dijejer.
- **Logo** di tile kiri: silver metalik tanpa kotak (default, dengan sapuan cahaya), atau ikon kaca putih/gelap. Teks bisa diubah (judul coming soon, judul kanan, daftar fitur, tombol).
- **Output**: 3 PNG tile (`feed-1-kiri-logo`, `feed-2-tengah-coming-soon`, `feed-3-kanan-all-in-one`), `panorama-lengkap.png`, `URUTAN-UNGGAH.txt`, dan (mode MP4) 3 video HD 9 detik dari satu proses ffmpeg. Pakai PNG sebagai cover video.
- **Urutan unggah**: kanan → tengah → kiri (postingan terbaru tampil di kiri atas).
- Kode: `server/lib/contentStudio/triptych.ts` (daftar kartu kolase ada di array `cards`).

## Logo STUDIODO

Tab keempat: **logo silver metalik** (wordmark tanpa kotak + "Photobooth Apps", dengan gradasi logam ala titanium dan sapuan cahaya) serta ikon aplikasi kaca (squircle) versi gelap dan putih. Render 6 PNG: `logo-studiodo-silver.png` (transparan), `foto-profil-studiodo-silver.png`, `icon-studiodo-dark/white.png` (transparan), dan `foto-profil-studiodo-dark/white.png`. Logo silver juga dipakai di Pembuka Feed dan di slide Cover Sorotan dengan ikon `app` (deck `highlight-covers`, "Kenalan"; di tema terang/mint dipakai versi grafit). Kode: `server/lib/contentStudio/appicon.ts`.

## Animasi "keluar dari printer" dan ilustrasi foto

- Semua mockup (dashboard, kiosk QRIS, galeri, dst.) muncul dengan gerak seperti kertas keluar dari slot printer: meluncur bertahap (gaya printer termal) dari slot di atas area mockup, lalu isinya terisi. Berlaku untuk carousel, Reel, dan video.
- Foto placeholder di mockup memakai ilustrasi orang datar yang sama dengan landing page (`portraits.ts`), bukan siluet abu-abu. Foto asli yang diunggah tetap menggantikannya.

## Teaser Reel (motion graphic penuh, 1080×1920)

Tab "Teaser Reel (penuh)": satu motion graphic utuh ±19 detik untuk Reels, dari awal sampai akhir, dengan empat adegan yang menyambung dan sapuan cahaya sebagai transisi:

1. **Logo** (0–3,9 dtk): kilatan kamera, cincin riak, wordmark silver menyapu masuk dengan slogan "Photobooth Apps".
2. **COMING SOON** (3,4–7,7 dtk): huruf besar masuk dengan blur, dikelilingi kartu produk yang melayang (notifikasi pembayaran, QR, statistik, strip foto bergerak, printer).
3. **Alur produk, 4 langkah** (7,3–14 dtk): *Bayar QRIS* → *Foto & cetak* (printer mencetak strip) → *Hasil di HP* (galeri + QR) → *Pantau dashboard* (angka berhitung). Penunjuk langkah 01/04 dan titik progres di bawah.
4. **All-in-One** (13,6–19,2 dtk): judul, daftar fitur, tombol ajakan, dan logo penutup.

Teks tiap adegan bisa diubah di panel (judul coming soon, empat langkah, judul penutup, fitur, tombol, gaya logo). Render menghasilkan `teaser-studiodo-1080x1920.mp4` (H.264 HD, 30 fps, tanpa audio) dan `teaser-cover-1080x1920.png`. Kode: `server/lib/contentStudio/teaser.ts`; kartu kolase dipakai ulang dari `triptych.ts`.

## Konten casual untuk pemula

Tiga jenis slide tambahan untuk konten santai (tone `peach` = hangat):

- `hook` — judul dengan stabilo (`**kata**` jadi bagian ber-highlight), `eyebrow` jadi sticker miring, `emoji` besar.
- `chat` — obrolan ala DM: `chat: [{ "from": "them" | "us", "text": "..." }]`. Di editor: satu pesan per baris, awali `Q:` (penanya) atau `A:` (STUDIODO).
- `note` — catatan tempel warna-warni dari `items`.

Delapan deck pemula siap pakai ada di `decks_batch5.ts` (id `carousel-bingung-pilih-aplikasi`, `carousel-aplikasi-ngapain-sih`, dst). Rencana yang sudah tersimpan tidak otomatis menambah item baru; pakai "+ Tambah" di tab Rencana.

Tata letak tab Studio desain: tombol "+ Carousel / + Reel / Impor deck (JSON)" ada di atas, daftar deck scroll di kotaknya sendiri, dan kolom preview/editor bergulir terpisah.

## Animasi masuk mockup

Hanya mockup berbentuk kertas yang "keluar dari printer": `qris`, `strip`, `print-l`. Mockup lain punya animasi masuk sendiri (atribut `in` di `MOCKS`, `templates.ts`): dashboard naik+blur, gallery miring 3D, booth zoom-bounce, queue geser dari kanan, hub berputar, qris-l jatuh memantul, booth-l flip, gallery-l mengayun.

## Generator, Kalender & Auto-post (2026-11-19)

Tab baru: **Ringkasan · Generator · Kalender · Studio desain · Aset profil · Pengaturan** (komponen di `client/src/components/ig/`).

- **Katalog fitur** (`server/lib/contentStudio/features.ts`): 40 fitur STUDIODO ditulis sebagai bahan konten (hook, masalah/solusi, langkah, mockup, tip). Fitur bertanda `check` (kamera SDK, live view, multi-kamera, GIF/video, DOKU, login Google, POS) menampilkan peringatan "cek klaim" karena belum terbukti di perangkat/akun nyata.
- **Generator** (`generator.ts`): satu fitur -> carousel 5 slide + reel 5 scene, gaya **Contact Sheet**, 3 variasi caption, hashtag per pilar. Deterministik, tanpa AI; deck tersimpan dengan id `ft-<fitur>-c|r`.
- **Gaya Contact Sheet** (`styleContact.ts`, `deck.style = "kontak"`): kertas/tinta/kobalt/kuning/blush, pita film bergulir + penghitung frame, judul Fraunces yang naik per baris, stabilo, cap karet, "print" ditempel stop-motion, strike-through animasi, marquee, kilat shutter antar scene. Font: Fraunces + Space Grotesk (`server/assets/fonts`). Deck lama tetap "klasik".
- **Kalender / antrean** (`schedule.ts`, `storage/content-studio/queue.json` + `settings.json`, tanpa migrasi DB): status draft -> scheduled -> preparing -> ready -> posting -> posted (atau failed/skipped). Mode **Auto** (server kirim ke Instagram) atau **Manual** (file disiapkan, unduh lalu "Tandai terposting"). Draf hasil Autopilot harus disetujui dulu kecuali "Setujui otomatis" dinyalakan.
- **Worker** (`publisher.ts`, tiap 60 dtk, hanya di server PC): render `prepLeadMin` menit sebelum tayang (carousel = JPEG, Instagram tidak menerima PNG; reel = MP4 + cover), kirim lewat Graph API, retry 5 menit lalu 20 menit lalu gagal, batas posting per hari, pemulihan setelah restart (post yang sedang "posting" ditandai gagal, bukan diulang, supaya tidak dobel).
- **Instagram** (`instagram.ts`): container -> tunggu FINISHED -> `media_publish`. Kredensial dari `.env` (`IG_USER_ID`, `IG_ACCESS_TOKEN`, opsional `IG_GRAPH_HOST`, `IG_API_VERSION`) atau diisi di Pengaturan (disimpan di `storage/content-studio/ig-connection.json`). Instagram mengunduh media dari `GET /api/public/cs-media/:token/:file` (token acak per post, hanya aktif saat siap/sedang dikirim); alamat dasar = `CS_MEDIA_BASE_URL` > `PUBLIC_BASE_URL` > `APP_BASE_URL`. "Tes koneksi" di Pengaturan memeriksa token dan keterjangkauan alamat publik.
- **Autopilot**: mengisi kalender dari katalog (pilar bergantian, tiap fitur sekali per format, reel tiap N post) sepanjang `horizonDays`; tombol "Isi kalender sekarang" atau otomatis tiap 6 jam bila dinyalakan.

Go-live: `npm run build:server` + `build:client`, restart service StudiodoServer, isi kredensial Instagram, jalankan "Tes koneksi", coba satu post.

## Gaya "Kaca" dan hook (2026-11-19)
- **Gaya resmi sekarang `kaca`** (`styleKaca.ts`): dasar gelap, aurora warna, rusuk kaca bergalur, panel kaca buram, pil outline, judul Bricolage Grotesque dengan satu kata aksen Instrument Serif miring. Logo = wordmark STUDIODO yang sudah ada, tanpa slogan. Contact Sheet (`kontak`) dan Klasik tetap ada dan bisa dipilih per deck.
- **Tema warna** (`deck.theme`): biru, ungu, rose, senja, tosca. Generator memutar tema per fitur supaya feed tidak jadi satu warna. Tidak ada hijau neon.
- **Susunan berbeda tiap konten**: tiap jenis slide punya beberapa komposisi (sampul 3 + foto, bandingkan 2, langkah 2, catatan 2, penutup 2). Pilihan ditentukan dari id deck, jadi hasilnya stabil tapi antar-deck berbeda.
- **Foto sendiri**: foto latar penuh di sampul otomatis memakai komposisi foto (Ken Burns); foto latar di slide lain dipakai redup. Video unggahan belum didukung.
- **Hook** ada di `hooks.ts`, satu per fitur, dari sudut pandang pemilik booth (pertanyaan, rasa sakit, POV). Aturan: dramatis boleh, klaim harus tetap benar. Tes memastikan setiap fitur punya hook sendiri.
- **Ajakan komentar**: semua caption berisi `Komen "COBA"`. Belum ada balasan otomatis, jadi komentar harus dibalas manual (atau lewat integrasi DM nanti).
- Font woff2 (Bricolage, Instrument Serif, Inter) ada di `server/assets/fonts`; lisensi OFL.

## Tinjau di HP dan catatan revisi
- Tab **Tinjau** (tab pertama) menampilkan tiap post antrean dengan preview nyata, caption, peringatan klaim, dan tombol setujui / kirim / hapus. Halaman bisa ditambahkan ke layar utama iPhone (manifest + ikon di `client/public`).
- **Minta revisi**: catatan disimpan di `post.revision`, post kembali jadi draf dan tidak bisa disetujui sampai catatannya dibatalkan atau dibersihkan (`PATCH /queue/:id` dengan `revision: ""`). Catatan dibaca dan dikerjakan di sesi Claude Code; belum ada pengerjaan otomatis di server.

## Bahan foto dari booth sendiri
- Tab **Bahan foto**: pilih tenant (booth kita), lihat sesi selesai yang punya foto, ketuk foto atau strip yang cocok (maks 8), pilih fitur dan format, lalu **Buat konten**. Foto diimpor ke aset Studio (`asset:<file>`) dan generator (`withPhotos`) memasangnya: foto pertama jadi sampul penuh, foto kedua latar redup di slide 2, strip masuk ke mockup cetak.
- **Izin dulu**: daftar bawaan hanya sesi dengan `publishConsent` (pop-up izin media sosial di kiosk). Sesi tanpa izin hanya tampil bila dicentang, dan impornya ditolak server (409) kecuali ada konfirmasi bahwa izin didapat di luar aplikasi.
- Rute: `GET /content-studio/source/tenants`, `GET /source/sessions?tenantId=&all=1&before=`, `POST /source/import`; `POST /generate` menerima `photos` dan `strips`. Impor membaca file lokal `/storage/...`, URL R2, atau unduhan Google Drive; sumber yang bukan gambar ditolak.
- Belum diuji terhadap data tenant nyata (butuh server yang sudah dirilis dan sesi berfoto).
- **Foto saya** (bagian atas tab Bahan foto): unggah foto dari galeri HP/komputer, di luar kiosk. Foto dikecilkan ke JPEG maks 2000 px di perangkat sebelum dikirim (`POST /assets`), disimpan sebagai aset Studio, bisa dipilih bersama foto sesi, dan dihapus lewat tombol ×. Pratinjau memakai `GET /assets/:name/file` (butuh login). Hanya gambar JPG/PNG/WebP; video dan HEIC belum didukung. Tanggung jawab izin ada di pengunggah.
