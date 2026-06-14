#!/bin/bash
# Script to check Fly.io database logs for connection issues
# Usage: ./scripts/check-fly-db-logs.sh [database-app-name]

DB_APP_NAME="${1:-colabora-app-db}"

echo "🔍 Checking Fly.io Database Logs"
echo "=================================="
echo ""
echo "Database app: $DB_APP_NAME"
echo ""

# Check if fly CLI is available
if ! command -v fly &> /dev/null; then
    echo "❌ Fly CLI not found. Install it from: https://fly.io/docs/getting-started/installing-flyctl/"
    exit 1
fi

# Check database status
echo "1. Checking database status..."
fly status --app "$DB_APP_NAME" 2>&1
echo ""

# Check recent logs for connection errors
echo "2. Checking recent logs for connection errors..."
echo "   (Looking for: connection, terminated, refused, timeout, error)"
echo ""
fly logs --app "$DB_APP_NAME" -n 100 2>&1 | grep -i -E "(connection|terminated|refused|timeout|error|failed)" | head -20
echo ""

# Check for specific PostgreSQL errors
echo "3. Checking for PostgreSQL-specific errors..."
echo ""
fly logs --app "$DB_APP_NAME" -n 200 2>&1 | grep -i -E "(postgres|authentication|password|database)" | head -20
echo ""

# Check database metrics/health
echo "4. Database app information..."
fly info --app "$DB_APP_NAME" 2>&1
echo ""

echo "✅ Log check complete"
echo ""
echo "To view live logs: fly logs --app $DB_APP_NAME"
echo "To SSH into database: fly ssh console --app $DB_APP_NAME"
