/**
 * Database Migration for Democratic Constitution System
 * Adds fields for member permissions, bootstrap mode, recovery mode, and rule history
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const config = require('../config');

const dbPath = config.DATABASE_URL || path.join(__dirname, '../../colabora.db');
const db = new sqlite3.Database(dbPath);

console.log('Running database migration for democratic constitution system...');

const migrations = [
  // ============================================
  // Organization Governance Rules Table Updates
  // ============================================
  
  // Member permission flags
  `ALTER TABLE organization_governance_rules ADD COLUMN members_can_propose_rules BOOLEAN DEFAULT 0`,
  `ALTER TABLE organization_governance_rules ADD COLUMN members_can_propose_rules_threshold REAL DEFAULT 0.5`,
  `ALTER TABLE organization_governance_rules ADD COLUMN members_can_create_documents BOOLEAN DEFAULT 0`,
  `ALTER TABLE organization_governance_rules ADD COLUMN members_can_create_documents_threshold REAL DEFAULT 0.5`,
  `ALTER TABLE organization_governance_rules ADD COLUMN members_can_initialize_elections BOOLEAN DEFAULT 0`,
  `ALTER TABLE organization_governance_rules ADD COLUMN members_can_initialize_elections_threshold REAL DEFAULT 0.5`,
  `ALTER TABLE organization_governance_rules ADD COLUMN members_can_invite_members BOOLEAN DEFAULT 0`,
  `ALTER TABLE organization_governance_rules ADD COLUMN members_can_invite_members_threshold REAL DEFAULT 0.5`,
  `ALTER TABLE organization_governance_rules ADD COLUMN members_can_manage_rule_proposals BOOLEAN DEFAULT 0`,
  `ALTER TABLE organization_governance_rules ADD COLUMN members_can_manage_rule_proposals_threshold REAL DEFAULT 0.5`,

  // Minimum safeguards (system-enforced, cannot be changed by voting)
  `ALTER TABLE organization_governance_rules ADD COLUMN minimum_quorum_percentage REAL DEFAULT 0.1`,
  `ALTER TABLE organization_governance_rules ADD COLUMN minimum_approval_threshold REAL DEFAULT 0.5`,
  `ALTER TABLE organization_governance_rules ADD COLUMN minimum_voting_period_hours INTEGER DEFAULT 24`,

  // Bootstrap mode
  `ALTER TABLE organization_governance_rules ADD COLUMN bootstrap_mode BOOLEAN DEFAULT 1`,
  `ALTER TABLE organization_governance_rules ADD COLUMN bootstrap_completed_at DATETIME`,

  // Recovery mode
  `ALTER TABLE organization_governance_rules ADD COLUMN recovery_mode BOOLEAN DEFAULT 0`,
  `ALTER TABLE organization_governance_rules ADD COLUMN recovery_mode_entered_at DATETIME`,
  `ALTER TABLE organization_governance_rules ADD COLUMN recovery_mode_reason TEXT`,

  // Safety tracking
  `ALTER TABLE organization_governance_rules ADD COLUMN last_successful_vote_at DATETIME`,
  `ALTER TABLE organization_governance_rules ADD COLUMN failed_proposals_count INTEGER DEFAULT 0`,
  `ALTER TABLE organization_governance_rules ADD COLUMN last_failed_proposal_at DATETIME`,
  `ALTER TABLE organization_governance_rules ADD COLUMN rule_changes_this_month INTEGER DEFAULT 0`,
  `ALTER TABLE organization_governance_rules ADD COLUMN last_rule_change_at DATETIME`,

  // ============================================
  // Governance Rule Proposals Table Updates
  // ============================================
  
  // Rule snapshot for active votes
  `ALTER TABLE governance_rule_proposals ADD COLUMN snapshot_rules TEXT`,
  
  // Cooldown tracking
  `ALTER TABLE governance_rule_proposals ADD COLUMN cooldown_until DATETIME`,

  // ============================================
  // New Table: Governance Rule History
  // ============================================
  
  `CREATE TABLE IF NOT EXISTS governance_rule_history (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    rule_field TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_by_proposal_id TEXT,
    changed_by_user_id TEXT,
    changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (changed_by_proposal_id) REFERENCES governance_rule_proposals(id),
    FOREIGN KEY (changed_by_user_id) REFERENCES users(id)
  )`,

  // Indexes for rule history
  `CREATE INDEX IF NOT EXISTS idx_rule_history_org_field ON governance_rule_history(organization_id, rule_field, changed_at)`,
  `CREATE INDEX IF NOT EXISTS idx_rule_history_proposal ON governance_rule_history(changed_by_proposal_id)`,
  `CREATE INDEX IF NOT EXISTS idx_rule_history_user ON governance_rule_history(changed_by_user_id)`
];

let completed = 0;
const total = migrations.length;

function runNextMigration() {
  if (completed >= total) {
    console.log('✅ All migrations completed successfully');
    
    // Update existing organizations with safe defaults
    console.log('Updating existing organizations with safe defaults...');
    
    db.run(`
      UPDATE organization_governance_rules
      SET 
        bootstrap_mode = 0,
        bootstrap_completed_at = COALESCE(
          (SELECT created_at FROM organizations 
           WHERE organizations.id = organization_governance_rules.organization_id),
          datetime('now')
        ),
        members_can_propose_rules = 0,
        members_can_create_documents = 0,
        members_can_initialize_elections = 0,
        members_can_invite_members = 0,
        members_can_manage_rule_proposals = 0,
        minimum_quorum_percentage = 0.1,
        minimum_approval_threshold = 0.5,
        minimum_voting_period_hours = 24,
        updated_at = datetime('now')
      WHERE bootstrap_mode IS NULL OR bootstrap_completed_at IS NULL
    `, (err) => {
      if (err) {
        console.error('❌ Error updating existing organizations:', err.message);
        db.close();
        process.exit(1);
      } else {
        console.log('✅ Existing organizations updated with safe defaults');
        console.log('✅ Migration complete!');
        db.close();
      }
    });
    
    return;
  }

  const sql = migrations[completed];
  const migrationName = sql.split(' ').slice(0, 4).join(' ');
  console.log(`Running migration ${completed + 1}/${total}: ${migrationName}...`);

  db.run(sql, (err) => {
    if (err) {
      // Ignore "duplicate column name" or "already exists" errors (idempotent)
      if (err.message.includes('duplicate column name') || 
          err.message.includes('already exists') ||
          err.message.includes('UNIQUE constraint failed') ||
          err.message.includes('no such column')) {
        console.log(`⚠️  Column/table/index already exists or not applicable, skipping: ${migrationName}`);
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

