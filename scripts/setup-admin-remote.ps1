# Remote Admin User Setup Script for Fly.io
# Creates an admin user by SSHing into the Fly.io app and running the setup script

param(
    [Parameter(Mandatory=$true)]
    [string]$AppName
)

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Remote Admin User Setup - Fly.io" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Check Fly CLI
try {
    $null = Get-Command fly -ErrorAction Stop
} catch {
    Write-Host "❌ Fly CLI not found!" -ForegroundColor Red
    Write-Host "Install from: https://fly.io/docs/flyctl/installing/" -ForegroundColor Yellow
    exit 1
}

# Check if app exists
Write-Host "Checking app: $AppName..." -ForegroundColor Yellow
try {
    $status = fly status --app $AppName 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ App '$AppName' not found!" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ App found: $AppName" -ForegroundColor Green
} catch {
    Write-Host "❌ App '$AppName' not found!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Connecting to app and creating admin user..." -ForegroundColor Yellow
Write-Host ""

# Check if app is ready
Write-Host "Checking if app is ready..." -ForegroundColor Gray
try {
    $healthCheck = Invoke-WebRequest -Uri "https://$AppName.fly.dev/api/health/ready" -Method GET -TimeoutSec 5 -UseBasicParsing -ErrorAction SilentlyContinue
    if ($healthCheck.StatusCode -eq 200) {
        Write-Host "✅ App is ready" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️  App may still be starting. Continuing anyway..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Running admin setup script..." -ForegroundColor Gray

# SSH into app and run setup script (use sh -c so cd and && work)
$output = fly ssh console --app $AppName -C "sh -c 'cd /app && node scripts/setup-admin.js'" 2>&1
$exitCode = $LASTEXITCODE

# Display output
Write-Host $output

if ($exitCode -eq 0) {
    Write-Host ""
    Write-Host 'Admin user setup complete!' -ForegroundColor Green
    Write-Host ""
    Write-Host 'Default Admin Credentials:' -ForegroundColor Cyan
    Write-Host '  Email: admin@colabora.local' -ForegroundColor White
    Write-Host '  Password: AdminSecurePass123!' -ForegroundColor White
    Write-Host ""
    Write-Host 'IMPORTANT: Change the password immediately after first login!' -ForegroundColor Yellow
    Write-Host ""
    Write-Host ('Access your app at: https://' + $AppName + '.fly.dev') -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host 'Failed to create admin user' -ForegroundColor Red
    Write-Host ""
    Write-Host 'Troubleshooting:' -ForegroundColor Yellow
    Write-Host '  1. Ensure the app is fully deployed and running' -ForegroundColor White
    Write-Host '  2. Wait a few minutes after deployment for migrations to complete' -ForegroundColor White
    Write-Host ('  3. Check app logs: fly logs --app ' + $AppName) -ForegroundColor White
    Write-Host ""
    Write-Host ('Try manually: fly ssh console --app ' + $AppName + ' then run: cd /app; node scripts/setup-admin.js') -ForegroundColor Yellow
    exit 1
}
