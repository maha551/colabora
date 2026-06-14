# PowerShell script to increase PostgreSQL connection pool size
# Usage: .\scripts\increase-pool-size.ps1 -AppName <your-app-name> [-DbAppName <db-app-name>] [-PoolMax <max>] [-PoolMin <min>]

param(
    [Parameter(Mandatory=$false)]
    [string]$AppName = "",
    
    [Parameter(Mandatory=$false)]
    [string]$DbAppName = "",
    
    [Parameter(Mandatory=$false)]
    [int]$PoolMax = 0,
    
    [Parameter(Mandatory=$false)]
    [int]$PoolMin = 0
)

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Increase PostgreSQL Connection Pool Size" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Auto-detect app name from fly.toml if not provided
if ([string]::IsNullOrEmpty($AppName)) {
    if (Test-Path "fly.toml") {
        $flyTomlContent = Get-Content "fly.toml" -Raw
        if ($flyTomlContent -match 'app\s*=\s*"([^"]+)"') {
            $AppName = $matches[1]
            Write-Host "✅ Auto-detected app name from fly.toml: $AppName" -ForegroundColor Green
        }
    }
    
    if ([string]::IsNullOrEmpty($AppName)) {
        Write-Host "❌ App name not provided and could not be auto-detected" -ForegroundColor Red
        Write-Host "Usage: .\scripts\increase-pool-size.ps1 -AppName <your-app-name>" -ForegroundColor Yellow
        exit 1
    }
}

# Auto-detect database app name if not provided
if ([string]::IsNullOrEmpty($DbAppName)) {
    # Common patterns: <app-name>-db, <app-name>-database, or just try common names
    $possibleDbNames = @(
        "$AppName-db",
        "$AppName-database",
        "colabora-db",
        "colabora-database"
    )
    
    foreach ($possibleName in $possibleDbNames) {
        $status = fly status --app $possibleName 2>&1
        if ($LASTEXITCODE -eq 0) {
            $DbAppName = $possibleName
            Write-Host "✅ Auto-detected database app: $DbAppName" -ForegroundColor Green
            break
        }
    }
    
    if ([string]::IsNullOrEmpty($DbAppName)) {
        Write-Host "⚠️  Could not auto-detect database app name" -ForegroundColor Yellow
        Write-Host "   You can specify it with -DbAppName parameter" -ForegroundColor Gray
    }
}

Write-Host ""

# Step 1: Check current database VM size
Write-Host "[STEP 1] Checking database configuration..." -ForegroundColor Yellow

if (-not [string]::IsNullOrEmpty($DbAppName)) {
    Write-Host "Checking database VM size..." -ForegroundColor Gray
    $dbScale = fly scale show --app $DbAppName 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Database app found: $DbAppName" -ForegroundColor Green
        $dbScale | Write-Host
    } else {
        Write-Host "⚠️  Could not check database VM size" -ForegroundColor Yellow
    }
} else {
    Write-Host "⚠️  Skipping database check (no database app name)" -ForegroundColor Yellow
}

Write-Host ""

# Step 2: Check current pool settings
Write-Host "[STEP 2] Checking current pool settings..." -ForegroundColor Yellow

$secrets = fly secrets list --app $AppName --json 2>&1 | ConvertFrom-Json
$currentPoolMin = $null
$currentPoolMax = $null

if ($secrets) {
    foreach ($secret in $secrets) {
        if ($secret.Name -eq "PG_POOL_MIN") {
            $currentPoolMin = $secret.Value
        }
        if ($secret.Name -eq "PG_POOL_MAX") {
            $currentPoolMax = $secret.Value
        }
    }
}

if ($currentPoolMin -or $currentPoolMax) {
    Write-Host "Current pool settings:" -ForegroundColor Gray
    Write-Host "  PG_POOL_MIN: $currentPoolMin" -ForegroundColor Gray
    Write-Host "  PG_POOL_MAX: $currentPoolMax" -ForegroundColor Gray
} else {
    Write-Host "⚠️  No pool settings found (using defaults: MIN=5, MAX=20)" -ForegroundColor Yellow
}

Write-Host ""

# Step 3: Determine recommended pool size
Write-Host "[STEP 3] Determining recommended pool size..." -ForegroundColor Yellow

# Pool size recommendations based on database VM size
$poolRecommendations = @{
    "shared-cpu-1x" = @{ Min = 2; Max = 4; Note = "Very limited - upgrade recommended" }
    "shared-cpu-2x" = @{ Min = 3; Max = 8; Note = "OK for small apps" }
    "shared-cpu-4x" = @{ Min = 5; Max = 20; Note = "Good for medium apps" }
    "performance-1x" = @{ Min = 10; Max = 80; Note = "Excellent for production" }
    "performance-2x" = @{ Min = 20; Max = 160; Note = "Great for high load" }
}

# If pool size not provided, try to detect from database VM
if ($PoolMax -eq 0 -or $PoolMin -eq 0) {
    if (-not [string]::IsNullOrEmpty($DbAppName)) {
        # Try to detect VM size from scale output
        $scaleOutput = fly scale show --app $DbAppName 2>&1
        $vmSize = $null
        
        if ($scaleOutput -match 'VM\s+Size:\s+(\S+)') {
            $vmSize = $matches[1]
        } elseif ($scaleOutput -match '(\w+-\w+-\w+)') {
            $vmSize = $matches[1]
        }
        
        if ($vmSize -and $poolRecommendations.ContainsKey($vmSize)) {
            $recommended = $poolRecommendations[$vmSize]
            if ($PoolMax -eq 0) { $PoolMax = $recommended.Max }
            if ($PoolMin -eq 0) { $PoolMin = $recommended.Min }
            Write-Host "✅ Detected database VM: $vmSize" -ForegroundColor Green
            Write-Host "   Recommended: MIN=$($recommended.Min), MAX=$($recommended.Max)" -ForegroundColor Cyan
            Write-Host "   $($recommended.Note)" -ForegroundColor Gray
        } else {
            Write-Host "⚠️  Could not detect database VM size" -ForegroundColor Yellow
        }
    }
    
    # If still not set, use safe defaults
    if ($PoolMax -eq 0) {
        Write-Host "⚠️  Pool size not specified, using safe defaults" -ForegroundColor Yellow
        $PoolMax = 20
    }
    if ($PoolMin -eq 0) {
        $PoolMin = 5
    }
}

Write-Host ""
Write-Host "Target pool settings:" -ForegroundColor Cyan
Write-Host "  PG_POOL_MIN: $PoolMin" -ForegroundColor White
Write-Host "  PG_POOL_MAX: $PoolMax" -ForegroundColor White
Write-Host ""

# Step 4: Confirm before applying
$confirm = Read-Host "Apply these settings? (y/n)"
if ($confirm -ne "y" -and $confirm -ne "Y") {
    Write-Host "❌ Cancelled" -ForegroundColor Red
    exit 0
}

Write-Host ""

# Step 5: Set pool secrets
Write-Host "[STEP 4] Setting pool size secrets..." -ForegroundColor Yellow

$secretsCmd = "fly secrets set"
$secretsCmd += " PG_POOL_MIN=$PoolMin"
$secretsCmd += " PG_POOL_MAX=$PoolMax"
$secretsCmd += " --app $AppName"

Write-Host "Running: $secretsCmd" -ForegroundColor Gray
Invoke-Expression $secretsCmd

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Pool size secrets set successfully" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to set pool size secrets" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 6: Restart app
Write-Host "[STEP 5] Restarting app to apply changes..." -ForegroundColor Yellow

$restartConfirm = Read-Host "Restart app now? (y/n)"
if ($restartConfirm -eq "y" -or $restartConfirm -eq "Y") {
    Write-Host "Restarting app: $AppName" -ForegroundColor Gray
    fly apps restart --app $AppName
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ App restarted successfully" -ForegroundColor Green
        Write-Host ""
        Write-Host "⏳ Waiting 10 seconds for app to start..." -ForegroundColor Yellow
        Start-Sleep -Seconds 10
    } else {
        Write-Host "⚠️  App restart returned non-zero exit code" -ForegroundColor Yellow
    }
} else {
    Write-Host "⚠️  Skipping restart. Remember to restart manually:" -ForegroundColor Yellow
    Write-Host "   fly apps restart --app $AppName" -ForegroundColor Gray
}

Write-Host ""

# Step 7: Verification
Write-Host "[STEP 6] Verification..." -ForegroundColor Yellow
Write-Host ""
Write-Host "To verify the new pool size, run:" -ForegroundColor Cyan
Write-Host "  fly ssh console --app $AppName -C `"node scripts/check-max-connections.js`"" -ForegroundColor White
Write-Host ""
Write-Host "Or check the app logs for:" -ForegroundColor Cyan
Write-Host "  fly logs --app $AppName | grep 'PostgreSQL connection pool configuration'" -ForegroundColor White
Write-Host ""

Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  ✅ Pool size increase complete!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
