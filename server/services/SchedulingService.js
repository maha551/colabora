/**
 * SchedulingService — Phase 2 Scheduling Backend
 * When2meet-style: create poll, add slots, record responses, list/get poll, finalize with chosen slot.
 */

const { v4: uuidv4 } = require('uuid');
const TransactionManager = require('../database/services/TransactionManager');
const { logger } = require('../middleware/logger');

function guestSchedulingService() {
  return require('./GuestSchedulingService');
}

function rowToPoll(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    createdByUserId: row.created_by_user_id,
    title: row.title,
    description: row.description || null,
    status: row.status,
    chosenSlotId: row.chosen_slot_id || null,
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

/**
 * Create a scheduling poll.
 */
async function createPoll(db, { organizationId, userId, title, description }) {
  const id = uuidv4();
  const now = new Date().toISOString();
  await TransactionManager.execute(db,
    `INSERT INTO scheduling_polls (id, organization_id, created_by_user_id, title, description, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`,
    [id, organizationId, userId, title || '', description || null, now, now]
  );
  const row = await TransactionManager.query(db,
    'SELECT * FROM scheduling_polls WHERE id = ?',
    [id]
  );
  await guestSchedulingService().ensureGuestLink(db, id);
  return rowToPoll(row);
}

/**
 * Add slots to a poll. Verifies poll exists.
 */
async function addSlots(db, { pollId, organizationId, slots }) {
  const poll = await TransactionManager.query(db,
    'SELECT id FROM scheduling_polls WHERE id = ? AND organization_id = ?',
    [pollId, organizationId]
  );
  if (!poll) return null;

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
  const poll = await TransactionManager.query(db,
    'SELECT id FROM scheduling_polls WHERE id = ? AND organization_id = ?',
    [pollId, organizationId]
  );
  if (!poll) return null;

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

/**
 * Get a single poll with slots and response counts per slot. When finalized, include chosenSlot.
 * If userId is provided, also returns myResponses (current user's responses per slot).
 */
async function getPoll(db, { pollId, organizationId, userId }) {
  const row = await TransactionManager.query(db,
    'SELECT * FROM scheduling_polls WHERE id = ? AND organization_id = ?',
    [pollId, organizationId]
  );
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

  return {
    poll,
    slots,
    responseCounts: mergedResponseCounts,
    chosenSlot,
    myResponses,
    guestLink: guestLink ? { url: guestLink.url, expiresAt: guestLink.expiresAt } : null,
    guestRespondentSummaries
  };
}

/**
 * Finalize poll with chosen slot. Caller must enforce rep/creator.
 */
async function finalizePoll(db, { pollId, organizationId, chosenSlotId }) {
  const pollRow = await TransactionManager.query(db,
    'SELECT id, chosen_slot_id FROM scheduling_polls WHERE id = ? AND organization_id = ?',
    [pollId, organizationId]
  );
  if (!pollRow) return null;

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

module.exports = {
  createPoll,
  addSlots,
  recordResponse,
  listPolls,
  getPoll,
  finalizePoll,
  canManagePoll
};
