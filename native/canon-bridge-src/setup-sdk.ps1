# Mengambil EDSDK.cs (wrapper C#) dan DLL 64-bit dari zip Canon EDSDK ke ./sdk.
# Pemakaian: powershell -File setup-sdk.ps1 -Zip "E:\...\EDSDK132021CD(13.20.21).zip"
param([Parameter(Mandatory = $true)][string]$Zip)
$ErrorActionPreference = "Stop"
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("edsdk-" + [guid]::NewGuid())
New-Item -ItemType Directory $tmp | Out-Null
Expand-Archive -LiteralPath $Zip -DestinationPath $tmp
$dest = Join-Path $PSScriptRoot "sdk"
New-Item -ItemType Directory -Force $dest | Out-Null
Copy-Item (Join-Path $tmp "Windows\EDSDK_64\Dll\*.dll") $dest -Force
Copy-Item (Join-Path $tmp "Windows\sample\CSharp\CameraControl\CameraControl\EDSDK.cs") $dest -Force
Remove-Item -Recurse -Force $tmp
Write-Host "SDK siap di $dest"
