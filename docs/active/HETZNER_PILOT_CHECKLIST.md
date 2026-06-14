# Hetzner pilot checklist (10–50 users)

Use this checklist for the **first group test** (this week → end of month). Full reference: [HETZNER_DEPLOYMENT.md](./HETZNER_DEPLOYMENT.md).

**Target:** 10–50 accounts, real-time collaboration on one app server. **Provision before 2026-06-15** to lock current Hetzner cloud prices for new servers.

---

## Phase 0 — Before you start (local)

- [ ] Domain ready (e.g. `colabora.yourdomain.com`)
- [ ] GitHub repo can build Docker image (GHCR package name = lowercase org)
- [ ] Ruby + Kamal on laptop: `gem install kamal`
- [ ] SSH key pair for `deploy` user
- [ ] Read test-environment legal copy: `/info/terms`, `/info/privacy`

---

## Phase 1 — Hetzner Cloud console (~30 min)

Region: **fsn1** (Frankfurt) or **nbg1** (Nuremberg).

| Step | Action |
|------|--------|
| 1 | Create project (e.g. `colabora-pilot`) |
| 2 | Create **private network** `10.0.0.0/16` |
| 3 | Create **data-1**: **CX33** (4 vCPU, 8 GB) → private IP **10.0.0.20** |
| 4 | Create **app-1**: **CPX32** (4 vCPU, 8 GB) → private IP **10.0.0.11** |
| 5 | **Do not** create a load balancer yet (single app) |

### Firewalls

**data-1 firewall**

- SSH (22) from your IP only
- TCP 5432, 6379 from **10.0.0.11/32** only (app-1)

**app-1 firewall**

- SSH (22) from your IP only
- TCP 80, 443 from **0.0.0.0/0** (public HTTPS)

---

## Phase 2 — Data server (`data-1`)

```bash
ssh root@<data-1-public-ip>
apt update && apt install -y docker.io docker-compose-plugin git
git clone <your-repo-url> colabora && cd colabora/infra
cp .env.data.example .env.data
```

Edit `.env.data`:

```env
POSTGRES_PASSWORD=<openssl rand -hex 24>
REDIS_PASSWORD=<openssl rand -hex 24>
POSTGRES_BIND=10.0.0.20
REDIS_BIND=10.0.0.20
```

Start Postgres + Redis (pilot-tuned compose):

```bash
docker compose -f docker-compose.data.pilot.yml --env-file .env.data up -d
docker compose -f docker-compose.data.pilot.yml ps
```

Install daily backups:

```bash
chmod +x ../scripts/hetzner-install-backup-cron.sh
../scripts/hetzner-install-backup-cron.sh
```

Save connection strings for Kamal:

```text
DATABASE_URL=postgresql://colabora:<POSTGRES_PASSWORD>@10.0.0.20:5432/colabora
REDIS_URL=redis://:<REDIS_PASSWORD>@10.0.0.20:6379/0
```

---

## Phase 3 — App server (`app-1`)

```bash
scp scripts/hetzner-bootstrap.sh root@<app-1-public-ip>:
ssh root@<app-1-public-ip> ./hetzner-bootstrap.sh
ssh root@<app-1-public-ip> "mkdir -p /home/deploy/.ssh && cat >> /home/deploy/.ssh/authorized_keys" < ~/.ssh/id_ed25519.pub
```

Test SSH as deploy:

```bash
ssh deploy@<app-1-public-ip>
```

---

## Phase 4 — Repository config

### `config/deploy.yml` (base)

- [ ] `image: ghcr.io/<your-github-org-lowercase>/colabora-app`
- [ ] `registry.username: <your-github-org-lowercase>`
- [ ] `servers.web.hosts` — can leave two IPs; pilot overlay overrides to one host

### `config/deploy.pilot.yml`

- [ ] `servers.web.hosts` → `10.0.0.11` (or app-1 **public** IP if Kamal runs from outside Hetzner network)
- [ ] `proxy.host` → your domain (e.g. `colabora.yourdomain.com`)

### DNS

- [ ] `A` record: `colabora.yourdomain.com` → **app-1 public IP** (not load balancer)

### `.kamal/secrets` (local, never commit)

```bash
cp .kamal/secrets.example .kamal/secrets
```

Fill in:

| Secret | Value |
|--------|--------|
| `KAMAL_REGISTRY_PASSWORD` | GHCR PAT with `read:packages` + `write:packages`, or leave empty and use `gh auth token` |
| `DATABASE_URL` | from Phase 2 |
| `REDIS_URL` | from Phase 2 |
| `JWT_SECRET` | `openssl rand -hex 32` |
| `FRONTEND_URL` | `https://colabora.yourdomain.com` |
| `ALLOWED_ORIGINS` | same as `FRONTEND_URL` |
| `CONTACT_EMAIL` | support email for legal/contact form |
| `SITE_OPERATOR_NAME` | operator name for imprint |
| `SITE_OPERATOR_ADDRESS` | operator address for imprint |
| `RESEND_API_KEY` | optional — needed for invite/password emails |
| `RESEND_FROM_EMAIL` | optional — verified sender in Resend |

---

## Phase 5 — First deploy

From repo root on your laptop:

```bash
# Ensure GHCR can pull (first time: push an image)
kamal setup -d pilot
kamal deploy -d pilot
```

Or:

```bash
npm run deploy:hetzner:pilot:setup
npm run deploy:hetzner:pilot
```

Create admin:

```bash
kamal app exec -d pilot -i 'node scripts/setup-admin.js'
```

Change admin password after first login.

---

## Phase 6 — Smoke tests (required before inviting users)

| # | Test | Pass? |
|---|------|-------|
| 1 | `curl -sS https://colabora.yourdomain.com/api/health/ready` → HTTP 200 | |
| 2 | Open `/info/terms` and `/info/privacy` — test disclaimers visible | |
| 3 | Register new user — legal checkbox required | |
| 4 | Login as admin | |
| 5 | Create organization + document | |
| 6 | **Two browsers**, same doc — edit paragraph; other sees update within ~5 s | |
| 7 | Create proposal + vote in second browser | |
| 8 | Invite flow (if Resend configured) | |

Remote health check:

```bash
FRONTEND_URL=https://colabora.yourdomain.com npm run health-check
```

(Uses local script against public URL if adapted; or use `curl` above.)

---

## Phase 7 — Open to pilot group (10–50)

- [ ] Send URL + short note: **test environment**, no confidential data, [terms](/info/terms)
- [ ] One shared organization or invite per team — your choice
- [ ] Monitor: `kamal app logs -d pilot` during first session
- [ ] Confirm backup file exists on data-1: `ls -la /var/backups/colabora/`

---

## Phase 8 — If successful (after ~2 weeks)

| Need | Action |
|------|--------|
| More concurrent users (~100+) | Add **app-2** + Hetzner LB; switch to `config/deploy.yml` (2 hosts) |
| DB slow | Resize data-1 CX33 → CX43 |
| Keep pilot running | No change required for 50 users on current stack |

---

## Quick commands

```bash
kamal app logs -d pilot
kamal app details -d pilot
kamal deploy -d pilot          # redeploy
kamal rollback -d pilot        # previous release
kamal app exec -d pilot 'npm run db:migrate'
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Live edits not syncing | Same URL for all users? Check browser console for WebSocket errors |
| `Connection refused` to Postgres | Firewall on data-1; `POSTGRES_BIND` must be private IP |
| SSL / certificate failed | DNS → app-1; ports 80+443 open; wait 2–5 min after first deploy |
| GHCR pull denied | Make package public or set `KAMAL_REGISTRY_PASSWORD` |
| CORS errors | `FRONTEND_URL` and `ALLOWED_ORIGINS` must exactly match browser URL |
