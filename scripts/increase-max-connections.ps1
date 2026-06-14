# PowerShell script to increase PostgreSQL max_connections on Fly.io
# This script helps you configure max_connections based on your database VM size

param(
    [string]$DbAppName = "colabora-app-db",
    [string]$AppName = "colabora-50users-20260111",
    [int]$TargetMaxConnections = 50
)

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  PostgreSQL max_connections Configuration" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check current database VM size
Write-Host "📊 Step 1: Checking current database VM size..." -ForegroundColor Yellow
$scaleInfo = fly scale show --app $DbAppName 2>&1
Write-Host $scaleInfo

# Extract VM size from output
$vmSize = $scaleInfo | Select-String -Pattern "VM Size:\s+(\S+)" | ForEach-Object { $_.Matches.Groups[1].Value }
if (-not $vmSize) {
    $vmSize = "unknown"
}

Write-Host ""
Write-Host "Current VM size: $vmSize" -ForegroundColor Cyan
Write-Host ""

# Step 2: Determine recommended max_connections based on VM size
Write-Host "📋 Step 2: Recommended max_connections by VM size:" -ForegroundColor Yellow
Write-Host ""

$recommendations = @{
    "shared-cpu-1x" = @{ max = 5; pool = 4; note = "Very limited - upgrade recommended" }
    "shared-cpu-2x" = @{ max = 10; pool = 8; note = "OK for small apps" }
    "shared-cpu-4x" = @{ max = 25; pool = 20; note = "Good for medium apps" }
    "performance-1x" = @{ max = 100; pool = 80; note = "Excellent for production" }
    "performance-2x" = @{ max = 200; pool = 160; note = "Great for high load" }
}

$recommended = $recommendations[$vmSize]
if (-not $recommended) {
    Write-Host "⚠️  Unknown VM size: $vmSize" -ForegroundColor Yellow
    Write-Host "   Using conservative defaults: max=10, pool=8" -ForegroundColor Yellow
    $recommended = @{ max = 10; pool = 8; note = "Conservative default" }
}

Write-Host "  For VM size: $vmSize" -ForegroundColor White
Write-Host "  Recommended max_connections: $($recommended.max)" -ForegroundColor Green
Write-Host "  Recommended PG_POOL_MAX: $($recommended.pool)" -ForegroundColor Green
Write-Host "  Note: $($recommended.note)" -ForegroundColor Gray
Write-Host ""

# Step 3: Check current max_connections
Write-Host "🔍 Step 3: Checking current max_connections..." -ForegroundColor Yellow
Write-Host ""

# Use Node.js script from the app
$checkOutput = fly ssh console --app $AppName -C "node scripts/check-max-connections.js" 2>&1
Write-Host $checkOutput

# Try to extract max_connections from output
$currentMax = $checkOutput | Select-String -Pattern "max_connections:\s+(\d+)" | ForEach-Object { $_.Matches.Groups[1].Value }

if ($currentMax) {
    Write-Host ""
    Write-Host "Current max_connections: $currentMax" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "⚠️  Could not read current max_connections from output" -ForegroundColor Yellow
    Write-Host "   Check the output above for connection details" -ForegroundColor Gray
    $currentMax = "unknown"
}

Write-Host ""

# Step 4: Provide upgrade path if needed
if ($currentMax -and [int]$currentMax -lt $TargetMaxConnections) {
    Write-Host "⚠️  Current max_connections ($currentMax) is below target ($TargetMaxConnections)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "📈 Step 4: To increase max_connections, upgrade your database VM:" -ForegroundColor Yellow
    Write-Host ""
    
    if ($vmSize -eq "shared-cpu-1x") {
        Write-Host "  Option 1: Upgrade to shared-cpu-4x (1GB RAM, ~25 connections):" -ForegroundColor White
        Write-Host "    fly scale vm shared-cpu-4x --app $DbAppName" -ForegroundColor Gray
        Write-Host ""
        Write-Host "  Option 2: Upgrade to performance-1x (2GB RAM, ~100 connections):" -ForegroundColor White
        Write-Host "    fly scale vm performance-1x --app $DbAppName" -ForegroundColor Gray
    } elseif ($vmSize -eq "shared-cpu-2x") {
        Write-Host "  Option 1: Upgrade to shared-cpu-4x (1GB RAM, ~25 connections):" -ForegroundColor White
        Write-Host "    fly scale vm shared-cpu-4x --app $DbAppName" -ForegroundColor Gray
        Write-Host ""
        Write-Host "  Option 2: Upgrade to performance-1x (2GB RAM, ~100 connections):" -ForegroundColor White
        Write-Host "    fly scale vm performance-1x --app $DbAppName" -ForegroundColor Gray
    } elseif ($vmSize -eq "shared-cpu-4x") {
        Write-Host "  Upgrade to performance-1x (2GB RAM, ~100 connections):" -ForegroundColor White
        Write-Host "    fly scale vm performance-1x --app $DbAppName" -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "  ⚠️  Note: VM upgrade will restart the database (brief downtime)" -ForegroundColor Yellow
    Write-Host ""
} else {
    Write-Host "✅ Current max_connections ($currentMax) should be sufficient" -ForegroundColor Green
    Write-Host ""
}

# Step 5: Configure application pool size
Write-Host "⚙️  Step 5: Configure application connection pool..." -ForegroundColor Yellow
Write-Host ""
Write-Host "  Set PG_POOL_MAX to match your database capacity:" -ForegroundColor White
Write-Host "    fly secrets set PG_POOL_MAX=$($recommended.pool) --app $AppName" -ForegroundColor Gray
Write-Host ""
Write-Host "  Restart app to apply changes:" -ForegroundColor White
Write-Host "    fly apps restart --app $AppName" -ForegroundColor Gray
Write-Host ""

# Step 6: Quick action commands
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Quick Action Commands" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

Write-Host "To upgrade database VM (choose one):" -ForegroundColor Yellow
Write-Host "  fly scale vm shared-cpu-4x --app $DbAppName    # 1GB RAM, ~25 connections" -ForegroundColor Gray
Write-Host "  fly scale vm performance-1x --app $DbAppName  # 2GB RAM, ~100 connections" -ForegroundColor Gray
Write-Host ""

Write-Host "To set application pool size:" -ForegroundColor Yellow
Write-Host "  fly secrets set PG_POOL_MAX=$($recommended.pool) --app $AppName" -ForegroundColor Gray
Write-Host "  fly secrets set PG_POOL_MIN=5 --app $AppName" -ForegroundColor Gray
Write-Host ""

Write-Host "To restart and apply changes:" -ForegroundColor Yellow
Write-Host "  fly apps restart --app $AppName" -ForegroundColor Gray
Write-Host ""

Write-Host "To verify configuration:" -ForegroundColor Yellow
Write-Host "  .\scripts\check-max-connections.ps1 -DbAppName $DbAppName" -ForegroundColor Gray
Write-Host ""
