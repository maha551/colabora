# Fly.io Deployment Checklist

Quick checklist for deploying Colabora to Fly.io.

## Pre-Deployment

- [ ] Fly CLI installed (`fly version`)
- [ ] Logged into Fly.io (`fly auth whoami`)
- [ ] App exists (`fly apps list`)
- [ ] Persistent volume exists (`fly volumes list`)
- [ ] Secrets are set (`fly secrets list`)

## Required Secrets

- [ ] `SESSION_SECRET` (32+ characters, cryptographically random)
- [ ] `JWT_SECRET` (32+ characters, cryptographically random)
- [ ] `ADMIN_BOOTSTRAP_EMAIL` (required only for first production boot when no admin exists)
- [ ] `ADMIN_BOOTSTRAP_PASSWORD` (required only for first production boot, 12+ chars)
- [ ] `ADMIN_BOOTSTRAP_TOKEN` (required only for first production boot, 32+ chars)

## Optional Secrets (for Email)

- [ ] `RESEND_API_KEY` (if using email invitations)
- [ ] `RESEND_FROM_EMAIL` (if using custom domain)

## GitHub Repository Secrets (for CI/CD)

Configure at **Settings → Secrets and variables → Actions → New repository secret.**

- [ ] **Required for CI/CD workflows:** `SESSION_SECRET`, `JWT_SECRET` (32+ characters each, cryptographically random; same requirements as Fly.io)
- [ ] **Required for Fly deploy:** `FLY_API_TOKEN` (used by `.github/workflows/fly-deploy.yml`)

Note: PRs from forks do not have access to repository secrets; the deployment-check and health-checks jobs may fail for fork PRs unless secrets are set in the fork or conditional logic is added.

## Configuration Files

- [ ] `fly.toml` exists and is configured
- [ ] `Dockerfile` exists
- [ ] `package.json` has build scripts
- [ ] `nixpacks.toml` exists (if using Nixpacks)

## Deployment

- [ ] Code is committed
- [ ] Run deployment: `fly deploy --app colabora-fresh-final-falling-brook-1422`
- [ ] Monitor deployment logs
- [ ] Verify health check passes

## Post-Deployment

- [ ] App is accessible at: `https://colabora-fresh-final-falling-brook-1422.fly.dev`
- [ ] Liveness endpoint responds with HTTP 200: `/api/health/live`
- [ ] Readiness endpoint responds with HTTP 200 only when fully ready: `/api/health/ready`
- [ ] Create admin user (if needed)
- [ ] Test user registration
- [ ] Test document creation

## Quick Commands

```bash
# Check everything
fly status --app colabora-fresh-final-falling-brook-1422
fly secrets list --app colabora-fresh-final-falling-brook-1422
fly volumes list --app colabora-fresh-final-falling-brook-1422

# Deploy
fly deploy --app colabora-fresh-final-falling-brook-1422

# Monitor
fly logs --app colabora-fresh-final-falling-brook-1422

# Troubleshoot
fly ssh console --app colabora-fresh-final-falling-brook-1422
```

## Using Setup Script (Windows)

```powershell
# Automated setup and deployment
.\setup-fly-deployment.ps1 -Deploy
```

See [FLY_DEPLOYMENT_SETUP.md](./FLY_DEPLOYMENT_SETUP.md) for detailed instructions.
