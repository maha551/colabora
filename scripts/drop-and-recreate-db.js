#!/usr/bin/env node
/**
 * Drop and recreate database for fresh deployment
 * Uses DATABASE_URL from environment or Fly.io secrets
 */

const { Client } = require('pg');
const config = require('../server/config');

async function dropAndRecreateDatabase() {
  // Get DATABASE_URL
  const databaseUrl = process.env.DATABASE_URL || config.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ ERROR: DATABASE_URL not found');
    console.error('Set it as an environment variable or it should be in server/config.js');
    process.exit(1);
  }

  // Parse connection string
  const url = new URL(databaseUrl);
  const dbName = url.pathname.slice(1); // Remove leading /
  const adminUrl = `${url.protocol}//${url.username}:${url.password}@${url.hostname}:${url.port || 5432}/postgres${url.search || ''}`;

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Drop and Recreate Database');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log(`Database: ${dbName}`);
  console.log(`Host: ${url.hostname}`);
  console.log('');

  // Connect to postgres database (default)
  const client = new Client({ connectionString: adminUrl });

  try {
    console.log('🔌 Connecting to PostgreSQL...');
    await client.connect();
    console.log('✅ Connected');
    console.log('');

    // Drop database
    console.log(`🗑️  Dropping database '${dbName}'...`);
    // Terminate existing connections first
    await client.query(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = $1
        AND pid <> pg_backend_pid();
    `, [dbName]);
    
    await client.query(`DROP DATABASE IF EXISTS ${client.escapeIdentifier(dbName)};`);
    console.log('✅ Database dropped');
    console.log('');

    // Create database
    console.log(`➕ Creating database '${dbName}'...`);
    await client.query(`CREATE DATABASE ${client.escapeIdentifier(dbName)};`);
    console.log('✅ Database created');
    console.log('');

    // List databases to verify
    console.log('📋 Verifying...');
    const result = await client.query(`
      SELECT datname FROM pg_database 
      WHERE datname = $1
    `, [dbName]);
    
    if (result.rows.length > 0) {
      console.log(`✅ Database '${dbName}' exists and is ready`);
    } else {
      console.log(`⚠️  Warning: Database '${dbName}' not found in list`);
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ Database recreated successfully!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('Next step: Deploy your application');
    console.log('  fly deploy --app colabora-app');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Error:', error.message);
    if (error.code) {
      console.error(`   Code: ${error.code}`);
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Run
dropAndRecreateDatabase().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
