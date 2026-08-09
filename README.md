# STUDIODO Kiosk

Aplikasi photobooth Windows (.exe) — Electron + React (kiosk) + Express + PostgreSQL/Drizzle (backend) + Xendit (payment).

## Status iterasi ini

Fokus: **alur kiosk penuh** — Idle → Pilih Paket → Pilih Orientasi → Pembayaran QRIS Xendit → Sesi Foto (7 filter live-bake, countdown+beep, retake per slot) → Preview → Pilih Frame → Hasil (strip + download + QR).

Belum lengkap di iterasi ini (menyusul):
- Admin Panel penuh (baru ada starter branding/theme di `/admin`) — Paket CRUD UI, Photo Strip layout picker, Custom Template drag-drop builder, Capture Vibe picker, Camera & Tether config UI, manajemen voucher UI
- 6 pilihan layout strip & 10 template visual (baru ada 1 layout dasar "classic vertical")
- GIF & video output
- Upload strip hasil ke storage (saat ini strip cuma di-render di canvas client, belum diupload ke server)
- Canon EDSDK runtime tidak disertakan di repository karena proprietary; executable bridge native disiapkan melalui `native/canon-bridge`

## Setup

```bash
npm install
cp .env.example .env
# isi DATABASE_URL dengan koneksi PostgreSQL kamu
npm run db:push   # push schema ke database
```

## Development

```bash
npm run dev            # jalankan client (Vite) + server (Express) di browser biasa
npm run dev:electron   # jalankan sebagai app Electron (dual window: kiosk + admin)
```

Buka admin dengan shortcut **Ctrl+Shift+A** saat app Electron jalan.

## Build .exe

```bash
npm run dist
```

Output ada di folder `release/` (installer NSIS + portable .exe).
Build lokal unsigned tidak memerlukan hak symbolic link Windows karena konfigurasi
`signAndEditExecutable` dinonaktifkan. Untuk distribusi publik, aktifkan kembali
resource editing dan gunakan sertifikat code-signing agar Windows menampilkan
publisher tepercaya.

### Canon DSLR di Windows

Sebelum menjalankan `npm run dist`, letakkan bridge native yang sudah dikompilasi
secara legal dengan Canon EDSDK di `native/canon-bridge/canon-bridge.exe`.
Installer akan menyalin executable bridge dan DLL EDSDK ke folder runtime aplikasi,
lalu Electron menjalankannya otomatis saat aplikasi dibuka. Kontrak endpoint dan
format capture ada di `native/canon-bridge/README.txt`.

STUDIODO tidak dapat mendistribusikan Canon EDSDK atau DLL proprietary Canon.
Bridge harus menangani koneksi kamera, trigger shutter, dan mengembalikan JPEG
melalui `POST http://127.0.0.1:5513/capture`.

## Pembayaran QRIS Xendit

Admin dapat mengisi Secret Key dan Webhook Token melalui **Ctrl+Shift+A → Pembayaran QRIS Xendit**.
Kredensial disimpan di database server dan tidak dikirim ke client. Jalankan `npm run db:push`
setelah mengambil perubahan schema.

Untuk testing tanpa akun Xendit, set `PAYMENT_DEMO_MODE=true` di `.env`; QR akan auto-sukses
setelah 5 detik. Untuk produksi, matikan mode demo dan daftarkan endpoint
`/api/payment/webhook/xendit` di dashboard Xendit.
