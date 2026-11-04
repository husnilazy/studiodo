# Mengambil header CRSDK + Cr_Core.lib/dll + CrAdapter dari zip Sony Camera Remote SDK ke ./sdk.
# Pemakaian: powershell -File setup-sdk.ps1 -Zip "E:\...\CrSDK_v2.02.00_20260610a_Win64.zip"
param([Parameter(Mandatory = $true)][string]$Zip)
$ErrorActionPreference = "Stop"
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("crsdk-" + [guid]::NewGuid())
New-Item -ItemType Directory $tmp | Out-Null
Expand-Archive -LiteralPath $Zip -DestinationPath $tmp
Expand-Archive -LiteralPath (Join-Path $tmp "RemoteCli.zip") -DestinationPath (Join-Path $tmp "cli")
$dest = Join-Path $PSScriptRoot "sdk"
New-Item -ItemType Directory -Force $dest | Out-Null
Copy-Item (Join-Path $tmp "cli\app\CRSDK") (Join-Path $dest "CRSDK") -Recurse -Force
Copy-Item (Join-Path $tmp "cli\external\crsdk\*") $dest -Recurse -Force
Remove-Item -Recurse -Force $tmp
Write-Host "SDK siap di $dest"
