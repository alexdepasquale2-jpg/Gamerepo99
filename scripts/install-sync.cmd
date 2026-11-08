@echo off
rem One-time setup: keep this folder and GitHub in step every 5 minutes.
rem To stop it later: schtasks /Delete /TN "Gamerepo99 sync" /F
cd /d "%~dp0.."
git config core.autocrlf true
echo Running the first sync. If a GitHub sign-in window opens, sign in once.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sync.ps1"
echo.
echo Last log lines (.git\sync.log):
powershell -NoProfile -Command "if (Test-Path .git\sync.log) { Get-Content .git\sync.log -Tail 5 }"
schtasks /Create /F /SC MINUTE /MO 5 /TN "Gamerepo99 sync" /TR "wscript.exe \"%~dp0sync-hidden.vbs\""
echo.
echo Done. It now syncs every 5 minutes in the background.
pause
