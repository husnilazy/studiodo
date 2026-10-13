<#
  Build the Windows kiosk installer and (optionally) publish it as a GitHub Release so every installed kiosk
  self-updates (electron-updater checks GitHub Releases every 4 hours).

  Run from the repo root in PowerShell:
      powershell -ExecutionPolicy Bypass -File .\scripts\release-kiosk.ps1            # build only, nothing is uploaded
      powershell -ExecutionPolicy Bypass -File .\scripts\release-kiosk.ps1 -Publish   # build + upload to GitHub Releases

  -Publish needs a GitHub token with "repo" scope in the GH_TOKEN environment variable (never put it in a file):
      $env:GH_TOKEN = "ghp_..."

  Stops at the first failing step.
#>
param([switch]$Publish)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Step($n, $text) { Write-Host ""; Write-Host "[$n] $text" -ForegroundColor Cyan }
function Ok($text)       { Write-Host "    OK  $text" -ForegroundColor Green }
function Fail($text)     { Write-Host ""; Write-Host "GAGAL: $text" -ForegroundColor Red; exit 1 }
function Run($label, [scriptblock]$cmd) { & $cmd; if ($LASTEXITCODE -ne 0) { Fail "$label berhenti dengan kode $LASTEXITCODE." } }

Step 1 "Pemeriksaan awal"
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
Ok "versi di package.json: $version"
$dirty = git status --porcelain | Where-Object { $_ -notmatch "_tmp_acct\.ts" }
if ($dirty) { Fail "Ada perubahan yang belum di-commit. Commit dulu supaya rilis bisa dilacak ke satu commit.`n$($dirty -join "`n")" }
Ok "working tree bersih"
if ($Publish -and -not $env:GH_TOKEN) { Fail "-Publish butuh token GitHub di `$env:GH_TOKEN (scope: repo)." }
$existing = git tag --list "v$version"
if ($Publish -and $existing) { Fail "Tag v$version sudah ada. Naikkan versi di package.json dulu." }

Step 2 "Typecheck dan tes"
Run "Typecheck server" { node ./node_modules/typescript/bin/tsc --noEmit -p server/tsconfig.json }
Run "Typecheck client" { node ./node_modules/typescript/bin/tsc --noEmit -p tsconfig.json }
Run "Tes" { node ./node_modules/vitest/vitest.mjs run }
Ok "semua lolos"

Step 3 $(if ($Publish) { "Build installer dan unggah ke GitHub Release v$version" } else { "Build installer (tanpa mengunggah)" })
if ($Publish) { Run "dist:publish" { npm run dist:publish } } else { Run "dist" { npm run dist } }
Ok "selesai"

if ($Publish) {
  Step 4 "Beri tag v$version"
  git tag "v$version"
  Ok "tag lokal dibuat. Dorong dengan: git push origin v$version"
  Write-Host ""
  Write-Host "Kiosk yang sudah terpasang akan menemukan update ini dalam 4 jam (atau lewat tombol 'Cek update sekarang' di Admin -> Kiosk)." -ForegroundColor Green
} else {
  Write-Host ""
  Write-Host "Installer ada di folder dist (STUDIODO-Setup-$version.exe). Coba pasang di satu PC dulu sebelum -Publish." -ForegroundColor Green
}
