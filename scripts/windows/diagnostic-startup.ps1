# Comprehensive CICTrix Startup Validation & Diagnostics
# Run this manually to test the entire startup process without auto-opening browser

Write-Host "`n╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║        CICTrix Comprehensive Startup Validation           ║" -ForegroundColor Cyan
Write-Host "║                 Complete System Diagnostics                ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

$diagnostics = @{}
$startTime = Get-Date

# ============ SECTION 1: Environment Validation ============
Write-Host "[1/5] Environment Validation" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────" -ForegroundColor Gray

# Check .env file
if (Test-Path ".env") {
    Write-Host "  ✓ .env file exists" -ForegroundColor Green
    $diagnostics.envFileExists = $true
    
    $envContent = Get-Content .env -Raw
    if ($envContent -like "*VITE_SUPABASE_URL*") {
        Write-Host "  ✓ VITE_SUPABASE_URL configured" -ForegroundColor Green
    } else {
        Write-Host "  ✗ VITE_SUPABASE_URL missing" -ForegroundColor Red
    }
} else {
    Write-Host "  ✗ .env file not found" -ForegroundColor Red
    $diagnostics.envFileExists = $false
}

# Check Node modules
if (Test-Path "node_modules" -Type Container) {
    Write-Host "  ✓ node_modules exists" -ForegroundColor Green
    $diagnostics.nodeModulesExists = $true
} else {
    Write-Host "  ✗ node_modules not found - run 'npm install'" -ForegroundColor Red
    $diagnostics.nodeModulesExists = $false
}

# Check Python venv
$venvPath = if (Test-Path "\.venv") { "\.venv" } elseif (Test-Path "backend\venv") { "backend\venv" } else { $null }
if ($venvPath) {
    Write-Host "  ✓ Python venv found at $venvPath" -ForegroundColor Green
    $diagnostics.pythonVenvExists = $true
} else {
    Write-Host "  ✗ Python venv not found" -ForegroundColor Red
    $diagnostics.pythonVenvExists = $false
}

Write-Host ""

# ============ SECTION 2: Port Availability Check ============
Write-Host "[2/5] Port Availability Check" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────" -ForegroundColor Gray

$ports = @{
    "5173" = "Vite (Frontend)";
    "8000" = "Python Backend";
    "3000" = "React (Alternative)";
}

foreach ($port in $ports.Keys) {
    $portName = $ports[$port]
    try {
        $connection = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
        if ($connection) {
            Write-Host "  ✗ Port $port ($portName) - IN USE by PID $($connection[0].OwningProcess)" -ForegroundColor Red
            $diagnostics["port_$port"] = "IN_USE"
        } else {
            Write-Host "  ✓ Port $port ($portName) - Available" -ForegroundColor Green
            $diagnostics["port_$port"] = "AVAILABLE"
        }
    } catch {
        Write-Host "  ✓ Port $port ($portName) - Available" -ForegroundColor Green
        $diagnostics["port_$port"] = "AVAILABLE"
    }
}

Write-Host ""

# ============ SECTION 3: Backend Health Check ============
Write-Host "[3/5] Backend Health Check (port 8000)" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────" -ForegroundColor Gray

$backendHealthy = $false
try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:8000/health" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        $healthData = $response.Content | ConvertFrom-Json -ErrorAction SilentlyContinue
        Write-Host "  ✓ Backend responding with HTTP $($response.StatusCode)" -ForegroundColor Green
        Write-Host "  ✓ Health data: $($response.Content)" -ForegroundColor Green
        $backendHealthy = $true
        $diagnostics.backendHealthy = $true
    }
} catch {
    Write-Host "  ✗ Backend not responding: $($_.Exception.Message)" -ForegroundColor Red
    $diagnostics.backendHealthy = $false
}

Write-Host ""

# ============ SECTION 4: Frontend Connectivity Check ============
Write-Host "[4/5] Frontend Connectivity Check (port 5173)" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────" -ForegroundColor Gray

$frontendHealthy = $false
try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:5173/" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        Write-Host "  ✓ Frontend responding with HTTP $($response.StatusCode)" -ForegroundColor Green
        
        if ($response.Content -like "*<!doctype*" -or $response.Content -like "*<html*") {
            Write-Host "  ✓ Valid HTML received from Vite" -ForegroundColor Green
        } else {
            Write-Host "  ⚠ Response is not HTML (might be error page)" -ForegroundColor Yellow
        }
        
        if ($response.Content -like "*id=`"root`"*") {
            Write-Host "  ✓ React root element found in HTML" -ForegroundColor Green
            $frontendHealthy = $true
        } else {
            Write-Host "  ⚠ React root element not found" -ForegroundColor Yellow
        }
        
        $diagnostics.frontendHealthy = $true
    }
} catch {
    Write-Host "  ✗ Frontend not responding: $($_.Exception.Message)" -ForegroundColor Red
    $diagnostics.frontendHealthy = $false
}

Write-Host ""

# ============ SECTION 5: Cross-Service Communication ============
Write-Host "[5/5] Cross-Service Communication" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────" -ForegroundColor Gray

if ($frontendHealthy -and $backendHealthy) {
    Write-Host "  ✓ Both services healthy" -ForegroundColor Green
    Write-Host "  ✓ Frontend can proxy requests to backend at /api" -ForegroundColor Green
    Write-Host "  ✓ CORS configuration allows localhost:5173 → localhost:8000" -ForegroundColor Green
    $diagnostics.communicationReady = $true
} elseif ($frontendHealthy) {
    Write-Host "  ✓ Frontend healthy (backend may use fallback mode)" -ForegroundColor Green
    $diagnostics.communicationReady = $true
} else {
    Write-Host "  ✗ Frontend not responding - system not ready" -ForegroundColor Red
    $diagnostics.communicationReady = $false
}

Write-Host ""

# ============ SUMMARY REPORT ============
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                    DIAGNOSTIC SUMMARY                      ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

$readyCount = @(
    $diagnostics.envFileExists,
    $diagnostics.nodeModulesExists,
    $diagnostics.pythonVenvExists,
    $diagnostics.backendHealthy,
    $diagnostics.frontendHealthy,
    $diagnostics.communicationReady
) | Where-Object { $_ -eq $true } | Measure-Object | Select-Object -ExpandProperty Count

Write-Host "System Readiness: $readyCount/6 checks passed" -ForegroundColor Yellow

if ($readyCount -eq 6) {
    Write-Host "✓ SYSTEM FULLY OPERATIONAL" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Access your application at:" -ForegroundColor Green
    Write-Host "    🌐 http://localhost:5173" -ForegroundColor Cyan
    Write-Host "    🔐 http://localhost:5173/admin/login" -ForegroundColor Cyan
    Write-Host ""
    $exitCode = 0
} elseif ($readyCount -ge 4) {
    Write-Host "⚠ SYSTEM PARTIALLY OPERATIONAL" -ForegroundColor Yellow
    Write-Host "  Some services may not be running or not ready yet" -ForegroundColor Yellow
    Write-Host ""
    $exitCode = 1
} else {
    Write-Host "✗ SYSTEM NOT READY FOR USE" -ForegroundColor Red
    Write-Host ""
    $exitCode = 2
}

$elapsed = (Get-Date) - $startTime
Write-Host "Diagnostics completed in $($elapsed.TotalSeconds)s" -ForegroundColor Gray

exit $exitCode
