@echo off
setlocal

cd /d "%~dp0.."

set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "AUTOSTART_FILE=%STARTUP_DIR%\CICTrix-AutoStart.bat"
set "TASK_NAME=CICTrix Auto Start"

REM Remove legacy startup file if it exists.
if exist "%AUTOSTART_FILE%" del "%AUTOSTART_FILE%" >nul 2>nul

REM Build a delayed logon task for better reliability after reboot.
schtasks /Query /TN "%TASK_NAME%" >nul 2>nul
if %ERRORLEVEL%==0 (
	schtasks /Delete /TN "%TASK_NAME%" /F >nul 2>nul
)

schtasks /Create /TN "%TASK_NAME%" /SC ONLOGON /DELAY 0000:05 /F /TR "cmd /c cd /d \"%~dp0..\" && call scripts\start-dev.bat --autostart" >nul 2>nul

if %ERRORLEVEL%==0 (
	echo.
	echo Auto-start enabled via Task Scheduler.
	echo Task name:
	echo %TASK_NAME%
	echo.
	echo Behavior:
	echo - Runs at Windows logon with a 5-second delay
	echo - Starts CICTrix services in autostart mode
	echo.
	goto :end
)

echo @echo off> "%AUTOSTART_FILE%"
echo timeout /t 5 /nobreak ^>nul>> "%AUTOSTART_FILE%"
echo cd /d "%~dp0..">> "%AUTOSTART_FILE%"
echo call "%~dp0start-dev.bat" --autostart>> "%AUTOSTART_FILE%"

echo.
echo [WARN] Could not create scheduled task (insufficient permission or policy).
echo        Fallback Startup file was created:
echo %AUTOSTART_FILE%
echo.

:end
endlocal