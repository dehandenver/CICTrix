@echo off
setlocal

cd /d "%~dp0"

echo.
echo ====================================
echo  CICTrix Development Launcher
echo ====================================
echo.

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
) else (
  echo [2/3] Frontend dependencies already installed.
)

echo [3/3] Starting frontend dev server in a new terminal...
start "CICTrix Frontend" cmd /k "cd /d %~dp0 && npm run dev"

echo.
echo Frontend: http://localhost:5173
echo Backend:  http://localhost:8000
echo.
echo Tip: Keep the "CICTrix Frontend" window open while using the app.
echo.

endlocal
