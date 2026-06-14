# API Keys Setup Script for Colabora on Fly.io
# This script helps you set up Resend API keys for email functionality

param(
    [string]$AppName = "",
    [string]$ResendApiKey = "",
    [string]$ResendFromEmail = ""
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "API Keys Setup for Colabora" -ForegroundColor Cyan
Write-Host "===========================" -ForegroundColor Cyan
Write-Host ""

# Get app name from fly.toml if not provided
if ($AppName -eq "") {
    if (Test-Path "fly.toml") {
        $flyTomlContent = Get-Content "fly.toml" -Raw
        if ($flyTomlContent -match "app\s*=\s*['`"]([^'`"]+)['`"]") {
            $AppName = $matches[1]
            Write-Host "Using app name from fly.toml: $AppName" -ForegroundColor Cyan
        }
    }
    
    if ($AppName -eq "") {
        Write-Host "App name not found. Please provide:" -ForegroundColor Yellow
        $AppName = Read-Host "Enter app name"
        if ([string]::IsNullOrEmpty($AppName)) {
            Write-Host "App name is required" -ForegroundColor Red
            exit 1
        }
    }
}

# Check Fly CLI
$flyPath = "flyctl"
if (!(Get-Command flyctl -ErrorAction SilentlyContinue)) {
    $flyDir = Join-Path $env:USERPROFILE ".fly\bin"
    $flyPath = Join-Path $flyDir "flyctl.exe"
    
    if (!(Test-Path $flyPath)) {
        Write-Host "Fly CLI not found! Install from: https://fly.io/docs/flyctl/installing/" -ForegroundColor Red
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

# Setup RESEND_API_KEY
Write-Host ""
Write-Host "Setting up RESEND_API_KEY..." -ForegroundColor Cyan
if ($currentSecretNames -contains "RESEND_API_KEY") {
    Write-Host "RESEND_API_KEY is already set" -ForegroundColor Green
    $update = Read-Host "Do you want to update it? (y/n)"
    if ($update -ne "y" -and $update -ne "Y") {
        Write-Host "Skipping RESEND_API_KEY" -ForegroundColor Yellow
    } else {
        if ([string]::IsNullOrEmpty($ResendApiKey)) {
            Write-Host "Get your API key from: https://resend.com/api-keys" -ForegroundColor Gray
            $ResendApiKey = Read-Host "Enter your Resend API key"
        }
        
        if (![string]::IsNullOrEmpty($ResendApiKey)) {
            & $flyPath secrets set "RESEND_API_KEY=$ResendApiKey" --app $AppName
            if ($LASTEXITCODE -eq 0) {
                Write-Host "RESEND_API_KEY set successfully" -ForegroundColor Green
            } else {
                Write-Host "Failed to set RESEND_API_KEY" -ForegroundColor Red
            }
        }
    }
} else {
    if ([string]::IsNullOrEmpty($ResendApiKey)) {
        Write-Host "RESEND_API_KEY is not set" -ForegroundColor Yellow
        Write-Host "Get your API key from: https://resend.com/api-keys" -ForegroundColor Gray
        $ResendApiKey = Read-Host "Enter your Resend API key"
    }
    
    if (![string]::IsNullOrEmpty($ResendApiKey)) {
        & $flyPath secrets set "RESEND_API_KEY=$ResendApiKey" --app $AppName
        if ($LASTEXITCODE -eq 0) {
            Write-Host "RESEND_API_KEY set successfully" -ForegroundColor Green
        } else {
            Write-Host "Failed to set RESEND_API_KEY" -ForegroundColor Red
        }
    }
}

# Setup RESEND_FROM_EMAIL
Write-Host ""
Write-Host "Setting up RESEND_FROM_EMAIL..." -ForegroundColor Cyan
if ($currentSecretNames -contains "RESEND_FROM_EMAIL") {
    Write-Host "RESEND_FROM_EMAIL is already set" -ForegroundColor Green
    $update = Read-Host "Do you want to update it? (y/n)"
    if ($update -ne "y" -and $update -ne "Y") {
        Write-Host "Skipping RESEND_FROM_EMAIL" -ForegroundColor Yellow
    } else {
        if ([string]::IsNullOrEmpty($ResendFromEmail)) {
            Write-Host "This is the email address that will send emails (e.g., noreply@yourdomain.com)" -ForegroundColor Gray
            $ResendFromEmail = Read-Host "Enter sender email address"
        }
        
        if (![string]::IsNullOrEmpty($ResendFromEmail)) {
            & $flyPath secrets set "RESEND_FROM_EMAIL=$ResendFromEmail" --app $AppName
            if ($LASTEXITCODE -eq 0) {
                Write-Host "RESEND_FROM_EMAIL set successfully" -ForegroundColor Green
            } else {
                Write-Host "Failed to set RESEND_FROM_EMAIL" -ForegroundColor Red
            }
        }
    }
} else {
    if ([string]::IsNullOrEmpty($ResendFromEmail)) {
        Write-Host "RESEND_FROM_EMAIL is not set" -ForegroundColor Yellow
        Write-Host "This is the email address that will send emails (e.g., noreply@yourdomain.com)" -ForegroundColor Gray
        $ResendFromEmail = Read-Host "Enter sender email address"
    }
    
    if (![string]::IsNullOrEmpty($ResendFromEmail)) {
        & $flyPath secrets set "RESEND_FROM_EMAIL=$ResendFromEmail" --app $AppName
        if ($LASTEXITCODE -eq 0) {
            Write-Host "RESEND_FROM_EMAIL set successfully" -ForegroundColor Green
        } else {
            Write-Host "Failed to set RESEND_FROM_EMAIL" -ForegroundColor Red
        }
    }
}

# Summary
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "API Keys Setup Complete!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Current secrets:" -ForegroundColor Cyan
$secrets = & $flyPath secrets list --app $AppName --json 2>&1 | ConvertFrom-Json
if ($secrets) {
    foreach ($secret in $secrets) {
        if ($secret.Name -eq "RESEND_API_KEY" -or $secret.Name -eq "RESEND_FROM_EMAIL") {
            Write-Host "  $($secret.Name): Set" -ForegroundColor Green
        }
    }
}
Write-Host ""
Write-Host "Note: Restart your app for changes to take effect:" -ForegroundColor Yellow
Write-Host "  fly apps restart --app $AppName" -ForegroundColor Gray
Write-Host ""

