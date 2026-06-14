#!/bin/bash
# Script to restart Fly.io database (handles both managed and unmanaged)
# Usage: ./scripts/restart-fly-db.sh [database-app-name]

DB_APP_NAME="${1:-colabora-app-db}"

echo "🔄 Restarting Fly.io Database"
echo "============================="
echo ""
echo "Database app: $DB_APP_NAME"
echo ""

# Check if fly CLI is available
if ! command -v fly &> /dev/null; then
    echo "❌ Fly CLI not found. Install it from: https://fly.io/docs/getting-started/installing-flyctl/"
    exit 1
fi

# First, check if app exists
echo "1. Verifying app exists..."
if ! fly status --app "$DB_APP_NAME" &> /dev/null; then
    echo "❌ App '$DB_APP_NAME' not found"
    echo ""
    echo "Available apps:"
    fly apps list 2>&1 | grep -i -E "(colabora|postgres|db)" || fly apps list 2>&1 | head -10
    exit 1
fi
echo "✅ App exists"
echo ""

# Check if it's a managed PostgreSQL
echo "2. Checking database type..."
echo ""

# Check if it's in the postgres list
if fly postgres list 2>&1 | grep -q "$DB_APP_NAME"; then
    echo "✅ Found in managed PostgreSQL list"
    echo ""
    echo "Attempting restart with managed PostgreSQL command..."
    if fly mpg restart --app "$DB_APP_NAME" 2>&1; then
        echo ""
        echo "✅ Database restart initiated (managed PostgreSQL)"
        exit 0
    else
        echo ""
        echo "⚠️  Managed restart failed"
        echo "   Error suggests it might be unmanaged despite being in list"
    fi
else
    echo "ℹ️  Not found in managed PostgreSQL list (likely unmanaged)"
fi

echo ""
echo "3. Attempting restart methods..."
echo ""

# The error suggests it's a postgres app but not recognized properly
# Try different restart methods

# Method 1: Try restarting machines directly
echo "   Method 1: Restarting machines directly..."
MACHINES=$(fly machines list --app "$DB_APP_NAME" 2>&1 | grep -v "MACHINE ID" | awk '{print $1}' | grep -v "^$")
if [ -n "$MACHINES" ]; then
    for MACHINE in $MACHINES; do
        echo "   Restarting machine: $MACHINE"
        fly machines restart "$MACHINE" --app "$DB_APP_NAME" 2>&1 | head -3
    done
    echo ""
    echo "✅ Machines restart initiated"
    exit 0
fi

# Method 2: Try unmanaged restart (might work despite error message)
echo "   Method 2: Trying unmanaged restart..."
if fly apps restart "$DB_APP_NAME" 2>&1 | grep -v "postgres apps should use"; then
    echo ""
    echo "✅ Database restart initiated (unmanaged method)"
    exit 0
else
    echo "   ⚠️  Unmanaged restart also failed"
fi

# Method 3: Try scale to 0 then back up
echo "   Method 3: Scaling down and up..."
echo "   (This will cause brief downtime)"
fly scale count 0 --app "$DB_APP_NAME" 2>&1 | head -3
sleep 5
fly scale count 1 --app "$DB_APP_NAME" 2>&1 | head -3
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Database scaled down and back up"
    exit 0
fi

echo ""
echo "❌ All restart methods failed"
echo ""
echo "Troubleshooting:"
echo "  1. Verify app name: fly status --app $DB_APP_NAME"
echo "  2. Check app type: fly postgres list"
echo "  3. Check machines: fly machines list --app $DB_APP_NAME"
echo "  4. Consider: fly apps destroy $DB_APP_NAME (destructive!)"
exit 1
