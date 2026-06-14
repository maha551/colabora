#!/bin/bash
# Script to diagnose Fly.io database server health issues
# Usage: ./scripts/diagnose-db-server-health.sh [database-app-name]

DB_APP_NAME="${1:-colabora-app-db}"

echo "🔍 Database Server Health Diagnostic"
echo "====================================="
echo ""
echo "Database app: $DB_APP_NAME"
echo ""

# Check if fly CLI is available
if ! command -v fly &> /dev/null; then
    echo "❌ Fly CLI not found. Install it from: https://fly.io/docs/getting-started/installing-flyctl/"
    exit 1
fi

# 1. Check app status
echo "1. Database App Status:"
echo "----------------------"
fly status --app "$DB_APP_NAME" 2>&1
echo ""

# 2. Check for crashes/restarts
echo "2. Recent Restarts/Crashes:"
echo "--------------------------"
fly status --app "$DB_APP_NAME" 2>&1 | grep -i -E "(restart|crash|error|failed)" || echo "   No obvious restart indicators in status"
echo ""

# 3. Check for repmgrd errors (replication manager)
echo "3. Replication Manager Errors (repmgrd):"
echo "----------------------------------------"
fly logs --app "$DB_APP_NAME" -n 500 2>&1 | grep -i -E "(repmgrd|replication)" | grep -i -E "(error|failed|refused|lost|unable)" | tail -20
if [ $? -ne 0 ]; then
    echo "   No recent repmgrd errors found"
fi
echo ""

# 4. Check for connection refused errors
echo "4. Connection Refused Errors:"
echo "----------------------------"
fly logs --app "$DB_APP_NAME" -n 500 2>&1 | grep -i -E "(connection refused|connect.*refused|dial.*refused)" | tail -20
if [ $? -ne 0 ]; then
    echo "   No connection refused errors found"
fi
echo ""

# 5. Check for PostgreSQL server errors
echo "5. PostgreSQL Server Errors:"
echo "----------------------------"
fly logs --app "$DB_APP_NAME" -n 500 2>&1 | grep -i -E "(postgres.*error|fatal|panic|crash|server.*down)" | tail -20
if [ $? -ne 0 ]; then
    echo "   No obvious PostgreSQL server errors found"
fi
echo ""

# 6. Check for node recovery issues
echo "6. Node Recovery Status Issues:"
echo "------------------------------"
fly logs --app "$DB_APP_NAME" -n 500 2>&1 | grep -i -E "(recovery|unable to determine|node.*status)" | tail -20
if [ $? -ne 0 ]; then
    echo "   No recovery status issues found"
fi
echo ""

# 7. Check recent activity pattern
echo "7. Recent Activity Pattern (last 50 lines):"
echo "------------------------------------------"
fly logs --app "$DB_APP_NAME" -n 50 2>&1 | tail -20
echo ""

# 8. Check app metrics
echo "8. App Metrics:"
echo "--------------"
fly metrics --app "$DB_APP_NAME" 2>&1 | head -30
echo ""

# Summary and recommendations
echo "=========================================="
echo "Summary and Recommendations:"
echo "=========================================="
echo ""

# Check if there are repmgrd errors
if fly logs --app "$DB_APP_NAME" -n 500 2>&1 | grep -qi "repmgrd.*error\|connection refused.*5433"; then
    echo "⚠️  CRITICAL: Database server appears to be having issues"
    echo ""
    echo "The replication manager (repmgrd) cannot connect to the database node."
    echo "This indicates the PostgreSQL server may be:"
    echo "  - Not running or crashed"
    echo "  - Restarting repeatedly"
    echo "  - Having network issues"
    echo "  - In an unhealthy state"
    echo ""
    echo "Recommended actions:"
    echo "  1. Restart the database app:"
    echo "     First try: fly mpg restart --app $DB_APP_NAME (if managed)"
    echo "     Or use: fly apps restart $DB_APP_NAME (if unmanaged)"
    echo "     Check type: fly postgres list"
    echo ""
    echo "  2. Check if it's a single-node issue (if using cluster):"
    echo "     fly pg status --app $DB_APP_NAME"
    echo "     fly status --app $DB_APP_NAME"
    echo ""
    echo "  3. Check database app resources:"
    echo "     fly scale show --app $DB_APP_NAME"
    echo ""
    echo "  4. If issues persist, contact Fly.io support with:"
    echo "     - App name: $DB_APP_NAME"
    echo "     - Region: $(fly status --app $DB_APP_NAME 2>&1 | grep -i region | head -1)"
    echo "     - Recent logs: fly logs --app $DB_APP_NAME -n 200"
    echo ""
else
    echo "✅ No obvious database server errors detected in recent logs"
    echo ""
    echo "If connection issues persist, try:"
    echo "  1. Restart database app:"
    echo "     fly mpg restart --app $DB_APP_NAME (managed)"
    echo "     OR fly apps restart $DB_APP_NAME (unmanaged)"
    echo "  2. Check application connection code"
    echo "  3. Verify DATABASE_URL is correct"
fi

echo ""
echo "✅ Diagnostic complete"
