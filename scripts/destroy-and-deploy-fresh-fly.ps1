# Destroy all Fly apps and deploy fresh (DB data will be lost - test data only)
# Uses shared-cpu-1x for DB (~$11/mo) instead of performance (~$33/mo)

$APP_NAME = "colabora-app"
$DB_NAME = "colabora-db"
$REGION = "fra"
$VM_SIZE = "shared-cpu-1x"
$VOLUME_SIZE = 10

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Destroy All + Deploy Fresh (Fly.io)" -ForegroundColor Cyan
Write-Host "  DB will be recreated - all data lost (test data only)" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Check Fly CLI
if (!(Get-Command fly -ErrorAction SilentlyContinue)) {
    Write-Host "Fly CLI not found. Install: https://fly.io/docs/flyctl/installing/" -ForegroundColor Red
    exit 1
}

# Auth check
$whoami = fly auth whoami 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Not logged in. Run: fly auth login" -ForegroundColor Red
    exit 1
}
Write-Host "Authenticated: $whoami" -ForegroundColor Green
Write-Host ""

Write-Host "This will:" -ForegroundColor Yellow
Write-Host "  1. Destroy $APP_NAME (app)" -ForegroundColor Gray
Write-Host "  2. Destroy $DB_NAME (Postgres + volume, all data lost)" -ForegroundColor Gray
Write-Host "  3. Create new Postgres: $VM_SIZE in $REGION" -ForegroundColor Gray
Write-Host "  4. Create app and attach DB" -ForegroundColor Gray
Write-Host "  5. Deploy (after you set JWT_SECRET)" -ForegroundColor Gray
Write-Host ""
$confirm = Read-Host "Type 'yes' to continue"

if ($confirm -ne "yes") {
    Write-Host "Aborted." -ForegroundColor Yellow
    exit 0
}

# Step 1: Destroy app (so it's not using the DB)
Write-Host ""
Write-Host "[1/5] Destroying $APP_NAME..." -ForegroundColor Yellow
fly apps destroy $APP_NAME --yes 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  (App may already be gone)" -ForegroundColor Gray
}
Write-Host "  Done." -ForegroundColor Green

# Step 2: Destroy DB app (and volume)
Write-Host ""
Write-Host "[2/5] Destroying $DB_NAME (Postgres + volume)..." -ForegroundColor Yellow
fly apps destroy $DB_NAME --yes 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  (DB app may already be gone)" -ForegroundColor Gray
}
Write-Host "  Done." -ForegroundColor Green

# Step 3: Create new Postgres (shared CPU, cheap)
Write-Host ""
Write-Host "[3/5] Creating new Postgres ($VM_SIZE, $REGION, ${VOLUME_SIZE}GB)..." -ForegroundColor Yellow
fly postgres create --name $DB_NAME --region $REGION --vm-size $VM_SIZE --volume-size $VOLUME_SIZE --initial-cluster-size 1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to create Postgres." -ForegroundColor Red
    exit 1
}
Write-Host "  Done." -ForegroundColor Green

# Step 4: Create app from fly.toml and attach DB
Write-Host ""
Write-Host "[4/5] Creating app and attaching DB..." -ForegroundColor Yellow

# Create app (no deploy yet) - run from directory that has fly.toml
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
# fly.toml might be in repo root or one level up
if (!(Test-Path (Join-Path $repoRoot "fly.toml"))) {
    $repoRoot = Split-Path -Parent $repoRoot
}
if (!(Test-Path (Join-Path $repoRoot "fly.toml"))) {
    Write-Host "fly.toml not found. Run this script from the repo root (where fly.toml is)." -ForegroundColor Red
    exit 1
}
Push-Location $repoRoot

fly launch --name $APP_NAME --no-deploy 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Launch failed. Try manually: fly launch --name $APP_NAME --no-deploy" -ForegroundColor Yellow
    Pop-Location
    exit 1
}

fly postgres attach $DB_NAME --app $APP_NAME --yes 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Attach failed. Try: fly postgres attach $DB_NAME --app $APP_NAME" -ForegroundColor Yellow
    Pop-Location
    exit 1
}
Pop-Location
Write-Host "  Done." -ForegroundColor Green

# Step 5: Remind secrets and deploy
Write-Host ""
Write-Host "[5/5] Set JWT_SECRET then deploy." -ForegroundColor Yellow
Write-Host ""
Write-Host "  Set secret (required):" -ForegroundColor Cyan
Write-Host "    `$secret = node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"" -ForegroundColor Gray
Write-Host "    fly secrets set JWT_SECRET=`$secret --app $APP_NAME" -ForegroundColor Gray
Write-Host ""
$deploy = Read-Host "Set JWT_SECRET now and deploy? (y/n)"

if ($deploy -eq "y" -or $deploy -eq "Y") {
    Write-Host "Deploying..." -ForegroundColor Cyan
    Push-Location $repoRoot
    fly deploy --app $APP_NAME
    Pop-Location
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "Done. App will run migrations on first start." -ForegroundColor Green
        Write-Host "Logs: fly logs --app $APP_NAME" -ForegroundColor Gray
    }
} else {
    Write-Host "When ready: fly deploy --app $APP_NAME" -ForegroundColor Gray
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Fresh deploy ready (shared CPU DB, no backup)" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
