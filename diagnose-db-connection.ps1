# Database Connection Diagnostic Script for Fly.io
# This script helps diagnose why the app cannot connect to the database

param(
    [string]$AppName = "colabora-50users-20260111",
    [string]$DbName = "colabora-app-db"
)

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Database Connection Diagnostics" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Check 1: List all PostgreSQL databases
Write-Host "[CHECK 1] Listing all PostgreSQL databases..." -ForegroundColor Yellow
Write-Host ""
try {
    $databases = fly postgres list 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Available databases:" -ForegroundColor Green
        Write-Host $databases
        Write-Host ""
        
        # Check if the expected database exists
        if ($databases -match $DbName) {
            Write-Host "✅ Database '$DbName' found" -ForegroundColor Green
        } else {
            Write-Host "⚠️  Database '$DbName' NOT found in the list above" -ForegroundColor Yellow
            Write-Host "   This is likely the problem!" -ForegroundColor Red
            Write-Host ""
            Write-Host "   Possible solutions:" -ForegroundColor Cyan
            Write-Host "   1. Check the actual database name from the list above" -ForegroundColor White
            Write-Host "   2. Update DATABASE_URL to use the correct database name" -ForegroundColor White
            Write-Host "   3. Or attach the correct database to your app" -ForegroundColor White
        }
    } else {
        Write-Host "❌ Failed to list databases" -ForegroundColor Red
        Write-Host $databases
    }
} catch {
    Write-Host "❌ Error listing databases: $_" -ForegroundColor Red
}

Write-Host ""

# Check 2: Check current DATABASE_URL
Write-Host "[CHECK 2] Checking DATABASE_URL configuration..." -ForegroundColor Yellow
Write-Host ""
try {
    $secrets = fly secrets list --app $AppName 2>&1
    if ($LASTEXITCODE -eq 0) {
        $dbUrlLine = $secrets | Select-String "DATABASE_URL"
        if ($dbUrlLine) {
            Write-Host "✅ DATABASE_URL is set" -ForegroundColor Green
            
            # Extract hostname from DATABASE_URL (without showing password)
            if ($dbUrlLine -match '@([^:]+)') {
                $hostname = $matches[1]
                Write-Host "   Hostname: $hostname" -ForegroundColor Gray
                
                # Check if it matches expected database name
                if ($hostname -match $DbName) {
                    Write-Host "✅ Hostname matches expected database name" -ForegroundColor Green
                } else {
                    Write-Host "⚠️  Hostname does NOT match expected database name '$DbName'" -ForegroundColor Yellow
                    Write-Host "   Current hostname: $hostname" -ForegroundColor Gray
                    Write-Host "   Expected: $DbName.flycast" -ForegroundColor Gray
                }
                
                # Check if using flycast
                if ($hostname -match "flycast") {
                    Write-Host "✅ Using Fly.io internal network (flycast)" -ForegroundColor Green
                } else {
                    Write-Host "⚠️  Not using flycast - may have connectivity issues" -ForegroundColor Yellow
                }
            }
        } else {
            Write-Host "❌ DATABASE_URL is NOT set!" -ForegroundColor Red
            Write-Host ""
            Write-Host "   This is the problem! You need to attach a database." -ForegroundColor Red
            Write-Host ""
            Write-Host "   Solution:" -ForegroundColor Cyan
            Write-Host "   fly postgres attach --app $AppName <database-name>" -ForegroundColor White
        }
    } else {
        Write-Host "❌ Failed to list secrets" -ForegroundColor Red
        Write-Host $secrets
    }
} catch {
    Write-Host "❌ Error checking secrets: $_" -ForegroundColor Red
}

Write-Host ""

# Check 3: Check if database app is running
Write-Host "[CHECK 3] Checking database app status..." -ForegroundColor Yellow
Write-Host ""
try {
    $dbStatus = fly status --app $DbName 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Database app '$DbName' exists" -ForegroundColor Green
        Write-Host $dbStatus
        Write-Host ""
        
        # Check if it's running
        if ($dbStatus -match "running|started") {
            Write-Host "✅ Database app is running" -ForegroundColor Green
        } else {
            Write-Host "⚠️  Database app may not be running" -ForegroundColor Yellow
            Write-Host "   Try: fly apps restart $DbName" -ForegroundColor White
        }
    } else {
        Write-Host "❌ Database app '$DbName' does NOT exist!" -ForegroundColor Red
        Write-Host ""
        Write-Host "   This is likely the problem!" -ForegroundColor Red
        Write-Host ""
        Write-Host "   Solution:" -ForegroundColor Cyan
        Write-Host "   1. Check the actual database name from CHECK 1 above" -ForegroundColor White
        Write-Host "   2. Update DATABASE_URL to use the correct database name" -ForegroundColor White
        Write-Host "   3. Or create/attach the database:" -ForegroundColor White
        Write-Host "      fly postgres attach --app $AppName <actual-db-name>" -ForegroundColor White
    }
} catch {
    Write-Host "⚠️  Could not check database status (this is OK if database doesn't exist)" -ForegroundColor Yellow
}

Write-Host ""

# Check 4: Test connection from app
Write-Host "[CHECK 4] Testing database connection from app..." -ForegroundColor Yellow
Write-Host ""
Write-Host "Attempting to connect to database from within the app..." -ForegroundColor Gray
try {
    $testResult = fly ssh console --app $AppName -C "node scripts/diagnose-fly-database.js" 2>&1
    Write-Host $testResult
} catch {
    Write-Host "⚠️  Could not run diagnostic from app: $_" -ForegroundColor Yellow
    Write-Host "   You can run it manually:" -ForegroundColor Gray
    Write-Host "   fly ssh console --app $AppName" -ForegroundColor White
    Write-Host "   node scripts/diagnose-fly-database.js" -ForegroundColor White
}

Write-Host ""

# Summary and recommendations
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Summary & Recommendations" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

Write-Host "Common Issues & Fixes:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Database name mismatch:" -ForegroundColor Cyan
Write-Host "   - DATABASE_URL points to a database that doesn't exist" -ForegroundColor White
Write-Host "   - Fix: fly postgres attach --app $AppName <correct-db-name>" -ForegroundColor White
Write-Host ""
Write-Host "2. Database not attached:" -ForegroundColor Cyan
Write-Host "   - DATABASE_URL is not set" -ForegroundColor White
Write-Host "   - Fix: fly postgres attach --app $AppName <db-name>" -ForegroundColor White
Write-Host ""
Write-Host "3. Database not running:" -ForegroundColor Cyan
Write-Host "   - Database app is stopped" -ForegroundColor White
Write-Host "   - Fix: fly apps restart <db-name>" -ForegroundColor White
Write-Host ""
Write-Host "4. Wrong hostname in DATABASE_URL:" -ForegroundColor Cyan
Write-Host "   - Using external hostname instead of flycast" -ForegroundColor White
Write-Host "   - Fix: Re-attach database to get correct flycast URL" -ForegroundColor White
Write-Host ""

Write-Host "Quick Fix Commands:" -ForegroundColor Yellow
Write-Host ""
Write-Host "# List all databases:" -ForegroundColor Gray
Write-Host "fly postgres list" -ForegroundColor White
Write-Host ""
Write-Host "# Attach database to app:" -ForegroundColor Gray
Write-Host "fly postgres attach --app $AppName <db-name>" -ForegroundColor White
Write-Host ""
Write-Host "# Check app secrets:" -ForegroundColor Gray
Write-Host "fly secrets list --app $AppName" -ForegroundColor White
Write-Host ""
Write-Host "# Restart database:" -ForegroundColor Gray
Write-Host "fly apps restart <db-name>" -ForegroundColor White
Write-Host ""
