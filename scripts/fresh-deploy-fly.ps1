# Fresh Deployment Script for Fly.io (PowerShell)
# Drops and recreates database, then deploys app

Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Fresh Deployment - Fly.io" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Configuration
$APP_NAME = "colabora-app"
$DB_NAME = "colabora"  # Database name (not app name)

# Check Fly CLI
try {
    $null = Get-Command fly -ErrorAction Stop
} catch {
    Write-Host "❌ Fly CLI not found!" -ForegroundColor Red
    Write-Host "Install from: https://fly.io/docs/flyctl/installing/"
    exit 1
}

# Check authentication
Write-Host "🔐 Checking authentication..." -ForegroundColor Yellow
try {
    $whoami = fly auth whoami 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "⚠️  Not logged in. Please login:" -ForegroundColor Yellow
        fly auth login
    } else {
        Write-Host "✅ Authenticated as: $whoami" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️  Not logged in. Please login:" -ForegroundColor Yellow
    fly auth login
}

Write-Host ""

# Check if app exists
Write-Host "📱 Checking if app exists..." -ForegroundColor Yellow
try {
    $null = fly status --app $APP_NAME 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ App '$APP_NAME' not found!" -ForegroundColor Red
        Write-Host "Create it first with: fly launch --name $APP_NAME"
        exit 1
    }
    Write-Host "✅ App found: $APP_NAME" -ForegroundColor Green
} catch {
    Write-Host "❌ App '$APP_NAME' not found!" -ForegroundColor Red
    Write-Host "Create it first with: fly launch --name $APP_NAME"
    exit 1
}

Write-Host ""

# Get DATABASE_URL to find database app
Write-Host "🔍 Finding database connection..." -ForegroundColor Yellow
$secrets = fly secrets list --app $APP_NAME 2>&1
$DATABASE_URL = ($secrets | Select-String "DATABASE_URL").ToString()

if ([string]::IsNullOrEmpty($DATABASE_URL)) {
    Write-Host "⚠️  DATABASE_URL not found in secrets" -ForegroundColor Yellow
    Write-Host "Listing PostgreSQL databases..."
    fly postgres list
    Write-Host ""
    $DB_APP_NAME = Read-Host "Enter your database app name"
} else {
    # Extract database app name from DATABASE_URL
    # Format: postgresql://user:pass@db-app.flycast:5432/dbname
    if ($DATABASE_URL -match '@([^:]+)\.flycast') {
        $DB_APP_NAME = $matches[1]
        Write-Host "✅ Found database app: $DB_APP_NAME" -ForegroundColor Green
    } elseif ($DATABASE_URL -match '@([^:]+):') {
        $DB_APP_NAME = $matches[1]
        Write-Host "✅ Found database app: $DB_APP_NAME" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Could not extract database app name from DATABASE_URL" -ForegroundColor Yellow
        Write-Host "DATABASE_URL format: $DATABASE_URL"
        $DB_APP_NAME = Read-Host "Enter your database app name"
    }
}

Write-Host ""

# Confirm action
Write-Host "⚠️  WARNING: This will delete the database '$DB_NAME' and all its data!" -ForegroundColor Yellow
Write-Host "   This action cannot be undone!" -ForegroundColor Yellow
Write-Host ""
$CONFIRM = Read-Host "Are you sure you want to continue? (type 'yes' to confirm)"

if ($CONFIRM -ne "yes") {
    Write-Host "❌ Aborted" -ForegroundColor Red
    exit 0
}

Write-Host ""

# Step 1: Connect to PostgreSQL and drop/recreate database
Write-Host "🗄️  Step 1: Dropping and recreating database..." -ForegroundColor Yellow
Write-Host ""

Write-Host "Connecting to PostgreSQL on $DB_APP_NAME..." -ForegroundColor Cyan
Write-Host "Executing: DROP DATABASE IF EXISTS $DB_NAME; CREATE DATABASE $DB_NAME;" -ForegroundColor Cyan
Write-Host ""

# Execute via SSH
$dropCmd = "psql -U postgres -d postgres -c `"DROP DATABASE IF EXISTS $DB_NAME;`""
$createCmd = "psql -U postgres -d postgres -c `"CREATE DATABASE $DB_NAME;`""
$listCmd = "psql -U postgres -d postgres -c `"\l`""

fly ssh console --app $DB_APP_NAME -C "$dropCmd && $createCmd && $listCmd"

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Database '$DB_NAME' recreated successfully" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to recreate database" -ForegroundColor Red
    Write-Host "You may need to connect manually:"
    Write-Host "  fly ssh console --app $DB_APP_NAME"
    Write-Host "  psql -U postgres -d postgres"
    Write-Host "  DROP DATABASE IF EXISTS $DB_NAME;"
    Write-Host "  CREATE DATABASE $DB_NAME;"
    exit 1
}

Write-Host ""

# Step 2: Deploy application
Write-Host "🚀 Step 2: Deploying application..." -ForegroundColor Yellow
Write-Host ""

$deploy = Read-Host "Deploy now? (y/n)"

if ($deploy -eq "y" -or $deploy -eq "Y") {
    Write-Host "Deploying $APP_NAME..." -ForegroundColor Cyan
    fly deploy --app $APP_NAME
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ Deployment successful!" -ForegroundColor Green
        Write-Host ""
        Write-Host "The application will:"
        Write-Host "  ✅ Create all tables automatically"
        Write-Host "  ✅ Run migrations (including schema fixes)"
        Write-Host "  ✅ Initialize with correct schema"
        Write-Host ""
        Write-Host "Check logs: fly logs --app $APP_NAME"
    } else {
        Write-Host "❌ Deployment failed" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "Skipping deployment. Run manually with:"
    Write-Host "  fly deploy --app $APP_NAME"
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "✅ Fresh deployment complete!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
