#!/usr/bin/env node
/**
 * Verify that Phase 1 performance indexes exist.
 * Run after deploy or during health check.
 *
 * Usage:
 *   node scripts/verify-phase1-indexes.js
 *   Or from Fly.io: fly ssh console --app colabora-app -C "node scripts/verify-phase1-indexes.js"
 *
 * Exit code: 0 if all expected indexes present, 1 if any missing (or DB error).
 */

const config = require('../server/config');
const databaseUrl = process.env.DATABASE_URL || config.DATABASE_URL;

const PHASE1_INDEXES = [
  'idx_documents_organization_id',
  'idx_document_collaborators_document_user',
  'idx_documents_status_organization',
  'idx_documents_parent_sort_order',
  'idx_organization_members_org_user_status',
  'idx_organization_representatives_org_user_status'
];

const isPostgreSQL = databaseUrl && (
  databaseUrl.startsWith('postgresql://') ||
  databaseUrl.startsWith('postgres://')
);

async function verifyPostgres(db) {
  const result = await db.raw(`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = ANY(?)
  `, [PHASE1_INDEXES]);
  const rows = result.rows ?? (Array.isArray(result) ? result : []);
  const found = rows.map(r => r && r.indexname).filter(Boolean);
  return found;
}

async function verifySQLite(db) {
  const result = await db.raw(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND name IN (?, ?, ?, ?, ?, ?)",
    PHASE1_INDEXES
  );
  const rows = result?.rows ?? (Array.isArray(result) ? result : []);
  const found = rows.map(r => (r && r.name) || (r && r[0])).filter(Boolean);
  return found;
}

async function main() {
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }

  let db;
  try {
    if (isPostgreSQL) {
      const knex = require('knex')({
        client: 'pg',
        connection: databaseUrl,
        pool: { min: 0, max: 1 }
      });
      db = knex;
      const found = await verifyPostgres(db);
      const missing = PHASE1_INDEXES.filter(name => !found.includes(name));
      if (missing.length > 0) {
        console.error('Missing Phase 1 indexes:', missing.join(', '));
        console.error('Run migrations so that server/migrations/add-phase1-performance-indexes.js is applied.');
        process.exit(1);
      }
      console.log('All Phase 1 performance indexes present.');
    } else {
      const knex = require('knex')({
        client: 'sqlite3',
        connection: databaseUrl,
        useNullAsDefault: true
      });
      db = knex;
      const found = await verifySQLite(db);
      const missing = PHASE1_INDEXES.filter(name => !found.includes(name));
      if (missing.length > 0) {
        console.error('Missing Phase 1 indexes (SQLite):', missing.join(', '));
        console.error('Run migrations so that server/migrations/add-phase1-performance-indexes.js is applied.');
        process.exit(1);
      }
      console.log('All Phase 1 performance indexes present.');
    }
  } catch (err) {
    console.error('Error verifying indexes:', err.message);
    process.exit(1);
  } finally {
    if (db) await db.destroy();
  }
}

main();
