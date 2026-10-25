@echo off
rem Double-click to run the AgriBot dashboard locally (REPLAY mode unless web\.env.local is set).
rem Opening index.html directly can't work: browsers block the app's modules on file:// pages.
rem %~dp0 is this folder's full path; Vite crashes on Windows if started via a short CODING~N path.
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies, first run only...
  call npm install --no-audit --no-fund || goto :error
)
echo.
echo   AgriBot dashboard starting. Your browser will open by itself.
echo   On your phone (same Wi-Fi): use the "Network" address printed below.
echo   Close this window to stop it.
echo.
call npm run dev -- --port 5288 --open
goto :eof

:error
echo npm install failed. Is Node.js installed? (node --version)
pause
