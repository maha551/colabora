#!/usr/bin/env bash
# Install a daily Postgres backup cron on the Hetzner data server.
# Run on data-1 as root after docker compose is up:
#   ./scripts/hetzner-install-backup-cron.sh
#
# Backups: /var/backups/colabora/colabora-YYYY-MM-DD.sql.gz (kept 14 days)

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/colabora}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.data.pilot.yml}"
ENV_FILE="${ENV_FILE:-.env.data}"
KEEP_DAYS="${KEEP_DAYS:-14}"

mkdir -p "$BACKUP_DIR"

CRON_CMD="0 3 * * * cd $(pwd) && docker exec \$(docker ps -qf name=postgres) pg_dump -U colabora colabora | gzip > ${BACKUP_DIR}/colabora-\$(date +\\%F).sql.gz && find ${BACKUP_DIR} -name 'colabora-*.sql.gz' -mtime +${KEEP_DAYS} -delete"

(crontab -l 2>/dev/null | grep -v 'colabora-.*sql.gz' || true; echo "$CRON_CMD") | crontab -

echo "✅ Daily backup cron installed (03:00 UTC → ${BACKUP_DIR}, keep ${KEEP_DAYS} days)"
echo "   Test now: docker exec \$(docker ps -qf name=postgres) pg_dump -U colabora colabora | head"
