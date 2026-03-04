@echo off
setlocal

cd /d "%~dp0"

set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "AUTOSTART_FILE=%STARTUP_DIR%\CICTrix-AutoStart.bat"

echo @echo off> "%AUTOSTART_FILE%"
echo cd /d "%~dp0">> "%AUTOSTART_FILE%"
echo call start-dev.bat>> "%AUTOSTART_FILE%"

echo.
echo Auto-start enabled.
echo Startup file:
echo %AUTOSTART_FILE%
echo.

endlocal
