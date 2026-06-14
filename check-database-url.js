/**
 * Script to check and verify DATABASE_URL configuration
 * This script validates the DATABASE_URL format and tests the connection
 */

require('dotenv').config();
const config = require('./server/config');
const KnexConnection = require('./server/database/knexConnection');

console.log('🔍 Checking DATABASE_URL Configuration\n');
console.log('=====================================\n');

// Step 1: Check if DATABASE_URL is set
console.log('1. Checking if DATABASE_URL is set...');
const dbUrl = config.DATABASE_URL || process.env.DATABASE_URL || '';

if (!dbUrl || dbUrl.trim() === '') {
    console.log('   ❌ DATABASE_URL is NOT SET');
    console.log('   \n   To set it:');
    console.log('   - Local: Create .env file with DATABASE_URL=./colabora.db');
    console.log('   - Fly.io: fly postgres attach --app colabora-app colabora-db');
    console.log('   - Or manually: fly secrets set DATABASE_URL="postgresql://..." --app colabora-app');
    process.exit(1);
}

console.log('   ✅ DATABASE_URL is set');

// Step 2: Validate format (without exposing sensitive data)
console.log('\n2. Validating DATABASE_URL format...');
const isPostgreSQL = dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://');
const isSQLite = dbUrl.includes('.db') || dbUrl.startsWith('sqlite://') || dbUrl.startsWith('./') || dbUrl.startsWith('/');

// Show masked URL (hide password)
let maskedUrl = dbUrl;
if (isPostgreSQL) {
    // Mask password in PostgreSQL URL: postgresql://user:password@host:port/db
    maskedUrl = dbUrl.replace(/:([^:@]+)@/, ':***@');
}
console.log('   URL (masked):', maskedUrl.length > 80 ? maskedUrl.substring(0, 80) + '...' : maskedUrl);

if (isPostgreSQL) {
    console.log('   ✅ Format: PostgreSQL connection string');
    
    // Validate PostgreSQL URL structure
    const pgUrlPattern = /^(postgresql|postgres):\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/;
    if (!pgUrlPattern.test(dbUrl)) {
        console.log('   ⚠️  WARNING: PostgreSQL URL format may be incorrect');
        console.log('   Expected format: postgresql://username:password@host:port/database');
    } else {
        console.log('   ✅ PostgreSQL URL format is valid');
    }
} else if (isSQLite) {
    console.log('   ✅ Format: SQLite file path');
} else {
    console.log('   ⚠️  WARNING: Unknown database URL format');
    console.log('   Expected: postgresql://... or a file path ending in .db');
}

// Step 3: Check database type detection
console.log('\n3. Testing database type detection...');
try {
    const connection = new KnexConnection(config);
    const detectedType = connection.dbType;
    const isPG = connection.isPostgreSQL();
    
    console.log('   Detected type:', detectedType);
    console.log('   Is PostgreSQL:', isPG);
    
    if (isPostgreSQL && !isPG) {
        console.log('   ⚠️  WARNING: URL looks like PostgreSQL but was detected as SQLite');
    } else if (!isPostgreSQL && isPG) {
        console.log('   ⚠️  WARNING: URL looks like SQLite but was detected as PostgreSQL');
    } else {
        console.log('   ✅ Database type detection matches URL format');
    }
} catch (error) {
    console.log('   ❌ Error detecting database type:', error.message);
}

// Step 4: Test connection
console.log('\n4. Testing database connection...');
async function testConnection() {
    try {
        const connection = new KnexConnection(config);
        console.log('   Attempting to connect...');
        
        const knex = await connection.initialize();
        console.log('   ✅ Connection successful!');
        
        // Test a simple query
        if (connection.isPostgreSQL()) {
            const result = await knex.raw('SELECT version()');
            console.log('   ✅ PostgreSQL query successful');
            console.log('   Database version:', result.rows[0]?.version?.substring(0, 50) || 'Unknown');
        } else {
            const result = await knex.raw('SELECT sqlite_version() as version');
            console.log('   ✅ SQLite query successful');
            console.log('   SQLite version:', result[0]?.version || 'Unknown');
        }
        
        // Check if tables exist
        const tables = await knex.raw(
            connection.isPostgreSQL() 
                ? "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
                : "SELECT name FROM sqlite_master WHERE type='table'"
        );
        
        const tableCount = connection.isPostgreSQL() 
            ? tables.rows?.length || 0
            : tables?.length || 0;
        
        console.log(`   ✅ Found ${tableCount} tables in database`);
        
        await connection.close();
        console.log('\n=====================================');
        console.log('✅ DATABASE_URL is CORRECT and working!');
        console.log('=====================================\n');
        
    } catch (error) {
        console.log('   ❌ Connection failed!');
        console.log('   Error:', error.message);
        
        if (error.message.includes('ENOENT')) {
            console.log('\n   💡 SQLite file not found. Make sure the path is correct.');
        } else if (error.message.includes('ECONNREFUSED')) {
            console.log('\n   💡 Cannot connect to PostgreSQL server. Check:');
            console.log('      - Is the database server running?');
            console.log('      - Is the host and port correct?');
            console.log('      - Is the firewall blocking the connection?');
        } else if (error.message.includes('password authentication failed')) {
            console.log('\n   💡 Authentication failed. Check:');
            console.log('      - Is the username correct?');
            console.log('      - Is the password correct?');
        } else if (error.message.includes('database') && error.message.includes('does not exist')) {
            console.log('\n   💡 Database does not exist. Check:');
            console.log('      - Is the database name correct?');
            console.log('      - Does the database need to be created?');
        } else if (error.message.includes('timeout')) {
            console.log('\n   💡 Connection timeout. Check:');
            console.log('      - Is the database server accessible?');
            console.log('      - Is the network connection stable?');
        }
        
        console.log('\n=====================================');
        console.log('❌ DATABASE_URL connection test FAILED');
        console.log('=====================================\n');
        process.exit(1);
    }
}

// Run the connection test
testConnection().catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
});

