const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const TransactionManager = require('../database/services/TransactionManager');

function parsePayload(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (_) {
      return null;
    }
  }
  return typeof value === 'object' ? value : null;
}

function stringifyPayload(value) {
  if (value == null) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function toIso(value, fallback) {
  if (!value) return fallback || new Date().toISOString();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback || new Date().toISOString();
  return d.toISOString();
}

async function resolveNextEntityVersion(db, { meetingId, entityKey }) {
  const rows = await TransactionManager.queryAll(
    db,
    `SELECT entity_version
       FROM minutes_document_blocks
      WHERE meeting_id = ? AND entity_key = ?
      ORDER BY created_at DESC
      LIMIT 20`,
    [meetingId, entityKey]
  );
  let max = 0;
  for (const row of rows) {
    const n = Number.parseInt(String(row?.entity_version || ''), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1);
}

async function writeBlock(db, {
  meetingId,
  minutesDocumentId,
  blockType,
  status,
  orderIndex,
  occurredAt,
  agendaItemId,
  sourceTimelineItemId,
  entityKey,
  entityVersion,
  payload,
  createdByUserId
}) {
  const id = uuidv4();
  const createdAt = new Date().toISOString();
  const finalEntityVersion = entityVersion || await resolveNextEntityVersion(db, { meetingId, entityKey });
  await TransactionManager.execute(
    db,
    `INSERT INTO minutes_document_blocks
      (id, meeting_id, minutes_document_id, block_type, status, order_index, occurred_at, agenda_item_id, source_timeline_item_id, entity_key, entity_version, payload_json, created_by_user_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      meetingId,
      minutesDocumentId,
      blockType,
      status || 'recorded',
      Number(orderIndex ?? 0),
      toIso(occurredAt, createdAt),
      agendaItemId || null,
      sourceTimelineItemId || null,
      entityKey,
      finalEntityVersion,
      stringifyPayload(payload),
      createdByUserId || null,
      createdAt
    ]
  );
  const row = await TransactionManager.query(db, 'SELECT * FROM minutes_document_blocks WHERE id = ?', [id]);
  return row;
}

function deriveAgendaItemId(item) {
  if (!item) return null;
  if (item.agendaItemId) return item.agendaItemId;
  if (item.payload && typeof item.payload === 'object') {
    return item.payload.agendaItemId || item.payload.agenda_item_id || null;
  }
  return null;
}

async function archiveEvent(db, { meetingId, minutesDocumentId, event, createdByUserId }) {
  const payload = parsePayload(event.payload) || event.payload || null;
  const eventType = event.eventType || event.event_type || 'event';
  const sourceId = event.id;
  const blockType = (() => {
    if (eventType.startsWith('brainstorm_')) return 'brainstorm';
    if (eventType.startsWith('vote_')) return 'vote';
    if (eventType === 'date_decided') return 'date_poll';
    if (eventType === 'document_created') return 'document_link';
    if (eventType === 'topic_set') return 'topic_set';
    return 'event';
  })();
  const entityRoot = (() => {
    if (eventType === 'brainstorm_ended') {
      return payload?.sourceEventId || payload?.source_event_id || sourceId;
    }
    if (eventType === 'vote_started' || eventType === 'vote_ended') {
      return payload?.meetingVoteId || payload?.meeting_vote_id || sourceId;
    }
    return sourceId;
  })();
  return writeBlock(db, {
    meetingId,
    minutesDocumentId,
    blockType,
    status: eventType.endsWith('_ended') ? 'closed' : 'recorded',
    orderIndex: event.orderIndex,
    occurredAt: event.createdAt || event.occurredAt,
    agendaItemId: deriveAgendaItemId({ payload }),
    sourceTimelineItemId: sourceId,
    entityKey: `${blockType}:${entityRoot}`,
    payload: { eventType, ...(payload && typeof payload === 'object' ? payload : { payload }) },
    createdByUserId
  });
}

async function archiveTodo(db, { meetingId, minutesDocumentId, todo, createdByUserId }) {
  return writeBlock(db, {
    meetingId,
    minutesDocumentId,
    blockType: 'todo',
    status: todo.status || 'pending',
    orderIndex: todo.orderIndex,
    occurredAt: todo.createdAt || todo.occurredAt,
    agendaItemId: todo.agendaItemId || null,
    sourceTimelineItemId: todo.id,
    entityKey: `todo:${todo.id}`,
    payload: todo,
    createdByUserId
  });
}

async function archiveDecision(db, { meetingId, minutesDocumentId, decision, createdByUserId }) {
  return writeBlock(db, {
    meetingId,
    minutesDocumentId,
    blockType: 'decision',
    status: decision.status || 'recorded',
    orderIndex: decision.orderIndex,
    occurredAt: decision.createdAt || decision.occurredAt,
    agendaItemId: decision.agendaItemId || null,
    sourceTimelineItemId: decision.id,
    entityKey: `decision:${decision.id}`,
    payload: decision,
    createdByUserId
  });
}

async function archiveParagraph(db, { meetingId, minutesDocumentId, paragraph, operation = 'upsert', createdByUserId }) {
  return writeBlock(db, {
    meetingId,
    minutesDocumentId,
    blockType: 'paragraph',
    status: operation === 'delete' ? 'deleted' : 'recorded',
    orderIndex: paragraph.orderIndex,
    occurredAt: paragraph.createdAt || paragraph.occurredAt,
    agendaItemId: paragraph.agendaItemId || null,
    sourceTimelineItemId: paragraph.id,
    entityKey: `paragraph:${paragraph.id}`,
    payload: { ...paragraph, operation },
    createdByUserId
  });
}

function rowToTimelineItem(row) {
  const payload = parsePayload(row.payload_json) || {};
  const base = {
    id: row.source_timeline_item_id || row.id,
    occurredAt: row.occurred_at || row.created_at,
    orderIndex: Number(row.order_index),
    agendaItemId: row.agenda_item_id || null,
    entityVersion: row.entity_version || null
  };
  if (row.block_type === 'paragraph') {
    if (payload.operation === 'delete' || row.status === 'deleted') return null;
    return {
      type: 'paragraph',
      ...base,
      title: payload.title || null,
      text: payload.text || '',
      headingLevel: payload.headingLevel || payload.heading_level || null
    };
  }
  if (row.block_type === 'todo') {
    if (row.status === 'deleted' || payload.operation === 'delete') return null;
    return { type: 'todo', ...base, ...payload };
  }
  if (row.block_type === 'decision') {
    if (row.status === 'deleted' || payload.operation === 'delete') return null;
    return { type: 'decision', ...base, ...payload };
  }
  if (row.block_type === 'brainstorm' || row.block_type === 'vote' || row.block_type === 'date_poll' || row.block_type === 'document_link' || row.block_type === 'event' || row.block_type === 'topic_set') {
    return {
      type: 'event',
      ...base,
      eventType: payload.eventType || payload.event_type || row.block_type,
      payload
    };
  }
  return null;
}

async function getArchiveVersion(db, { meetingId, versionNumber }) {
  if (!versionNumber) {
    return TransactionManager.query(
      db,
      `SELECT * FROM minutes_archive_versions WHERE meeting_id = ? ORDER BY version_number DESC LIMIT 1`,
      [meetingId]
    );
  }
  return TransactionManager.query(
    db,
    `SELECT * FROM minutes_archive_versions WHERE meeting_id = ? AND version_number = ?`,
    [meetingId, Number(versionNumber)]
  );
}

async function listLatestTimelineItems(db, { meetingId, minutesDocumentId, versionNumber }) {
  const version = await getArchiveVersion(db, { meetingId, versionNumber });
  const params = [meetingId, minutesDocumentId];
  let cutoffSql = '';
  if (version?.frozen_at) {
    cutoffSql = ' AND created_at <= ?';
    params.push(version.frozen_at);
  }
  const rows = await TransactionManager.queryAll(
    db,
    `SELECT *
       FROM minutes_document_blocks
      WHERE meeting_id = ? AND minutes_document_id = ?${cutoffSql}
      ORDER BY created_at ASC`,
    params
  );
  const latestByKey = new Map();
  for (const row of rows) {
    latestByKey.set(row.entity_key, row);
  }
  const items = Array.from(latestByKey.values())
    .sort((a, b) => {
      const ao = Number(a.order_index);
      const bo = Number(b.order_index);
      if (ao !== bo) return ao - bo;
      const at = Date.parse(String(a.occurred_at || a.created_at || ''));
      const bt = Date.parse(String(b.occurred_at || b.created_at || ''));
      if (at !== bt) return at - bt;
      return String(a.id).localeCompare(String(b.id));
    })
    .map(rowToTimelineItem)
    .filter(Boolean);
  return { items };
}

async function hasArchiveBlocks(db, { meetingId, minutesDocumentId }) {
  const row = await TransactionManager.query(
    db,
    `SELECT id
       FROM minutes_document_blocks
      WHERE meeting_id = ? AND minutes_document_id = ?
      LIMIT 1`,
    [meetingId, minutesDocumentId]
  );
  return !!row;
}

async function createArchiveVersion(db, { meetingId, minutesDocumentId, frozenByUserId }) {
  const maxRow = await TransactionManager.query(
    db,
    `SELECT COALESCE(MAX(version_number), 0) AS max_version
       FROM minutes_archive_versions
      WHERE meeting_id = ?`,
    [meetingId]
  );
  const versionNumber = Number(maxRow?.max_version || 0) + 1;
  const id = uuidv4();
  const frozenAt = new Date().toISOString();
  const rows = await TransactionManager.queryAll(
    db,
    `SELECT entity_key, entity_version, block_type, order_index, status, payload_json
       FROM minutes_document_blocks
      WHERE meeting_id = ? AND minutes_document_id = ?
      ORDER BY created_at ASC`,
    [meetingId, minutesDocumentId]
  );
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(rows))
    .digest('hex');
  await TransactionManager.execute(
    db,
    `INSERT INTO minutes_archive_versions
      (id, meeting_id, minutes_document_id, version_number, frozen_at, frozen_by_user_id, hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, meetingId, minutesDocumentId, versionNumber, frozenAt, frozenByUserId || null, hash, frozenAt]
  );
  return { id, meetingId, minutesDocumentId, versionNumber, frozenAt, frozenByUserId: frozenByUserId || null, hash };
}

module.exports = {
  writeBlock,
  archiveEvent,
  archiveTodo,
  archiveDecision,
  archiveParagraph,
  listLatestTimelineItems,
  hasArchiveBlocks,
  createArchiveVersion
};
