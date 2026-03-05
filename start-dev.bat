@echo off
setlocal

cd /d "%~dp0"

echo.
echo ====================================
echo  CICTrix Development Launcher
echo ====================================
echo.

where npm >nul 2>nul
if not %ERRORLEVEL%==0 (
  echo [ERROR] npm is not installed or not in PATH.
  echo         Install Node.js LTS, then run this script again.
  echo.
  pause
  exit /b 1
)

for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":5173 .*LISTENING"') do (
  if not "%%p"=="0" (
    echo [INFO] Releasing port 5173 from PID %%p...
    taskkill /PID %%p /F >nul 2>nul
  )
)

where docker >nul 2>nul
if %ERRORLEVEL%==0 (
  docker info >nul 2>nul
  if %ERRORLEVEL%==0 (
    echo [1/3] Starting backend ^(Docker Compose^)...
    docker compose up -d
  ) else (
    echo [WARN] Docker is installed but not running. Backend will stay offline.
    echo        Start Docker Desktop, then run this launcher again.
  )
) else (
  echo [WARN] Docker is not installed. Backend will stay offline.
)

if not exist "node_modules" (
  echo [2/3] Installing frontend dependencies...
  call npm install
  if not %ERRORLEVEL%==0 (
    echo [ERROR] npm install failed.
    echo.
    pause
    exit /b 1
  )
) else (
  echo [2/3] Frontend dependencies already installed.
)

echo [3/3] Starting frontend dev server...
echo.
echo Frontend: http://127.0.0.1:5173
echo Backend:  http://127.0.0.1:8000
echo.
echo Tip: Keep this window open while using the app.
echo.
start "" http://127.0.0.1:5173/
call npm run dev

if not %ERRORLEVEL%==0 (
  echo.
  echo [ERROR] Frontend server stopped unexpectedly.
  echo         Check the error above, then run start-dev.bat again.
  echo.
  pause
  exit /b 1
)

endlocal
