const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { logger } = require('../middleware/logger');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { getUserId } = require('../utils/routeHelpers');
const { getDocumentIdsForPendingVotes, getFormattedPendingProposals } = require('../utils/pendingParagraphProposals');
const router = express.Router();

// GET /api/pending-votes - Get all proposals that need the current user's vote
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const userId = getUserId(req);

  let documentIds;
  try {
    documentIds = await getDocumentIdsForPendingVotes(db, userId);
  } catch (err) {
    logger.error('Error fetching documents for pending votes', { error: err.message, userId });
    throw new ApiError(500, 'Failed to fetch documents', 'DATABASE_ERROR', { details: err.message });
  }

  if (documentIds.length === 0) {
    return res.json({ proposals: [] });
  }

  const proposals = await getFormattedPendingProposals(db, userId, documentIds);
  res.json({ proposals });
}));

module.exports = router;
