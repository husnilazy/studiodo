STUDIODO camera bridge — Canon EDSDK + Sony Camera Remote SDK (tanpa digiCamControl)

Sumber: native/canon-bridge-src (C# .NET 8). Output build ada di folder ini
(canon-bridge.exe + DLL) dan tidak di-commit.

Build:
  0. (Sony) powershell -File native/sony-core-src/setup-sdk.ps1 -Zip "<path CrSDK zip>"
     lalu native\sony-core-src\build.bat  (butuh MSVC Build Tools)
  1. powershell -File native/canon-bridge-src/setup-sdk.ps1 -Zip "<path EDSDK zip>"
  2. cd native/canon-bridge-src ; dotnet build -c Release -o ../canon-bridge

Kontrak HTTP (port 5514, ubah dengan --port / CANON_BRIDGE_PORT) sama dengan
electron/digicam-bridge.cjs: /health, /capture, /focus, /properties,
/liveview/start, /liveview/stop, /liveview.jpg.

Di kiosk: set URL bridge kamera ke http://127.0.0.1:5514. Tutup EOS Utility
dan digiCamControl — hanya satu aplikasi yang boleh memegang kamera.
Kiosk PC butuh .NET 8 Desktop/ASP.NET Runtime (x64).

Canon EDSDK proprietary: pastikan izin redistribusi DLL dari Canon sebelum
dibagikan ke penyewa.


Mesin kamera dipilih otomatis: kamera yang terhubung lebih dulu dipakai (/health
melaporkan engine "canon" / "sony"). Mesin yang DLL-nya tidak ada dilewati.
Sony: set menu kamera USB Connection = "PC Remote", kualitas gambar JPEG
(RAW-only ditolak). Lama autofocus sebelum foto: env SONY_AF_MS (default 500).
Belum diuji dengan kamera Sony asli.

Otomatis jalan dari Electron hanya bila env CANON_BRIDGE_ENABLED=true (default mati,
karena sesi EDSDK memegang kamera eksklusif dan memblokir digiCamControl).
