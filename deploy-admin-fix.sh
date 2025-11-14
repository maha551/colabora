#!/bin/bash

# Colabora Admin Fix Deployment Script
echo "🔧 Deploying Colabora with Admin Dashboard fixes..."

# Check if fly CLI is available
if ! command -v fly &> /dev/null; then
    echo "❌ Fly CLI not found. Installing..."
    curl -L https://fly.io/install.sh | sh
    export PATH="$HOME/.fly/bin:$PATH"
fi

# Login to Fly (if not already logged in)
if ! fly auth whoami &> /dev/null; then
    echo "🔐 Please login to Fly.io:"
    fly auth login
fi

# Force a fresh deployment
echo "🚀 Deploying with latest code..."
fly deploy --force

echo "✅ Deployment complete!"
echo ""
echo "🧪 Test the admin dashboard:"
echo "1. Visit: https://colabora-fresh.fly.dev"
echo "2. Login: admin@colabora.local / AdminSecurePass123!"
echo "3. Check browser console for role debug info"
echo "4. Look for 'Admin Dashboard' in user menu"
