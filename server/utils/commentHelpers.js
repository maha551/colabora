/**
 * Comment Helper Utilities
 * Provides validation and utility functions for the polymorphic comment system
 */

const TransactionManager = require('../database/services/TransactionManager');
const { logger } = require('../middleware/logger');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Validates that a commentable entity exists
 * @param {Object} db - Database instance
 * @param {string} commentableType - Type of entity ('proposal', 'structure_proposal')
 * @param {string} commentableId - ID of the entity
 * @param {string} documentId - Document ID for validation context
 * @returns {Promise<boolean>} True if entity exists
 */
async function validateCommentableEntity(db, commentableType, commentableId, documentId) {
  try {
    if (commentableType === 'proposal') {
      // Validate proposal exists and belongs to document
      const proposal = await TransactionManager.query(db, `
        SELECT p.id
        FROM proposals p
        JOIN paragraphs pr ON p.paragraph_id = pr.id
        WHERE p.id = ? AND pr.document_id = ?
      `, [commentableId, documentId]);
      return !!proposal;
    } else if (commentableType === 'structure_proposal') {
      // Validate structure proposal exists and belongs to document
      const proposal = await TransactionManager.query(db, `
        SELECT id FROM structure_proposals
        WHERE id = ? AND document_id = ?
      `, [commentableId, documentId]);
      return !!proposal;
    }
    return false;
  } catch (err) {
    logger.error('Error validating commentable entity', {
      error: err.message,
      commentableType,
      commentableId,
      documentId
    });
    return false;
  }
}

/**
 * Validates that a rule proposal exists and belongs to the organization
 * @param {Object} db - Database instance
 * @param {string} proposalId - Rule proposal ID
 * @param {string} organizationId - Organization ID
 * @returns {Promise<boolean>} True if rule proposal exists and belongs to org
 */
async function validateRuleProposalForComment(db, proposalId, organizationId) {
  try {
    const row = await TransactionManager.query(db, `
      SELECT id FROM governance_rule_proposals
      WHERE id = ? AND organization_id = ?
    `, [proposalId, organizationId]);
    return !!row;
  } catch (err) {
    logger.error('Error validating rule proposal for comment', {
      error: err.message,
      proposalId,
      organizationId
    });
    return false;
  }
}

/**
 * Validates that an organization vote exists and belongs to the organization
 */
async function validateOrganizationVoteForComment(db, voteId, organizationId) {
  try {
    const row = await TransactionManager.query(db, `
      SELECT id FROM organization_votes
      WHERE id = ? AND organization_id = ?
    `, [voteId, organizationId]);
    return !!row;
  } catch (err) {
    logger.error('Error validating organization vote for comment', {
      error: err.message,
      voteId,
      organizationId
    });
    return false;
  }
}

/**
 * Validates that an election exists and belongs to the organization
 */
async function validateElectionForComment(db, electionId, organizationId) {
  try {
    const row = await TransactionManager.query(db, `
      SELECT id FROM representative_elections
      WHERE id = ? AND organization_id = ?
    `, [electionId, organizationId]);
    return !!row;
  } catch (err) {
    logger.error('Error validating election for comment', {
      error: err.message,
      electionId,
      organizationId
    });
    return false;
  }
}

/**
 * Validates that a tree proposal exists and belongs to the document
 */
async function validateTreeProposalForComment(db, proposalId, documentId) {
  try {
    const row = await TransactionManager.query(db, `
      SELECT id FROM document_tree_proposals
      WHERE id = ? AND document_id = ?
    `, [proposalId, documentId]);
    return !!row;
  } catch (err) {
    logger.error('Error validating tree proposal for comment', {
      error: err.message,
      proposalId,
      documentId
    });
    return false;
  }
}

/**
 * Detects commentable type from request path
 * @param {Object} req - Express request object
 * @returns {string} Commentable type ('proposal' or 'structure_proposal')
 */
function getCommentableType(req) {
  // Check route path to determine entity type
  if (req.path && req.path.includes('structure-proposals')) {
    return 'structure_proposal';
  }
  // Also check originalUrl as fallback
  if (req.originalUrl && req.originalUrl.includes('structure-proposals')) {
    return 'structure_proposal';
  }
  // Default to 'proposal' for regular proposal routes
  return 'proposal';
}

/**
 * Resolves a comment by ID to its document ID (for flatter upvote API).
 * @param {Object} db - Database instance
 * @param {string} commentId - Comment ID
 * @returns {Promise<string|null>} Document ID or null if comment not found/deleted
 */
async function getDocumentIdForComment(db, commentId) {
  try {
    const comment = await TransactionManager.query(db, `
      SELECT id, commentable_type, commentable_id, deleted_at
      FROM comments
      WHERE id = ?
    `, [commentId]);
    if (!comment || comment.deleted_at) {
      return null;
    }
    const { commentable_type: commentableType, commentable_id: commentableId } = comment;
    if (commentableType === 'proposal') {
      const row = await TransactionManager.query(db, `
        SELECT p.document_id
        FROM proposals pr
        JOIN paragraphs p ON pr.paragraph_id = p.id
        WHERE pr.id = ?
      `, [commentableId]);
      return row ? row.document_id : null;
    }
    if (commentableType === 'structure_proposal') {
      const row = await TransactionManager.query(db, `
        SELECT document_id FROM structure_proposals WHERE id = ?
      `, [commentableId]);
      return row ? row.document_id : null;
    }
    if (commentableType === 'rule_proposal' || commentableType === 'organization_vote' || commentableType === 'election') {
      // Org-scoped; no document. Caller must use org-based access check.
      return null;
    }
    if (commentableType === 'tree_proposal') {
      const row = await TransactionManager.query(db, `
        SELECT document_id FROM document_tree_proposals WHERE id = ?
      `, [commentableId]);
      return row ? row.document_id : null;
    }
    return null;
  } catch (err) {
    logger.error('Error resolving comment to document', { error: err.message, commentId });
    return null;
  }
}

/**
 * Format comment response consistently across all endpoints
 * @param {Object} comment - Comment row from database (with user_name, user_email, user_avatar, parent_user_id, parent_user_name)
 * @param {Object} parentComment - Optional parent comment row
 * @returns {Object} Formatted comment object
 */
function formatCommentResponse(comment, parentComment = null) {
  const commentableType = comment.commentable_type || 'proposal';
  const commentableId = comment.commentable_id;
  const parentId = comment.parent_id != null && comment.parent_id !== ''
    ? String(comment.parent_id)
    : undefined;
  if (comment.parent_id != null && comment.parent_id !== '' && !parentId) {
    logger.warn('formatCommentResponse: Lost parentId during conversion', {
      commentId: comment.id,
      originalParentId: comment.parent_id,
      convertedParentId: parentId
    });
  }
  return {
    id: comment.id,
    commentableType,
    commentableId,
    proposalId: commentableType === 'proposal' ? commentableId : undefined,
    structureProposalId: commentableType === 'structure_proposal' ? commentableId : undefined,
    userId: comment.user_id,
    text: comment.text,
    parentId,
    createdAt: comment.created_at,
    updatedAt: comment.updated_at,
    deletedAt: comment.deleted_at || null,
    editedAt: comment.edited_at || null,
    editCount: comment.edit_count || 0,
    user: {
      id: comment.user_id,
      name: comment.user_name,
      email: comment.user_email,
      avatar: comment.user_avatar
    },
    parent: parentId ? {
      id: parentId,
      user: {
        id: parentComment ? parentComment.user_id : comment.parent_user_id,
        name: parentComment ? parentComment.user_name : comment.parent_user_name
      }
    } : null,
    replies: [],
    upvoteCount: comment.upvote_count != null ? Number(comment.upvote_count) : 0
  };
}

/**
 * Middleware: resolve commentId to documentId and set req.params.documentId
 * so requireDocumentAccess can run. Responds with 404 if comment not found or deleted.
 */
function resolveCommentToDocument(req, res, next) {
  const commentId = req.params.commentId;
  if (!commentId) {
    const err = ApiError.badRequest('Comment ID is required');
    return res.status(err.statusCode).json(err.toJSON());
  }
  const db = req.app.locals.db;
  getDocumentIdForComment(db, commentId)
    .then((documentId) => {
      if (!documentId) {
        throw new ApiError(404, 'Comment not found', 'NOT_FOUND');
      }
      req.params.documentId = documentId;
      next();
    })
    .catch((err) => {
      if (err instanceof ApiError) {
        return res.status(err.statusCode).json(err.toJSON());
      }
      next(err);
    });
}

module.exports = {
  validateCommentableEntity,
  validateRuleProposalForComment,
  validateOrganizationVoteForComment,
  validateElectionForComment,
  validateTreeProposalForComment,
  getCommentableType,
  getDocumentIdForComment,
  resolveCommentToDocument,
  formatCommentResponse
};
