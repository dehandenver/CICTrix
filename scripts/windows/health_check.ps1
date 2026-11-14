$BackendHealthy = $false
$FrontendHealthy = $false
$MaxRetries = 15
$RetryCount = 0

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "System Health Check" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Check Backend (Port 8000)
Write-Host "Checking Backend API (http://127.0.0.1:8000/health)..." -ForegroundColor Yellow
while ($RetryCount -lt $MaxRetries) {
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:8000/health" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-Host "      OK Backend is healthy" -ForegroundColor Green
            $BackendHealthy = $true
            break
        }
    }
    catch {
        $RetryCount++
        if ($RetryCount -lt $MaxRetries) {
            Write-Host "      Waiting for backend ($RetryCount/$MaxRetries)..." -ForegroundColor Gray
            Start-Sleep -Seconds 1
        }
    }
}

if (-Not $BackendHealthy) {
    Write-Host "      ERROR Backend failed after $MaxRetries attempts" -ForegroundColor Red
}

$RetryCount = 0

# Check Frontend (Port 5173)
Write-Host "Checking Frontend (http://localhost:5173)..." -ForegroundColor Yellow
while ($RetryCount -lt $MaxRetries) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:5173" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-Host "      OK Frontend is healthy" -ForegroundColor Green
            $FrontendHealthy = $true
            break
        }
    }
    catch {
        $RetryCount++
        if ($RetryCount -lt $MaxRetries) {
            Write-Host "      Waiting for frontend ($RetryCount/$MaxRetries)..." -ForegroundColor Gray
            Start-Sleep -Seconds 1
        }
    }
}

if (-Not $FrontendHealthy) {
    Write-Host "      ERROR Frontend failed after $MaxRetries attempts" -ForegroundColor Red
}

# Final status
Write-Host "`n========================================" -ForegroundColor Cyan
if ($BackendHealthy -and $FrontendHealthy) {
    Write-Host "SYSTEM READY" -ForegroundColor Green
    Write-Host "========================================`n" -ForegroundColor Cyan
    Write-Host "Your HRIS system is running:" -ForegroundColor Green
    Write-Host "   Frontend:  http://localhost:5173" -ForegroundColor Cyan
    Write-Host "   Backend:   http://127.0.0.1:8000" -ForegroundColor Cyan
    Write-Host "   Health:    http://127.0.0.1:8000/health`n" -ForegroundColor Cyan
    exit 0
}
else {
    Write-Host "SYSTEM NOT READY" -ForegroundColor Red
    Write-Host "========================================`n" -ForegroundColor Cyan
    if (-Not $BackendHealthy) {
        Write-Host "Backend failed to start" -ForegroundColor Yellow
    }
    if (-Not $FrontendHealthy) {
        Write-Host "Frontend failed to start" -ForegroundColor Yellow
    }
    Write-Host ""
    exit 1
}
