# PostgreSQL Setup Script for Colabora on Fly.io
# This script helps you set up PostgreSQL database and configure your app

param(
    [string]$AppName = "",
    [string]$DbName = "colabora-db",
    [string]$Region = "fra",
    [string]$VmSize = "shared-cpu-1x",
    [int]$VolumeSize = 10,
    [switch]$SkipDbCreation,
    [switch]$UseExternal,
    [string]$ExternalDbUrl = ""
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "PostgreSQL Setup for Colabora" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan
Write-Host ""

# Get app name from fly.toml if not provided
if ($AppName -eq "") {
    if (Test-Path "fly.toml") {
        $flyTomlContent = Get-Content "fly.toml" -Raw
        if ($flyTomlContent -match 'app\s*=\s*["'']([^"'']+)["'']') {
            $AppName = $matches[1]
            Write-Host "Using app name from fly.toml: $AppName" -ForegroundColor Cyan
        } else {
            Write-Host "Could not determine app name from fly.toml" -ForegroundColor Red
            Write-Host "Please provide app name: .\setup-postgresql.ps1 -AppName your-app-name" -ForegroundColor Yellow
            exit 1
        }
    } else {
        Write-Host "fly.toml not found and no app name provided" -ForegroundColor Red
        Write-Host "Usage: .\setup-postgresql.ps1 -AppName your-app-name" -ForegroundColor Yellow
        exit 1
    }
}

# Check Fly CLI
$flyPath = "flyctl"
if (!(Get-Command flyctl -ErrorAction SilentlyContinue)) {
    $flyDir = Join-Path $env:USERPROFILE ".fly\bin"
    $flyPath = Join-Path $flyDir "flyctl.exe"
    
    if (!(Test-Path $flyPath)) {
        Write-Host "Fly CLI not found!" -ForegroundColor Red
        Write-Host "Install from: https://fly.io/docs/flyctl/installing/" -ForegroundColor Yellow
        exit 1
    }
}

# Check authentication
Write-Host "Checking authentication..." -ForegroundColor Yellow
try {
    $authCheck = & $flyPath auth whoami 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Not logged in. Please login:" -ForegroundColor Yellow
        & $flyPath auth login
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Login failed" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "Authenticated as: $authCheck" -ForegroundColor Green
    }
} catch {
    Write-Host "Authentication check failed: $_" -ForegroundColor Red
    exit 1
}

# Check if app exists
Write-Host ""
Write-Host "Checking if app exists..." -ForegroundColor Yellow
try {
    $appStatus = & $flyPath status --app $AppName 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "App '$AppName' not found!" -ForegroundColor Red
        Write-Host "Create it first with: fly launch --name $AppName" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "App found: $AppName" -ForegroundColor Green
} catch {
    Write-Host "Failed to check app status: $_" -ForegroundColor Red
    exit 1
}

# Handle external database
if ($UseExternal) {
    if ([string]::IsNullOrEmpty($ExternalDbUrl)) {
        Write-Host ""
        Write-Host "External database URL not provided!" -ForegroundColor Red
        Write-Host "Usage: .\setup-postgresql.ps1 -UseExternal -ExternalDbUrl 'postgresql://user:pass@host:port/db'" -ForegroundColor Yellow
        exit 1
    }
    
    Write-Host ""
    Write-Host "Setting external PostgreSQL connection..." -ForegroundColor Yellow
    & $flyPath secrets set "DATABASE_URL=$ExternalDbUrl" --app $AppName
    if ($LASTEXITCODE -eq 0) {
        Write-Host "DATABASE_URL set successfully" -ForegroundColor Green
    } else {
        Write-Host "Failed to set DATABASE_URL" -ForegroundColor Red
        exit 1
    }
    
    Write-Host ""
    Write-Host "✅ External PostgreSQL configured!" -ForegroundColor Green
    Write-Host "Next step: Deploy your app with: fly deploy --app $AppName" -ForegroundColor Cyan
    exit 0
}

# Create PostgreSQL database
if (!$SkipDbCreation) {
    Write-Host ""
    Write-Host "Creating PostgreSQL database..." -ForegroundColor Yellow
    Write-Host "  Name: $DbName" -ForegroundColor Gray
    Write-Host "  Region: $Region" -ForegroundColor Gray
    Write-Host "  VM Size: $VmSize" -ForegroundColor Gray
    Write-Host "  Volume Size: ${VolumeSize}GB" -ForegroundColor Gray
    Write-Host ""
    
    # Try to check if database already exists (but don't fail if check fails)
    $dbExists = $false
    try {
        $existingDbsOutput = & $flyPath postgres list 2>&1
        if ($LASTEXITCODE -eq 0) {
            $existingDbs = $existingDbsOutput -join "`n"
            if ($existingDbs -match $DbName) {
                $dbExists = $true
            }
        }
    } catch {
        # Silently continue - we'll try to create anyway
    }
    
    if ($dbExists) {
        Write-Host "Database '$DbName' already exists" -ForegroundColor Yellow
        $useExisting = Read-Host "Use existing database? (y/n)"
        if ($useExisting -ne "y" -and $useExisting -ne "Y") {
            Write-Host "Aborted" -ForegroundColor Yellow
            exit 0
        }
        Write-Host "Using existing database" -ForegroundColor Green
    } else {
        Write-Host "Creating new PostgreSQL database..." -ForegroundColor Yellow
        Write-Host "  Using single node (cluster size: 1) for fresh deployment" -ForegroundColor Gray
        Write-Host "  You can scale up later with: fly postgres scale --count 3 --app $DbName" -ForegroundColor Gray
        
        # Create with single node (non-interactive)
        # Note: fly postgres create may prompt for cluster size
        Write-Host "  Executing: fly postgres create --name $DbName --region $Region --vm-size $VmSize --volume-size $VolumeSize" -ForegroundColor Gray
        
        # Use argument array to avoid parsing issues
        $createArgs = @(
            "postgres",
            "create",
            "--name", $DbName,
            "--region", $Region,
            "--vm-size", $VmSize,
            "--volume-size", $VolumeSize,
            "--initial-cluster-size", "1",
            "--detach"
        )
        
        try {
            # Capture both stdout and stderr - PowerShell way
            $ErrorActionPreference = "Continue"
            $createOutput = & $flyPath $createArgs 2>&1
            $createExitCode = $LASTEXITCODE
            
            # Convert all output to string array, then join
            $outputLines = @()
            foreach ($line in $createOutput) {
                if ($line -is [System.Management.Automation.ErrorRecord]) {
                    $outputLines += $line.ToString()
                } else {
                    $outputLines += $line
                }
            }
            $outputString = $outputLines -join "`n"
        } catch {
            $outputString = $_.Exception.Message
            if ($_.Exception.InnerException) {
                $outputString += "`n" + $_.Exception.InnerException.Message
            }
            $createExitCode = 1
        }
        
        if ($createExitCode -ne 0) {
            # Check if it failed because database already exists
            if ($outputString -match "already exists" -or $outputString -match "Name has already been taken" -or $outputString -match "name.*taken" -or $outputString -match "already in use") {
                Write-Host "Database '$DbName' already exists, will use existing" -ForegroundColor Green
            } else {
                Write-Host "Failed to create database" -ForegroundColor Red
                if (![string]::IsNullOrWhiteSpace($outputString)) {
                    Write-Host "Error output:" -ForegroundColor Yellow
                    Write-Host $outputString -ForegroundColor Gray
                } else {
                    Write-Host "No error output captured. Exit code: $createExitCode" -ForegroundColor Yellow
                }
                Write-Host ""
                Write-Host "You can try creating the database manually:" -ForegroundColor Yellow
                Write-Host "  fly postgres create --name $DbName --region $Region --vm-size $VmSize --volume-size $VolumeSize" -ForegroundColor Gray
                Write-Host ""
                Write-Host "Or continue if the database already exists..." -ForegroundColor Yellow
                $continue = Read-Host "Continue anyway? (y/n)"
                if ($continue -ne "y" -and $continue -ne "Y") {
                    exit 1
                }
            }
        } else {
            Write-Host "Database created successfully" -ForegroundColor Green
            if (![string]::IsNullOrWhiteSpace($outputString)) {
                Write-Host $outputString -ForegroundColor Gray
            }
        }
    }
} else {
    Write-Host "Skipping database creation (using existing)" -ForegroundColor Yellow
}

# Attach database to app
Write-Host ""
Write-Host "Attaching database to app..." -ForegroundColor Yellow

# Check if DATABASE_URL already exists and remove it for fresh deployment
Write-Host "Checking for existing DATABASE_URL secret..." -ForegroundColor Gray
$secrets = & $flyPath secrets list --app $AppName --json 2>&1 | ConvertFrom-Json
$dbUrlExists = $false

if ($secrets) {
    foreach ($secret in $secrets) {
        if ($secret.Name -eq "DATABASE_URL") {
            $dbUrlExists = $true
            break
        }
    }
}

if ($dbUrlExists) {
    Write-Host "Found existing DATABASE_URL secret. Removing for fresh deployment..." -ForegroundColor Yellow
    & $flyPath secrets unset DATABASE_URL --app $AppName
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Removed existing DATABASE_URL" -ForegroundColor Green
        Start-Sleep -Seconds 1
    } else {
        Write-Host "Warning: Could not remove existing DATABASE_URL, will try to attach anyway..." -ForegroundColor Yellow
    }
}

# Now attach the database
Write-Host "Attaching database..." -ForegroundColor Gray

# Check if database user already exists - if so, use a new user name
$dbUser = $AppName.Replace("-", "_")  # Default user name based on app name
$attachArgs = @(
    "postgres",
    "attach",
    "--app", $AppName,
    $DbName,
    "--yes"
)

# Try attaching with default user first
$attachOutput = & $flyPath $attachArgs 2>&1
$attachExitCode = $LASTEXITCODE

if ($attachExitCode -ne 0) {
    $attachOutputString = $attachOutput -join "`n"
    
    # Check if it failed because database user already exists
    if ($attachOutputString -match "database user.*already exists" -or $attachOutputString -match "Please specify a new database user") {
        Write-Host "Database user already exists. Using a new user name..." -ForegroundColor Yellow
        $newDbUser = "${dbUser}_new"
        $attachArgs = @(
            "postgres",
            "attach",
            "--app", $AppName,
            $DbName,
            "--database-user", $newDbUser,
            "--yes"
        )
        
        $attachOutput = & $flyPath $attachArgs 2>&1
        $attachExitCode = $LASTEXITCODE
        
        if ($attachExitCode -ne 0) {
            $attachOutputString = $attachOutput -join "`n"
            Write-Host "Failed to attach with new user name" -ForegroundColor Red
            Write-Host "Error: $attachOutputString" -ForegroundColor Gray
            Write-Host ""
            Write-Host "You can try manually with a custom user:" -ForegroundColor Yellow
            Write-Host "  fly postgres attach --app $AppName $DbName --database-user <custom-name> --yes" -ForegroundColor Gray
            exit 1
        }
    }
    # Check if it failed because DATABASE_URL still exists
    elseif ($attachOutputString -match "already contains a secret named DATABASE_URL") {
        Write-Host "DATABASE_URL still exists. Attempting to force remove and reattach..." -ForegroundColor Yellow
        & $flyPath secrets unset DATABASE_URL --app $AppName --yes 2>&1 | Out-Null
        Start-Sleep -Seconds 2
        
        # Try attaching again
        $attachOutput = & $flyPath $attachArgs 2>&1
        $attachExitCode = $LASTEXITCODE
        
        if ($attachExitCode -ne 0) {
            Write-Host "Failed to attach database" -ForegroundColor Red
            Write-Host "Error: $($attachOutput -join '`n')" -ForegroundColor Gray
            Write-Host ""
            Write-Host "You can try manually:" -ForegroundColor Yellow
            Write-Host "  1. Remove the secret: fly secrets unset DATABASE_URL --app $AppName --yes" -ForegroundColor Gray
            Write-Host "  2. Attach database: fly postgres attach --app $AppName $DbName --yes" -ForegroundColor Gray
            exit 1
        }
    } else {
        Write-Host "Failed to attach database" -ForegroundColor Red
        Write-Host "Error: $attachOutputString" -ForegroundColor Gray
        Write-Host "You can attach manually with: fly postgres attach --app $AppName $DbName --yes" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "Database attached successfully" -ForegroundColor Green

# Verify DATABASE_URL is set
Write-Host ""
Write-Host "Verifying DATABASE_URL is set..." -ForegroundColor Yellow
$secrets = & $flyPath secrets list --app $AppName --json 2>&1 | ConvertFrom-Json
$dbUrlSet = $false

if ($secrets) {
    foreach ($secret in $secrets) {
        if ($secret.Name -eq "DATABASE_URL") {
            $dbUrlSet = $true
            break
        }
    }
}

if ($dbUrlSet) {
    Write-Host "DATABASE_URL is set" -ForegroundColor Green
} else {
    Write-Host "WARNING: DATABASE_URL not found in secrets" -ForegroundColor Red
    Write-Host "The attach command should have set it automatically." -ForegroundColor Yellow
    Write-Host "You may need to set it manually:" -ForegroundColor Yellow
    Write-Host "  fly postgres attach --app $AppName $DbName" -ForegroundColor White
}

# Summary
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Deploy your app:" -ForegroundColor White
Write-Host "   fly deploy --app $AppName" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Verify PostgreSQL connection in logs:" -ForegroundColor White
Write-Host "   fly logs --app $AppName | Select-String -Pattern 'postgresql'" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Check health endpoint:" -ForegroundColor White
Write-Host "   curl https://$AppName.fly.dev/api/health/ready" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Create admin user (after deployment):" -ForegroundColor White
Write-Host "   fly ssh console --app $AppName" -ForegroundColor Gray
Write-Host "   npm run setup-admin" -ForegroundColor Gray
Write-Host ""

