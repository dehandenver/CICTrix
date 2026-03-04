@echo off
setlocal

cd /d "%~dp0"

echo.
echo ====================================
echo  CICTrix Development Shutdown
echo ====================================
echo.

echo Stopping backend containers...
docker compose down >nul 2>nul

echo Stopping Vite dev server windows...
taskkill /FI "WINDOWTITLE eq CICTrix Frontend" /T /F >nul 2>nul

echo.
echo Done.
echo.

endlocal
