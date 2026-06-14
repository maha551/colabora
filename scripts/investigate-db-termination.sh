#!/bin/bash
# Script to investigate database connection termination issues
# This checks database server logs and configuration

DB_APP_NAME="${1:-colabora-app-db}"

echo "🔍 Investigating Database Connection Termination"
echo "================================================"
echo ""
echo "Database app: $DB_APP_NAME"
echo ""

# Check database status
echo "1. Database App Status:"
echo "----------------------"
fly status --app "$DB_APP_NAME" 2>&1
echo ""

# Check recent logs for termination patterns
echo "2. Recent Connection Terminations:"
echo "----------------------------------"
fly logs --app "$DB_APP_NAME" -n 200 2>&1 | grep -i -E "(terminated|closed|timeout|idle|connection)" | head -30
echo ""

# Check for PostgreSQL configuration issues
echo "3. PostgreSQL Configuration Issues:"
echo "------------------------------------"
fly logs --app "$DB_APP_NAME" -n 200 2>&1 | grep -i -E "(max_connections|idle_in_transaction|statement_timeout|tcp_keepalive)" | head -20
echo ""

# Check for authentication/authorization issues
echo "4. Authentication/Authorization Issues:"
echo "---------------------------------------"
fly logs --app "$DB_APP_NAME" -n 200 2>&1 | grep -i -E "(authentication|authorization|permission|denied|failed)" | head -20
echo ""

# Check database server errors
echo "5. Database Server Errors:"
echo "-------------------------"
fly logs --app "$DB_APP_NAME" -n 200 2>&1 | grep -i -E "(error|fatal|panic|crash)" | head -20
echo ""

# Check connection statistics
echo "6. Connection Statistics (if available):"
echo "----------------------------------------"
fly logs --app "$DB_APP_NAME" -n 200 2>&1 | grep -i -E "(connections|active|idle|waiting)" | head -20
echo ""

echo "✅ Investigation complete"
echo ""
echo "Next steps:"
echo "  - Check database configuration: fly ssh console --app $DB_APP_NAME -C 'psql -c \"SHOW ALL;\"'"
echo "  - Check active connections: fly ssh console --app $DB_APP_NAME -C 'psql -c \"SELECT * FROM pg_stat_activity;\"'"
echo "  - Check connection limits: fly ssh console --app $DB_APP_NAME -C 'psql -c \"SHOW max_connections;\"'"
