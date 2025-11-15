#!/bin/bash

# 🚨 DANGER: Complete Fly.io App Destruction and Recreation Script
# This script will DESTROY your current app and ALL its data
# Use with extreme caution!

set -e  # Exit on any error

echo "🛑 DANGER: This will destroy colabora-fresh and ALL its data!"
echo "Press Ctrl+C now if you want to cancel..."
sleep 5

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Step 1: Checking current status...${NC}"
fly status || echo "App status check failed (might already be destroyed)"
fly volumes list || echo "Volume list check failed"

echo -e "${YELLOW}Step 2: Stopping app gracefully...${NC}"
fly scale count 0 2>/dev/null || echo "Scale down failed (app might already be stopped)"

echo -e "${YELLOW}Step 3: Waiting for graceful shutdown...${NC}"
sleep 15

echo -e "${RED}Step 4: DESTROYING APP (no going back!)...${NC}"
fly apps destroy colabora-fresh --yes || echo "App destroy failed (might already be destroyed)"

echo -e "${RED}Step 5: DESTROYING VOLUME (ALL DATA WILL BE LOST!)...${NC}"
fly volumes destroy colabora_data --yes || echo "Volume destroy failed (might already be destroyed)"

echo -e "${YELLOW}Step 6: Verifying cleanup...${NC}"
echo "Remaining apps:"
fly apps list
echo "Remaining volumes:"
fly volumes list

echo -e "${GREEN}Step 7: Starting fresh deployment...${NC}"
npm run deploy:fly

echo -e "${GREEN}✅ Recreation complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Check logs: fly logs --tail"
echo "2. Check status: fly status"
echo "3. Test health: curl https://colabora-fresh.fly.dev/api/health/ready"
echo ""
echo "Demo credentials:"
echo "- Alice: alice@example.com / SecurePass123!"
echo "- Bob: bob@example.com / SecurePass123!"
echo "- Charlie: charlie@example.com / SecurePass123!"
echo "- Admin: admin@colabora.local / AdminSecurePass123!"
