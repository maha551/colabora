#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/db/restore-from-backup.sh --backup <file.sql|file.sql.gz> [--database-url <postgres-url>] [--execute]

Safe defaults:
  - Dry-run by default (no restore is executed).
  - Refuses to run against production-like hosts unless --allow-production is set.

Examples:
  scripts/db/restore-from-backup.sh --backup backups/latest.sql.gz
  scripts/db/restore-from-backup.sh --backup backups/latest.sql --execute
EOF
}

BACKUP_FILE=""
DATABASE_URL_INPUT="${DATABASE_URL:-}"
EXECUTE=0
ALLOW_PRODUCTION=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backup)
      BACKUP_FILE="${2:-}"
      shift 2
      ;;
    --database-url)
      DATABASE_URL_INPUT="${2:-}"
      shift 2
      ;;
    --execute)
      EXECUTE=1
      shift
      ;;
    --allow-production)
      ALLOW_PRODUCTION=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$BACKUP_FILE" ]]; then
  echo "Missing required --backup argument." >&2
  usage
  exit 1
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

if [[ -z "$DATABASE_URL_INPUT" ]]; then
  echo "DATABASE_URL is required (pass --database-url or export DATABASE_URL)." >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required but was not found in PATH." >&2
  exit 1
fi

if [[ "$DATABASE_URL_INPUT" == *"prod"* || "$DATABASE_URL_INPUT" == *"flycast"* ]]; then
  if [[ "$ALLOW_PRODUCTION" -ne 1 ]]; then
    echo "Refusing to restore against production-like target without --allow-production." >&2
    exit 1
  fi
fi

echo "Restore target: $DATABASE_URL_INPUT"
echo "Backup file:    $BACKUP_FILE"

if [[ "$EXECUTE" -ne 1 ]]; then
  echo "Dry-run mode: no changes applied. Re-run with --execute to perform restore."
  exit 0
fi

if [[ "$BACKUP_FILE" == *.gz ]]; then
  echo "Executing restore from compressed backup..."
  gunzip -c "$BACKUP_FILE" | psql "$DATABASE_URL_INPUT" -v ON_ERROR_STOP=1
else
  echo "Executing restore from SQL backup..."
  psql "$DATABASE_URL_INPUT" -v ON_ERROR_STOP=1 -f "$BACKUP_FILE"
fi

echo "Restore completed."
