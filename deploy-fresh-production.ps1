# Complete Fresh Deployment Script for Fly.io with PostgreSQL
# Optimized for multiple concurrent users (production-ready)
# This script creates everything from scratch

param(
    [string]$AppName = "",  # Auto-detect from fly.toml if not provided
    [string]$DbName = "colabora-db",
    [string]$Region = "fra",
    [string]$VmSize = "performance-1x",  # Changed default to performance-1x for production
    [int]$DbVolumeSize = 10,
    [switch]$SkipDbCreation = $false,
    [switch]$SkipDeployment = $false,
    [string]$RedisUrl = "",  # Optional Redis URL for multi-instance deployments
    [switch]$SkipRedis = $false  # Skip Redis setup (for single-instance deployments)
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Fresh Production Deployment - Fly.io" -ForegroundColor Cyan
Write-Host "  Optimized for Multiple Users (Production)" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Auto-detect app name from fly.toml if not provided
if ([string]::IsNullOrEmpty($AppName)) {
    $flyTomlPath = "fly.toml"
    if (Test-Path $flyTomlPath) {
        $flyTomlContent = Get-Content $flyTomlPath -Raw
        # Match app name with either single or double quotes
        if ($flyTomlContent -match "app\s*=\s*['`"]([^'`"]+)['`"]") {
            $AppName = $matches[1]
            Write-Host "📋 Auto-detected app name from fly.toml: $AppName" -ForegroundColor Cyan
        }
    }
    
    if ([string]::IsNullOrEmpty($AppName)) {
        $AppName = "colabora-app"
        Write-Host "⚠️  App name not provided and not found in fly.toml, using default: $AppName" -ForegroundColor Yellow
    }
}

# Determine pool settings based on database VM size
$poolConfig = @{
    "shared-cpu-1x" = @{ Min = 2; Max = 4; Note = "Very limited - upgrade recommended" }
    "shared-cpu-2x" = @{ Min = 3; Max = 8; Note = "OK for small apps" }
    "shared-cpu-4x" = @{ Min = 5; Max = 20; Note = "Good for medium apps" }
    "performance-1x" = @{ Min = 10; Max = 80; Note = "Excellent for production" }
    "performance-2x" = @{ Min = 10; Max = 160; Note = "Great for high load" }
}

if ($poolConfig.ContainsKey($VmSize)) {
    $poolSettings = $poolConfig[$VmSize]
    Write-Host "📊 Database VM: $VmSize → Pool: MIN=$($poolSettings.Min), MAX=$($poolSettings.Max)" -ForegroundColor Cyan
    Write-Host "   $($poolSettings.Note)" -ForegroundColor Gray
} else {
    Write-Host "⚠️  Unknown VM size: $VmSize, using conservative defaults" -ForegroundColor Yellow
    $poolSettings = @{ Min = 5; Max = 20 }
}

Write-Host ""

# Check Fly CLI
try {
    $null = Get-Command fly -ErrorAction Stop
    Write-Host "✅ Fly CLI found" -ForegroundColor Green
} catch {
    Write-Host "❌ Fly CLI not found!" -ForegroundColor Red
    Write-Host "Install from: https://fly.io/docs/flyctl/installing/" -ForegroundColor Yellow
    exit 1
}

# Check authentication
Write-Host ""
Write-Host "🔐 Checking authentication..." -ForegroundColor Yellow
try {
    $whoami = fly auth whoami 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "⚠️  Not logged in. Please login:" -ForegroundColor Yellow
        fly auth login
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ Authentication failed" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "✅ Authenticated as: $whoami" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️  Not logged in. Please login:" -ForegroundColor Yellow
    fly auth login
}

Write-Host ""

# Step 1: Create Fly.io app (if it doesn't exist)
Write-Host "`[STEP 1`] Creating Fly.io app..." -ForegroundColor Yellow
try {
    fly status --app $AppName 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "⚠️  App '$AppName' already exists" -ForegroundColor Yellow
        $useExisting = Read-Host "Use existing app? (y/n)"
        if ($useExisting -ne "y" -and $useExisting -ne "Y") {
            Write-Host "❌ Please delete the existing app first or choose a different name" -ForegroundColor Red
            exit 1
        }
        Write-Host "✅ Using existing app: $AppName" -ForegroundColor Green
    } else {
        Write-Host "Creating new app: $AppName" -ForegroundColor Gray
        Write-Host "  Region: $Region" -ForegroundColor Gray
        
        # Create app without deploying
        fly apps create $AppName --org personal 2>&1 | Out-Null
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ App created: $AppName" -ForegroundColor Green
        } else {
            Write-Host "⚠️  App creation returned non-zero exit code, but continuing..." -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "❌ Failed to create/check app: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 2: Create PostgreSQL database
if (!$SkipDbCreation) {
    Write-Host "`[STEP 2`] Setting up PostgreSQL database..." -ForegroundColor Yellow
    
    # Check if database exists
    $dbExists = $false
    try {
        $existingDbs = fly postgres list 2>&1
        if ($LASTEXITCODE -eq 0) {
            if ($existingDbs -match $DbName) {
                $dbExists = $true
            }
        }
    } catch {
        # Continue
    }
    
    if ($dbExists) {
        Write-Host "⚠️  Database '$DbName' already exists" -ForegroundColor Yellow
        $useExisting = Read-Host "Use existing database? (y/n)"
        if ($useExisting -ne "y" -and $useExisting -ne "Y") {
            Write-Host "❌ Please delete the existing database first or choose a different name" -ForegroundColor Red
            exit 1
        }
        Write-Host "✅ Using existing database: $DbName" -ForegroundColor Green
    } else {
        Write-Host "Creating PostgreSQL database..." -ForegroundColor Gray
        Write-Host "  Name: $DbName" -ForegroundColor Gray
        Write-Host "  Region: $Region" -ForegroundColor Gray
        Write-Host "  VM Size: $VmSize" -ForegroundColor Gray
        Write-Host "  Volume Size: ${DbVolumeSize}GB" -ForegroundColor Gray
        Write-Host "  Cluster Size: 1 (single node, can scale later)" -ForegroundColor Gray
        
        fly postgres create --name $DbName --region $Region --vm-size $VmSize --volume-size $DbVolumeSize --initial-cluster-size 1
        
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ Failed to create database" -ForegroundColor Red
            Write-Host "Error output may be shown above" -ForegroundColor Yellow
            exit 1
        }
        Write-Host "✅ Database created: $DbName" -ForegroundColor Green
    }
    
    # Wait a moment for database to be ready
    Write-Host "Waiting for database to be ready..." -ForegroundColor Gray
    Start-Sleep -Seconds 5
    
    # Attach database to app
    Write-Host "Attaching database to app..." -ForegroundColor Gray
    
    # Remove existing DATABASE_URL if it exists
    $secrets = fly secrets list --app $AppName --json 2>&1 | ConvertFrom-Json
    if ($secrets) {
        foreach ($secret in $secrets) {
            if ($secret.Name -eq "DATABASE_URL") {
                Write-Host "Removing existing DATABASE_URL secret..." -ForegroundColor Gray
                fly secrets unset DATABASE_URL --app $AppName 2>&1 | Out-Null
                Start-Sleep -Seconds 2
                break
            }
        }
    }
    
    fly postgres attach --app $AppName $DbName --yes
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to attach database" -ForegroundColor Red
        Write-Host "You can attach manually with: fly postgres attach --app $AppName $DbName" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "✅ Database attached to app" -ForegroundColor Green
    
    # Verify DATABASE_URL is set
    Write-Host "Verifying DATABASE_URL..." -ForegroundColor Gray
    Start-Sleep -Seconds 3
    $dbUrl = fly secrets list --app $AppName 2>&1 | Select-String "DATABASE_URL"
    if ($dbUrl) {
        Write-Host "✅ DATABASE_URL is set" -ForegroundColor Green
    } else {
        Write-Host "⚠️  DATABASE_URL not found, but continuing..." -ForegroundColor Yellow
    }
} else {
    Write-Host "`[STEP 2`] Skipping database creation (using existing)" -ForegroundColor Yellow
}

Write-Host ""

# Step 2.5: Optional Redis Setup (for multi-instance deployments)
if (!$SkipRedis) {
    Write-Host "`[STEP 2.5`] Setting up Redis (optional)..." -ForegroundColor Yellow
    Write-Host "Redis is required for multi-instance deployments (2+ instances)" -ForegroundColor Gray
    Write-Host "For single-instance deployments, Redis is optional and can be skipped" -ForegroundColor Gray
    Write-Host ""
    
    # Check if REDIS_URL already exists
    $secrets = fly secrets list --app $AppName --json 2>&1 | ConvertFrom-Json
    $redisExists = $false
    if ($secrets) {
        foreach ($secret in $secrets) {
            if ($secret.Name -eq "REDIS_URL") {
                $redisExists = $true
                break
            }
        }
    }
    
    if ($redisExists) {
        Write-Host "✅ REDIS_URL already set (keeping existing)" -ForegroundColor Green
    } else {
        if (![string]::IsNullOrEmpty($RedisUrl)) {
            # Redis URL provided as parameter
            Write-Host "Setting REDIS_URL from parameter..." -ForegroundColor Gray
            fly secrets set "REDIS_URL=$RedisUrl" --app $AppName
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ REDIS_URL set" -ForegroundColor Green
            } else {
                Write-Host "⚠️  Failed to set REDIS_URL, but continuing..." -ForegroundColor Yellow
            }
        } else {
            # Prompt user
            Write-Host "Do you want to configure Redis for multi-instance support?" -ForegroundColor Cyan
            Write-Host "  - Required if you plan to scale to 2+ instances" -ForegroundColor Gray
            Write-Host "  - Optional for single-instance deployments (saves money)" -ForegroundColor Gray
            Write-Host "  - You can add Redis later if needed" -ForegroundColor Gray
            Write-Host ""
            $setupRedis = Read-Host "Configure Redis now? (y/n, default: n)"
            
            if ($setupRedis -eq "y" -or $setupRedis -eq "Y") {
                Write-Host ""
                Write-Host "Enter your Redis URL:" -ForegroundColor Cyan
                Write-Host "  Format: redis://host:port or redis://:password@host:port" -ForegroundColor Gray
                Write-Host "  Example: redis://default:password@your-redis.upstash.io:6379" -ForegroundColor Gray
                Write-Host ""
                $redisUrlInput = Read-Host "Redis URL (or press Enter to skip)"
                
                if (![string]::IsNullOrEmpty($redisUrlInput)) {
                    fly secrets set "REDIS_URL=$redisUrlInput" --app $AppName
                    
                    if ($LASTEXITCODE -eq 0) {
                        Write-Host "✅ REDIS_URL set" -ForegroundColor Green
                        Write-Host "  Note: Redis connection will be verified on app startup" -ForegroundColor Gray
                    } else {
                        Write-Host "⚠️  Failed to set REDIS_URL, but continuing..." -ForegroundColor Yellow
                    }
                } else {
                    Write-Host "⏭️  Skipping Redis setup (can be added later)" -ForegroundColor Yellow
                }
            } else {
                Write-Host "⏭️  Skipping Redis setup (can be added later)" -ForegroundColor Yellow
            }
        }
    }
} else {
    Write-Host "`[STEP 2.5`] Skipping Redis setup (--SkipRedis flag)" -ForegroundColor Yellow
}

# Check Redis status for summary
$redisConfigured = $false
if (!$SkipRedis) {
    $secrets = fly secrets list --app $AppName --json 2>&1 | ConvertFrom-Json
    if ($secrets) {
        foreach ($secret in $secrets) {
            if ($secret.Name -eq "REDIS_URL") {
                $redisConfigured = $true
                break
            }
        }
    }
}

Write-Host ""

# Step 3: Generate and set secrets
Write-Host "`[STEP 3`] Setting up secrets..." -ForegroundColor Yellow

# Generate JWT_SECRET
Write-Host "Generating JWT_SECRET..." -ForegroundColor Gray
$jwtSecret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object {[char]$_})

# Check existing secrets
$secrets = fly secrets list --app $AppName --json 2>&1 | ConvertFrom-Json
$existingSecrets = @{}
if ($secrets) {
    foreach ($secret in $secrets) {
        $existingSecrets[$secret.Name] = $true
    }
}

# Set JWT_SECRET if not exists
if (!$existingSecrets.ContainsKey("JWT_SECRET")) {
    Write-Host "Setting JWT_SECRET..." -ForegroundColor Gray
    fly secrets set "JWT_SECRET=$jwtSecret" --app $AppName
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ JWT_SECRET set" -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to set JWT_SECRET" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "✅ JWT_SECRET already set (keeping existing)" -ForegroundColor Green
}

# Set production environment variables optimized for multiple users
Write-Host "Setting production environment variables..." -ForegroundColor Gray
Write-Host "  Database VM: $VmSize" -ForegroundColor Gray
Write-Host "  Pool: MIN=$($poolSettings.Min), MAX=$($poolSettings.Max)" -ForegroundColor Gray

# PostgreSQL pool settings based on database VM size
# Pool max should be < 80% of database max_connections
$envVars = @{
    "NODE_ENV" = "production"
    "PORT" = "3000"
    "JWT_EXPIRES_IN" = "24h"
    "LOG_LEVEL" = "info"
    # Rate limiting: 1000 requests per 15 minutes (allows ~1.1 req/sec per user for 50 users)
    "RATE_LIMIT_WINDOW_MS" = "900000"
    "RATE_LIMIT_MAX_REQUESTS" = "1000"
    # PostgreSQL pool settings (dynamically set based on VM size)
    "PG_POOL_MIN" = $poolSettings.Min.ToString()
    "PG_POOL_MAX" = $poolSettings.Max.ToString()
    "PG_POOL_ACQUIRE_TIMEOUT" = "30000"
    "PG_POOL_MAX_WAITING" = "50"
    # PostgreSQL timeout settings
    "PG_STATEMENT_TIMEOUT" = "300000"
    "PG_IDLE_TRANSACTION_TIMEOUT" = "60000"
    # PostgreSQL keepalive settings
    "PG_KEEPALIVE_ENABLED" = "true"
    "PG_KEEPALIVE_INITIAL_DELAY" = "30000"
    "PG_SOCKET_TIMEOUT" = "300000"
    # CORS Configuration - auto-detected from FLY_APP_NAME, but set explicitly for clarity
    "FRONTEND_URL" = "https://$AppName.fly.dev"
    "ALLOWED_ORIGINS" = "https://$AppName.fly.dev"
}

# Build secrets command
$secretsCmd = "fly secrets set"
foreach ($key in $envVars.Keys) {
    $value = $envVars[$key]
    $secretsCmd += " `"$key=$value`""
}
$secretsCmd += " --app $AppName"

Write-Host "Setting environment variables..." -ForegroundColor Gray
Invoke-Expression $secretsCmd

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Production environment variables set" -ForegroundColor Green
} else {
    Write-Host "⚠️  Some environment variables may not have been set" -ForegroundColor Yellow
}

Write-Host ""

# Step 4: Update fly.toml for production
Write-Host "`[STEP 4`] Updating fly.toml configuration..." -ForegroundColor Yellow

$flyTomlPath = "fly.toml"
if (Test-Path $flyTomlPath) {
    $flyTomlContent = Get-Content $flyTomlPath -Raw
    
    # Update app name if different (supports both single and double quotes)
    $appPattern = "app\s*=\s*['`"][^'`"]+['`"]"
    $appCheckPattern = "app\s*=\s*['`"]$([regex]::Escape($AppName))['`"]"
    if ($flyTomlContent -notmatch $appCheckPattern) {
        $flyTomlContent = $flyTomlContent -replace $appPattern, "app = '$AppName'"
        Write-Host "  Updated app name to: $AppName" -ForegroundColor Gray
    }
    
    # Update region if different
    $regionPattern = "primary_region\s*=\s*['`"][^'`"]+['`"]"
    $regionCheckPattern = "primary_region\s*=\s*['`"]$([regex]::Escape($Region))['`"]"
    if ($flyTomlContent -notmatch $regionCheckPattern) {
        $flyTomlContent = $flyTomlContent -replace $regionPattern, "primary_region = '$Region'"
        Write-Host "  Updated region to: $Region" -ForegroundColor Gray
    }
    
    # Ensure min_machines_running is 1 for production (not 0)
    if ($flyTomlContent -notmatch "min_machines_running\s*=\s*1") {
        if ($flyTomlContent -match "min_machines_running\s*=\s*\d+") {
            $flyTomlContent = $flyTomlContent -replace "min_machines_running\s*=\s*\d+", "min_machines_running = 1"
        } else {
            # Add it if missing (before processes line)
            $flyTomlContent = $flyTomlContent -replace "(\s+processes\s*=)", "  min_machines_running = 1`n`$1"
        }
        Write-Host "  Set min_machines_running = 1 for production" -ForegroundColor Gray
    }
    
    # Ensure memory is at least 2GB (recommended for 50+ users)
    $memoryPattern = "memory\s*=\s*['`"]([^'`"]+)['`"]"
    if ($flyTomlContent -match $memoryPattern) {
        $currentMemory = $matches[1]
        if ($currentMemory -notmatch "2gb|4gb") {
            $flyTomlContent = $flyTomlContent -replace $memoryPattern, "memory = '2gb'"
            Write-Host "  Updated memory to: 2gb (recommended for 50+ users)" -ForegroundColor Gray
        }
    }
    
    Set-Content -Path $flyTomlPath -Value $flyTomlContent -NoNewline
    Write-Host "✅ fly.toml updated" -ForegroundColor Green
} else {
    Write-Host "⚠️  fly.toml not found, will be created on first deploy" -ForegroundColor Yellow
}

Write-Host ""

# Step 5: Deploy application
if (!$SkipDeployment) {
    Write-Host "`[STEP 5`] Deploying application..." -ForegroundColor Yellow
    Write-Host "This may take several minutes..." -ForegroundColor Gray
    
    fly deploy --app $AppName
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ Deployment successful!" -ForegroundColor Green
        Write-Host ""
        Write-Host "The application will:" -ForegroundColor Cyan
        Write-Host "  ✅ Create all database tables automatically" -ForegroundColor Green
        Write-Host "  ✅ Run migrations" -ForegroundColor Green
        Write-Host "  ✅ Initialize with correct schema" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "❌ Deployment failed" -ForegroundColor Red
        Write-Host "Check logs with: fly logs --app $AppName" -ForegroundColor Yellow
        exit 1
    }
} else {
    Write-Host "`[STEP 5`] Skipping deployment" -ForegroundColor Yellow
    Write-Host "Deploy manually with: fly deploy --app $AppName" -ForegroundColor Gray
}

Write-Host ""

# Step 6: Wait for app to be ready
if (!$SkipDeployment) {
    Write-Host "`[STEP 6`] Waiting for app to be ready..." -ForegroundColor Yellow
    Write-Host "Checking health endpoint..." -ForegroundColor Gray
    
    $maxAttempts = 30
    $attempt = 0
    $appUrl = "https://$AppName.fly.dev"
    $ready = $false
    
    while ($attempt -lt $maxAttempts -and !$ready) {
        $attempt++
        Write-Host "Attempt $attempt/$maxAttempts..." -ForegroundColor Gray
        
        try {
            $response = Invoke-WebRequest -Uri "$appUrl/api/health/ready" -Method GET -TimeoutSec 10 -UseBasicParsing -ErrorAction SilentlyContinue
            if ($response.StatusCode -eq 200) {
                $ready = $true
                Write-Host "✅ App is ready!" -ForegroundColor Green
            }
        } catch {
            # Continue waiting
        }
        
        if (!$ready) {
            Start-Sleep -Seconds 5
        }
    }
    
    if (!$ready) {
        Write-Host "⚠️  App may still be starting. Check logs: fly logs --app $AppName" -ForegroundColor Yellow
    }
}

Write-Host ""

# Step 7: Create admin user
Write-Host "`[STEP 7`] Creating admin user..." -ForegroundColor Yellow
Write-Host ""
Write-Host "To create the admin user, run:" -ForegroundColor Cyan
Write-Host ('  fly ssh console --app ' + $AppName) -ForegroundColor White
Write-Host "  node scripts/setup-admin.js" -ForegroundColor White
Write-Host ""
Write-Host "Or use the automated script:" -ForegroundColor Cyan
Write-Host ('  .\scripts\setup-admin-remote.ps1 -AppName ' + $AppName) -ForegroundColor White
Write-Host ""

# Summary
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "[SUCCESS] Fresh deployment complete!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Deployment Summary:" -ForegroundColor Cyan
Write-Host "  App Name: $AppName" -ForegroundColor White
Write-Host ('  App URL: https://' + $AppName + '.fly.dev') -ForegroundColor White
Write-Host "  Database: $DbName" -ForegroundColor White
Write-Host "  Database VM: $VmSize" -ForegroundColor White
Write-Host "  Connection Pool: MIN=$($poolSettings.Min), MAX=$($poolSettings.Max)" -ForegroundColor White
Write-Host "  Region: $Region" -ForegroundColor White
if ($redisConfigured) {
    Write-Host "  Redis: ✅ Configured (multi-instance support enabled)" -ForegroundColor Green
} else {
    Write-Host "  Redis: ⏭️  Not configured (single-instance mode)" -ForegroundColor Yellow
    Write-Host "    Add later with: fly secrets set REDIS_URL='...' --app $AppName" -ForegroundColor Gray
}
Write-Host ""
Write-Host "⚠️  Important Notes:" -ForegroundColor Yellow
Write-Host "  - Pool size ($($poolSettings.Max)) is set for $VmSize database" -ForegroundColor White
Write-Host "  - If you change database VM size, update PG_POOL_MAX accordingly" -ForegroundColor White
Write-Host "  - Pool max should be less than 80% of database max_connections" -ForegroundColor White
Write-Host ""
Write-Host "Scaling for More Users:" -ForegroundColor Cyan
Write-Host "  Horizontal scaling (2+ instances):" -ForegroundColor White
Write-Host ('    fly scale count 2 --app ' + $AppName) -ForegroundColor Gray
Write-Host "    ⚠️  Redis required: Set REDIS_URL for multi-instance deployments" -ForegroundColor Yellow
Write-Host "  Memory upgrade (if needed):" -ForegroundColor White
Write-Host "    Update fly.toml memory to '2gb' (already set), then redeploy" -ForegroundColor Gray
Write-Host "  Database upgrade (for 100+ users):" -ForegroundColor White
Write-Host ('    fly postgres scale --vm-size performance-2x --app ' + $DbName) -ForegroundColor Gray
Write-Host "    Then update PG_POOL_MAX to match (80% of DB max_connections)" -ForegroundColor Gray
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Create admin user (see commands above)" -ForegroundColor White
Write-Host ('  2. Verify deployment: fly logs --app ' + $AppName) -ForegroundColor White
Write-Host ('  3. Test the app: https://' + $AppName + '.fly.dev') -ForegroundColor White
Write-Host ""
Write-Host "Admin User Credentials (default):" -ForegroundColor Cyan
Write-Host "  Email: admin@colabora.local" -ForegroundColor White
Write-Host "  Password: AdminSecurePass123" -ForegroundColor White
Write-Host "  (Note: Password ends with exclamation mark)" -ForegroundColor Gray
Write-Host "  (WARNING) Change password immediately after first login" -ForegroundColor Yellow
Write-Host ""
Write-Host "Useful Commands:" -ForegroundColor Green
Write-Host ('  View logs: fly logs --app ' + $AppName) -ForegroundColor White
Write-Host ('  Check status: fly status --app ' + $AppName) -ForegroundColor White
Write-Host ('  SSH into app: fly ssh console --app ' + $AppName) -ForegroundColor White
Write-Host ('  View secrets: fly secrets list --app ' + $AppName) -ForegroundColor White
Write-Host ""
