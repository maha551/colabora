/**
 * Document deletion routes: propose-deletion, vote-deletion, complete-deletion-vote, cancel-deletion, deletion-status.
 * Mounted at /:id so req.params.id is the document id (mergeParams: true).
 */

const express = require('express');
const { asyncHandler, ApiError } = require('../../middleware/errorHandler');
const { requireAuth, requireDocumentAccess } = require('../../middleware/auth');
const { getUserId } = require('../../utils/routeHelpers');
const { broadcastDocumentUpdate, broadcastOrganizationUpdate } = require('../../utils/websocketBroadcast');
const DocumentService = require('../../services/DocumentService');
const votingLockManager = require('../../utils/votingLocks');
const { logger } = require('../../middleware/logger');

const router = express.Router({ mergeParams: true });

router.post('/propose-deletion', requireAuth, requireDocumentAccess, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const documentId = req.params.id;
  const userId = getUserId(req);
  try {
    const result = await DocumentService.proposeDeletion(db, documentId, userId, req.body);
    broadcastDocumentUpdate(documentId, 'deletion-proposed', {
      documentId,
      proposedBy: userId,
      voteDeadline: result.voteDeadline
    });
    res.json({
      message: 'Deletion proposal created successfully',
      voteDeadline: result.voteDeadline
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error proposing deletion', { error: error.message, stack: error.stack, documentId });
    throw ApiError.database('Failed to propose deletion', { originalError: error.message }, 'PROPOSE_DELETION_FAILED');
  }
}));

router.post('/vote-deletion', requireAuth, requireDocumentAccess, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const documentId = req.params.id;
  const userId = getUserId(req);
  const { vote } = req.body;
  if (!['PRO', 'NEUTRAL', 'CONTRA'].includes(vote)) {
    return next(ApiError.validation('Invalid vote type. Must be PRO, NEUTRAL, or CONTRA', null, 'INVALID_VOTE_TYPE'));
  }
  try {
    const result = await votingLockManager.withVoteLock('deletion', documentId, async () => {
      return await DocumentService.castDocumentDeletionVoteWithBroadcast(db, documentId, userId, vote, {
        broadcastDocumentUpdate,
        broadcastOrganizationUpdate
      });
    });
    res.json({
      message: result.action === 'updated' ? 'Vote updated successfully' : 'Vote cast successfully',
      receiptId: result.receiptId,
      contestId: result.contestId,
      voteType: result.voteType,
      voteRecordedAt: result.voteRecordedAt
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error voting on deletion', { error: error.message, stack: error.stack, documentId });
    throw ApiError.database('Failed to cast deletion vote', { originalError: error.message }, 'CAST_DELETION_VOTE_FAILED');
  }
}));

router.post('/complete-deletion-vote', requireAuth, requireDocumentAccess, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const documentId = req.params.id;
  const { organizationId } = await DocumentService.completeDeletionVote(db, documentId, getUserId(req));
  broadcastDocumentUpdate(documentId, 'deletion-vote-completed', {
    type: 'deletion-vote-completed',
    documentId,
    outcome: 'completed'
  });
  if (organizationId) {
    broadcastOrganizationUpdate(organizationId, 'deletion-vote-completed', {
      type: 'deletion-vote-completed',
      documentId,
      outcome: 'completed'
    });
  }
  res.json({ success: true, message: 'Vote completed successfully' });
}));

router.post('/cancel-deletion', requireAuth, requireDocumentAccess, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const documentId = req.params.id;
  const userId = getUserId(req);
  await DocumentService.cancelDeletion(db, documentId, userId);
  broadcastDocumentUpdate(documentId, 'deletion-cancelled', { documentId, cancelledBy: userId });
  res.json({ message: 'Deletion proposal cancelled successfully' });
}));

router.get('/deletion-status', requireAuth, requireDocumentAccess, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const result = await DocumentService.getDeletionStatus(db, req.params.id, getUserId(req));
  res.json(result);
}));

module.exports = router;
