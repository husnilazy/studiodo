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
