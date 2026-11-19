---
name: studiodo-instagram
description: Mengelola Instagram STUDIODO (Superadmin → Konten Instagram). Pakai saat user minta bikin/jadwalkan/cek/publish konten Instagram, caption, hook, kalender konten, atau analisis kompetitor.
---

# Instagram STUDIODO

Mesin ada di `server/lib/contentStudio/`, UI di `client/src/components/ig/`, dokumen di `docs/content-studio.md`. Baca dokumen itu bila perlu detail format.

## Aturan keras
- **Jangan publish, jadwalkan mode otomatis, atau kirim apa pun ke Instagram tanpa persetujuan user untuk konten itu, di pesan itu.** Persetujuan satu postingan tidak berlaku untuk yang lain. Mode `auto` di jadwal hanya boleh dinyalakan kalau user sendiri yang minta.
- Token (`IG_ACCESS_TOKEN`), `.env`, dan isi pengaturan koneksi tidak pernah dicetak atau diminta lewat chat. Cek keberadaannya saja (`GET /ig/status`).
- Komentar dan DM dibalas user sendiri. Jangan membalas, menyukai, atau mengikuti akun atas nama STUDIODO.
- Foto/wajah customer hanya dengan izin. Tanyakan sumber dan izinnya sebelum dipakai di desain.
- Klaim harus literal. Fitur di `features.ts` yang punya `check` BELUM terbukti di perangkat nyata: tampilkan peringatannya ke user sebelum diposting dan jangan tulis "terbukti/teruji". Jangan mengarang angka (jumlah booth, kepuasan, omzet); kompetitor memakainya, kita tidak punya datanya.
- Folder repo mengandung `&`: jalankan lewat `../../../node_modules/.bin/...` dari worktree atau `node ./node_modules/...`. Jangan commit/push tanpa diminta.

## Alur kerja (user cek dulu, baru publish)
1. **Rencana**: pilih fitur/pilar (`FEATURES`, 6 pilar; jangan pilar sama dua kali berturut-turut) dan format. Carousel tiap beberapa post, reel tiap ke-3.
2. **Buat**: `POST /generate` atau tombol Generator. Hasilnya deck bergaya `kaca` dengan tema warna berputar. Caption 3 gaya (`captionFor`).
3. **Render & cek visual**: render PNG/MP4 lewat Studio; periksa sendiri hasilnya (teks terpotong, mockup bocor, hook 4 baris, kontras) sebelum menunjukkan ke user. Jangan bilang "sudah dicek" kalau tidak dilihat.
4. **Antre sebagai draf/manual**: `POST /queue`. User menyetujui di tab Kalender atau lewat `POST /queue/approve`.
5. **Publish**: hanya setelah user bilang untuk post itu. Jadwal `auto` dijalankan server; `post-now` / `mark-posted` untuk manual. Laporkan permalink hasilnya, atau error aslinya bila gagal.
6. **Catat**: perubahan penting ke `docs/content-studio.md` dan memori.

Prasyarat posting nyata (cek, jangan asumsikan): `IG_USER_ID`, `IG_ACCESS_TOKEN`, `CS_MEDIA_BASE_URL` atau `PUBLIC_BASE_URL` (Instagram mengambil media dari URL publik), Chrome dan ffmpeg di PC server, lalu `POST /ig/test` ("Tes koneksi"). Posting nyata pertama harus diawasi user. Per 2026-11-19 alur publish baru diuji ke API palsu.

## Catatan revisi dari HP (tab Tinjau)
User bisa menulis "Minta revisi" di kartu post. Server menyimpannya di `post.revision = { text, at }` dan menahan post sebagai `draft` (`approvable()` menolak persetujuan sampai catatan dihapus). Di awal sesi atau saat user menyebut revisi:
1. Baca antrean: `GET /queue` (perlu sesi superadmin), atau bila server berjalan di PC ini, `storage/content-studio/queue.json`. Cari post dengan `revision`.
2. Kerjakan sesuai catatan: ubah hook di `hooks.ts`, tema/komposisi, caption (`PATCH /queue/:id` dengan `caption`/`hashtags`), atau deck di Studio. Perubahan kode butuh build + rilis agar muncul di server produksi; sampaikan itu.
3. Cek hasilnya secara visual, lalu bersihkan catatan: `PATCH /queue/:id` dengan `{ "revision": "" }`. Post tetap draf; user yang menyetujui lagi di Tinjau.
4. Jangan menghapus catatan sebelum revisinya benar-benar selesai, dan jangan menyetujui atas nama user.

## Foto dari booth sendiri
Tab **Bahan foto** mengambil foto sesi tenant lewat server (`/source/*`); jangan membaca database produksi atau mengunduh foto customer di luar alat itu. Hanya sesi ber-`publishConsent` yang dipakai; sesi tanpa izin butuh konfirmasi user bahwa izin didapat di luar aplikasi. Setelah user memilih, generator menerima `photos`/`strips` (`withPhotos`). Cek hasil render: wajah tidak terpotong dan foto portrait di sampul tetap terbaca.

## Hook (cover dan 3 detik pertama reel)
Satu hook per fitur di `hooks.ts`; tes mewajibkan semua fitur punya hook unik. Tulis dari sudut pemilik booth, bukan dari nama fitur:
- **Pertanyaan rasa sakit**: "Customer mau bayar, kamu masih *cek mutasi?*"
- **Skenario**: "Besok event. Booth-mu *sudah siap?*"
- **Kontras angka/skala**: "Dari 1 booth ke 10, kerjaan *nggak ikut 10x*"
- **Peringatan ringan**: "Satu orang bisa tarik *semua saldo?* Bahaya."
Format: maksimal 2 baris dipisah `|`, satu kata/frasa aksen `*...*` (serif miring bergradasi), kurang dari sekitar 30 karakter per baris. Dramatisasi masalah boleh, jawabannya harus fitur yang benar-benar ada.

## Caption
Pembuka = hook, lalu masalah/solusi singkat, manfaat, tip, lalu CTA tetap: `Komen "COBA" dan kami bantu mulai trial gratis` + `studiodo.id (link di bio)`. Kata kunci ada di `CTA_KEYWORD` (`hooks.ts`). Maksimal 2200 karakter dan 30 hashtag; hashtag spesifik (pilar + dasar), bukan 3 tag generik. Komentar "COBA" dibalas manual oleh user, jadi ingatkan bila jadwal padat.

## Gaya visual "kaca" (`styleKaca.ts`)
Dasar gelap, aurora, rusuk kaca, panel kaca buram, pil outline, judul Bricolage 800 + aksen Instrument Serif miring, wordmark STUDIODO yang sudah ada, TANPA slogan, tanpa hijau neon. Tema: biru, ungu, rose, senja, tosca (`deck.theme`), jangan membuat feed satu warna. Tiap jenis slide punya beberapa komposisi; jangan paksa semua slide memakai kartu kaca. Foto latar penuh di sampul memakai komposisi foto. Class CSS Kaca berawalan `k_` karena nama umum bentrok dengan CSS mockup di `theme.ts`; pertahankan itu pada gaya baru.

## Dari analisis kompetitor (2026-11-19)
- photolab.tech: mockup produk, ungu+mint, 2-4 post/bulan, hampir tanpa CTA.
- jepreto.digital: model manusia, ungu+kuning, posting tiap 2-3 hari, CTA "Komen COBA JEPRETO", menyebut harga.
- Keduanya ~1 ribu pengikut dengan suka sangat rendah: jangkauan mereka bukan bukti formatnya berhasil. Pembeda kita: foto strip asli, susunan berbeda tiap post, tema warna, hook masalah owner, CTA jelas.

## Tes dan verifikasi
`vitest run server/lib/contentStudio` (hook, komposisi, caption, jadwal, publisher) dan `tsc --noEmit -p .`. Untuk perubahan tampilan, render PNG dengan puppeteer-core + Chrome lokal dan lihat hasilnya. Laporkan yang TIDAK terverifikasi: ekspor MP4 reel Kaca, posting Instagram nyata, tema lain di semua jenis slide.
