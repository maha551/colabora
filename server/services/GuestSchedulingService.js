/**
 * GuestSchedulingService — account-free poll participation via share links.
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const TransactionManager = require('../database/services/TransactionManager');
const { logger } = require('../middleware/logger');
const config = require('../config');
const SchedulingService = require('./SchedulingService');
const MeetingMinutesService = require('./MeetingMinutesService');

const OPEN_LINK_EXPIRY_DAYS = 30;
const FINALIZED_LINK_EXPIRY_DAYS = 90;
const DISPLAY_NAME_MAX = 80;

function buildGuestPollUrl(token) {
  const base = (config.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  return `${base}/guest/poll/${token}`;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function normalizeDisplayName(name) {
  const trimmed = (name != null ? String(name) : '').trim();
  if (!trimmed) return 'Guest';
  return trimmed.slice(0, DISPLAY_NAME_MAX);
}

function rowToGuestLink(row) {
  if (!row) return null;
  return {
    id: row.id,
    schedulingPollId: row.scheduling_poll_id,
    token: row.token,
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    revokedAt: row.revoked_at || null
  };
}

async function getPollRow(db, pollId) {
  return TransactionManager.query(db,
    'SELECT * FROM scheduling_polls WHERE id = ?',
    [pollId]
  );
}

async function computeLinkExpiry(db, pollId) {
  const poll = await getPollRow(db, pollId);
  if (!poll) return addDays(new Date(), OPEN_LINK_EXPIRY_DAYS);
  if (poll.status === 'finalized') {
    return addDays(new Date(), FINALIZED_LINK_EXPIRY_DAYS);
  }
  return addDays(new Date(), OPEN_LINK_EXPIRY_DAYS);
}

/**
 * Create or return active guest link for a poll.
 */
async function ensureGuestLink(db, pollId) {
  const poll = await getPollRow(db, pollId);
  if (!poll) return null;

  if (poll.guest_link_id) {
    const existing = await TransactionManager.query(db,
      `SELECT * FROM scheduling_poll_guest_links
       WHERE id = ? AND status = 'active'`,
      [poll.guest_link_id]
    );
    if (existing) {
      const expiresAt = existing.expires_at instanceof Date
        ? existing.expires_at.toISOString()
        : existing.expires_at;
      if (new Date(expiresAt) > new Date()) {
        return {
          token: existing.token,
          url: buildGuestPollUrl(existing.token),
          expiresAt
        };
      }
    }
  }

  const activeLink = await TransactionManager.query(db,
    `SELECT * FROM scheduling_poll_guest_links
     WHERE scheduling_poll_id = ? AND status = 'active'
     ORDER BY created_at DESC LIMIT 1`,
    [pollId]
  );
  if (activeLink) {
    const expiresAt = activeLink.expires_at instanceof Date
      ? activeLink.expires_at.toISOString()
      : activeLink.expires_at;
    if (new Date(expiresAt) > new Date()) {
      if (!poll.guest_link_id) {
        await TransactionManager.execute(db,
          'UPDATE scheduling_polls SET guest_link_id = ?, updated_at = ? WHERE id = ?',
          [activeLink.id, new Date().toISOString(), pollId]
        );
      }
      return {
        token: activeLink.token,
        url: buildGuestPollUrl(activeLink.token),
        expiresAt
      };
    }
  }

  const linkId = uuidv4();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = await computeLinkExpiry(db, pollId);
  const now = new Date().toISOString();

  await TransactionManager.execute(db,
    `INSERT INTO scheduling_poll_guest_links
     (id, scheduling_poll_id, token, status, expires_at, created_at)
     VALUES (?, ?, ?, 'active', ?, ?)`,
    [linkId, pollId, token, expiresAt, now]
  );
  await TransactionManager.execute(db,
    'UPDATE scheduling_polls SET guest_link_id = ?, updated_at = ? WHERE id = ?',
    [linkId, now, pollId]
  );

  return {
    token,
    url: buildGuestPollUrl(token),
    expiresAt
  };
}

/**
 * Validate guest link token; returns poll context or null.
 */
async function resolveGuestLink(db, token) {
  if (!token || typeof token !== 'string' || !token.trim()) return null;
  const row = await TransactionManager.query(db,
    `SELECT gl.*, sp.organization_id, sp.status AS poll_status
     FROM scheduling_poll_guest_links gl
     INNER JOIN scheduling_polls sp ON sp.id = gl.scheduling_poll_id
     WHERE gl.token = ? AND gl.status = 'active'`,
    [token.trim()]
  );
  if (!row) return null;

  const expiresAt = row.expires_at instanceof Date ? row.expires_at : new Date(row.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || Date.now() > expiresAt.getTime()) {
    return null;
  }

  return {
    linkId: row.id,
    pollId: row.scheduling_poll_id,
    organizationId: row.organization_id,
    pollStatus: row.poll_status
  };
}

async function getGuestResponseCounts(db, pollId, slotIds) {
  const map = new Map();
  for (const id of slotIds) {
    map.set(id, { yes: 0, no: 0, maybe: 0 });
  }
  if (slotIds.length === 0) return map;

  const placeholders = slotIds.map(() => '?').join(',');
  const rows = await TransactionManager.queryAll(db,
    `SELECT r.slot_id, r.response, COUNT(*) AS c
     FROM scheduling_poll_guest_responses r
     INNER JOIN scheduling_poll_guest_respondents gr ON gr.id = r.guest_respondent_id
     WHERE gr.scheduling_poll_id = ? AND r.slot_id IN (${placeholders})
     GROUP BY r.slot_id, r.response`,
    [pollId, ...slotIds]
  );
  for (const row of rows || []) {
    const bucket = map.get(row.slot_id) || { yes: 0, no: 0, maybe: 0 };
    const count = Number(row.c ?? 0);
    if (row.response === 'yes') bucket.yes = count;
    else if (row.response === 'no') bucket.no = count;
    else if (row.response === 'maybe') bucket.maybe = count;
    map.set(row.slot_id, bucket);
  }
  return map;
}

function mergeResponseCounts(memberCounts, guestCountsMap, slotIds) {
  return slotIds.map((slotId) => {
    const member = memberCounts.find(c => c.slotId === slotId) || { yes: 0, no: 0, maybe: 0 };
    const guest = guestCountsMap.get(slotId) || { yes: 0, no: 0, maybe: 0 };
    return {
      slotId,
      yes: (member.yes || 0) + (guest.yes || 0),
      no: (member.no || 0) + (guest.no || 0),
      maybe: (member.maybe || 0) + (guest.maybe || 0)
    };
  });
}

async function getMeetingForPoll(db, pollId) {
  return TransactionManager.query(db,
    `SELECT id, title, scheduled_at, end_at, location, meeting_link, minutes_finalized_at, organization_id, minutes_document_id
     FROM meetings WHERE created_from_scheduling_poll_id = ? LIMIT 1`,
    [pollId]
  );
}

async function getGuestSession(db, pollId, sessionToken) {
  if (!sessionToken || typeof sessionToken !== 'string') return null;
  const respondent = await TransactionManager.query(db,
    `SELECT id, display_name, session_token FROM scheduling_poll_guest_respondents
     WHERE scheduling_poll_id = ? AND session_token = ?`,
    [pollId, sessionToken.trim()]
  );
  if (!respondent) return null;

  const slotRows = await TransactionManager.queryAll(db,
    'SELECT id FROM scheduling_poll_slots WHERE scheduling_poll_id = ?',
    [pollId]
  );
  if (slotRows.length === 0) {
    return { displayName: respondent.display_name, responses: [] };
  }

  const slotIds = slotRows.map(s => s.id);
  const placeholders = slotIds.map(() => '?').join(',');
  const responseRows = await TransactionManager.queryAll(db,
    `SELECT slot_id, response FROM scheduling_poll_guest_responses
     WHERE guest_respondent_id = ? AND slot_id IN (${placeholders})`,
    [respondent.id, ...slotIds]
  );

  return {
    displayName: respondent.display_name,
    responses: (responseRows || []).map(r => ({ slotId: r.slot_id, response: r.response }))
  };
}

/**
 * Public-safe poll view for guests.
 */
async function getGuestPollView(db, token, { guestSessionToken } = {}) {
  const resolved = await resolveGuestLink(db, token);
  if (!resolved) return null;

  const { pollId, organizationId } = resolved;
  const pollData = await SchedulingService.getPoll(db, { pollId, organizationId });
  if (!pollData) return null;

  const slotIds = pollData.slots.map(s => s.id);
  const guestCountsMap = await getGuestResponseCounts(db, pollId, slotIds);
  const responseCounts = mergeResponseCounts(pollData.responseCounts, guestCountsMap, slotIds);

  let chosenSlot = null;
  if (pollData.chosenSlot) {
    chosenSlot = {
      startAt: pollData.chosenSlot.startAt,
      endAt: pollData.chosenSlot.endAt
    };
  }

  let meeting = null;
  let minutesBlocks = null;
  const meetingRow = await getMeetingForPoll(db, pollId);
  if (meetingRow) {
    meeting = {
      title: meetingRow.title || '',
      scheduledAt: meetingRow.scheduled_at,
      endAt: meetingRow.end_at || null,
      location: meetingRow.location || null,
      meetingLink: meetingRow.meeting_link || null,
      minutesFinalizedAt: meetingRow.minutes_finalized_at || null
    };
    if (meetingRow.minutes_finalized_at) {
      minutesBlocks = await MeetingMinutesService.getPublicFinalizedMinutesBlocks(db, {
        meetingId: meetingRow.id,
        organizationId: meetingRow.organization_id
      });
    }
  }

  const guestSession = await getGuestSession(db, pollId, guestSessionToken);

  return {
    poll: {
      title: pollData.poll.title,
      description: pollData.poll.description,
      status: pollData.poll.status
    },
    slots: pollData.slots.map(s => ({
      id: s.id,
      startAt: s.startAt,
      endAt: s.endAt
    })),
    responseCounts,
    chosenSlot,
    meeting,
    minutesBlocks,
    guestSession
  };
}

/**
 * Save guest availability responses.
 */
async function saveGuestResponses(db, token, { displayName, sessionToken, responses }) {
  const resolved = await resolveGuestLink(db, token);
  if (!resolved) return { error: 'NOT_FOUND' };

  const pollRow = await getPollRow(db, resolved.pollId);
  if (!pollRow || pollRow.status !== 'open') {
    return { error: 'POLL_CLOSED' };
  }

  const slotRows = await TransactionManager.queryAll(db,
    'SELECT id FROM scheduling_poll_slots WHERE scheduling_poll_id = ?',
    [resolved.pollId]
  );
  const validSlotIds = new Set(slotRows.map(r => r.id));
  const valid = (responses || []).filter(r =>
    validSlotIds.has(r.slotId) &&
    ['yes', 'no', 'maybe'].includes(r.response)
  );

  const now = new Date().toISOString();
  let respondentId;
  let newSessionToken;

  if (sessionToken && typeof sessionToken === 'string' && sessionToken.trim()) {
    const existing = await TransactionManager.query(db,
      `SELECT id FROM scheduling_poll_guest_respondents
       WHERE scheduling_poll_id = ? AND session_token = ?`,
      [resolved.pollId, sessionToken.trim()]
    );
    if (existing) {
      respondentId = existing.id;
      newSessionToken = sessionToken.trim();
      await TransactionManager.execute(db,
        `UPDATE scheduling_poll_guest_respondents
         SET display_name = ?, last_seen_at = ? WHERE id = ?`,
        [normalizeDisplayName(displayName), now, respondentId]
      );
    }
  }

  if (!respondentId) {
    respondentId = uuidv4();
    newSessionToken = crypto.randomBytes(32).toString('hex');
    await TransactionManager.execute(db,
      `INSERT INTO scheduling_poll_guest_respondents
       (id, scheduling_poll_id, display_name, session_token, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [respondentId, resolved.pollId, normalizeDisplayName(displayName), newSessionToken, now, now]
    );
  }

  const slotIds = Array.from(validSlotIds);
  if (slotIds.length > 0) {
    const placeholders = slotIds.map(() => '?').join(',');
    await TransactionManager.execute(db,
      `DELETE FROM scheduling_poll_guest_responses
       WHERE guest_respondent_id = ? AND slot_id IN (${placeholders})`,
      [respondentId, ...slotIds]
    );
  }

  for (const r of valid) {
    await TransactionManager.execute(db,
      `INSERT INTO scheduling_poll_guest_responses
       (id, slot_id, guest_respondent_id, response, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uuidv4(), r.slotId, respondentId, r.response, now, now]
    );
  }

  logger.info('guest_poll_response_saved', {
    pollId: resolved.pollId,
    respondentId,
    responseCount: valid.length
  });

  return {
    sessionToken: newSessionToken,
    displayName: normalizeDisplayName(displayName),
    responses: valid.map(r => ({ slotId: r.slotId, response: r.response }))
  };
}

/**
 * Revoke active links and create a new one.
 */
async function regenerateGuestLink(db, pollId) {
  const now = new Date().toISOString();
  await TransactionManager.execute(db,
    `UPDATE scheduling_poll_guest_links
     SET status = 'revoked', revoked_at = ?
     WHERE scheduling_poll_id = ? AND status = 'active'`,
    [now, pollId]
  );
  await TransactionManager.execute(db,
    'UPDATE scheduling_polls SET guest_link_id = NULL, updated_at = ? WHERE id = ?',
    [now, pollId]
  );
  return ensureGuestLink(db, pollId);
}

async function extendGuestLinkExpiryAfterFinalize(db, pollId) {
  const expiresAt = addDays(new Date(), FINALIZED_LINK_EXPIRY_DAYS);
  await TransactionManager.execute(db,
    `UPDATE scheduling_poll_guest_links
     SET expires_at = ?
     WHERE scheduling_poll_id = ? AND status = 'active'`,
    [expiresAt, pollId]
  );
}

/**
 * Guest respondent summaries for member poll view (no session tokens).
 */
async function listGuestRespondentsSummary(db, pollId) {
  const respondents = await TransactionManager.queryAll(db,
    `SELECT id, display_name FROM scheduling_poll_guest_respondents
     WHERE scheduling_poll_id = ? ORDER BY created_at ASC`,
    [pollId]
  );
  if (!respondents.length) return [];

  const slotRows = await TransactionManager.queryAll(db,
    'SELECT id FROM scheduling_poll_slots WHERE scheduling_poll_id = ?',
    [pollId]
  );
  const slotIds = slotRows.map(s => s.id);
  const summaries = [];

  for (const respondent of respondents) {
    let responses = [];
    if (slotIds.length > 0) {
      const placeholders = slotIds.map(() => '?').join(',');
      const rows = await TransactionManager.queryAll(db,
        `SELECT slot_id, response FROM scheduling_poll_guest_responses
         WHERE guest_respondent_id = ? AND slot_id IN (${placeholders})`,
        [respondent.id, ...slotIds]
      );
      responses = (rows || []).map(r => ({ slotId: r.slot_id, response: r.response }));
    }
    summaries.push({
      displayName: respondent.display_name,
      responses
    });
  }
  return summaries;
}

async function getMergedCountsForPoll(db, pollId, organizationId) {
  const pollData = await SchedulingService.getPoll(db, { pollId, organizationId });
  if (!pollData) return null;
  const slotIds = pollData.slots.map(s => s.id);
  const guestCountsMap = await getGuestResponseCounts(db, pollId, slotIds);
  const responseCounts = mergeResponseCounts(pollData.responseCounts, guestCountsMap, slotIds);
  return { ...pollData, responseCounts };
}

module.exports = {
  buildGuestPollUrl,
  ensureGuestLink,
  resolveGuestLink,
  getGuestPollView,
  saveGuestResponses,
  regenerateGuestLink,
  extendGuestLinkExpiryAfterFinalize,
  listGuestRespondentsSummary,
  getMergedCountsForPoll,
  mergeResponseCounts,
  getGuestResponseCounts
};
