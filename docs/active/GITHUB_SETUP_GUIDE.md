# GitHub Repository Setup Guide

## Step 1: Create a New Repository on GitHub

1. Go to [GitHub](https://github.com) and sign in
2. Click the "+" icon in the top right corner
3. Select "New repository"
4. Fill in the repository details:
   - **Repository name**: Choose a name (e.g., `colabora-app-refactored`)
   - **Description**: (Optional) Add a description
   - **Visibility**: Choose Public or Private
   - **DO NOT** initialize with README, .gitignore, or license (we already have these)
5. Click "Create repository"

## Step 2: Get Your Repository URL

After creating the repository, GitHub will show you the repository URL. It will look like:
- `https://github.com/yourusername/your-repo-name.git` (HTTPS)
- `git@github.com:yourusername/your-repo-name.git` (SSH)

Copy the HTTPS URL.

## Step 3: Run the Setup Script

Run the PowerShell script with your new repository URL:

```powershell
.\setup-new-github-repo.ps1 -RepoUrl "https://github.com/yourusername/your-repo-name.git"
```

Replace `yourusername` and `your-repo-name` with your actual GitHub username and repository name.

## Alternative: Manual Setup

If you prefer to do it manually, run these commands:

```powershell
# Remove old remote
git remote remove origin

# Add new remote (replace with your repository URL)
git remote add origin https://github.com/yourusername/your-repo-name.git

# Verify the remote
git remote -v

# Push to the new repository
git push -u origin Refactored
```

Note: Replace `Refactored` with your branch name if it's different.

## Authentication

When pushing, you may need to authenticate:
- **Personal Access Token**: GitHub no longer accepts passwords. You'll need a Personal Access Token (PAT)
- Create one at: https://github.com/settings/tokens
- Select scopes: `repo` (full control of private repositories)

## Next Steps

After pushing, you can:
- View your repository on GitHub
- Set up branch protection rules
- Configure GitHub Actions (if you have workflows)
- Add collaborators
- Create issues and pull requests

