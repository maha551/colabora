/**
 * Shared logic for pending paragraph proposals (user has not voted).
 * Used by GET /api/pending-votes and GET /api/pending-decisions.
 */

const TransactionManager = require('../database/services/TransactionManager');
const { logger } = require('../middleware/logger');
const { hasNewCommentSchema } = require('./routeHelpers');
const { buildAccessCheck } = require('./documentQueries');
const VoterManager = require('../modules/voting');

const MAX_DOCUMENT_IDS = 1000;

/**
 * Get document IDs that are eligible for pending votes (user has access, not rejected, agreed with amendments or not agreed).
 * @param {Object} db - Database connection
 * @param {string} userId - Current user ID
 * @returns {Promise<string[]>} Document IDs
 */
async function getDocumentIdsForPendingVotes(db, userId) {
  const documentsQuery = `
    SELECT d.id
    FROM documents d
    LEFT JOIN document_collaborators dc ON d.id = dc.document_id AND dc.user_id = ?
    LEFT JOIN organization_members om ON d.organization_id = om.organization_id AND om.user_id = ? AND om.status = 'active'
    LEFT JOIN organizations o ON d.organization_id = o.id AND o.is_active = true
    WHERE ${buildAccessCheck('d')}
      AND (d.document_kind IS NULL OR d.document_kind = 'standard')
      AND d.status != 'rejected'
      AND (d.status != 'agreed' OR d.amendments_open = 1)
  `;
  const rows = await TransactionManager.queryAll(db, documentsQuery, [userId, userId, userId, userId]);
  return rows.map(r => r.id).filter(Boolean);
}

/**
 * Get formatted pending paragraph proposals for the given document IDs (proposals user has not voted on).
 * @param {Object} db - Database connection
 * @param {string} userId - Current user ID
 * @param {string[]} documentIds - Document IDs (will be limited to MAX_DOCUMENT_IDS)
 * @returns {Promise<Object[]>} Array of proposal objects (same shape as pending-votes response.proposals)
 */
async function getFormattedPendingProposals(db, userId, documentIds) {
  if (!documentIds || documentIds.length === 0) {
    return [];
  }
  const validIds = documentIds.filter(id => id != null && String(id).trim() !== '');
  if (validIds.length === 0) return [];
  const limitedIds = validIds.slice(0, MAX_DOCUMENT_IDS);
  const placeholders = limitedIds.map(() => '?').join(',');

  const proposalsQuery = `
    SELECT 
      p.id,
      p.paragraph_id,
      p.user_id,
      p.text as proposed_text,
      p.type,
      p.heading_level,
      p.created_at,
      u.name as user_name,
      u.email as user_email,
      u.avatar as user_avatar,
      par.text as current_text,
      par.title as paragraph_title,
      par.heading_level as paragraph_heading_level,
      par.document_id,
      d.title as document_title,
      (SELECT COUNT(*) FROM votes v WHERE v.proposal_id = p.id) as total_votes,
      (SELECT COUNT(*) FROM votes v WHERE v.proposal_id = p.id AND v.vote = 'PRO') as pro_votes,
      (SELECT COUNT(*) FROM votes v WHERE v.proposal_id = p.id AND v.vote = 'CONTRA') as contra_votes,
      (SELECT COUNT(*) FROM votes v WHERE v.proposal_id = p.id AND v.vote = 'NEUTRAL') as neutral_votes
    FROM proposals p
    JOIN users u ON p.user_id = u.id
    JOIN paragraphs par ON p.paragraph_id = par.id
    JOIN documents d ON par.document_id = d.id
    WHERE par.document_id IN (${placeholders})
      AND p.approved = false
      AND p.id NOT IN (SELECT proposal_id FROM votes WHERE user_id = ?)
    ORDER BY p.created_at DESC
  `;
  const proposals = await TransactionManager.queryAll(db, proposalsQuery, [...limitedIds, userId]);
  if (proposals.length === 0) return [];

  const uniqueDocIds = [...new Set(proposals.map(p => p.document_id).filter(Boolean))];
  const voterCountByDoc = await VoterManager.getEligibleVoterCountsByDocument(db, uniqueDocIds);

  const commentsByProposal = new Map();
  const hasNewSchema = await hasNewCommentSchema(db);
  const allProposalIds = proposals.map(p => p.id);
  const commentsPlaceholders = allProposalIds.map(() => '?').join(',');
  const commentWhereClause = hasNewSchema
    ? `c.commentable_type = 'proposal' AND c.commentable_id IN (${commentsPlaceholders})`
    : `c.proposal_id IN (${commentsPlaceholders})`;
  const allComments = await TransactionManager.queryAll(db, `
    SELECT c.*,
           u.name as user_name,
           u.email as user_email,
           u.avatar as user_avatar,
           pc.user_id as parent_user_id,
           pu.name as parent_user_name
    FROM comments c
    JOIN users u ON c.user_id = u.id
    LEFT JOIN comments pc ON c.parent_id = pc.id
    LEFT JOIN users pu ON pc.user_id = pu.id
    WHERE ${commentWhereClause} AND c.deleted_at IS NULL
    ORDER BY c.created_at
  `, allProposalIds);
  allComments.forEach(comment => {
    const proposalId = hasNewSchema ? comment.commentable_id : comment.proposal_id;
    if (!commentsByProposal.has(proposalId)) commentsByProposal.set(proposalId, []);
    commentsByProposal.get(proposalId).push(comment);
  });

  const formatted = await Promise.all(proposals.map(async (proposal) => {
    let isAnonymous = false;
    try {
      const docResult = await TransactionManager.query(db, 'SELECT voting_anonymous FROM documents WHERE id = ?', [proposal.document_id]);
      isAnonymous = docResult?.voting_anonymous === true;
    } catch (err) {
      logger.error('Error fetching document voting_anonymous', { error: err.message, documentId: proposal.document_id });
    }
    let processedVotes = [];
    try {
      const votes = await TransactionManager.queryAll(db,
        `SELECT v.*, u.name as user_name FROM votes v JOIN users u ON v.user_id = u.id WHERE v.proposal_id = ?`,
        [proposal.id]
      );
      processedVotes = votes.map(vote => {
        const voteData = { id: vote.id, proposalId: proposal.id, vote: vote.vote, createdAt: vote.created_at || vote.createdAt };
        if (!isAnonymous) {
          voteData.userId = vote.user_id;
          voteData.user = { id: vote.user_id, name: vote.user_name };
        } else if (vote.user_id === userId) {
          voteData.userId = vote.user_id;
        }
        return voteData;
      });
    } catch (err) {
      logger.error('Error fetching votes for proposal', { error: err.message, proposalId: proposal.id });
    }
    let otherProposals = [];
    try {
      const otherRows = await TransactionManager.queryAll(db, `
        SELECT p.id, p.text as proposed_text, p.type, p.created_at,
          u.id as user_id, u.name as user_name, u.email as user_email, u.avatar as user_avatar,
          (SELECT COUNT(*) FROM votes v WHERE v.proposal_id = p.id AND v.vote = 'PRO') as pro_votes
        FROM proposals p JOIN users u ON p.user_id = u.id
        WHERE p.paragraph_id = ? AND p.id != ? AND p.type = ? AND p.approved = false
        ORDER BY pro_votes DESC, p.created_at DESC LIMIT 2
      `, [proposal.paragraph_id, proposal.id, proposal.type]);
      for (const other of otherRows) {
        let otherVotes = [];
        try {
          const ov = await TransactionManager.queryAll(db, `SELECT v.*, u.name as user_name FROM votes v JOIN users u ON v.user_id = u.id WHERE v.proposal_id = ?`, [other.id]);
          otherVotes = ov.map(vote => {
            const vd = { id: vote.id, proposalId: other.id, vote: vote.vote, createdAt: vote.created_at || vote.createdAt };
            if (!isAnonymous) { vd.userId = vote.user_id; vd.user = { id: vote.user_id, name: vote.user_name }; }
            else if (vote.user_id === userId) vd.userId = vote.user_id;
            return vd;
          });
        } catch (err) {
          logger.warn('Failed to fetch other proposal votes', { error: err.message, proposalId: proposal?.id });
        }
        otherProposals.push({
          id: other.id,
          paragraphId: proposal.paragraph_id,
          documentId: proposal.document_id,
          documentTitle: proposal.document_title,
          paragraphTitle: proposal.paragraph_title,
          proposedText: other.proposed_text,
          currentText: proposal.current_text,
          type: other.type,
          headingLevel: proposal.heading_level || proposal.paragraph_heading_level,
          createdAt: other.created_at,
          user: { id: other.user_id, name: other.user_name, email: other.user_email, avatar: other.user_avatar },
          votes: otherVotes,
          totalUsers: voterCountByDoc[proposal.document_id] ?? 1,
        });
      }
    } catch (err) {
      logger.error('Error fetching other proposals', { error: err.message, proposalId: proposal.id });
    }
    let agreedVersion = null;
    try {
      const agreedRow = await TransactionManager.query(db, `
        SELECT h.id, h.new_text as accepted_text, h.old_text as previous_text, h.proposal_id,
          COALESCE(h.accepted_at, h.created_at) as accepted_at, COALESCE(pr.type, ?) as proposal_type
        FROM history h
        LEFT JOIN proposals pr ON h.proposal_id = pr.id
        WHERE h.paragraph_id = ? AND COALESCE(pr.type, ?) = ?
        ORDER BY h.created_at DESC LIMIT 1
      `, [proposal.type, proposal.paragraph_id, proposal.type, proposal.type]);
      if (agreedRow) {
        agreedVersion = {
          text: agreedRow.accepted_text,
          previousText: agreedRow.previous_text,
          proposalId: agreedRow.proposal_id,
          acceptedAt: agreedRow.accepted_at,
          type: agreedRow.proposal_type || proposal.type,
        };
      }
    } catch (err) {
      logger.error('Error fetching agreed version', { error: err.message, proposalId: proposal.id });
    }
    const rawComments = commentsByProposal.get(proposal.id) || [];
    const processedComments = rawComments.map(comment => ({
      id: comment.id,
      commentableType: 'proposal',
      commentableId: comment.commentable_id || comment.proposal_id || proposal.id,
      proposalId: comment.proposal_id || comment.commentable_id || proposal.id,
      userId: comment.user_id,
      text: comment.text,
      parentId: comment.parent_id || undefined,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      deletedAt: comment.deleted_at || null,
      editedAt: comment.edited_at || null,
      editCount: comment.edit_count || 0,
      upvoteCount: comment.upvote_count != null ? Number(comment.upvote_count) : 0,
      userUpvoted: false,
      user: { id: comment.user_id, name: comment.user_name, email: comment.user_email, avatar: comment.user_avatar },
      parent: comment.parent_id ? { id: comment.parent_id, user: { id: comment.parent_user_id, name: comment.parent_user_name } } : null,
      replies: [],
    }));

    return {
      id: proposal.id,
      paragraphId: proposal.paragraph_id,
      documentId: proposal.document_id,
      documentTitle: proposal.document_title,
      paragraphTitle: proposal.paragraph_title,
      proposedText: proposal.proposed_text,
      currentText: proposal.current_text,
      type: proposal.type,
      headingLevel: proposal.heading_level || proposal.paragraph_heading_level,
      createdAt: proposal.created_at,
      user: { id: proposal.user_id, name: proposal.user_name, email: proposal.user_email, avatar: proposal.user_avatar },
      votes: processedVotes,
      totalUsers: voterCountByDoc[proposal.document_id] ?? 1,
      otherProposals,
      agreedVersion,
      comments: processedComments,
    };
  }));

  // Set userUpvoted for all comments across proposals
  const allCommentIds = formatted.flatMap(p => (p.comments || []).map(c => c.id));
  if (allCommentIds.length > 0 && userId) {
    try {
      const placeholders = allCommentIds.map(() => '?').join(',');
      const upvotedRows = await TransactionManager.queryAll(db, `
        SELECT comment_id FROM comment_upvotes WHERE user_id = ? AND comment_id IN (${placeholders})
      `, [userId, ...allCommentIds]);
      const upvotedSet = new Set(upvotedRows.map(r => r.comment_id));
      for (const p of formatted) {
        for (const c of p.comments || []) {
          c.userUpvoted = upvotedSet.has(c.id);
        }
      }
    } catch (err) {
      logger.debug('Error fetching comment upvotes for pending proposals', { error: err.message });
    }
  }

  return formatted;
}

module.exports = {
  getDocumentIdsForPendingVotes,
  getFormattedPendingProposals,
};
