/**
 * Public guest scheduling routes (no authentication).
 * Mounted at /api/public/guest
 */

const express = require('express');
const { asyncHandler, ApiError } = require('../../middleware/errorHandler');
const { logger } = require('../../middleware/logger');
const config = require('../../config');
const GuestSchedulingService = require('../../services/GuestSchedulingService');

const router = express.Router();

function guestSchedulingEnabled() {
  return config.PUBLIC_GUEST_SCHEDULING !== false;
}

function requireGuestSchedulingEnabled(req, res, next) {
  if (!guestSchedulingEnabled()) {
    return next(ApiError.notFound('Not found', 'NOT_FOUND'));
  }
  next();
}

router.use(requireGuestSchedulingEnabled);

router.get('/polls/:token', asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { token } = req.params;
  const guestSessionToken = req.get('X-Guest-Session') || req.get('x-guest-session') || null;

  const view = await GuestSchedulingService.getGuestPollView(db, token, { guestSessionToken });
  if (!view) {
    throw ApiError.notFound('Poll link not found or expired', 'GUEST_POLL_NOT_FOUND');
  }
  res.json(view);
}));

router.put('/polls/:token/responses', asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { token } = req.params;
  const body = req.body || {};
  const displayName = body.displayName ?? body.display_name;
  const sessionToken = body.sessionToken ?? body.session_token;
  const responses = body.responses;

  if (!Array.isArray(responses)) {
    throw ApiError.validation('responses array is required', null, 'VALIDATION_ERROR');
  }

  const normalized = responses
    .map(r => ({
      slotId: r.slot_id ?? r.slotId,
      response: r.response === 'yes' || r.response === 'no' || r.response === 'maybe' ? r.response : null
    }))
    .filter(r => r.slotId && r.response);

  const result = await GuestSchedulingService.saveGuestResponses(db, token, {
    displayName,
    sessionToken,
    responses: normalized
  });

  if (!result) {
    throw ApiError.notFound('Poll link not found or expired', 'GUEST_POLL_NOT_FOUND');
  }
  if (result.error === 'NOT_FOUND') {
    throw ApiError.notFound('Poll link not found or expired', 'GUEST_POLL_NOT_FOUND');
  }
  if (result.error === 'POLL_CLOSED') {
    throw ApiError.conflict('This poll is closed and no longer accepts responses', 'POLL_CLOSED');
  }

  logger.info('guest_poll_responses_saved', { tokenPreview: `${String(token).slice(0, 8)}…` });
  res.json(result);
}));

module.exports = router;
