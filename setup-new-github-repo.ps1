# Script to set up a new GitHub repository
# Usage: .\setup-new-github-repo.ps1 -RepoUrl "https://github.com/username/repo-name.git"

param(
    [Parameter(Mandatory=$true)]
    [string]$RepoUrl
)

Write-Host "Setting up new GitHub repository..." -ForegroundColor Green

# Remove old remote if it exists
Write-Host "Removing old remote 'origin'..." -ForegroundColor Yellow
git remote remove origin 2>$null

# Add new remote
Write-Host "Adding new remote: $RepoUrl" -ForegroundColor Yellow
git remote add origin $RepoUrl

# Show current remotes
Write-Host "`nCurrent remotes:" -ForegroundColor Cyan
git remote -v

# Push to new repository
Write-Host "`nPushing code to new repository..." -ForegroundColor Yellow
Write-Host "Note: You may need to authenticate with GitHub" -ForegroundColor Yellow

# Get current branch name
$branch = git branch --show-current
Write-Host "Pushing branch: $branch" -ForegroundColor Cyan

git push -u origin $branch

Write-Host "`nDone! Your code has been pushed to the new repository." -ForegroundColor Green
Write-Host "Repository URL: $RepoUrl" -ForegroundColor Cyan

