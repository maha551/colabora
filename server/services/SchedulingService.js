/**
 * SchedulingService — Phase 2 Scheduling Backend
 * When2meet-style: create poll, add slots, record responses, list/get poll, finalize with chosen slot.
 */

const { v4: uuidv4 } = require('uuid');
const TransactionManager = require('../database/services/TransactionManager');
const { logger } = require('../middleware/logger');

const DEFAULT_PARTICIPATION_DAYS = 3;

function guestSchedulingService() {
  return require('./GuestSchedulingService');
}

function defaultParticipationDeadline(fromDate = new Date()) {
  const d = new Date(fromDate);
  d.setDate(d.getDate() + DEFAULT_PARTICIPATION_DAYS);
  return d.toISOString();
}

function parseParticipationDeadline(value) {
  if (value == null || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function rowToPoll(row) {
  if (!row) return null;
  const participationDeadline = row.response_deadline != null
    ? (row.response_deadline instanceof Date ? row.response_deadline.toISOString() : row.response_deadline)
    : null;
  const participationClosedAt = row.participation_closed_at != null
    ? (row.participation_closed_at instanceof Date ? row.participation_closed_at.toISOString() : row.participation_closed_at)
    : null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    createdByUserId: row.created_by_user_id,
    title: row.title,
    description: row.description || null,
    status: row.status,
    chosenSlotId: row.chosen_slot_id || null,
    participationDeadline,
    participationClosedAt,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function rowToSlot(row) {
  if (!row) return null;
  return {
    id: row.id,
    pollId: row.scheduling_poll_id,
    startAt: row.start_at,
    endAt: row.end_at,
    sortOrder: row.sort_order != null ? row.sort_order : 0
  };
}

function isParticipationOpen(pollRow) {
  if (!pollRow || pollRow.status !== 'open') return false;
  if (pollRow.response_deadline) {
    const deadline = pollRow.response_deadline instanceof Date
      ? pollRow.response_deadline
      : new Date(pollRow.response_deadline);
    if (!Number.isNaN(deadline.getTime()) && Date.now() >= deadline.getTime()) {
      return false;
    }
  }
  return true;
}

async function getPollRow(db, pollId, organizationId) {
  return TransactionManager.query(db,
    'SELECT * FROM scheduling_polls WHERE id = ? AND organization_id = ?',
    [pollId, organizationId]
  );
}

/**
 * Create a scheduling poll.
 */
async function createPoll(db, { organizationId, userId, title, description, participationDeadline }) {
  const id = uuidv4();
  const now = new Date();
  const nowIso = now.toISOString();
  let deadlineIso = parseParticipationDeadline(participationDeadline) || defaultParticipationDeadline(now);
  if (new Date(deadlineIso) <= now) {
    const err = new Error('Participation deadline must be in the future');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  await TransactionManager.execute(db,
    `INSERT INTO scheduling_polls (id, organization_id, created_by_user_id, title, description, status, response_deadline, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
    [id, organizationId, userId, title || '', description || null, deadlineIso, nowIso, nowIso]
  );
  const row = await TransactionManager.query(db,
    'SELECT * FROM scheduling_polls WHERE id = ?',
    [id]
  );
  await guestSchedulingService().ensureGuestLink(db, id);
  return rowToPoll(row);
}

/**
 * Add slots to a poll. Verifies poll exists and participation is open.
 */
async function addSlots(db, { pollId, organizationId, slots }) {
  const poll = await getPollRow(db, pollId, organizationId);
  if (!poll) return null;
  if (!isParticipationOpen(poll)) {
    return { error: 'POLL_CLOSED' };
  }

  const now = new Date().toISOString();
  const added = [];
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    const slotId = uuidv4();
    await TransactionManager.execute(db,
      `INSERT INTO scheduling_poll_slots (id, scheduling_poll_id, start_at, end_at, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      [slotId, pollId, s.startAt, s.endAt, s.sortOrder != null ? s.sortOrder : i]
    );
    added.push({
      id: slotId,
      pollId,
      startAt: s.startAt,
      endAt: s.endAt,
      sortOrder: s.sortOrder != null ? s.sortOrder : i
    });
  }
  return added;
}

/**
 * Set current user's responses for a poll. Replaces any existing responses for this user for slots in this poll.
 */
async function recordResponse(db, { pollId, organizationId, userId, responses }) {
  const poll = await getPollRow(db, pollId, organizationId);
  if (!poll) return null;
  if (!isParticipationOpen(poll)) {
    return { error: 'POLL_CLOSED' };
  }

  const slotRows = await TransactionManager.queryAll(db,
    'SELECT id FROM scheduling_poll_slots WHERE scheduling_poll_id = ?',
    [pollId]
  );
  const validSlotIds = new Set(slotRows.map(r => r.id));

  const valid = responses.filter(r =>
    validSlotIds.has(r.slotId) &&
    ['yes', 'no', 'maybe'].includes(r.response)
  );
  if (valid.length === 0) return [];

  const slotIds = Array.from(validSlotIds);
  const placeholders = slotIds.map(() => '?').join(',');
  await TransactionManager.execute(db,
    `DELETE FROM scheduling_poll_responses WHERE user_id = ? AND slot_id IN (${placeholders})`,
    [userId, ...slotIds]
  );

  const now = new Date().toISOString();
  for (const r of valid) {
    await TransactionManager.execute(db,
      `INSERT INTO scheduling_poll_responses (id, slot_id, user_id, response, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uuidv4(), r.slotId, userId, r.response, now, now]
    );
  }
  return valid;
}

/**
 * List polls for an organization.
 */
async function listPolls(db, { organizationId }) {
  const rows = await TransactionManager.queryAll(db,
    `SELECT * FROM scheduling_polls WHERE organization_id = ? ORDER BY updated_at DESC`,
    [organizationId]
  );
  return rows.map(rowToPoll);
}

async function getParticipationSummary(db, pollId, organizationId) {
  const memberRows = await TransactionManager.queryAll(db, `
    SELECT om.user_id FROM organization_members om
    WHERE om.organization_id = ? AND om.status = 'active'
      AND om.user_id NOT IN (SELECT id FROM organizations)
  `, [organizationId]);
  const memberIds = (memberRows || []).map(r => r.user_id);
  const memberCount = memberIds.length;

  const slotRows = await TransactionManager.queryAll(db,
    'SELECT id FROM scheduling_poll_slots WHERE scheduling_poll_id = ?',
    [pollId]
  );
  let respondedUserIds = [];
  if (slotRows.length > 0) {
    const slotIds = slotRows.map(s => s.id);
    const placeholders = slotIds.map(() => '?').join(',');
    const responseRows = await TransactionManager.queryAll(db,
      `SELECT DISTINCT user_id FROM scheduling_poll_responses WHERE slot_id IN (${placeholders})`,
      slotIds
    );
    respondedUserIds = (responseRows || []).map(r => r.user_id);
  }

  const respondedSet = new Set(respondedUserIds);
  const nonRespondedUserIds = memberIds.filter(id => !respondedSet.has(id));

  const guestCountRow = await TransactionManager.query(db,
    'SELECT COUNT(*) AS c FROM scheduling_poll_guest_respondents WHERE scheduling_poll_id = ?',
    [pollId]
  );
  const guestCount = Number(guestCountRow?.c ?? 0);

  return {
    memberCount,
    respondedCount: respondedUserIds.length,
    nonRespondedUserIds,
    guestCount
  };
}

function computeSuggestedSlot(slots, responseCounts) {
  if (!slots?.length || !responseCounts?.length) return null;
  let maxYes = 0;
  for (const rc of responseCounts) {
    if (rc.yes > maxYes) maxYes = rc.yes;
  }
  if (maxYes === 0) return null;
  const best = slots.filter((slot) => {
    const rc = responseCounts.find((c) => c.slotId === slot.id);
    return rc && rc.yes === maxYes;
  });
  if (best.length === 0) return null;
  const slot = best[0];
  const rc = responseCounts.find((c) => c.slotId === slot.id);
  return { slotId: slot.id, startAt: slot.startAt, endAt: slot.endAt, yesCount: rc?.yes ?? maxYes };
}

/**
 * Get a single poll with slots and response counts per slot. When finalized, include chosenSlot.
 * If userId is provided, also returns myResponses (current user's responses per slot).
 */
async function getPoll(db, { pollId, organizationId, userId, includeParticipationSummary = false }) {
  const row = await getPollRow(db, pollId, organizationId);
  if (!row) return null;

  const poll = rowToPoll(row);
  const slotRows = await TransactionManager.queryAll(db,
    'SELECT * FROM scheduling_poll_slots WHERE scheduling_poll_id = ? ORDER BY sort_order ASC, start_at ASC',
    [pollId]
  );
  const slots = slotRows.map(rowToSlot);

  const responseCountsMap = new Map();
  if (slotRows.length > 0) {
    const slotIds = slotRows.map(s => s.id);
    const placeholders = slotIds.map(() => '?').join(',');
    const countRows = await TransactionManager.queryAll(db,
      `SELECT slot_id, response, COUNT(*) as c FROM scheduling_poll_responses WHERE slot_id IN (${placeholders}) GROUP BY slot_id, response`,
      slotIds
    );
    for (const r of countRows || []) {
      const sid = r.slot_id;
      if (!responseCountsMap.has(sid)) {
        responseCountsMap.set(sid, { yes: 0, no: 0, maybe: 0 });
      }
      const bucket = responseCountsMap.get(sid);
      const count = Number(r.c ?? 0);
      if (r.response === 'yes') bucket.yes = count;
      else if (r.response === 'no') bucket.no = count;
      else if (r.response === 'maybe') bucket.maybe = count;
    }
  }
  const responseCounts = slotRows.map(slot => {
    const bucket = responseCountsMap.get(slot.id) || { yes: 0, no: 0, maybe: 0 };
    return {
      slotId: slot.id,
      yes: bucket.yes,
      no: bucket.no,
      maybe: bucket.maybe
    };
  });

  let chosenSlot = null;
  if (row.chosen_slot_id) {
    const chosenRow = await TransactionManager.query(db,
      'SELECT * FROM scheduling_poll_slots WHERE id = ?',
      [row.chosen_slot_id]
    );
    if (chosenRow) {
      chosenSlot = {
        id: chosenRow.id,
        startAt: chosenRow.start_at,
        endAt: chosenRow.end_at
      };
    }
  }

  let myResponses = [];
  if (userId && slotRows.length > 0) {
    const slotIds = slotRows.map(s => s.id);
    const placeholders = slotIds.map(() => '?').join(',');
    const myRows = await TransactionManager.queryAll(db,
      `SELECT slot_id, response FROM scheduling_poll_responses WHERE user_id = ? AND slot_id IN (${placeholders})`,
      [userId, ...slotIds]
    );
    myResponses = myRows.map(r => ({ slotId: r.slot_id, response: r.response }));
  }

  const slotIds = slotRows.map(s => s.id);
  const guestCountsMap = await guestSchedulingService().getGuestResponseCounts(db, pollId, slotIds);
  const mergedResponseCounts = guestSchedulingService().mergeResponseCounts(responseCounts, guestCountsMap, slotIds);
  const guestLink = await guestSchedulingService().ensureGuestLink(db, pollId);
  const guestRespondentSummaries = await guestSchedulingService().listGuestRespondentsSummary(db, pollId);

  const result = {
    poll,
    slots,
    responseCounts: mergedResponseCounts,
    chosenSlot,
    myResponses,
    guestLink: guestLink ? { url: guestLink.url, expiresAt: guestLink.expiresAt } : null,
    guestRespondentSummaries
  };

  if (includeParticipationSummary) {
    result.participationSummary = await getParticipationSummary(db, pollId, organizationId);
    result.suggestedSlot = computeSuggestedSlot(slots, mergedResponseCounts);
  }

  return result;
}

/**
 * Close poll for participation (auto or manual).
 */
async function closePollForParticipation(db, { pollId, organizationId, reason = 'deadline' }) {
  const pollRow = await getPollRow(db, pollId, organizationId);
  if (!pollRow) return null;

  if (pollRow.status === 'closed') {
    const pollData = await getPoll(db, { pollId, organizationId, includeParticipationSummary: true });
    return {
      poll: pollData.poll,
      participationSummary: pollData.participationSummary,
      suggestedSlot: pollData.suggestedSlot,
      closedReason: reason,
      alreadyClosed: true
    };
  }

  if (pollRow.status !== 'open') {
    return { error: 'POLL_NOT_OPEN' };
  }

  const now = new Date().toISOString();
  await TransactionManager.execute(db,
    `UPDATE scheduling_polls SET status = 'closed', participation_closed_at = ?, updated_at = ? WHERE id = ? AND organization_id = ? AND status = 'open'`,
    [now, now, pollId, organizationId]
  );

  const updated = await getPollRow(db, pollId, organizationId);
  const poll = rowToPoll(updated);
  const pollData = await getPoll(db, { pollId, organizationId, includeParticipationSummary: true });

  return {
    poll,
    participationSummary: pollData.participationSummary,
    suggestedSlot: pollData.suggestedSlot,
    closedReason: reason,
    alreadyClosed: false
  };
}

/**
 * Extend participation deadline; reopens closed polls when new deadline is in the future.
 */
async function extendParticipationDeadline(db, { pollId, organizationId, participationDeadline }) {
  const pollRow = await getPollRow(db, pollId, organizationId);
  if (!pollRow) return null;

  if (pollRow.status === 'finalized') {
    return { error: 'POLL_FINALIZED' };
  }

  const deadlineIso = parseParticipationDeadline(participationDeadline);
  if (!deadlineIso || new Date(deadlineIso) <= new Date()) {
    const err = new Error('Participation deadline must be in the future');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const now = new Date().toISOString();
  const reopen = pollRow.status === 'closed';

  if (reopen) {
    await TransactionManager.execute(db,
      `UPDATE scheduling_polls SET status = 'open', response_deadline = ?, participation_closed_at = NULL, participation_reminder_sent_at = NULL, updated_at = ? WHERE id = ? AND organization_id = ?`,
      [deadlineIso, now, pollId, organizationId]
    );
  } else {
    await TransactionManager.execute(db,
      `UPDATE scheduling_polls SET response_deadline = ?, participation_reminder_sent_at = NULL, updated_at = ? WHERE id = ? AND organization_id = ?`,
      [deadlineIso, now, pollId, organizationId]
    );
  }

  const updated = await getPollRow(db, pollId, organizationId);
  return { poll: rowToPoll(updated), reopened: reopen };
}

/**
 * Finalize poll with chosen slot. Caller must enforce rep/creator.
 */
async function finalizePoll(db, { pollId, organizationId, chosenSlotId }) {
  const pollRow = await getPollRow(db, pollId, organizationId);
  if (!pollRow) return null;

  if (pollRow.status === 'finalized') {
    return { error: 'POLL_FINALIZED' };
  }
  if (pollRow.status !== 'open' && pollRow.status !== 'closed') {
    return { error: 'POLL_NOT_FINALIZABLE' };
  }

  const slotRow = await TransactionManager.query(db,
    'SELECT * FROM scheduling_poll_slots WHERE id = ? AND scheduling_poll_id = ?',
    [chosenSlotId, pollId]
  );
  if (!slotRow) return null;

  const now = new Date().toISOString();
  await TransactionManager.execute(db,
    `UPDATE scheduling_polls SET chosen_slot_id = ?, status = 'finalized', updated_at = ? WHERE id = ? AND organization_id = ?`,
    [chosenSlotId, now, pollId, organizationId]
  );

  await guestSchedulingService().extendGuestLinkExpiryAfterFinalize(db, pollId);

  const updated = await TransactionManager.query(db,
    'SELECT * FROM scheduling_polls WHERE id = ?',
    [pollId]
  );
  return {
    poll: rowToPoll(updated),
    chosenSlot: { startAt: slotRow.start_at, endAt: slotRow.end_at }
  };
}

/**
 * Check if user is poll creator or org representative (for add slots / finalize).
 */
async function canManagePoll(db, pollId, organizationId, userId) {
  const poll = await TransactionManager.query(db,
    'SELECT created_by_user_id FROM scheduling_polls WHERE id = ? AND organization_id = ?',
    [pollId, organizationId]
  );
  if (!poll) return false;
  if (poll.created_by_user_id === userId) return true;
  const { isRepresentative } = require('../modules/permissions');
  return await isRepresentative(db, userId, organizationId);
}

async function getManagerUserIds(db, pollId, organizationId) {
  const poll = await TransactionManager.query(db,
    'SELECT created_by_user_id FROM scheduling_polls WHERE id = ? AND organization_id = ?',
    [pollId, organizationId]
  );
  if (!poll) return [];

  const repRows = await TransactionManager.queryAll(db, `
    SELECT user_id FROM organization_representatives
    WHERE organization_id = ? AND status = 'active'
  `, [organizationId]);

  const ids = new Set([poll.created_by_user_id]);
  for (const r of repRows || []) {
    if (r.user_id) ids.add(r.user_id);
  }
  return Array.from(ids);
}

async function getActiveMemberUserIds(db, organizationId) {
  const members = await TransactionManager.queryAll(db, `
    SELECT u.id AS user_id FROM organization_members om
    JOIN users u ON om.user_id = u.id
    WHERE om.organization_id = ? AND om.status = 'active'
      AND om.user_id NOT IN (SELECT id FROM organizations)
  `, [organizationId]);
  return (members || []).map(m => m.user_id);
}

function pollDetailLink(organizationId, pollId) {
  const config = require('../config');
  const base = (config.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  return `${base}/#/organization/${organizationId}/schedule/polls/${pollId}`;
}

module.exports = {
  DEFAULT_PARTICIPATION_DAYS,
  defaultParticipationDeadline,
  createPoll,
  addSlots,
  recordResponse,
  listPolls,
  getPoll,
  finalizePoll,
  closePollForParticipation,
  extendParticipationDeadline,
  canManagePoll,
  getParticipationSummary,
  getManagerUserIds,
  getActiveMemberUserIds,
  pollDetailLink,
  isParticipationOpen,
  computeSuggestedSlot
};
