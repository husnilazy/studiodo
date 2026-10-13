<#
  Deploy STUDIODO server changes on the PC that runs the StudiodoServer Windows service.

  Order: safety checks -> back up .env -> database migrations -> build server -> build client -> restart service -> health check.
  Stops at the first failing step, so a failed migration never leaves a half-updated server running.

  Run from an ADMINISTRATOR PowerShell (the service restart needs it):
      powershell -ExecutionPolicy Bypass -File .\scripts\deploy-server.ps1

  Options:
      -SkipMigrate   do not run database migrations
      -SkipClient    do not rebuild the web client (Superadmin / tenant admin UI)
      -ServiceName   Windows service name (default StudiodoServer)
#>
param(
  [switch]$SkipMigrate,
  [switch]$SkipClient,
  [string]$ServiceName = "StudiodoServer"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Step($n, $text) { Write-Host ""; Write-Host "[$n] $text" -ForegroundColor Cyan }
function Ok($text)       { Write-Host "    OK  $text" -ForegroundColor Green }
function Warn($text)     { Write-Host "    !!  $text" -ForegroundColor Yellow }
function Fail($text)     { Write-Host ""; Write-Host "GAGAL: $text" -ForegroundColor Red; exit 1 }
function Run($label, [scriptblock]$cmd) {
  & $cmd
  if ($LASTEXITCODE -ne 0) { Fail "$label berhenti dengan kode $LASTEXITCODE. Layanan TIDAK direstart." }
}

# --- 1. checks -----------------------------------------------------------------------------------------------
Step 1 "Pemeriksaan awal"
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Fail "Jalankan PowerShell sebagai Administrator (dibutuhkan untuk restart layanan)." }
Ok "berjalan sebagai Administrator"

if (-not (Test-Path ".env")) { Fail "File .env tidak ditemukan di $root" }
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $svc) { Fail "Layanan '$ServiceName' tidak ditemukan. Cek nama dengan: Get-Service *studiodo*" }
Ok "layanan $ServiceName ditemukan (status: $($svc.Status))"

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Ok "branch aktif: $branch"
$dirty = git status --porcelain | Where-Object { $_ -notmatch "_tmp_acct\.ts" }
if ($dirty) { Warn "ada perubahan yang belum di-commit; yang dibangun adalah isi folder saat ini" }

$envText = Get-Content ".env" -Raw
$port = "4050"
if ($envText -match "(?m)^\s*PORT\s*=\s*(\d+)") { $port = $Matches[1] }
if ($envText -match "(?m)^\s*RESEND_API_KEY\s*=\s*\S+") { Ok "RESEND_API_KEY terisi" } else { Warn "RESEND_API_KEY belum diisi di .env - email tidak akan terkirim (bisa diisi nanti, lalu restart layanan)" }
$dupes = [regex]::Matches($envText, "(?m)^\s*STORAGE_DRIVER\s*=")
if ($dupes.Count -gt 1) { Warn "STORAGE_DRIVER muncul $($dupes.Count) kali di .env (yang terakhir dipakai) - pastikan itu yang Anda inginkan" }

# --- 2. back up .env ------------------------------------------------------------------------------------------
Step 2 "Cadangkan .env"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $root "storage\deploy-backups"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
Copy-Item ".env" (Join-Path $backupDir ".env.$stamp") -Force
Ok "disalin ke storage\deploy-backups\.env.$stamp"

# --- 3. migrations --------------------------------------------------------------------------------------------
if ($SkipMigrate) {
  Step 3 "Migrasi database dilewati (-SkipMigrate)"
} else {
  Step 3 "Migrasi database (hanya menambah tabel/kolom)"
  Run "Migrasi database" { npm run db:migrate }
  Ok "migrasi selesai"
}

# --- 4. builds ------------------------------------------------------------------------------------------------
Step 4 "Build server"
Run "Build server" { npm run build:server }
Ok "dist-server diperbarui"

if ($SkipClient) {
  Step 5 "Build client dilewati (-SkipClient)"
} else {
  Step 5 "Build client (tampilan Superadmin & admin tenant)"
  Run "Build client" { npm run build:client }
  Ok "dist-client diperbarui"
}

# --- 6. restart + health --------------------------------------------------------------------------------------
Step 6 "Restart layanan $ServiceName"
Restart-Service -Name $ServiceName -Force
$svc = Get-Service -Name $ServiceName
if ($svc.Status -ne "Running") { Fail "Layanan tidak berjalan setelah restart (status: $($svc.Status)). Lihat log di folder logs\." }
Ok "layanan berjalan"

Step 7 "Cek kesehatan server (http://localhost:$port/api/health)"
$healthy = $false
for ($i = 1; $i -le 15; $i++) {
  Start-Sleep -Seconds 2
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$port/api/health" -TimeoutSec 5
    if ($r.StatusCode -eq 200) { $healthy = $true; break }
  } catch { }
}
if (-not $healthy) { Fail "Server tidak menjawab /api/health dalam 30 detik. Cek logs\ dan: Get-Service $ServiceName" }
Ok "server menjawab"

# the routes added in this release must exist (404 JSON from our API vs. an old build)
foreach ($path in @("/api/public/marketplace", "/api/public/email-unsubscribe?token=x")) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$port$path" -TimeoutSec 8 -ErrorAction Stop
    Ok "$path -> $($r.StatusCode)"
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 400) { Ok "$path -> 400 (rute baru aktif)" } else { Warn "$path -> $code (periksa apakah build terbaru yang berjalan)" }
  }
}

Write-Host ""
Write-Host "Selesai. Langkah berikutnya:" -ForegroundColor Green
Write-Host "  1. Buka Superadmin -> Email -> 'Kirim email uji ke saya' untuk memastikan Resend bekerja."
Write-Host "  2. Buka studiodo.id/portal dan cek bel notifikasi serta Akun & keamanan."
