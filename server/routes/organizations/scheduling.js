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
const SchedulingNotificationService = require('../../services/SchedulingNotificationService');
const { broadcastOrganizationUpdate } = require('../../utils/websocketBroadcast');
const TransactionManager = require('../../database/services/TransactionManager');

const router = express.Router({ mergeParams: true });

// Create poll (representatives only)
router.post('/:organizationId/scheduling-polls', requireAuth, requireOrganizationMember, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = getUserId(req);
  const isRep = await isRepresentative(db, userId, organizationId);
  if (!isRep) throw ApiError.forbidden('Only representatives can create scheduling polls', 'NOT_REPRESENTATIVE');

  const body = req.body || {};
  const { title, description } = body;
  const participationDeadline = body.participation_deadline ?? body.participationDeadline;

  if (!title || typeof title !== 'string' || !title.trim()) {
    throw ApiError.validation('Title is required', null, 'VALIDATION_ERROR');
  }

  let poll;
  try {
    poll = await SchedulingService.createPoll(db, {
      organizationId,
      userId,
      title: title.trim(),
      description: description != null ? String(description).trim() : null,
      participationDeadline
    });
  } catch (err) {
    if (err.code === 'VALIDATION_ERROR') {
      throw ApiError.validation(err.message, null, 'VALIDATION_ERROR');
    }
    throw err;
  }

  const memberUserIds = await SchedulingService.getActiveMemberUserIds(db, organizationId);
  await SchedulingNotificationService.notifyPollOpened(db, {
    organizationId,
    pollId: poll.id,
    poll,
    userIds: memberUserIds
  });

  broadcastOrganizationUpdate(organizationId, 'scheduling-poll-opened', {
    organizationId,
    pollId: poll.id,
    title: poll.title,
    participationDeadline: poll.participationDeadline
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
  const canManage = await SchedulingService.canManagePoll(db, pollId, organizationId, userId);
  const result = await SchedulingService.getPoll(db, {
    pollId,
    organizationId,
    userId,
    includeParticipationSummary: canManage
  });
  if (!result) throw ApiError.notFound('Scheduling poll', 'POLL_NOT_FOUND');
  res.json(result);
}));

// Update poll (extend participation deadline)
router.patch('/:organizationId/scheduling-polls/:pollId', requireAuth, requireOrganizationMember, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId, pollId } = req.params;
  const userId = getUserId(req);
  const canManage = await SchedulingService.canManagePoll(db, pollId, organizationId, userId);
  if (!canManage) throw ApiError.forbidden('Only the poll creator or a representative can update the poll', 'NOT_ALLOWED');

  const body = req.body || {};
  const participationDeadline = body.participation_deadline ?? body.participationDeadline;
  if (!participationDeadline) {
    throw ApiError.validation('participationDeadline is required', null, 'VALIDATION_ERROR');
  }

  let result;
  try {
    result = await SchedulingService.extendParticipationDeadline(db, {
      pollId,
      organizationId,
      participationDeadline
    });
  } catch (err) {
    if (err.code === 'VALIDATION_ERROR') {
      throw ApiError.validation(err.message, null, 'VALIDATION_ERROR');
    }
    throw err;
  }

  if (!result) throw ApiError.notFound('Scheduling poll', 'POLL_NOT_FOUND');
  if (result.error === 'POLL_FINALIZED') {
    throw ApiError.conflict('This poll is finalized and cannot be updated', 'POLL_FINALIZED');
  }

  broadcastOrganizationUpdate(organizationId, 'scheduling-poll-deadline-extended', {
    organizationId,
    pollId,
    participationDeadline: result.poll.participationDeadline,
    reopened: result.reopened
  });

  res.json(result);
}));

// Close poll for participation (manual early close)
router.post('/:organizationId/scheduling-polls/:pollId/close', requireAuth, requireOrganizationMember, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId, pollId } = req.params;
  const userId = getUserId(req);
  const canManage = await SchedulingService.canManagePoll(db, pollId, organizationId, userId);
  if (!canManage) throw ApiError.forbidden('Only the poll creator or a representative can close the poll', 'NOT_ALLOWED');

  const result = await SchedulingService.closePollForParticipation(db, {
    pollId,
    organizationId,
    reason: 'manual'
  });

  if (!result) throw ApiError.notFound('Scheduling poll', 'POLL_NOT_FOUND');
  if (result.error === 'POLL_NOT_OPEN') {
    throw ApiError.conflict('This poll is not open for participation', 'POLL_NOT_OPEN');
  }

  if (!result.alreadyClosed) {
    const managerUserIds = await SchedulingService.getManagerUserIds(db, pollId, organizationId);
    await SchedulingNotificationService.notifyParticipationClosed(db, {
      organizationId,
      pollId,
      poll: result.poll,
      participationSummary: result.participationSummary,
      suggestedSlot: result.suggestedSlot,
      closedReason: 'manual',
      userIds: managerUserIds
    });

    broadcastOrganizationUpdate(organizationId, 'scheduling-poll-participation-closed', {
      organizationId,
      pollId,
      title: result.poll.title,
      closedReason: 'manual'
    });
  }

  res.json({
    poll: result.poll,
    participationSummary: result.participationSummary,
    suggestedSlot: result.suggestedSlot
  });
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
  const added = await SchedulingService.addSlots(db, {
    pollId,
    organizationId,
    slots: slots.map(s => ({
      startAt: s.start_at ?? s.startAt,
      endAt: s.end_at ?? s.endAt,
      sortOrder: s.sort_order ?? s.sortOrder
    }))
  });
  if (added === null) throw ApiError.notFound('Scheduling poll', 'POLL_NOT_FOUND');
  if (added.error === 'POLL_CLOSED') {
    throw ApiError.conflict('This poll is closed and no longer accepts changes', 'POLL_CLOSED');
  }
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
  if (result.error === 'POLL_CLOSED') {
    throw ApiError.conflict('This poll is closed and no longer accepts responses', 'POLL_CLOSED');
  }
  res.json({ responses: result });
}));

// Finalize poll (creator or rep)
router.post('/:organizationId/scheduling-polls/:pollId/finalize', requireAuth, requireOrganizationMember, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId, pollId } = req.params;
  const userId = getUserId(req);
  const canManage = await SchedulingService.canManagePoll(db, pollId, organizationId, userId);
  if (!canManage) throw ApiError.forbidden('Only the poll creator or a representative can finalize', 'NOT_ALLOWED');

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
  if (result.error === 'POLL_FINALIZED') {
    throw ApiError.conflict('This poll is already finalized', 'POLL_FINALIZED');
  }
  if (result.error === 'POLL_NOT_FINALIZABLE') {
    throw ApiError.conflict('This poll cannot be finalized in its current state', 'POLL_NOT_FINALIZABLE');
  }
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
