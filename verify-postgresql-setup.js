/**
 * Verification script to check if Knex and PostgreSQL are properly set up
 */

const knex = require('knex');
const config = require('./server/config');

console.log('🔍 Verifying Knex and PostgreSQL Setup\n');
console.log('=====================================\n');

// Check dependencies
console.log('1. Checking dependencies...');
try {
    const knexModule = require('knex');
    const pgModule = require('pg');
    console.log('   ✅ knex installed:', require('knex/package.json').version);
    console.log('   ✅ pg installed:', require('pg/package.json').version);
} catch (error) {
    console.log('   ❌ Error checking dependencies:', error.message);
    process.exit(1);
}

// Check configuration
console.log('\n2. Checking configuration...');
const dbUrl = config.DATABASE_URL || '';
console.log('   DATABASE_URL:', dbUrl ? (dbUrl.length > 50 ? dbUrl.substring(0, 50) + '...' : dbUrl) : 'NOT SET');

const isPostgreSQL = config.isPostgreSQL();
console.log('   Database type detected:', isPostgreSQL ? 'PostgreSQL' : 'SQLite');

if (isPostgreSQL) {
    console.log('   ✅ PostgreSQL detected from DATABASE_URL');
    
    // Check connection string format
    if (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
        console.log('   ⚠️  WARNING: DATABASE_URL should start with postgresql:// or postgres://');
    }
} else {
    console.log('   ℹ️  Using SQLite (set DATABASE_URL to postgresql://... to use PostgreSQL)');
}

// Check KnexConnection
console.log('\n3. Checking KnexConnection class...');
try {
    const KnexConnection = require('./server/database/knexConnection');
    const testConfig = { ...config };
    const connection = new KnexConnection(testConfig);
    
    console.log('   ✅ KnexConnection class loaded');
    console.log('   Database type:', connection.dbType);
    console.log('   Is PostgreSQL:', connection.isPostgreSQL());
    
    const knexConfig = connection.getKnexConfig();
    console.log('   Knex client:', knexConfig.client);
    console.log('   Connection type:', typeof knexConfig.connection);
    
    if (isPostgreSQL) {
        if (knexConfig.client === 'pg') {
            console.log('   ✅ Using PostgreSQL client (pg)');
        } else {
            console.log('   ❌ Wrong client:', knexConfig.client);
        }
        
        // Check pool configuration
        const poolConfig = connection.getPoolConfig();
        console.log('   Pool config:', {
            min: poolConfig.min,
            max: poolConfig.max,
            idleTimeout: poolConfig.idleTimeoutMillis
        });
    }
} catch (error) {
    console.log('   ❌ Error loading KnexConnection:', error.message);
    console.log('   Stack:', error.stack);
}

// Summary
console.log('\n=====================================');
console.log('Summary:');
console.log('=====================================\n');

if (isPostgreSQL) {
    console.log('✅ PostgreSQL setup looks good!');
    console.log('\nTo test the connection, set DATABASE_URL and run:');
    console.log('  node -e "const KnexConnection = require(\'./server/database/knexConnection\'); const config = require(\'./server/config\'); const conn = new KnexConnection(config); conn.initialize().then(() => { console.log(\'✅ Connected!\'); process.exit(0); }).catch(err => { console.error(\'❌ Connection failed:\', err.message); process.exit(1); });"');
} else {
    console.log('ℹ️  Currently configured for SQLite');
    console.log('\nTo switch to PostgreSQL:');
    console.log('  1. Set DATABASE_URL to a PostgreSQL connection string');
    console.log('     Format: postgresql://username:password@host:port/database');
    console.log('  2. Or use: fly postgres attach --app your-app db-name');
}

console.log('');

