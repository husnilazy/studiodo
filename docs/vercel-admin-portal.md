# Admin & portal tenant di Vercel (tanpa PC server)

Dua deployment berbagi database Neon dan R2 yang sama:

| | Alamat | Berjalan di | Dipakai untuk |
|---|---|---|---|
| Kiosk API | `qr.studiodo.id` | PC + Cloudflare Tunnel (tetap) | kiosk, galeri QR, upload foto/video |
| Admin & portal | mis. `app.studiodo.id` | Vercel | login admin tenant, portal, superadmin |

Kode sama (`server/index.ts` diekspor sebagai Vercel Function lewat `api/index.js`); klien dibuild statis ke `dist-client`.

## Deploy pertama
1. Vercel → Add New Project → pilih repo `husnilazy/studiodo` (branch yang dipakai). Biarkan Framework "Other"; `vercel.json` sudah mengatur build.
2. Environment Variables (salin dari `.env` PC, **tanpa** `PORT`, `DIGICAM_*`, `PAYMENT_DEMO_MODE`):
   - `DATABASE_URL` → pakai connection string Neon **`-pooler`**
   - `JWT_SECRET` → **harus sama persis** dengan PC (kalau beda, token login saling tidak berlaku)
   - `SETTINGS_ENCRYPTION_KEY` bila ada di `.env`, `RESEND_API_KEY`, `MAIL_FROM`, kunci gateway (Midtrans/Xendit/DOKU) bila dipakai
   - `STORAGE_DRIVER=r2`
   - `PUBLIC_BASE_URL=https://qr.studiodo.id` (tetap alamat kiosk API: dipakai untuk webhook & link galeri)
   - `CORS_ALLOWED_ORIGINS=https://app.studiodo.id` (alamat Vercel; tanpa ini semua POST dari browser ditolak 403)
   - `KEEP_DB_WARM=false`
3. Domain: tambahkan `app.studiodo.id` di Vercel, buat CNAME di DNS Cloudflare (mode DNS only / abu-abu).
4. Deploy, buka `https://app.studiodo.id/api/health` → harus `{"ok":true}`.

## Batasan di Vercel
- Body request maksimum 4,5 MB: upload gambar admin (paket, frame, branding) yang besar akan gagal 413. Foto/video kiosk tetap lewat PC (belum dipindah).
- Tidak ada timer (keep-alive Neon, aturan notifikasi) dan tidak ada disk: aturan notifikasi masih dijalankan PC. Bila PC mati, pindahkan ke Vercel Cron.
- Konten Instagram (Chrome/ffmpeg) tetap di PC.
- Tenant tanpa kredensial R2 sendiri tidak bisa upload (tidak ada disk lokal).
