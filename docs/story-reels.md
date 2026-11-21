# Reel cerita (Konten Instagram)

Reel 9:16 bersuara yang dibuat tangan per adegan: masalah di photobooth, lalu STUDIODO sebagai solusi. Berbeda dari reel otomatis (carousel dari katalog fitur): ini punya VO, musik, dan efek suara, dan tiap adegan punya ilustrasi sendiri.

## Alur di sistem
1. Modul adegan `server/lib/contentStudio/reelNN*.ts` (HTML + CSS animation, bisa di-seek), VO di `server/assets/story-reels/<id>.mp3`.
2. Didaftarkan di `storyReels.ts` (`STORY_REELS`): fitur yang dibahas, caption, jenis CTA, gaya musik, catatan "cek dulu".
3. Superadmin → Konten Instagram → Ringkasan → kartu **Reel cerita** → "Antrekan sebagai draf". Autopilot juga memakainya otomatis: saat slot reel jatuh pada fitur yang punya reel cerita, reel cerita dipakai lebih dulu.
4. Penjadwal merender di PC menjelang jadwal (VO + musik + efek dicampur, MP4 + cover), lalu alurnya sama seperti post lain: Tinjau di HP, setujui, tayang otomatis.

## Aturan konten
- Batas aman Reels: teks mulai y=310, semua di x 120-960 dan y 300-1500 (`SAFE`/`ART_SAFE` di `heroReel2.ts`). Render dengan env `REEL_GUIDE=1` untuk melihat panduan.
- CTA berganti tiap reel (tes memeriksa tidak ada dua yang sama berurutan): coba / tag / simpan / tanya / link.
- Musik berganti: house, lofi, synthwave, techno, chill (`sfx.ts`, semua sintesis ffmpeg, bebas lisensi).
- Klaim harus literal ke katalog fitur; angka dan skenario hanya ilustrasi; `needsCheck` menahan di UI sampai dicek.

## Membuat reel baru (sekarang masih lewat Claude)
1. Tulis naskah VO (25-30 dtk), generate lewat ElevenLabs (suara Siti, model eleven_v4).
2. Ukur jeda dengan ffmpeg `silencedetect`, isi `T` di modul adegan.
3. `npx tsx scripts/make-reel.ts <nama>` untuk render lokal (tambahkan nama di `scripts/make-reel.ts`), cek frame dengan `--stills=`.
4. Salin VO ke `server/assets/story-reels/`, daftarkan di `STORY_REELS`.

## Reel dari reelKit (cara cepat, 2026-11)
20 reel fitur dibuat dengan `server/lib/contentStudio/reelKit.ts`: satu adegan per kalimat VO, ditambah adegan brand dan CTA. Efek suara dibuat otomatis dari setiap pop.
1. Tulis skrip di `reelScripts.ts` (satu kalimat = satu adegan; dua kalimat terakhir = brand + CTA). Pakai tag `[upbeat]` / `[confident]` dan titik, bukan tanda seru: tanda seru + `[excited]` terdengar menyentak.
2. Generate VO (eleven_v4; suara Siti / Finn / Maya bergantian), simpan sebagai `server/assets/story-reels/<id>.mp3`.
3. `npx tsx scripts/vo-times.mjs <id>` mengukur waktu tiap kalimat dan menulis `<id>.json`.
4. Tulis adegannya di `newReels.ts` (`art: (c) => ...`, props di `reelKit.ts` bagian `K`) dan daftarkan di `newReelMeta.ts`.
5. `node scripts/render-all.mjs <id> ...` merender MP4 (dan contact sheet) satu per satu. Jangan jalankan beberapa render bersamaan: sisa proses Chrome menahan profil.
Reel baru masuk antrean/autopilot hanya jika file mp3-nya ada.

## Program 1 bulan
Superadmin → Konten Instagram → Ringkasan → kartu **Program 1 bulan**: 3 posting sehari (09:00 reel, 14:00 carousel, 18:30 reel), tayang otomatis, berhenti sendiri setelah 30 hari (`autopilotUntil`). Konten bertanda "cek dulu" (fitur dengan `check`, reel dengan `needsCheck`) tidak ikut sampai dicentang di kartu "Perlu kamu cek dulu". Reel cerita dipakai lebih dulu untuk fitur yang punya; sisanya reel otomatis dari katalog.
