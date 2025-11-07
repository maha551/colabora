#!/bin/bash

# Fresh Colabora EU Deployment Script
echo "🚀 Deploying Colabora Fresh to EU..."

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

# Launch fresh app
echo "📦 Launching fresh app in EU..."
fly launch --name colabora-fresh --region fra --no-deploy

# Create volume
echo "💾 Creating persistent volume..."
fly volumes create colabora_data --size 1 --region fra

# Set secrets
echo "🔒 Setting secrets..."
fly secrets set SESSION_SECRET="$SESSION_SECRET"
fly secrets set JWT_SECRET="$JWT_SECRET"

# Deploy
echo "🚀 Deploying application..."
fly deploy

# Scale to 2 machines
echo "⚖️ Scaling to 2 machines..."
fly scale count 2

# Get URL
echo "🌐 Getting app URL..."
URL=$(fly status --json | jq -r '.Hostname')

echo ""
echo "🎉 Deployment complete!"
echo "🌐 Your app: https://$URL"
echo ""
echo "👥 Demo users:"
echo "   Alice: alice@example.com / SecurePass123!"
echo "   Bob: bob@example.com / SecurePass123!"
echo "   Charlie: charlie@example.com / SecurePass123!"
echo "   Diana: diana@example.com / SecurePass123!"
