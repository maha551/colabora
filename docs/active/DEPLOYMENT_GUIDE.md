# Colabora Deployment Guide

## Overview

Colabora is a collaborative drafting software that can be deployed to Fly.io via GitHub Actions. This guide covers the deployment process and requirements.

## Prerequisites

1. **Fly.io Account**: Sign up at [fly.io](https://fly.io)
2. **GitHub Repository**: Your code must be in a GitHub repository
3. **Fly.io CLI**: Install the Fly CLI tool

## GitHub Repository Setup

### 1. Configure Repository Secrets

In your GitHub repository, go to **Settings > Secrets and variables > Actions** and add:

- `FLY_API_TOKEN`: Your Fly.io API token
  - Get this from: `fly auth token` (run after `fly auth login`)

### 2. Ensure App Exists on Fly.io

Before deploying via GitHub Actions, create the Fly.io app:

```bash
# Login to Fly.io
fly auth login

# Create the app (only needed once)
fly launch --name colabora-fresh --region fra --no-deploy

# Create persistent volume for database
fly volumes create colabora_data --size 3 --region fra
```

### 3. Push to Main Branch

The GitHub Actions workflow triggers on pushes to the `main` branch. Ensure your code is committed and pushed:

```bash
git add .
git commit -m "Prepare for deployment"
git push origin main
```

## Deployment Process

### Automatic Deployment (GitHub Actions)

Once configured, deployment happens automatically when you push to the `main` branch:

1. **Code Quality Checks**: Linting and syntax validation
2. **Build Validation**: Frontend and backend build checks
3. **Docker Build**: Validates container build process
4. **Health Checks**: Tests application endpoints
5. **Fly.io Deployment**: Deploys to production with fresh secrets

### Manual Deployment (Alternative)

Use the provided deployment scripts:

```bash
# Quick deployment
./deploy-fly.sh

# Fresh deployment (recreates app)
./deploy-fresh.sh
```

## Environment Configuration

### Required Secrets (Must be Set Manually)

**CRITICAL**: These secrets must be set via Fly.io secrets before deployment. The application will fail to start in production if these are missing.

#### Setting Secrets via Fly.io CLI

```bash
# Generate secure random secret (32+ characters recommended)
openssl rand -hex 32  # Use this output for JWT_SECRET

# Set secret on Fly.io
fly secrets set JWT_SECRET=<generated-secret-here>
```

#### Required Secrets:

- **`JWT_SECRET`**: JWT token signing secret (minimum 32 characters)
  - Used for signing authentication tokens
  - Must be a strong random string
  - Generate using: `openssl rand -hex 32`
  - **Never commit this to version control**

#### Optional Environment Variables (Set in fly.toml):

- `ALLOWED_ORIGINS`: CORS allowed origins (comma-separated)
- `FRONTEND_URL`: Frontend application URL
- `DATABASE_URL`: SQLite database path (defaults to `/data/colabora.db` in production)

### Environment Variables (Pre-configured)

Set in `fly.toml`:

- `NODE_ENV=production`
- `PORT=3000`
- `JWT_EXPIRES_IN=8h`
- `LOG_LEVEL=info`
- `RATE_LIMIT_MAX_REQUESTS=500`
- `RATE_LIMIT_WINDOW_MS=900000`

## Application Structure

```
├── client/          # React frontend (Vite)
├── server/          # Express.js backend
├── Dockerfile       # Multi-stage Docker build
├── fly.toml         # Fly.io configuration
└── .github/
    └── workflows/
        └── fly-deploy.yml  # GitHub Actions workflow
```

## Post-Deployment Steps

### 1. Verify Deployment

Check the deployment status:

```bash
fly status --app colabora-fresh
fly logs --app colabora-fresh
```

### 2. Setup Admin User

After first deployment, create an admin user:

```bash
# Connect to the deployed app
fly ssh console --app colabora-fresh

# Run the admin setup script
npm run setup-admin
```

### 3. Access the Application

Get your app URL:

```bash
fly status --app colabora-fresh
```

The app will be available at: `https://colabora-fresh.fly.dev`

## Demo Users

The application comes with pre-configured demo users:

- **Alice Johnson**: alice@example.com / SecurePass123!
- **Bob Smith**: bob@example.com / SecurePass123!
- **Charlie Brown**: charlie@example.com / SecurePass123!
- **Diana Prince**: diana@example.com / SecurePass123!

## Admin User

- **Admin**: admin@colabora.local / AdminSecurePass123!

## Troubleshooting

### Deployment Fails

1. **Check GitHub Actions Logs**: Review the workflow run logs
2. **Verify Secrets**: Ensure `FLY_API_TOKEN` is set correctly
3. **Check Fly.io App**: Ensure the app exists: `fly apps list`

### Application Issues

1. **Health Check Fails**: Check logs with `fly logs --app colabora-fresh`
2. **Database Issues**: The database persists in the Fly.io volume
3. **Environment Variables**: Secrets are managed automatically

### Manual Recovery

If automatic deployment fails, you can deploy manually:

```bash
# Deploy directly
fly deploy --app colabora-fresh

# Or use the fresh deployment script
./deploy-fresh.sh
```

## Security Notes

- Secrets are auto-generated on each deployment
- Database persists in Fly.io volume
- HTTPS is enforced automatically
- CORS is configured for the app domain

## Monitoring

- Health checks run every 30 seconds
- Automatic scaling based on load
- Logs available via `fly logs --app colabora-fresh`
