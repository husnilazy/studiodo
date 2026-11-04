# Deploys DOKU "QRIS langsung" (SNAP) to the production API server on this PC. Run in an ELEVATED PowerShell:
#   powershell -ExecutionPolicy Bypass -File server\scripts\db-move\deploy-doku-snap.ps1
# Steps: migration 0042 (adds 5 nullable/defaulted columns, no data changes) -> store the RSA private key encrypted
#        -> rebuild the server -> restart StudiodoServer (a few seconds of downtime).
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
Set-Location $root
$tenant = "46f04a2b-726a-449e-8474-a2c3b2a695b4"

Write-Host "1/4 Migrasi database (0042)..."
npm run db:migrate
if ($LASTEXITCODE -ne 0) { throw "Migrasi gagal - tidak ada yang diubah di server." }

Write-Host "2/4 Menyimpan kunci privat DOKU (terenkripsi)..."
node ./node_modules/tsx/dist/cli.mjs server/scripts/set-doku-snap-key.ts $tenant
if ($LASTEXITCODE -ne 0) { throw "Gagal menyimpan kunci privat." }

Write-Host "3/4 Build server..."
npm run build:server
if ($LASTEXITCODE -ne 0) { throw "Build gagal - layanan TIDAK direstart." }

Write-Host "4/4 Restart StudiodoServer..."
Restart-Service StudiodoServer -Force
Start-Sleep -Seconds 6
try { (Invoke-WebRequest -UseBasicParsing http://localhost:4050/api/health -TimeoutSec 10).Content } catch { Write-Host "Health check gagal: $_" -ForegroundColor Red }
Write-Host "SELESAI. Buka Admin > Pembayaran > DOKU > pilih 'QRIS langsung', isi Merchant ID & Terminal ID, lalu klik 'Tes buat QRIS'." -ForegroundColor Green
