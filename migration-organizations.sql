-- Database migration for Organization & Democratic Governance features
-- Run this on existing databases to add organization tables

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  representatives TEXT NOT NULL, -- JSON array of user IDs
  membership_policy TEXT CHECK(policy IN ('open', 'invitation')) DEFAULT 'invitation',
  voting_threshold REAL DEFAULT 0.5,
  is_active BOOLEAN DEFAULT true,
  created_by_admin_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by_admin_id) REFERENCES users(id)
);

-- Organization membership with status tracking
CREATE TABLE IF NOT EXISTS organization_members (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT CHECK(status IN ('active', 'legacy', 'suspended')) DEFAULT 'active',
  invited_by_rep_id TEXT,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  left_at DATETIME,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (invited_by_rep_id) REFERENCES users(id),
  UNIQUE(organization_id, user_id)
);

-- Organization votes
CREATE TABLE IF NOT EXISTS organization_votes (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  vote_type TEXT CHECK(type IN ('policy', 'document_change', 'membership', 'dissolution', 'other')),
  proposed_by_user_id TEXT NOT NULL,
  approved_by_rep_id TEXT,
  threshold REAL NOT NULL,
  status TEXT CHECK(status IN ('proposed', 'approved', 'voting', 'passed', 'failed', 'cancelled')),
  voting_starts_at DATETIME,
  voting_ends_at DATETIME,
  result_yes INTEGER DEFAULT 0,
  result_no INTEGER DEFAULT 0,
  result_abstain INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (proposed_by_user_id) REFERENCES users(id),
  FOREIGN KEY (approved_by_rep_id) REFERENCES users(id)
);

-- Vote ballots with member status tracking
CREATE TABLE IF NOT EXISTS vote_ballots (
  id TEXT PRIMARY KEY,
  vote_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  membership_status TEXT CHECK(status IN ('active', 'legacy')),
  vote_choice TEXT CHECK(choice IN ('yes', 'no', 'abstain')),
  voted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vote_id) REFERENCES organization_votes(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(vote_id, user_id)
);

-- Comprehensive audit trail
CREATE TABLE IF NOT EXISTS organization_audit (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  action_type TEXT CHECK(type IN (
    'org_created', 'rep_added', 'rep_removed', 'rep_removal_failed',
    'member_invited', 'member_joined', 'member_left', 'member_bulk_added',
    'vote_proposed', 'vote_approved', 'vote_started', 'vote_completed',
    'doc_created', 'document_proposal_created', 'document_proposal_voted', 'document_proposal_approved',
    'dissolution_proposed', 'org_dissolved'
  )),
  performed_by_user_id TEXT NOT NULL,
  affected_user_id TEXT,
  details TEXT, -- JSON with full action details
  ip_address TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (performed_by_user_id) REFERENCES users(id),
  FOREIGN KEY (affected_user_id) REFERENCES users(id)
);

-- Create documents table if it doesn't exist (for organization support)
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  owner_id TEXT NOT NULL,
  collaborators TEXT, -- JSON array of user IDs
  organization_id TEXT,
  ownership_type TEXT CHECK(ownership_type IN ('personal', 'shared', 'organizational')) DEFAULT 'personal',
  acceptance_threshold REAL DEFAULT 75.0,
  voting_anonymous BOOLEAN DEFAULT false,
  voting_anonymity_locked BOOLEAN DEFAULT false,
  vote_change_allowed BOOLEAN DEFAULT true,
  structure_proposals_enabled BOOLEAN DEFAULT false,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

-- Document proposals for organization governance
CREATE TABLE IF NOT EXISTS document_proposals (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  proposed_by_user_id TEXT NOT NULL,
  contributors TEXT, -- JSON array of user IDs
  document_options TEXT, -- JSON object with document settings
  approved BOOLEAN DEFAULT false,
  applied BOOLEAN DEFAULT false,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (proposed_by_user_id) REFERENCES users(id)
);

-- Votes on document proposals
CREATE TABLE IF NOT EXISTS document_proposal_votes (
  id TEXT PRIMARY KEY,
  document_proposal_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  vote TEXT CHECK(vote IN ('PRO', 'NEUTRAL', 'CONTRA')) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_proposal_id) REFERENCES document_proposals(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(document_proposal_id, user_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_organization_members_org_user
ON organization_members(organization_id, user_id);

CREATE INDEX IF NOT EXISTS idx_organization_members_status
ON organization_members(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_organization_votes_org_status
ON organization_votes(organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vote_ballots_vote_user
ON vote_ballots(vote_id, user_id);

CREATE INDEX IF NOT EXISTS idx_organization_audit_org_action
ON organization_audit(organization_id, action_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_proposals_org_status
ON document_proposals(organization_id, approved, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_proposal_votes_proposal_vote
ON document_proposal_votes(document_proposal_id, vote);

-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- Analyze the database after adding tables and indexes
ANALYZE;

-- Migration completed successfully
-- All organization tables have been created
-- Documents table has been updated with new columns
