#!/usr/bin/env node
/**
 * Check PostgreSQL max_connections and current connection status
 * Can be run from Fly.io app or locally (if DATABASE_URL is set)
 * 
 * Usage:
 *   node scripts/check-max-connections.js
 *   Or from Fly.io: fly ssh console --app colabora-50users-20260111 -C "node scripts/check-max-connections.js"
 */

const { Client } = require('pg');
const config = require('../server/config');

// Get DATABASE_URL
const databaseUrl = process.env.DATABASE_URL || config.DATABASE_URL;

if (!databaseUrl) {
  console.error('❌ ERROR: DATABASE_URL not set');
  console.error('   Set it with: fly secrets set DATABASE_URL="..." --app colabora-50users-20260111');
  process.exit(1);
}

// Check if PostgreSQL
const isPostgreSQL = databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://');

if (!isPostgreSQL) {
  console.error('❌ This script only works with PostgreSQL');
  console.error('   Current database:', databaseUrl.split('@')[1] || databaseUrl.substring(0, 50));
  process.exit(1);
}

async function checkMaxConnections() {
  const client = new Client({ connectionString: databaseUrl });
  
  try {
    await client.connect();
    console.log('✅ Connected to database\n');
    
    // Get max_connections
    const maxConnResult = await client.query("SELECT setting::int as value FROM pg_settings WHERE name = 'max_connections'");
    const maxConnections = maxConnResult.rows[0]?.value || 0;
    
    // Get superuser_reserved_connections
    const reservedResult = await client.query("SELECT setting::int as value FROM pg_settings WHERE name = 'superuser_reserved_connections'");
    const reservedConnections = reservedResult.rows[0]?.value || 0;
    
    // Get idle_in_transaction_session_timeout
    const idleTimeoutResult = await client.query("SELECT setting, unit FROM pg_settings WHERE name = 'idle_in_transaction_session_timeout'");
    const idleTimeout = idleTimeoutResult.rows[0];
    
    // Get statement_timeout
    const statementTimeoutResult = await client.query("SELECT setting, unit FROM pg_settings WHERE name = 'statement_timeout'");
    const statementTimeout = statementTimeoutResult.rows[0];
    
    // Calculate available for app
    const availableForApp = maxConnections - reservedConnections;
    
    // Get current connection count
    const currentConnResult = await client.query(`
      SELECT 
        count(*)::int as total,
        count(*) FILTER (WHERE state = 'active')::int as active,
        count(*) FILTER (WHERE state = 'idle')::int as idle
      FROM pg_stat_activity
      WHERE datname = current_database()
    `);
    const current = currentConnResult.rows[0];
    
    // Get connection breakdown by state
    const stateBreakdown = await client.query(`
      SELECT state, count(*)::int as count
      FROM pg_stat_activity
      WHERE datname = current_database()
      GROUP BY state
      ORDER BY count DESC
    `);
    
    // Display results
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  PostgreSQL Connection Configuration');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    console.log('📊 Connection Limits:');
    console.log(`   max_connections:              ${maxConnections}`);
    console.log(`   superuser_reserved:          ${reservedConnections}`);
    console.log(`   Available for application:   ${availableForApp}`);
    console.log('');
    
    console.log('⏱️  Timeout Settings:');
    console.log(`   idle_in_transaction_session_timeout: ${idleTimeout?.setting || 'not set'} ${idleTimeout?.unit || ''}`);
    console.log(`   statement_timeout:            ${statementTimeout?.setting || 'not set'} ${statementTimeout?.unit || ''}`);
    console.log('');
    
    console.log('📈 Current Usage:');
    console.log(`   Total connections:           ${current.total}`);
    console.log(`   Active connections:          ${current.active}`);
    console.log(`   Idle connections:            ${current.idle}`);
    console.log(`   Utilization:                 ${((current.total / maxConnections) * 100).toFixed(1)}%`);
    console.log('');
    
    if (stateBreakdown.rows.length > 0) {
      console.log('📋 Connection Breakdown by State:');
      stateBreakdown.rows.forEach(row => {
        const label = (row.state ?? '(null)').toString().padEnd(20);
        console.log(`   ${label} ${row.count}`);
      });
      console.log('');
    }
    
    // Recommendations
    console.log('💡 Recommendations:');
    
    if (maxConnections < 10) {
      console.log('   ⚠️  max_connections is very low (< 10)');
      console.log('   → Consider upgrading database VM size:');
      console.log('     fly scale vm shared-cpu-4x --app <db-app-name>  # ~25 connections');
      console.log('     fly scale vm performance-1x --app <db-app-name>  # ~100 connections');
    } else if (maxConnections < 25) {
      console.log('   ⚠️  max_connections is low (< 25)');
      console.log('   → Consider upgrading for production:');
      console.log('     fly scale vm shared-cpu-4x --app <db-app-name>  # ~25 connections');
    } else if (maxConnections >= 25 && maxConnections < 50) {
      console.log('   ✅ max_connections is OK for small-medium apps');
    } else {
      console.log('   ✅ max_connections is good for production');
    }
    
    if (current.total >= availableForApp * 0.9) {
      console.log('   ⚠️  Connection pool is near capacity!');
      console.log('   → Consider increasing PG_POOL_MAX or upgrading database');
    }
    
    // Check application pool configuration
    const poolMax = process.env.PG_POOL_MAX || config.PG_POOL_MAX || 'not set';
    const poolMin = process.env.PG_POOL_MIN || config.PG_POOL_MIN || 'not set';
    
    console.log('');
    console.log('⚙️  Application Pool Configuration:');
    console.log(`   PG_POOL_MIN: ${poolMin}`);
    console.log(`   PG_POOL_MAX: ${poolMax}`);
    
    if (poolMax !== 'not set' && parseInt(poolMax) > availableForApp) {
      console.log('');
      console.log('   ⚠️  WARNING: PG_POOL_MAX exceeds available connections!');
      console.log(`   → Set PG_POOL_MAX to ${availableForApp - 2} or less`);
      console.log(`   → fly secrets set PG_POOL_MAX=${availableForApp - 2} --app colabora-50users-20260111`);
    } else if (poolMax !== 'not set' && parseInt(poolMax) <= availableForApp) {
      console.log('   ✅ Pool size is within database limits');
    }
    
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    
  } catch (error) {
    console.error('❌ Error checking database:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('   → Database server is not accepting connections');
      console.error('   → Check: fly status --app <db-app-name>');
    } else if (error.code === 'ETIMEDOUT') {
      console.error('   → Connection timeout');
      console.error('   → Check network connectivity');
    } else if (error.code === '28P01') {
      console.error('   → Authentication failed');
      console.error('   → Check DATABASE_URL credentials');
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Run check
checkMaxConnections().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
