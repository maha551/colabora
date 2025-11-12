-- Governance Rules Migration for Organization Feature
-- Professional, clean database schema for democratic governance

-- Organization Governance Rules Table
-- Stores configurable governance settings for each organization
CREATE TABLE IF NOT EXISTS organization_governance_rules (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    -- Representative Elections
    representative_term_months INTEGER DEFAULT 12, -- How long representatives serve (months)
    representative_term_limits INTEGER DEFAULT NULL, -- NULL = no limit, otherwise max consecutive terms
    election_voting_method TEXT CHECK(election_voting_method IN ('simple_majority', 'ranked_choice', 'approval')) DEFAULT 'simple_majority',
    election_quorum_percentage REAL DEFAULT 0.5, -- Percentage of members needed to participate (0.5 = 50%)
    election_notice_days INTEGER DEFAULT 14, -- Days notice before election

    -- General Voting Rules
    default_voting_deadline_hours INTEGER DEFAULT 168, -- 7 days default
    default_quorum_percentage REAL DEFAULT 0.5, -- Default quorum for non-election votes
    anonymous_voting_enabled BOOLEAN DEFAULT 1, -- Whether voting is anonymous by default
    vote_change_allowed BOOLEAN DEFAULT 0, -- Can members change votes after casting?

    -- Representative Powers
    representative_can_create_votes BOOLEAN DEFAULT 1,
    representative_can_invite_members BOOLEAN DEFAULT 1,
    representative_can_manage_documents BOOLEAN DEFAULT 1,
    representative_approval_required BOOLEAN DEFAULT 1, -- Must representatives approve votes before they start?

    -- Audit & Compliance
    tamper_proof_enabled BOOLEAN DEFAULT 1, -- Enable cryptographic verification
    audit_trail_enabled BOOLEAN DEFAULT 1,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    UNIQUE(organization_id)
);

-- Representative Elections Table
-- Manages election cycles and results
CREATE TABLE IF NOT EXISTS representative_elections (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    election_title TEXT NOT NULL, -- e.g., "Annual Representative Election 2024"
    election_description TEXT,

    -- Election Configuration
    status TEXT CHECK(status IN ('draft', 'nomination', 'voting', 'completed', 'cancelled')) DEFAULT 'draft',
    positions_available INTEGER NOT NULL, -- How many representatives to elect
    term_start_date DATETIME, -- When elected representatives take office
    term_end_date DATETIME, -- When their term expires

    -- Election Phases
    nomination_starts_at DATETIME,
    nomination_ends_at DATETIME,
    voting_starts_at DATETIME,
    voting_ends_at DATETIME,
    quorum_required INTEGER, -- Minimum number of voters needed
    anonymous_voting BOOLEAN DEFAULT 1,

    -- Results
    total_voters INTEGER DEFAULT 0,
    votes_cast INTEGER DEFAULT 0,
    quorum_met BOOLEAN DEFAULT 0,
    election_completed_at DATETIME,

    created_by TEXT NOT NULL, -- Representative who called the election
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Election Candidates Table
-- People running for representative positions
CREATE TABLE IF NOT EXISTS election_candidates (
    id TEXT PRIMARY KEY,
    election_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    candidate_statement TEXT, -- Why they want to be representative
    accepted_nomination BOOLEAN DEFAULT 0, -- Must accept to be official candidate
    nominated_by TEXT, -- Who nominated them (can be self)
    nomination_accepted_at DATETIME,

    -- Election Results
    votes_received INTEGER DEFAULT 0,
    elected BOOLEAN DEFAULT 0,
    elected_position INTEGER, -- 1st place, 2nd place, etc.

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (election_id) REFERENCES representative_elections(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (nominated_by) REFERENCES users(id),
    UNIQUE(election_id, user_id)
);

-- Anonymous Voting Sessions Table
-- Manages voting sessions with anonymity and deadlines
CREATE TABLE IF NOT EXISTS voting_sessions (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    session_type TEXT CHECK(session_type IN ('election', 'policy', 'document', 'membership', 'dissolution', 'other')) NOT NULL,
    related_entity_id TEXT, -- election_id, document_id, etc.

    -- Session Configuration
    title TEXT NOT NULL,
    description TEXT,
    status TEXT CHECK(status IN ('draft', 'pending_approval', 'announced', 'active', 'completed', 'cancelled', 'failed')) DEFAULT 'draft',

    -- Voting Rules
    anonymous_voting BOOLEAN DEFAULT 1,
    deadline_hours INTEGER DEFAULT 168, -- Hours from creation to deadline
    quorum_percentage REAL DEFAULT 0.5, -- Percentage of eligible voters needed
    required_majority REAL DEFAULT 0.5, -- Percentage needed for approval (0.5 = simple majority)

    -- Timing
    voting_starts_at DATETIME,
    voting_ends_at DATETIME,
    announced_at DATETIME,
    completed_at DATETIME,

    -- Participation Tracking
    eligible_voters_count INTEGER DEFAULT 0,
    votes_cast_count INTEGER DEFAULT 0,
    quorum_met BOOLEAN DEFAULT 0,

    -- Results
    yes_votes INTEGER DEFAULT 0,
    no_votes INTEGER DEFAULT 0,
    abstain_votes INTEGER DEFAULT 0,
    result TEXT CHECK(result IN ('pending', 'approved', 'rejected', 'tied', 'quorum_not_met', 'cancelled')),

    -- Metadata
    created_by TEXT NOT NULL,
    approved_by TEXT, -- Representative who approved the vote
    approved_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (approved_by) REFERENCES users(id)
);

-- Anonymous Vote Ballots Table
-- Individual votes in anonymous voting sessions
CREATE TABLE IF NOT EXISTS anonymous_vote_ballots (
    id TEXT PRIMARY KEY,
    voting_session_id TEXT NOT NULL,
    voter_token TEXT NOT NULL, -- Anonymous token instead of user_id
    vote_choice TEXT CHECK(vote_choice IN ('yes', 'no', 'abstain')) NOT NULL,
    vote_weight INTEGER DEFAULT 1, -- For weighted voting if needed later
    voted_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Verification (for tamper-proofing)
    vote_hash TEXT, -- Cryptographic hash for verification
    ip_address TEXT, -- For audit trails (anonymized)
    user_agent_hash TEXT, -- Anonymized user agent

    FOREIGN KEY (voting_session_id) REFERENCES voting_sessions(id) ON DELETE CASCADE,
    UNIQUE(voting_session_id, voter_token)
);

-- Voter Tokens Table
-- Maps anonymous tokens to users for a specific voting session
-- This allows verification without revealing voter identity
CREATE TABLE IF NOT EXISTS voter_tokens (
    id TEXT PRIMARY KEY,
    voting_session_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    anonymous_token TEXT NOT NULL, -- Random token for anonymity
    token_issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    token_used BOOLEAN DEFAULT 0,
    token_used_at DATETIME,

    FOREIGN KEY (voting_session_id) REFERENCES voting_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(voting_session_id, user_id),
    UNIQUE(voting_session_id, anonymous_token)
);

-- Representative Terms Table
-- Tracks representative terms and history
CREATE TABLE IF NOT EXISTS representative_terms (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    term_number INTEGER NOT NULL, -- Which term this is for the user (1, 2, 3, etc.)
    elected_in_election_id TEXT, -- Which election brought them to power

    -- Term Details
    term_start_date DATETIME NOT NULL,
    term_end_date DATETIME NOT NULL,
    term_status TEXT CHECK(term_status IN ('active', 'completed', 'removed', 'resigned')) DEFAULT 'active',

    -- Termination Details
    removed_by TEXT, -- Representative who removed them
    removed_at DATETIME,
    removal_reason TEXT,
    resigned_at DATETIME,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (elected_in_election_id) REFERENCES representative_elections(id),
    FOREIGN KEY (removed_by) REFERENCES users(id),
    UNIQUE(organization_id, user_id, term_number)
);

-- Voting Analytics Table
-- Tracks voting participation and engagement metrics
CREATE TABLE IF NOT EXISTS voting_analytics (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    -- Participation Metrics
    total_members INTEGER DEFAULT 0,
    active_voters INTEGER DEFAULT 0, -- Members who voted at least once
    total_votes_cast INTEGER DEFAULT 0,
    average_votes_per_member REAL DEFAULT 0,

    -- Election Metrics
    elections_held INTEGER DEFAULT 0,
    average_election_turnout REAL DEFAULT 0,
    quorum_achieved_percentage REAL DEFAULT 0,

    -- Decision Metrics
    total_decisions_made INTEGER DEFAULT 0,
    decisions_passed INTEGER DEFAULT 0,
    decisions_failed INTEGER DEFAULT 0,
    average_decision_time_hours REAL DEFAULT 0, -- How long decisions take

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    UNIQUE(organization_id, period_start, period_end)
);

-- Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_governance_rules_org ON organization_governance_rules(organization_id);
CREATE INDEX IF NOT EXISTS idx_elections_org_status ON representative_elections(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_elections_dates ON representative_elections(voting_starts_at, voting_ends_at);
CREATE INDEX IF NOT EXISTS idx_candidates_election ON election_candidates(election_id, elected);
CREATE INDEX IF NOT EXISTS idx_voting_sessions_org_status ON voting_sessions(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_voting_sessions_dates ON voting_sessions(voting_starts_at, voting_ends_at);
CREATE INDEX IF NOT EXISTS idx_vote_ballots_session ON anonymous_vote_ballots(voting_session_id);
CREATE INDEX IF NOT EXISTS idx_voter_tokens_session ON voter_tokens(voting_session_id, anonymous_token);
CREATE INDEX IF NOT EXISTS idx_representative_terms_org_user ON representative_terms(organization_id, user_id, term_status);
CREATE INDEX IF NOT EXISTS idx_analytics_org_period ON voting_analytics(organization_id, period_start, period_end);

-- Triggers for Updated At
CREATE TRIGGER IF NOT EXISTS update_governance_rules_updated_at
    AFTER UPDATE ON organization_governance_rules
BEGIN
    UPDATE organization_governance_rules SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_elections_updated_at
    AFTER UPDATE ON representative_elections
BEGIN
    UPDATE representative_elections SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_candidates_updated_at
    AFTER UPDATE ON election_candidates
BEGIN
    UPDATE election_candidates SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_voting_sessions_updated_at
    AFTER UPDATE ON voting_sessions
BEGIN
    UPDATE voting_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_terms_updated_at
    AFTER UPDATE ON representative_terms
BEGIN
    UPDATE representative_terms SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_analytics_updated_at
    AFTER UPDATE ON voting_analytics
BEGIN
    UPDATE voting_analytics SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Policy Votes for Document Implementation
CREATE TABLE IF NOT EXISTS policy_votes (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    document_id TEXT, -- Reference to documents table
    status TEXT CHECK(status IN ('draft', 'active', 'completed', 'cancelled')) DEFAULT 'draft',

    -- Voting parameters
    threshold_percentage REAL DEFAULT 50.0, -- Percentage needed to pass
    deadline_at DATETIME,
    anonymous_voting BOOLEAN DEFAULT 0,

    -- Vote counts
    votes_yes INTEGER DEFAULT 0,
    votes_no INTEGER DEFAULT 0,
    votes_abstain INTEGER DEFAULT 0,

    -- Metadata
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Policy Vote Responses
CREATE TABLE IF NOT EXISTS policy_vote_responses (
    id TEXT PRIMARY KEY,
    policy_vote_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    vote TEXT CHECK(vote IN ('yes', 'no', 'abstain')) NOT NULL,
    voted_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (policy_vote_id) REFERENCES policy_votes(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(policy_vote_id, user_id) -- One vote per user per policy vote
);

-- Indexes for Policy Votes
CREATE INDEX IF NOT EXISTS idx_policy_votes_org ON policy_votes(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_policy_votes_document ON policy_votes(document_id);
CREATE INDEX IF NOT EXISTS idx_policy_vote_responses_vote ON policy_vote_responses(policy_vote_id, vote);

-- Rule Change Proposals
CREATE TABLE IF NOT EXISTS governance_rule_proposals (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    current_rule_field TEXT NOT NULL, -- Which governance rule field is being changed
    current_rule_value TEXT, -- Current value as JSON string
    proposed_rule_value TEXT NOT NULL, -- Proposed new value as JSON string

    -- Proposal Status
    status TEXT CHECK(status IN ('draft', 'active', 'approved', 'rejected', 'cancelled')) DEFAULT 'draft',

    -- Voting Configuration
    voting_starts_at DATETIME,
    voting_ends_at DATETIME,
    threshold_percentage REAL DEFAULT 75.0, -- Higher threshold for rule changes
    anonymous_voting BOOLEAN DEFAULT 1,

    -- Voting Results
    votes_yes INTEGER DEFAULT 0,
    votes_no INTEGER DEFAULT 0,
    votes_abstain INTEGER DEFAULT 0,
    total_voters INTEGER DEFAULT 0,
    votes_cast INTEGER DEFAULT 0,

    -- Metadata
    created_by TEXT NOT NULL,
    approved_at DATETIME,
    implemented_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Rule Proposal Voting Options (for complex proposals with multiple choices)
CREATE TABLE IF NOT EXISTS governance_rule_proposal_options (
    id TEXT PRIMARY KEY,
    proposal_id TEXT NOT NULL,
    option_title TEXT NOT NULL,
    option_description TEXT,
    proposed_value TEXT NOT NULL, -- The specific value for this option

    -- Voting for this option
    votes_received INTEGER DEFAULT 0,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (proposal_id) REFERENCES governance_rule_proposals(id) ON DELETE CASCADE
);

-- Rule Proposal Votes
CREATE TABLE IF NOT EXISTS governance_rule_proposal_votes (
    id TEXT PRIMARY KEY,
    proposal_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    selected_option_id TEXT, -- For multi-option proposals
    vote_choice TEXT CHECK(vote_choice IN ('yes', 'no', 'abstain')), -- For simple yes/no/abstain
    voted_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (proposal_id) REFERENCES governance_rule_proposals(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (selected_option_id) REFERENCES governance_rule_proposal_options(id) ON DELETE CASCADE,
    UNIQUE(proposal_id, user_id)
);

-- Trigger for Policy Votes Updated At
CREATE TRIGGER IF NOT EXISTS update_policy_votes_updated_at
    AFTER UPDATE ON policy_votes
BEGIN
    UPDATE policy_votes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Triggers for Rule Proposals
CREATE TRIGGER IF NOT EXISTS update_governance_rule_proposals_updated_at
    AFTER UPDATE ON governance_rule_proposals
BEGIN
    UPDATE governance_rule_proposals SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
