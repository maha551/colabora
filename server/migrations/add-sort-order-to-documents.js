/**
 * Database Migration: Add sort_order field to documents table
 * Adds a REAL column for fractional ordering of documents within the tree structure
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const config = require('../config');

const dbPath = config.DATABASE_URL || path.join(__dirname, '../../colabora.db');
const db = new sqlite3.Database(dbPath);

console.log('Running database migration to add sort_order to documents...');

const migrations = [
  // Add sort_order column (allows NULL for backward compatibility)
  `ALTER TABLE documents ADD COLUMN sort_order REAL`,

  // Create index for efficient sibling queries
  `CREATE INDEX IF NOT EXISTS idx_documents_parent_sort ON documents(parent_id, sort_order)`,

  // Initialize existing documents with sort_order based on created_at timestamp
  `UPDATE documents 
   SET sort_order = CAST(strftime('%s', created_at) AS REAL) 
   WHERE sort_order IS NULL`
];

let completed = 0;
const total = migrations.length;

function runNextMigration() {
  if (completed >= total) {
    console.log('\n✅ All sort_order migrations completed successfully');
    db.close();
    return;
  }

  const sql = migrations[completed];
  const migrationName = sql.split(' ').slice(0, 3).join(' ');
  console.log(`Running migration ${completed + 1}/${total}: ${migrationName}...`);

  db.run(sql, (err) => {
    if (err) {
      if (err.message.includes('already exists') || 
          err.message.includes('duplicate') ||
          err.message.includes('UNIQUE constraint failed') ||
          err.message.includes('duplicate column name')) {
        console.log(`⚠️  Column/index already exists, skipping: ${migrationName}`);
      } else {
        console.error('❌ Migration failed:', err.message);
        console.error('SQL:', sql.substring(0, 200) + '...');
        db.close();
        process.exit(1);
      }
    } else {
      console.log(`✅ Migration ${completed + 1} completed`);
    }

    completed++;
    runNextMigration();
  });
}

runNextMigration();
