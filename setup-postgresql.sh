#!/bin/bash

# PostgreSQL Setup Script for Colabora on Fly.io
# This script helps you set up PostgreSQL database and configure your app

set -e

APP_NAME=""
DB_NAME="colabora-db"
REGION="fra"
VM_SIZE="shared-cpu-1x"
VOLUME_SIZE=10
SKIP_DB_CREATION=false
USE_EXTERNAL=false
EXTERNAL_DB_URL=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --app-name)
            APP_NAME="$2"
            shift 2
            ;;
        --db-name)
            DB_NAME="$2"
            shift 2
            ;;
        --region)
            REGION="$2"
            shift 2
            ;;
        --vm-size)
            VM_SIZE="$2"
            shift 2
            ;;
        --volume-size)
            VOLUME_SIZE="$2"
            shift 2
            ;;
        --skip-db-creation)
            SKIP_DB_CREATION=true
            shift
            ;;
        --use-external)
            USE_EXTERNAL=true
            shift
            ;;
        --external-db-url)
            EXTERNAL_DB_URL="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--app-name NAME] [--db-name NAME] [--region REGION] [--vm-size SIZE] [--volume-size GB] [--skip-db-creation] [--use-external] [--external-db-url URL]"
            exit 1
            ;;
    esac
done

echo ""
echo "PostgreSQL Setup for Colabora"
echo "=============================="
echo ""

# Get app name from fly.toml if not provided
if [ -z "$APP_NAME" ]; then
    if [ -f "fly.toml" ]; then
        APP_NAME=$(grep -E '^app\s*=' fly.toml | sed -E "s/^app\s*=\s*['\"]([^'\"]+)['\"].*/\1/")
        if [ -n "$APP_NAME" ]; then
            echo "Using app name from fly.toml: $APP_NAME"
        fi
    fi
    
    if [ -z "$APP_NAME" ]; then
        echo "Error: App name not provided and could not determine from fly.toml"
        echo "Usage: $0 --app-name your-app-name"
        exit 1
    fi
fi

# Check Fly CLI
if ! command -v fly &> /dev/null; then
    echo "Fly CLI not found!"
    echo "Install from: https://fly.io/docs/flyctl/installing/"
    exit 1
fi

# Check authentication
echo "Checking authentication..."
if ! fly auth whoami &> /dev/null; then
    echo "Not logged in. Please login:"
    fly auth login
fi

# Check if app exists
echo ""
echo "Checking if app exists..."
if ! fly status --app "$APP_NAME" &> /dev/null; then
    echo "App '$APP_NAME' not found!"
    echo "Create it first with: fly launch --name $APP_NAME"
    exit 1
fi
echo "App found: $APP_NAME"

# Handle external database
if [ "$USE_EXTERNAL" = true ]; then
    if [ -z "$EXTERNAL_DB_URL" ]; then
        echo ""
        echo "Error: External database URL not provided!"
        echo "Usage: $0 --use-external --external-db-url 'postgresql://user:pass@host:port/db'"
        exit 1
    fi
    
    echo ""
    echo "Setting external PostgreSQL connection..."
    fly secrets set "DATABASE_URL=$EXTERNAL_DB_URL" --app "$APP_NAME"
    
    echo ""
    echo "✅ External PostgreSQL configured!"
    echo "Next step: Deploy your app with: fly deploy --app $APP_NAME"
    exit 0
fi

# Create PostgreSQL database
if [ "$SKIP_DB_CREATION" = false ]; then
    echo ""
    echo "Creating PostgreSQL database..."
    echo "  Name: $DB_NAME"
    echo "  Region: $REGION"
    echo "  VM Size: $VM_SIZE"
    echo "  Volume Size: ${VOLUME_SIZE}GB"
    echo ""
    
    # Check if database already exists
    if fly postgres list 2>&1 | grep -q "$DB_NAME"; then
        echo "Database '$DB_NAME' already exists"
        read -p "Use existing database? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Aborted"
            exit 0
        fi
    else
        echo "Creating new PostgreSQL database..."
        echo "  Using single node (cluster size: 1) for fresh deployment"
        echo "  You can scale up later with: fly postgres scale --count 3 --app $DB_NAME"
        
        # Create with single node
        # Note: fly postgres create may prompt for cluster size
        fly postgres create --name "$DB_NAME" --region "$REGION" --vm-size "$VM_SIZE" --volume-size "$VOLUME_SIZE" --initial-cluster-size 1
        
        if [ $? -ne 0 ]; then
            echo "Failed to create database"
            echo "Note: If prompted for cluster size, choose 1 for single node"
            exit 1
        fi
        echo "Database created successfully"
    fi
else
    echo "Skipping database creation (using existing)"
fi

# Attach database to app
echo ""
echo "Attaching database to app..."
fly postgres attach --app "$APP_NAME" "$DB_NAME"

if [ $? -ne 0 ]; then
    echo "Failed to attach database"
    echo "You can attach manually with: fly postgres attach --app $APP_NAME $DB_NAME"
    exit 1
fi

echo "Database attached successfully"

# Verify DATABASE_URL is set
echo ""
echo "Verifying DATABASE_URL is set..."
if fly secrets list --app "$APP_NAME" 2>&1 | grep -q "DATABASE_URL"; then
    echo "DATABASE_URL is set"
else
    echo "WARNING: DATABASE_URL not found in secrets"
    echo "The attach command should have set it automatically."
    echo "You may need to set it manually:"
    echo "  fly postgres attach --app $APP_NAME $DB_NAME"
fi

# Summary
echo ""
echo "======================================"
echo "Setup Complete!"
echo "======================================"
echo ""
echo "Next steps:"
echo "1. Deploy your app:"
echo "   fly deploy --app $APP_NAME"
echo ""
echo "2. Verify PostgreSQL connection in logs:"
echo "   fly logs --app $APP_NAME | grep -i postgresql"
echo ""
echo "3. Check health endpoint:"
echo "   curl https://$APP_NAME.fly.dev/api/health/ready"
echo ""
echo "4. Create admin user (after deployment):"
echo "   fly ssh console --app $APP_NAME"
echo "   npm run setup-admin"
echo ""

