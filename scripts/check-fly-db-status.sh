#!/bin/bash
# Script to check Fly.io database status and health
# Usage: ./scripts/check-fly-db-status.sh [database-app-name]

DB_APP_NAME="${1:-colabora-app-db}"

echo "🔍 Fly.io Database Status Check"
echo "=============================="
echo ""
echo "Database app: $DB_APP_NAME"
echo ""

# Check if fly CLI is available
if ! command -v fly &> /dev/null; then
    echo "❌ Fly CLI not found. Install it from: https://fly.io/docs/getting-started/installing-flyctl/"
    exit 1
fi

# Check if app exists
echo "1. Checking if database app exists..."
if ! fly status --app "$DB_APP_NAME" &> /dev/null; then
    echo "❌ Database app '$DB_APP_NAME' not found or not accessible"
    echo ""
    echo "Available PostgreSQL databases:"
    fly postgres list 2>&1 | grep -E "(NAME|colabora)" || echo "   (none found)"
    exit 1
fi
echo "✅ Database app exists"
echo ""

# Get detailed status
echo "2. Database status:"
fly status --app "$DB_APP_NAME"
echo ""

# Get app info
echo "3. Database app information:"
fly info --app "$DB_APP_NAME"
echo ""

# Check if database is attached to main app
echo "4. Checking database attachment..."
MAIN_APP="${FLY_APP_NAME:-colabora-app}"
if fly postgres list 2>&1 | grep -q "$DB_APP_NAME"; then
    echo "✅ Database found in PostgreSQL list"
    if fly secrets list --app "$MAIN_APP" 2>&1 | grep -q "DATABASE_URL"; then
        echo "✅ DATABASE_URL secret is set in $MAIN_APP"
    else
        echo "⚠️  DATABASE_URL secret not found in $MAIN_APP"
        echo "   Attach with: fly postgres attach --app $MAIN_APP $DB_APP_NAME"
    fi
else
    echo "⚠️  Database not found in PostgreSQL list"
fi
echo ""

# Check database metrics
echo "5. Recent database metrics (if available):"
fly metrics --app "$DB_APP_NAME" 2>&1 | head -20
echo ""

echo "✅ Status check complete"
echo ""
echo "Next steps:"
echo "  - View logs: fly logs --app $DB_APP_NAME"
echo "  - SSH into database: fly ssh console --app $DB_APP_NAME"
echo "  - Run diagnostics: npm run diagnose:db"
