/**
 * Migration to add governance rule proposal tables
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const config = require('../config');

const dbPath = config.DATABASE_URL || path.join(__dirname, '../../colabora.db');
const db = new sqlite3.Database(dbPath);

console.log('Running migration to add rule proposal tables...');

const migrations = [
  // Governance rule proposals table
  `CREATE TABLE IF NOT EXISTS governance_rule_proposals (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    current_rule_field TEXT NOT NULL,
    current_rule_value TEXT,
    proposed_rule_value TEXT,
    status TEXT CHECK(status IN ('draft', 'voting', 'approved', 'rejected', 'expired')) DEFAULT 'draft',
    created_by TEXT NOT NULL,
    voting_deadline DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
  )`,

  // Governance rule proposal options (for multi-option proposals)
  `CREATE TABLE IF NOT EXISTS governance_rule_proposal_options (
    id TEXT PRIMARY KEY,
    proposal_id TEXT NOT NULL,
    option_title TEXT NOT NULL,
    option_description TEXT,
    proposed_value TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (proposal_id) REFERENCES governance_rule_proposals(id) ON DELETE CASCADE
  )`,

  // Governance rule proposal votes
  `CREATE TABLE IF NOT EXISTS governance_rule_proposal_votes (
    id TEXT PRIMARY KEY,
    proposal_id TEXT NOT NULL,
    option_id TEXT,
    user_id TEXT NOT NULL,
    vote TEXT CHECK(vote IN ('PRO', 'NEUTRAL', 'CONTRA')) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (proposal_id) REFERENCES governance_rule_proposals(id) ON DELETE CASCADE,
    FOREIGN KEY (option_id) REFERENCES governance_rule_proposal_options(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(proposal_id, user_id)
  )`,

  // Indexes
  `CREATE INDEX IF NOT EXISTS idx_rule_proposals_org ON governance_rule_proposals(organization_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_rule_proposals_deadline ON governance_rule_proposals(voting_deadline) WHERE status = 'voting'`,
  `CREATE INDEX IF NOT EXISTS idx_rule_proposal_options_proposal ON governance_rule_proposal_options(proposal_id)`,
  `CREATE INDEX IF NOT EXISTS idx_rule_proposal_votes_proposal ON governance_rule_proposal_votes(proposal_id)`
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
      if (err.message.includes('already exists')) {
        console.log(`⚠️  Table/index already exists, skipping: ${migrationName}`);
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

