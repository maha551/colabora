/**
 * Database Migration for Document Tree Proposals
 * Creates tables for proposing and voting on document tree structure changes
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const config = require('../config');

const dbPath = config.DATABASE_URL || path.join(__dirname, '../../colabora.db');
const db = new sqlite3.Database(dbPath);

console.log('Running database migration for document tree proposals...');

const migrations = [
  // Create document_tree_proposals table
  `CREATE TABLE IF NOT EXISTS document_tree_proposals (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    proposed_by_user_id TEXT NOT NULL,
    operation_type TEXT NOT NULL CHECK(operation_type IN ('MOVE', 'DELETE', 'REORDER')),
    target_parent_id TEXT,
    new_order INTEGER,
    reason TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'applied')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (proposed_by_user_id) REFERENCES users(id)
  )`,

  // Create document_tree_proposal_votes table
  `CREATE TABLE IF NOT EXISTS document_tree_proposal_votes (
    id TEXT PRIMARY KEY,
    proposal_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    vote TEXT NOT NULL CHECK(vote IN ('PRO', 'NEUTRAL', 'CONTRA')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (proposal_id) REFERENCES document_tree_proposals(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(proposal_id, user_id)
  )`,

  // Indexes for performance
  `CREATE INDEX IF NOT EXISTS idx_tree_proposals_document ON document_tree_proposals(document_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_tree_proposals_org ON document_tree_proposals(organization_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_tree_proposals_status ON document_tree_proposals(status, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_tree_proposal_votes_proposal ON document_tree_proposal_votes(proposal_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tree_proposal_votes_user ON document_tree_proposal_votes(user_id)`
];

let completed = 0;
const total = migrations.length;

function runNextMigration() {
  if (completed >= total) {
    console.log('\n✅ All document tree proposals migrations completed successfully');
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
          err.message.includes('UNIQUE constraint failed')) {
        console.log(`⚠️  Table/index already exists, skipping: ${migrationName}`);
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
