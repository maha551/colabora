#!/bin/bash

# Colabora Fly.io Deployment Script
# Makes deployment as easy as possible!

echo "🚀 Deploying Colabora to Fly.io"
echo "================================="

# Check if fly CLI is installed
if ! command -v fly &> /dev/null; then
    echo "❌ Fly CLI not found. Installing..."
    curl -L https://fly.io/install.sh | sh
    export PATH="$HOME/.fly/bin:$PATH"
fi

# Check if logged in
if ! fly auth whoami &> /dev/null; then
    echo "🔐 Please login to Fly.io:"
    fly auth login
fi

# Generate secure secrets
echo "🔑 Generating secure secrets..."
SESSION_SECRET=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 32)
echo "Generated SESSION_SECRET and JWT_SECRET"

# Check if app already exists
if fly status &>/dev/null; then
    echo "📦 App already exists, updating..."
else
    echo "📦 Launching new app on Fly.io..."
    fly launch --name colabora-fresh --region iad --no-deploy
fi

# Create persistent volume for database (only if it doesn't exist)
echo "💾 Checking/creating persistent volume for database..."
if ! fly volumes list | grep -q colabora_data; then
    fly volumes create colabora_data --size 1 --region iad
    echo "✅ Created volume: colabora_data"
else
    echo "✅ Volume already exists: colabora_data"
fi

# Set secrets
echo "🔒 Setting environment secrets..."
fly secrets set SESSION_SECRET="$SESSION_SECRET"
fly secrets set JWT_SECRET="$JWT_SECRET"
fly secrets set DATABASE_URL="/data/colabora.db"

# Deploy
echo "🚀 Deploying application..."
fly deploy

# Get URL
echo "🌐 Getting your app URL..."
URL=$(fly status --json | jq -r '.Hostname')
echo ""
echo "🎉 Deployment complete!"
echo "🌐 Your app is live at: https://$URL"
echo ""
echo "👥 Demo users:"
echo "   Alice Johnson (alice@example.com)"
echo "   Bob Smith (bob@example.com)"
echo "   Charlie Brown (charlie@example.com)"
echo "   Diana Prince (diana@example.com)"
echo ""
echo "📝 Note: Database resets on each deployment (normal for demo)"
