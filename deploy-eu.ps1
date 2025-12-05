# Colabora EU Deployment Script (PowerShell)
Write-Host "🚀 Deploying Colabora to Fly.io (EU - Frankfurt)" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green

# Check if fly CLI is available
$flyPath = "flyctl"
if (!(Get-Command flyctl -ErrorAction SilentlyContinue)) {
    $flyDir = Join-Path $env:USERPROFILE ".fly\bin"
    $flyPath = Join-Path $flyDir "flyctl.exe"
    
    if (!(Test-Path $flyPath)) {
        Write-Host "❌ Fly CLI not found. Please install from https://fly.io/docs/flyctl/install/" -ForegroundColor Red
        exit 1
    }
}

# Check if logged in
Write-Host "🔐 Checking authentication..." -ForegroundColor Yellow
try {
    $authCheck = & $flyPath auth whoami 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Please login to Fly.io:" -ForegroundColor Yellow
        & $flyPath auth login
    }
    else {
        Write-Host "✅ Already logged in to Fly.io" -ForegroundColor Green
        Write-Host "   User: $authCheck" -ForegroundColor Gray
    }
}
catch {
    Write-Host "❌ Fly authentication check failed." -ForegroundColor Red
    exit 1
}

# Deploy to EU region
Write-Host ""
Write-Host "🚀 Deploying application to Frankfurt (EU)..." -ForegroundColor Green
Write-Host "   App: colabora-fresh-final" -ForegroundColor Gray
Write-Host "   Region: fra (Frankfurt)" -ForegroundColor Gray
Write-Host ""

try {
    & $flyPath deploy --app colabora-fresh-final --region fra
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ Deployment complete!" -ForegroundColor Green
        Write-Host ""
        Write-Host "🌐 Getting app URL..." -ForegroundColor Cyan
        $status = & $flyPath status --app colabora-fresh-final --json 2>&1 | ConvertFrom-Json
        if ($status.Hostname) {
            Write-Host "   App URL: https://$($status.Hostname)" -ForegroundColor White
        }
    }
    else {
        Write-Host "❌ Deployment failed. Check the error above." -ForegroundColor Red
        exit 1
    }
}
catch {
    Write-Host "❌ Deployment failed: $_" -ForegroundColor Red
    exit 1
}
