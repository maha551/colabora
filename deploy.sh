#!/bin/bash

# Colabora - Complete Deployment Script for Fly.io
# PostgreSQL + Frankfurt Region
# This is the consolidated, optimal deployment script

set -e

# Default values
APP_NAME=""
REGION="fra"
DB_NAME="colabora-db"
VM_SIZE="shared-cpu-1x"
DB_VOLUME_SIZE=10
SKIP_DB_SETUP=false
USE_EXISTING_DB=false
SKIP_SECRETS=false
SKIP_DEPLOY=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --app-name)
            APP_NAME="$2"
            shift 2
            ;;
        --region)
            REGION="$2"
            shift 2
            ;;
        --db-name)
            DB_NAME="$2"
            shift 2
            ;;
        --vm-size)
            VM_SIZE="$2"
            shift 2
            ;;
        --db-volume-size)
            DB_VOLUME_SIZE="$2"
            shift 2
            ;;
        --skip-db-setup)
            SKIP_DB_SETUP=true
            shift
            ;;
        --use-existing-db)
            USE_EXISTING_DB=true
            shift
            ;;
        --skip-secrets)
            SKIP_SECRETS=true
            shift
            ;;
        --skip-deploy)
            SKIP_DEPLOY=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo ""
echo "🚀 Colabora Deployment to Fly.io"
echo "==================================="
echo "   Database: PostgreSQL"
echo "   Region: $REGION (Frankfurt)"
echo ""

# Step 1: Get app name from fly.toml if not provided
if [ -z "$APP_NAME" ]; then
    if [ -f "fly.toml" ]; then
        APP_NAME=$(grep -E '^app\s*=\s*["'\'']' fly.toml | sed -E "s/^app\s*=\s*['\"]([^'\"]+)['\"].*/\1/")
        if [ -n "$APP_NAME" ]; then
            echo "📋 Using app name from fly.toml: $APP_NAME"
        fi
    fi
    
    if [ -z "$APP_NAME" ]; then
        echo "❌ App name not found. Please provide:"
        read -p "Enter app name: " APP_NAME
        if [ -z "$APP_NAME" ]; then
            echo "App name is required"
            exit 1
        fi
    fi
fi

# Step 2: Check Fly CLI
echo ""
echo "[STEP 1] Checking Fly CLI..."
if ! command -v fly &> /dev/null; then
    if [ -f "$HOME/.fly/bin/fly" ]; then
        export PATH="$HOME/.fly/bin:$PATH"
    else
        echo "❌ Fly CLI not found. Installing..."
        curl -L https://fly.io/install.sh | sh
        export PATH="$HOME/.fly/bin:$PATH"
    fi
fi

if command -v fly &> /dev/null; then
    echo "✅ Fly CLI found"
else
    echo "❌ Fly CLI not found after installation attempt"
    exit 1
fi

# Step 3: Check authentication
echo ""
echo "[STEP 2] Checking authentication..."
if ! fly auth whoami &> /dev/null; then
    echo "🔐 Not logged in. Please login:"
    fly auth login
    if [ $? -ne 0 ]; then
        echo "❌ Login failed"
        exit 1
    fi
else
    echo "✅ Authenticated"
fi

# Step 4: Check if app exists, create if needed
echo ""
echo "[STEP 3] Checking app status..."
if fly status --app "$APP_NAME" &> /dev/null; then
    echo "✅ App exists: $APP_NAME"
    APP_EXISTS=true
else
    echo "📦 App not found. Creating new app..."
    echo "   App: $APP_NAME"
    echo "   Region: $REGION"
    
    fly launch --name "$APP_NAME" --region "$REGION" --no-deploy --copy-config=false
    if [ $? -ne 0 ]; then
        echo "❌ Failed to create app"
        exit 1
    fi
    echo "✅ App created successfully"
    
    # Update fly.toml if it exists
    if [ -f "fly.toml" ]; then
        echo "   Updating fly.toml with app name and URLs..."
        APP_URL="https://${APP_NAME}.fly.dev"
        
        # Update app name
        sed -i.bak "s/^app = .*/app = \"$APP_NAME\"/" fly.toml
        
        # Update region
        sed -i.bak "s/^primary_region = .*/primary_region = '$REGION'/" fly.toml
        
        # Update ALLOWED_ORIGINS and FRONTEND_URL
        sed -i.bak "s|ALLOWED_ORIGINS = .*|ALLOWED_ORIGINS = '$APP_URL'|" fly.toml
        sed -i.bak "s|FRONTEND_URL = .*|FRONTEND_URL = '$APP_URL'|" fly.toml
        
        rm -f fly.toml.bak
        echo "✅ fly.toml updated"
    fi
fi

# Step 5: Setup PostgreSQL
if [ "$SKIP_DB_SETUP" = false ]; then
    echo ""
    echo "[STEP 4] Setting up PostgreSQL database..."
    
    if [ "$USE_EXISTING_DB" = true ]; then
        echo "   Using existing database: $DB_NAME"
        fly postgres attach --app "$APP_NAME" "$DB_NAME" --yes
        if [ $? -ne 0 ]; then
            echo "❌ Failed to attach existing database"
            exit 1
        fi
        echo "✅ Database attached"
    else
        # Check if database exists
        DB_EXISTS=false
        if fly postgres list 2>&1 | grep -q "$DB_NAME"; then
            DB_EXISTS=true
        fi
        
        if [ "$DB_EXISTS" = true ]; then
            echo "   Database '$DB_NAME' already exists"
            echo "   Attaching to app..."
            fly postgres attach --app "$APP_NAME" "$DB_NAME" --yes
            if [ $? -ne 0 ]; then
                echo "❌ Failed to attach database"
                exit 1
            fi
            echo "✅ Database attached"
        else
            echo "   Creating PostgreSQL database..."
            echo "     Name: $DB_NAME"
            echo "     Region: $REGION"
            echo "     VM Size: $VM_SIZE"
            echo "     Volume Size: ${DB_VOLUME_SIZE}GB"
            
            fly postgres create \
                --name "$DB_NAME" \
                --region "$REGION" \
                --vm-size "$VM_SIZE" \
                --volume-size "$DB_VOLUME_SIZE" \
                --initial-cluster-size 1 \
                --detach || {
                # Check if it failed because database already exists
                if fly postgres list 2>&1 | grep -q "$DB_NAME"; then
                    echo "   Database already exists, attaching..."
                    fly postgres attach --app "$APP_NAME" "$DB_NAME" --yes
                    if [ $? -ne 0 ]; then
                        echo "❌ Failed to attach database"
                        exit 1
                    fi
                else
                    echo "❌ Failed to create database"
                    exit 1
                fi
            }
            
            echo "✅ Database created"
            
            # Attach database to app
            echo "   Attaching database to app..."
            fly postgres attach --app "$APP_NAME" "$DB_NAME" --yes
            if [ $? -ne 0 ]; then
                echo "❌ Failed to attach database"
                exit 1
            fi
            echo "✅ Database attached"
        fi
    fi
    
    # Verify DATABASE_URL is set
    echo "   Verifying DATABASE_URL..."
    if fly secrets list --app "$APP_NAME" --json 2>&1 | jq -e '.[] | select(.Name == "DATABASE_URL")' &> /dev/null; then
        echo "✅ DATABASE_URL is set"
    else
        echo "⚠️  WARNING: DATABASE_URL not found"
        echo "   This may be set automatically after deployment"
    fi
else
    echo ""
    echo "[STEP 4] Skipping database setup"
fi

# Step 6: Setup JWT_SECRET
if [ "$SKIP_SECRETS" = false ]; then
    echo ""
    echo "[STEP 5] Setting up secrets..."
    
    if fly secrets list --app "$APP_NAME" --json 2>&1 | jq -e '.[] | select(.Name == "JWT_SECRET")' &> /dev/null; then
        echo "✅ JWT_SECRET already set"
    else
        echo "   Generating JWT_SECRET..."
        JWT_SECRET=$(openssl rand -hex 32)
        
        if [ -z "$JWT_SECRET" ] || [ ${#JWT_SECRET} -lt 32 ]; then
            echo "❌ Failed to generate JWT_SECRET"
            exit 1
        fi
        
        fly secrets set "JWT_SECRET=$JWT_SECRET" --app "$APP_NAME"
        if [ $? -eq 0 ]; then
            echo "✅ JWT_SECRET set"
        else
            echo "❌ Failed to set JWT_SECRET"
            exit 1
        fi
    fi
    
    echo ""
    echo "   Optional secrets (not required):"
    echo "     RESEND_API_KEY - for email functionality"
    echo "     RESEND_FROM_EMAIL - for custom email domain"
else
    echo ""
    echo "[STEP 5] Skipping secrets setup"
fi

# Step 7: Deploy
if [ "$SKIP_DEPLOY" = false ]; then
    echo ""
    echo "[STEP 6] Deploying application..."
    echo "   This may take a few minutes..."
    
    fly deploy --app "$APP_NAME"
    
    if [ $? -ne 0 ]; then
        echo "❌ Deployment failed"
        echo "   View logs: fly logs --app $APP_NAME"
        exit 1
    fi
    
    echo "✅ Deployment successful!"
else
    echo ""
    echo "[STEP 6] Skipping deployment"
    echo "   Run manually: fly deploy --app $APP_NAME"
fi

# Step 8: Summary
echo ""
echo "======================================"
echo "✅ Setup Complete!"
echo "======================================"
echo ""

# Get app URL
HOSTNAME=$(fly status --app "$APP_NAME" --json 2>&1 | jq -r '.Hostname // empty')
if [ -n "$HOSTNAME" ]; then
    APP_URL="https://$HOSTNAME"
    echo "🌐 App URL: $APP_URL"
    echo ""
fi

echo "Next steps:"
echo "1. Check app status:"
echo "   fly status --app $APP_NAME"
echo ""
echo "2. View logs to verify PostgreSQL:"
echo "   fly logs --app $APP_NAME | grep -i postgresql"
echo ""
echo "3. Check health endpoint:"
if [ -n "$HOSTNAME" ]; then
    echo "   curl https://$HOSTNAME/api/health/ready"
fi
echo ""
echo "4. Create admin user:"
echo "   fly ssh console --app $APP_NAME"
echo "   npm run setup-admin"
echo ""
echo "5. Access your app:"
if [ -n "$HOSTNAME" ]; then
    echo "   $APP_URL"
fi
echo ""

