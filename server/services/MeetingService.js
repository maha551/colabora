/**
 * MeetingService — Phase 3 Meetings Backend
 * First-class meetings with optional BBB/Jitsi room link; create from scheduling poll.
 */

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { getHttpsAgent } = require('../utils/httpAgent');
const TransactionManager = require('../database/services/TransactionManager');
const { logger } = require('../middleware/logger');
const config = require('../config');
const SchedulingService = require('./SchedulingService');
const { isRepresentative } = require('../modules/permissions');
const DocumentService = require('./DocumentService');

function rowToMeeting(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    title: row.title,
    scheduledAt: row.scheduled_at,
    endAt: row.end_at != null ? row.end_at : null,
    location: row.location || null,
    meetingLink: row.meeting_link || null,
    meetingProvider: row.meeting_provider || null,
    createdByUserId: row.created_by_user_id,
    createdFromSchedulingPollId: row.created_from_scheduling_poll_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    minutesDocumentId: row.minutes_document_id || null,
    minutesFinalizedAt: row.minutes_finalized_at || null,
    currentAgendaItemId: row.current_agenda_item_id || null
  };
}

/**
 * Create a meeting. Creates minutes document in the same transaction; then optionally createRoom.
 * If createRoom is true and no meetingLink provided, creates room after commit.
 */
async function createMeeting(db, {
  organizationId,
  userId,
  title,
  scheduledAt,
  endAt,
  location,
  meetingLink,
  meetingProvider,
  createRoom,
  createdFromSchedulingPollId
}) {
  const id = uuidv4();
  const now = new Date().toISOString();
  await TransactionManager.executeInTransaction(db, async (trx) => {
    await TransactionManager.execute(trx,
      `INSERT INTO meetings (id, organization_id, title, scheduled_at, end_at, location, meeting_link, meeting_provider, created_by_user_id, created_from_scheduling_poll_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        organizationId,
        title || '',
        scheduledAt,
        endAt || null,
        location || null,
        meetingLink || null,
        meetingProvider || null,
        userId,
        createdFromSchedulingPollId || null,
        now,
        now
      ]
    );
    const minutesResult = await DocumentService.createMinutesDocument(trx, {
      meetingId: id,
      organizationId,
      title: title || 'Meeting',
      userId
    });
    await TransactionManager.execute(trx,
      'UPDATE meetings SET minutes_document_id = ?, updated_at = ? WHERE id = ?',
      [minutesResult.id, now, id]
    );
  });
  let meeting = rowToMeeting(await TransactionManager.query(db, 'SELECT * FROM meetings WHERE id = ?', [id]));
  if (createRoom && !meetingLink) {
    meeting = await createRoom(db, id);
    if (!meeting) meeting = rowToMeeting(await TransactionManager.query(db, 'SELECT * FROM meetings WHERE id = ?', [id]));
  }
  return meeting;
}

/**
 * Create a meeting from a finalized scheduling poll's chosen slot.
 */
async function createMeetingFromSchedulingPoll(db, { organizationId, userId, pollId, title, createRoom }) {
  const result = await SchedulingService.getPoll(db, { pollId, organizationId });
  if (!result || !result.chosenSlot) return null;
  const { startAt, endAt } = result.chosenSlot;
  const pollTitle = result.poll?.title;
  const meetingTitle = (title && title.trim()) ? title.trim() : (pollTitle || 'Meeting');
  return createMeeting(db, {
    organizationId,
    userId,
    title: meetingTitle,
    scheduledAt: startAt,
    endAt,
    createRoom,
    createdFromSchedulingPollId: pollId
  });
}

/**
 * Get moderators for a meeting: creator (from meeting row), org representatives, invited (meeting_moderators).
 * Returns array of { userId, userName, source } with source in ('creator', 'representative', 'invited').
 */
async function getMeetingModerators(db, { meetingId, organizationId }) {
  const meeting = await TransactionManager.query(db,
    'SELECT created_by_user_id FROM meetings WHERE id = ? AND organization_id = ?',
    [meetingId, organizationId]
  );
  if (!meeting) return [];
  const creatorId = meeting.created_by_user_id;
  const seen = new Set();
  const moderators = [];

  if (creatorId) {
    const creatorRow = await TransactionManager.query(db, 'SELECT id, name FROM users WHERE id = ?', [creatorId]);
    if (creatorRow) {
      moderators.push({ userId: creatorRow.id, userName: creatorRow.name || null, source: 'creator' });
      seen.add(creatorId);
    }
  }

  const repRows = await TransactionManager.queryAll(db, `
    SELECT u.id, u.name FROM organization_representatives r
    JOIN users u ON r.user_id = u.id
    WHERE r.organization_id = ? AND r.status = 'active'
  `, [organizationId]);
  for (const r of repRows || []) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    moderators.push({ userId: r.id, userName: r.name || null, source: 'representative' });
  }

  const invitedRows = await TransactionManager.queryAll(db, `
    SELECT mm.user_id, u.name FROM meeting_moderators mm
    JOIN users u ON mm.user_id = u.id
    WHERE mm.meeting_id = ? AND mm.source = 'invited'
  `, [meetingId]);
  for (const r of invitedRows || []) {
    if (seen.has(r.user_id)) continue;
    seen.add(r.user_id);
    moderators.push({ userId: r.user_id, userName: r.name || null, source: 'invited' });
  }

  return moderators;
}

/**
 * Get a single meeting by id and organization, including minutesDocumentId, minutesFinalizedAt, and moderators.
 */
async function getMeeting(db, { meetingId, organizationId }) {
  const row = await TransactionManager.query(db,
    'SELECT * FROM meetings WHERE id = ? AND organization_id = ?',
    [meetingId, organizationId]
  );
  if (!row) return null;
  const meeting = rowToMeeting(row);
  meeting.moderators = await getMeetingModerators(db, { meetingId, organizationId });
  return meeting;
}

/**
 * List meetings for an organization, optionally filtered by date range.
 */
async function listMeetings(db, { organizationId, from, to }) {
  let sql = 'SELECT * FROM meetings WHERE organization_id = ?';
  const params = [organizationId];
  if (from != null) {
    sql += ' AND scheduled_at >= ?';
    params.push(typeof from === 'string' ? from : new Date(from).toISOString());
  }
  if (to != null) {
    const toEnd = new Date(to);
    toEnd.setHours(23, 59, 59, 999);
    sql += ' AND scheduled_at <= ?';
    params.push(toEnd.toISOString());
  }
  sql += ' ORDER BY scheduled_at ASC';
  const rows = await TransactionManager.queryAll(db, sql, params);
  return rows.map(rowToMeeting);
}

/**
 * Update meeting fields. Only provided fields are updated.
 */
async function updateMeeting(db, { meetingId, organizationId, title, scheduledAt, endAt, location, meetingLink }) {
  const existing = await TransactionManager.query(db,
    'SELECT id FROM meetings WHERE id = ? AND organization_id = ?',
    [meetingId, organizationId]
  );
  if (!existing) return null;

  const updates = [];
  const params = [];
  if (title !== undefined) {
    updates.push('title = ?');
    params.push(title);
  }
  if (scheduledAt !== undefined) {
    updates.push('scheduled_at = ?');
    params.push(scheduledAt);
  }
  if (endAt !== undefined) {
    updates.push('end_at = ?');
    params.push(endAt);
  }
  if (location !== undefined) {
    updates.push('location = ?');
    params.push(location);
  }
  if (meetingLink !== undefined) {
    updates.push('meeting_link = ?');
    params.push(meetingLink);
  }
  if (updates.length === 0) {
    const row = await TransactionManager.query(db, 'SELECT * FROM meetings WHERE id = ?', [meetingId]);
    return rowToMeeting(row);
  }
  updates.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(meetingId, organizationId);
  await TransactionManager.execute(db,
    `UPDATE meetings SET ${updates.join(', ')} WHERE id = ? AND organization_id = ?`,
    params
  );
  const row = await TransactionManager.query(db, 'SELECT * FROM meetings WHERE id = ?', [meetingId]);
  return rowToMeeting(row);
}

/**
 * Sanitize room name for Jitsi URL: only alphanumeric and hyphen.
 */
function sanitizeRoomName(str) {
  return String(str).replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'room';
}

/**
 * Build BBB checksum: SHA1(callName + queryString + secret). Query string params sorted alphabetically.
 */
function bbbChecksum(callName, params, secret) {
  const sorted = Object.keys(params).sort();
  const queryString = sorted.map(k => `${k}=${encodeURIComponent(params[k])}`).join('&');
  const toHash = callName + queryString + secret;
  return crypto.createHash('sha1').update(toHash).digest('hex');
}

/**
 * Call BigBlueButton API (create meeting), then build and return join URL.
 * Uses the protocol of BIGBLUEBUTTON_URL (https or http for local/dev).
 */
async function bbbCreateMeetingAndGetJoinUrl(meetingId, title) {
  const baseUrl = (config.BIGBLUEBUTTON_URL || '').replace(/\/$/, '');
  const secret = config.BIGBLUEBUTTON_SECRET;
  if (!baseUrl || !secret) {
    throw new Error('BigBlueButton URL and secret must be set when VIDEO_PROVIDER is bigbluebutton');
  }
  const meetingID = `colabora-${meetingId}`.replace(/[^a-zA-Z0-9-]/g, '-');
  const name = (title || 'Meeting').substring(0, 100);
  const params = { meetingID, name };
  const checksum = bbbChecksum('create', params, secret);
  const createUrl = `${baseUrl}/bigbluebutton/api/create?meetingID=${encodeURIComponent(meetingID)}&name=${encodeURIComponent(name)}&checksum=${checksum}`;

  const isHttps = createUrl.startsWith('https:');
  const requestModule = isHttps ? https : http;
  const requestOptions = isHttps ? { agent: getHttpsAgent() } : {};

  const body = await new Promise((resolve, reject) => {
    const req = requestModule.get(createUrl, requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('BBB create request timeout'));
    });
  });

  const returncodeMatch = body.match(/<returncode>([^<]+)<\/returncode>/);
  if (!returncodeMatch || returncodeMatch[1] !== 'SUCCESS') {
    const messageMatch = body.match(/<messageKey>([^<]*)<\/messageKey>/);
    logger.warn('BBB create failed', { messageKey: messageMatch ? messageMatch[1] : 'unknown', body: body.substring(0, 200) });
    throw new Error('BigBlueButton create meeting failed');
  }
  const moderatorPWMatch = body.match(/<moderatorPW>([^<]+)<\/moderatorPW>/);
  if (!moderatorPWMatch) {
    throw new Error('BigBlueButton did not return moderator password');
  }
  const moderatorPW = moderatorPWMatch[1];
  const fullName = 'Participant';
  const joinParams = { fullName, meetingID, password: moderatorPW };
  const joinChecksum = bbbChecksum('join', joinParams, secret);
  const joinUrl = `${baseUrl}/bigbluebutton/api/join?fullName=${encodeURIComponent(fullName)}&meetingID=${encodeURIComponent(meetingID)}&password=${encodeURIComponent(moderatorPW)}&checksum=${joinChecksum}`;
  return joinUrl;
}

/**
 * Create video room for a meeting (Jitsi or BBB). If meeting already has a link, return meeting unchanged.
 */
async function createRoom(db, meetingId) {
  const row = await TransactionManager.query(db, 'SELECT * FROM meetings WHERE id = ?', [meetingId]);
  if (!row) return null;
  if (row.meeting_link) {
    return rowToMeeting(row);
  }
  const provider = (config.VIDEO_PROVIDER || 'none').toLowerCase();
  if (provider === 'none') {
    throw new Error('Video provider not configured');
  }
  let meetingLink = null;
  let meetingProvider = null;

  if (provider === 'jitsi') {
    const baseUrl = (config.JITSI_MEET_BASE_URL || 'https://meet.jit.si').replace(/\/$/, '');
    const roomName = `colabora-${sanitizeRoomName(row.organization_id)}-${sanitizeRoomName(row.id)}`;
    meetingLink = `${baseUrl}/${roomName}`;
    meetingProvider = 'jitsi';
  } else if (provider === 'bigbluebutton') {
    meetingLink = await bbbCreateMeetingAndGetJoinUrl(row.id, row.title);
    meetingProvider = 'bigbluebutton';
  } else {
    throw new Error('Unsupported video provider: ' + provider);
  }

  const now = new Date().toISOString();
  await TransactionManager.execute(db,
    'UPDATE meetings SET meeting_link = ?, meeting_provider = ?, updated_at = ? WHERE id = ?',
    [meetingLink, meetingProvider, now, meetingId]
  );
  const updated = await TransactionManager.query(db, 'SELECT * FROM meetings WHERE id = ?', [meetingId]);
  return rowToMeeting(updated);
}

/**
 * Check if user can manage the meeting (creator or org representative).
 */
async function canManageMeeting(db, meetingId, organizationId, userId) {
  const row = await TransactionManager.query(db,
    'SELECT created_by_user_id FROM meetings WHERE id = ? AND organization_id = ?',
    [meetingId, organizationId]
  );
  if (!row) return false;
  if (row.created_by_user_id === userId) return true;
  return await isRepresentative(db, userId, organizationId);
}

/**
 * Check if user can moderate the meeting (creator, org representative, or invited moderator).
 * Used by meeting minutes routes for moderator-only actions.
 */
async function canModerateMeeting(db, meetingId, organizationId, userId) {
  const canManage = await canManageMeeting(db, meetingId, organizationId, userId);
  if (canManage) return true;
  const modRow = await TransactionManager.query(db,
    'SELECT id FROM meeting_moderators WHERE meeting_id = ? AND user_id = ?',
    [meetingId, userId]
  );
  return !!modRow;
}

module.exports = {
  createMeeting,
  createMeetingFromSchedulingPoll,
  getMeeting,
  getMeetingModerators,
  listMeetings,
  updateMeeting,
  createRoom,
  canManageMeeting,
  canModerateMeeting,
  rowToMeeting
};
