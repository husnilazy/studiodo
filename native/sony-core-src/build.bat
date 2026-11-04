@echo off
rem Compile sony_core.dll (x64) dan salin DLL runtime Sony ke ..\canon-bridge.
call "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul 2>nul
set "OUT=%~dp0..\canon-bridge"
if not exist "%OUT%" mkdir "%OUT%"
if not exist "%~dp0obj" mkdir "%~dp0obj"
pushd "%~dp0obj"
cl /nologo /LD /EHsc /O2 /std:c++17 /DUNICODE /D_UNICODE /I"%~dp0sdk" "%~dp0sony_core.cpp" /Fe:"%OUT%\sony_core.dll" /link "%~dp0sdk\Cr_Core.lib"
if errorlevel 1 (popd & exit /b 1)
popd
copy /y "%~dp0sdk\Cr_Core.dll" "%OUT%" >nul
copy /y "%~dp0sdk\monitor_protocol.dll" "%OUT%" >nul
copy /y "%~dp0sdk\monitor_protocol_pf.dll" "%OUT%" >nul
if not exist "%OUT%\CrAdapter" mkdir "%OUT%\CrAdapter"
copy /y "%~dp0sdk\CrAdapter\*.dll" "%OUT%\CrAdapter" >nul
echo sony_core.dll OK
