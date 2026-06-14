/**
 * Meeting minutes routes: events, timeline, moderators, votes, brainstorm, finalize.
 * Mounted at /:organizationId/meetings/:meetingId (mergeParams). Base path: /api/organizations/:organizationId/meetings/:meetingId
 */

const express = require('express');
const { requireAuth, requireOrganizationMember } = require('../../middleware/auth');
const { asyncHandler, ApiError } = require('../../middleware/errorHandler');
const { getUserId } = require('../../utils/routeHelpers');
const { paramValidation } = require('../../middleware/validation');
const { logger } = require('../../middleware/logger');
const MeetingService = require('../../services/MeetingService');
const MeetingMinutesService = require('../../services/MeetingMinutesService');
const MinutesArchiveService = require('../../services/MinutesArchiveService');
const DocumentService = require('../../services/DocumentService');
const TransactionManager = require('../../database/services/TransactionManager');
const { broadcastOrganizationUpdate, broadcastDocumentUpdate } = require('../../utils/websocketBroadcast');
const { logOrganizationAudit } = require('../../utils/auditLogger');
const config = require('../../config');

const router = express.Router({ mergeParams: true });

async function archiveWriteSafely(writer, context) {
  if (!config.MINUTES_ARCHIVE_ENABLED) return;
  try {
    await writer();
  } catch (err) {
    logger.warn('Minutes archive dual-write skipped after error', {
      error: err.message,
      ...context
    });
  }
}

/** Require moderator: call MeetingService.canModerateMeeting; 403 if false */
const requireModerator = asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const { organizationId, meetingId } = req.params;
  const userId = getUserId(req);
  const can = await MeetingService.canModerateMeeting(db, meetingId, organizationId, userId);
  if (!can) {
    throw ApiError.forbidden('Only moderators can perform this action', 'NOT_MODERATOR');
  }
  next();
});

/** Get meeting row for minutes_document_id (and ensure meeting exists in org). */
async function getMeetingForMinutes(req) {
  const db = req.app.locals.db;
  const { organizationId, meetingId } = req.params;
  const row = await TransactionManager.query(db,
    'SELECT id, minutes_document_id FROM meetings WHERE id = ? AND organization_id = ?',
    [meetingId, organizationId]
  );
  if (!row) throw ApiError.notFound('Meeting', 'MEETING_NOT_FOUND');
  return row;
}

function broadcastMeetingUpdate(meetingId, eventType, data) {
  try {
    const webSocketManager = require('../../modules/websocket');
    webSocketManager.broadcastMeetingUpdate(meetingId, eventType, data);
  } catch (err) {
    logger.debug('WebSocket broadcastMeetingUpdate skipped', { meetingId, eventType, error: err.message });
  }
}

/** Block mutating routes when minutes are already finalized. */
const requireMinutesNotFinalized = asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const { meetingId, organizationId } = req.params;
  const meeting = await TransactionManager.query(db,
    'SELECT minutes_finalized_at FROM meetings WHERE id = ? AND organization_id = ?',
    [meetingId, organizationId]
  );
  if (meeting && meeting.minutes_finalized_at) {
    throw ApiError.validation('Minutes are finalized', null, 'MINUTES_FINALIZED');
  }
  next();
});

/** Build a timeline event item for real-time protocol canvas updates (mirrors getTimeline shape). */
function buildTimelineEventItem(event, extras = {}) {
  const item = {
    type: 'event',
    id: event.id,
    occurredAt: event.createdAt,
    orderIndex: event.orderIndex,
    eventType: event.eventType,
    payload: event.payload
  };
  if (extras.vote) item.vote = extras.vote;
  if (extras.options) item.options = extras.options;
  return item;
}

// ----- Minutes events -----
router.get('/minutes/events', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, ...paramValidation.meetingId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { meetingId } = req.params;
  const limit = req.query.limit != null ? parseInt(req.query.limit, 10) : null;
  const offset = req.query.offset != null ? parseInt(req.query.offset, 10) : null;
  const events = await MeetingMinutesService.listEvents(db, { meetingId, limit, offset });
  res.json({ events });
}));

router.post('/minutes/events', requireAuth, requireOrganizationMember, requireModerator, ...paramValidation.organizationId, ...paramValidation.meetingId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { meetingId, organizationId } = req.params;
  const userId = getUserId(req);
  const meeting = await getMeetingForMinutes(req);
  const minutesDocumentId = meeting.minutes_document_id;
  if (!minutesDocumentId) throw ApiError.validation('Meeting has no minutes document', null, 'NO_MINUTES_DOCUMENT');
  // transformRequest converts body to snake_case; support both for compatibility
  const eventType = req.body.event_type ?? req.body.eventType;
  const payload = req.body.payload;
  const orderIndex = req.body.order_index ?? req.body.orderIndex;
  if (!eventType || typeof eventType !== 'string' || !eventType.trim()) {
    throw ApiError.validation('eventType is required', null, 'VALIDATION_ERROR');
  }

  const trimmedEventType = eventType.trim();
  const isDocumentCreated = trimmedEventType === 'document_created';
  const payloadTitle = payload && (payload.title != null ? String(payload.title).trim() : '');
  const payloadDocumentId = payload && (payload.documentId ?? payload.document_id);

  if (isDocumentCreated && !payloadDocumentId) {
    if (!payloadTitle) {
      throw ApiError.validation('payload.title is required for document_created', null, 'VALIDATION_ERROR');
    }
    const event = await TransactionManager.executeInTransaction(db, async (trx) => {
      const docResult = await DocumentService.createDocument(trx, 'organizational', organizationId, {}, userId, payloadTitle, null, null, null, null, null);
      return MeetingMinutesService.createEvent(trx, {
        meetingId,
        minutesDocumentId,
        eventType: trimmedEventType,
        payload: { documentId: docResult.id, title: payloadTitle },
        orderIndex: orderIndex != null ? orderIndex : undefined,
        createdByUserId: userId
      });
    });
    broadcastMeetingUpdate(meetingId, 'minutes-event-added', { event });
    await archiveWriteSafely(
      () => MinutesArchiveService.archiveEvent(db, {
        meetingId,
        minutesDocumentId,
        event,
        createdByUserId: userId
      }),
      { meetingId, minutesDocumentId, route: 'POST /minutes/events', eventType: trimmedEventType }
    );
    try {
      broadcastOrganizationUpdate(organizationId, 'document-created', {
        document: { id: event.payload.documentId, title: payloadTitle, organizationId, ownershipType: 'organizational' },
        createdBy: userId
      });
    } catch (broadcastErr) {
      logger.debug('broadcastOrganizationUpdate skipped after document_created', { error: broadcastErr.message });
    }
    return res.status(201).json(event);
  }

  const event = await MeetingMinutesService.createEvent(db, {
    meetingId,
    minutesDocumentId,
    eventType: trimmedEventType,
    payload: payload != null ? payload : undefined,
    orderIndex: orderIndex != null ? orderIndex : undefined,
    createdByUserId: userId
  });
  broadcastMeetingUpdate(meetingId, 'minutes-event-added', { event });
  await archiveWriteSafely(
    () => MinutesArchiveService.archiveEvent(db, {
      meetingId,
      minutesDocumentId,
      event,
      createdByUserId: userId
    }),
    { meetingId, minutesDocumentId, route: 'POST /minutes/events', eventType: trimmedEventType }
  );
  res.status(201).json(event);
}));

router.get('/decisions', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, ...paramValidation.meetingId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { meetingId } = req.params;
  const limit = req.query.limit != null ? parseInt(req.query.limit, 10) : null;
  const offset = req.query.offset != null ? parseInt(req.query.offset, 10) : null;
  const decisions = await MeetingMinutesService.listDecisionsByMeeting(db, { meetingId, limit, offset });
  res.json({ decisions });
}));

router.post('/decisions', requireAuth, requireOrganizationMember, requireModerator, ...paramValidation.organizationId, ...paramValidation.meetingId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { meetingId } = req.params;
  const userId = getUserId(req);
  const meeting = await getMeetingForMinutes(req);
  const minutesDocumentId = meeting.minutes_document_id;
  if (!minutesDocumentId) throw ApiError.validation('Meeting has no minutes document', null, 'NO_MINUTES_DOCUMENT');
  const title = req.body?.title;
  const text = req.body?.text;
  const meetingVoteId = req.body?.meetingVoteId ?? req.body?.meeting_vote_id ?? null;
  const sourceEventId = req.body?.sourceEventId ?? req.body?.source_event_id ?? null;
  const agendaItemId = req.body?.agendaItemId ?? req.body?.agenda_item_id ?? null;
  if ((title == null || (typeof title === 'string' && !title.trim())) && (text == null || (typeof text === 'string' && !text.trim()))) {
    throw ApiError.validation('title or text is required', null, 'VALIDATION_ERROR');
  }
  const decision = await MeetingMinutesService.createDecision(db, {
    meetingId,
    minutesDocumentId,
    agendaItemId: typeof agendaItemId === 'string' && agendaItemId.trim() ? agendaItemId.trim() : null,
    meetingVoteId: typeof meetingVoteId === 'string' && meetingVoteId.trim() ? meetingVoteId.trim() : null,
    sourceEventId: typeof sourceEventId === 'string' && sourceEventId.trim() ? sourceEventId.trim() : null,
    title: title != null ? String(title).trim() : null,
    text: text != null ? String(text).trim() : '',
    createdByUserId: userId
  });
  broadcastMeetingUpdate(meetingId, 'decision-recorded', { decision });
  await archiveWriteSafely(
    () => MinutesArchiveService.archiveDecision(db, {
      meetingId,
      minutesDocumentId,
      decision,
      createdByUserId: userId
    }),
    { meetingId, minutesDocumentId, route: 'POST /decisions' }
  );
  res.status(201).json(decision);
}));

// ----- Timeline -----
router.get('/minutes/timeline', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, ...paramValidation.meetingId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId, meetingId } = req.params;
  const meeting = await getMeetingForMinutes(req);
  const minutesDocumentId = meeting.minutes_document_id;
  const limit = req.query.limit != null ? parseInt(req.query.limit, 10) : null;
  const offset = req.query.offset != null ? parseInt(req.query.offset, 10) : null;
  const { items } = await MeetingMinutesService.getTimeline(db, {
    organizationId,
    meetingId,
    minutesDocumentId: minutesDocumentId || null,
    limit,
    offset
  });
  res.json({ items });
}));

router.post('/minutes/timeline/reorder', requireAuth, requireOrganizationMember, requireModerator, ...paramValidation.organizationId, ...paramValidation.meetingId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { meetingId } = req.params;
  const meeting = await getMeetingForMinutes(req);
  const minutesDocumentId = meeting.minutes_document_id;
  if (!minutesDocumentId) throw ApiError.validation('Meeting has no minutes document', null, 'NO_MINUTES_DOCUMENT');
  const itemIds = req.body?.itemIds ?? req.body?.item_ids ?? [];
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    throw ApiError.validation('itemIds array is required', null, 'VALIDATION_ERROR');
  }
  await MeetingMinutesService.reorderTimeline(db, { meetingId, minutesDocumentId, itemIds });
  await archiveWriteSafely(
    async () => {
      for (let i = 0; i < itemIds.length; i += 1) {
        const itemId = itemIds[i];
        if (!itemId) continue;
        await MinutesArchiveService.writeBlock(db, {
          meetingId,
          minutesDocumentId,
          blockType: 'timeline_reorder',
          status: 'recorded',
          orderIndex: i,
          occurredAt: new Date().toISOString(),
          sourceTimelineItemId: itemId,
          entityKey: `timeline-order:${itemId}`,
          payload: { itemId, orderIndex: i }
        });
      }
    },
    { meetingId, minutesDocumentId, route: 'POST /minutes/timeline/reorder' }
  );
  broadcastMeetingUpdate(meetingId, 'minutes-timeline-reordered', {});
  res.status(200).json({ success: true });
}));

// ----- Agenda -----
router.get('/agenda', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, ...paramValidation.meetingId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { meetingId } = req.params;
  const items = await MeetingMinutesService.listAgendaItems(db, { meetingId });
  res.json({ items });
}));

router.post('/agenda', requireAuth, requireOrganizationMember, requireModerator, ...paramValidation.organizationId, ...paramValidation.meetingId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { meetingId } = req.params;
  const userId = getUserId(req);
  const title = req.body?.title;
  const orderIndex = req.body?.orderIndex ?? req.body?.order_index;
  if (title == null || typeof title !== 'string' || !String(title).trim()) {
    throw ApiError.validation('title is required', null, 'VALIDATION_ERROR');
  }
  const item = await MeetingMinutesService.createAgendaItem(db, {
    meetingId,
    title: String(title).trim(),
    orderIndex: orderIndex != null ? orderIndex : undefined,
    createdByUserId: userId
  });
  broadcastMeetingUpdate(meetingId, 'agenda-item-added', { agendaItem: item });
  res.status(201).json(item);
}));

router.patch('/agenda/order', requireAuth, requireOrganizationMember, requireModerator, ...paramValidation.organizationId, ...paramValidation.meetingId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { meetingId } = req.params;
  const order = req.body?.order;
  if (!Array.isArray(order) || order.length === 0) {
    throw ApiError.validation('order array is required', null, 'VALIDATION_ERROR');
  }
  await MeetingMinutesService.reorderAgendaItems(db, { meetingId, order });
  broadcastMeetingUpdate(meetingId, 'agenda-reordered', { order });
  res.status(200).json({ success: true });
}));

router.patch('/agenda/:itemId', requireAuth, requireOrganizationMember, requireModerator, ...paramValidation.organizationId, ...paramValidation.meetingId, ...paramValidation.agendaItemId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { meetingId, itemId } = req.params;
  const title = req.body?.title;
  const orderIndex = req.body?.orderIndex ?? req.body?.order_index;
  const item = await MeetingMinutesService.updateAgendaItem(db, {
    meetingId,
    itemId,
    title: title !== undefined ? title : undefined,
    orderIndex: orderIndex !== undefined ? orderIndex : undefined
  });
  if (!item) throw ApiError.notFound('Agenda item', 'AGENDA_ITEM_NOT_FOUND');
  broadcastMeetingUpdate(meetingId, 'agenda-item-updated', { agendaItem: item });
  res.json(item);
}));

router.delete('/agenda/:itemId', requireAuth, requireOrganizationMember, requireModerator, ...paramValidation.organizationId, ...paramValidation.meetingId, ...paramValidation.agendaItemId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { meetingId, itemId } = req.params;
  const { wasCurrentTopic } = await MeetingMinutesService.deleteAgendaItem(db, { meetingId, itemId });
  if (wasCurrentTopic) {
    broadcastMeetingUpdate(meetingId, 'current-topic-changed', { currentAgendaItemId: null });
  }
  broadcastMeetingUpdate(meetingId, 'agenda-item-removed', { agendaItemId: itemId });
  res.status(204).send();
}));

router.patch('/current-topic', requireAuth, requireOrganizationMember, requireModerator, ...paramValidation.organizationId, ...paramValidation.meetingId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { meetingId } = req.params;
  const userId = getUserId(req);
  const meeting = await getMeetingForMinutes(req);
  const agendaItemId = req.body?.agendaItemId ?? req.body?.agenda_item_id ?? null;
  const result = await MeetingMinutesService.setCurrentTopic(db, { meetingId, agendaItemId });
  if (result === null) throw ApiError.validation('Invalid agenda item for this meeting', null, 'VALIDATION_ERROR');
  if (result.currentAgendaItemId && meeting.minutes_document_id) {
    const topicEvent = await MeetingMinutesService.createEvent(db, {
      meetingId,
      minutesDocumentId: meeting.minutes_document_id,
      eventType: 'topic_set',
      payload: { agendaItemId: result.currentAgendaItemId },
      createdByUserId: userId
    });
    await archiveWriteSafely(
      () => MinutesArchiveService.archiveEvent(db, {
        meetingId,
        minutesDocumentId: meeting.minutes_document_id,
        event: topicEvent,
        createdByUserId: userId
      }),
      { meetingId, minutesDocumentId: meeting.minutes_document_id, route: 'PATCH /current-topic' }
    );
    broadcastMeetingUpdate(meetingId, 'minutes-event-added', { event: { eventType: 'topic_set', payload: { agendaItemId: result.currentAgendaItemId } } });
  }
  broadcastMeetingUpdate(meetingId, 'current-topic-changed', { currentAgendaItemId: result.currentAgendaItemId });
  res.json(result);
}));

// ----- Moderators -----
router.get('/moderators', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, ...paramValidation.meetingId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { meetingId, organizationId } = req.params;
  const moderators = await MeetingMinutesService.getModerators(db, { meetingId, organizationId });
  res.json({ moderators });
}));

router.post('/moderators', requireAuth, requireOrganizationMember, requireModerator, ...paramValidation.organizationId, ...paramValidation.meetingId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { meetingId } = req.params;
  const userId = getUserId(req);
  const bodyUserId = req.body?.userId ?? req.body?.user_id;
  if (!bodyUserId || typeof bodyUserId !== 'string') {
    throw ApiError.validation('userId is required', null, 'VALIDATION_ERROR');
  }
  let moderator;
  try {
    moderator = await MeetingMinutesService.addModerator(db, {
      meetingId,
      userId: bodyUserId.trim(),
      invitedByUserId: userId
    });
  } catch (err) {
    if (err?.code === 'MEETING_NOT_FOUND') {
      throw ApiError.notFound('Meeting', 'MEETING_NOT_FOUND');
    }
    if (err?.code === 'USER_NOT_FOUND') {
      throw ApiError.notFound('User', 'USER_NOT_FOUND');
    }
    if (err?.code === 'USER_NOT_ORG_MEMBER') {
      throw ApiError.validation('User must be an active or legacy organization member', null, 'USER_NOT_ORG_MEMBER');
    }
    if (err?.code === 'ALREADY_MODERATOR') {
      throw ApiError.validation('User is already a moderator', null, 'ALREADY_MODERATOR');
    }
    throw err;
  }
  broadcastMeetingUpdate(meetingId, 'moderator-added', { userId: moderator.userId, userName: moderator.userName });
  res.status(201).json(moderator);
}));

router.delete('/moderators/:userId', requireAuth, requireOrganizationMember, requireModerator, ...paramValidation.organizationId, ...paramValidation.meetingId, ...paramValidation.userId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { meetingId, organizationId, userId } = req.params;
  const removed = await MeetingMinutesService.removeModerator(db, { meetingId, userId });
  if (!removed) {
    const moderators = await MeetingService.getMeetingModerators(db, { meetingId, organizationId });
    const existing = moderators.find(m => m.userId === userId);
    if (existing) {
      throw ApiError.validation('Creator and representative moderators cannot be removed', null, 'MODERATOR_NOT_REMOVABLE');
    }
    throw ApiError.notFound('Moderator', 'MODERATOR_NOT_FOUND');
  }
  broadcastMeetingUpdate(meetingId, 'moderator-removed', { userId });
  res.status(204).send();
}));

// ----- Votes -----
router.post('/votes', requireAuth, requireOrganizationMember, requireModerator, ...paramValidation.organizationId, ...paramValidation.meetingId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { meetingId } = req.params;
  const userId = getUserId(req);
  const meeting = await getMeetingForMinutes(req);
  const minutesDocumentId = meeting.minutes_document_id;
  if (!minutesDocumentId) throw ApiError.validation('Meeting has no minutes document', null, 'NO_MINUTES_DOCUMENT');
  const { title, options, anonymous, sourceEventId } = req.body || {};
  if (!title || typeof title !== 'string' || !title.trim()) {
    throw ApiError.validation('title is required', null, 'VALIDATION_ERROR');
  }
  if (!Array.isArray(options) || options.length < 2) {
    throw ApiError.validation('options array with at least two { label } is required', null, 'VALIDATION_ERROR');
  }
  const { vote, event: voteStartedEvent } = await MeetingMinutesService.createVote(db, {
    meetingId,
    minutesDocumentId,
    title: title.trim(),
    options: options.map(o => ({ label: o && o.label != null ? String(o.label) : '' })),
    anonymous: !!anonymous,
    sourceEventId: sourceEventId || null,
    createdByUserId: userId
  });
  const item = buildTimelineEventItem(voteStartedEvent, { vote });
  broadcastMeetingUpdate(meetingId, 'vote-started', { meetingVoteId: vote.id, title: vote.title, vote, item });
  broadcastMeetingUpdate(meetingId, 'minutes-event-added', { event: voteStartedEvent, item });
  await archiveWriteSafely(
    async () => {
      const events = await MeetingMinutesService.listEvents(db, { meetingId });
      const latest = events[events.length - 1];
      if (latest) {
        await MinutesArchiveService.archiveEvent(db, { meetingId, minutesDocumentId, event: latest, createdByUserId: userId });
      }
    },
    { meetingId, minutesDocumentId, route: 'POST /votes' }
  );
  res.status(201).json(vote);
}));

router.post('/brainstorm/close-and-start-vote', requireAuth, requireOrganizationMember, requireModerator, ...paramValidation.organizationId, ...paramValidation.meetingId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { meetingId } = req.params;
  const userId = getUserId(req);
  const meeting = await getMeetingForMinutes(req);
  const minutesDocumentId = meeting.minutes_document_id;
  if (!minutesDocumentId) throw ApiError.validation('Meeting has no minutes document', null, 'NO_MINUTES_DOCUMENT');
  const brainstormEventId = req.body?.brainstormEventId ?? req.body?.brainstorm_event_id;
  const title = req.body?.title;
  const options = req.body?.options;
  const anonymous = !!req.body?.anonymous;
  if (!brainstormEventId || typeof brainstormEventId !== 'string') {
    throw ApiError.validation('brainstormEventId is required', null, 'VALIDATION_ERROR');
  }
  if (!title || typeof title !== 'string' || !title.trim()) {
    throw ApiError.validation('title is required', null, 'VALIDATION_ERROR');
  }
  if (!Array.isArray(options) || options.length < 2) {
    throw ApiError.validation('options array with at least two { label } is required', null, 'VALIDATION_ERROR');
  }

  let result;
  try {
    result = await MeetingMinutesService.closeBrainstormAndStartVote(db, {
      meetingId,
      minutesDocumentId,
      brainstormEventId: brainstormEventId.trim(),
      title: title.trim(),
      options: options.map(o => ({ label: o && o.label != null ? String(o.label) : '' })),
      anonymous,
      createdByUserId: userId
    });
  } catch (err) {
    if (err?.code === 'BRAINSTORM_NOT_FOUND') {
      throw ApiError.notFound('Brainstorm', 'BRAINSTORM_NOT_FOUND');
    }
    if (err?.code === 'BRAINSTORM_CLOSED') {
      throw ApiError.validation('Brainstorm is already closed', null, 'BRAINSTORM_CLOSED');
    }
    throw err;
  }

  broadcastMeetingUpdate(meetingId, 'minutes-event-added', { event: result.endedEvent });
  const voteItem = buildTimelineEventItem(result.voteStartedEvent, { vote: result.vote });
  broadcastMeetingUpdate(meetingId, 'minutes-event-added', { event: result.voteStartedEvent, item: voteItem });
  broadcastMeetingUpdate(meetingId, 'vote-started', {
    meetingVoteId: result.vote.id,
    title: result.vote.title,
    vote: result.vote,
    item: voteItem
  });
  await archiveWriteSafely(
    async () => {
      await MinutesArchiveService.archiveEvent(db, { meetingId, minutesDocumentId, event: result.endedEvent, createdByUserId: userId });
      const events = await MeetingMinutesService.listEvents(db, { meetingId });
      const latest = events[events.length - 1];
      if (latest) {
        await MinutesArchiveService.archiveEvent(db, { meetingId, minutesDocumentId, event: latest, createdByUserId: userId });
      }
    },
    { meetingId, minutesDocumentId, route: 'POST /brainstorm/close-and-start-vote' }
  );
  res.status(201).json(result);
}));

router.get('/votes/:voteId', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, ...paramValidation.meetingId, ...paramValidation.voteId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { meetingId, voteId } = req.params;
  const vote = await MeetingMinutesService.getVote(db, { voteId, meetingId });
  if (!vote) throw ApiError.notFound('Vote', 'VOTE_NOT_FOUND');
  res.json(vote);
}));

router.post('/votes/:voteId/vote', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, ...paramValidation.meetingId, ...paramValidation.voteId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { meetingId, voteId } = req.params;
  const userId = getUserId(req);
  const optionId = req.body?.optionId ?? req.body?.option_id;
  if (!optionId || typeof optionId !== 'string') {
    throw ApiError.validation('optionId is required', null, 'VALIDATION_ERROR');
  }
  const vote = await MeetingMinutesService.getVote(db, { voteId, meetingId });
  if (!vote) throw ApiError.notFound('Vote', 'VOTE_NOT_FOUND');
  if (vote.status !== 'open') throw ApiError.validation('Vote is closed', null, 'VOTE_CLOSED');
  const validOptionIds = (vote.options || []).map(o => o.id);
  if (!validOptionIds.includes(optionId)) {
    throw ApiError.validation('Invalid optionId for this vote', null, 'VALIDATION_ERROR');
  }
  await MeetingMinutesService.upsertVoteResponse(db, { voteId, optionId, userId });
  const updatedVote = await MeetingMinutesService.getVote(db, { voteId, meetingId });
  if (updatedVote && updatedVote.responseCounts) {
    broadcastMeetingUpdate(meetingId, 'vote-updated', { meetingVoteId: voteId, responseCounts: updatedVote.responseCounts });
  }
  const receiptPayload = await TransactionManager.query(db,
    'SELECT receipt_id, created_at FROM meeting_vote_responses WHERE meeting_vote_id = ? AND user_id = ?',
    [voteId, userId]
  );
  res.status(200).json({
    success: true,
    receiptId: receiptPayload?.receipt_id,
    contestId: voteId,
    voteType: 'meeting_vote',
    voteRecordedAt: receiptPayload?.created_at
      ? new Date(receiptPayload.created_at).toISOString()
      : new Date().toISOString()
  });
}));

router.post('/votes/:voteId/close', requireAuth, requireOrganizationMember, requireModerator, ...paramValidation.organizationId, ...paramValidation.meetingId, ...paramValidation.voteId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { meetingId, voteId } = req.params;
  const userId = getUserId(req);
  const meeting = await getMeetingForMinutes(req);
  const minutesDocumentId = meeting.minutes_document_id;
  const closeResult = await MeetingMinutesService.closeVote(db, {
    voteId,
    meetingId,
    minutesDocumentId: minutesDocumentId || null,
    userId
  });
  if (!closeResult?.vote) throw ApiError.notFound('Vote', 'VOTE_NOT_FOUND');
  const { vote, event: voteEndedEvent } = closeResult;
  const item = voteEndedEvent ? buildTimelineEventItem(voteEndedEvent, { vote }) : null;
  broadcastMeetingUpdate(meetingId, 'vote-ended', {
    meetingVoteId: voteId,
    result: vote.responseCounts,
    vote,
    ...(item ? { item } : {})
  });
  if (voteEndedEvent && item) {
    broadcastMeetingUpdate(meetingId, 'minutes-event-added', { event: voteEndedEvent, item });
  }
  await archiveWriteSafely(
    async () => {
      if (minutesDocumentId) {
        const events = await MeetingMinutesService.listEvents(db, { meetingId });
        const latest = events[events.length - 1];
        if (latest) {
          await MinutesArchiveService.archiveEvent(db, { meetingId, minutesDocumentId, event: latest, createdByUserId: userId });
        }
      }
    },
    { meetingId, minutesDocumentId: minutesDocumentId || null, route: 'POST /votes/:voteId/close' }
  );
  res.status(200).json(vote);
}));

// ----- Brainstorm -----
router.post('/brainstorm/options', requireAuth, requireOrganizationMember, requireMinutesNotFinalized, ...paramValidation.organizationId, ...paramValidation.meetingId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { meetingId } = req.params;
  const userId = getUserId(req);
  const meeting = await getMeetingForMinutes(req);
  const { label } = req.body || {};
  const brainstormEventId = req.body?.brainstormEventId ?? req.body?.brainstorm_event_id;
  if (!brainstormEventId || typeof brainstormEventId !== 'string') {
    throw ApiError.validation('brainstormEventId is required', null, 'VALIDATION_ERROR');
  }
  if (label == null || typeof label !== 'string') {
    throw ApiError.validation('label is required', null, 'VALIDATION_ERROR');
  }
  if (!label.trim()) {
    throw ApiError.validation('label must not be empty', null, 'VALIDATION_ERROR');
  }
  if (label.trim().length > 280) {
    throw ApiError.validation('label must be 280 characters or less', null, 'VALIDATION_ERROR');
  }
  let option;
  try {
    option = await MeetingMinutesService.addBrainstormOption(db, {
      meetingId,
      brainstormEventId: String(brainstormEventId).trim(),
      label: label.trim(),
      createdByUserId: userId
    });
  } catch (err) {
    if (err?.code === 'BRAINSTORM_NOT_FOUND') {
      throw ApiError.notFound('Brainstorm', 'BRAINSTORM_NOT_FOUND');
    }
    if (err?.code === 'BRAINSTORM_CLOSED') {
      throw ApiError.validation('Brainstorm is already closed', null, 'BRAINSTORM_CLOSED');
    }
    if (err?.code === 'MINUTES_FINALIZED') {
      throw ApiError.validation('Minutes are finalized', null, 'MINUTES_FINALIZED');
    }
    throw err;
  }
  broadcastMeetingUpdate(meetingId, 'brainstorm-option-added', { brainstormEventId: brainstormEventId.trim(), option });
  await archiveWriteSafely(
    () => MinutesArchiveService.writeBlock(db, {
      meetingId,
      minutesDocumentId: meeting.minutes_document_id,
      blockType: 'brainstorm',
      status: 'open',
      orderIndex: Date.now(),
      occurredAt: new Date().toISOString(),
      sourceTimelineItemId: brainstormEventId.trim(),
      entityKey: `brainstorm:${brainstormEventId.trim()}`,
      payload: { operation: 'option_added', brainstormEventId: brainstormEventId.trim(), option }
    }),
    { meetingId, route: 'POST /brainstorm/options' }
  );
  res.status(201).json(option);
}));

// ----- Assignable users (for to-do owner dropdown) -----
// The "Select owner" list is organization members with status 'active' or 'legacy' (same org as the meeting).
// We use req.params.organizationId (not the meeting row) so the list is correct regardless of DB driver column naming.
// There is no meeting-specific attendee tracking. To record who was present, use the "Attendees" section in minutes.
router.get('/assignable-users', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, ...paramValidation.meetingId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { organizationId, meetingId } = req.params;
  const meeting = await TransactionManager.query(db,
    'SELECT 1 FROM meetings WHERE id = ? AND organization_id = ?',
    [meetingId, organizationId]
  );
  if (!meeting) throw ApiError.notFound('Meeting', 'MEETING_NOT_FOUND');
  const rows = await TransactionManager.queryAll(db,
    `SELECT u.id AS user_id, u.name AS user_name
     FROM organization_members om
     JOIN users u ON om.user_id = u.id
     WHERE om.organization_id = ? AND om.status IN ('active', 'legacy')
       AND om.user_id NOT IN (SELECT id FROM organizations)
     ORDER BY u.name ASC`,
    [organizationId]
  );
  const users = rows.map(r => ({ userId: r.user_id, userName: r.user_name || null }));
  res.json({ users });
}));

// ----- To-dos -----
router.get('/todos', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, ...paramValidation.meetingId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { meetingId } = req.params;
  await getMeetingForMinutes(req);
  const todos = await MeetingMinutesService.listTodos(db, { meetingId });
  res.json({ todos });
}));

router.post('/todos', requireAuth, requireOrganizationMember, requireModerator, ...paramValidation.organizationId, ...paramValidation.meetingId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { meetingId } = req.params;
  const userId = getUserId(req);
  const meeting = await getMeetingForMinutes(req);
  const title = req.body?.title;
  const description = req.body?.description;
  const dueDate = req.body?.due_date ?? req.body?.dueDate;
  const responsibleUserId = req.body?.responsible_user_id ?? req.body?.responsibleUserId;
  const agendaItemId = req.body?.agenda_item_id ?? req.body?.agendaItemId ?? null;
  const orderIndex = req.body?.order_index ?? req.body?.orderIndex;
  if (title == null || typeof title !== 'string' || !String(title).trim()) {
    throw ApiError.validation('title is required', null, 'VALIDATION_ERROR');
  }
  if (dueDate == null || (typeof dueDate !== 'string' && !(dueDate instanceof Date))) {
    throw ApiError.validation('due_date is required', null, 'VALIDATION_ERROR');
  }
  if (!responsibleUserId || typeof responsibleUserId !== 'string' || !responsibleUserId.trim()) {
    throw ApiError.validation('responsible_user_id is required', null, 'VALIDATION_ERROR');
  }
  const todo = await MeetingMinutesService.createTodo(db, {
    meetingId,
    title: String(title).trim(),
    description: description != null ? String(description).trim() : null,
    dueDate: typeof dueDate === 'string' ? dueDate : new Date(dueDate).toISOString().slice(0, 10),
    responsibleUserId: responsibleUserId.trim(),
    agendaItemId: (agendaItemId != null && String(agendaItemId).trim()) ? String(agendaItemId).trim() : (meeting.current_agenda_item_id || null),
    orderIndex: orderIndex != null ? Number(orderIndex) : undefined,
    createdByUserId: userId
  });
  if (!todo) {
    throw ApiError.validation('Invalid meeting, responsible user (must be org member), or agenda item', null, 'VALIDATION_ERROR');
  }
  broadcastMeetingUpdate(meetingId, 'todo-added', { todo });
  await archiveWriteSafely(
    () => MinutesArchiveService.archiveTodo(db, {
      meetingId,
      minutesDocumentId: meeting.minutes_document_id,
      todo,
      createdByUserId: userId
    }),
    { meetingId, minutesDocumentId: meeting.minutes_document_id, route: 'POST /todos' }
  );
  res.status(201).json(todo);
}));

router.patch('/todos/:todoId', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, ...paramValidation.meetingId, ...paramValidation.todoId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { meetingId, todoId } = req.params;
  const userId = getUserId(req);
  const existing = await MeetingMinutesService.getTodo(db, { todoId, meetingId });
  if (!existing) throw ApiError.notFound('To-do', 'TODO_NOT_FOUND');
  const meetingRow = await TransactionManager.query(db,
    'SELECT minutes_finalized_at FROM meetings WHERE id = ? AND organization_id = ?',
    [meetingId, req.params.organizationId]
  );
  const finalized = !!(meetingRow && meetingRow.minutes_finalized_at);
  const isModerator = await MeetingService.canModerateMeeting(db, meetingId, req.params.organizationId, userId);
  const isOwner = existing.responsibleUserId === userId;
  if (!finalized && !isModerator) {
    throw ApiError.forbidden('Only moderators can perform this action', 'NOT_MODERATOR');
  }
  if (finalized && !isModerator && !isOwner) {
    throw ApiError.forbidden('Only the responsible user or a moderator can update to-do status after minutes are finalized', 'NOT_ALLOWED');
  }
  const title = req.body?.title;
  const description = req.body?.description;
  const dueDate = req.body?.due_date ?? req.body?.dueDate;
  const status = req.body?.status;
  const responsibleUserId = req.body?.responsible_user_id ?? req.body?.responsibleUserId;
  const todo = await MeetingMinutesService.updateTodo(db, {
    meetingId,
    todoId,
    title: title !== undefined ? String(title).trim() : undefined,
    description: description !== undefined ? (description != null ? String(description).trim() : null) : undefined,
    dueDate: dueDate !== undefined ? (typeof dueDate === 'string' ? dueDate : new Date(dueDate).toISOString().slice(0, 10)) : undefined,
    status: status !== undefined ? status : undefined,
    responsibleUserId: responsibleUserId != null ? String(responsibleUserId).trim() : undefined,
    completedByUserId: status === 'done' ? userId : undefined
  });
  if (!todo) {
    throw ApiError.validation('Update not allowed or invalid (e.g. only status can change after finalization)', null, 'VALIDATION_ERROR');
  }
  broadcastMeetingUpdate(meetingId, 'todo-updated', { todo });
  const meeting = await getMeetingForMinutes(req);
  await archiveWriteSafely(
    () => MinutesArchiveService.archiveTodo(db, {
      meetingId,
      minutesDocumentId: meeting.minutes_document_id,
      todo,
      createdByUserId: userId
    }),
    { meetingId, minutesDocumentId: meeting.minutes_document_id, route: 'PATCH /todos/:todoId' }
  );
  res.json(todo);
}));

router.delete('/todos/:todoId', requireAuth, requireOrganizationMember, requireModerator, requireMinutesNotFinalized, ...paramValidation.organizationId, ...paramValidation.meetingId, ...paramValidation.todoId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { meetingId, todoId } = req.params;
  const meeting = await getMeetingForMinutes(req);
  const deleted = await MeetingMinutesService.deleteTodo(db, { meetingId, todoId });
  if (!deleted) throw ApiError.notFound('To-do not found or minutes already finalized', 'TODO_NOT_FOUND_OR_FINALIZED');
  broadcastMeetingUpdate(meetingId, 'todo-removed', { todoId });
  await archiveWriteSafely(
    () => MinutesArchiveService.writeBlock(db, {
      meetingId,
      minutesDocumentId: meeting.minutes_document_id,
      blockType: 'todo',
      status: 'deleted',
      orderIndex: Date.now(),
      occurredAt: new Date().toISOString(),
      sourceTimelineItemId: todoId,
      entityKey: `todo:${todoId}`,
      payload: { id: todoId, operation: 'delete' }
    }),
    { meetingId, minutesDocumentId: meeting.minutes_document_id, route: 'DELETE /todos/:todoId' }
  );
  res.status(204).send();
}));

// ----- Finalize / Unfinalize -----
router.post('/minutes/finalize', requireAuth, requireOrganizationMember, requireModerator, ...paramValidation.organizationId, ...paramValidation.meetingId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { meetingId, organizationId: orgId } = req.params;
  const userId = getUserId(req);
  const result = await MeetingMinutesService.finalizeMinutes(db, meetingId);
  await archiveWriteSafely(
    async () => {
      if (result.minutesDocumentId) {
        await MinutesArchiveService.createArchiveVersion(db, {
          meetingId,
          minutesDocumentId: result.minutesDocumentId,
          frozenByUserId: userId
        });
      }
    },
    { meetingId, minutesDocumentId: result.minutesDocumentId || null, route: 'POST /minutes/finalize' }
  );
  broadcastMeetingUpdate(meetingId, 'minutes-finalized', { finalizedAt: result.finalizedAt });
  if (result.minutesDocumentId && result.documentStatusChanged) {
    broadcastDocumentUpdate(result.minutesDocumentId, 'document-status-changed', {
      oldStatus: 'draft',
      newStatus: 'agreed',
      reason: 'minutes_finalized',
      adoptedAt: result.finalizedAt
    });
    const organizationId = result.organizationId || orgId;
    if (organizationId) {
      broadcastOrganizationUpdate(organizationId, 'document-status-changed', {
        documentId: result.minutesDocumentId,
        oldStatus: 'draft',
        newStatus: 'agreed',
        reason: 'minutes_finalized'
      });
      if (userId) {
        await logOrganizationAudit(db, organizationId, 'document_status_agreed', userId, {
          documentId: result.minutesDocumentId,
          documentTitle: 'Meeting minutes',
          reason: 'minutes_finalized'
        }, null);
      }
    }
  }
  res.status(200).json({ finalizedAt: result.finalizedAt });
}));

router.post('/minutes/unfinalize', requireAuth, requireOrganizationMember, ...paramValidation.organizationId, ...paramValidation.meetingId, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { meetingId, organizationId: orgId } = req.params;
  const userId = getUserId(req);
  const canModerate = await MeetingService.canModerateMeeting(db, meetingId, req.params.organizationId, userId);
  if (!canModerate) {
    throw ApiError.forbidden('Only moderators can unfinalize minutes', 'NOT_ALLOWED');
  }
  const result = await MeetingMinutesService.unfinalizeMinutes(db, meetingId);
  if (result.minutesDocumentId && result.documentStatusChanged) {
    broadcastDocumentUpdate(result.minutesDocumentId, 'document-status-changed', {
      oldStatus: 'agreed',
      newStatus: 'draft',
      reason: 'minutes_unfinalized'
    });
    if (result.organizationId || orgId) {
      broadcastOrganizationUpdate(result.organizationId || orgId, 'document-status-changed', {
        documentId: result.minutesDocumentId,
        oldStatus: 'agreed',
        newStatus: 'draft',
        reason: 'minutes_unfinalized'
      });
      if (userId) {
        await logOrganizationAudit(db, result.organizationId || orgId, 'document_status_draft', userId, {
          documentId: result.minutesDocumentId,
          documentTitle: 'Meeting minutes',
          reason: 'minutes_unfinalized'
        }, null);
      }
    }
  }
  broadcastMeetingUpdate(meetingId, 'minutes-unfinalized', {});
  res.status(200).json({ success: true });
}));

module.exports = router;
