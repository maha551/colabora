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

# Generate secure session secret
echo "🔑 Generating secure session secret..."
SESSION_SECRET=$(openssl rand -base64 32)
echo "Generated SESSION_SECRET: $SESSION_SECRET"

# Launch app
echo "📦 Launching app on Fly.io..."
fly launch --name colabora-app --region lax

# Create persistent volume for database
echo "💾 Creating persistent volume for database..."
fly volumes create colabora_data --size 1 --region lax

# Set secrets
echo "🔒 Setting environment secrets..."
fly secrets set SESSION_SECRET="$SESSION_SECRET"

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
