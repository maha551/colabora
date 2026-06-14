# Deploy Colabora to Hetzner from your PC (Kamal production).
# Prerequisites: Ruby gem `kamal`, Docker, SSH key at ~/.ssh/colabora_deploy, .kamal/secrets filled in.

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (Test-Path (Join-Path $PSScriptRoot "..\config\deploy.yml")) {
    $RepoRoot = Join-Path $PSScriptRoot ".."
}
Set-Location $RepoRoot

$KeyPath = Join-Path $env:USERPROFILE ".ssh\colabora_deploy"
$SecretsPath = Join-Path $RepoRoot ".kamal\secrets"

if (-not (Test-Path $KeyPath)) {
    Write-Error "Missing SSH key: $KeyPath"
}
if (-not (Test-Path $SecretsPath)) {
    Write-Host "Copy .kamal/secrets.example to .kamal/secrets and fill in values first." -ForegroundColor Yellow
    Copy-Item (Join-Path $RepoRoot ".kamal\secrets.example") $SecretsPath
    Write-Error "Created $SecretsPath — edit it, then run this script again."
}

Get-Service ssh-agent -ErrorAction SilentlyContinue | Set-Service -StartupType Manual -ErrorAction SilentlyContinue
Start-Service ssh-agent -ErrorAction SilentlyContinue
ssh-add $KeyPath 2>$null

Write-Host "Deploying to production (kamal deploy)..." -ForegroundColor Cyan
kamal deploy -v
