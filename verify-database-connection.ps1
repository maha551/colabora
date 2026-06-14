# PowerShell script to verify DATABASE_URL connection on Fly.io
# This script checks if colabora-app is properly connected to colabora-db

Write-Host ""
Write-Host "🔍 Verifying DATABASE_URL Connection" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# Check 1: Verify DATABASE_URL secret exists
Write-Host "1. Checking if DATABASE_URL secret is set..." -ForegroundColor Yellow
$secrets = fly secrets list --app colabora-app 2>&1
if ($secrets -match "DATABASE_URL") {
    Write-Host "   ✅ DATABASE_URL secret is set" -ForegroundColor Green
    
    # Try to get the actual value (masked)
    $dbUrlLine = ($secrets | Select-String "DATABASE_URL").Line
    Write-Host "   Found: $dbUrlLine" -ForegroundColor Gray
} else {
    Write-Host "   ❌ DATABASE_URL secret NOT found" -ForegroundColor Red
    Write-Host "   Run: fly postgres attach --app colabora-app colabora-db" -ForegroundColor Yellow
    exit 1
}

# Check 2: Verify database exists
Write-Host ""
Write-Host "2. Checking if colabora-db exists..." -ForegroundColor Yellow
$dbList = fly postgres list 2>&1
if ($dbList -match "colabora-db") {
    Write-Host "   ✅ colabora-db database exists" -ForegroundColor Green
    $dbStatus = ($dbList | Select-String "colabora-db").Line
    Write-Host "   Status: $dbStatus" -ForegroundColor Gray
} else {
    Write-Host "   ❌ colabora-db NOT found" -ForegroundColor Red
    Write-Host "   Run: fly postgres create --name colabora-db --region fra" -ForegroundColor Yellow
    exit 1
}

# Check 3: Verify app is running
Write-Host ""
Write-Host "3. Checking app status..." -ForegroundColor Yellow
$appStatus = fly status --app colabora-app 2>&1
if ($appStatus -match "started") {
    Write-Host "   ✅ App is running" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  App may not be running" -ForegroundColor Yellow
}

# Check 4: Test connection via health endpoint
Write-Host ""
Write-Host "4. Testing database connection via health endpoint..." -ForegroundColor Yellow
try {
    $healthResponse = Invoke-RestMethod -Uri "https://colabora-app.fly.dev/api/health" -Method Get -TimeoutSec 10 -ErrorAction Stop
    if ($healthResponse.database -eq "connected") {
        Write-Host "   ✅ Database connection: CONNECTED" -ForegroundColor Green
    } elseif ($healthResponse.database -eq "error") {
        Write-Host "   ❌ Database connection: ERROR" -ForegroundColor Red
        Write-Host "   Check logs: fly logs --app colabora-app" -ForegroundColor Yellow
    } else {
        Write-Host "   ⚠️  Database status: $($healthResponse.database)" -ForegroundColor Yellow
    }
    Write-Host "   App status: $($healthResponse.status)" -ForegroundColor Gray
} catch {
    Write-Host "   ⚠️  Could not reach health endpoint: $_" -ForegroundColor Yellow
    Write-Host "   This might mean the app is not deployed or not responding" -ForegroundColor Gray
}

# Summary
Write-Host ""
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "Summary" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "✅ DATABASE_URL secret: SET" -ForegroundColor Green
Write-Host "✅ Database exists: colabora-db" -ForegroundColor Green
Write-Host ""
Write-Host "To verify the connection string format:" -ForegroundColor Yellow
Write-Host '  fly ssh console --app colabora-app' -ForegroundColor White
Write-Host '  Then run: echo $env:DATABASE_URL' -ForegroundColor White
Write-Host ""
Write-Host 'Expected format: postgresql://user:pass@host:port/db' -ForegroundColor Gray
Write-Host ""

