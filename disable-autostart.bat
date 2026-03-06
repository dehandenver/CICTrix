@echo off
setlocal

set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "AUTOSTART_FILE=%STARTUP_DIR%\CICTrix-AutoStart.bat"
set "TASK_NAME=CICTrix Auto Start"

set "REMOVED_ANY=0"

schtasks /Query /TN "%TASK_NAME%" >nul 2>nul
if %ERRORLEVEL%==0 (
  schtasks /Delete /TN "%TASK_NAME%" /F >nul 2>nul
  set "REMOVED_ANY=1"
)

if exist "%AUTOSTART_FILE%" (
  del "%AUTOSTART_FILE%"
  set "REMOVED_ANY=1"
)

if "%REMOVED_ANY%"=="1" (
  echo.
  echo Auto-start disabled.
  echo Removed scheduled task and/or startup file.
  echo.
  goto :end
)

echo.
echo Auto-start is already disabled.
echo.

:end
endlocal
