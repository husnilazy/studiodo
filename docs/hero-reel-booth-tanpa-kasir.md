# Reel unggulan: "Booth tanpa kasir" (30 detik, 9:16)

Satu konten yang memadukan tiga sumber, masing-masing untuk yang paling cocok:

| Sumber | Dipakai untuk | Kenapa |
|---|---|---|
| **Higgsfield (AI video/gambar)** | adegan manusia dan suasana: antrean, tamu berfoto, owner santai | sulit/mahal difilmkan sendiri |
| **Tangkapan layar aplikasi asli** | layar QRIS kiosk, galeri QR, dashboard | AI tidak boleh meniru UI produk: harus asli supaya tidak menyesatkan |
| **Motion graphic STUDIODO (mesin render kita)** | judul/hook, daftar manfaat, logo, ajakan "Komen COBA" | gaya merek seragam, teks tajam (AI buruk dalam teks) |
| **ElevenLabs** | voice over Bahasa Indonesia | suara konsisten, bisa diulang |

## Naskah voice over (29 detik, sudah dibuat, suara "Finn")
"Antrean panjang. Customer mau bayar. Dan kamu masih cek mutasi satu per satu? ... Di STUDIODO, QRIS muncul langsung di layar kiosk. Scan, bayar, sesi foto mulai sendiri. Hasilnya dicetak, dan customer bisa unduh lewat galeri QR di HP mereka. Kamu? Tinggal pantau omzet dan status booth dari dashboard. Booth tetap jalan, tanpa operator. Coba gratis di studiodo titik id. Komen COBA, kami bantu mulai."

Klaim yang dipakai semuanya sudah ada di aplikasi (QRIS otomatis, cetak, galeri QR, dashboard). Tidak ada angka karangan dan tidak ada fitur bertanda "belum terbukti".

## Susunan adegan
| # | Waktu | Isi visual | Sumber | VO |
|---|---|---|---|---|
| 1 | 0-4 | Antrean di booth mal, owner memegang HP, wajah bingung | AI clip A | "Antrean panjang. Customer mau bayar. Dan kamu masih cek mutasi satu per satu?" |
| 2 | 4-10 | Tamu memindai QR di layar kiosk dengan HP; sisipan layar QRIS asli | AI clip B + tangkapan layar QRIS asli | "Di STUDIODO, QRIS muncul langsung di layar kiosk. Scan, bayar, sesi foto mulai sendiri." |
| 3 | 10-16 | Tiga teman berpose, kilatan lampu, strip foto keluar dari printer | AI clip C + D | "Hasilnya dicetak, dan customer bisa unduh lewat galeri QR di HP mereka." |
| 4 | 16-22 | Owner santai minum kopi, melirik HP; layar HP diganti tangkapan dashboard asli | AI clip E + dashboard asli | "Kamu? Tinggal pantau omzet dan status booth dari dashboard." |
| 5 | 22-26 | Tiga manfaat muncul (Tanpa operator, Tercatat rapi, Hasil di HP) dengan karakter ilustrasi | motion graphic STUDIODO | "Booth tetap jalan, tanpa operator." |
| 6 | 26-30 | Logo, tombol "Coba gratis", ajakan Komen COBA | motion graphic STUDIODO | "Coba gratis di studiodo titik id. Komen COBA, kami bantu mulai." |

Teks di layar (hook, manfaat, ajakan) selalu dari mesin kita, tidak pernah dari AI. Beri keterangan kecil "Adegan ilustrasi dibuat dengan AI" di sudut adegan AI, dan aktifkan label konten AI Instagram saat posting.

## Prompt Higgsfield (bahasa Inggris, 9:16, tanpa teks/logo di dalam klip)
Gaya umum: *photorealistic, handheld smartphone feel, warm indoor mall lighting, shallow depth of field, Indonesian young adults, natural expressions, no text, no logos, no watermark*.

- **A (0-4 s):** "Vertical shot in a busy Indonesian shopping mall, a short queue of teenagers and friends waiting beside a modern white self-service photobooth kiosk with a large touchscreen. In the foreground a young woman booth owner in casual clothes checks her phone, slightly confused, glancing at the queue. Handheld, natural light, shallow depth of field."
- **B (4-10 s):** "Close handheld shot of a young man holding up his smartphone to scan a large QR code on the touchscreen of a white photobooth kiosk, friends behind him smiling. The screen glows softly but shows only an abstract QR pattern, no readable text. Photorealistic, warm light."
- **C (10-13 s):** "Three friends squeezing together inside a small photobooth, laughing and striking playful poses, a bright flash of ring light, confetti-like sparkle. Vertical, energetic, handheld."
- **D (13-16 s):** "Macro shot of a printed photo strip sliding out of a compact photo printer, a hand picking it up and smiling at it. Shallow depth of field, soft bokeh background of a mall."
- **E (16-22 s):** "A relaxed young woman booth owner sitting at a small cafe table near her photobooth, holding an iced coffee, glancing at her smartphone with a satisfied smile; in the background a few customers walk into the booth. Natural light, calm, handheld. Phone screen is angled away so no screen content is readable."

Catatan: layar HP/kiosk di klip dibuat kosong atau abstrak, lalu diganti tangkapan layar asli di tahap penyusunan.

## Model dan perkiraan biaya (dari estimasi Higgsfield, 9:16, 720p)
- Rekomendasi: **Gemini Omni Flash 1.2**, 6 detik ≈ **13,5 kredit** per klip; **Seedance 2.5**, 5 detik ≈ **35 kredit** (lebih mahal, referensi lebih kuat).
- Bingkai awal (gambar) dengan gpt_image_2_6 ≈ **0,25 kredit** per gambar, supaya orang dan lokasi konsisten antar klip (image-to-video).
- Paket hemat: 5 bingkai (≈1,3 kredit) + 5 klip Omni (≈68 kredit) ≈ **70 kredit**; dengan satu ulangan per klip ≈ **140 kredit**.
- Saldo saat ini: **0 kredit, paket gratis**. Pembelian kredit atau naik paket dilakukan Anda sendiri.

## Penyusunan akhir (di PC, ffmpeg + Chrome)
1. Latar: klip AI A-E dipotong dan disambung dengan transisi cepat (tombol cut atau sapuan cahaya seperti gaya Kaca).
2. Sisipan UI asli: tangkapan layar QRIS kiosk, galeri QR, dan dashboard dari aplikasi yang berjalan, ditempelkan ke layar HP/kiosk di klip.
3. Overlay motion graphic (hook, manfaat, logo, ajakan) dirender mesin kita sebagai bingkai transparan, ditumpuk di atas video.
4. Voice over ElevenLabs dipasang, musik latar opsional (hanya yang berlisensi).
5. Ekspor MP4 1080x1920, cek manual sebelum dijadwalkan sebagai draf di Tinjau.

## Catatan lisensi dan etika
- Paket gratis ElevenLabs umumnya tidak mencakup izin komersial penuh; cek ketentuan akun sebelum voice over dipakai di iklan atau feed bisnis.
- Wajah di klip AI bukan orang sungguhan dan booth di klip bukan perangkat STUDIODO. Karena itu fitur dibuktikan lewat tangkapan layar asli, bukan klip AI.
