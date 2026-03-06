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
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":5173 .*LISTENING"') do (
	if not "%%p"=="0" (
		taskkill /PID %%p /T /F >nul 2>nul
	)
)

echo.
echo Done.
echo.

endlocal
