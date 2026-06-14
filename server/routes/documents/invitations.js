/**
 * Document invitation routes: validate token, accept invitation.
 * Mounted under /api/documents so paths are /invitations/validate/:token and /invitations/:token/accept.
 */

const express = require('express');
const { asyncHandler, ApiError } = require('../../middleware/errorHandler');
const { requireAuth } = require('../../middleware/auth');
const { getUserId } = require('../../utils/routeHelpers');
const DocumentService = require('../../services/DocumentService');
const { logger } = require('../../middleware/logger');

const router = express.Router();

router.get('/invitations/validate/:token', asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db || req.app.locals.knex;
  if (!db) return next(ApiError.database('Database not available'));
  try {
    const result = await DocumentService.validateInvitationToken(db, req.params.token);
    res.json(result);
  } catch (error) {
    logger.error('Error validating document invitation', { error: error.message, token: req.params.token });
    next(ApiError.database('Failed to validate invitation', { originalError: error.message }));
  }
}));

router.post('/invitations/:token/accept', requireAuth, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db || req.app.locals.knex;
  if (!db) return next(ApiError.database('Database not available'));
  try {
    const result = await DocumentService.acceptDocumentInvitation(db, req.params.token, getUserId(req));
    res.json(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('Error accepting document invitation', { error: error.message, token: req.params.token, userId: getUserId(req) });
    next(ApiError.database('Failed to accept invitation', { originalError: error.message }));
  }
}));

module.exports = router;
