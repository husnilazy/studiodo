# Cutover of the API server's database to Neon Singapore. Run in an ELEVATED PowerShell (Run as administrator).
#   powershell -ExecutionPolicy Bypass -File server\scripts\db-move\cutover-singapore.ps1
# Needs .env with DATABASE_URL (old, us-east-1) and DATABASE_URL_NEW (Singapore). The old DB is never modified.
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
Set-Location $root
$envFile = Join-Path $root ".env"
if (-not (Select-String -Path $envFile -Pattern "^DATABASE_URL_NEW=" -Quiet)) { throw "DATABASE_URL_NEW tidak ada di .env" }

Copy-Item $envFile "$envFile.pre-singapore-backup" -Force
Write-Host "1/6 Menghentikan StudiodoServer (booth tidak bisa transaksi sampai selesai)..."
Stop-Service StudiodoServer -Force
$ok = $false
try {
  Write-Host "2/6 Menyalin ulang data ke Singapore..."
  node server\scripts\db-move\db-trunc.cjs;  if ($LASTEXITCODE -ne 0) { throw "trunc gagal" }
  node server\scripts\db-move\db-copy.cjs;   if ($LASTEXITCODE -ne 0) { throw "copy gagal" }
  Write-Host "3/6 Verifikasi jumlah baris (tidak boleh ada baris DIFF):"
  node server\scripts\db-move\db-check.cjs diff
  $ok = $true
} catch {
  Write-Host "GAGAL: $_ -- .env TIDAK diubah, layanan dinyalakan lagi dengan DB lama." -ForegroundColor Red
}

if ($ok) {
  Write-Host "4/6 Mengganti DATABASE_URL di .env ke Singapore (yang lama disimpan sebagai DATABASE_URL_OLD)..."
  $lines = Get-Content $envFile
  $old = ($lines | Where-Object { $_ -match "^DATABASE_URL=" }) -replace "^DATABASE_URL=", ""
  $new = ($lines | Where-Object { $_ -match "^DATABASE_URL_NEW=" }) -replace "^DATABASE_URL_NEW=", ""
  $out = foreach ($l in $lines) {
    if ($l -match "^DATABASE_URL=") { "DATABASE_URL=$new" }
    elseif ($l -match "^DATABASE_URL_NEW=") { "DATABASE_URL_OLD=$old" }
    else { $l }
  }
  Set-Content -Path $envFile -Value $out -Encoding utf8
  Write-Host "5/6 Build server (memuat perbaikan performa)..."
  npm run build:server
}

Write-Host "6/6 Menyalakan StudiodoServer..."
Start-Service StudiodoServer
Start-Sleep -Seconds 6
try { (Invoke-WebRequest -UseBasicParsing http://localhost:4050/api/health -TimeoutSec 10).Content } catch { Write-Host "Health check gagal: $_" -ForegroundColor Red }
if ($ok) { Write-Host "SELESAI. API produksi sekarang memakai DB Singapore." -ForegroundColor Green }
