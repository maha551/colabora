#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/db/verify-restore.sh [--database-url <postgres-url>] [--min-tables <n>]

Checks:
  - Database connectivity
  - Presence of public schema tables
  - Row counts for critical tables (if present)
EOF
}

DATABASE_URL_INPUT="${DATABASE_URL:-}"
MIN_TABLES=5

while [[ $# -gt 0 ]]; do
  case "$1" in
    --database-url)
      DATABASE_URL_INPUT="${2:-}"
      shift 2
      ;;
    --min-tables)
      MIN_TABLES="${2:-}"
      shift 2
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

if [[ -z "$DATABASE_URL_INPUT" ]]; then
  echo "DATABASE_URL is required (pass --database-url or export DATABASE_URL)." >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required but was not found in PATH." >&2
  exit 1
fi

echo "Verifying restored database at target:"
echo "  $DATABASE_URL_INPUT"

TABLE_COUNT="$(psql "$DATABASE_URL_INPUT" -tA -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")"
echo "Public schema table count: $TABLE_COUNT"

if [[ "$TABLE_COUNT" -lt "$MIN_TABLES" ]]; then
  echo "Verification failed: expected at least $MIN_TABLES public tables." >&2
  exit 1
fi

for table in users organizations documents; do
  EXISTS="$(psql "$DATABASE_URL_INPUT" -tA -c "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='${table}');")"
  if [[ "$EXISTS" == "t" ]]; then
    COUNT="$(psql "$DATABASE_URL_INPUT" -tA -c "SELECT COUNT(*) FROM ${table};")"
    echo "Table '${table}' row count: $COUNT"
  else
    echo "Table '${table}' not present in restored dataset."
  fi
done

echo "Restore verification passed."
