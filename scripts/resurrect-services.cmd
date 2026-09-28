@echo off
REM Brings the STUDIODO backend server + Cloudflare tunnel back up under pm2
REM after a reboot/login. Registered to run at login via a shortcut in the
REM current user's Startup folder (see scripts/install-startup-shortcut.ps1) —
REM no admin rights needed, since it only touches this user's own Startup
REM folder rather than a system-wide service.
"C:\Users\Frameless Creative\AppData\Roaming\npm\pm2.cmd" resurrect
