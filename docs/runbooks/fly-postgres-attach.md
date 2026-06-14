# Fly Postgres Attach Runbook

## Purpose
Attach a Fly Postgres cluster to the Colabora Fly app and verify connection settings.

## Prerequisites
- `flyctl` authenticated for the correct Fly organization.
- App name: `colabora-app`.
- Existing Fly Postgres cluster in same org/region.

## Attach Database
1. Discover database app name:

```bash
fly postgres list
```

2. Attach DB to application:

```bash
fly postgres attach <postgres-app-name> --app colabora-app
```

This command typically provisions `DATABASE_URL` on the application.

## Verify Secrets
Check app secrets and confirm `DATABASE_URL` exists:

```bash
fly secrets list --app colabora-app
```

## Validate Connectivity
Deploy with release migration command from `fly.toml`:

```bash
fly deploy --app colabora-app
```

Then check runtime status:

```bash
fly logs --app colabora-app
```

Look for:
- successful `npm run db:migrate` execution in release phase
- app boot without database connection errors

## Safety Notes
- Do not attach production DB to non-production app.
- Validate app/env targeting before running attach or deploy commands.
