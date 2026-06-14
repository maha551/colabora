/**
 * Organization meeting routes (Phase 3).
 * Mounted under /api/organizations by the main organizations router.
 */

const express = require('express');
const { requireAuth, requireOrganizationMember } = require('../../middleware/auth');
const { asyncHandler, ApiError } = require('../../middleware/errorHandler');
const { getUserId } = require('../../utils/routeHelpers');
const { paramValidation } = require('../../middleware/validation');
const MeetingService = require('../../services/MeetingService');
const TransactionManager = require('../../database/services/TransactionManager');
const meetingMinutesRouter = require('./meeting-minutes');

const router = express.Router({ mergeParams: true });

function parseDateParam(value) {
  if (value == null || value === '') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Create meeting from finalized scheduling poll (must be before /:meetingId)
router.post('/:organizationId/meetings/from-scheduling-poll/:pollId', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId, pollId } = req.params;
  const userId = getUserId(req);
  const { title, createRoom } = req.body || {};
  try {
    const meeting = await MeetingService.createMeetingFromSchedulingPoll(db, {
      organizationId,
      userId,
      pollId,
      title: title != null ? String(title).trim() : undefined,
      createRoom: Boolean(createRoom)
    });
    if (!meeting) throw ApiError.notFound('Scheduling poll not found or not finalized', 'POLL_NOT_FOUND');
    res.status(201).json(meeting);
  } catch (err) {
    if (err.message && err.message.includes('not configured')) {
      throw ApiError.validation('Video provider not configured', null, 'VIDEO_NOT_CONFIGURED');
    }
    throw err;
  }
}));

// Create meeting (org member)
router.post('/:organizationId/meetings', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const userId = getUserId(req);
  const { title, scheduled_at: scheduledAt, end_at: endAt, location, createRoom } = req.body || {};
  if (!title || typeof title !== 'string' || !title.trim()) {
    throw ApiError.validation('Title is required', null, 'VALIDATION_ERROR');
  }
  if (!scheduledAt) {
    throw ApiError.validation('scheduled_at is required (ISO date/time)', null, 'VALIDATION_ERROR');
  }
  const at = parseDateParam(scheduledAt);
  if (!at) throw ApiError.validation('scheduled_at must be a valid ISO date/time', null, 'VALIDATION_ERROR');
  const end = endAt != null ? parseDateParam(endAt) : null;
  try {
    const meeting = await MeetingService.createMeeting(db, {
      organizationId,
      userId,
      title: title.trim(),
      scheduledAt: at.toISOString(),
      endAt: end ? end.toISOString() : null,
      location: location != null ? String(location).trim() : null,
      createRoom: Boolean(createRoom)
    });
    res.status(201).json(meeting);
  } catch (err) {
    if (err.message && err.message.includes('not configured')) {
      throw ApiError.validation('Video provider not configured', null, 'VIDEO_NOT_CONFIGURED');
    }
    throw err;
  }
}));

// List meetings (org member)
router.get('/:organizationId/meetings', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const from = parseDateParam(req.query.from);
  const to = parseDateParam(req.query.to);
  const meetings = await MeetingService.listMeetings(db, { organizationId, from, to });
  res.json({ meetings });
}));

// List minutes documents (literal path; must be before /:meetingId or "minutes-documents" is matched as meetingId)
// GET /api/organizations/:organizationId/meetings/minutes-documents
router.get('/:organizationId/meetings/minutes-documents', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId } = req.params;
  const rows = await TransactionManager.queryAll(db,
    `SELECT id, title, minutes_document_id, minutes_finalized_at
     FROM meetings
     WHERE organization_id = ? AND minutes_document_id IS NOT NULL
     ORDER BY scheduled_at DESC, created_at DESC`,
    [organizationId]
  );
  const minutesDocuments = rows.map(r => ({
    meetingId: r.id,
    meetingTitle: r.title || '',
    documentId: r.minutes_document_id,
    minutesFinalizedAt: r.minutes_finalized_at || null
  }));
  res.json({ minutesDocuments });
}));

// Meeting minutes sub-routes (after literal paths so :meetingId does not capture "minutes-documents")
router.use('/:organizationId/meetings/:meetingId', ...paramValidation.organizationId, ...paramValidation.meetingId, meetingMinutesRouter);

// Get one meeting (org member)
router.get('/:organizationId/meetings/:meetingId', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId, meetingId } = req.params;
  const meeting = await MeetingService.getMeeting(db, { meetingId, organizationId });
  if (!meeting) throw ApiError.notFound('Meeting', 'MEETING_NOT_FOUND');
  res.json(meeting);
}));

// Update meeting (creator or representative)
router.put('/:organizationId/meetings/:meetingId', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId, meetingId } = req.params;
  const userId = getUserId(req);
  const canManage = await MeetingService.canManageMeeting(db, meetingId, organizationId, userId);
  if (!canManage) throw ApiError.forbidden('Only the meeting creator or a representative can update this meeting', 'NOT_ALLOWED');

  const { title, scheduled_at: scheduledAt, end_at: endAt, location, meeting_link: meetingLink } = req.body || {};
  const updates = {};
  if (title !== undefined) updates.title = typeof title === 'string' ? title.trim() : title;
  if (scheduledAt !== undefined) {
    const at = parseDateParam(scheduledAt);
    if (!at) throw ApiError.validation('scheduled_at must be a valid ISO date/time', null, 'VALIDATION_ERROR');
    updates.scheduledAt = at.toISOString();
  }
  if (endAt !== undefined) {
    const end = parseDateParam(endAt);
    updates.endAt = end ? end.toISOString() : null;
  }
  if (location !== undefined) updates.location = location;
  if (meetingLink !== undefined) updates.meetingLink = meetingLink;

  const meeting = await MeetingService.updateMeeting(db, {
    meetingId,
    organizationId,
    ...updates
  });
  if (!meeting) throw ApiError.notFound('Meeting', 'MEETING_NOT_FOUND');
  res.json(meeting);
}));

// Create video room (creator or representative)
router.post('/:organizationId/meetings/:meetingId/create-room', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId, meetingId } = req.params;
  const userId = getUserId(req);
  const canManage = await MeetingService.canManageMeeting(db, meetingId, organizationId, userId);
  if (!canManage) throw ApiError.forbidden('Only the meeting creator or a representative can create a video room', 'NOT_ALLOWED');

  const meeting = await MeetingService.getMeeting(db, { meetingId, organizationId });
  if (!meeting) throw ApiError.notFound('Meeting', 'MEETING_NOT_FOUND');
  if (meeting.meetingLink) {
    throw ApiError.validation('Meeting already has a video room link', null, 'ROOM_ALREADY_EXISTS');
  }

  try {
    const updated = await MeetingService.createRoom(db, meetingId);
    res.json(updated);
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('not configured')) {
      throw ApiError.validation('Video provider not configured', null, 'VIDEO_NOT_CONFIGURED');
    }
    if (msg.includes('must be set') || msg.includes('BigBlueButton')) {
      throw ApiError.validation('BigBlueButton is not configured correctly. Set BIGBLUEBUTTON_URL and BIGBLUEBUTTON_SECRET.', null, 'VIDEO_NOT_CONFIGURED');
    }
    if (msg.includes('Unsupported video provider')) {
      throw ApiError.validation('Unsupported video provider. Set VIDEO_PROVIDER to jitsi or bigbluebutton.', null, 'VIDEO_NOT_CONFIGURED');
    }
    if (msg.includes('timeout') || msg.includes('failed')) {
      throw ApiError.validation('Could not create video room. The video server may be unreachable.', null, 'VIDEO_ROOM_CREATE_FAILED');
    }
    throw err;
  }
}));

module.exports = router;
