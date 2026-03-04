@echo off
setlocal

set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "AUTOSTART_FILE=%STARTUP_DIR%\CICTrix-AutoStart.bat"

if exist "%AUTOSTART_FILE%" (
  del "%AUTOSTART_FILE%"
  echo.
  echo Auto-start disabled.
  echo Removed:
  echo %AUTOSTART_FILE%
  echo.
) else (
  echo.
  echo Auto-start is already disabled.
  echo.
)

endlocal
