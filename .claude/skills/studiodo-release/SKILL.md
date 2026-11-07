---
name: studiodo-release
description: Checklist rilis STUDIODO (kiosk Electron + API + web portal). Pakai saat user minta rilis, build installer, deploy, atau "push".
---

# Rilis STUDIODO

Tiga bagian terpisah, masing-masing punya langkah sendiri. Kerjakan berurutan dan laporkan apa yang TIDAK terverifikasi.

## Aturan keras
- **Jangan push, publish, atau jalankan migrasi tanpa konfirmasi eksplisit user** di pesan itu. Persetujuan sebelumnya tidak berlaku.
- Jangan pernah mencetak isi `.env` atau nilai rahasia. Cek keberadaan kunci saja.
- Path folder mengandung `&` (`Build Web & Apps`): jalankan Node langsung, bukan lewat `.bin`: `node ./node_modules/typescript/bin/tsc ...`, `node ./node_modules/vitest/vitest.mjs run`, `node ./node_modules/next/dist/bin/next build`. Di Git Bash pakai `MSYS_NO_PATHCONV=1` untuk curl path `/portal/...`.
- Cek `git status` dulu. Jangan ikut commit `.env*`, `server/scripts/_tmp_*`, atau file scratch lain; `git add` file yang disebut satu per satu.

## 1. Sebelum apa pun (repo `studiodo-kiosk`)
1. `node ./node_modules/typescript/bin/tsc -p server/tsconfig.json --noEmit` dan `node ./node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` (client). Harus bersih.
2. `node ./node_modules/vitest/vitest.mjs run`. Laporkan jumlah lulus dan dilewati; tes integrasi wallet butuh PGlite (`PGLITE_MODULE`) dan dilewati tanpa itu, jadi sebutkan.
3. Untuk perubahan uang/upload/otorisasi: jalankan skill `security-review` / `code-review`.

## 2. Web portal (repo `../studiodo-web`, branch `main`)
1. `node ./node_modules/next/dist/bin/next build` WAJIB lolos sebelum push. Build yang gagal = Vercel diam-diam tetap melayani versi lama (pernah terjadi: file `"use server"` hanya boleh mengekspor fungsi async).
2. Setelah push, cek rute baru di live: `curl -s -o /dev/null -w "%{http_code}" https://www.studiodo.id/portal/<rute>`. 404 = belum terdeploy; 307 ke /masuk = rute ada.

## 3. API (repo `studiodo-kiosk`, branch `main`, Vercel project `studiodo-app`)
1. Cek migrasi baru: `ls server/db/migrations | tail`. Migrasi belum diterapkan ke database live kecuali user bilang sudah. Terapkan HANYA dengan konfirmasi (`npm run db:migrate`); database dev dan live adalah Neon yang sama.
2. Env Vercel yang harus ada: `DATABASE_URL` (pooler), `JWT_SECRET` (sama dengan PC), `STORAGE_DRIVER=r2`, `R2_*`, `PUBLIC_BASE_URL`, `CORS_ALLOWED_ORIGINS`, `SETTINGS_ENCRYPTION_KEY`, kunci gateway. Variabel baru butuh Redeploy.
3. API juga berjalan di PC lewat Cloudflare Tunnel (`qr.studiodo.id`); PC perlu menarik kode terbaru dan restart service agar ikut ter-update.
4. Cek `https://app.studiodo.id/api/health` setelah deploy.

## 4. Installer kiosk
1. Naikkan `version` di `package.json` (juga commit `chore(release): vX.Y.Z`).
2. `npm run dist` (build:client + electron-builder, NSIS + portable) menghasilkan `dist/STUDIODO-Setup-X.Y.Z.exe` dan `dist/STUDIODO-X.Y.Z.exe`. Build tidak ditandatangani (SmartScreen bisa memperingatkan).
3. `npm run dist:publish` memublikasikan GitHub Release (butuh `GH_TOKEN`) dan LANGSUNG mengirim auto-update ke semua kiosk. Hanya jalankan dengan konfirmasi eksplisit.
4. Sebutkan bahwa aplikasi belum dijalankan/dites di perangkat sungguhan bila memang belum.

## Laporan akhir
Tulis: apa yang di-commit, apa yang sudah di-push, apa yang sudah terdeploy (dibuktikan), dan apa yang masih menunggu user (env, migrasi, publikasi).
