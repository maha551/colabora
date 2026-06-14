/**
 * Organization scheduling poll routes (Phase 2).
 * Mounted under /api/organizations by the main organizations router.
 */

const express = require('express');
const { requireAuth, requireOrganizationMember } = require('../../middleware/auth');
const { asyncHandler, ApiError } = require('../../middleware/errorHandler');
const { logger } = require('../../middleware/logger');
const { getUserId } = require('../../utils/routeHelpers');
const { isRepresentative } = require('../../modules/permissions');
const SchedulingService = require('../../services/SchedulingService');
const TransactionManager = require('../../database/services/TransactionManager');

const router = express.Router({ mergeParams: true });

// Create poll (representatives only)
router.post('/:organizationId/scheduling-polls', requireAuth, requireOrganizationMember, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = getUserId(req);
  const isRep = await isRepresentative(db, userId, organizationId);
  if (!isRep) throw ApiError.forbidden('Only representatives can create scheduling polls', 'NOT_REPRESENTATIVE');

  const { title, description } = req.body || {};
  if (!title || typeof title !== 'string' || !title.trim()) {
    throw ApiError.validation('Title is required', null, 'VALIDATION_ERROR');
  }
  const poll = await SchedulingService.createPoll(db, {
    organizationId,
    userId,
    title: title.trim(),
    description: description != null ? String(description).trim() : null
  });
  res.status(201).json({ poll });
}));

// List polls (org member)
router.get('/:organizationId/scheduling-polls', requireAuth, requireOrganizationMember, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const polls = await SchedulingService.listPolls(db, { organizationId });
  res.json({ polls });
}));

// Get one poll with slots, response counts, and current user's responses (org member)
router.get('/:organizationId/scheduling-polls/:pollId', requireAuth, requireOrganizationMember, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId, pollId } = req.params;
  const userId = getUserId(req);
  const result = await SchedulingService.getPoll(db, { pollId, organizationId, userId });
  if (!result) throw ApiError.notFound('Scheduling poll', 'POLL_NOT_FOUND');
  res.json(result);
}));

// Add slots (creator or rep)
router.post('/:organizationId/scheduling-polls/:pollId/slots', requireAuth, requireOrganizationMember, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId, pollId } = req.params;
  const userId = getUserId(req);
  const canManage = await SchedulingService.canManagePoll(db, pollId, organizationId, userId);
  if (!canManage) throw ApiError.forbidden('Only the poll creator or a representative can add slots', 'NOT_ALLOWED');

  const { slots } = req.body || {};
  if (!Array.isArray(slots) || slots.length === 0) {
    throw ApiError.validation('slots array with at least one { startAt, endAt } is required', null, 'VALIDATION_ERROR');
  }
  // transformRequest converts body to snake_case; support both for compatibility
  const added = await SchedulingService.addSlots(db, {
    pollId,
    organizationId,
    slots: slots.map(s => ({
      startAt: s.start_at ?? s.startAt,
      endAt: s.end_at ?? s.endAt,
      sortOrder: s.sort_order ?? s.sortOrder
    }))
  });
  if (!added) throw ApiError.notFound('Scheduling poll', 'POLL_NOT_FOUND');
  res.status(201).json({ slots: added });
}));

// Set my responses (org member)
router.put('/:organizationId/scheduling-polls/:pollId/responses', requireAuth, requireOrganizationMember, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId, pollId } = req.params;
  const userId = getUserId(req);
  const { responses } = req.body || {};
  if (!Array.isArray(responses)) {
    throw ApiError.validation('responses array is required', null, 'VALIDATION_ERROR');
  }
  // transformRequest converts body to snake_case; support both for compatibility
  const normalized = responses
    .map(r => ({
      slotId: r.slot_id ?? r.slotId,
      response: r.response === 'yes' || r.response === 'no' || r.response === 'maybe' ? r.response : 'maybe'
    }))
    .filter(r => r.slotId);
  const result = await SchedulingService.recordResponse(db, {
    pollId,
    organizationId,
    userId,
    responses: normalized
  });
  if (result === null) throw ApiError.notFound('Scheduling poll', 'POLL_NOT_FOUND');
  res.json({ responses: result });
}));

// Finalize poll (creator or rep)
router.post('/:organizationId/scheduling-polls/:pollId/finalize', requireAuth, requireOrganizationMember, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId, pollId } = req.params;
  const userId = getUserId(req);
  const canManage = await SchedulingService.canManagePoll(db, pollId, organizationId, userId);
  if (!canManage) throw ApiError.forbidden('Only the poll creator or a representative can finalize', 'NOT_ALLOWED');

  // transformRequest converts body to snake_case; support both for compatibility
  const chosenSlotId = (req.body && (req.body.chosen_slot_id ?? req.body.chosenSlotId)) || null;
  if (!chosenSlotId || typeof chosenSlotId !== 'string') {
    throw ApiError.validation('chosenSlotId is required', null, 'VALIDATION_ERROR');
  }
  const result = await SchedulingService.finalizePoll(db, {
    pollId,
    organizationId,
    chosenSlotId: chosenSlotId.trim()
  });
  if (!result) throw ApiError.notFound('Scheduling poll or slot', 'NOT_FOUND');
  res.json(result);
}));

// Guest share link (creator or rep)
router.get('/:organizationId/scheduling-polls/:pollId/guest-link', requireAuth, requireOrganizationMember, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId, pollId } = req.params;
  const userId = getUserId(req);
  const canManage = await SchedulingService.canManagePoll(db, pollId, organizationId, userId);
  if (!canManage) throw ApiError.forbidden('Only the poll creator or a representative can access the guest link', 'NOT_ALLOWED');

  const GuestSchedulingService = require('../../services/GuestSchedulingService');
  const link = await GuestSchedulingService.ensureGuestLink(db, pollId);
  if (!link) throw ApiError.notFound('Scheduling poll', 'POLL_NOT_FOUND');

  res.json({
    url: link.url,
    expiresAt: link.expiresAt,
    tokenPreview: `${link.token.slice(0, 8)}…`
  });
}));

router.post('/:organizationId/scheduling-polls/:pollId/guest-link/regenerate', requireAuth, requireOrganizationMember, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId, pollId } = req.params;
  const userId = getUserId(req);
  const canManage = await SchedulingService.canManagePoll(db, pollId, organizationId, userId);
  if (!canManage) throw ApiError.forbidden('Only the poll creator or a representative can regenerate the guest link', 'NOT_ALLOWED');

  const poll = await TransactionManager.query(db,
    'SELECT id FROM scheduling_polls WHERE id = ? AND organization_id = ?',
    [pollId, organizationId]
  );
  if (!poll) throw ApiError.notFound('Scheduling poll', 'POLL_NOT_FOUND');

  const GuestSchedulingService = require('../../services/GuestSchedulingService');
  const link = await GuestSchedulingService.regenerateGuestLink(db, pollId);
  if (!link) throw ApiError.notFound('Scheduling poll', 'POLL_NOT_FOUND');

  logger.info('guest_link_regenerated', { pollId, organizationId, userId });
  res.json({
    url: link.url,
    expiresAt: link.expiresAt,
    tokenPreview: `${link.token.slice(0, 8)}…`
  });
}));

module.exports = router;
