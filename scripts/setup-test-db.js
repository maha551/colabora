#!/usr/bin/env node
/**
 * Bootstrap PostgreSQL for local/CI integration tests.
 * - Ensures colabora_test database exists
 * - Runs knex migrations against TEST_DATABASE_URL
 *
 * Usage:
 *   node scripts/setup-test-db.js
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/colabora_test node scripts/setup-test-db.js
 */

const { Client } = require('pg');
const { execSync } = require('child_process');
const path = require('path');

const DEFAULT_TEST_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/colabora_test';
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || DEFAULT_TEST_URL;

function parseDbUrl(url) {
  const parsed = new URL(url);
  const dbName = parsed.pathname.replace(/^\//, '') || 'colabora_test';
  parsed.pathname = '/postgres';
  return { adminUrl: parsed.toString(), dbName };
}

async function ensureDatabaseExists(adminUrl, dbName) {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (exists.rowCount === 0) {
      console.log(`Creating database "${dbName}"...`);
      await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
      console.log(`Database "${dbName}" created.`);
    } else {
      console.log(`Database "${dbName}" already exists.`);
    }
  } finally {
    await client.end();
  }
}

async function verifyConnection(url) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('SELECT 1');
    console.log('Test database connection OK.');
  } finally {
    await client.end();
  }
}

function runMigrations() {
  const root = path.join(__dirname, '..');
  console.log('Running knex migrations for test database...');
  execSync('npx knex --knexfile knexfile.js migrate:latest', {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      TEST_DATABASE_URL,
      SKIP_RUNTIME_MIGRATIONS: '1',
    },
  });
  console.log('Migrations complete.');
}

async function main() {
  const { adminUrl, dbName } = parseDbUrl(TEST_DATABASE_URL);
  console.log(`Test DB bootstrap: ${dbName} @ ${adminUrl.replace(/:[^:@]+@/, ':***@')}`);

  try {
    await ensureDatabaseExists(adminUrl, dbName);
    await verifyConnection(TEST_DATABASE_URL);
    runMigrations();
    console.log('Test database bootstrap finished successfully.');
  } catch (error) {
    console.error('Test database bootstrap failed:', error.message);
    console.error('');
    console.error('Ensure PostgreSQL is running, e.g.:');
    console.error('  npm run db:up');
    console.error('  npm run test:db:setup');
    process.exit(1);
  }
}

main();
