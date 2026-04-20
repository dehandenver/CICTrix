# CICTrix Auto-Start System - Pre-launch Cleanup
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "CICTrix Auto-Start System" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# 1. Process Cleanup (React: 3000 & Vite: 5173, Python: 8000)
Write-Host "[1/4] Cleaning up ports 8000 & 5173..." -ForegroundColor Yellow
$Ports = @(3000, 5173, 8000)
foreach ($Port in $Ports) {
    $Connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    if ($Connections) {
        Write-Host "      -> Killing process on port $Port" -ForegroundColor Yellow
        $Connections | ForEach-Object { 
            Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue 
        }
    }
}
Write-Host "      OK Ports cleared successfully`n" -ForegroundColor Green

# 2. Environment Validation
Write-Host "[2/4] Validating Supabase configuration..." -ForegroundColor Yellow
$EnvPath = Join-Path $PWD ".env"

if (-Not (Test-Path $EnvPath)) {
    Write-Host "      WARNING: .env file is missing!" -ForegroundColor Yellow
}
else {
    $EnvContent = Get-Content $EnvPath -Raw
    $HasUrl = $EnvContent -like "*SUPABASE_URL*"
    $HasKey = ($EnvContent -like "*SUPABASE_ANON_KEY*") -or ($EnvContent -like "*SUPABASE_KEY*")

    if ($HasUrl -and $HasKey) {
        Write-Host "      OK Supabase environment variables validated`n" -ForegroundColor Green
    }
    else {
        Write-Host "      WARNING: Supabase URL or Key missing from .env!`n" -ForegroundColor Yellow
    }
}

# 3. Verify node_modules and venv exist
Write-Host "[3/4] Checking dependencies..." -ForegroundColor Yellow
$hasNodeModules = Test-Path "node_modules" -Type Container
$hasBackendVenv = (Test-Path "backend\venv" -Type Container) -or (Test-Path "venv" -Type Container)

if (-Not $hasNodeModules) {
    Write-Host "      WARNING: node_modules not found. Run npm install before launching." -ForegroundColor Yellow
}
else {
    Write-Host "      OK node_modules present" -ForegroundColor Green
}

if (-Not $hasBackendVenv) {
    Write-Host "      WARNING: Python venv not found. Backend may fail to start." -ForegroundColor Yellow
}
else {
    Write-Host "      OK Python venv present" -ForegroundColor Green
}
Write-Host ""

# 4. Final status message
Write-Host "[4/4] Launching servers..." -ForegroundColor Cyan
Write-Host "      -> Backend (Python/Uvicorn) will start on port 8000" -ForegroundColor Gray
Write-Host "      -> Frontend (React/Vite) will start on port 5173" -ForegroundColor Gray
Write-Host "      Please wait 10-20 seconds...`n" -ForegroundColor Gray

exit 0
