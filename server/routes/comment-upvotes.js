const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth, requireDocumentAccess } = require('../middleware/auth');
const { resolveCommentToDocument } = require('../utils/commentHelpers');
const webSocketManager = require('../modules/websocket');
const { logger } = require('../middleware/logger');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const TransactionManager = require('../database/services/TransactionManager');
const { getUserId } = require('../utils/routeHelpers');

const router = express.Router({ mergeParams: true });

/**
 * Load comment by id; return null if not found or deleted.
 * @returns {Promise<{ id, upvote_count }|null>}
 */
async function getCommentForUpvote(db, commentId) {
  const comment = await TransactionManager.query(db, `
    SELECT id, deleted_at, upvote_count
    FROM comments
    WHERE id = ?
  `, [commentId]);
  if (!comment || comment.deleted_at) {
    return null;
  }
  const upvoteCount = comment.upvote_count != null ? Number(comment.upvote_count) : 0;
  return { id: comment.id, upvote_count: upvoteCount };
}

/**
 * Get current upvote count for a comment and whether the user has upvoted.
 */
async function getUpvoteState(db, commentId, userId) {
  const row = await TransactionManager.query(db, `
    SELECT c.upvote_count,
           EXISTS (SELECT 1 FROM comment_upvotes WHERE comment_id = ? AND user_id = ?) AS user_upvoted
    FROM comments c
    WHERE c.id = ?
  `, [commentId, userId, commentId]);
  if (!row) {
    return null;
  }
  return {
    upvoteCount: row.upvote_count != null ? Number(row.upvote_count) : 0,
    userUpvoted: Boolean(row.user_upvoted)
  };
}

// POST /api/comments/:commentId/upvote
router.post('/:commentId/upvote', requireAuth, resolveCommentToDocument, requireDocumentAccess, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const commentId = req.params.commentId;
  const documentId = req.params.documentId;
  const userId = getUserId(req);

  const comment = await getCommentForUpvote(db, commentId);
  if (!comment) {
    throw new ApiError(404, 'Comment not found', 'NOT_FOUND');
  }

  const upvoteId = uuidv4();
  try {
    await TransactionManager.executeInTransaction(db, async (txDb) => {
      await TransactionManager.execute(txDb, `
        INSERT INTO comment_upvotes (id, comment_id, user_id)
        VALUES (?, ?, ?)
      `, [upvoteId, commentId, userId]);
      await TransactionManager.execute(txDb, `
        UPDATE comments SET upvote_count = COALESCE(upvote_count, 0) + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `, [commentId]);
    });
  } catch (err) {
    // Unique constraint (comment_id, user_id) - already upvoted, idempotent success
    if (err.message && (err.message.includes('UNIQUE') || err.message.includes('unique') || err.message.includes('duplicate'))) {
      const state = await getUpvoteState(db, commentId, userId);
      if (state) {
        webSocketManager.broadcastCommentUpvote(documentId, commentId, state.upvoteCount);
        return res.status(200).json(state);
      }
    }
    logger.error('Error adding comment upvote', { error: err.message, commentId, userId });
    throw new ApiError(500, 'Failed to upvote comment', 'DATABASE_ERROR', { details: err.message });
  }

  const state = await getUpvoteState(db, commentId, userId);
  webSocketManager.broadcastCommentUpvote(documentId, commentId, state.upvoteCount);
  res.status(200).json(state);
}));

// DELETE /api/comments/:commentId/upvote
router.delete('/:commentId/upvote', requireAuth, resolveCommentToDocument, requireDocumentAccess, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const commentId = req.params.commentId;
  const documentId = req.params.documentId;
  const userId = getUserId(req);

  const comment = await getCommentForUpvote(db, commentId);
  if (!comment) {
    throw new ApiError(404, 'Comment not found', 'NOT_FOUND');
  }

  await TransactionManager.executeInTransaction(db, async (txDb) => {
    const deleted = await TransactionManager.execute(txDb, `
      DELETE FROM comment_upvotes WHERE comment_id = ? AND user_id = ?
    `, [commentId, userId]);
    const changed = (deleted && deleted.changes !== undefined) ? deleted.changes : (deleted?.changes ?? 0);
    if (changed > 0) {
      await TransactionManager.execute(txDb, `
        UPDATE comments SET upvote_count = CASE WHEN COALESCE(upvote_count, 0) > 0 THEN COALESCE(upvote_count, 0) - 1 ELSE 0 END, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `, [commentId]);
    }
  });

  const state = await getUpvoteState(db, commentId, userId);
  webSocketManager.broadcastCommentUpvote(documentId, commentId, state.upvoteCount);
  res.status(200).json(state);
}));

module.exports = router;
