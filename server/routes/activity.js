const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { logger } = require('../middleware/logger');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const TransactionManager = require('../database/services/TransactionManager');
const { getUserId, hasNewCommentSchema } = require('../utils/routeHelpers');
const router = express.Router({ mergeParams: true });

// GET /api/documents/:documentId/activity - Get recent activity for a document
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { documentId } = req.params;
  const userId = getUserId(req);

  // First verify user has access to this document
  const { buildAccessCheck } = require('../utils/documentQueries');
  
  const checkAccessQuery = `
    SELECT d.id 
    FROM documents d
    LEFT JOIN document_collaborators dc ON d.id = dc.document_id AND dc.user_id = ?
    LEFT JOIN organization_members om ON d.organization_id = om.organization_id AND om.user_id = ? AND om.status = 'active'
    LEFT JOIN organizations o ON d.organization_id = o.id AND o.is_active = true
    WHERE d.id = ? 
      AND ${buildAccessCheck('d')}
  `;

  let doc;
  try {
    // Parameters: userId (dc JOIN), userId (om JOIN), documentId, userId (owner check), userId (dc check)
    doc = await TransactionManager.query(db, checkAccessQuery, [userId, userId, documentId, userId, userId]);
  } catch (err) {
    logger.error('Database error checking document access', { error: err.message, documentId, userId });
    throw new ApiError(500, 'Database error', 'DATABASE_ERROR', { details: err.message });
  }

  if (!doc) {
    throw new ApiError(403, 'Access denied', 'FORBIDDEN');
  }

  // Get document acceptance threshold
  let document;
  try {
    document = await TransactionManager.query(db, `SELECT acceptance_threshold, voting_anonymous FROM documents WHERE id = ?`, [documentId]);
  } catch (err) {
    logger.error('Error fetching document threshold', { error: err.message, documentId });
    throw new ApiError(500, 'Failed to fetch document threshold', 'DATABASE_ERROR', { details: err.message });
  }

  const acceptanceThreshold = document?.acceptance_threshold || 75.0;
  const documentVotingAnonymous = document?.voting_anonymous === true;

  // Check comment schema for backward compatibility
  const hasNewSchema = await hasNewCommentSchema(db);
  const commentJoinClause = hasNewSchema
    ? `JOIN proposals p ON c.commentable_type = 'proposal' AND c.commentable_id = p.id`
    : `JOIN proposals p ON c.proposal_id = p.id`;

  // Get activities from multiple sources
  const activitiesQuery = `
    SELECT 
      'proposal_created' as type,
      p.id,
      p.user_id as userId,
      u.name as userName,
      u.avatar as userAvatar,
      pr.title as paragraphTitle,
      p.text as proposalText,
      p.created_at as timestamp
    FROM proposals p
    JOIN paragraphs pr ON p.paragraph_id = pr.id
    JOIN users u ON p.user_id = u.id
    WHERE pr.document_id = ?

    UNION ALL

    SELECT 
      'proposal_accepted' as type,
      h.id,
      h.user_id as userId,
      u.name as userName,
      u.avatar as userAvatar,
      pr.title as paragraphTitle,
      h.new_text as proposalText,
      h.created_at as timestamp
    FROM history h
    JOIN paragraphs pr ON h.paragraph_id = pr.id
    JOIN users u ON h.user_id = u.id
    WHERE pr.document_id = ? AND h.approval_percentage >= ?

    UNION ALL

    SELECT 
      'vote_cast' as type,
      v.id,
      v.user_id as userId,
      u.name as userName,
      u.avatar as userAvatar,
      pr.title as paragraphTitle,
      v.vote as voteType,
      v.created_at as timestamp
    FROM votes v
    JOIN proposals p ON v.proposal_id = p.id
    JOIN paragraphs pr ON p.paragraph_id = pr.id
    JOIN documents d ON pr.document_id = d.id
    LEFT JOIN users u ON v.user_id = u.id AND d.voting_anonymous = false
    WHERE pr.document_id = ?

    UNION ALL

    SELECT 
      'comment_added' as type,
      c.id,
      c.user_id as userId,
      u.name as userName,
      u.avatar as userAvatar,
      pr.title as paragraphTitle,
      c.text as commentText,
      c.created_at as timestamp
    FROM comments c
    ${commentJoinClause}
    JOIN paragraphs pr ON p.paragraph_id = pr.id
    JOIN users u ON c.user_id = u.id
    WHERE pr.document_id = ?

    UNION ALL

    SELECT
      'structure_proposal_created' as type,
      sp.id,
      sp.user_id as userId,
      u.name as userName,
      u.avatar as userAvatar,
      sp.title as paragraphTitle,
      sp.description as proposalText,
      sp.created_at as timestamp
    FROM structure_proposals sp
    JOIN users u ON sp.user_id = u.id
    WHERE sp.document_id = ?

    UNION ALL

    SELECT
      'structure_proposal_vote' as type,
      spv.id,
      spv.user_id as userId,
      u.name as userName,
      u.avatar as userAvatar,
      sp.title as paragraphTitle,
      spv.vote as voteType,
      spv.created_at as timestamp
    FROM structure_proposal_votes spv
    JOIN structure_proposals sp ON spv.structure_proposal_id = sp.id
    JOIN users u ON spv.user_id = u.id
    WHERE sp.document_id = ?

    UNION ALL

    SELECT
      'structure_proposal_approved' as type,
      sp.id,
      sp.user_id as userId,
      u.name as userName,
      u.avatar as userAvatar,
      sp.title as paragraphTitle,
      'Structure proposal approved' as proposalText,
      sp.updated_at as timestamp
    FROM structure_proposals sp
    JOIN users u ON sp.user_id = u.id
    WHERE sp.document_id = ? AND sp.approved = true

    UNION ALL

    SELECT
      'structure_proposal_applied' as type,
      sp.id,
      sp.user_id as userId,
      u.name as userName,
      u.avatar as userAvatar,
      sp.title as paragraphTitle,
      'Structure changes applied' as proposalText,
      sp.updated_at as timestamp
    FROM structure_proposals sp
    JOIN users u ON sp.user_id = u.id
    WHERE sp.document_id = ? AND sp.applied = true

    ORDER BY timestamp DESC
    LIMIT 50
  `;

  let activities;
  try {
    activities = await TransactionManager.queryAll(
      db,
      activitiesQuery,
      [
        documentId, // proposal_created
        documentId, acceptanceThreshold, // proposal_accepted
        documentId, // vote_cast
        documentId, // comment_added
        documentId, // structure_proposal_created
        documentId, // structure_proposal_vote
        documentId, // structure_proposal_approved
        documentId  // structure_proposal_applied
      ]
    );
  } catch (err) {
    logger.error('Error fetching activities', { error: err.message, documentId });
    throw new ApiError(500, 'Failed to fetch activities', 'DATABASE_ERROR', { details: err.message });
  }

  // Transform the data to match frontend expectations
  const formattedActivities = activities.map(activity => {
    // Hide user info for vote_cast activities if voting is anonymous
    const isVoteCast = activity.type === 'vote_cast';
    const isAnonymous = documentVotingAnonymous;
    
    return {
      id: activity.id,
      type: activity.type,
      userId: (isVoteCast && isAnonymous) ? undefined : activity.userId,
      userName: (isVoteCast && isAnonymous) ? undefined : activity.userName,
      userAvatar: (isVoteCast && isAnonymous) ? undefined : activity.userAvatar,
      paragraphTitle: activity.paragraphTitle,
      proposalText: activity.proposalText,
      voteType: activity.voteType,
      commentText: activity.commentText,
      timestamp: activity.timestamp,
    };
  });

  res.json({ activities: formattedActivities });
}));

module.exports = router;

