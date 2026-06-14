const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { metricsCollector } = require('../middleware/monitoring');
const { requireAuth, requireDocumentAccess } = require('../middleware/auth');
const webSocketManager = require('../modules/websocket');
const { logger } = require('../middleware/logger');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const TransactionManager = require('../database/services/TransactionManager');
const { commentValidation } = require('../middleware/validation');
const { getUserId } = require('../utils/routeHelpers');
const { validateCommentableEntity, getCommentableType, formatCommentResponse } = require('../utils/commentHelpers');

const router = express.Router({ mergeParams: true });

// Add a comment to a proposal or structure proposal
router.post('/', requireAuth, requireDocumentAccess, ...commentValidation.create, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.documentId;
  const paragraphId = req.params.paragraphId; // May be null for structure proposals
  const proposalId = req.params.proposalId; // This is the commentableId
  
  // Log request body before processing to debug parentId issues
  // Check both camelCase and snake_case since transformRequest might convert it
  logger.info('Comment creation request received', {
    bodyKeys: Object.keys(req.body),
    hasParentId: 'parentId' in req.body,
    hasParent_id: 'parent_id' in req.body,
    parentIdValue: req.body.parentId || req.body.parent_id,
    parentIdType: typeof (req.body.parentId || req.body.parent_id),
    rawBody: JSON.stringify(req.body)
  });
  
  // Handle both camelCase and snake_case (transformRequest converts camelCase to snake_case)
  const { text } = req.body;
  const parentId = req.body.parentId || req.body.parent_id;
  const userId = getUserId(req);

  // Validation middleware handles empty text check

  // Detect commentable type from route
  const commentableType = getCommentableType(req);
  const commentableId = proposalId;

  // Validate entity exists
  const entityExists = await validateCommentableEntity(db, commentableType, commentableId, documentId);
  if (!entityExists) {
    const entityName = commentableType === 'structure_proposal' ? 'Structure proposal' : 'Proposal';
    throw new ApiError(404, `${entityName} not found`, 'NOT_FOUND');
  }

  // If parentId is provided, verify it exists and belongs to the same entity
  // Also enforce one-level depth limit: replies can only be to top-level comments, not to other replies
  if (parentId) {
    let parentComment;
    try {
      parentComment = await TransactionManager.query(db, `
        SELECT id, parent_id, commentable_type, commentable_id 
        FROM comments 
        WHERE id = ? AND commentable_type = ? AND commentable_id = ? AND deleted_at IS NULL
      `, [parentId, commentableType, commentableId]);
    } catch (err) {
      logger.error('Error verifying parent comment', { error: err.message, parentId, commentableId, commentableType });
      throw new ApiError(500, 'Failed to add comment', 'DATABASE_ERROR', { details: err.message });
    }

    if (!parentComment) {
      throw new ApiError(400, 'Parent comment not found or does not belong to this entity', 'VALIDATION_ERROR');
    }

    // Enforce one-level depth limit: parent comment must not have a parent itself
    if (parentComment.parent_id) {
      throw new ApiError(400, 'Replies can only be made to top-level comments, not to other replies', 'VALIDATION_ERROR');
    }
  }

  const commentId = uuidv4();

  // Log what we're about to insert
  logger.info('Inserting comment with parentId', {
    commentId,
    parentId,
    parentIdType: typeof parentId,
    parentIdTruthy: !!parentId,
    parentIdValue: parentId,
    willInsertAs: parentId || null
  });

  // Insert comment and update document timestamp in a single transaction
  try {
    await TransactionManager.executeInTransaction(db, async (txDb) => {
      // Insert comment with polymorphic structure
      await TransactionManager.execute(txDb, `
        INSERT INTO comments (id, commentable_type, commentable_id, user_id, text, parent_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [commentId, commentableType, commentableId, userId, text.trim(), parentId || null]);

      // Update document timestamp
      await TransactionManager.execute(txDb, `
        UPDATE documents SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `, [documentId]);
    });
  } catch (err) {
    logger.error('Error adding comment', { error: err.message, commentableId, commentableType, userId });
    throw new ApiError(500, 'Failed to add comment', 'DATABASE_ERROR', { details: err.message });
  }

  // Return the created comment with user info
  let comment;
  try {
    comment = await TransactionManager.query(db, `
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
  } catch (err) {
    logger.error('Error retrieving created comment', { error: err.message, commentId });
    throw new ApiError(500, 'Comment added but failed to retrieve', 'DATABASE_ERROR', { details: err.message });
  }

  const result = formatCommentResponse(comment);

  // Log parentId conversion only if there's a potential issue (debug level for production)
  if (parentId && !result.parentId) {
    logger.warn('Comment created - parentId may have been lost during formatting', {
      commentId,
      parentIdFromRequest: parentId,
      parentIdInResult: result.parentId
    });
  } else {
    logger.debug('Comment created successfully', {
      commentId,
      hasParentId: !!result.parentId,
      isReply: !!result.parentId
    });
  }

  // Record business metrics
  metricsCollector.recordBusinessEvent('comment_posted', {
    commentId,
    proposalId: commentableId,
    userId,
    parentId,
    documentId,
    commentableType
  });

  // Broadcast real-time update via WebSocket
  webSocketManager.broadcastCommentUpdate(documentId, commentableId, paragraphId, result, 'created', commentableType);

  // Also broadcast to organization room if document belongs to organization
  const doc = await TransactionManager.query(db, 'SELECT organization_id FROM documents WHERE id = ?', [documentId]);
  if (doc?.organization_id) {
    const eventType = commentableType === 'structure_proposal' ? 'structure-proposal-comment' : 'proposal-comment';
    webSocketManager.broadcastOrganizationUpdate(doc.organization_id, eventType, {
      type: eventType,
      documentId,
      proposalId: commentableId,
      paragraphId: paragraphId || null,
      comment: result,
      action: 'created'
    });
  }

  res.status(201).json({ 
    message: 'Comment added successfully',
    comment: result
  });
}));

// Get all comments for a proposal or structure proposal
router.get('/', requireAuth, requireDocumentAccess, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const proposalId = req.params.proposalId; // This is the commentableId
  const paragraphId = req.params.paragraphId;
  const documentId = req.params.documentId;

  // Detect commentable type from route
  const commentableType = getCommentableType(req);
  const commentableId = proposalId;

  // Support pagination and sort
  const limit = parseInt(req.query.limit) || 50;
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

  let comments;
  try {
    comments = await TransactionManager.queryAll(db, query, [commentableType, commentableId, limit, offset]);
  } catch (err) {
    logger.error('Error fetching comments', { error: err.message, commentableId, commentableType, paragraphId, documentId });
    throw new ApiError(500, 'Failed to fetch comments', 'DATABASE_ERROR', { details: err.message });
  }

  // Get total count for pagination
  let totalCount = 0;
  try {
    const countResult = await TransactionManager.query(db, `
      SELECT COUNT(*) as count
      FROM comments
      WHERE commentable_type = ? AND commentable_id = ? AND deleted_at IS NULL
    `, [commentableType, commentableId]);
    totalCount = countResult?.count || 0;
  } catch (err) {
    logger.warn('Error fetching comment count', { error: err.message });
  }

  // Process comments to include replies and upvoteCount
  const processedComments = comments.map(comment => {
    const formatted = formatCommentResponse(comment);
    // Add replies mapping
    formatted.replies = comments.filter(c => c.parent_id === comment.id).map(reply => ({
      id: reply.id,
      user: { id: reply.user_id, name: reply.user_name }
    }));
    return formatted;
  });

  // Batch-query current user's upvoted comment ids and set userUpvoted on each comment
  const userId = getUserId(req);
  if (processedComments.length > 0 && userId) {
    const commentIds = processedComments.map(c => c.id);
    const placeholders = commentIds.map(() => '?').join(',');
    try {
      const upvotedRows = await TransactionManager.queryAll(db, `
        SELECT comment_id FROM comment_upvotes WHERE user_id = ? AND comment_id IN (${placeholders})
      `, [userId, ...commentIds]);
      const upvotedSet = new Set(upvotedRows.map(r => r.comment_id));
      processedComments.forEach(c => { c.userUpvoted = upvotedSet.has(c.id); });
    } catch (err) {
      logger.warn('Error fetching comment upvotes for user', { error: err.message });
    }
  } else {
    processedComments.forEach(c => { c.userUpvoted = false; });
  }

  res.json({ comments: processedComments, total: totalCount, limit, offset });
}));

// Update a comment (edit)
router.put('/:commentId', requireAuth, requireDocumentAccess, ...commentValidation.update, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.documentId;
  const paragraphId = req.params.paragraphId;
  const proposalId = req.params.proposalId; // This is the commentableId
  const commentId = req.params.commentId;
  const { text } = req.body;
  const userId = getUserId(req);

  // Validation middleware handles empty text check

  // Detect commentable type from route
  const commentableType = getCommentableType(req);
  const commentableId = proposalId;

  // Verify comment exists and belongs to the correct entity and user
  let comment;
  try {
    comment = await TransactionManager.query(db, `
      SELECT c.*
      FROM comments c
      WHERE c.id = ? AND c.commentable_type = ? AND c.commentable_id = ?
    `, [commentId, commentableType, commentableId]);
  } catch (err) {
    logger.error('Error verifying comment', { error: err.message, commentId, commentableId, commentableType });
    throw new ApiError(500, 'Failed to update comment', 'DATABASE_ERROR', { details: err.message });
  }

  if (!comment) {
    throw new ApiError(404, 'Comment not found', 'NOT_FOUND');
  }

  // Verify entity belongs to document (additional security check)
  const entityExists = await validateCommentableEntity(db, commentableType, commentableId, documentId);
  if (!entityExists) {
    throw new ApiError(404, 'Entity not found', 'NOT_FOUND');
  }

  if (comment.user_id !== userId) {
    throw new ApiError(403, 'You can only edit your own comments', 'FORBIDDEN');
  }

  if (comment.deleted_at) {
    throw new ApiError(400, 'Cannot edit deleted comment', 'VALIDATION_ERROR');
  }

  // Check edit time window (15 minutes)
  const commentCreatedAt = new Date(comment.created_at);
  const now = new Date();
  const editWindowMs = 15 * 60 * 1000; // 15 minutes
  if (now.getTime() - commentCreatedAt.getTime() > editWindowMs) {
    throw new ApiError(400, 'Comment can only be edited within 15 minutes of creation', 'VALIDATION_ERROR');
  }

  // Update comment
  try {
    await TransactionManager.execute(db, `
      UPDATE comments
      SET text = ?, edited_at = CURRENT_TIMESTAMP, edit_count = edit_count + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [text.trim(), commentId]);
  } catch (err) {
    logger.error('Error updating comment', { error: err.message, commentId });
    throw new ApiError(500, 'Failed to update comment', 'DATABASE_ERROR', { details: err.message });
  }

  // Fetch updated comment with user info
  let updatedComment;
  try {
    updatedComment = await TransactionManager.query(db, `
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
  } catch (err) {
    logger.error('Error retrieving updated comment', { error: err.message, commentId });
    throw new ApiError(500, 'Comment updated but failed to retrieve', 'DATABASE_ERROR', { details: err.message });
  }

  const updateResult = formatCommentResponse(updatedComment);

  // Broadcast real-time update via WebSocket
  webSocketManager.broadcastCommentUpdate(documentId, commentableId, paragraphId, updateResult, 'updated', commentableType);

  // Also broadcast to organization room if document belongs to organization
  const doc2 = await TransactionManager.query(db, 'SELECT organization_id FROM documents WHERE id = ?', [documentId]);
  if (doc2?.organization_id) {
    const eventType = commentableType === 'structure_proposal' ? 'structure-proposal-comment' : 'proposal-comment';
    webSocketManager.broadcastOrganizationUpdate(doc2.organization_id, eventType, {
      type: eventType,
      documentId,
      proposalId: commentableId,
      paragraphId: paragraphId || null,
      comment: updateResult,
      action: 'updated'
    });
  }

  res.json({ 
    message: 'Comment updated successfully',
    comment: updateResult
  });
}));

// Delete a comment (soft delete)
router.delete('/:commentId', requireAuth, requireDocumentAccess, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.documentId;
  const paragraphId = req.params.paragraphId;
  const proposalId = req.params.proposalId; // This is the commentableId
  const commentId = req.params.commentId;
  const userId = getUserId(req);

  // Detect commentable type from route
  const commentableType = getCommentableType(req);
  const commentableId = proposalId;

  // Verify comment exists
  let comment;
  try {
    comment = await TransactionManager.query(db, `
      SELECT c.*
      FROM comments c
      WHERE c.id = ? AND c.commentable_type = ? AND c.commentable_id = ?
    `, [commentId, commentableType, commentableId]);
  } catch (err) {
    logger.error('Error verifying comment', { error: err.message, commentId, commentableId, commentableType });
    throw new ApiError(500, 'Failed to delete comment', 'DATABASE_ERROR', { details: err.message });
  }

  if (!comment) {
    throw new ApiError(404, 'Comment not found', 'NOT_FOUND');
  }

  // Verify entity belongs to document (additional security check)
  const entityExists = await validateCommentableEntity(db, commentableType, commentableId, documentId);
  if (!entityExists) {
    throw new ApiError(404, 'Entity not found', 'NOT_FOUND');
  }

  if (comment.user_id !== userId) {
    throw new ApiError(403, 'You can only delete your own comments', 'FORBIDDEN');
  }

  if (comment.deleted_at) {
    throw new ApiError(400, 'Comment already deleted', 'VALIDATION_ERROR');
  }

  // Soft delete comment
  try {
    await TransactionManager.execute(db, `
      UPDATE comments
      SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [commentId]);
  } catch (err) {
    logger.error('Error deleting comment', { error: err.message, commentId });
    throw new ApiError(500, 'Failed to delete comment', 'DATABASE_ERROR', { details: err.message });
  }

  // Fetch deleted comment for broadcast
  let deletedComment;
  try {
    deletedComment = await TransactionManager.query(db, `
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
  } catch (err) {
    logger.error('Error retrieving deleted comment', { error: err.message, commentId });
    // Continue anyway - comment is deleted
  }

  const deleteResult = deletedComment ? formatCommentResponse(deletedComment) : null;

  // Broadcast real-time update via WebSocket
  if (deleteResult) {
    webSocketManager.broadcastCommentUpdate(documentId, commentableId, paragraphId, deleteResult, 'deleted', commentableType);

    // Also broadcast to organization room if document belongs to organization
    const doc3 = await TransactionManager.query(db, 'SELECT organization_id FROM documents WHERE id = ?', [documentId]);
    if (doc3?.organization_id) {
      const eventType = commentableType === 'structure_proposal' ? 'structure-proposal-comment' : 'proposal-comment';
      webSocketManager.broadcastOrganizationUpdate(doc3.organization_id, eventType, {
        type: eventType,
        documentId,
        proposalId: commentableId,
        paragraphId: paragraphId || null,
        comment: deleteResult,
        action: 'deleted'
      });
    }
  }

  res.status(200).json({ 
    message: 'Comment deleted successfully',
    comment: deleteResult
  });
}));

module.exports = router;
