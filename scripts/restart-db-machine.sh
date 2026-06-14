#!/bin/bash
# Script to restart database machine directly (bypasses app-level commands)
# Usage: ./scripts/restart-db-machine.sh [database-app-name]

DB_APP_NAME="${1:-colabora-app-db}"

echo "🔄 Restarting Database Machine Directly"
echo "======================================="
echo ""
echo "Database app: $DB_APP_NAME"
echo ""

# Check if fly CLI is available
if ! command -v fly &> /dev/null; then
    echo "❌ Fly CLI not found"
    exit 1
fi

# Get machine ID from status
echo "1. Getting machine information..."
MACHINE_ID=$(fly status --app "$DB_APP_NAME" 2>&1 | grep -E "^[a-f0-9]+" | awk '{print $1}' | head -1)

if [ -z "$MACHINE_ID" ]; then
    echo "❌ Could not find machine ID"
    echo ""
    echo "Available machines:"
    fly machines list --app "$DB_APP_NAME" 2>&1
    exit 1
fi

echo "✅ Found machine: $MACHINE_ID"
echo ""

# Show current status
echo "2. Current machine status:"
fly status --app "$DB_APP_NAME" 2>&1 | head -5
echo ""

# Restart the machine
echo "3. Restarting machine..."
if fly machines restart "$MACHINE_ID" --app "$DB_APP_NAME" 2>&1; then
    echo ""
    echo "✅ Machine restart initiated"
    echo ""
    echo "4. Waiting for machine to come back up (30 seconds)..."
    sleep 30
    
    echo ""
    echo "5. Checking new status:"
    fly status --app "$DB_APP_NAME" 2>&1 | head -5
    echo ""
    
    echo "✅ Restart complete"
    echo ""
    echo "Note: Health checks may take a minute to pass"
    echo "Monitor with: fly status --app $DB_APP_NAME"
else
    echo ""
    echo "❌ Failed to restart machine"
    exit 1
fi
