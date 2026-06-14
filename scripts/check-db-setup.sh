#!/bin/bash
# Script to check database setup and identify the correct app name
# Usage: ./scripts/check-db-setup.sh

echo "🔍 Checking Database Setup"
echo "========================="
echo ""

# Check if fly CLI is available
if ! command -v fly &> /dev/null; then
    echo "❌ Fly CLI not found"
    exit 1
fi

echo "1. Checking PostgreSQL databases:"
echo "---------------------------------"
fly postgres list 2>&1
echo ""

echo "2. Checking all apps:"
echo "--------------------"
fly apps list 2>&1 | grep -i -E "(colabora|postgres|db)" || fly apps list 2>&1 | head -20
echo ""

echo "3. Checking if colabora-app-db exists:"
echo "--------------------------------------"
if fly status --app colabora-app-db &> /dev/null; then
    echo "✅ colabora-app-db exists"
    fly status --app colabora-app-db 2>&1 | head -10
else
    echo "❌ colabora-app-db not found"
fi
echo ""

echo "4. Checking DATABASE_URL in main app:"
echo "-------------------------------------"
if fly secrets list --app colabora-app 2>&1 | grep -q "DATABASE_URL"; then
    echo "✅ DATABASE_URL is set"
    DB_URL=$(fly secrets list --app colabora-app 2>&1 | grep DATABASE_URL | head -1)
    # Extract hostname from DATABASE_URL
    if echo "$DB_URL" | grep -q "flycast\|fly.dev"; then
        HOST=$(echo "$DB_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
        echo "   Database host: $HOST"
    fi
else
    echo "❌ DATABASE_URL not found"
fi
echo ""

echo "5. Testing database app commands:"
echo "---------------------------------"
echo "Testing: fly pg restart colabora-app-db"
fly pg restart colabora-app-db 2>&1 | head -5 || echo "   Command failed"
echo ""

echo "6. Checking database app configuration:"
echo "---------------------------------------"
if fly status --app colabora-app-db &> /dev/null; then
    fly config show --app colabora-app-db 2>&1 | grep -i -E "(postgres|database|image)" | head -10 || echo "   Could not read config"
fi
echo ""

echo "✅ Setup check complete"
echo ""
echo "Summary:"
echo "  - If database is in 'fly postgres list', it's managed"
echo "  - If not, it's an unmanaged app running PostgreSQL"
echo "  - Check the actual app name from 'fly apps list'"
