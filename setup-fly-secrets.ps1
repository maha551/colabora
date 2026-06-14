# Colabora Fly.io Secrets Setup Script
# This script helps you set all necessary secrets for your Fly.io app

param(
    [string]$AppName = "",
    [switch]$AutoSet,
    [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"

# Get app name from fly.toml if not provided
if ($AppName -eq "") {
    if (Test-Path "fly.toml") {
        $flyTomlContent = Get-Content "fly.toml" -Raw
        if ($flyTomlContent -match 'app\s*=\s*["'']([^"'']+)["'']') {
            $AppName = $matches[1]
            Write-Host "Using app name from fly.toml: $AppName" -ForegroundColor Cyan
        } else {
            Write-Host "Could not determine app name from fly.toml" -ForegroundColor Red
            Write-Host "Please provide app name: .\setup-fly-secrets.ps1 -AppName your-app-name" -ForegroundColor Yellow
            exit 1
        }
    } else {
        Write-Host "fly.toml not found and no app name provided" -ForegroundColor Red
        Write-Host "Usage: .\setup-fly-secrets.ps1 -AppName your-app-name" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host ""
Write-Host "Fly.io Secrets Setup for: $AppName" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

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

# Get current secrets
Write-Host ""
Write-Host "Checking current secrets..." -ForegroundColor Yellow
try {
    $secretsJson = & $flyPath secrets list --app $AppName --json 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to list secrets. Is the app name correct?" -ForegroundColor Red
        Write-Host "Error: $secretsJson" -ForegroundColor Gray
        exit 1
    }
    
    $secrets = $secretsJson | ConvertFrom-Json
    $currentSecretNames = @()
    if ($secrets) {
        $currentSecretNames = $secrets | ForEach-Object { $_.Name }
    }
} catch {
    Write-Host "Failed to parse secrets: $_" -ForegroundColor Red
    exit 1
}

# Check required secrets
Write-Host ""
Write-Host "Required Secrets:" -ForegroundColor Cyan
Write-Host "-------------------" -ForegroundColor Cyan

$missingRequired = @()
if ($currentSecretNames -contains "JWT_SECRET") {
    Write-Host "JWT_SECRET is set" -ForegroundColor Green
} else {
    Write-Host "JWT_SECRET is MISSING" -ForegroundColor Red
    Write-Host "  JWT token signing secret (minimum 32 characters)" -ForegroundColor Gray
    $missingRequired += "JWT_SECRET"
}

# Check optional secrets
Write-Host ""
Write-Host "Optional Secrets:" -ForegroundColor Cyan
Write-Host "-------------------" -ForegroundColor Cyan

if ($currentSecretNames -contains "RESEND_API_KEY") {
    Write-Host "RESEND_API_KEY is set" -ForegroundColor Green
} else {
    Write-Host "RESEND_API_KEY is not set (optional)" -ForegroundColor Yellow
    Write-Host "  Resend API key for email functionality" -ForegroundColor Gray
}

if ($currentSecretNames -contains "RESEND_FROM_EMAIL") {
    Write-Host "RESEND_FROM_EMAIL is set" -ForegroundColor Green
} else {
    Write-Host "RESEND_FROM_EMAIL is not set (optional)" -ForegroundColor Yellow
    Write-Host "  Email sender address (e.g., noreply@yourdomain.com)" -ForegroundColor Gray
}

# If check-only mode, exit here
if ($CheckOnly) {
    Write-Host ""
    Write-Host "======================================" -ForegroundColor Cyan
    if ($missingRequired.Count -eq 0) {
        Write-Host "All required secrets are set!" -ForegroundColor Green
    } else {
        Write-Host "Missing required secrets. Run without -CheckOnly to set them." -ForegroundColor Red
    }
    exit 0
}

# Generate and set missing required secrets
if ($missingRequired.Count -gt 0) {
    Write-Host ""
    Write-Host "Setting missing required secrets..." -ForegroundColor Yellow
    
    foreach ($secretName in $missingRequired) {
        if ($secretName -eq "JWT_SECRET") {
            Write-Host ""
            Write-Host "Generating JWT_SECRET..." -ForegroundColor Gray
            try {
                $secretValue = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
                $secretValue = $secretValue.Trim()
                
                if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrEmpty($secretValue)) {
                    Write-Host "Failed to generate JWT_SECRET" -ForegroundColor Red
                    continue
                }
                
                if ($secretValue.Length -lt 32) {
                    Write-Host "Generated secret is too short" -ForegroundColor Red
                    continue
                }
                
                if ($AutoSet) {
                    Write-Host "Setting JWT_SECRET on Fly.io..." -ForegroundColor Gray
                    & $flyPath secrets set "JWT_SECRET=$secretValue" --app $AppName | Out-Null
                    if ($LASTEXITCODE -eq 0) {
                        Write-Host "JWT_SECRET set successfully" -ForegroundColor Green
                    } else {
                        Write-Host "Failed to set JWT_SECRET" -ForegroundColor Red
                    }
                } else {
                    Write-Host "Generated JWT_SECRET ($($secretValue.Length) characters)" -ForegroundColor Gray
                    Write-Host ""
                    Write-Host "To set this secret, run:" -ForegroundColor Yellow
                    Write-Host "fly secrets set JWT_SECRET=$secretValue --app $AppName" -ForegroundColor White
                }
            } catch {
                Write-Host "Error generating JWT_SECRET: $_" -ForegroundColor Red
            }
        }
    }
}

# Summary
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Summary" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

if ($missingRequired.Count -eq 0) {
    Write-Host "All required secrets are set!" -ForegroundColor Green
} else {
    if ($AutoSet) {
        Write-Host "Some secrets may need to be set manually" -ForegroundColor Yellow
    } else {
        Write-Host "Run with -AutoSet to automatically set missing secrets:" -ForegroundColor Yellow
        Write-Host ".\setup-fly-secrets.ps1 -AppName $AppName -AutoSet" -ForegroundColor White
    }
}

Write-Host ""
Write-Host "Useful Commands:" -ForegroundColor Cyan
Write-Host "  List all secrets: fly secrets list --app $AppName" -ForegroundColor White
Write-Host "  View app status: fly status --app $AppName" -ForegroundColor White
Write-Host "  View logs: fly logs --app $AppName" -ForegroundColor White
Write-Host "  Restart app: fly apps restart --app $AppName" -ForegroundColor White
Write-Host ""

if ($missingRequired.Count -gt 0 -and !$AutoSet) {
    Write-Host "IMPORTANT: Set all required secrets before deploying!" -ForegroundColor Red
    Write-Host ""
}
