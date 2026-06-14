# Hetzner setup worksheet

Fill this in before first deploy. **Do not commit** completed copies with real passwords.

## Hetzner Cloud

| Resource | Name | Type | Private IP | Public IP |
|----------|------|------|------------|-----------|
| data-1 | | CCX23 | 10.0.0.20 | |
| app-1 | | CPX31 | 10.0.0.11 | |
| app-2 | | CPX31 | 10.0.0.12 | |
| Load Balancer | | | | |

Region: `fsn1` / `nbg1`  
Private network: `10.0.0.0/16`

## Domain

| Record | Value |
|--------|-------|
| `colabora.example.com` | LB public IP |

## Secrets (for `.kamal/secrets` and GitHub Actions)

```text
JWT_SECRET=
POSTGRES_PASSWORD=
REDIS_PASSWORD=

DATABASE_URL=postgresql://colabora:<POSTGRES_PASSWORD>@10.0.0.20:5432/colabora
REDIS_URL=redis://:<REDIS_PASSWORD>@10.0.0.20:6379/0

FRONTEND_URL=https://colabora.example.com
ALLOWED_ORIGINS=https://colabora.example.com
```

## Repository edits

- [ ] `config/deploy.yml` — `YOUR_GITHUB_ORG`, domain, app IPs
- [ ] GitHub secrets set (see `HETZNER_DEPLOYMENT.md`)
- [ ] GHCR package visibility (public or PAT with pull on servers)

## Commands (in order)

```bash
# 1. Data server
cd infra && cp .env.data.example .env.data && docker compose -f docker-compose.data.yml --env-file .env.data up -d

# 2. App servers
./scripts/hetzner-bootstrap.sh   # on each app server

# 3. Local first deploy
cp .kamal/secrets.example .kamal/secrets
kamal setup
kamal deploy

# 4. Admin
kamal app exec -i 'node scripts/setup-admin.js'
```
