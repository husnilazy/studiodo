# STUDIODO Kiosk

Aplikasi photobooth — Electron + React (kiosk, thin client) + Express (cloud API) + PostgreSQL/Drizzle + Xendit (payment).

## Status iterasi ini

**Arsitektur SaaS multi-tenant (Phase 1)**: backend Postgres tunggal melayani banyak tenant/booth sekaligus. Kiosk Electron adalah thin client yang selalu terhubung ke API cloud lewat internet (tidak lagi menjalankan server + database lokalnya sendiri) — dipasangkan ke tenant lewat **kiosk API key** sekali di awal.

Fokus fitur kiosk: alur kiosk penuh — Idle → Pilih Paket → Pilih Orientasi → Pembayaran QRIS Xendit → Sesi Foto (7 filter live-bake, countdown+beep, retake per slot) → Preview → Pilih Frame → Hasil (strip + download + QR).

Belum lengkap di iterasi ini (menyusul):
- Dashboard admin untuk generate/revoke kiosk API key (endpoint `/api/kiosk-keys` sudah ada, UI-nya belum)
- Enforcement billing/subscription per tenant (kolom `plan`/`status` di tabel `tenants` baru placeholder)
- Dashboard super-admin lintas-tenant, self-service signup (sementara pakai `npm run tenant:create`)
- Admin Panel penuh — Paket CRUD UI, Photo Strip layout picker, Custom Template drag-drop builder, Capture Vibe picker, Camera & Tether config UI, manajemen voucher UI
- 6 pilihan layout strip & 10 template visual (baru ada 1 layout dasar "classic vertical")
- GIF & video output
- Canon EDSDK runtime tidak disertakan di repository karena proprietary; executable bridge native disiapkan melalui `native/canon-bridge`

## Setup

```bash
npm install
cp .env.example .env
# isi DATABASE_URL dengan koneksi PostgreSQL (bisa provider apa saja: Neon/Supabase/RDS/lokal)
# isi JWT_SECRET dengan string acak yang panjang
npm run db:migrate   # jalankan migrasi Postgres
npm run tenant:create -- --name "Studio X" --slug studio-x --email owner@studiox.com --password secret123
# simpan "Kiosk API key" yang ditampilkan sekali di akhir — dipakai untuk pairing kiosk
```

## Development

```bash
npm run dev            # jalankan client (Vite) + server (Express) di browser biasa
npm run dev:electron   # jalankan sebagai app Electron (dual window: kiosk + admin)
```

Saat pertama kali dibuka, kiosk akan meminta **Setup / Pair kiosk ini** — tempel kiosk API
key hasil `tenant:create` (atau dari Admin → Kiosk setelah UI-nya dibuat). Admin dashboard
(`/admin`) login memakai email + password tenant, bukan lagi password tunggal per install.

Mode kamera tether menggunakan dua port lokal: digiCamControl menyediakan
webserver di `http://127.0.0.1:5513`, sedangkan `electron/digicam-bridge.cjs`
menyediakan endpoint aplikasi di `http://127.0.0.1:5510`. `npm run dev`
menjalankan bridge tersebut otomatis; pada dashboard, isi URL tether bridge
dengan `http://localhost:5510`.

Buka admin dengan shortcut **Ctrl+Shift+A** saat app Electron jalan.

## Build .exe

```bash
npm run dist
```

Output ada di folder `release/` (installer NSIS + portable .exe). Installer sekarang hanya
membundel client (Electron thin client) — server cloud API di-deploy terpisah (lihat bagian
Deployment di bawah).
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
Bridge native Canon harus menangani koneksi kamera, trigger shutter, dan
mengembalikan JPEG melalui endpoint lokal yang dikonfigurasikan oleh aplikasi.

## Deployment (cloud API)

Server (`server/`) di-deploy sebagai layanan terpisah dari kiosk — **kiosk yang menjalankan
server ini tidak boleh dimatikan atau harus tetap online, jadi jangan di-deploy di PC kasir/kiosk
itu sendiri.** Target yang dipakai sekarang: VM **Google Cloud Free Tier** (`e2-micro`, gratis
permanen — bukan trial 90 hari, dan tidak pernah sleep seperti PaaS container gratisan),
dijalankan lewat Docker Compose + Caddy (reverse proxy + HTTPS otomatis). Setup ini juga jalan
tanpa perubahan di VM Docker-capable manapun (Oracle Cloud Always Free, VPS berbayar, dst.) kalau
suatu saat pindah host.

### 1. Siapkan VM (sekali saja, manual di luar repo)

1. Sign up di https://console.cloud.google.com (perlu kartu kredit untuk verifikasi identitas —
   tidak akan ditagih selama tetap dalam batas Free Tier).
2. Buat **Project** baru, aktifkan **Compute Engine API**.
3. Buat **VM instance**: machine type **`e2-micro`** (ini yang gratis permanen), region wajib
   salah satu dari **`us-west1`** (Oregon), **`us-central1`** (Iowa), atau **`us-east1`**
   (South Carolina) — di luar 3 region ini tidak gratis. Boot disk: **Ubuntu**, standard
   persistent disk ≤30GB. Centang **Allow HTTP traffic** & **Allow HTTPS traffic** saat membuat.
4. Reserve **static external IP** untuk instance ini (gratis selama terpasang ke VM yang jalan)
   supaya IP tidak berubah tiap restart.
5. Arahkan domain/subdomain (A record) ke IP publik VM — wajib untuk HTTPS otomatis via Caddy
   (Let's Encrypt tidak bisa terbitkan sertifikat untuk bare IP). VM di region AS berarti ada
   tambahan latency ke Indonesia (~200-300ms) — biasanya masih oke untuk API/JSON, tapi upload
   foto/GIF akan terasa lebih lambat dibanding VM regional Asia.
6. SSH ke VM (lewat tombol **SSH** di Console, atau `gcloud compute ssh`), lalu install Docker:
   `curl -fsSL https://get.docker.com | sh`.

### 2. Deploy

```bash
git clone <repo-ini> studiodo-kiosk && cd studiodo-kiosk
cp .env.example .env   # isi DATABASE_URL, JWT_SECRET, PORT=4050, PUBLIC_BASE_URL=https://domain-kamu
# edit Caddyfile: ganti "api.domainkamu.com" dengan domain asli
docker compose -f docker-compose.prod.yml up -d --build
```

Migrasi database (`npm run db:migrate`) otomatis jalan tiap kali container `server` start
(lihat `Dockerfile`) — idempotent, aman diulang. Redeploy setelah `git pull` cukup
`docker compose -f docker-compose.prod.yml up -d --build` lagi.

Wajib diisi di `.env` server: `DATABASE_URL` (Postgres — pakai connection string **pooled**
`-pooler` dari provider kalau tersedia, mis. Neon, karena server ini bisa buka banyak koneksi
pendek), `JWT_SECRET`, `PORT` (harus sama dengan target `reverse_proxy` di `Caddyfile`),
`PUBLIC_BASE_URL` (dipakai untuk link share hasil dan URL webhook Xendit — harus domain HTTPS
publik, bukan `localhost`).

**Storage foto**: default-nya disk lokal server (folder `storage/`, di-mount sebagai volume
Docker supaya tidak hilang saat container di-rebuild) — cukup untuk 1 VM, tapi tetap berisiko
kalau VM-nya sendiri hilang/di-reset. Sebelum tenant mulai transaksi sungguhan, atur storage
driver ke Cloudflare R2 atau Google Drive lewat **Admin → Storage** supaya foto tidak bergantung
pada satu disk VM.

## Pembayaran QRIS Xendit

Tiap tenant mengisi Secret Key dan Webhook Token sendiri lewat **Admin → Pembayaran QRIS
Xendit** (disimpan di tabel `tenant_settings`, tidak dikirim ke client). Xendit
mengirim callback ke `/api/payment/webhook/xendit/:tenantId` — satu URL webhook per tenant,
didaftarkan di akun Xendit masing-masing tenant.

Untuk testing tanpa akun Xendit, set `PAYMENT_DEMO_MODE=true` di `.env`; QR akan auto-sukses
setelah 5 detik.

## Cloudflare R2 / Google Drive storage

Secara default, foto disimpan lokal di server (folder `storage/<tenantId>/...`). Tiap tenant
bisa mengatur storage driver-nya sendiri (local/R2/Google Drive) lewat **Admin → Storage** —
kredensial disimpan per-tenant di `tenant_settings`, bukan di `.env`. Variabel storage di
`.env.example` hanya dipakai sebagai fallback dev lokal untuk tenant yang belum mengatur
storage-nya sendiri.
