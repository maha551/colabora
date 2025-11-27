# PowerShell script to clean up test files and temporary databases
# Usage: .\scripts\cleanup-test-files.ps1

Write-Host "🧹 Cleaning up test files and temporary databases..." -ForegroundColor Cyan

# Delete test database files
Write-Host "Deleting test database files..." -ForegroundColor Yellow
Get-ChildItem -Path . -Filter "test-colabora-*.db" -Recurse -File | Remove-Item -Force
Get-ChildItem -Path . -Filter "nonexistent_*.db" -Recurse -File | Remove-Item -Force

# Move test/debug scripts to scripts/ directory or delete
Write-Host "Cleaning up test/debug scripts..." -ForegroundColor Yellow

# Move useful scripts to scripts/ directory
$scriptsToMove = @(
    "check_all_users.js",
    "check_duplicate_users.js",
    "check_final_data.js",
    "check_user_ids.js",
    "reset_and_reseed.js"
)

foreach ($script in $scriptsToMove) {
    if (Test-Path $script) {
        try {
            Move-Item -Path $script -Destination "scripts\" -Force -ErrorAction Stop
            Write-Host "  Moved $script to scripts/" -ForegroundColor Green
        } catch {
            Remove-Item -Path $script -Force
            Write-Host "  Deleted $script" -ForegroundColor Yellow
        }
    }
}

# Delete debug scripts (not needed in repo)
$scriptsToDelete = @(
    "debug_login.js",
    "decode_jwt.js",
    "test_api_direct.js",
    "test_user_auth.js"
)

foreach ($script in $scriptsToDelete) {
    if (Test-Path $script) {
        Remove-Item -Path $script -Force
        Write-Host "  Deleted $script" -ForegroundColor Yellow
    }
}

Write-Host "✅ Cleanup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Note: Test database files have been deleted." -ForegroundColor White
Write-Host "Note: Some scripts have been moved to scripts/ directory." -ForegroundColor White
Write-Host "Note: Debug scripts have been removed." -ForegroundColor White

