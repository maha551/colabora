# Comment System Database Schema Fix

**Date:** 2026-01-27  
**Issue:** Production database missing `commentable_type` column  
**Status:** ✅ Fix migration created

---

## Problem

Production database error:
```
column "commentable_type" of relation "comments" does not exist
```

The `comments` table exists but is missing the `commentable_type` and `commentable_id` columns required by the polymorphic comment system.

---

## Root Cause

The original migration `unify-comment-system.js` had a logic flaw:
- It checked if `proposal_id` column exists
- If `proposal_id` doesn't exist, it assumed the table already has the new structure
- **Problem:** The table might exist without `proposal_id` AND without `commentable_type` (intermediate state)

This can happen if:
1. Migration was partially executed
2. Table was created manually without running migration
3. Migration failed silently

---

## Solution

### 1. **Fix Migration Created**

**File:** `server/migrations/fix-comments-table-schema.js`

This migration:
- ✅ Checks if `commentable_type` column exists (not just `proposal_id`)
- ✅ For PostgreSQL: Uses `ALTER TABLE ADD COLUMN` to add missing columns
- ✅ For SQLite: Recreates table with new schema
- ✅ Migrates existing data from `proposal_id` to `commentable_id`
- ✅ Drops old `proposal_id` column
- ✅ Creates necessary indexes
- ✅ Idempotent (safe to run multiple times)

### 2. **Original Migration Updated**

**File:** `server/migrations/unify-comment-system.js`

Updated to:
- ✅ Check for both `proposal_id` (old) and `commentable_type` (new)
- ✅ Only skip migration if `commentable_type` exists
- ✅ More robust column detection

---

## Deployment Steps

### Option 1: Automatic (Recommended)

The migration will run automatically on next server restart:
1. Server starts
2. `DatabaseManager.initialize()` runs
3. `MigrationRunner.runMigrations()` executes
4. `fix-comments-table-schema.js` detects missing column
5. Adds column and migrates data
6. Comment system works ✅

### Option 2: Manual Execution

If you need to run it immediately:

```bash
# Connect to production database
# Run the migration manually using MigrationRunner

# Or use the script (if available):
node scripts/run-migration.js
```

---

## Verification

After migration runs, verify:

```sql
-- PostgreSQL
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'comments' 
AND column_name IN ('commentable_type', 'commentable_id', 'proposal_id')
ORDER BY column_name;

-- Should show:
-- commentable_id (TEXT) ✅
-- commentable_type (TEXT) ✅
-- proposal_id (should NOT exist) ✅
```

---

## Impact

- **Before Fix:** ❌ Comments cannot be created (500 error)
- **After Fix:** ✅ Comments work normally
- **Data Loss:** None - existing comments are preserved and migrated
- **Downtime:** None - migration is safe to run on live database

---

## Related Files

- `server/migrations/fix-comments-table-schema.js` - Fix migration
- `server/migrations/unify-comment-system.js` - Original migration (updated)
- `server/routes/comments.js` - Comment API routes
- `server/database/DatabaseManager.js` - Migration execution

---

## Notes

- Migration is idempotent - safe to run multiple times
- Uses transactions where possible
- Handles both PostgreSQL and SQLite
- Preserves all existing comment data
- Creates necessary indexes for performance
