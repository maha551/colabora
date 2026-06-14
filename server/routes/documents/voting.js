/**
 * Document voting routes: vote, votes, voting-status, start-voting, complete-voting, finalize-voting.
 * Mounted at /:id so req.params.id is the document id (mergeParams: true).
 */

const express = require('express');
const { asyncHandler, ApiError } = require('../../middleware/errorHandler');
const { requireAuth, requireDocumentAccess } = require('../../middleware/auth');
const { getUserId } = require('../../utils/routeHelpers');
const TransactionManager = require('../../database/services/TransactionManager');
const { broadcastDocumentUpdate, broadcastOrganizationUpdate } = require('../../utils/websocketBroadcast');
const DocumentService = require('../../services/DocumentService');
const UnifiedVotingService = require('../../modules/unified-voting');
const { logger } = require('../../middleware/logger');

const router = express.Router({ mergeParams: true });

/** Uses DocumentService.checkAgreementStatus with retries; broadcasts if status transitioned to agreed. */
async function retryCheckDocumentAgreementStatus(db, documentId, options = {}) {
  const { maxRetries = 3, initialDelay = 500, maxDelay = 5000, backoffMultiplier = 2 } = options;
  let lastError;
  let delay = initialDelay;
  const documentService = new DocumentService(db);
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await documentService.checkAgreementStatus(documentId);
      if (result?.transitioned) {
        broadcastDocumentUpdate(documentId, 'document-status-changed', {
          documentId,
          oldStatus: result.oldStatus,
          newStatus: result.newStatus,
          reason: 'approval_threshold_met'
        });
      }
      return;
    } catch (error) {
      lastError = error;
      const retryableErrors = ['SQLITE_BUSY', 'SQLITE_LOCKED', 'SQLITE_PROTOCOL', 'ECONNRESET', 'ETIMEDOUT'];
      const isRetryable = error.code && retryableErrors.some(code => error.code.includes(code)) ||
                          error.message && (error.message.includes('SQLITE_BUSY') || error.message.includes('SQLITE_LOCKED') ||
                                           error.message.includes('locked') || error.message.includes('transaction') ||
                                           error.message.includes('timeout') || error.message.includes('connection'));
      if (!isRetryable || attempt === maxRetries) {
        logger.warn('checkDocumentAgreementStatus failed and will not be retried', { error: error.message, attempt: attempt + 1, documentId });
        return;
      }
      logger.warn(`checkDocumentAgreementStatus failed, retrying (attempt ${attempt + 1}/${maxRetries})`, { error: error.message, delay, documentId });
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }
  if (lastError) {
    logger.error('checkDocumentAgreementStatus failed after all retries', { error: lastError.message, documentId });
  }
}

async function handleFinalizeOrCompleteVoting(req, res, next) {
  const db = req.app.locals.knex || req.app.locals.db;
  const documentId = req.params.id;
  const userId = getUserId(req);
  try {
    const documentService = new DocumentService(db);
    await documentService.finalizeVoting(documentId, userId, req.user.role);
    res.json({ message: 'Voting finalized successfully' });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error finalizing voting', { error: error.message, stack: error.stack, documentId });
    throw ApiError.database('Failed to finalize voting', { originalError: error.message }, 'FINALIZE_VOTING_FAILED');
  }
}

router.post('/vote', requireAuth, requireDocumentAccess, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const documentId = req.params.id;
  const userId = getUserId(req);
  const voteResult = await DocumentService.castDocumentVote(db, documentId, userId, req.body);
  const { voteId: finalVoteId, action, receiptId, contestId, voteType, voteRecordedAt } = voteResult;
  const vote = req.body.vote;

  retryCheckDocumentAgreementStatus(db, documentId).catch(err => {
    logger.error('Error in checkDocumentAgreementStatus after retries', { error: err.message, documentId });
  });

  try {
    const votes = await TransactionManager.queryAll(db, `SELECT dv.*, u.name as user_name, u.email as user_email 
      FROM document_votes dv 
      LEFT JOIN users u ON dv.user_id = u.id 
      WHERE dv.document_id = ? 
      ORDER BY dv.created_at ASC`, [documentId]);

    if (votes && votes.length > 0) {
      const doc = await TransactionManager.query(db, `SELECT voting_anonymous, organization_id FROM documents WHERE id = ?`, [documentId]);
      const isAnonymous = doc?.voting_anonymous === true;
      const formattedVotes = UnifiedVotingService.formatVotesForResponse(votes, isAnonymous, userId);

      broadcastDocumentUpdate(documentId, 'document-vote', {
        documentId,
        votes: formattedVotes,
        action
      });
      if (doc?.organization_id) {
        broadcastOrganizationUpdate(doc.organization_id, 'document-vote', {
          type: 'document-vote',
          documentId,
          votes: formattedVotes,
          action
        });
      }

      res.json({
        message: action === 'updated' ? 'Vote updated successfully' : 'Vote cast successfully',
        votes: formattedVotes,
        voteId: finalVoteId,
        vote,
        isAnonymous,
        receiptId,
        contestId,
        voteType,
        voteRecordedAt
      });
    } else {
      res.json({
        message: action === 'updated' ? 'Vote updated successfully' : 'Vote cast successfully',
        receiptId,
        contestId,
        voteType,
        voteRecordedAt
      });
    }
  } catch (voteErr) {
    logger.error('Error fetching votes after vote', { error: voteErr.message, documentId });
    res.json({
      message: action === 'updated' ? 'Vote updated successfully' : 'Vote cast successfully',
      receiptId,
      contestId,
      voteType,
      voteRecordedAt
    });
  }
}));

router.get('/votes', requireAuth, requireDocumentAccess, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const result = await DocumentService.getDocumentVotes(db, req.params.id, getUserId(req));
  res.json(result);
}));

router.get('/voting-status', requireAuth, requireDocumentAccess, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const result = await DocumentService.getDocumentVotingStatus(db, req.params.id, getUserId(req));
  res.json(result);
}));

router.post('/start-voting', requireAuth, requireDocumentAccess, asyncHandler(async (req, res) => {
  const db = req.app.locals.knex || req.app.locals.db;
  const result = await DocumentService.startDocumentVoting(db, req.params.id, getUserId(req), { isAdmin: req.user.role === 'admin' });
  res.json({
    message: 'Voting period started successfully',
    votingDeadline: result.votingDeadline
  });
}));

router.post('/complete-voting', requireAuth, requireDocumentAccess, asyncHandler(handleFinalizeOrCompleteVoting));
router.post('/finalize-voting', requireAuth, requireDocumentAccess, asyncHandler(handleFinalizeOrCompleteVoting));

module.exports = router;
