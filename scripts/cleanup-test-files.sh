#!/bin/bash

# Script to clean up test files and temporary databases
# Usage: ./scripts/cleanup-test-files.sh

echo "🧹 Cleaning up test files and temporary databases..."

# Delete test database files
echo "Deleting test database files..."
find . -name "test-colabora-*.db" -type f -delete
find . -name "nonexistent_*.db" -type f -delete

# Move test/debug scripts to scripts/ directory or delete
echo "Cleaning up test/debug scripts..."

# Move useful scripts to scripts/ directory
if [ -f "check_all_users.js" ]; then
  mv check_all_users.js scripts/ 2>/dev/null || rm check_all_users.js
fi

if [ -f "check_duplicate_users.js" ]; then
  mv check_duplicate_users.js scripts/ 2>/dev/null || rm check_duplicate_users.js
fi

if [ -f "check_final_data.js" ]; then
  mv check_final_data.js scripts/ 2>/dev/null || rm check_final_data.js
fi

if [ -f "check_user_ids.js" ]; then
  mv check_user_ids.js scripts/ 2>/dev/null || rm check_user_ids.js
fi

# Delete debug scripts (not needed in repo)
if [ -f "debug_login.js" ]; then
  rm debug_login.js
fi

if [ -f "decode_jwt.js" ]; then
  rm decode_jwt.js
fi

if [ -f "test_api_direct.js" ]; then
  rm test_api_direct.js
fi

if [ -f "test_user_auth.js" ]; then
  rm test_user_auth.js
fi

if [ -f "reset_and_reseed.js" ]; then
  mv reset_and_reseed.js scripts/ 2>/dev/null || rm reset_and_reseed.js
fi

echo "✅ Cleanup complete!"
echo ""
echo "Note: Test database files have been deleted."
echo "Note: Some scripts have been moved to scripts/ directory."
echo "Note: Debug scripts have been removed."

