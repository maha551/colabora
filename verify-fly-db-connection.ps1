# Comprehensive Fly.io Database Connection Verification Script
# This script verifies that the database and app are properly connected

param(
    [string]$AppName = "colabora-50users-20260111",
    [string]$DbName = "colabora-db"
)

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Fly.io Database Connection Verification" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

$allChecksPassed = $true

# Check 1: Verify DATABASE_URL secret exists
Write-Host "[CHECK 1] Verifying DATABASE_URL secret..." -ForegroundColor Yellow
try {
    $secrets = fly secrets list --app $AppName --json 2>&1 | ConvertFrom-Json
    $dbUrlSecret = $secrets | Where-Object { $_.Name -eq "DATABASE_URL" }
    
    if ($dbUrlSecret) {
        Write-Host "  ✅ DATABASE_URL secret is set" -ForegroundColor Green
        
        # Check if it's a PostgreSQL URL
        $dbUrlValue = $dbUrlSecret.Name + "=" + ($dbUrlSecret.Digest -replace '.{0,8}$', '***')
        if ($dbUrlSecret.Digest -match "postgres") {
            Write-Host "  ✅ DATABASE_URL appears to be PostgreSQL" -ForegroundColor Green
        } else {
            Write-Host "  ⚠️  DATABASE_URL may not be PostgreSQL format" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  ❌ DATABASE_URL secret NOT found" -ForegroundColor Red
        Write-Host "  Solution: Run: fly postgres attach --app $AppName $DbName" -ForegroundColor Yellow
        $allChecksPassed = $false
    }
} catch {
    Write-Host "  ❌ Error checking secrets: $_" -ForegroundColor Red
    $allChecksPassed = $false
}

Write-Host ""

# Check 2: Verify database exists
Write-Host "[CHECK 2] Verifying database exists..." -ForegroundColor Yellow
try {
    $dbList = fly postgres list 2>&1
    if ($LASTEXITCODE -eq 0 -and $dbList -match $DbName) {
        Write-Host "  ✅ Database '$DbName' exists" -ForegroundColor Green
        
        # Try to get database status
        $dbInfo = fly postgres status --app $DbName 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✅ Database is accessible" -ForegroundColor Green
        }
    } else {
        Write-Host "  ❌ Database '$DbName' NOT found" -ForegroundColor Red
        Write-Host "  Solution: Create database or check name" -ForegroundColor Yellow
        $allChecksPassed = $false
    }
} catch {
    Write-Host "  ⚠️  Could not verify database existence: $_" -ForegroundColor Yellow
}

Write-Host ""

# Check 3: Verify app is running
Write-Host "[CHECK 3] Verifying app status..." -ForegroundColor Yellow
try {
    $appStatus = fly status --app $AppName 2>&1
    if ($LASTEXITCODE -eq 0) {
        if ($appStatus -match "started|running") {
            Write-Host "  ✅ App is running" -ForegroundColor Green
        } else {
            Write-Host "  ⚠️  App may not be running" -ForegroundColor Yellow
            Write-Host "  Status output: $appStatus" -ForegroundColor Gray
        }
    } else {
        Write-Host "  ⚠️  Could not check app status" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ⚠️  Error checking app status: $_" -ForegroundColor Yellow
}

Write-Host ""

# Check 4: Test connection from within the app
Write-Host "[CHECK 4] Testing database connection from app..." -ForegroundColor Yellow
try {
    Write-Host "  Running diagnostic script inside app..." -ForegroundColor Gray
    
    # Check if diagnostic script exists
    if (Test-Path "scripts/diagnose-fly-database.js") {
        $diagnosticOutput = fly ssh console --app $AppName -C "node scripts/diagnose-fly-database.js" 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✅ Database connection test passed" -ForegroundColor Green
            Write-Host "  Diagnostic output:" -ForegroundColor Gray
            $diagnosticOutput | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
        } else {
            Write-Host "  ❌ Database connection test failed" -ForegroundColor Red
            Write-Host "  Diagnostic output:" -ForegroundColor Gray
            $diagnosticOutput | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
            $allChecksPassed = $false
        }
    } else {
        Write-Host "  ⚠️  Diagnostic script not found, skipping..." -ForegroundColor Yellow
        Write-Host "  Alternative: Test manually with:" -ForegroundColor Gray
        Write-Host "    fly ssh console --app $AppName" -ForegroundColor White
        Write-Host "    psql `$DATABASE_URL -c 'SELECT 1'" -ForegroundColor White
    }
} catch {
    Write-Host "  ⚠️  Could not run diagnostic: $_" -ForegroundColor Yellow
}

Write-Host ""

# Check 5: Test health endpoint
Write-Host "[CHECK 5] Testing health endpoint..." -ForegroundColor Yellow
try {
    $appUrl = "https://$AppName.fly.dev"
    Write-Host "  Testing: $appUrl/api/health/ready" -ForegroundColor Gray
    
    $healthResponse = Invoke-RestMethod -Uri "$appUrl/api/health/ready" -Method Get -TimeoutSec 10 -ErrorAction Stop
    
    if ($healthResponse.database -eq $true -or $healthResponse.databaseAvailable -eq $true) {
        Write-Host "  ✅ Health endpoint reports database: CONNECTED" -ForegroundColor Green
        Write-Host "  Status: $($healthResponse.status)" -ForegroundColor Gray
    } elseif ($healthResponse.status -eq "degraded") {
        Write-Host "  ❌ Health endpoint reports: DEGRADED" -ForegroundColor Red
        Write-Host "  Database available: $($healthResponse.databaseAvailable)" -ForegroundColor Gray
        Write-Host "  Message: $($healthResponse.message)" -ForegroundColor Gray
        $allChecksPassed = $false
    } else {
        Write-Host "  ⚠️  Health endpoint status: $($healthResponse.status)" -ForegroundColor Yellow
        Write-Host "  Database: $($healthResponse.database)" -ForegroundColor Gray
    }
} catch {
    Write-Host "  ⚠️  Could not reach health endpoint: $_" -ForegroundColor Yellow
    Write-Host "  This might mean the app is not deployed or not responding" -ForegroundColor Gray
}

Write-Host ""

# Check 6: Verify app logs for database connection
Write-Host "[CHECK 6] Checking recent app logs for database connection..." -ForegroundColor Yellow
try {
    $logs = fly logs --app $AppName -n 50 2>&1
    
    $dbInitLogs = $logs | Select-String -Pattern "Database|DATABASE|postgres|PostgreSQL|connection" -CaseSensitive:$false
    
    if ($dbInitLogs) {
        Write-Host "  Found database-related log entries:" -ForegroundColor Gray
        $dbInitLogs | Select-Object -First 5 | ForEach-Object {
            $line = $_.Line
            if ($line -match "initialized|connected|success") {
                Write-Host "    ✅ $line" -ForegroundColor Green
            } elseif ($line -match "error|failed|timeout") {
                Write-Host "    ❌ $line" -ForegroundColor Red
                $allChecksPassed = $false
            } else {
                Write-Host "    ℹ️  $line" -ForegroundColor Gray
            }
        }
    } else {
        Write-Host "  ⚠️  No database-related log entries found in recent logs" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ⚠️  Could not retrieve logs: $_" -ForegroundColor Yellow
}

Write-Host ""

# Summary
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
if ($allChecksPassed) {
    Write-Host "✅ All checks passed - Database and app appear to be connected" -ForegroundColor Green
} else {
    Write-Host "❌ Some checks failed - Database connection may have issues" -ForegroundColor Red
    Write-Host ""
    Write-Host "Recommended actions:" -ForegroundColor Yellow
    Write-Host "  1. Verify DATABASE_URL is set: fly secrets list --app $AppName" -ForegroundColor White
    Write-Host "  2. Re-attach database: fly postgres attach --app $AppName $DbName" -ForegroundColor White
    Write-Host "  3. Check app logs: fly logs --app $AppName" -ForegroundColor White
    Write-Host "  4. Test connection manually:" -ForegroundColor White
    Write-Host "     fly ssh console --app $AppName" -ForegroundColor Gray
    Write-Host "     psql `$DATABASE_URL -c 'SELECT 1'" -ForegroundColor Gray
}
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

if ($allChecksPassed) {
    exit 0
} else {
    exit 1
}
