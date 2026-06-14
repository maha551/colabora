# Manual Volume Destruction Script
# Use this if volumes are still attached to machines

param(
    [string]$AppName = "",
    [string]$VolumeId = ""
)

$ErrorActionPreference = "Stop"

# Get app name from fly.toml if not provided
if ($AppName -eq "") {
    if (Test-Path "fly.toml") {
        $flyTomlContent = Get-Content "fly.toml" -Raw
        if ($flyTomlContent -match 'app\s*=\s*["'']([^"'']+)["'']') {
            $AppName = $matches[1]
        }
    }
    
    if ($AppName -eq "") {
        Write-Host "App name required" -ForegroundColor Red
        exit 1
    }
}

$flyPath = "flyctl"
if (!(Get-Command flyctl -ErrorAction SilentlyContinue)) {
    $flyDir = Join-Path $env:USERPROFILE ".fly\bin"
    $flyPath = Join-Path $flyDir "flyctl.exe"
}

Write-Host "Destroying volume: $VolumeId" -ForegroundColor Cyan
Write-Host ""

# List machines
Write-Host "Checking machines..." -ForegroundColor Yellow
$machines = & $flyPath machines list --app $AppName --json 2>&1 | ConvertFrom-Json

if ($machines) {
    foreach ($machine in $machines) {
        $machineId = $machine.id
        $machineState = $machine.state
        
        Write-Host "Machine: $machineId (State: $machineState)" -ForegroundColor Gray
        
        # Stop machine if running
        if ($machineState -ne "stopped") {
            Write-Host "  Stopping machine..." -ForegroundColor Yellow
            & $flyPath machines stop $machineId --app $AppName
        }
        
        # Remove machine to release volume
        Write-Host "  Removing machine to release volume..." -ForegroundColor Yellow
        & $flyPath machines remove $machineId --app $AppName --force
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✅ Machine removed" -ForegroundColor Green
        }
    }
}

# Wait a moment
Start-Sleep -Seconds 3

# Now destroy volume
if ($VolumeId) {
    Write-Host ""
    Write-Host "Destroying volume: $VolumeId" -ForegroundColor Yellow
    & $flyPath volumes destroy $VolumeId --yes
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Volume destroyed" -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to destroy volume" -ForegroundColor Red
    }
} else {
    Write-Host ""
    Write-Host "Listing volumes..." -ForegroundColor Yellow
    & $flyPath volumes list --app $AppName
}

