/**
 * MeetingMinutesService — DB logic for meeting minutes, moderators, votes, brainstorm.
 * Used by meeting-minutes routes. Uses TransactionManager and uuid.
 */

const { v4: uuidv4 } = require('uuid');
const TransactionManager = require('../database/services/TransactionManager');
const SchedulingService = require('./SchedulingService');
const MinutesArchiveService = require('./MinutesArchiveService');
const config = require('../config');
const { logger } = require('../middleware/logger');
const voteVerificationLog = require('../utils/voteVerificationLog');
const { generateReceiptId, computeVoteHash } = require('../utils/voteReceipt');

function rowToEvent(row) {
  if (!row) return null;
  let payload = null;
  if (row.payload != null) {
    try {
      payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
    } catch (err) {
      logger.debug('Invalid minutes event payload JSON', { eventId: row?.id, error: err.message });
    }
  }
  return {
    id: row.id,
    meetingId: row.meeting_id,
    minutesDocumentId: row.minutes_document_id,
    eventType: row.event_type,
    payload,
    orderIndex: row.order_index,
    createdAt: row.created_at,
    createdByUserId: row.created_by_user_id || null
  };
}

function toSortableTime(value) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function rowToDecision(row) {
  if (!row) return null;
  return {
    id: row.id,
    meetingId: row.meeting_id,
    minutesDocumentId: row.minutes_document_id || null,
    agendaItemId: row.agenda_item_id || null,
    meetingVoteId: row.meeting_vote_id || null,
    organizationVoteId: row.organization_vote_id || null,
    sourceEventId: row.source_event_id || null,
    title: row.title || null,
    text: row.text || '',
    status: row.status || 'recorded',
    orderIndex: row.order_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByUserId: row.created_by_user_id || null
  };
}

async function assertDecisionInOrganization(db, decisionId, organizationId) {
  const row = await TransactionManager.query(db,
    `SELECT md.id, md.organization_vote_id
       FROM meeting_decisions md
       INNER JOIN meetings m ON m.id = md.meeting_id
      WHERE md.id = ? AND m.organization_id = ?`,
    [decisionId, organizationId]
  );
  if (!row) {
    const { ApiError } = require('../middleware/errorHandler');
    throw ApiError.notFound('Meeting decision not found in this organization');
  }
  return row;
}

async function linkOrganizationVote(db, { decisionId, organizationVoteId, organizationId }) {
  const decision = await assertDecisionInOrganization(db, decisionId, organizationId);
  if (decision.organization_vote_id && decision.organization_vote_id !== organizationVoteId) {
    const { ApiError } = require('../middleware/errorHandler');
    throw ApiError.validation('Meeting decision is already linked to another organization vote', null, 'DECISION_ALREADY_LINKED');
  }
  await TransactionManager.execute(db,
    `UPDATE meeting_decisions SET organization_vote_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [organizationVoteId, decisionId]
  );
  return rowToDecision(await TransactionManager.query(db, 'SELECT * FROM meeting_decisions WHERE id = ?', [decisionId]));
}

function parseJsonObject(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }
  return value && typeof value === 'object' ? value : null;
}

async function isBrainstormClosed(db, { meetingId, brainstormEventId }) {
  const endedRows = await TransactionManager.queryAll(db,
    `SELECT payload
       FROM meeting_minutes_events
      WHERE meeting_id = ? AND event_type = 'brainstorm_ended'`,
    [meetingId]
  );
  return endedRows.some((row) => {
    const payload = parseJsonObject(row?.payload);
    if (!payload) return false;
    return payload.sourceEventId === brainstormEventId || payload.source_event_id === brainstormEventId;
  });
}

/**
 * List meeting_minutes_events for a meeting, ordered by order_index, created_at.
 */
async function listEvents(db, { meetingId, limit, offset }) {
  let sql = `SELECT * FROM meeting_minutes_events WHERE meeting_id = ? ORDER BY order_index ASC, created_at ASC`;
  const params = [meetingId];
  if (limit != null && limit > 0) {
    sql += ' LIMIT ?';
    params.push(limit);
  }
  if (offset != null && offset > 0) {
    sql += ' OFFSET ?';
    params.push(offset);
  }
  const rows = await TransactionManager.queryAll(db, sql, params);
  return rows.map(rowToEvent);
}

/**
 * Insert a minutes event. Returns created event.
 */
async function createEvent(db, { meetingId, minutesDocumentId, eventType, payload, orderIndex, createdByUserId }) {
  const id = uuidv4();
  const now = new Date().toISOString();
  const order = orderIndex != null ? Number(orderIndex) : Date.now();
  const payloadStr = payload != null ? (typeof payload === 'string' ? payload : JSON.stringify(payload)) : null;
  await TransactionManager.execute(db,
    `INSERT INTO meeting_minutes_events (id, meeting_id, minutes_document_id, event_type, payload, order_index, created_at, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, meetingId, minutesDocumentId, eventType || '', payloadStr, order, now, createdByUserId || null]
  );
  const row = await TransactionManager.query(db, 'SELECT * FROM meeting_minutes_events WHERE id = ?', [id]);
  return rowToEvent(row);
}

async function createDecision(db, {
  meetingId,
  minutesDocumentId,
  agendaItemId,
  meetingVoteId,
  sourceEventId,
  title,
  text,
  status,
  createdByUserId,
  orderIndex
}) {
  const id = uuidv4();
  const now = new Date().toISOString();
  const resolvedStatus = (status && String(status).trim()) || 'recorded';
  const resolvedOrder = orderIndex != null ? Number(orderIndex) : Date.now();
  await TransactionManager.execute(db,
    `INSERT INTO meeting_decisions
       (id, meeting_id, minutes_document_id, agenda_item_id, meeting_vote_id, source_event_id, title, text, status, order_index, created_by_user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      meetingId,
      minutesDocumentId || null,
      agendaItemId || null,
      meetingVoteId || null,
      sourceEventId || null,
      title != null ? String(title).trim() : null,
      text != null ? String(text).trim() : '',
      resolvedStatus,
      resolvedOrder,
      createdByUserId || null,
      now,
      now
    ]
  );
  const row = await TransactionManager.query(db, 'SELECT * FROM meeting_decisions WHERE id = ?', [id]);
  return rowToDecision(row);
}

async function listDecisionsByMeeting(db, { meetingId, limit, offset }) {
  let sql = `SELECT * FROM meeting_decisions WHERE meeting_id = ? ORDER BY order_index ASC, created_at ASC`;
  const params = [meetingId];
  if (limit != null && limit > 0) {
    sql += ' LIMIT ?';
    params.push(limit);
  }
  if (offset != null && offset > 0) {
    sql += ' OFFSET ?';
    params.push(offset);
  }
  const rows = await TransactionManager.queryAll(db, sql, params);
  return rows.map(rowToDecision);
}

// ----- To-dos -----

function rowToTodo(row) {
  if (!row) return null;
  return {
    id: row.id,
    meetingId: row.meeting_id,
    title: row.title || '',
    description: row.description || null,
    dueDate: row.due_date,
    status: row.status || 'pending',
    responsibleUserId: row.responsible_user_id,
    responsibleUserName: row.responsible_user_name ?? null,
    agendaItemId: row.agenda_item_id || null,
    orderIndex: row.order_index,
    createdAt: row.created_at,
    createdByUserId: row.created_by_user_id || null,
    completedAt: row.completed_at || null,
    completedByUserId: row.completed_by_user_id || null
  };
}

/**
 * List to-dos for a meeting, ordered by order_index, created_at. Includes responsible user name.
 */
async function listTodos(db, { meetingId }) {
  const rows = await TransactionManager.queryAll(db,
    `SELECT t.*, u.name AS responsible_user_name
     FROM meeting_todos t
     LEFT JOIN users u ON t.responsible_user_id = u.id
     WHERE t.meeting_id = ?
     ORDER BY t.order_index ASC, t.created_at ASC`,
    [meetingId]
  );
  return rows.map(rowToTodo);
}

/**
 * Get a single to-do by id and meeting. Returns null if not found.
 */
async function getTodo(db, { todoId, meetingId }) {
  const row = await TransactionManager.query(db,
    `SELECT t.*, u.name AS responsible_user_name
     FROM meeting_todos t
     LEFT JOIN users u ON t.responsible_user_id = u.id
     WHERE t.id = ? AND t.meeting_id = ?`,
    [todoId, meetingId]
  );
  return row ? rowToTodo(row) : null;
}

/**
 * Check if user is a member of the meeting's organization (for assignable owner).
 */
async function isUserInMeetingOrganization(db, { meetingId, userId }) {
  const meeting = await TransactionManager.query(db,
    'SELECT organization_id FROM meetings WHERE id = ?',
    [meetingId]
  );
  if (!meeting || !meeting.organization_id) return false;
  const member = await TransactionManager.query(db,
    'SELECT 1 FROM organization_members WHERE organization_id = ? AND user_id = ? AND status = ?',
    [meeting.organization_id, userId, 'active']
  );
  return !!member;
}

/**
 * Create a to-do. Validates meeting exists, responsible_user_id in org, agenda_item_id belongs to meeting.
 * Returns created to-do with responsibleUserName.
 */
async function createTodo(db, { meetingId, title, description, dueDate, responsibleUserId, agendaItemId, orderIndex, createdByUserId }) {
  const meeting = await TransactionManager.query(db,
    'SELECT id, organization_id FROM meetings WHERE id = ?',
    [meetingId]
  );
  if (!meeting) return null;
  const inOrg = await isUserInMeetingOrganization(db, { meetingId, userId: responsibleUserId });
  if (!inOrg) return null;
  if (agendaItemId != null && agendaItemId !== '') {
    const agendaItem = await getAgendaItem(db, { meetingId, itemId: agendaItemId });
    if (!agendaItem) return null;
  }
  const id = uuidv4();
  const now = new Date().toISOString();
  const order = orderIndex != null ? Number(orderIndex) : Date.now();
  const finalAgendaItemId = (agendaItemId != null && agendaItemId !== '') ? agendaItemId : null;
  await TransactionManager.execute(db,
    `INSERT INTO meeting_todos (id, meeting_id, title, description, due_date, status, responsible_user_id, agenda_item_id, order_index, created_at, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
    [id, meetingId, (title && String(title).trim()) || '', description != null ? String(description).trim() : null, dueDate, responsibleUserId, finalAgendaItemId, order, now, createdByUserId || null]
  );
  return getTodo(db, { todoId: id, meetingId });
}

/**
 * Update a to-do. When minutes are finalized, only status (and completed_at/completed_by_user_id when marking done) is allowed.
 * Returns updated to-do or null.
 */
async function updateTodo(db, { meetingId, todoId, title, description, dueDate, status, responsibleUserId, completedByUserId }) {
  const existing = await getTodo(db, { todoId, meetingId });
  if (!existing) return null;
  const meeting = await TransactionManager.query(db,
    'SELECT minutes_finalized_at FROM meetings WHERE id = ?',
    [meetingId]
  );
  const finalized = !!(meeting && meeting.minutes_finalized_at);
  if (finalized) {
    if (status === undefined || status === null) return null;
    const validStatuses = ['pending', 'in_progress', 'done', 'cancelled'];
    if (!validStatuses.includes(String(status))) return null;
    const now = new Date().toISOString();
    if (status === 'done') {
      await TransactionManager.execute(db,
        'UPDATE meeting_todos SET status = ?, completed_at = ?, completed_by_user_id = ? WHERE id = ? AND meeting_id = ?',
        [status, now, completedByUserId || null, todoId, meetingId]
      );
    } else {
      await TransactionManager.execute(db,
        'UPDATE meeting_todos SET status = ?, completed_at = NULL, completed_by_user_id = NULL WHERE id = ? AND meeting_id = ?',
        [status, todoId, meetingId]
      );
    }
    return getTodo(db, { todoId, meetingId });
  }
  const updates = [];
  const params = [];
  if (title !== undefined) {
    updates.push('title = ?');
    params.push((title && String(title).trim()) || '');
  }
  if (description !== undefined) {
    updates.push('description = ?');
    params.push(description != null ? String(description).trim() : null);
  }
  if (dueDate !== undefined) {
    updates.push('due_date = ?');
    params.push(dueDate);
  }
  if (status !== undefined) {
    updates.push('status = ?');
    params.push(status);
    if (status === 'done') {
      updates.push('completed_at = ?');
      updates.push('completed_by_user_id = ?');
      params.push(new Date().toISOString(), completedByUserId ?? null);
    } else {
      updates.push('completed_at = NULL', 'completed_by_user_id = NULL');
    }
  }
  if (responsibleUserId !== undefined) {
    const inOrg = await isUserInMeetingOrganization(db, { meetingId, userId: responsibleUserId });
    if (!inOrg) return null;
    updates.push('responsible_user_id = ?');
    params.push(responsibleUserId);
  }
  if (updates.length === 0) return existing;
  params.push(todoId, meetingId);
  await TransactionManager.execute(db,
    `UPDATE meeting_todos SET ${updates.join(', ')} WHERE id = ? AND meeting_id = ?`,
    params
  );
  return getTodo(db, { todoId, meetingId });
}

/**
 * Delete a to-do. Allowed only when minutes are not finalized. Returns true if deleted.
 */
async function deleteTodo(db, { meetingId, todoId }) {
  const existing = await getTodo(db, { todoId, meetingId });
  if (!existing) return false;
  const meeting = await TransactionManager.query(db,
    'SELECT minutes_finalized_at FROM meetings WHERE id = ?',
    [meetingId]
  );
  if (meeting && meeting.minutes_finalized_at) return false;
  await TransactionManager.execute(db,
    'DELETE FROM meeting_todos WHERE id = ? AND meeting_id = ?',
    [todoId, meetingId]
  );
  return true;
}

/**
 * Get merged timeline: events + paragraphs + todos from minutes document, sorted by order_index/created_at.
 * Returns { items: [{ type: 'event'|'paragraph'|'todo', id, occurredAt, ... }] }
 * When organizationId is provided, enriches date_decided events that have payload.schedulingPollId with schedulingPoll summary.
 */
async function getTimeline(db, { organizationId, meetingId, minutesDocumentId, limit, offset }) {
  if (!minutesDocumentId) {
    return { items: [] };
  }
  if (config.MINUTES_ARCHIVE_ENABLED) {
    try {
      const hasArchive = await MinutesArchiveService.hasArchiveBlocks(db, { meetingId, minutesDocumentId });
      if (hasArchive) {
        const archived = await MinutesArchiveService.listLatestTimelineItems(db, { meetingId, minutesDocumentId });
        if (config.MINUTES_ARCHIVE_PARITY_CHECK) {
          try {
            const [eventCountRow, paraCountRow, todoCountRow, decisionCountRow] = await Promise.all([
              TransactionManager.query(db, 'SELECT COUNT(*) AS count FROM meeting_minutes_events WHERE meeting_id = ?', [meetingId]),
              TransactionManager.query(db, 'SELECT COUNT(*) AS count FROM paragraphs WHERE document_id = ?', [minutesDocumentId]),
              TransactionManager.query(db, 'SELECT COUNT(*) AS count FROM meeting_todos WHERE meeting_id = ?', [meetingId]),
              TransactionManager.query(db, 'SELECT COUNT(*) AS count FROM meeting_decisions WHERE meeting_id = ?', [meetingId])
            ]);
            const legacyTotal = Number(eventCountRow?.count || 0) + Number(paraCountRow?.count || 0) + Number(todoCountRow?.count || 0) + Number(decisionCountRow?.count || 0);
            const archiveTotal = archived.items.length;
            if (archiveTotal === 0 || Math.abs(legacyTotal - archiveTotal) > 2) {
              logger.warn('Minutes archive parity mismatch detected', {
                meetingId,
                minutesDocumentId,
                legacyTotal,
                archiveTotal
              });
            }
          } catch (parityErr) {
            logger.debug('Minutes archive parity check failed', { error: parityErr.message, meetingId, minutesDocumentId });
          }
        }
        if (limit != null || offset != null) {
          const start = Number(offset) || 0;
          const end = start + (Number(limit) || archived.items.length);
          return { items: archived.items.slice(start, end) };
        }
        return archived;
      }
    } catch (err) {
      logger.warn('Minutes archive read failed, falling back to legacy timeline', {
        meetingId,
        minutesDocumentId,
        error: err.message
      });
    }
  }
  const events = await TransactionManager.queryAll(db,
    `SELECT id, event_type, payload, order_index, created_at FROM meeting_minutes_events
     WHERE meeting_id = ? ORDER BY order_index ASC, created_at ASC`,
    [meetingId]
  );
  const paragraphs = await TransactionManager.queryAll(db,
    `SELECT id, order_index, created_at, title, text AS paragraph_text, heading_level FROM paragraphs
     WHERE document_id = ? ORDER BY order_index ASC, created_at ASC`,
    [minutesDocumentId]
  );
  const todoRows = await TransactionManager.queryAll(db,
    `SELECT t.id, t.order_index, t.created_at, t.title, t.description, t.due_date, t.status, t.responsible_user_id, t.agenda_item_id, u.name AS responsible_user_name
     FROM meeting_todos t
     LEFT JOIN users u ON t.responsible_user_id = u.id
     WHERE t.meeting_id = ? ORDER BY t.order_index ASC, t.created_at ASC`,
    [meetingId]
  );
  const decisionRows = await TransactionManager.queryAll(db,
    `SELECT id, meeting_id, minutes_document_id, agenda_item_id, meeting_vote_id, source_event_id, title, text, status, order_index, created_at, updated_at, created_by_user_id
     FROM meeting_decisions
     WHERE meeting_id = ? ORDER BY order_index ASC, created_at ASC`,
    [meetingId]
  );
  const eventItems = events.map(row => ({
    type: 'event',
    id: row.id,
    occurredAt: row.created_at,
    orderIndex: row.order_index,
    eventType: row.event_type,
    arcId: null,
    payload: (() => {
      try {
        return row.payload ? (typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload) : null;
      } catch (_) { return null; }
    })()
  }));
  const paragraphItems = paragraphs.map(row => ({
    type: 'paragraph',
    id: row.id,
    occurredAt: row.created_at,
    orderIndex: row.order_index,
    arcId: null,
    title: row.title,
    text: row.paragraph_text ?? row.text ?? '',
    headingLevel: row.heading_level
  }));
  const todoItems = todoRows.map(row => ({
    type: 'todo',
    id: row.id,
    occurredAt: row.created_at,
    orderIndex: row.order_index,
    arcId: null,
    title: row.title,
    description: row.description,
    dueDate: row.due_date,
    status: row.status || 'pending',
    responsibleUserId: row.responsible_user_id,
    responsibleUserName: row.responsible_user_name ?? null,
    agendaItemId: row.agenda_item_id || null
  }));
  const decisionItems = decisionRows.map(row => ({
    type: 'decision',
    id: row.id,
    occurredAt: row.created_at,
    orderIndex: row.order_index,
    arcId: null,
    title: row.title || null,
    text: row.text || '',
    status: row.status || 'recorded',
    agendaItemId: row.agenda_item_id || null,
    meetingVoteId: row.meeting_vote_id || null,
    organizationVoteId: row.organization_vote_id || null,
    sourceEventId: row.source_event_id || null,
    createdByUserId: row.created_by_user_id || null
  }));
  // Events and todos use order_index = Date.now() (~1e12); paragraphs use 0, 10, 20, ... When comparing across
  // these ranges, sort by occurredAt. When both are in the same range, sort by orderIndex to preserve order.
  const ORDER_INDEX_LARGE = 1e10;
  const items = [...eventItems, ...paragraphItems, ...todoItems, ...decisionItems].sort((a, b) => {
    const oa = Number(a.orderIndex);
    const ob = Number(b.orderIndex);
    const aSmall = oa < ORDER_INDEX_LARGE;
    const bSmall = ob < ORDER_INDEX_LARGE;
    if (aSmall !== bSmall) {
      const byTime = toSortableTime(a.occurredAt) - toSortableTime(b.occurredAt);
      if (byTime !== 0) return byTime;
      return oa - ob || (a.id || '').localeCompare(b.id || '');
    }
    if (oa !== ob) return oa - ob;
    const byTime = toSortableTime(a.occurredAt) - toSortableTime(b.occurredAt);
    if (byTime !== 0) return byTime;
    return (a.id || '').localeCompare(b.id || '');
  });

  /**
   * Chronological agenda context from timeline `topic_set` only (not meeting.current_agenda_item_id).
   * Applies to all minutes-shaped timeline rows without an explicit agenda ref:
   * - Paragraphs have no agenda column in DB.
   * - Todos may omit agenda_item_id; infer from surrounding topic_set for consistent canvas grouping.
   * - Events (votes, brainstorms, date_decided, document_created, ...) may omit agenda in payload; merge so
   *   client adapters see the same topic as explicit agenda_item_id todos.
   */
  const payloadHasAgendaItemId = (payload) => {
    if (!payload || typeof payload !== 'object') return false;
    const aid = payload.agendaItemId ?? payload.agenda_item_id;
    return typeof aid === 'string' && aid.trim().length > 0;
  };
  let agendaTopicCursor = null;
  for (const item of items) {
    if (item.type === 'event' && item.eventType === 'topic_set') {
      const p = item.payload && typeof item.payload === 'object' ? item.payload : {};
      const aid = p.agendaItemId ?? p.agenda_item_id;
      if (typeof aid === 'string' && aid.trim()) agendaTopicCursor = aid.trim();
      continue;
    }
    if (agendaTopicCursor == null) continue;

    if (item.type === 'paragraph' && (item.agendaItemId == null || item.agendaItemId === '')) {
      item.agendaItemId = agendaTopicCursor;
      continue;
    }
    if (item.type === 'todo' && (item.agendaItemId == null || item.agendaItemId === '')) {
      item.agendaItemId = agendaTopicCursor;
      continue;
    }
    if (item.type === 'decision' && (item.agendaItemId == null || item.agendaItemId === '')) {
      item.agendaItemId = agendaTopicCursor;
      continue;
    }
    if (item.type === 'event' && item.eventType && !payloadHasAgendaItemId(item.payload)) {
      const base = item.payload && typeof item.payload === 'object' && item.payload !== null ? item.payload : {};
      item.payload = { ...base, agendaItemId: agendaTopicCursor };
    }
  }

  for (const item of items) {
    if (item.type !== 'event' || !item.eventType) continue;
    if (item.eventType === 'vote_started' || item.eventType === 'vote_ended') {
      const payload = item.payload || {};
      const meetingVoteId = payload.meetingVoteId || payload.meeting_vote_id;
      if (meetingVoteId) {
        const vote = await getVote(db, { voteId: meetingVoteId, meetingId });
        if (vote) item.vote = vote;
      }
    }
    if (item.eventType === 'brainstorm_started' || item.eventType === 'brainstorm_ended') {
      const payload = item.payload || {};
      const optionsEventId = (item.eventType === 'brainstorm_ended' && (payload.sourceEventId || payload.source_event_id)) || item.id;
      const optionRows = await TransactionManager.queryAll(db,
        `SELECT id, label, sort_order, created_at FROM meeting_brainstorm_options
         WHERE meeting_id = ? AND brainstorm_event_id = ? ORDER BY sort_order ASC, created_at ASC`,
        [meetingId, optionsEventId]
      );
      item.options = optionRows.map(r => ({
        id: r.id,
        label: r.label || '',
        sortOrder: r.sort_order,
        createdAt: r.created_at
      }));
    }
    if (organizationId && item.eventType === 'date_decided') {
      const payload = item.payload || {};
      const pollId = payload.schedulingPollId || payload.scheduling_poll_id;
      if (pollId) {
        try {
          const result = await SchedulingService.getPoll(db, { pollId, organizationId });
          if (result && result.poll) {
            item.schedulingPoll = {
              id: result.poll.id,
              title: result.poll.title,
              status: result.poll.status,
              chosenSlot: result.chosenSlot || undefined
            };
          }
        } catch (_) {
          // Poll missing or access failed; leave schedulingPoll undefined for fallback display
        }
      }
    }
  }

  // --- Arc ID computation: stamp arcId from existing FK chain (post-enrichment) ---
  const arcIdByEventId = new Map();
  for (const item of items) {
    if (item.type !== 'event') continue;
    if (item.eventType === 'brainstorm_started') {
      const src = item.payload?.sourceEventId || item.payload?.source_event_id;
      if (!src) {
        arcIdByEventId.set(item.id, item.id);
        item.arcId = item.id;
      }
    }
  }
  for (const item of items) {
    if (item.type !== 'event') continue;
    if (item.eventType === 'brainstorm_started' || item.eventType === 'brainstorm_ended') {
      const src = item.payload?.sourceEventId || item.payload?.source_event_id;
      if (src) {
        const arcId = arcIdByEventId.get(src) ?? src;
        item.arcId = arcId;
        arcIdByEventId.set(item.id, arcId);
      }
    }
  }
  const arcIdByVoteId = new Map();
  for (const item of items) {
    if (item.type !== 'event') continue;
    if (item.eventType === 'vote_started' || item.eventType === 'vote_ended') {
      const vote = item.vote;
      const src = vote?.sourceEventId || vote?.source_event_id;
      if (src) {
        const arcId = arcIdByEventId.get(src) ?? src;
        item.arcId = arcId;
        arcIdByEventId.set(item.id, arcId);
        if (vote?.id) arcIdByVoteId.set(vote.id, arcId);
      }
    }
  }
  for (const item of items) {
    if (item.type !== 'decision') continue;
    const voteId = item.meetingVoteId;
    if (voteId && arcIdByVoteId.has(voteId)) {
      item.arcId = arcIdByVoteId.get(voteId);
    }
  }

  const sliced = (limit != null || offset != null)
    ? items.slice(Number(offset) || 0, (Number(offset) || 0) + (Number(limit) || items.length))
    : items;
  return { items: sliced };
}

/**
 * Get moderators for a meeting: creator + org reps + meeting_moderators (with user names).
 * Returns [{ userId, userName, source }].
 */
async function getModerators(db, { meetingId, organizationId }) {
  const meeting = await TransactionManager.query(db,
    'SELECT created_by_user_id FROM meetings WHERE id = ? AND organization_id = ?',
    [meetingId, organizationId]
  );
  if (!meeting) return [];
  const creatorId = meeting.created_by_user_id;
  const reps = await TransactionManager.queryAll(db,
    `SELECT r.user_id, u.name
     FROM organization_representatives r
     JOIN users u ON r.user_id = u.id
     WHERE r.organization_id = ? AND r.status = 'active'`,
    [organizationId]
  );
  const invited = await TransactionManager.queryAll(db,
    `SELECT m.user_id, u.name
     FROM meeting_moderators m
     JOIN users u ON m.user_id = u.id
     WHERE m.meeting_id = ?`,
    [meetingId]
  );
  const creatorRow = creatorId
    ? await TransactionManager.query(db, 'SELECT id, name FROM users WHERE id = ?', [creatorId])
    : null;
  const byUser = new Map();
  if (creatorRow) {
    byUser.set(creatorRow.id, { userId: creatorRow.id, userName: creatorRow.name || null, source: 'creator' });
  }
  reps.forEach(r => {
    if (!byUser.has(r.user_id)) {
      byUser.set(r.user_id, { userId: r.user_id, userName: r.name || null, source: 'representative' });
    }
  });
  invited.forEach(m => {
    if (!byUser.has(m.user_id)) {
      byUser.set(m.user_id, { userId: m.user_id, userName: m.name || null, source: 'invited' });
    }
  });
  return Array.from(byUser.values());
}

/**
 * Add invited moderator. Fails if already moderator. Returns created moderator row info.
 */
async function addModerator(db, { meetingId, userId, invitedByUserId }) {
  const meeting = await TransactionManager.query(db,
    'SELECT id, organization_id, created_by_user_id FROM meetings WHERE id = ?',
    [meetingId]
  );
  if (!meeting) {
    const err = new Error('Meeting not found');
    err.code = 'MEETING_NOT_FOUND';
    throw err;
  }
  const existingUser = await TransactionManager.query(db,
    'SELECT id, name FROM users WHERE id = ?',
    [userId]
  );
  if (!existingUser) {
    const err = new Error('User not found');
    err.code = 'USER_NOT_FOUND';
    throw err;
  }
  const isOrgMember = await TransactionManager.query(db,
    `SELECT 1
     FROM organization_members
     WHERE organization_id = ? AND user_id = ? AND status IN ('active', 'legacy')`,
    [meeting.organization_id, userId]
  );
  if (!isOrgMember) {
    const err = new Error('User must be an active or legacy organization member');
    err.code = 'USER_NOT_ORG_MEMBER';
    throw err;
  }
  if (meeting.created_by_user_id === userId) {
    const err = new Error('User is already a moderator');
    err.code = 'ALREADY_MODERATOR';
    throw err;
  }
  const rep = await TransactionManager.query(db,
    `SELECT 1
     FROM organization_representatives
     WHERE organization_id = ? AND user_id = ? AND status = 'active'`,
    [meeting.organization_id, userId]
  );
  if (rep) {
    const err = new Error('User is already a moderator');
    err.code = 'ALREADY_MODERATOR';
    throw err;
  }
  const existingInvited = await TransactionManager.query(db,
    'SELECT id FROM meeting_moderators WHERE meeting_id = ? AND user_id = ?',
    [meetingId, userId]
  );
  if (existingInvited) {
    const err = new Error('User is already a moderator');
    err.code = 'ALREADY_MODERATOR';
    throw err;
  }
  const id = uuidv4();
  const now = new Date().toISOString();
  await TransactionManager.execute(db,
    `INSERT INTO meeting_moderators (id, meeting_id, user_id, source, invited_by_user_id, created_at)
     VALUES (?, ?, ?, 'invited', ?, ?)`,
    [id, meetingId, userId, invitedByUserId || null, now]
  );
  return { userId: existingUser.id, userName: existingUser?.name || null, source: 'invited' };
}

/**
 * Remove invited moderator (only from meeting_moderators; creator/reps are not in that table).
 */
async function removeModerator(db, { meetingId, userId }) {
  const deleted = await TransactionManager.execute(db,
    'DELETE FROM meeting_moderators WHERE meeting_id = ? AND user_id = ?',
    [meetingId, userId]
  );
  return deleted.changes > 0;
}

/**
 * Create meeting vote + options and append vote_started event. Returns vote with options.
 */
async function createVote(db, { meetingId, minutesDocumentId, title, options, anonymous, sourceEventId, createdByUserId }) {
  const voteId = uuidv4();
  const now = new Date().toISOString();
  const anon = anonymous ? 1 : 0;
  await TransactionManager.execute(db,
    `INSERT INTO meeting_votes (id, meeting_id, title, status, anonymous, created_by_user_id, created_at, source_event_id)
     VALUES (?, ?, ?, 'open', ?, ?, ?, ?)`,
    [voteId, meetingId, title, anon, createdByUserId, now, sourceEventId || null]
  );
  let sortOrder = 0;
  for (const opt of options || []) {
    const label = opt && (opt.label != null) ? String(opt.label).trim() : '';
    if (label === '') continue;
    const optId = uuidv4();
    await TransactionManager.execute(db,
      `INSERT INTO meeting_vote_options (id, meeting_vote_id, label, sort_order) VALUES (?, ?, ?, ?)`,
      [optId, voteId, label, sortOrder]
    );
    sortOrder += 1;
  }
  const orderIndex = Date.now();
  const voteStartedPayload = JSON.stringify({ meetingVoteId: voteId, title });
  const eventId = uuidv4();
  await TransactionManager.execute(db,
    `INSERT INTO meeting_minutes_events (id, meeting_id, minutes_document_id, event_type, payload, order_index, created_at, created_by_user_id)
     VALUES (?, ?, ?, 'vote_started', ?, ?, ?, ?)`,
    [eventId, meetingId, minutesDocumentId, voteStartedPayload, orderIndex, now, createdByUserId]
  );
  const eventRow = await TransactionManager.query(db, 'SELECT * FROM meeting_minutes_events WHERE id = ?', [eventId]);
  const vote = await getVote(db, { voteId, meetingId });
  return { vote, event: rowToEvent(eventRow) };
}

async function closeBrainstormAndStartVote(db, {
  meetingId,
  minutesDocumentId,
  brainstormEventId,
  title,
  options,
  anonymous,
  createdByUserId,
  orderIndex
}) {
  return TransactionManager.executeInTransaction(db, async (trx) => {
    const openBrainstorm = await TransactionManager.query(trx,
      'SELECT id FROM meeting_minutes_events WHERE id = ? AND meeting_id = ? AND event_type = ?',
      [brainstormEventId, meetingId, 'brainstorm_started']
    );
    if (!openBrainstorm) {
      const err = new Error('Brainstorm not found');
      err.code = 'BRAINSTORM_NOT_FOUND';
      throw err;
    }

    const alreadyClosed = await isBrainstormClosed(trx, { meetingId, brainstormEventId });
    if (alreadyClosed) {
      const err = new Error('Brainstorm already closed');
      err.code = 'BRAINSTORM_CLOSED';
      throw err;
    }

    const endedEvent = await createEvent(trx, {
      meetingId,
      minutesDocumentId,
      eventType: 'brainstorm_ended',
      payload: { sourceEventId: brainstormEventId },
      orderIndex: orderIndex != null ? Number(orderIndex) : undefined,
      createdByUserId
    });
    const { vote, event: voteStartedEvent } = await createVote(trx, {
      meetingId,
      minutesDocumentId,
      title,
      options,
      anonymous,
      sourceEventId: brainstormEventId,
      createdByUserId
    });
    return { endedEvent, vote, voteStartedEvent };
  });
}

/**
 * Get vote with options and response counts. If not anonymous, include responses (who voted).
 */
async function getVote(db, { voteId, meetingId }) {
  const voteRow = await TransactionManager.query(db,
    'SELECT * FROM meeting_votes WHERE id = ? AND meeting_id = ?',
    [voteId, meetingId]
  );
  if (!voteRow) return null;
  const options = await TransactionManager.queryAll(db,
    'SELECT id, label, sort_order FROM meeting_vote_options WHERE meeting_vote_id = ? ORDER BY sort_order ASC, id',
    [voteId]
  );
  const responseRows = await TransactionManager.queryAll(db,
    'SELECT option_id, user_id FROM meeting_vote_responses WHERE meeting_vote_id = ?',
    [voteId]
  );
  const countByOption = new Map();
  options.forEach(opt => countByOption.set(opt.id, 0));
  responseRows.forEach(r => {
    countByOption.set(r.option_id, (countByOption.get(r.option_id) || 0) + 1);
  });
  const responseCounts = options.map(opt => ({
    optionId: opt.id,
    count: countByOption.get(opt.id) || 0
  }));
  const result = {
    id: voteRow.id,
    meetingId: voteRow.meeting_id,
    title: voteRow.title,
    status: voteRow.status,
    anonymous: !!(voteRow.anonymous),
    createdByUserId: voteRow.created_by_user_id,
    createdAt: voteRow.created_at,
    closedAt: voteRow.closed_at || null,
    sourceEventId: voteRow.source_event_id || null,
    options: options.map(o => ({ id: o.id, label: o.label, sortOrder: o.sort_order })),
    responseCounts
  };
  if (!voteRow.anonymous && responseRows.length > 0) {
    const userIds = [...new Set(responseRows.map(r => r.user_id))];
    const userRows = userIds.length
      ? await TransactionManager.queryAll(db,
          `SELECT id, name FROM users WHERE id IN (${userIds.map(() => '?').join(',')})`,
          userIds
        )
      : [];
    const userMap = new Map(userRows.map(u => [u.id, { userId: u.id, userName: u.name || null }]));
    const responses = responseRows.map(r => ({
      optionId: r.option_id,
      userId: r.user_id,
      userName: (userMap.get(r.user_id) || {}).userName || null
    }));
    result.responses = responses;
  }
  return result;
}

/**
 * Upsert meeting_vote_responses: one per user per vote (replace existing).
 * @returns {Promise<{ receiptId: string, voteRecordedAt: string, contestId: string, voteType: string }>}
 */
async function upsertVoteResponse(db, { voteId, optionId, userId }) {
  const existing = await TransactionManager.query(db,
    'SELECT id, receipt_id FROM meeting_vote_responses WHERE meeting_vote_id = ? AND user_id = ?',
    [voteId, userId]
  );
  const now = new Date().toISOString();
  const receiptId = existing?.receipt_id || generateReceiptId();
  const voteHash = computeVoteHash('meeting_vote', {
    contestId: voteId,
    userId,
    choice: optionId,
    timestamp: now,
    receiptId
  });

  if (existing) {
    await TransactionManager.execute(db,
      'UPDATE meeting_vote_responses SET option_id = ?, created_at = ?, receipt_id = ?, vote_hash = ? WHERE meeting_vote_id = ? AND user_id = ?',
      [optionId, now, receiptId, voteHash, voteId, userId]
    );
  } else {
    const id = uuidv4();
    await TransactionManager.execute(db,
      `INSERT INTO meeting_vote_responses (id, meeting_vote_id, option_id, user_id, created_at, receipt_id, vote_hash) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, voteId, optionId, userId, now, receiptId, voteHash]
    );
  }

  await voteVerificationLog.appendLogEntry(db, {
    voteType: 'meeting_vote',
    contestId: voteId,
    choice: optionId,
    timestamp: now,
    receiptId,
    voteHash
  });

  return {
    receiptId,
    voteRecordedAt: now,
    contestId: voteId,
    voteType: 'meeting_vote'
  };
}

/**
 * Close vote: set status closed, closed_at; append vote_ended event. Returns vote (with result for payload).
 */
async function closeVote(db, { voteId, meetingId, minutesDocumentId, userId }) {
  const now = new Date().toISOString();
  await TransactionManager.execute(db,
    'UPDATE meeting_votes SET status = ?, closed_at = ? WHERE id = ? AND meeting_id = ?',
    ['closed', now, voteId, meetingId]
  );
  const vote = await getVote(db, { voteId, meetingId });
  const result = vote ? { responseCounts: vote.responseCounts, winningOptionIds: [] } : {};
  const payload = JSON.stringify({ meetingVoteId: voteId, result });
  const orderIndex = Date.now();
  const eventId = uuidv4();
  await TransactionManager.execute(db,
    `INSERT INTO meeting_minutes_events (id, meeting_id, minutes_document_id, event_type, payload, order_index, created_at, created_by_user_id)
     VALUES (?, ?, ?, 'vote_ended', ?, ?, ?, ?)`,
    [eventId, meetingId, minutesDocumentId, payload, orderIndex, now, userId]
  );
  const eventRow = await TransactionManager.query(db, 'SELECT * FROM meeting_minutes_events WHERE id = ?', [eventId]);
  return { vote, event: rowToEvent(eventRow) };
}

/**
 * Add brainstorm option.
 */
async function addBrainstormOption(db, { meetingId, brainstormEventId, label, createdByUserId }) {
  const meeting = await TransactionManager.query(db,
    'SELECT minutes_finalized_at FROM meetings WHERE id = ?',
    [meetingId]
  );
  if (meeting && meeting.minutes_finalized_at) {
    const err = new Error('Minutes are finalized');
    err.code = 'MINUTES_FINALIZED';
    throw err;
  }
  const brainstormRow = await TransactionManager.query(db,
    'SELECT id, event_type FROM meeting_minutes_events WHERE id = ? AND meeting_id = ?',
    [brainstormEventId, meetingId]
  );
  if (!brainstormRow || brainstormRow.event_type !== 'brainstorm_started') {
    const err = new Error('Brainstorm not found');
    err.code = 'BRAINSTORM_NOT_FOUND';
    throw err;
  }
  const ended = await isBrainstormClosed(db, { meetingId, brainstormEventId });
  if (ended) {
    const err = new Error('Brainstorm already closed');
    err.code = 'BRAINSTORM_CLOSED';
    throw err;
  }
  const maxSort = await TransactionManager.query(db,
    'SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM meeting_brainstorm_options WHERE meeting_id = ? AND brainstorm_event_id = ?',
    [meetingId, brainstormEventId]
  );
  const nextSort = Number(maxSort?.max_sort ?? -1) + 1;
  const id = uuidv4();
  const now = new Date().toISOString();
  await TransactionManager.execute(db,
    `INSERT INTO meeting_brainstorm_options (id, meeting_id, brainstorm_event_id, label, created_by_user_id, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, meetingId, brainstormEventId, (label != null ? String(label).trim() : '') || '', createdByUserId || null, nextSort, now]
  );
  const row = await TransactionManager.query(db, 'SELECT * FROM meeting_brainstorm_options WHERE id = ?', [id]);
  return {
    id: row.id,
    meetingId: row.meeting_id,
    brainstormEventId: row.brainstorm_event_id,
    label: row.label,
    createdByUserId: row.created_by_user_id || null,
    sortOrder: row.sort_order,
    createdAt: row.created_at
  };
}

/**
 * Finalize minutes: set meetings.minutes_finalized_at = now() and set the minutes document status to 'agreed'.
 */
async function finalizeMinutes(db, meetingId) {
  const now = new Date().toISOString();
  const meeting = await TransactionManager.query(db,
    'SELECT id, minutes_document_id, organization_id FROM meetings WHERE id = ?',
    [meetingId]
  );
  if (!meeting) {
    return { finalizedAt: now, minutesDocumentId: null, organizationId: null, documentStatusChanged: false };
  }
  await TransactionManager.execute(db,
    'UPDATE meetings SET minutes_finalized_at = ? WHERE id = ?',
    [now, meetingId]
  );
  const minutesDocumentId = meeting.minutes_document_id || null;
  let documentStatusChanged = false;
  if (minutesDocumentId) {
    const docResult = await TransactionManager.execute(db,
      `UPDATE documents SET status = 'agreed', adopted_at = ?, updated_at = ? WHERE id = ? AND status = 'draft'`,
      [now, now, minutesDocumentId]
    );
    documentStatusChanged = docResult.changes > 0;
  }
  return {
    finalizedAt: now,
    minutesDocumentId,
    organizationId: meeting.organization_id || null,
    documentStatusChanged
  };
}

/**
 * Unfinalize minutes: set minutes_finalized_at = null and set the minutes document status back to 'draft'.
 */
async function unfinalizeMinutes(db, meetingId) {
  const meeting = await TransactionManager.query(db,
    'SELECT id, minutes_document_id, organization_id FROM meetings WHERE id = ?',
    [meetingId]
  );
  await TransactionManager.execute(db,
    'UPDATE meetings SET minutes_finalized_at = NULL WHERE id = ?',
    [meetingId]
  );
  let minutesDocumentId = null;
  let documentStatusChanged = false;
  if (meeting?.minutes_document_id) {
    const docResult = await TransactionManager.execute(db,
      `UPDATE documents SET status = 'draft', adopted_at = NULL, updated_at = ? WHERE id = ? AND document_kind = 'meeting_minutes' AND status = 'agreed'`,
      [new Date().toISOString(), meeting.minutes_document_id]
    );
    documentStatusChanged = docResult.changes > 0;
    minutesDocumentId = meeting.minutes_document_id;
  }
  return {
    minutesDocumentId,
    organizationId: meeting?.organization_id || null,
    documentStatusChanged
  };
}

// ----- Agenda items -----

function rowToAgendaItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    meetingId: row.meeting_id,
    title: row.title || '',
    orderIndex: row.order_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByUserId: row.created_by_user_id || null
  };
}

/**
 * List agenda items for a meeting, ordered by order_index.
 */
async function listAgendaItems(db, { meetingId }) {
  const rows = await TransactionManager.queryAll(db,
    'SELECT * FROM meeting_agenda_items WHERE meeting_id = ? ORDER BY order_index ASC, created_at ASC',
    [meetingId]
  );
  return rows.map(rowToAgendaItem);
}

/**
 * Get a single agenda item by id and meeting (for validation).
 */
async function getAgendaItem(db, { meetingId, itemId }) {
  const row = await TransactionManager.query(db,
    'SELECT * FROM meeting_agenda_items WHERE id = ? AND meeting_id = ?',
    [itemId, meetingId]
  );
  return row ? rowToAgendaItem(row) : null;
}

/**
 * Create an agenda item. Returns created item.
 */
async function createAgendaItem(db, { meetingId, title, orderIndex, createdByUserId }) {
  const id = uuidv4();
  const now = new Date().toISOString();
  const order = orderIndex != null ? Number(orderIndex) : Date.now();
  await TransactionManager.execute(db,
    `INSERT INTO meeting_agenda_items (id, meeting_id, title, order_index, created_at, updated_at, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, meetingId, (title && String(title).trim()) || '', order, now, now, createdByUserId || null]
  );
  const row = await TransactionManager.query(db, 'SELECT * FROM meeting_agenda_items WHERE id = ?', [id]);
  return rowToAgendaItem(row);
}

/**
 * Update an agenda item (title and/or order_index). Returns updated item or null.
 */
async function updateAgendaItem(db, { meetingId, itemId, title, orderIndex }) {
  const existing = await getAgendaItem(db, { meetingId, itemId });
  if (!existing) return null;
  const updates = [];
  const params = [];
  if (title !== undefined) {
    updates.push('title = ?');
    params.push((title && String(title).trim()) || '');
  }
  if (orderIndex !== undefined) {
    updates.push('order_index = ?');
    params.push(Number(orderIndex));
  }
  if (updates.length === 0) return existing;
  const now = new Date().toISOString();
  updates.push('updated_at = ?');
  params.push(now);
  params.push(itemId, meetingId);
  await TransactionManager.execute(db,
    `UPDATE meeting_agenda_items SET ${updates.join(', ')} WHERE id = ? AND meeting_id = ?`,
    params
  );
  const row = await TransactionManager.query(db, 'SELECT * FROM meeting_agenda_items WHERE id = ?', [itemId]);
  return row ? rowToAgendaItem(row) : null;
}

/**
 * Delete an agenda item. If this item was the current topic, clear meetings.current_agenda_item_id.
 * Returns { deleted: true, wasCurrentTopic: boolean }.
 */
async function deleteAgendaItem(db, { meetingId, itemId }) {
  const meeting = await TransactionManager.query(db,
    'SELECT current_agenda_item_id FROM meetings WHERE id = ?',
    [meetingId]
  );
  const wasCurrentTopic = meeting && meeting.current_agenda_item_id === itemId;
  await TransactionManager.execute(db,
    'DELETE FROM meeting_agenda_items WHERE id = ? AND meeting_id = ?',
    [itemId, meetingId]
  );
  if (wasCurrentTopic) {
    await TransactionManager.execute(db,
      'UPDATE meetings SET current_agenda_item_id = NULL WHERE id = ?',
      [meetingId]
    );
  }
  return { deleted: true, wasCurrentTopic };
}

/**
 * Reorder agenda items. Body order: [{ id, orderIndex }]. Updates order_index for each.
 */
async function reorderAgendaItems(db, { meetingId, order }) {
  if (!Array.isArray(order) || order.length === 0) return;
  for (let i = 0; i < order.length; i++) {
    const { id, orderIndex } = order[i] || {};
    if (!id || orderIndex == null) continue;
    await TransactionManager.execute(db,
      'UPDATE meeting_agenda_items SET order_index = ?, updated_at = ? WHERE id = ? AND meeting_id = ?',
      [Number(orderIndex), new Date().toISOString(), id, meetingId]
    );
  }
}

/**
 * Reorder timeline items. itemIds is the ordered list of ids (mix of event ids, paragraph ids, and todo ids).
 * Assigns new order_index (0, 1, 2, ...) so the merged timeline order matches itemIds.
 */
async function reorderTimeline(db, { meetingId, minutesDocumentId, itemIds }) {
  if (!minutesDocumentId || !Array.isArray(itemIds) || itemIds.length === 0) return;
  for (let i = 0; i < itemIds.length; i++) {
    const id = itemIds[i];
    if (!id || typeof id !== 'string') continue;
    const orderIndex = i * 10;
    const eventRow = await TransactionManager.query(db,
      'SELECT id FROM meeting_minutes_events WHERE id = ? AND meeting_id = ?',
      [id, meetingId]
    );
    if (eventRow) {
      await TransactionManager.execute(db,
        'UPDATE meeting_minutes_events SET order_index = ? WHERE id = ? AND meeting_id = ?',
        [orderIndex, id, meetingId]
      );
      continue;
    }
    const todoRow = await TransactionManager.query(db,
      'SELECT id FROM meeting_todos WHERE id = ? AND meeting_id = ?',
      [id, meetingId]
    );
    if (todoRow) {
      await TransactionManager.execute(db,
        'UPDATE meeting_todos SET order_index = ? WHERE id = ? AND meeting_id = ?',
        [orderIndex, id, meetingId]
      );
      continue;
    }
    const paraRow = await TransactionManager.query(db,
      'SELECT id FROM paragraphs WHERE id = ? AND document_id = ?',
      [id, minutesDocumentId]
    );
    if (paraRow) {
      await TransactionManager.execute(db,
        'UPDATE paragraphs SET order_index = ?, updated_at = ? WHERE id = ? AND document_id = ?',
        [orderIndex, new Date().toISOString(), id, minutesDocumentId]
      );
    }
  }
}

/**
 * Set the current agenda item (current topic) for the meeting. Validates agendaItemId belongs to meeting.
 * Pass null to clear. Returns { currentAgendaItemId: string | null }.
 */
async function setCurrentTopic(db, { meetingId, agendaItemId }) {
  if (agendaItemId != null && typeof agendaItemId === 'string' && agendaItemId.trim()) {
    const item = await getAgendaItem(db, { meetingId, itemId: agendaItemId.trim() });
    if (!item) return null;
  }
  const idToSet = (agendaItemId != null && typeof agendaItemId === 'string' && agendaItemId.trim()) ? agendaItemId.trim() : null;
  await TransactionManager.execute(db,
    'UPDATE meetings SET current_agenda_item_id = ?, updated_at = ? WHERE id = ?',
    [idToSet, new Date().toISOString(), meetingId]
  );
  return { currentAgendaItemId: idToSet };
}

function formatMinutesEventLine(eventType, payload, enriched) {
  const title = payload && (payload.title != null) ? String(payload.title).trim() : '';
  switch (eventType) {
    case 'vote_started':
      return title ? `Vote started: ${title}` : 'Vote started';
    case 'vote_ended': {
      const result = payload && payload.result;
      const responseCounts = result && Array.isArray(result.responseCounts) ? result.responseCounts : [];
      const total = responseCounts.reduce((s, c) => s + (c.count || 0), 0);
      const suffix = total > 0 ? ` (${total} vote${total !== 1 ? 's' : ''})` : '';
      return title ? `Vote ended: ${title}${suffix}` : `Vote ended${suffix}`;
    }
    case 'date_decided': {
      const pollId = payload && (payload.schedulingPollId || payload.scheduling_poll_id);
      const poll = enriched && enriched.schedulingPoll;
      if (pollId || poll) {
        const pollTitle = (poll && poll.title) ? poll.title : 'Date poll';
        const status = (poll && poll.status) ? poll.status : '';
        const chosenSlot = poll && poll.chosenSlot;
        if (chosenSlot && chosenSlot.startAt) {
          try {
            const d = new Date(chosenSlot.startAt);
            const end = chosenSlot.endAt ? new Date(chosenSlot.endAt) : null;
            const slotStr = end
              ? `${d.toLocaleString()} – ${end.toLocaleTimeString()}`
              : d.toLocaleString();
            return `Date poll: ${pollTitle} – Chosen: ${slotStr}`;
          } catch (_) {
            return `Date poll: ${pollTitle}${status ? ` (${status})` : ''}`;
          }
        }
        return `Date poll: ${pollTitle}${status ? ` (${status})` : ''}`;
      }
      return payload && payload.date ? `Date decided: ${payload.date}` : 'Date decided';
    }
    case 'document_created':
      return title ? `Document created: ${title}` : 'Document created';
    case 'brainstorm_started':
      return 'Brainstorm started';
    case 'brainstorm_ended':
      return 'Brainstorm ended';
    default:
      return title ? `${eventType}: ${title}` : (eventType || 'Event');
  }
}

/**
 * Rich merged minutes blocks (paragraphs, votes, events) for export and public guest view.
 */
async function getMergedMinutesBlocks(db, { organizationId, meetingId, minutesDocumentId }) {
  const { items } = await getTimeline(db, {
    organizationId: organizationId || null,
    meetingId,
    minutesDocumentId,
    limit: null,
    offset: null
  });
  const agendaItems = await listAgendaItems(db, { meetingId });
  const agendaById = new Map(agendaItems.map(a => [a.id, a.title || '']));
  const todos = await listTodos(db, { meetingId });

  const voteIdsWithEnded = new Set();
  for (const item of items) {
    if (item.type === 'event' && item.eventType === 'vote_ended' && item.vote?.id) {
      voteIdsWithEnded.add(item.vote.id);
    }
  }

  const blocks = [];
  if (todos.length > 0) {
    blocks.push({
      type: 'todos_summary',
      orderIndex: -1,
      todos: todos.map(todo => ({
        id: todo.id,
        title: todo.title,
        description: todo.description,
        dueDate: todo.dueDate,
        status: todo.status,
        responsibleUserName: todo.responsibleUserName,
        agendaItemId: todo.agendaItemId,
        agendaItemTitle: todo.agendaItemId ? (agendaById.get(todo.agendaItemId) || '') : null
      }))
    });
  }

  let orderIndex = 0;
  for (const item of items) {
    const idx = orderIndex++;
    if (item.type === 'paragraph') {
      blocks.push({
        type: 'paragraph',
        orderIndex: item.orderIndex != null ? item.orderIndex : idx,
        title: item.title || '',
        text: item.text || '',
        headingLevel: item.headingLevel || item.heading_level || null
      });
      continue;
    }
    if (item.type === 'todo') {
      blocks.push({
        type: 'todo',
        orderIndex: item.orderIndex != null ? item.orderIndex : idx,
        id: item.id,
        title: item.title,
        description: item.description,
        dueDate: item.dueDate,
        status: item.status,
        responsibleUserName: item.responsibleUserName,
        agendaItemId: item.agendaItemId || null
      });
      continue;
    }
    if (item.type !== 'event' || !item.eventType) continue;

    if (item.eventType === 'vote_started' || item.eventType === 'vote_ended') {
      const vote = item.vote;
      const voteId = vote?.id || item.payload?.meetingVoteId || item.payload?.meeting_vote_id;
      if (item.eventType === 'vote_started' && voteId && voteIdsWithEnded.has(voteId)) continue;
      const responseCounts = vote?.responseCounts || [];
      const totalVotes = responseCounts.reduce((s, c) => s + (c.count || 0), 0);
      blocks.push({
        type: 'vote',
        orderIndex: item.orderIndex != null ? item.orderIndex : idx,
        eventType: item.eventType,
        title: vote?.title || (item.payload && item.payload.title) || '',
        options: (vote?.options || []).map(o => ({ id: o.id, label: o.label || '' })),
        responseCounts: responseCounts.map(c => ({ optionId: c.optionId, count: c.count || 0 })),
        totalVotes,
        createdAt: vote?.createdAt || item.occurredAt,
        closedAt: vote?.closedAt || null,
        status: vote?.status || (item.eventType === 'vote_ended' ? 'closed' : 'open')
      });
      continue;
    }
    if (item.eventType === 'brainstorm_started' || item.eventType === 'brainstorm_ended') {
      blocks.push({
        type: 'brainstorm',
        orderIndex: item.orderIndex != null ? item.orderIndex : idx,
        eventType: item.eventType,
        options: (item.options || []).map(o => ({
          id: o.id,
          label: o.label || '',
          sortOrder: o.sortOrder
        }))
      });
      continue;
    }
    if (item.eventType === 'topic_set') {
      const agendaItemId = item.payload && (item.payload.agendaItemId != null ? item.payload.agendaItemId : item.payload.agenda_item_id);
      const topicTitle = agendaItemId != null ? (agendaById.get(agendaItemId) ?? '[Topic no longer available]') : '';
      blocks.push({
        type: 'topic_heading',
        orderIndex: item.orderIndex != null ? item.orderIndex : idx,
        agendaItemId: agendaItemId || null,
        title: topicTitle
      });
      continue;
    }
    blocks.push({
      type: 'event',
      orderIndex: item.orderIndex != null ? item.orderIndex : idx,
      eventType: item.eventType,
      payload: item.payload || {},
      eventLine: formatMinutesEventLine(item.eventType, item.payload, { schedulingPoll: item.schedulingPoll })
    });
  }
  return blocks;
}

/**
 * Finalized minutes blocks for public guest view (no draft content).
 */
async function getPublicFinalizedMinutesBlocks(db, { meetingId, organizationId }) {
  const meeting = await TransactionManager.query(db,
    `SELECT id, minutes_document_id, minutes_finalized_at, organization_id
     FROM meetings WHERE id = ? AND organization_id = ?`,
    [meetingId, organizationId]
  );
  if (!meeting || !meeting.minutes_finalized_at || !meeting.minutes_document_id) {
    return null;
  }
  return getMergedMinutesBlocks(db, {
    organizationId,
    meetingId,
    minutesDocumentId: meeting.minutes_document_id
  });
}

module.exports = {
  listEvents,
  createEvent,
  createDecision,
  listDecisionsByMeeting,
  getTimeline,
  getModerators,
  addModerator,
  removeModerator,
  createVote,
  closeBrainstormAndStartVote,
  getVote,
  upsertVoteResponse,
  closeVote,
  addBrainstormOption,
  finalizeMinutes,
  unfinalizeMinutes,
  rowToEvent,
  listTodos,
  getTodo,
  createTodo,
  updateTodo,
  deleteTodo,
  rowToTodo,
  listAgendaItems,
  getAgendaItem,
  createAgendaItem,
  updateAgendaItem,
  deleteAgendaItem,
  reorderAgendaItems,
  reorderTimeline,
  setCurrentTopic,
  rowToAgendaItem,
  rowToDecision,
  assertDecisionInOrganization,
  linkOrganizationVote,
  formatMinutesEventLine,
  getMergedMinutesBlocks,
  getPublicFinalizedMinutesBlocks
};
