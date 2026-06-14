# Hetzner data layer (Postgres + Redis)

Run on a **dedicated** Hetzner server — not on Kamal app nodes.

## Pilot (CX33, 10–50 users)

```bash
cp .env.data.example .env.data
# Edit passwords; set POSTGRES_BIND and REDIS_BIND to this server's private IP (e.g. 10.0.0.20)
docker compose -f docker-compose.data.pilot.yml --env-file .env.data up -d
../scripts/hetzner-install-backup-cron.sh
```

## Production (CCX23+)

```bash
cp .env.data.example .env.data
docker compose -f docker-compose.data.yml --env-file .env.data up -d
```

**Pilot checklist:** [docs/active/HETZNER_PILOT_CHECKLIST.md](../docs/active/HETZNER_PILOT_CHECKLIST.md)  
**Full guide:** [docs/active/HETZNER_DEPLOYMENT.md](../docs/active/HETZNER_DEPLOYMENT.md)
