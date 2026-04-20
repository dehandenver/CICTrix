@echo off
setlocal

cd /d "%~dp0.."

set "FRONTEND_URL=http://127.0.0.1:5173/"
set "BACKEND_URL=http://127.0.0.1:8000/health"
set "AUTOSTART_MODE=0"
if /I "%~1"=="--autostart" set "AUTOSTART_MODE=1"
if /I "%~1"=="--startup" set "AUTOSTART_MODE=1"
set "LOG_FILE=%~dp0..\logs\autostart.log"
set "BACKEND_STARTED=0"

if not exist "%~dp0..\logs" mkdir "%~dp0..\logs"

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
      set "BACKEND_PYTHON=%~dp0..\backend\.venv\Scripts\python.exe"
      if not exist "%BACKEND_PYTHON%" (
        echo [INFO] Creating backend virtual environment...
        python -m venv "%~dp0..\backend\.venv"
      )

      if exist "%BACKEND_PYTHON%" (
        set "PYTHON_CMD=%BACKEND_PYTHON%"
      ) else (
        set "PYTHON_CMD=python"
      )

      call "%PYTHON_CMD%" -c "import fastapi, uvicorn" >nul 2>nul
      if not %ERRORLEVEL%==0 (
        echo [INFO] Installing backend dependencies ^(first run may take a minute^)...
        call "%PYTHON_CMD%" -m pip install -r "%~dp0..\backend\requirements.txt"
      )

      call "%PYTHON_CMD%" -c "import fastapi, uvicorn" >nul 2>nul
      if %ERRORLEVEL%==0 (
        if "%AUTOSTART_MODE%"=="1" echo [%date% %time%] backend started with python uvicorn. >> "%LOG_FILE%"
        echo [INFO] Starting backend ^(Python/Uvicorn^) in a new window...
        start "CICTrix Backend" cmd /c "cd /d "%~dp0..\backend" && "%PYTHON_CMD%" -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload"
        set "BACKEND_STARTED=1"
      ) else (
        if "%AUTOSTART_MODE%"=="1" echo [%date% %time%] ERROR: python backend dependency setup failed. >> "%LOG_FILE%"
        echo [WARN] Python is available, but backend dependencies failed to install.
        echo        Run setup manually: cd backend ^&^& python -m pip install -r requirements.txt
      )
    )
  )
)
endlocal