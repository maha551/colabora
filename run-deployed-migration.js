const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

async function runDeployedMigration() {
  const dbPath = '/data/colabora.db';

  console.log('🔄 Running database migration on deployed database...\n');

  try {
    // Check if database exists
    if (!fs.existsSync(dbPath)) {
      throw new Error(`Database file not found at ${dbPath}`);
    }

    const db = new sqlite3.Database(dbPath);

    console.log('1️⃣ Connected to database\n');

    // Enable foreign keys
    await runQuery(db, 'PRAGMA foreign_keys = ON;');

    // Add role column to users table if it doesn't exist
    console.log('2️⃣ Adding role column to users table...');
    try {
      await runQuery(db, `
        ALTER TABLE users ADD COLUMN role TEXT CHECK(role IN ('user', 'admin')) DEFAULT 'user'
      `);
      console.log('✅ Added role column to users table');
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('ℹ️ Role column already exists');
      } else {
        throw error;
      }
    }

    // Update Diana Prince to be admin
    console.log('3️⃣ Setting Diana Prince as admin...');
    await runQuery(db, `
      UPDATE users SET role = 'admin' WHERE name = 'Diana Prince'
    `);

    // Add governance tables
    console.log('4️⃣ Creating governance tables...');

    // Organization Governance Rules
    await runQuery(db, `
      CREATE TABLE IF NOT EXISTS organization_governance_rules (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        representative_term_months INTEGER DEFAULT 12,
        representative_term_limits INTEGER DEFAULT NULL,
        election_voting_method TEXT CHECK(election_voting_method IN ('simple_majority', 'ranked_choice', 'approval')) DEFAULT 'simple_majority',
        election_quorum_percentage REAL DEFAULT 0.5,
        election_notice_days INTEGER DEFAULT 14,
        default_voting_deadline_hours INTEGER DEFAULT 168,
        default_quorum_percentage REAL DEFAULT 0.5,
        anonymous_voting_enabled BOOLEAN DEFAULT 1,
        vote_change_allowed BOOLEAN DEFAULT 0,
        representative_can_create_votes BOOLEAN DEFAULT 1,
        representative_can_invite_members BOOLEAN DEFAULT 1,
        representative_can_manage_documents BOOLEAN DEFAULT 1,
        representative_approval_required BOOLEAN DEFAULT 1,
        tamper_proof_enabled BOOLEAN DEFAULT 1,
        audit_trail_enabled BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        UNIQUE(organization_id)
      )
    `);

    // Representative Elections
    await runQuery(db, `
      CREATE TABLE IF NOT EXISTS representative_elections (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        election_title TEXT NOT NULL,
        election_description TEXT,
        status TEXT CHECK(status IN ('draft', 'nomination', 'voting', 'completed', 'cancelled')) DEFAULT 'draft',
        positions_available INTEGER NOT NULL,
        term_start_date DATETIME,
        term_end_date DATETIME,
        nomination_starts_at DATETIME,
        nomination_ends_at DATETIME,
        voting_starts_at DATETIME,
        voting_ends_at DATETIME,
        quorum_required INTEGER,
        anonymous_voting BOOLEAN DEFAULT 1,
        total_voters INTEGER DEFAULT 0,
        votes_cast INTEGER DEFAULT 0,
        quorum_met BOOLEAN DEFAULT 0,
        election_completed_at DATETIME,
        created_by TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Election Candidates
    await runQuery(db, `
      CREATE TABLE IF NOT EXISTS election_candidates (
        id TEXT PRIMARY KEY,
        election_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        nominated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        nomination_statement TEXT,
        status TEXT CHECK(status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
        votes_received INTEGER DEFAULT 0,
        elected BOOLEAN DEFAULT 0,
        elected_position INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (election_id) REFERENCES representative_elections(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(election_id, user_id)
      )
    `);

    // Voting Sessions
    await runQuery(db, `
      CREATE TABLE IF NOT EXISTS voting_sessions (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        type TEXT CHECK(type IN ('policy', 'document', 'membership', 'dissolution')) NOT NULL,
        status TEXT CHECK(status IN ('draft', 'active', 'completed', 'cancelled')) DEFAULT 'draft',
        voting_starts_at DATETIME,
        voting_ends_at DATETIME,
        quorum_required INTEGER,
        anonymous_voting BOOLEAN DEFAULT 1,
        created_by TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Anonymous Vote Ballots
    await runQuery(db, `
      CREATE TABLE IF NOT EXISTS anonymous_vote_ballots (
        id TEXT PRIMARY KEY,
        voting_session_id TEXT NOT NULL,
        voter_token TEXT NOT NULL,
        vote_data TEXT NOT NULL,
        vote_hash TEXT NOT NULL,
        cast_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (voting_session_id) REFERENCES voting_sessions(id) ON DELETE CASCADE,
        UNIQUE(voting_session_id, voter_token)
      )
    `);

    // Voter Tokens
    await runQuery(db, `
      CREATE TABLE IF NOT EXISTS voter_tokens (
        id TEXT PRIMARY KEY,
        voting_session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        token TEXT NOT NULL,
        issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        used_at DATETIME,
        FOREIGN KEY (voting_session_id) REFERENCES voting_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(voting_session_id, user_id)
      )
    `);

    // Representative Terms
    await runQuery(db, `
      CREATE TABLE IF NOT EXISTS representative_terms (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        term_number INTEGER DEFAULT 1,
        elected_in_election_id TEXT,
        term_start_date DATETIME NOT NULL,
        term_end_date DATETIME NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (elected_in_election_id) REFERENCES representative_elections(id) ON DELETE SET NULL
      )
    `);

    // Voting Analytics
    await runQuery(db, `
      CREATE TABLE IF NOT EXISTS voting_analytics (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        period_start DATETIME NOT NULL,
        period_end DATETIME NOT NULL,
        total_members INTEGER DEFAULT 0,
        active_voters INTEGER DEFAULT 0,
        elections_held INTEGER DEFAULT 0,
        votes_cast INTEGER DEFAULT 0,
        decisions_made INTEGER DEFAULT 0,
        participation_rate REAL DEFAULT 0.0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        UNIQUE(organization_id, period_start, period_end)
      )
    `);

    // Policy Votes
    await runQuery(db, `
      CREATE TABLE IF NOT EXISTS policy_votes (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        document_id TEXT,
        status TEXT CHECK(status IN ('draft', 'active', 'completed', 'cancelled')) DEFAULT 'draft',
        threshold_percentage REAL DEFAULT 50.0,
        deadline_at DATETIME,
        anonymous_voting BOOLEAN DEFAULT 0,
        votes_yes INTEGER DEFAULT 0,
        votes_no INTEGER DEFAULT 0,
        votes_abstain INTEGER DEFAULT 0,
        created_by TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Policy Vote Responses
    await runQuery(db, `
      CREATE TABLE IF NOT EXISTS policy_vote_responses (
        id TEXT PRIMARY KEY,
        policy_vote_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        vote_choice TEXT CHECK(vote_choice IN ('yes', 'no', 'abstain')) NOT NULL,
        voted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (policy_vote_id) REFERENCES policy_votes(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(policy_vote_id, user_id)
      )
    `);

    // Governance Rule Proposals
    await runQuery(db, `
      CREATE TABLE IF NOT EXISTS governance_rule_proposals (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        current_rule_field TEXT NOT NULL,
        current_rule_value TEXT,
        proposed_rule_value TEXT NOT NULL,
        status TEXT CHECK(status IN ('draft', 'active', 'approved', 'rejected', 'cancelled')) DEFAULT 'draft',
        voting_starts_at DATETIME,
        voting_ends_at DATETIME,
        threshold_percentage REAL DEFAULT 75.0,
        anonymous_voting BOOLEAN DEFAULT 1,
        votes_yes INTEGER DEFAULT 0,
        votes_no INTEGER DEFAULT 0,
        votes_abstain INTEGER DEFAULT 0,
        total_voters INTEGER DEFAULT 0,
        votes_cast INTEGER DEFAULT 0,
        created_by TEXT NOT NULL,
        approved_at DATETIME,
        implemented_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Governance Rule Proposal Options (for multiple choice)
    await runQuery(db, `
      CREATE TABLE IF NOT EXISTS governance_rule_proposal_options (
        id TEXT PRIMARY KEY,
        proposal_id TEXT NOT NULL,
        option_title TEXT NOT NULL,
        option_description TEXT,
        proposed_value TEXT NOT NULL,
        votes_received INTEGER DEFAULT 0,
        FOREIGN KEY (proposal_id) REFERENCES governance_rule_proposals(id) ON DELETE CASCADE
      )
    `);

    // Governance Rule Proposal Votes
    await runQuery(db, `
      CREATE TABLE IF NOT EXISTS governance_rule_proposal_votes (
        id TEXT PRIMARY KEY,
        proposal_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        selected_option_id TEXT,
        vote_choice TEXT CHECK(vote_choice IN ('yes', 'no', 'abstain')),
        voted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (proposal_id) REFERENCES governance_rule_proposals(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (selected_option_id) REFERENCES governance_rule_proposal_options(id) ON DELETE CASCADE,
        UNIQUE(proposal_id, user_id)
      )
    `);

    // Organization Audit Log
    await runQuery(db, `
      CREATE TABLE IF NOT EXISTS organization_audit (
        id TEXT PRIMARY KEY,
        organization_id TEXT,
        action_type TEXT NOT NULL,
        performed_by_user_id TEXT NOT NULL,
        affected_user_id TEXT,
        details TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (performed_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (affected_user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Add updated_at triggers
    console.log('5️⃣ Adding updated_at triggers...');
    const tablesWithTriggers = [
      'organization_governance_rules',
      'representative_elections',
      'election_candidates',
      'voting_sessions',
      'voter_tokens',
      'representative_terms',
      'voting_analytics',
      'policy_votes',
      'policy_vote_responses',
      'governance_rule_proposals',
      'governance_rule_proposal_options',
      'governance_rule_proposal_votes'
    ];

    for (const table of tablesWithTriggers) {
      try {
        await runQuery(db, `
          CREATE TRIGGER IF NOT EXISTS update_${table}_updated_at
          AFTER UPDATE ON ${table}
          BEGIN
            UPDATE ${table} SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
          END;
        `);
      } catch (error) {
        console.log(`⚠️ Could not create trigger for ${table}: ${error.message}`);
      }
    }

    // Add indexes for performance
    console.log('6️⃣ Adding performance indexes...');
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_organization_governance_rules_org_id ON organization_governance_rules(organization_id)',
      'CREATE INDEX IF NOT EXISTS idx_representative_elections_org_id ON representative_elections(organization_id)',
      'CREATE INDEX IF NOT EXISTS idx_representative_elections_status ON representative_elections(status)',
      'CREATE INDEX IF NOT EXISTS idx_election_candidates_election_id ON election_candidates(election_id)',
      'CREATE INDEX IF NOT EXISTS idx_voting_sessions_org_id ON voting_sessions(organization_id)',
      'CREATE INDEX IF NOT EXISTS idx_voting_sessions_status ON voting_sessions(status)',
      'CREATE INDEX IF NOT EXISTS idx_anonymous_vote_ballots_session_id ON anonymous_vote_ballots(voting_session_id)',
      'CREATE INDEX IF NOT EXISTS idx_voter_tokens_session_id ON voter_tokens(voting_session_id)',
      'CREATE INDEX IF NOT EXISTS idx_representative_terms_org_id ON representative_terms(organization_id)',
      'CREATE INDEX IF NOT EXISTS idx_voting_analytics_org_id ON voting_analytics(organization_id)',
      'CREATE INDEX IF NOT EXISTS idx_policy_votes_org_id ON policy_votes(organization_id)',
      'CREATE INDEX IF NOT EXISTS idx_policy_vote_responses_vote_id ON policy_vote_responses(policy_vote_id)',
      'CREATE INDEX IF NOT EXISTS idx_governance_rule_proposals_org_id ON governance_rule_proposals(organization_id)',
      'CREATE INDEX IF NOT EXISTS idx_governance_rule_proposal_votes_proposal_id ON governance_rule_proposal_votes(proposal_id)',
      'CREATE INDEX IF NOT EXISTS idx_organization_audit_org_id ON organization_audit(organization_id)',
      'CREATE INDEX IF NOT EXISTS idx_organization_audit_action_type ON organization_audit(action_type)'
    ];

    for (const index of indexes) {
      try {
        await runQuery(db, index);
      } catch (error) {
        console.log(`⚠️ Could not create index: ${error.message}`);
      }
    }

    // Verify Diana is admin
    console.log('7️⃣ Verifying Diana Prince admin status...');
    const dianaResult = await runQuery(db, 'SELECT id, name, role FROM users WHERE name = ?', ['Diana Prince']);
    if (dianaResult && dianaResult.length > 0) {
      console.log(`✅ Diana Prince role: ${dianaResult[0].role}`);
      if (dianaResult[0].role !== 'admin') {
        console.log('🔧 Fixing Diana Prince role...');
        await runQuery(db, 'UPDATE users SET role = ? WHERE id = ?', ['admin', dianaResult[0].id]);
        console.log('✅ Diana Prince set as admin');
      }
    } else {
      console.log('⚠️ Diana Prince user not found');
    }

    console.log('\n🎉 Database migration completed successfully!');
    console.log('✅ All governance tables created');
    console.log('✅ Indexes and triggers added');
    console.log('✅ Diana Prince set as admin');

    db.close();

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

function runQuery(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this);
      }
    });
  });
}

function getQuery(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

function allQuery(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

runDeployedMigration();
