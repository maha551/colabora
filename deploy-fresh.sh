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

# Check if secrets already exist, generate only if missing
echo "🔑 Checking/applying secure secrets..."

# Check if JWT_SECRET exists
if fly secrets list | grep -q JWT_SECRET; then
  echo "✅ JWT_SECRET already exists, keeping existing value"
else
  echo "🔑 Generating new JWT_SECRET..."
  JWT_SECRET=$(openssl rand -base64 32)
  fly secrets set JWT_SECRET="$JWT_SECRET"
fi

# Check if SESSION_SECRET exists
if fly secrets list | grep -q SESSION_SECRET; then
  echo "✅ SESSION_SECRET already exists, keeping existing value"
else
  echo "🔑 Generating new SESSION_SECRET..."
SESSION_SECRET=$(openssl rand -base64 32)
  fly secrets set SESSION_SECRET="$SESSION_SECRET"
fi

# Check if ALLOWED_ORIGINS exists
if fly secrets list | grep -q ALLOWED_ORIGINS; then
  echo "✅ ALLOWED_ORIGINS already exists, keeping existing value"
else
  echo "🌐 Setting ALLOWED_ORIGINS..."
  fly secrets set ALLOWED_ORIGINS="https://colabora-fresh.fly.dev"
fi

# Check if FRONTEND_URL exists
if fly secrets list | grep -q FRONTEND_URL; then
  echo "✅ FRONTEND_URL already exists, keeping existing value"
else
  echo "🌐 Setting FRONTEND_URL..."
  fly secrets set FRONTEND_URL="https://colabora-fresh.fly.dev"
fi

# Launch fresh app
echo "📦 Launching fresh app in EU..."
fly launch --name colabora-fresh --region fra --no-deploy

# Create volume
echo "💾 Creating persistent volume..."
fly volumes create colabora_data --size 1 --region fra

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
