-- Database migration for Activity Feed backend improvements
-- Run this on production database before deploying new features

-- Indexes for debated proposals performance
CREATE INDEX IF NOT EXISTS idx_proposals_document_created
ON proposals(document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comments_proposal_created
ON comments(proposal_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_votes_proposal_vote
ON votes(proposal_id, vote);

-- Indexes for agreed versions performance
CREATE INDEX IF NOT EXISTS idx_history_paragraph_approval
ON history(paragraph_id, approval_percentage DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_history_approval_created
ON history(approval_percentage DESC, created_at DESC);

-- Composite indexes for complex queries
CREATE INDEX IF NOT EXISTS idx_proposals_pending_document
ON proposals(document_id, approved, created_at DESC)
WHERE approved = 0;

-- Index for user document access (used in multiple queries)
CREATE INDEX IF NOT EXISTS idx_document_collaborators_user
ON document_collaborators(user_id, document_id);

-- Index for document ownership
CREATE INDEX IF NOT EXISTS idx_documents_owner
ON documents(owner_id, updated_at DESC);

-- Analyze the database after adding indexes
ANALYZE;
