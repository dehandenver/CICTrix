# Enhanced startup verification for CICTrix with detailed diagnostics
# This script verifies both backend and frontend are fully initialized

$maxRetries = 60
$retryInterval = 1500  # milliseconds
$backendReady = $false
$frontendReady = $false
$backendErrors = @()
$frontendErrors = @()

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "CICTrix System Startup Verification" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan
Write-Host "Timeout: $($maxRetries * $retryInterval / 1000) seconds`n" -ForegroundColor Gray

# ============ PHASE 1: Backend Verification ============
Write-Host "[1/3] Verifying Backend (port 8000)..." -ForegroundColor Yellow
$backendRetry = 0

while ($backendRetry -lt $maxRetries -and -not $backendReady) {
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:8000/health" `
            -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        
        if ($response.StatusCode -eq 200) {
            # Parse response to ensure backend is ready
            $healthData = $response.Content | ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($healthData.status -eq "healthy") {
                Write-Host "  ✓ Backend responding and healthy`n" -ForegroundColor Green
                $backendReady = $true
                break
            }
        }
    } catch {
        $backendRetry++
        $statusMsg = $_.Exception.Message -replace "`r`n", " "
        if ($backendRetry -le 3 -or $backendRetry % 10 -eq 0) {
            Write-Host "  ⏳ Waiting for backend... ($backendRetry/$maxRetries) - $statusMsg" -ForegroundColor Gray
        }
        Start-Sleep -Milliseconds $retryInterval
    }
}

if (-not $backendReady) {
    Write-Host "  ⚠️  Backend did not respond (this may be OK if using fallback mode)" -ForegroundColor Yellow
    $backendErrors += "Backend health endpoint not responding after $($maxRetries * $retryInterval / 1000)s"
}

# ============ PHASE 2: Frontend Vite Server Verification ============
Write-Host "[2/3] Verifying Frontend Vite Server (port 5173)..." -ForegroundColor Yellow
$frontendRetry = 0
$viteHealthy = $false

while ($frontendRetry -lt $maxRetries -and -not $viteHealthy) {
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:5173/" `
            -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        
        if ($response.StatusCode -eq 200) {
            # Check if response contains expected HTML (not an error page)
            if ($response.Content -like "*<!doctype*" -or $response.Content -like "*<html*") {
                Write-Host "  ✓ Vite dev server responding with HTML`n" -ForegroundColor Green
                $viteHealthy = $true
                break
            }
        }
    } catch {
        $frontendRetry++
        if ($frontendRetry -le 3 -or $frontendRetry % 10 -eq 0) {
            Write-Host "  ⏳ Waiting for Vite... ($frontendRetry/$maxRetries)" -ForegroundColor Gray
        }
        Start-Sleep -Milliseconds $retryInterval
    }
}

if (-not $viteHealthy) {
    $frontendErrors += "Vite dev server not responding after $($frontendRetry * $retryInterval / 1000)s"
    Write-Host "  ✗ Vite server failed to respond`n" -ForegroundColor Red
}

# ============ PHASE 3: App Bundle Load Verification ============
if ($viteHealthy) {
    Write-Host "[3/3] Verifying App Bundles & JavaScript Load..." -ForegroundColor Yellow
    $bundleRetry = 0
    $frontendReady = $false
    
    while ($bundleRetry -lt 15 -and -not $frontendReady) {
        try {
            # Attempt to load the page and check if key resources are accessible
            $response = Invoke-WebRequest -Uri "http://127.0.0.1:5173/" `
                -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
            
            # Check for expected content markers indicating successful React init
            if ($response.Content -like "*id=`"root`"*" -and $response.Content -like "*<script*") {
                Write-Host "  ✓ App bundles loading successfully`n" -ForegroundColor Green
                $frontendReady = $true
                break
            }
        } catch {
            $bundleRetry++
            if ($bundleRetry -le 2) {
                Write-Host "  ⏳ Waiting for bundles... ($bundleRetry/15)" -ForegroundColor Gray
            }
            Start-Sleep -Milliseconds 500
        }
    }
    
    if (-not $frontendReady) {
        $frontendErrors += "App bundles did not load after $($bundleRetry * 500 / 1000)s"
    }
} else {
    $frontendReady = $false
}

# ============ FINAL STATUS REPORT ============
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "STARTUP VERIFICATION COMPLETE" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$readinessStatus = @{
    "Backend Health" = if ($backendReady) { "✓ Ready" } else { "⚠ Warning" }
    "Frontend Vite" = if ($viteHealthy) { "✓ Ready" } else { "✗ Failed" }
    "App Bundles" = if ($frontendReady) { "✓ Ready" } else { "✗ Failed" }
}

foreach ($key in $readinessStatus.Keys) {
    $status = $readinessStatus[$key]
    $color = if ($status -like "✓*") { "Green" } else { "Yellow" }
    Write-Host "  $status  $key" -ForegroundColor $color
}

Write-Host ""

# ============ SUCCESS PATH ============
if ($frontendReady -and $viteHealthy) {
    Write-Host "✓ ALL SYSTEMS READY - System is fully initialized!" -ForegroundColor Green
    Write-Host "========================================`n" -ForegroundColor Cyan
    Write-Host "Access your application:" -ForegroundColor Green
    Write-Host "   🌐 http://localhost:5173" -ForegroundColor Cyan
    Write-Host "   🔐 http://localhost:5173/admin/login" -ForegroundColor Cyan
    Write-Host ""
    exit 0
}

# ============ FAILURE PATH - Detailed Diagnostics ============
Write-Host "⚠️  STARTUP ISSUES DETECTED" -ForegroundColor Yellow
Write-Host "========================================`n" -ForegroundColor Yellow

if ($frontendErrors.Count -gt 0) {
    Write-Host "Frontend Issues:" -ForegroundColor Red
    foreach ($error in $frontendErrors) {
        Write-Host "  • $error" -ForegroundColor Red
    }
    Write-Host ""
}

Write-Host "Troubleshooting Steps:" -ForegroundColor Yellow
Write-Host "  1. Check the 'Run React Frontend' terminal for errors" -ForegroundColor Gray
Write-Host "  2. Check the 'Run Python Backend' terminal for errors" -ForegroundColor Gray
Write-Host "  3. Verify ports are not in use: netstat -an | findstr 5173" -ForegroundColor Gray
Write-Host "  4. Try 'Pre-launch Cleanup' task to kill stale processes" -ForegroundColor Gray
Write-Host "  5. Run: npm install && npm run dev (in root)" -ForegroundColor Gray
Write-Host "  6. Run: pip install -r backend/requirements.txt (in backend)" -ForegroundColor Gray
Write-Host ""

if ($backendReady) {
    Write-Host "Backend API is accessible at: http://localhost:8000/health" -ForegroundColor Green
} else {
    Write-Host "Backend not responding - check 'Run Python Backend' terminal" -ForegroundColor Red
}

Write-Host ""
exit 1
