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
