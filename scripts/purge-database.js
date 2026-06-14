/**
 * Database Purge Script
 * Safely purges all data from the database while preserving schema
 * 
 * WARNING: This will delete ALL data from the database!
 * 
 * Usage:
 *   node scripts/purge-database.js
 * 
 * Environment:
 *   DATABASE_URL - Database connection string (from .env or Fly.io secret)
 */

require('dotenv').config();
const knex = require('knex');
const { logger } = require('../server/middleware/logger');

// Get database URL from environment
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL environment variable is not set');
  console.error('   Set it in .env file or as a Fly.io secret');
  process.exit(1);
}

// Detect database type
const isPostgreSQL = DATABASE_URL.startsWith('postgresql://') || DATABASE_URL.startsWith('postgres://');

if (!isPostgreSQL) {
  console.error('❌ ERROR: This script is designed for PostgreSQL databases');
  console.error('   For SQLite, use the reset-and-setup-db.js script instead');
  process.exit(1);
}

// Create Knex connection
const db = knex({
  client: 'pg',
  connection: DATABASE_URL,
  pool: {
    min: 1,
    max: 1
  }
});

/**
 * Get all table names from the database
 */
async function getAllTables() {
  if (isPostgreSQL) {
    const result = await db.raw(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name NOT IN ('migration_history')
      ORDER BY table_name
    `);
    return result.rows.map(row => row.table_name);
  }
  return [];
}

/**
 * Truncate all tables (preserves schema, removes all data)
 */
async function truncateAllTables(tables) {
  console.log('\n🗑️  Truncating all tables...');
  
  // Disable foreign key checks temporarily (PostgreSQL)
  await db.raw('SET session_replication_role = replica');
  
  let truncated = 0;
  for (const table of tables) {
    try {
      await db.raw(`TRUNCATE TABLE "${table}" CASCADE`);
      console.log(`   ✅ Truncated: ${table}`);
      truncated++;
    } catch (error) {
      console.error(`   ❌ Error truncating ${table}:`, error.message);
    }
  }
  
  // Re-enable foreign key checks
  await db.raw('SET session_replication_role = DEFAULT');
  
  console.log(`\n✅ Truncated ${truncated} of ${tables.length} tables`);
  return truncated;
}

/**
 * Reset migration history (optional - allows migrations to re-run)
 */
async function resetMigrationHistory() {
  try {
    await db.raw('TRUNCATE TABLE migration_history');
    console.log('✅ Reset migration history');
  } catch (error) {
    if (error.message.includes('does not exist')) {
      console.log('ℹ️  Migration history table does not exist (will be created on next startup)');
    } else {
      console.error('❌ Error resetting migration history:', error.message);
    }
  }
}

/**
 * Main purge function
 */
async function purgeDatabase() {
  console.log('🚨 DATABASE PURGE SCRIPT');
  console.log('='.repeat(50));
  console.log('⚠️  WARNING: This will delete ALL data from the database!');
  console.log('⚠️  Schema will be preserved, but all data will be lost!');
  console.log('='.repeat(50));
  console.log(`\n📊 Database: ${DATABASE_URL.split('@')[1] || DATABASE_URL}`);
  console.log(`📊 Type: PostgreSQL\n`);

  try {
    // Test connection
    await db.raw('SELECT 1');
    console.log('✅ Database connection successful\n');

    // Get all tables
    console.log('📋 Fetching table list...');
    const tables = await getAllTables();
    
    if (tables.length === 0) {
      console.log('ℹ️  No tables found - database may be empty or schema not created yet');
      console.log('   The app will create all tables on next startup');
      await db.destroy();
      process.exit(0);
    }

    console.log(`\n📋 Found ${tables.length} tables:`);
    tables.forEach((table, index) => {
      console.log(`   ${index + 1}. ${table}`);
    });

    // Confirm before proceeding
    console.log('\n⚠️  Are you sure you want to delete ALL data from these tables?');
    console.log('   This action cannot be undone!');
    console.log('\n   To proceed, set CONFIRM_PURGE=true environment variable');
    console.log('   Example: CONFIRM_PURGE=true node scripts/purge-database.js\n');

    if (process.env.CONFIRM_PURGE !== 'true') {
      console.log('❌ Purge cancelled - set CONFIRM_PURGE=true to proceed');
      await db.destroy();
      process.exit(1);
    }

    // Purge data
    console.log('\n🗑️  Starting database purge...\n');
    
    // Truncate all tables
    const truncated = await truncateAllTables(tables);
    
    // Reset migration history (optional)
    console.log('\n🔄 Resetting migration history...');
    await resetMigrationHistory();

    console.log('\n' + '='.repeat(50));
    console.log('✅ DATABASE PURGE COMPLETE');
    console.log('='.repeat(50));
    console.log(`\n📊 Summary:`);
    console.log(`   - Tables processed: ${tables.length}`);
    console.log(`   - Tables truncated: ${truncated}`);
    console.log(`   - Migration history: Reset`);
    console.log(`\n💡 Next steps:`);
    console.log(`   1. Restart the application`);
    console.log(`   2. The app will automatically:`);
    console.log(`      - Verify schema exists`);
    console.log(`      - Run migrations (will skip - tables already exist)`);
    console.log(`      - Create demo users (if in development mode)`);
    console.log(`\n✅ Database is now clean and ready for fresh data!\n`);

  } catch (error) {
    console.error('\n❌ ERROR during database purge:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

// Run the purge
purgeDatabase().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
