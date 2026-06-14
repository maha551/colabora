# Hetzner Deployment Guide (Kamal)

Deploy Colabora to **Hetzner Cloud** with **[Kamal 2](https://kamal-deploy.org/)**.

| Profile | Users | Architecture | Config |
|---------|-------|--------------|--------|
| **Production** (current) | 10–200 | 1 app + 1 data server | `deploy.yml` |
| **Pilot** (legacy alias) | same as production | 1 app + 1 data | `deploy.pilot.yml` overlay |

**Pilot walkthrough:** [HETZNER_PILOT_CHECKLIST.md](./HETZNER_PILOT_CHECKLIST.md) — follow that document step by step for your first deploy.

---

## Pilot architecture (10–50 users)

Recommended for your **group test this week** through end of month. One app server is enough for real-time collaboration; no load balancer required.

```
  Users ──────────► app-1 (CPX32)          Kamal + Docker
                         │
                         │  private network 10.0.0.0/16
                         ▼
                    data-1 (CX33)           Postgres 16 + Redis 7
```

| Server | Hetzner type (EU, Apr 2026) | Role | ~€/month |
|--------|----------------------------|------|----------|
| app-1 | **CPX32** (4 vCPU, 8 GB) | Kamal web | €13.99 |
| data-1 | **CX33** (4 vCPU, 8 GB) | Postgres + Redis | €6.49 |
| — | *(no load balancer)* | — | — |
| **Total** | | | **~€20–25** |

Region: **fsn1** (Frankfurt) or **nbg1** (Nuremberg).

### Why this size?

- **10–50 accounts**, typically **5–15 online at once** — well within one CPX32.
- **Live collaboration** (edits, votes, WebSockets) works on a **single app process**; Redis is used for rate limiting and cache, not required for Socket.IO fan-out until you add a second app server.
- **Separate data server** keeps Postgres safe when you redeploy the app.

### Provision before 2026-06-15

Hetzner’s **15 June 2026** price adjustment applies to **new** cloud orders and rescales. Servers created **before** that date keep their current monthly rate. See [Pricing (2026)](#pricing-2026) below.

### Pilot deploy commands

```bash
cp .kamal/secrets.example .kamal/secrets   # fill values — see checklist
kamal setup -d pilot
kamal deploy -d pilot
kamal app exec -d pilot -i 'node scripts/setup-admin.js'
```

npm scripts: `npm run deploy:hetzner:pilot:setup` and `npm run deploy:hetzner:pilot`.

### Pilot environment variables

Set in `.kamal/secrets` and `config/deploy.pilot.yml`:

| Variable | Pilot value |
|----------|-------------|
| `PG_POOL_MIN` | `2` |
| `PG_POOL_MAX` | `15` |
| `REDIS_URL` | **Set** (recommended) |
| `FRONTEND_URL` | `https://your-domain` (**required**) |
| `ALLOWED_ORIGINS` | Same as `FRONTEND_URL` |
| `RATE_LIMIT_MAX_REQUESTS` | `500` |
| `CONTACT_EMAIL` | Shown on legal/contact pages |
| `SITE_OPERATOR_NAME` / `SITE_OPERATOR_ADDRESS` | Imprint placeholders |
| `TERMS_VERSION` / `PRIVACY_VERSION` | `2026-06-11` (in pilot overlay) |

Postgres on data server (pilot compose): `max_connections=80` — see `infra/docker-compose.data.pilot.yml`.

### Pilot files

| Path | Purpose |
|------|---------|
| `config/deploy.pilot.yml` | Single-app Kamal overlay |
| `infra/docker-compose.data.pilot.yml` | Postgres + Redis for CX33 |
| `scripts/hetzner-install-backup-cron.sh` | Daily `pg_dump` on data-1 |
| `docs/active/HETZNER_PILOT_CHECKLIST.md` | Step-by-step setup |

---

## Production architecture (~200 concurrent users)

Use when you outgrow the pilot (typically **100+ active** or **30+ simultaneous** in live sessions).

```
                    ┌─────────────────────┐
  Users ──────────► │ Hetzner Load Balancer│
                    └──────────┬──────────┘
              ┌────────────────┼────────────────┐
              ▼                ▼                │
         app-1 (CPX32)    app-2 (CPX32)       │  Kamal + Docker
              └────────────────┬────────────────┘
                               │ private network
                               ▼
                         data-1 (CCX23)
                         Postgres 16 + Redis 7
```

| Server | Hetzner type | Role |
|--------|--------------|------|
| app-1, app-2 | CPX32 (4 vCPU, 8 GB) | Kamal web role |
| data-1 | CCX23 + 40 GB volume | Postgres + Redis |
| — | Load Balancer (LB11) | TCP 443 → app-1:443, app-2:443 |

`REDIS_URL` is **required** with 2+ app servers (Socket.IO Redis adapter).

```bash
kamal setup && kamal deploy
```

---

## Quick checklist (production)

### A. Hetzner Cloud (console)

- [ ] Create project + private network `10.0.0.0/16`
- [ ] Create **data-1** (CCX23), attach to network → e.g. `10.0.0.20`
- [ ] Create **app-1**, **app-2** (CPX32) → `10.0.0.11`, `10.0.0.12`
- [ ] Create **Load Balancer** → targets app-1 + app-2 port **443** (TCP)
- [ ] **Firewall:** SSH from your IP; app servers 80/443 public; data-1 only 5432/6379 from app private IPs

### B. Data server (`data-1`)

```bash
ssh root@data-1
apt update && apt install -y docker.io docker-compose-plugin git
git clone <your-repo-url> && cd colabora_app-2/infra
cp .env.data.example .env.data
# Edit passwords; set POSTGRES_BIND=10.0.0.20 and REDIS_BIND=10.0.0.20
docker compose -f docker-compose.data.yml --env-file .env.data up -d
```

### C. App servers

```bash
scp scripts/hetzner-bootstrap.sh root@app-1:
ssh root@app-1 ./hetzner-bootstrap.sh
# Repeat for app-2
ssh root@app-1 "cat >> /home/deploy/.ssh/authorized_keys" < ~/.ssh/id_ed25519.pub
```

### D. Repository config

1. Edit **`config/deploy.yml`**: image org, domain, server IPs.
2. **DNS:** domain → Load Balancer IP (production) or app-1 (pilot).
3. **GitHub Actions secrets** — see [CI/CD](#cicd) below.

### E. First deploy

```bash
gem install kamal
cp .kamal/secrets.example .kamal/secrets
kamal setup && kamal deploy
kamal app exec -i 'node scripts/setup-admin.js'
```

---

## Production environment variables

| Variable | Production value |
|----------|------------------|
| `PG_POOL_MIN` | `5` |
| `PG_POOL_MAX` | `40` (per instance; 2×40 = 80 total) |
| `REDIS_URL` | **Required** with 2 app servers |
| `FRONTEND_URL` | Your HTTPS URL |
| `ALLOWED_ORIGINS` | Same |
| `RATE_LIMIT_MAX_REQUESTS` | `1000` |

Postgres: `max_connections=150` in `infra/docker-compose.data.yml`.

Pool rule: `(app_instances × PG_POOL_MAX) < postgres max_connections × 0.8`

---

## Pricing (2026)

Hetzner raised cloud prices **1 April 2026** (~30–37% in EU). A further adjustment for **new orders** is effective **15 June 2026** (existing servers keep their rate until rescale).

| Item | Pre-Apr 2026 | Apr 2026 (EU) |
|------|--------------|---------------|
| CPX32 (4 vCPU, 8 GB) | ~€10.49 | **€13.99** |
| CCX23 (dedicated 4 vCPU, 16 GB) | ~€23.99 | **€31.49** |
| CX33 (4 vCPU, 8 GB) | ~€4.99 | **€6.49** |
| LB11 | ~€5.39 | **€7.49** |

Official tables: [Hetzner price adjustment docs](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/) · [June 2026 FAQ](https://docs.hetzner.com/general/infrastructure-and-availability/faq-standardization-and-price-adjustment/).

**Pilot estimate:** ~€20–25/month. **Production (2 app + CCX23 + LB):** ~€65–75/month.

---

## Scaling

| Step | Action |
|------|--------|
| Pilot → more users | Stay on pilot until ~50 active; then add app-2 + LB |
| More users (~250–300) | Add app-3 in `deploy.yml`; add LB target |
| DB pressure | Resize CCX23 → CCX33; or lower `PG_POOL_MAX` |
| Redis pressure | Resize data server |

---

## CI/CD

Workflow: `.github/workflows/hetzner-deploy.yml`

| Trigger | Deploy target |
|---------|----------------|
| Push to `main` (after CI passes) | **pilot** (`kamal deploy -d pilot`) |
| Manual **Actions → Hetzner Deploy** | Choose `pilot` or `production` |

**Why pilot in CI by default:** GitHub runners are on the public internet. They **cannot SSH to private Hetzner IPs** (`10.0.0.x`). Pilot uses the app server **public IP** in `config/deploy.pilot.yml`. Production CI works only when `config/deploy.yml` lists **reachable** app IPs or you add a self-hosted runner in your Hetzner network.

**Local deploy (same as CI pilot):**

```bash
npm run deploy:hetzner:pilot
```

**GitHub secrets (required for CI deploy):**

| Secret | Notes |
|--------|--------|
| `KAMAL_SSH_PRIVATE_KEY` | Private key matching `deploy@` on the app server (same key you use locally) |
| `JWT_SECRET` | Also used by CI test jobs |
| `DATABASE_URL`, `REDIS_URL` | Same values as `.kamal/secrets` |
| `FRONTEND_URL`, `ALLOWED_ORIGINS` | e.g. `https://colabora.local-correspondent.com` |
| `CONTACT_EMAIL`, `SITE_OPERATOR_NAME`, `SITE_OPERATOR_ADDRESS` | Pilot legal pages |
| `KAMAL_REGISTRY_PASSWORD` | Optional — omit to use `GITHUB_TOKEN` for GHCR |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Optional |

**Common CI failures:**

| Symptom | Cause | Fix |
|---------|--------|-----|
| Hetzner Deploy: SSH timeout | Private IP in deploy config | Use pilot in CI or public IPs in `deploy.yml` |
| Hetzner Deploy: permission denied | Wrong/missing `KAMAL_SSH_PRIVATE_KEY` | Add secret; must match `deploy` user on server |
| Hetzner Deploy never runs | **CI/CD Pipeline** failed first | Fix failing test/lint job; deploy only runs after green CI |
| CI/CD: JWT / tests fail | `JWT_SECRET` not in GitHub secrets | Add repo secret `JWT_SECRET` |
| Local works, CI doesn’t | Windows SSH key path in `deploy.yml` | Removed — use `ssh-add` locally, secret in CI |

---

## Operations

```bash
kamal app logs -d pilot          # or omit -d pilot for production
kamal app details
kamal app exec -i 'bash'
kamal rollback
```

### Backups (data server)

```bash
# Automated (pilot):
./scripts/hetzner-install-backup-cron.sh

# Manual:
docker exec $(docker ps -qf name=postgres) pg_dump -U colabora colabora | gzip > /var/backups/colabora/colabora-$(date +%F).sql.gz
```

Store copies off-server when possible. Restore: `docs/runbooks/backup-restore.md`.

---

## Load balancer + Kamal proxy

Kamal installs **kamal-proxy** with Let's Encrypt for `proxy.host`.

- **Pilot:** DNS → app-1 public IP; no LB.
- **Production:** Hetzner LB TCP 443 → each app:443; DNS → LB.

Health check: `GET /api/health/ready`

---

## Troubleshooting

| Issue | Check |
|-------|--------|
| Live updates missing | Same URL for all users? WebSocket errors in browser console? |
| Missing across app servers (prod) | `REDIS_URL` set? Redis reachable? |
| `Connection pool exhausted` | Lower `PG_POOL_MAX` or resize DB |
| GHCR pull failed | Package visibility; `KAMAL_REGISTRY_PASSWORD` |
| CORS errors | `FRONTEND_URL` and `ALLOWED_ORIGINS` match browser URL |
| Migrations failed | `kamal app logs`; `kamal app exec 'npm run db:migrate'` |
| SSL failed | DNS → server; ports 80/443 open |

---

## Files in this repo

| Path | Purpose |
|------|---------|
| `config/deploy.yml` | Kamal production (2 app servers) |
| `config/deploy.pilot.yml` | Pilot overlay (1 app server) |
| `config/deploy.staging.yml` | Staging overlay |
| `.kamal/secrets.example` | Secret template |
| `infra/docker-compose.data.yml` | Postgres + Redis (production data server) |
| `infra/docker-compose.data.pilot.yml` | Postgres + Redis (pilot CX33) |
| `scripts/hetzner-bootstrap.sh` | Prepare app servers |
| `scripts/hetzner-install-backup-cron.sh` | Daily backup cron on data-1 |
| `.github/workflows/hetzner-deploy.yml` | CI deploy (production) |
| `docs/active/HETZNER_PILOT_CHECKLIST.md` | **Start here for pilot** |

---

## Optional: email & video

- **Email (invites):** Resend — see below and `docs/active/EMAIL_SETUP_GUIDE.md`
- **Video:** Jitsi — set `VIDEO_PROVIDER=jitsi` when ready

### Email checklist (verified domain)

1. Resend dashboard → domain shows **Verified**
2. `.kamal/secrets` (and GitHub secrets): `RESEND_API_KEY`, `RESEND_FROM_EMAIL=noreply@<verified-domain>`
3. `FRONTEND_URL=https://colabora.local-correspondent.com` (invitation links)
4. Redeploy: `npm run deploy:hetzner:pilot`
5. Test: `kamal app exec -d pilot 'node scripts/test-email-setup.js --test-email=YOUR@EMAIL.com'`
6. App test: org → invite member → check [resend.com/emails](https://resend.com/emails)

---

## Staging (single server)

Edit `config/deploy.staging.yml` and run `kamal deploy -d staging`. For a real group pilot, prefer **`deploy.pilot.yml`** (includes legal env and pool tuning).
