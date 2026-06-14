#!/bin/bash
# Script to check PostgreSQL database configuration that might affect connections
# Usage: ./scripts/check-db-config.sh [database-app-name]

DB_APP_NAME="${1:-colabora-app-db}"

echo "🔍 Checking PostgreSQL Configuration"
echo "===================================="
echo ""
echo "Database app: $DB_APP_NAME"
echo ""

echo "Connecting to database to check configuration..."
echo ""

# SSH into database and check key configuration settings
fly ssh console --app "$DB_APP_NAME" -C "
psql \$DATABASE_URL <<EOF
-- Connection settings
SELECT 
    name, 
    setting, 
    unit,
    short_desc
FROM pg_settings 
WHERE name IN (
    'max_connections',
    'superuser_reserved_connections',
    'tcp_keepalives_idle',
    'tcp_keepalives_interval',
    'tcp_keepalives_count',
    'idle_in_transaction_session_timeout',
    'statement_timeout',
    'connect_timeout',
    'tcp_user_timeout'
)
ORDER BY name;

-- Current connection count
SELECT 
    'Current Connections' as metric,
    count(*)::text as value,
    'active connections' as description
FROM pg_stat_activity
WHERE datname = current_database();

-- Connection by state
SELECT 
    state,
    count(*) as count
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY state
ORDER BY count DESC;

-- Idle connections
SELECT 
    'Idle Connections' as metric,
    count(*)::text as value,
    'idle > 1 minute' as description
FROM pg_stat_activity
WHERE datname = current_database()
    AND state = 'idle'
    AND state_change < now() - interval '1 minute';

-- Long running queries
SELECT 
    'Long Running Queries' as metric,
    count(*)::text as value,
    'running > 5 minutes' as description
FROM pg_stat_activity
WHERE datname = current_database()
    AND state = 'active'
    AND query_start < now() - interval '5 minutes';
EOF
" 2>&1

echo ""
echo "✅ Configuration check complete"
