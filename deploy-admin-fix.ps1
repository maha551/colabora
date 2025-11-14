# Colabora Admin Fix Deployment Script (PowerShell)
Write-Host "🔧 Deploying Colabora with Admin Dashboard fixes..." -ForegroundColor Green

# Check if fly CLI is available
$flyPath = "$env:USERPROFILE\.fly\bin\flyctl.exe"
if (!(Test-Path $flyPath)) {
    Write-Host "❌ Fly CLI not found. Installing..." -ForegroundColor Red
    try {
        # Download and install Fly CLI
        Invoke-WebRequest -Uri "https://fly.io/install.ps1" -OutFile "install-fly.ps1"
        & "install-fly.ps1"
        $env:PATH += ";$env:USERPROFILE\.fly\bin"
    } catch {
        Write-Host "❌ Failed to install Fly CLI. Please install manually from https://fly.io/docs/flyctl/install/" -ForegroundColor Red
        exit 1
    }
}

# Test Fly CLI
try {
    & $flyPath --version
} catch {
    Write-Host "❌ Fly CLI installation failed. Please restart PowerShell and try again." -ForegroundColor Red
    exit 1
}

# Check if logged in
try {
    $authCheck = & $flyPath auth whoami 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "🔐 Please login to Fly.io:" -ForegroundColor Yellow
        & $flyPath auth login
    }
} catch {
    Write-Host "❌ Fly authentication check failed." -ForegroundColor Red
}

# Force a fresh deployment
Write-Host "🚀 Deploying with latest code..." -ForegroundColor Green
try {
    & $flyPath deploy --force
    Write-Host "✅ Deployment complete!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🧪 Test the admin dashboard:" -ForegroundColor Cyan
    Write-Host "1. Visit: https://colabora-fresh.fly.dev" -ForegroundColor White
    Write-Host "2. Login: admin@colabora.local / AdminSecurePass123!" -ForegroundColor White
    Write-Host "3. Check browser console for role debug info" -ForegroundColor White
    Write-Host "4. Look for 'Admin Dashboard' in user menu" -ForegroundColor White
} catch {
    Write-Host "❌ Deployment failed. Check the error above." -ForegroundColor Red
    exit 1
}
