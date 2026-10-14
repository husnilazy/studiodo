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

`none` · `dashboard` · `qris` · `gallery` · `booth` · `strip` · `queue` · `hub`

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
