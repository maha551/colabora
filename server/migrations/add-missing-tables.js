/**
 * Migration to add all missing tables that are referenced in code
 * but not created during database initialization
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const config = require('../config');

const dbPath = config.DATABASE_URL || path.join(__dirname, '../../colabora.db');
const db = new sqlite3.Database(dbPath);

console.log('Running migration to add missing tables...\n');

const migrations = [
  // Note: organization_representatives is NOT a table - representatives are stored as JSON in organizations.representatives
  // So we skip that one

  // Representative Elections Table
  `CREATE TABLE IF NOT EXISTS representative_elections (
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
    FOREIGN KEY (created_by) REFERENCES users(id)
  )`,

  // Election Candidates Table
  `CREATE TABLE IF NOT EXISTS election_candidates (
    id TEXT PRIMARY KEY,
    election_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    candidate_statement TEXT,
    accepted_nomination BOOLEAN DEFAULT 0,
    nominated_by TEXT,
    nomination_accepted_at DATETIME,
    votes_received INTEGER DEFAULT 0,
    elected BOOLEAN DEFAULT 0,
    elected_position INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (election_id) REFERENCES representative_elections(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (nominated_by) REFERENCES users(id),
    UNIQUE(election_id, user_id)
  )`,

  // Election Votes Table
  `CREATE TABLE IF NOT EXISTS election_votes (
    id TEXT PRIMARY KEY,
    election_id TEXT NOT NULL,
    candidate_id TEXT,
    user_id TEXT NOT NULL,
    anonymous_token TEXT,
    vote_rank INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (election_id) REFERENCES representative_elections(id) ON DELETE CASCADE,
    FOREIGN KEY (candidate_id) REFERENCES election_candidates(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(election_id, user_id, candidate_id)
  )`,

  // Voting Sessions Table
  `CREATE TABLE IF NOT EXISTS voting_sessions (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    session_type TEXT CHECK(session_type IN ('election', 'policy', 'document', 'membership', 'dissolution', 'other')) NOT NULL,
    related_entity_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT CHECK(status IN ('draft', 'pending_approval', 'announced', 'active', 'completed', 'cancelled', 'failed')) DEFAULT 'draft',
    anonymous_voting BOOLEAN DEFAULT 1,
    deadline_hours INTEGER DEFAULT 168,
    quorum_percentage REAL DEFAULT 0.5,
    required_majority REAL DEFAULT 0.5,
    voting_starts_at DATETIME,
    voting_ends_at DATETIME,
    announced_at DATETIME,
    completed_at DATETIME,
    eligible_voters_count INTEGER DEFAULT 0,
    votes_cast_count INTEGER DEFAULT 0,
    quorum_met BOOLEAN DEFAULT 0,
    yes_votes INTEGER DEFAULT 0,
    no_votes INTEGER DEFAULT 0,
    abstain_votes INTEGER DEFAULT 0,
    result TEXT CHECK(result IN ('pending', 'approved', 'rejected', 'tied', 'quorum_not_met', 'cancelled')),
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id)
  )`,

  // Voting Session Votes Table
  `CREATE TABLE IF NOT EXISTS voting_session_votes (
    id TEXT PRIMARY KEY,
    voting_session_id TEXT NOT NULL,
    user_id TEXT,
    anonymous_token TEXT,
    vote TEXT CHECK(vote IN ('yes', 'no', 'abstain')) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (voting_session_id) REFERENCES voting_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(voting_session_id, anonymous_token)
  )`,

  // Voting Analytics Table (created on-demand but good to have)
  `CREATE TABLE IF NOT EXISTS voting_analytics (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    total_members INTEGER DEFAULT 0,
    active_voters INTEGER DEFAULT 0,
    total_votes_cast INTEGER DEFAULT 0,
    average_votes_per_member REAL DEFAULT 0,
    elections_held INTEGER DEFAULT 0,
    average_election_turnout REAL DEFAULT 0,
    quorum_achieved_percentage REAL DEFAULT 0,
    total_decisions_made INTEGER DEFAULT 0,
    decisions_passed INTEGER DEFAULT 0,
    decisions_failed INTEGER DEFAULT 0,
    average_decision_time_hours REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
  )`,

  // Indexes
  `CREATE INDEX IF NOT EXISTS idx_representative_elections_org ON representative_elections(organization_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_election_candidates_election ON election_candidates(election_id)`,
  `CREATE INDEX IF NOT EXISTS idx_election_votes_election ON election_votes(election_id)`,
  `CREATE INDEX IF NOT EXISTS idx_voting_sessions_org ON voting_sessions(organization_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_voting_analytics_org ON voting_analytics(organization_id, period_start, period_end)`
];

let completed = 0;
const total = migrations.length;

function runNextMigration() {
  if (completed >= total) {
    console.log('\n✅ All migrations completed successfully');
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
        console.error('SQL:', sql.substring(0, 100) + '...');
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

