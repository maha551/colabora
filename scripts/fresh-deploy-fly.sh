#!/bin/bash
# Fresh Deployment Script for Fly.io
# Drops and recreates database, then deploys app

set -e  # Exit on error

echo "═══════════════════════════════════════════════════════════"
echo "  Fresh Deployment - Fly.io"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Configuration
APP_NAME="colabora-app"
DB_NAME="colabora"  # Database name (not app name)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Fly CLI
if ! command -v fly &> /dev/null; then
    echo -e "${RED}❌ Fly CLI not found!${NC}"
    echo "Install from: https://fly.io/docs/flyctl/installing/"
    exit 1
fi

# Check authentication
echo "🔐 Checking authentication..."
if ! fly auth whoami &> /dev/null; then
    echo -e "${YELLOW}⚠️  Not logged in. Please login:${NC}"
    fly auth login
fi

echo -e "${GREEN}✅ Authenticated as: $(fly auth whoami)${NC}"
echo ""

# Check if app exists
echo "📱 Checking if app exists..."
if ! fly status --app "$APP_NAME" &> /dev/null; then
    echo -e "${RED}❌ App '$APP_NAME' not found!${NC}"
    echo "Create it first with: fly launch --name $APP_NAME"
    exit 1
fi
echo -e "${GREEN}✅ App found: $APP_NAME${NC}"
echo ""

# Get DATABASE_URL to find database app
echo "🔍 Finding database connection..."
DATABASE_URL=$(fly secrets list --app "$APP_NAME" 2>/dev/null | grep "DATABASE_URL" | awk '{print $2}' || echo "")

if [ -z "$DATABASE_URL" ]; then
    echo -e "${YELLOW}⚠️  DATABASE_URL not found in secrets${NC}"
    echo "Listing PostgreSQL databases..."
    fly postgres list
    echo ""
    read -p "Enter your database app name: " DB_APP_NAME
else
    # Extract database app name from DATABASE_URL
    # Format: postgresql://user:pass@db-app.flycast:5432/dbname
    DB_APP_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\)\.flycast.*/\1/p' || echo "")
    
    if [ -z "$DB_APP_NAME" ]; then
        # Try alternative format
        DB_APP_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p' || echo "")
    fi
    
    if [ -z "$DB_APP_NAME" ]; then
        echo -e "${YELLOW}⚠️  Could not extract database app name from DATABASE_URL${NC}"
        echo "DATABASE_URL format: $DATABASE_URL"
        read -p "Enter your database app name: " DB_APP_NAME
    else
        echo -e "${GREEN}✅ Found database app: $DB_APP_NAME${NC}"
    fi
fi

echo ""

# Confirm action
echo -e "${YELLOW}⚠️  WARNING: This will delete the database '$DB_NAME' and all its data!${NC}"
echo -e "${YELLOW}   This action cannot be undone!${NC}"
echo ""
read -p "Are you sure you want to continue? (type 'yes' to confirm): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "❌ Aborted"
    exit 0
fi

echo ""

# Step 1: Connect to PostgreSQL and drop/recreate database
echo "🗄️  Step 1: Dropping and recreating database..."
echo ""

# Create SQL script
SQL_SCRIPT=$(cat <<EOF
-- Connect to postgres database
\c postgres

-- Drop existing database
DROP DATABASE IF EXISTS $DB_NAME;

-- Create fresh database
CREATE DATABASE $DB_NAME;

-- List databases to verify
\l

-- Exit
\q
EOF
)

echo "Connecting to PostgreSQL on $DB_APP_NAME..."
echo "Executing: DROP DATABASE IF EXISTS $DB_NAME; CREATE DATABASE $DB_NAME;"
echo ""

# Execute via SSH
fly ssh console --app "$DB_APP_NAME" -C "psql -U postgres -d postgres -c \"DROP DATABASE IF EXISTS $DB_NAME;\" -c \"CREATE DATABASE $DB_NAME;\" -c \"\\l\""

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Database '$DB_NAME' recreated successfully${NC}"
else
    echo -e "${RED}❌ Failed to recreate database${NC}"
    echo "You may need to connect manually:"
    echo "  fly ssh console --app $DB_APP_NAME"
    echo "  psql -U postgres -d postgres"
    echo "  DROP DATABASE IF EXISTS $DB_NAME;"
    echo "  CREATE DATABASE $DB_NAME;"
    exit 1
fi

echo ""

# Step 2: Deploy application
echo "🚀 Step 2: Deploying application..."
echo ""

read -p "Deploy now? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Deploying $APP_NAME..."
    fly deploy --app "$APP_NAME"
    
    if [ $? -eq 0 ]; then
        echo ""
        echo -e "${GREEN}✅ Deployment successful!${NC}"
        echo ""
        echo "The application will:"
        echo "  ✅ Create all tables automatically"
        echo "  ✅ Run migrations (including schema fixes)"
        echo "  ✅ Initialize with correct schema"
        echo ""
        echo "Check logs: fly logs --app $APP_NAME"
    else
        echo -e "${RED}❌ Deployment failed${NC}"
        exit 1
    fi
else
    echo "Skipping deployment. Run manually with:"
    echo "  fly deploy --app $APP_NAME"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo -e "${GREEN}✅ Fresh deployment complete!${NC}"
echo "═══════════════════════════════════════════════════════════"
