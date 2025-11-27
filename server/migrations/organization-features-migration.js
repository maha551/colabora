/**
 * Database Migration for Organization Features Finalization
 * Adds fields for document workflow, deletion, and governance rules
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const config = require('../config');

const dbPath = config.DATABASE_URL || path.join(__dirname, '../../colabora.db');
const db = new sqlite3.Database(dbPath);

console.log('Running database migration for organization features...');

const migrations = [
  // Document workflow fields
  `ALTER TABLE documents ADD COLUMN paragraph_proposals_cutoff DATETIME`,
  `ALTER TABLE documents ADD COLUMN voting_started_at DATETIME`,
  `ALTER TABLE documents ADD COLUMN min_voters_required INTEGER DEFAULT 0`,
  `ALTER TABLE documents ADD COLUMN adopted_at DATETIME`,
  
  // Document deletion fields
  `ALTER TABLE documents ADD COLUMN deletion_proposed_at DATETIME`,
  `ALTER TABLE documents ADD COLUMN deletion_proposed_by TEXT`,
  `ALTER TABLE documents ADD COLUMN deletion_vote_deadline DATETIME`,
  
  // Update status enum to include new statuses
  // Note: SQLite doesn't support ALTER COLUMN, so we'll handle this in application logic
  
  // Governance rule fields
  `ALTER TABLE organization_governance_rules ADD COLUMN threshold_calculation_method TEXT CHECK(threshold_calculation_method IN ('all_votes', 'all_members')) DEFAULT 'all_votes'`,
  `ALTER TABLE organization_governance_rules ADD COLUMN default_acceptance_threshold REAL DEFAULT 75.0`,
  
  // Document deletion votes table
  `CREATE TABLE IF NOT EXISTS document_deletion_votes (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    vote TEXT CHECK(vote IN ('PRO', 'NEUTRAL', 'CONTRA')) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(document_id, user_id)
  )`,
  
  // Document status history table
  `CREATE TABLE IF NOT EXISTS document_status_history (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    old_status TEXT,
    new_status TEXT NOT NULL,
    changed_by TEXT,
    change_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (changed_by) REFERENCES users(id)
  )`,
  
  // Indexes for performance
  `CREATE INDEX IF NOT EXISTS idx_documents_status_deadline ON documents(status, proposal_deadline) WHERE status = 'proposal'`,
  `CREATE INDEX IF NOT EXISTS idx_documents_voting_deadline ON documents(status, voting_deadline) WHERE status = 'voting'`,
  `CREATE INDEX IF NOT EXISTS idx_documents_deletion_proposed ON documents(deletion_proposed_at) WHERE deletion_proposed_at IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_document_status_history_doc ON document_status_history(document_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_document_deletion_votes_doc ON document_deletion_votes(document_id)`
];

let completed = 0;
const total = migrations.length;

function runNextMigration() {
  if (completed >= total) {
    console.log('✅ All migrations completed successfully');
    db.close();
    return;
  }

  const sql = migrations[completed];
  const migrationName = sql.split(' ').slice(0, 3).join(' ');
  console.log(`Running migration ${completed + 1}/${total}: ${migrationName}...`);

  db.run(sql, (err) => {
    if (err) {
      // Ignore "duplicate column name" or "already exists" errors
      if (err.message.includes('duplicate column name') || 
          err.message.includes('already exists') ||
          err.message.includes('UNIQUE constraint failed')) {
        console.log(`⚠️  Column/table/index already exists, skipping: ${migrationName}`);
      } else {
        console.error('❌ Migration failed:', err.message);
        console.error('SQL:', sql);
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

