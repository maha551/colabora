# PowerShell script to check and configure PostgreSQL max_connections on Fly.io
# Usage: .\scripts\check-max-connections.ps1 [database-app-name]

param(
    [string]$DbAppName = "colabora-app-db"
)

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  PostgreSQL max_connections Check & Configuration" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Check if database app exists
Write-Host "🔍 Checking database app: $DbAppName" -ForegroundColor Yellow
$dbStatus = fly status --app $DbAppName 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Database app '$DbAppName' not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Available databases:" -ForegroundColor Yellow
    fly postgres list
    Write-Host ""
    Write-Host "Please specify the correct database app name:" -ForegroundColor Yellow
    Write-Host "  .\scripts\check-max-connections.ps1 -DbAppName <your-db-app-name>" -ForegroundColor White
    exit 1
}

Write-Host "✅ Database app found" -ForegroundColor Green
Write-Host ""

# Get DATABASE_URL from app secrets
Write-Host "📋 Getting database connection info..." -ForegroundColor Yellow
$appName = "colabora-50users-20260111"  # Adjust if your app name is different

# Try to get DATABASE_URL from app secrets
$dbUrl = fly secrets list --app $appName 2>&1 | Select-String "DATABASE_URL"
if (-not $dbUrl) {
    Write-Host "⚠️  Could not find DATABASE_URL in app secrets" -ForegroundColor Yellow
    Write-Host "   Trying to get from database app directly..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🔌 Connecting to database to check max_connections..." -ForegroundColor Yellow
Write-Host ""

# Use Node.js script from the app (more reliable than psql on database VM)
Write-Host "Running check from application (using DATABASE_URL)..." -ForegroundColor Gray
fly ssh console --app $appName -C "node scripts/check-max-connections.js" 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "⚠️  Could not run check from app. Trying alternative method..." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Alternative: Check database VM size to estimate max_connections:" -ForegroundColor Yellow
    fly scale show --app $DbAppName 2>&1
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Configuration Recommendations" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "📝 To increase max_connections:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Check your database VM size:" -ForegroundColor White
Write-Host "   fly scale show --app $DbAppName" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Upgrade VM size if needed (more RAM = more connections):" -ForegroundColor White
Write-Host "   fly scale vm shared-cpu-4x --app $DbAppName  # 1GB RAM" -ForegroundColor Gray
Write-Host "   fly scale vm performance-1x --app $DbAppName  # 2GB RAM" -ForegroundColor Gray
Write-Host ""
Write-Host "3. For Fly.io managed PostgreSQL, max_connections is:" -ForegroundColor White
Write-Host "   - shared-cpu-1x: ~5 connections" -ForegroundColor Gray
Write-Host "   - shared-cpu-2x: ~10 connections" -ForegroundColor Gray
Write-Host "   - shared-cpu-4x: ~25 connections" -ForegroundColor Gray
Write-Host "   - performance-1x: ~100 connections" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Adjust your app's pool size to match:" -ForegroundColor White
Write-Host "   fly secrets set PG_POOL_MAX=20 --app $appName" -ForegroundColor Gray
Write-Host "   fly apps restart --app $appName" -ForegroundColor Gray
Write-Host ""
