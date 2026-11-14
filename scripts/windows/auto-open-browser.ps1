# Auto-open browser when system is ready
# This script opens the default browser to CICTrix after verification completes

param(
    [int]$Port = 5173,
    [string]$DefaultPath = "/admin/login"
)

$url = "http://localhost:$Port$DefaultPath"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Opening Browser..." -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Verify frontend is still responding before opening
$frontendCheck = $false
try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        $frontendCheck = $true
    }
} catch {
    $frontendCheck = $false
}

if ($frontendCheck) {
    Write-Host "✓ Frontend still responsive, opening browser..." -ForegroundColor Green
    Write-Host "   URL: $url`n" -ForegroundColor Cyan
    
    # Open in default browser
    Start-Process $url
    
    Write-Host "✓ Browser opened successfully!" -ForegroundColor Green
    Write-Host ""
    exit 0
} else {
    Write-Host "✗ Frontend not responding, cannot open browser" -ForegroundColor Red
    Write-Host "   Check the 'Run React Frontend' terminal for errors" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}
