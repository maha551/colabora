# Colabora - Complete Deployment Script for Fly.io
# PostgreSQL + Frankfurt Region
# This is the consolidated, optimal deployment script

param(
    [string]$AppName = "",
    [string]$Region = "fra",
    [string]$DbName = "colabora-db",
    [string]$VmSize = "shared-cpu-1x",
    [int]$DbVolumeSize = 10,
    [switch]$SkipDbSetup,
    [switch]$UseExistingDb,
    [switch]$SkipSecrets,
    [switch]$SkipDeploy
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "🚀 Colabora Deployment to Fly.io" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host "   Database: PostgreSQL" -ForegroundColor White
Write-Host "   Region: $Region (Frankfurt)" -ForegroundColor White
Write-Host ""

# Step 1: Get app name from fly.toml if not provided
if ($AppName -eq "") {
    if (Test-Path "fly.toml") {
        $flyTomlContent = Get-Content "fly.toml" -Raw
        # Extract app name - match single or double quotes separately
        if ($flyTomlContent -match "app\s*=\s*('([^']+)'|`"([^`"]+)`")") {
            $AppName = if ($matches[2]) { $matches[2] } else { $matches[3] }
            Write-Host "📋 Using app name from fly.toml: $AppName" -ForegroundColor Green
        }
    }
    
    if ($AppName -eq "") {
        Write-Host "❌ App name not found. Please provide:" -ForegroundColor Red
        $AppName = Read-Host "Enter app name"
        if ([string]::IsNullOrEmpty($AppName)) {
            Write-Host "App name is required" -ForegroundColor Red
            exit 1
        }
    }
}

# Step 2: Check Fly CLI
Write-Host ""
Write-Host "[STEP 1] Checking Fly CLI..." -ForegroundColor Yellow
$flyPath = "flyctl"
if (!(Get-Command flyctl -ErrorAction SilentlyContinue)) {
    $flyDir = Join-Path $env:USERPROFILE ".fly\bin"
    $flyPath = Join-Path $flyDir "flyctl.exe"
    
    if (!(Test-Path $flyPath)) {
        Write-Host "❌ Fly CLI not found!" -ForegroundColor Red
        Write-Host "Install from: https://fly.io/docs/flyctl/installing/" -ForegroundColor Yellow
        Write-Host "Or run: powershell -Command `"iwr https://fly.io/install.ps1 -useb | iex`"" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "   Using Fly CLI at: $flyPath" -ForegroundColor Gray
} else {
    Write-Host "✅ Fly CLI found" -ForegroundColor Green
}

# Step 3: Check authentication
Write-Host ""
Write-Host "[STEP 2] Checking authentication..." -ForegroundColor Yellow
try {
    $authCheck = & $flyPath auth whoami 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "🔐 Not logged in. Please login:" -ForegroundColor Yellow
        & $flyPath auth login
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ Login failed" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "✅ Authenticated as: $authCheck" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Authentication check failed: $_" -ForegroundColor Red
    exit 1
}

# Step 4: Check if app exists, create if needed
Write-Host ""
Write-Host "[STEP 3] Checking app status..." -ForegroundColor Yellow
$appExists = $false
try {
    $appStatus = & $flyPath status --app $AppName 2>&1
    if ($LASTEXITCODE -eq 0) {
        $appExists = $true
        Write-Host "✅ App exists: $AppName" -ForegroundColor Green
    }
} catch {
    # App doesn't exist, that's okay
}

if (!$appExists) {
    Write-Host "📦 App not found. Creating new app..." -ForegroundColor Yellow
    Write-Host "   App: $AppName" -ForegroundColor Gray
    Write-Host "   Region: $Region" -ForegroundColor Gray
    
    try {
        & $flyPath launch --name $AppName --region $Region --no-deploy --copy-config=false
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ Failed to create app" -ForegroundColor Red
            exit 1
        }
        Write-Host "✅ App created successfully" -ForegroundColor Green
        
        # Update fly.toml if it exists
        if (Test-Path "fly.toml") {
            Write-Host "   Updating fly.toml with app name and URLs..." -ForegroundColor Gray
            $flyTomlContent = Get-Content "fly.toml" -Raw
            $script:appUrl = "https://$AppName.fly.dev"
            
            # Update app name - match single or double quotes separately
            $flyTomlContent = $flyTomlContent -replace "(app\s*=\s*)('.*?'|`".*?`")", "`$1`"$AppName`""
            
            # Update region - match single or double quotes separately
            $flyTomlContent = $flyTomlContent -replace "(primary_region\s*=\s*)('.*?'|`".*?`")", "`$1'$Region'"
            
            # Update ALLOWED_ORIGINS and FRONTEND_URL - match single or double quotes separately
            $flyTomlContent = $flyTomlContent -replace "(ALLOWED_ORIGINS\s*=\s*)('.*?'|`".*?`")", "`$1'$($script:appUrl)'"
            $flyTomlContent = $flyTomlContent -replace "(FRONTEND_URL\s*=\s*)('.*?'|`".*?`")", "`$1'$($script:appUrl)'"
            
            Set-Content "fly.toml" -Value $flyTomlContent -NoNewline
            Write-Host "✅ fly.toml updated" -ForegroundColor Green
        }
    } catch {
        Write-Host "❌ Failed to create app: $_" -ForegroundColor Red
        exit 1
    }
}

# Step 5: Setup PostgreSQL
if (!$SkipDbSetup) {
    Write-Host ""
    Write-Host "[STEP 4] Setting up PostgreSQL database..." -ForegroundColor Yellow
    
    if ($UseExistingDb) {
        Write-Host "   Using existing database: $DbName" -ForegroundColor Gray
        & $flyPath postgres attach --app $AppName $DbName --yes
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ Failed to attach existing database" -ForegroundColor Red
            exit 1
        }
        Write-Host "✅ Database attached" -ForegroundColor Green
    } else {
        # Check if database exists
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
            # Continue - we'll try to create
        }
        
        if ($dbExists) {
            Write-Host "   Database '$DbName' already exists" -ForegroundColor Yellow
            Write-Host "   Attaching to app..." -ForegroundColor Gray
            & $flyPath postgres attach --app $AppName $DbName --yes
            if ($LASTEXITCODE -ne 0) {
                Write-Host "❌ Failed to attach database" -ForegroundColor Red
                exit 1
            }
            Write-Host "✅ Database attached" -ForegroundColor Green
        } else {
            Write-Host "   Creating PostgreSQL database..." -ForegroundColor Gray
            Write-Host "     Name: $DbName" -ForegroundColor Gray
            Write-Host "     Region: $Region" -ForegroundColor Gray
            Write-Host "     VM Size: $VmSize" -ForegroundColor Gray
            Write-Host "     Volume Size: ${DbVolumeSize}GB" -ForegroundColor Gray
            
            $createArgs = @(
                "postgres",
                "create",
                "--name", $DbName,
                "--region", $Region,
                "--vm-size", $VmSize,
                "--volume-size", $DbVolumeSize,
                "--initial-cluster-size", "1",
                "--detach"
            )
            
            try {
                $ErrorActionPreference = "Continue"
                $createOutput = & $flyPath $createArgs 2>&1
                $createExitCode = $LASTEXITCODE
                
                if ($createExitCode -ne 0) {
                    $outputString = ($createOutput | ForEach-Object { $_.ToString() }) -join "`n"
                    if ($outputString -match "already exists" -or $outputString -match "already in use") {
                        Write-Host "   Database already exists, attaching..." -ForegroundColor Yellow
                        & $flyPath postgres attach --app $AppName $DbName --yes
                        if ($LASTEXITCODE -ne 0) {
                            Write-Host "❌ Failed to attach database" -ForegroundColor Red
                            exit 1
                        }
                    } else {
                        Write-Host "❌ Failed to create database" -ForegroundColor Red
                        Write-Host "Error: $outputString" -ForegroundColor Gray
                        exit 1
                    }
                } else {
                    Write-Host "✅ Database created" -ForegroundColor Green
                }
            } catch {
                Write-Host "❌ Error creating database: $_" -ForegroundColor Red
                exit 1
            } finally {
                $ErrorActionPreference = "Stop"
            }
            
            # Attach database to app
            Write-Host "   Attaching database to app..." -ForegroundColor Gray
            & $flyPath postgres attach --app $AppName $DbName --yes
            if ($LASTEXITCODE -ne 0) {
                Write-Host "❌ Failed to attach database" -ForegroundColor Red
                exit 1
            }
            Write-Host "✅ Database attached" -ForegroundColor Green
        }
    }
    
    # Verify DATABASE_URL is set
    Write-Host "   Verifying DATABASE_URL..." -ForegroundColor Gray
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
        Write-Host "✅ DATABASE_URL is set" -ForegroundColor Green
    } else {
        Write-Host "⚠️  WARNING: DATABASE_URL not found" -ForegroundColor Yellow
        Write-Host "   This may be set automatically after deployment" -ForegroundColor Gray
    }
} else {
    Write-Host ""
    Write-Host "[STEP 4] Skipping database setup" -ForegroundColor Yellow
}

# Step 6: Setup JWT_SECRET
if (!$SkipSecrets) {
    Write-Host ""
    Write-Host "[STEP 5] Setting up secrets..." -ForegroundColor Yellow
    
    $secrets = & $flyPath secrets list --app $AppName --json 2>&1 | ConvertFrom-Json
    $jwtSecretSet = $false
    
    if ($secrets) {
        foreach ($secret in $secrets) {
            if ($secret.Name -eq "JWT_SECRET") {
                $jwtSecretSet = $true
                break
            }
        }
    }
    
    if (!$jwtSecretSet) {
        Write-Host "   Generating JWT_SECRET..." -ForegroundColor Gray
        try {
            $jwtSecret = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
            $jwtSecret = $jwtSecret.Trim()
            
            if ([string]::IsNullOrEmpty($jwtSecret) -or $jwtSecret.Length -lt 32) {
                Write-Host "❌ Failed to generate JWT_SECRET" -ForegroundColor Red
                exit 1
            }
            
            & $flyPath secrets set "JWT_SECRET=$jwtSecret" --app $AppName
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ JWT_SECRET set" -ForegroundColor Green
            } else {
                Write-Host "❌ Failed to set JWT_SECRET" -ForegroundColor Red
                exit 1
            }
        } catch {
            Write-Host "❌ Error generating JWT_SECRET: $_" -ForegroundColor Red
            Write-Host "   Please set manually: fly secrets set JWT_SECRET=<secret> --app $AppName" -ForegroundColor Yellow
            exit 1
        }
    } else {
        Write-Host "✅ JWT_SECRET already set" -ForegroundColor Green
    }
    
    Write-Host ""
    Write-Host "   Optional secrets (not required):" -ForegroundColor Gray
    Write-Host "     RESEND_API_KEY - for email functionality" -ForegroundColor Gray
    Write-Host "     RESEND_FROM_EMAIL - for custom email domain" -ForegroundColor Gray
} else {
    Write-Host ""
    Write-Host "[STEP 5] Skipping secrets setup" -ForegroundColor Yellow
}

# Step 7: Deploy
if (!$SkipDeploy) {
    Write-Host ""
    Write-Host "[STEP 6] Deploying application..." -ForegroundColor Yellow
    Write-Host "   This may take a few minutes..." -ForegroundColor Gray
    
    & $flyPath deploy --app $AppName
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Deployment failed" -ForegroundColor Red
        Write-Host "   View logs: fly logs --app $AppName" -ForegroundColor Yellow
        exit 1
    }
    
    Write-Host "✅ Deployment successful!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "[STEP 6] Skipping deployment" -ForegroundColor Yellow
    Write-Host "   Run manually: fly deploy --app $AppName" -ForegroundColor Gray
}

# Step 8: Summary
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "✅ Setup Complete!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Get app URL
$appUrl = $null
$hostname = $null
$appStatus = & $flyPath status --app $AppName --json 2>&1 | ConvertFrom-Json
if ($appStatus -and $appStatus.Hostname) {
    $hostname = $appStatus.Hostname
    $appUrl = "https://$hostname"
    Write-Host "🌐 App URL: $appUrl" -ForegroundColor Cyan
    Write-Host ""
}

Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Check app status:" -ForegroundColor White
Write-Host "   fly status --app $AppName" -ForegroundColor Gray
Write-Host ""
Write-Host "2. View logs to verify PostgreSQL:" -ForegroundColor White
Write-Host "   fly logs --app $AppName | Select-String -Pattern 'postgresql'" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Check health endpoint:" -ForegroundColor White
if ($hostname) {
    Write-Host "   curl https://$hostname/api/health/ready" -ForegroundColor Gray
}
Write-Host ""
Write-Host "4. Create admin user:" -ForegroundColor White
Write-Host "   fly ssh console --app $AppName" -ForegroundColor Gray
Write-Host "   npm run setup-admin" -ForegroundColor Gray
Write-Host ""
Write-Host "5. Clear rate limits (if needed after deployment):" -ForegroundColor White
Write-Host "   fly ssh console --app $AppName" -ForegroundColor Gray
Write-Host "   node scripts/clear-rate-limits.js" -ForegroundColor Gray
Write-Host ""
Write-Host "6. Access your app:" -ForegroundColor White
if ($hostname -and $appUrl) {
    Write-Host "   $($appUrl)" -ForegroundColor Gray
}
Write-Host ""

