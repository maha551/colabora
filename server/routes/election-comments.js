/**
 * Comments for representative elections (organization-scoped).
 * Routes: GET/POST/PUT/DELETE under /api/governance/:organizationId/elections/:electionId/comments
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth, requireOrganizationMember } = require('../middleware/auth');
const webSocketManager = require('../modules/websocket');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const TransactionManager = require('../database/services/TransactionManager');
const { commentValidation } = require('../middleware/validation');
const { getUserId } = require('../utils/routeHelpers');
const { validateElectionForComment, formatCommentResponse } = require('../utils/commentHelpers');

const router = express.Router({ mergeParams: true });

const COMMENTABLE_TYPE = 'election';

function entityId(req) {
  return req.params.electionId;
}

// GET
router.get('/', requireAuth, requireOrganizationMember, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const electionId = entityId(req);
  const organizationId = req.params.organizationId;

  const exists = await validateElectionForComment(db, electionId, organizationId);
  if (!exists) {
    throw new ApiError(404, 'Election not found', 'NOT_FOUND');
  }

  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const offset = parseInt(req.query.offset) || 0;
  const sort = (req.query.sort || 'newest').toLowerCase();
  const orderBy = sort === 'top'
    ? 'ORDER BY COALESCE(c.upvote_count, 0) DESC, c.created_at ASC'
    : 'ORDER BY c.created_at ASC';

  const query = `
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
    WHERE c.commentable_type = ? AND c.commentable_id = ? AND c.deleted_at IS NULL
    ${orderBy}
    LIMIT ? OFFSET ?
  `;
  const comments = await TransactionManager.queryAll(db, query, [COMMENTABLE_TYPE, electionId, limit, offset]);

  const countResult = await TransactionManager.query(db, `
    SELECT COUNT(*) as count FROM comments
    WHERE commentable_type = ? AND commentable_id = ? AND deleted_at IS NULL
  `, [COMMENTABLE_TYPE, electionId]);
  const totalCount = countResult?.count || 0;

  const processed = comments.map(comment => {
    const formatted = formatCommentResponse(comment);
    formatted.replies = comments.filter(c => c.parent_id === comment.id).map(reply => ({
      id: reply.id,
      user: { id: reply.user_id, name: reply.user_name }
    }));
    return formatted;
  });

  const userId = getUserId(req);
  if (processed.length > 0 && userId) {
    const commentIds = processed.map(c => c.id);
    const placeholders = commentIds.map(() => '?').join(',');
    const upvotedRows = await TransactionManager.queryAll(db, `
      SELECT comment_id FROM comment_upvotes WHERE user_id = ? AND comment_id IN (${placeholders})
    `, [userId, ...commentIds]);
    const upvotedSet = new Set(upvotedRows.map(r => r.comment_id));
    processed.forEach(c => { c.userUpvoted = upvotedSet.has(c.id); });
  } else {
    processed.forEach(c => { c.userUpvoted = false; });
  }

  res.json({ comments: processed, total: totalCount, limit, offset });
}));

// POST
router.post('/', requireAuth, requireOrganizationMember, ...commentValidation.create, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const electionId = entityId(req);
  const organizationId = req.params.organizationId;
  const { text } = req.body;
  const parentId = req.body.parentId || req.body.parent_id;
  const userId = getUserId(req);

  const exists = await validateElectionForComment(db, electionId, organizationId);
  if (!exists) {
    throw new ApiError(404, 'Election not found', 'NOT_FOUND');
  }

  if (parentId) {
    const parentComment = await TransactionManager.query(db, `
      SELECT id, parent_id FROM comments
      WHERE id = ? AND commentable_type = ? AND commentable_id = ? AND deleted_at IS NULL
    `, [parentId, COMMENTABLE_TYPE, electionId]);
    if (!parentComment) {
      throw new ApiError(400, 'Parent comment not found or does not belong to this election', 'VALIDATION_ERROR');
    }
    if (parentComment.parent_id) {
      throw new ApiError(400, 'Replies can only be made to top-level comments', 'VALIDATION_ERROR');
    }
  }

  const commentId = uuidv4();
  await TransactionManager.execute(db, `
    INSERT INTO comments (id, commentable_type, commentable_id, user_id, text, parent_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [commentId, COMMENTABLE_TYPE, electionId, userId, text.trim(), parentId || null]);

  const comment = await TransactionManager.query(db, `
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
    WHERE c.id = ?
  `, [commentId]);

  const result = formatCommentResponse(comment);
  webSocketManager.broadcastOrganizationUpdate(organizationId, 'election-comment', {
    type: 'election-comment',
    electionId,
    comment: result,
    action: 'created'
  });

  res.status(201).json({ message: 'Comment added successfully', comment: result });
}));

// PUT
router.put('/:commentId', requireAuth, requireOrganizationMember, ...commentValidation.update, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const electionId = entityId(req);
  const organizationId = req.params.organizationId;
  const commentId = req.params.commentId;
  const { text } = req.body;
  const userId = getUserId(req);

  const exists = await validateElectionForComment(db, electionId, organizationId);
  if (!exists) {
    throw new ApiError(404, 'Election not found', 'NOT_FOUND');
  }

  const comment = await TransactionManager.query(db, `
    SELECT c.* FROM comments c
    WHERE c.id = ? AND c.commentable_type = ? AND c.commentable_id = ?
  `, [commentId, COMMENTABLE_TYPE, electionId]);
  if (!comment) {
    throw new ApiError(404, 'Comment not found', 'NOT_FOUND');
  }
  if (comment.user_id !== userId) {
    throw new ApiError(403, 'You can only edit your own comments', 'FORBIDDEN');
  }
  if (comment.deleted_at) {
    throw new ApiError(400, 'Cannot edit deleted comment', 'VALIDATION_ERROR');
  }
  const editWindowMs = 15 * 60 * 1000;
  if (new Date() - new Date(comment.created_at) > editWindowMs) {
    throw new ApiError(400, 'Comment can only be edited within 15 minutes of creation', 'VALIDATION_ERROR');
  }

  await TransactionManager.execute(db, `
    UPDATE comments
    SET text = ?, edited_at = CURRENT_TIMESTAMP, edit_count = edit_count + 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [text.trim(), commentId]);

  const updated = await TransactionManager.query(db, `
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
    WHERE c.id = ?
  `, [commentId]);
  const result = formatCommentResponse(updated);
  webSocketManager.broadcastOrganizationUpdate(organizationId, 'election-comment', {
    type: 'election-comment',
    electionId,
    comment: result,
    action: 'updated'
  });
  res.json({ message: 'Comment updated successfully', comment: result });
}));

// DELETE
router.delete('/:commentId', requireAuth, requireOrganizationMember, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const electionId = entityId(req);
  const organizationId = req.params.organizationId;
  const commentId = req.params.commentId;
  const userId = getUserId(req);

  const exists = await validateElectionForComment(db, electionId, organizationId);
  if (!exists) {
    throw new ApiError(404, 'Election not found', 'NOT_FOUND');
  }

  const comment = await TransactionManager.query(db, `
    SELECT c.* FROM comments c
    WHERE c.id = ? AND c.commentable_type = ? AND c.commentable_id = ?
  `, [commentId, COMMENTABLE_TYPE, electionId]);
  if (!comment) {
    throw new ApiError(404, 'Comment not found', 'NOT_FOUND');
  }
  if (comment.user_id !== userId) {
    throw new ApiError(403, 'You can only delete your own comments', 'FORBIDDEN');
  }
  if (comment.deleted_at) {
    throw new ApiError(400, 'Comment already deleted', 'VALIDATION_ERROR');
  }

  await TransactionManager.execute(db, `
    UPDATE comments SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `, [commentId]);

  const deleted = await TransactionManager.query(db, `
    SELECT c.*,
           u.name as user_name,
           u.email as user_email,
           pc.user_id as parent_user_id,
           pu.name as parent_user_name
    FROM comments c
    JOIN users u ON c.user_id = u.id
    LEFT JOIN comments pc ON c.parent_id = pc.id
    LEFT JOIN users pu ON pc.user_id = pu.id
    WHERE c.id = ?
  `, [commentId]);
  const result = deleted ? formatCommentResponse(deleted) : null;
  webSocketManager.broadcastOrganizationUpdate(organizationId, 'election-comment', {
    type: 'election-comment',
    electionId,
    comment: result,
    action: 'deleted'
  });
  res.status(200).json({ message: 'Comment deleted successfully', comment: result });
}));

module.exports = router;
