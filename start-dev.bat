@echo off
setlocal

cd /d "%~dp0"

set "FRONTEND_URL=http://127.0.0.1:5173/"
set "BACKEND_URL=http://127.0.0.1:8000/health"
set "AUTOSTART_MODE=0"
if /I "%~1"=="--autostart" set "AUTOSTART_MODE=1"
if /I "%~1"=="--startup" set "AUTOSTART_MODE=1"
set "LOG_FILE=%~dp0autostart.log"
set "BACKEND_STARTED=0"

if "%AUTOSTART_MODE%"=="1" (
  echo [%date% %time%] Launcher start (autostart mode^) > "%LOG_FILE%"
)

echo.
echo ====================================
echo  CICTrix Development Launcher
echo ====================================
echo.

where npm >nul 2>nul
if not %ERRORLEVEL%==0 (
  if "%AUTOSTART_MODE%"=="1" echo [%date% %time%] ERROR: npm missing in PATH. >> "%LOG_FILE%"
  echo [ERROR] npm is not installed or not in PATH.
  echo         Install Node.js LTS, then run this script again.
  echo.
  pause
  exit /b 1
)
if "%AUTOSTART_MODE%"=="1" echo [%date% %time%] npm found. >> "%LOG_FILE%"

for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":5173 .*LISTENING"') do (
  if not "%%p"=="0" (
    echo [INFO] Releasing port 5173 from PID %%p...
    taskkill /PID %%p /F >nul 2>nul
  )
)

where docker >nul 2>nul
if %ERRORLEVEL%==0 (
  if "%AUTOSTART_MODE%"=="1" echo [%date% %time%] docker command found. >> "%LOG_FILE%"
  docker info >nul 2>nul
  if %ERRORLEVEL%==0 (
    if "%AUTOSTART_MODE%"=="1" echo [%date% %time%] docker running, starting compose. >> "%LOG_FILE%"
    echo [1/3] Starting backend ^(Docker Compose^)...
    docker compose up -d
    if %ERRORLEVEL%==0 (
      set "BACKEND_STARTED=1"
      if "%AUTOSTART_MODE%"=="1" echo [%date% %time%] backend started with docker compose. >> "%LOG_FILE%"
    ) else (
      if "%AUTOSTART_MODE%"=="1" echo [%date% %time%] WARN: docker compose failed, trying python fallback. >> "%LOG_FILE%"
      echo [WARN] Docker compose failed. Trying local Python backend fallback...
    )
  ) else (
    if "%AUTOSTART_MODE%"=="1" echo [%date% %time%] WARN: docker installed but not running. >> "%LOG_FILE%"
    echo [WARN] Docker is installed but not running. Trying local Python backend fallback...
  )
) else (
  if "%AUTOSTART_MODE%"=="1" echo [%date% %time%] WARN: docker not installed. >> "%LOG_FILE%"
  echo [WARN] Docker is not installed. Trying local Python backend fallback...
)

if "%BACKEND_STARTED%"=="0" (
  where python >nul 2>nul
  if %ERRORLEVEL%==0 (
    python -c "import sys; sys.exit(0)" >nul 2>nul
    if %ERRORLEVEL%==0 (
      if "%AUTOSTART_MODE%"=="1" echo [%date% %time%] python found, preparing backend venv. >> "%LOG_FILE%"
      set "BACKEND_PYTHON=%~dp0backend\.venv\Scripts\python.exe"
      if not exist "%BACKEND_PYTHON%" (
        echo [INFO] Creating backend virtual environment...
        python -m venv "%~dp0backend\.venv"
      )

      if exist "%BACKEND_PYTHON%" (
        set "PYTHON_CMD=%BACKEND_PYTHON%"
      ) else (
        set "PYTHON_CMD=python"
      )

      call "%PYTHON_CMD%" -c "import fastapi, uvicorn" >nul 2>nul
      if not %ERRORLEVEL%==0 (
        echo [INFO] Installing backend dependencies ^(first run may take a minute^)...
        call "%PYTHON_CMD%" -m pip install -r "%~dp0backend\requirements.txt"
      )

      call "%PYTHON_CMD%" -c "import fastapi, uvicorn" >nul 2>nul
      if %ERRORLEVEL%==0 (
        if "%AUTOSTART_MODE%"=="1" echo [%date% %time%] backend started with python uvicorn. >> "%LOG_FILE%"
        echo [INFO] Starting backend ^(Python/Uvicorn^) in a new window...
        start "CICTrix Backend" cmd /c "cd /d "%~dp0backend" && "%PYTHON_CMD%" -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload"
        set "BACKEND_STARTED=1"
      ) else (
        if "%AUTOSTART_MODE%"=="1" echo [%date% %time%] ERROR: python backend dependency setup failed. >> "%LOG_FILE%"
        echo [WARN] Python is available, but backend dependencies failed to install.
        echo        Run setup manually: cd backend ^&^& python -m pip install -r requirements.txt
      )
    ) else (
      if "%AUTOSTART_MODE%"=="1" echo [%date% %time%] WARN: python alias exists but runtime unavailable. >> "%LOG_FILE%"
      echo [WARN] Python command exists, but runtime is unavailable on this machine.
      echo        Install Python 3.11+ from https://www.python.org/downloads/
    )
  ) else (
    if "%AUTOSTART_MODE%"=="1" echo [%date% %time%] ERROR: no docker and no python runtime available. >> "%LOG_FILE%"
    echo [WARN] Backend is offline: neither Docker nor Python is available.
    echo        Install one runtime:
    echo        - Docker Desktop: https://www.docker.com/products/docker-desktop
    echo        - Python 3.11+: https://www.python.org/downloads/
  )
)

if not exist "node_modules" (
  if "%AUTOSTART_MODE%"=="1" echo [%date% %time%] node_modules missing, running npm install. >> "%LOG_FILE%"
  echo [2/3] Installing frontend dependencies...
  call npm install
  if not %ERRORLEVEL%==0 (
    if "%AUTOSTART_MODE%"=="1" echo [%date% %time%] ERROR: npm install failed. >> "%LOG_FILE%"
    echo [ERROR] npm install failed.
    echo.
    pause
    exit /b 1
  )
) else (
  if "%AUTOSTART_MODE%"=="1" echo [%date% %time%] node_modules present. >> "%LOG_FILE%"
  echo [2/3] Frontend dependencies already installed.
)

echo [3/3] Starting frontend dev server...
echo.
echo Frontend: %FRONTEND_URL%
echo Backend:  http://127.0.0.1:8000
echo.
echo Waiting for frontend server to become reachable...
echo.

start "CICTrix Frontend" cmd /c "cd /d "%~dp0" && npm run dev"
if "%AUTOSTART_MODE%"=="1" echo [%date% %time%] frontend process launched. >> "%LOG_FILE%"

set "WAIT_COUNT=0"
set "WAIT_LIMIT=30"
if "%AUTOSTART_MODE%"=="1" set "WAIT_LIMIT=90"
:wait_for_frontend
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri '%FRONTEND_URL%' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -ge 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
if %ERRORLEVEL%==0 goto frontend_ready

set /a WAIT_COUNT+=1
if %WAIT_COUNT% GEQ %WAIT_LIMIT% (
  if "%AUTOSTART_MODE%"=="1" echo [%date% %time%] WARN: frontend did not become reachable within timeout. >> "%LOG_FILE%"
  echo [WARN] Frontend did not respond within %WAIT_LIMIT% seconds.
  echo        Browser will not be opened until the app is reachable.
  echo        Keep the "CICTrix Frontend" window open and try the URL again shortly.
  goto end
)

timeout /t 1 /nobreak >nul
goto wait_for_frontend

:frontend_ready
if "%AUTOSTART_MODE%"=="1" echo [%date% %time%] frontend reachable at %FRONTEND_URL%. >> "%LOG_FILE%"
echo [OK] Frontend is reachable. Opening browser...
if "%AUTOSTART_MODE%"=="1" (
  echo [INFO] Autostart mode detected. Opening app now that frontend is reachable.
)
start "" %FRONTEND_URL%

if "%BACKEND_STARTED%"=="1" call :check_backend_health

echo.
echo Tip: Keep the "CICTrix Frontend" window open while using the app.
echo       Run stop-dev.bat to stop local services.
echo.
goto end

:end

if "%AUTOSTART_MODE%"=="1" echo [%date% %time%] launcher end. >> "%LOG_FILE%"

endlocal
exit /b 0

:check_backend_health
echo Checking backend health...
for /L %%i in (1,1,20) do (
  powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri '%BACKEND_URL%' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -ge 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
  if not errorlevel 1 (
    echo [OK] Backend is reachable at http://127.0.0.1:8000
    exit /b 0
  )
  timeout /t 1 /nobreak >nul
)

echo [WARN] Backend did not respond yet. Check the "CICTrix Backend" window or Docker logs.
exit /b 0
