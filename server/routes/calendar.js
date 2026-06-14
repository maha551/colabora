const express = require('express');
const crypto = require('crypto');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { getUserId } = require('../utils/routeHelpers');
const { getUserOrganizationStatus } = require('../utils/permissionUtils');
const CalendarService = require('../services/CalendarService');
const TransactionManager = require('../database/services/TransactionManager');
const config = require('../config');

const router = express.Router();

const CALENDAR_TOKEN_SEPARATOR = '|';
const CALENDAR_TOKEN_EXPIRY_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

/**
 * Create a signed token for iCal subscription (no DB).
 * Payload: userId|organizationId|expiry (expiry as ISO string).
 */
function createCalendarToken(userId, organizationId, expiresInMs = CALENDAR_TOKEN_EXPIRY_MS) {
  const expiry = Date.now() + expiresInMs;
  const payload = [userId, organizationId || '', expiry].join(CALENDAR_TOKEN_SEPARATOR);
  const hmac = crypto.createHmac('sha256', config.JWT_SECRET);
  hmac.update(payload);
  const sig = hmac.digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

/**
 * Verify calendar token; returns { userId, organizationId, expiresAt } or null.
 */
function verifyCalendarToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const [payload, sig] = decoded.split(':');
    if (!payload || !sig) return null;
    const expected = crypto.createHmac('sha256', config.JWT_SECRET).update(payload).digest('hex');
    const sigBuf = Buffer.from(sig, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      const [userId, organizationId, expiryStr] = payload.split(CALENDAR_TOKEN_SEPARATOR);
      const expiry = parseInt(expiryStr, 10);
      if (Number.isNaN(expiry) || Date.now() > expiry) return null;
      return {
        userId,
        organizationId: organizationId || undefined,
        expiresAt: new Date(expiry).toISOString()
      };
    }
  } catch (_) {
    // ignore
  }
  return null;
}

function parseDateParam(value) {
  if (value == null || value === '') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Require org member when organizationId is in query (used by calendar routes with query params).
 */
async function requireOrgMemberIfOrganizationId(db, userId, organizationId) {
  if (!organizationId) return;
  const status = await getUserOrganizationStatus(db, userId, organizationId, null);
  const hasAccess = status.isRepresentative || status.isActiveMember || status.isAdmin;
  if (!hasAccess) {
    throw ApiError.forbidden('You must be a member of this organization to access this calendar', 'MEMBERSHIP_REQUIRED');
  }
}

async function getOrganizationName(db, organizationId) {
  if (!organizationId) return null;
  const row = await TransactionManager.query(db, 'SELECT name FROM organizations WHERE id = ?', [organizationId]);
  return row?.name ? String(row.name).trim() : null;
}

async function validateMeetingInOrg(db, meetingId, organizationId) {
  const row = await TransactionManager.query(db,
    'SELECT id, organization_id FROM meetings WHERE id = ?',
    [meetingId]
  );
  if (!row) {
    throw ApiError.notFound('Meeting not found', 'MEETING_NOT_FOUND');
  }
  if (organizationId && row.organization_id !== organizationId) {
    throw ApiError.validation('Meeting does not belong to this organization', null, 'VALIDATION_ERROR');
  }
  return row;
}

/**
 * GET /api/calendar
 * Query: organizationId (optional), from (required, ISO date), to (required, ISO date), meetingId (optional).
 */
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const userId = getUserId(req);
  const organizationId = req.query.organizationId || undefined;
  const meetingId = req.query.meetingId || undefined;
  const from = parseDateParam(req.query.from);
  const to = parseDateParam(req.query.to);

  if (!from || !to) {
    throw ApiError.validation('Query parameters "from" and "to" (ISO dates) are required', null, 'VALIDATION_ERROR');
  }
  if (from > to) {
    throw ApiError.validation('"from" must be before or equal to "to"', null, 'VALIDATION_ERROR');
  }

  await requireOrgMemberIfOrganizationId(db, userId, organizationId);
  if (meetingId) {
    await validateMeetingInOrg(db, meetingId, organizationId);
  }

  const baseUrl = config.FRONTEND_URL || '';
  const events = await CalendarService.getEvents(db, {
    organizationId,
    userId,
    from,
    to,
    meetingId,
    baseUrl
  });
  res.json({ events });
}));

/** Middleware: if valid calendar token in query, set req.calendarUserId and req.calendarOrganizationId. */
function optionalCalendarToken(req, res, next) {
  const payload = verifyCalendarToken(req.query.token);
  if (payload) {
    req.calendarUserId = payload.userId;
    req.calendarOrganizationId = payload.organizationId;
    req.calendarTokenExpiresAt = payload.expiresAt;
  }
  next();
}

/** Middleware: require auth only when no calendar token was set. */
function requireAuthUnlessCalendarToken(req, res, next) {
  if (req.calendarUserId) return next();
  return requireAuth(req, res, next);
}

/**
 * GET /api/calendar/ical/subscribe-url
 * Returns a subscription URL containing a long-lived token (for use in calendar clients).
 */
router.get('/ical/subscribe-url', requireAuth, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const userId = getUserId(req);
  const organizationId = req.query.organizationId || undefined;

  await requireOrgMemberIfOrganizationId(db, userId, organizationId);

  const token = createCalendarToken(userId, organizationId);
  const expiresAt = new Date(Date.now() + CALENDAR_TOKEN_EXPIRY_MS).toISOString();
  const origin = req.protocol + '://' + req.get('host');
  const apiPath = (req.app.locals.apiBasePath || '/api').replace(/\/$/, '');
  const url = `${origin}${apiPath}/calendar/ical?token=${encodeURIComponent(token)}${organizationId ? '&organizationId=' + encodeURIComponent(organizationId) : ''}`;

  res.json({ url, expiresAt });
}));

/**
 * GET /api/calendar/ical
 * Query: organizationId (optional), from, to (optional), token (optional), meetingId (optional).
 */
router.get('/ical', optionalCalendarToken, requireAuthUnlessCalendarToken, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const userId = req.calendarUserId || getUserId(req);
  let organizationId = req.query.organizationId !== undefined ? req.query.organizationId : req.calendarOrganizationId;
  if (organizationId === '') organizationId = undefined;
  const meetingId = req.query.meetingId || undefined;

  if (!req.calendarUserId) {
    await requireOrgMemberIfOrganizationId(db, userId, organizationId);
  } else if (req.calendarOrganizationId !== undefined && organizationId === undefined) {
    organizationId = req.calendarOrganizationId;
  }

  if (meetingId) {
    await validateMeetingInOrg(db, meetingId, organizationId);
  }

  const fromParam = parseDateParam(req.query.from);
  const toParam = parseDateParam(req.query.to);
  const from = fromParam || new Date();
  const to = toParam || (() => { const t = new Date(); t.setFullYear(t.getFullYear() + 1); return t; })();

  const baseUrl = config.FRONTEND_URL || '';
  const events = await CalendarService.getEvents(db, {
    organizationId,
    userId,
    from,
    to,
    meetingId,
    baseUrl
  });

  const timezone = await CalendarService.getUserTimezone(db, userId);
  const orgName = organizationId ? await getOrganizationName(db, organizationId) : null;
  const calendarName = orgName
    ? `colabora — ${orgName}`
    : 'colabora — All organizations';

  const ical = CalendarService.toIcal(events, {
    productId: '-//colabora//Calendar//EN',
    baseUrl,
    calendarName,
    timezone
  });

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  const filename = meetingId ? `meeting-${meetingId}.ics` : 'calendar.ics';
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(ical);
}));

module.exports = router;
