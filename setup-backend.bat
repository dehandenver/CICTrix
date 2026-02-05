@echo off
REM CICTrix Backend Setup Script for Windows

echo.
echo ====================================
echo  CICTrix Backend Setup
echo ====================================
echo.

REM Check if Docker is installed
docker --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Docker is not installed or not in PATH
    echo.
    echo Please install Docker Desktop for Windows:
    echo https://www.docker.com/products/docker-desktop
    echo.
    echo After installation, restart your terminal and run this script again.
    pause
    exit /b 1
)

echo [✓] Docker found: 
docker --version
echo.

REM Check if Docker Compose is installed
docker-compose --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [✓] Using 'docker compose' (new syntax)
    set COMPOSE_CMD=docker compose
) else (
    echo [✓] Docker Compose found:
    docker-compose --version
    set COMPOSE_CMD=docker-compose
)
echo.

REM Check if .env file exists
if not exist "backend\.env" (
    echo [!] backend\.env not found, creating from template...
    copy backend\.env.example backend\.env
    echo [✓] Created backend\.env (update with your Supabase Service Role Key)
) else (
    echo [✓] backend\.env already exists
)
echo.

REM Start Docker
echo Starting Docker containers...
echo.

%COMPOSE_CMD% up -d

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to start containers
    pause
    exit /b 1
)

echo.
echo ====================================
echo  Backend is starting...
echo ====================================
echo.
echo Waiting for backend to be ready...
timeout /t 5 /nobreak

echo.
echo [✓] Backend setup complete!
echo.
echo API is running at: http://localhost:8000
echo API Docs at: http://localhost:8000/docs
echo.
echo Next steps:
echo 1. Get your Supabase Service Role Key from: https://supabase.com
echo    (Settings ^> API ^> service_role)
echo 2. Update backend\.env with the Service Role Key
echo 3. Run: docker-compose restart backend
echo.
echo View logs:
echo   %COMPOSE_CMD% logs -f backend
echo.
echo Stop backend:
echo   %COMPOSE_CMD% down
echo.

pause
