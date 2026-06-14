/**
 * CalendarService — Phase 1 Calendar Backend
 * Derives calendar events from documents (deadlines, adopted_at) and representative_elections (phase dates).
 * No new tables; access control via user org membership and document access (buildAccessCheck).
 */

const TransactionManager = require('../database/services/TransactionManager');
const { buildAccessCheck } = require('../utils/documentQueries');
const { logger } = require('../middleware/logger');

/** Document deadline columns we expose as events */
const DOCUMENT_DEADLINE_FIELDS = [
  { column: 'proposal_deadline', type: 'document_proposal_deadline', titleKey: 'Proposal deadline' },
  { column: 'voting_deadline', type: 'document_voting_deadline', titleKey: 'Voting deadline' },
  { column: 'paragraph_proposals_cutoff', type: 'document_paragraph_cutoff', titleKey: 'Paragraph proposals cutoff' },
  { column: 'adopted_at', type: 'document_adopted', titleKey: 'Adopted' }
];

/** Election date columns we expose as events */
const ELECTION_DATE_FIELDS = [
  { column: 'nomination_starts_at', type: 'election_nomination_start', titleKey: 'Nomination starts' },
  { column: 'nomination_ends_at', type: 'election_nomination_end', titleKey: 'Nomination ends' },
  { column: 'voting_starts_at', type: 'election_voting_start', titleKey: 'Voting starts' },
  { column: 'voting_ends_at', type: 'election_voting_end', titleKey: 'Voting ends' }
];

const ALL_DAY_EVENT_TYPES = new Set([
  'document_proposal_deadline',
  'document_voting_deadline',
  'document_paragraph_cutoff',
  'document_adopted',
  'election_nomination_start',
  'election_nomination_end',
  'election_voting_start',
  'election_voting_end'
]);

const AGENDA_MAX_ITEMS = 30;

const MEETING_ALARM_TRIGGERS = ['-PT1H', '-PT15M'];
const DEADLINE_ALARM_TRIGGERS = ['-P1D', '-PT1H'];

/**
 * @param {string} link
 * @param {string} baseUrl
 * @returns {string}
 */
function buildAppUrl(link, baseUrl) {
  if (!link || !baseUrl) return '';
  if (link.startsWith('http')) return link;
  const base = baseUrl.replace(/\/$/, '');
  return base + (link.startsWith('/') ? link : '/' + link);
}

/**
 * @param {string[]} agendaTitles
 * @param {string} [meetingLink]
 * @param {string} [appLink]
 * @param {string} [organizationName]
 * @returns {string}
 */
function buildMeetingDescription({ agendaTitles, meetingLink, appLink, organizationName }) {
  const parts = [];
  if (organizationName) parts.push(organizationName);
  if (agendaTitles && agendaTitles.length > 0) {
    const visible = agendaTitles.slice(0, AGENDA_MAX_ITEMS);
    const lines = visible.map((title, index) => `${index + 1}. ${title}`);
    let agendaBlock = `Agenda:\n${lines.join('\n')}`;
    if (agendaTitles.length > AGENDA_MAX_ITEMS) {
      agendaBlock += `\n…and ${agendaTitles.length - AGENDA_MAX_ITEMS} more`;
    }
    parts.push(agendaBlock);
  }
  if (meetingLink) parts.push(`Join: ${meetingLink}`);
  if (appLink) parts.push(`Open in colabora: ${appLink}`);
  return parts.join('\n\n');
}

/**
 * @param {Object} ev
 * @param {string} [orgName]
 * @param {string} [baseUrl]
 * @returns {string}
 */
function buildEventDescription(ev, orgName, baseUrl) {
  const orgLine = orgName || '';
  const appLink = ev.link ? buildAppUrl(ev.link, baseUrl) : '';
  const docTitle = ev.documentTitle || 'Document';
  const electionTitle = ev.electionTitle || 'Representative election';
  const phaseLabel = ev.phaseLabel || '';

  switch (ev.type) {
    case 'document_proposal_deadline':
      return [orgLine, `Last day to submit proposals for "${docTitle}".`, appLink ? `Open: ${appLink}` : '']
        .filter(Boolean).join('\n');
    case 'document_voting_deadline':
      return [orgLine, `Voting closes for "${docTitle}".`, appLink ? `Open: ${appLink}` : '']
        .filter(Boolean).join('\n');
    case 'document_paragraph_cutoff':
      return [orgLine, `Paragraph proposals cutoff for "${docTitle}".`, appLink ? `Open: ${appLink}` : '']
        .filter(Boolean).join('\n');
    case 'document_adopted':
      return [orgLine, `"${docTitle}" was adopted.`, appLink ? `Open: ${appLink}` : '']
        .filter(Boolean).join('\n');
    case 'election_nomination_start':
    case 'election_nomination_end':
    case 'election_voting_start':
    case 'election_voting_end':
      return [orgLine, `${phaseLabel} for "${electionTitle}".`, appLink ? `Open: ${appLink}` : '']
        .filter(Boolean).join('\n');
    default:
      return ev.description || '';
  }
}

/**
 * @param {Object} db
 * @param {string[]} meetingIds
 * @returns {Promise<Record<string, string[]>>}
 */
async function batchLoadAgendaByMeetingIds(db, meetingIds) {
  if (!meetingIds.length) return {};
  const placeholders = meetingIds.map(() => '?').join(',');
  const rows = await TransactionManager.queryAll(db,
    `SELECT meeting_id, title FROM meeting_agenda_items
     WHERE meeting_id IN (${placeholders})
     ORDER BY meeting_id, order_index ASC, created_at ASC`,
    meetingIds
  );
  const map = {};
  for (const row of rows) {
    if (!map[row.meeting_id]) map[row.meeting_id] = [];
    map[row.meeting_id].push((row.title || '').trim());
  }
  return map;
}

/**
 * @param {Object} db
 * @param {string[]} meetingIds
 * @returns {Promise<Record<string, { location: string|null, meetingLink: string|null, organizationId: string }>>}
 */
async function batchLoadMeetingsByIds(db, meetingIds) {
  if (!meetingIds.length) return {};
  const placeholders = meetingIds.map(() => '?').join(',');
  const rows = await TransactionManager.queryAll(db,
    `SELECT id, organization_id, location, meeting_link FROM meetings WHERE id IN (${placeholders})`,
    meetingIds
  );
  const map = {};
  for (const row of rows) {
    map[row.id] = {
      location: row.location || null,
      meetingLink: row.meeting_link || null,
      organizationId: row.organization_id
    };
  }
  return map;
}

/**
 * @param {Object} db
 * @param {string[]} orgIds
 * @returns {Promise<Record<string, string>>}
 */
async function batchLoadOrgNames(db, orgIds) {
  if (!orgIds.length) return {};
  const placeholders = orgIds.map(() => '?').join(',');
  const rows = await TransactionManager.queryAll(db,
    `SELECT id, name FROM organizations WHERE id IN (${placeholders})`,
    orgIds
  );
  return Object.fromEntries(rows.map(r => [r.id, (r.name || '').trim()]));
}

/**
 * @param {Array} events
 * @param {Object} db
 * @param {string} [baseUrl]
 */
async function enrichEvents(db, events, baseUrl) {
  if (events.length === 0) return events;

  const meetingIds = [...new Set(
    events
      .map(ev => ev.meetingId)
      .filter(Boolean)
  )];

  const [agendaByMeeting, meetingById, orgNames] = await Promise.all([
    batchLoadAgendaByMeetingIds(db, meetingIds),
    batchLoadMeetingsByIds(db, meetingIds),
    batchLoadOrgNames(db, [...new Set(events.map(ev => ev.organizationId).filter(Boolean))])
  ]);

  for (const ev of events) {
    ev.organizationName = orgNames[ev.organizationId] || '';

    if (ev.type === 'meeting' || (ev.type === 'scheduling_poll_finalized' && ev.meetingId)) {
      const meetingId = ev.meetingId;
      const meeting = meetingId ? meetingById[meetingId] : null;
      const agendaTitles = meetingId ? (agendaByMeeting[meetingId] || []) : [];
      const orgId = ev.organizationId || meeting?.organizationId;
      const appLink = buildAppUrl(
        ev.link || (orgId && meetingId ? `#/organization/${orgId}/meetings/${meetingId}` : ''),
        baseUrl
      );

      if (meeting) {
        ev.location = meeting.location || undefined;
        ev.meetingLink = meeting.meetingLink || undefined;
      }

      ev.description = buildMeetingDescription({
        agendaTitles,
        meetingLink: ev.meetingLink,
        appLink,
        organizationName: ev.organizationName
      });
      ev.alarms = MEETING_ALARM_TRIGGERS.map(trigger => ({ trigger, description: 'Meeting starting soon' }));
    } else if (ALL_DAY_EVENT_TYPES.has(ev.type)) {
      ev.description = buildEventDescription(ev, ev.organizationName, baseUrl);
      if (ev.type !== 'document_adopted') {
        ev.alarms = DEADLINE_ALARM_TRIGGERS.map(trigger => ({ trigger, description: ev.title }));
      }
      ev.allDay = true;
    }
  }

  return events;
}

/**
 * Get calendar events for a user in a date range, optionally scoped to one organization.
 * @param {Object} db - Knex/db instance
 * @param {Object} options
 * @param {string} [options.organizationId] - If set, restrict to this org (user must be member).
 * @param {string} options.userId - Current user id.
 * @param {string|Date} options.from - Start of range (ISO date or Date).
 * @param {string|Date} options.to - End of range (ISO date or Date).
 * @param {string} [options.meetingId] - If set, return only events for this meeting.
 * @param {string} [options.baseUrl] - Frontend base URL for description links.
 * @returns {Promise<Array>}
 */
async function getEvents(db, { organizationId, userId, from, to, meetingId, baseUrl }) {
  const fromDate = typeof from === 'string' ? new Date(from) : from;
  const toDate = typeof to === 'string' ? new Date(to) : to;
  const fromParam = fromDate.toISOString();
  const toEndOfDay = new Date(toDate);
  toEndOfDay.setHours(23, 59, 59, 999);
  const toParam = toEndOfDay.toISOString();

  const orgRows = await TransactionManager.queryAll(db,
    'SELECT organization_id FROM organization_members WHERE user_id = ? AND status = ?',
    [userId, 'active']
  );
  const userOrgIds = orgRows.map(r => r.organization_id).filter(Boolean);

  const orgIdsToQuery = organizationId
    ? (userOrgIds.includes(organizationId) ? [organizationId] : [])
    : userOrgIds;

  if (orgIdsToQuery.length === 0) {
    return [];
  }

  if (meetingId) {
    const meetingRow = await TransactionManager.query(db,
      'SELECT id, organization_id FROM meetings WHERE id = ?',
      [meetingId]
    );
    if (!meetingRow || !orgIdsToQuery.includes(meetingRow.organization_id)) {
      return [];
    }
  }

  const documentsQuery = `
    SELECT d.id, d.title, d.organization_id
    FROM documents d
    LEFT JOIN document_collaborators dc ON d.id = dc.document_id AND dc.user_id = ?
    LEFT JOIN organization_members om ON d.organization_id = om.organization_id AND om.user_id = ? AND om.status = 'active'
    LEFT JOIN organizations o ON d.organization_id = o.id AND o.is_active = true
    WHERE ${buildAccessCheck('d')}
      AND d.organization_id IN (${orgIdsToQuery.map(() => '?').join(',')})
  `;
  const documentsParams = [userId, userId, userId, userId, ...orgIdsToQuery];
  const documents = await TransactionManager.queryAll(db, documentsQuery, documentsParams);
  const documentIds = documents.map(d => d.id);
  const docById = Object.fromEntries(documents.map(d => [d.id, d]));

  const events = [];

  if (!meetingId && documentIds.length > 0) {
    const docPlaceholders = documentIds.map(() => '?').join(',');
    for (const { column, type, titleKey } of DOCUMENT_DEADLINE_FIELDS) {
      try {
        const sql = `
          SELECT id, title, organization_id, ${column} as event_at
          FROM documents
          WHERE id IN (${docPlaceholders})
            AND ${column} IS NOT NULL
            AND ${column} >= ?
            AND ${column} <= ?
        `;
        const params = [...documentIds, fromParam, toParam];
        const rows = await TransactionManager.queryAll(db, sql, params);
        for (const row of rows) {
          const doc = docById[row.id];
          const docTitle = (doc?.title || row.title || 'Document').trim();
          const eventAt = row.event_at instanceof Date ? row.event_at : new Date(row.event_at);
          const startIso = eventAt.toISOString();
          events.push({
            id: `doc-${row.id}-${type}`,
            type,
            title: `${titleKey}: ${docTitle}`,
            start: startIso,
            end: startIso,
            organizationId: row.organization_id,
            documentId: row.id,
            documentTitle: docTitle,
            phaseLabel: titleKey,
            link: `#/documents/${row.id}`
          });
        }
      } catch (err) {
        logger.warn('CalendarService: document deadline query failed', { column, error: err.message });
      }
    }
  }

  if (!meetingId) {
    const orgPlaceholders = orgIdsToQuery.map(() => '?').join(',');
    const electionSql = `
      SELECT id, organization_id, election_title,
        nomination_starts_at, nomination_ends_at, voting_starts_at, voting_ends_at
      FROM representative_elections
      WHERE organization_id IN (${orgPlaceholders})
    `;
    let electionRows = [];
    try {
      electionRows = await TransactionManager.queryAll(db, electionSql, orgIdsToQuery);
    } catch (err) {
      logger.warn('CalendarService: elections query failed', { error: err.message });
    }

    for (const row of electionRows) {
      const electionTitle = row.election_title || 'Representative election';
      for (const { column, type, titleKey } of ELECTION_DATE_FIELDS) {
        const eventAt = row[column];
        if (eventAt == null) continue;
        const d = eventAt instanceof Date ? eventAt : new Date(eventAt);
        if (d < fromDate || d > toEndOfDay) continue;
        const startIso = d.toISOString();
        events.push({
          id: `election-${row.id}-${type}`,
          type,
          title: `${titleKey}: ${electionTitle}`,
          start: startIso,
          end: startIso,
          organizationId: row.organization_id,
          electionId: row.id,
          electionTitle,
          phaseLabel: titleKey,
          link: `#/organization/${row.organization_id}/representatives`
        });
      }
    }
  }

  if (!meetingId) {
    try {
      const openPollPlaceholders = orgIdsToQuery.map(() => '?').join(',');
      const openPollRows = await TransactionManager.queryAll(db, `
        SELECT sp.id, sp.organization_id, sp.title, sp.response_deadline
        FROM scheduling_polls sp
        WHERE sp.organization_id IN (${openPollPlaceholders})
          AND sp.status = 'open'
          AND sp.response_deadline IS NOT NULL
          AND sp.response_deadline >= ?
          AND sp.response_deadline <= ?
      `, [...orgIdsToQuery, fromParam, toParam]);
      for (const row of openPollRows) {
        const deadlineIso = (row.response_deadline instanceof Date
          ? row.response_deadline
          : new Date(row.response_deadline)).toISOString();
        events.push({
          id: `poll-deadline-${row.id}`,
          type: 'scheduling_poll_participation_deadline',
          title: `Respond: ${(row.title || 'Poll').trim()}`,
          start: deadlineIso,
          end: deadlineIso,
          organizationId: row.organization_id,
          schedulingPollId: row.id,
          link: `#/organization/${row.organization_id}/schedule/polls/${row.id}`
        });
      }
    } catch (err) {
      logger.warn('CalendarService: open scheduling poll deadlines query failed', { error: err.message });
    }
  }

  try {
    const meetingPlaceholders = orgIdsToQuery.map(() => '?').join(',');
    let meetingSql = `
      SELECT id, organization_id, title, scheduled_at, end_at, location, meeting_link
      FROM meetings
      WHERE organization_id IN (${meetingPlaceholders})
        AND scheduled_at >= ?
        AND scheduled_at <= ?
    `;
    const meetingParams = [...orgIdsToQuery, fromParam, toParam];
    if (meetingId) {
      meetingSql += ' AND id = ?';
      meetingParams.push(meetingId);
    }
    const meetingRows = await TransactionManager.queryAll(db, meetingSql, meetingParams);
    for (const row of meetingRows) {
      const startIso = (row.scheduled_at instanceof Date ? row.scheduled_at : new Date(row.scheduled_at)).toISOString();
      const endIso = row.end_at
        ? (row.end_at instanceof Date ? row.end_at : new Date(row.end_at)).toISOString()
        : startIso;
      events.push({
        id: `meeting-${row.id}`,
        type: 'meeting',
        title: (row.title || 'Meeting').trim(),
        start: startIso,
        end: endIso,
        organizationId: row.organization_id,
        meetingId: row.id,
        location: row.location || undefined,
        meetingLink: row.meeting_link || undefined,
        link: `#/organization/${row.organization_id}/meetings/${row.id}`
      });
    }
  } catch (err) {
    logger.warn('CalendarService: meetings query failed', { error: err.message });
  }

  if (!meetingId) {
    try {
      const pollPlaceholders = orgIdsToQuery.map(() => '?').join(',');
      const pollSql = `
        SELECT sp.id, sp.organization_id, sp.title, sp.chosen_slot_id,
          sl.start_at, sl.end_at,
          m.id AS meeting_id
        FROM scheduling_polls sp
        INNER JOIN scheduling_poll_slots sl ON sl.id = sp.chosen_slot_id AND sl.scheduling_poll_id = sp.id
        LEFT JOIN meetings m ON m.created_from_scheduling_poll_id = sp.id
        WHERE sp.organization_id IN (${pollPlaceholders})
          AND sp.status = 'finalized'
          AND sp.chosen_slot_id IS NOT NULL
          AND sl.start_at >= ?
          AND sl.start_at <= ?
      `;
      const pollParams = [...orgIdsToQuery, fromParam, toParam];
      const pollRows = await TransactionManager.queryAll(db, pollSql, pollParams);
      for (const row of pollRows) {
        const startIso = (row.start_at instanceof Date ? row.start_at : new Date(row.start_at)).toISOString();
        const endIso = row.end_at
          ? (row.end_at instanceof Date ? row.end_at : new Date(row.end_at)).toISOString()
          : startIso;
        const event = {
          id: `poll-${row.id}`,
          type: 'scheduling_poll_finalized',
          title: (row.title || 'Scheduled').trim(),
          start: startIso,
          end: endIso,
          organizationId: row.organization_id,
          schedulingPollId: row.id,
          link: `#/organization/${row.organization_id}/schedule`
        };
        if (row.meeting_id) {
          event.meetingId = row.meeting_id;
          event.link = `#/organization/${row.organization_id}/meetings/${row.meeting_id}`;
        }
        events.push(event);
      }
    } catch (err) {
      logger.warn('CalendarService: scheduling polls query failed', { error: err.message });
    }
  }

  events.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  await enrichEvents(db, events, baseUrl || '');

  if (meetingId) {
    return events.filter(ev => ev.meetingId === meetingId);
  }

  return events;
}

/**
 * Verify user is an active member of the organization.
 * @param {Object} db
 * @param {string} userId
 * @param {string} organizationId
 * @returns {Promise<boolean>}
 */
async function userHasOrgAccess(db, userId, organizationId) {
  const row = await TransactionManager.query(db,
    'SELECT organization_id FROM organization_members WHERE user_id = ? AND organization_id = ? AND status = ?',
    [userId, organizationId, 'active']
  );
  return !!row;
}

/**
 * Resolve a single calendar event by its stable id (e.g. meeting-{uuid}, doc-{id}-document_voting_deadline).
 * @param {Object} db
 * @param {Object} opts
 * @param {string} opts.eventId
 * @param {string} opts.organizationId
 * @param {string} opts.userId
 * @param {string} [opts.baseUrl]
 * @returns {Promise<Object|null>}
 */
async function resolveEventById(db, { eventId, organizationId, userId, baseUrl }) {
  if (!eventId || !organizationId || !userId) return null;
  if (!(await userHasOrgAccess(db, userId, organizationId))) return null;

  let event = null;

  const meetingMatch = eventId.match(/^meeting-(.+)$/);
  if (meetingMatch) {
    const row = await TransactionManager.query(db,
      `SELECT id, organization_id, title, scheduled_at, end_at, location, meeting_link
       FROM meetings WHERE id = ? AND organization_id = ?`,
      [meetingMatch[1], organizationId]
    );
    if (row) {
      const startIso = (row.scheduled_at instanceof Date ? row.scheduled_at : new Date(row.scheduled_at)).toISOString();
      const endIso = row.end_at
        ? (row.end_at instanceof Date ? row.end_at : new Date(row.end_at)).toISOString()
        : startIso;
      event = {
        id: `meeting-${row.id}`,
        type: 'meeting',
        title: (row.title || 'Meeting').trim(),
        start: startIso,
        end: endIso,
        organizationId: row.organization_id,
        meetingId: row.id,
        location: row.location || undefined,
        meetingLink: row.meeting_link || undefined,
        link: `#/organization/${row.organization_id}/meetings/${row.id}`
      };
    }
  }

  const docMatch = eventId.match(/^doc-(.+)-(document_proposal_deadline|document_voting_deadline|document_paragraph_cutoff|document_adopted)$/);
  if (!event && docMatch) {
    const docId = docMatch[1];
    const type = docMatch[2];
    const field = DOCUMENT_DEADLINE_FIELDS.find(f => f.type === type);
    if (field) {
      const row = await TransactionManager.query(db, `
        SELECT d.id, d.title, d.organization_id, d.${field.column} as event_at
        FROM documents d
        LEFT JOIN document_collaborators dc ON d.id = dc.document_id AND dc.user_id = ?
        LEFT JOIN organization_members om ON d.organization_id = om.organization_id AND om.user_id = ? AND om.status = 'active'
        LEFT JOIN organizations o ON d.organization_id = o.id AND o.is_active = true
        WHERE d.id = ? AND d.organization_id = ?
          AND ${buildAccessCheck('d')}
          AND d.${field.column} IS NOT NULL
      `, [userId, userId, userId, userId, docId, organizationId]);
      if (row?.event_at) {
        const eventAt = row.event_at instanceof Date ? row.event_at : new Date(row.event_at);
        const startIso = eventAt.toISOString();
        const docTitle = (row.title || 'Document').trim();
        event = {
          id: `doc-${row.id}-${type}`,
          type,
          title: `${field.titleKey}: ${docTitle}`,
          start: startIso,
          end: startIso,
          organizationId: row.organization_id,
          documentId: row.id,
          documentTitle: docTitle,
          phaseLabel: field.titleKey,
          link: `#/documents/${row.id}`
        };
      }
    }
  }

  const electionMatch = eventId.match(/^election-(.+)-(election_nomination_start|election_nomination_end|election_voting_start|election_voting_end)$/);
  if (!event && electionMatch) {
    const electionId = electionMatch[1];
    const type = electionMatch[2];
    const field = ELECTION_DATE_FIELDS.find(f => f.type === type);
    if (field) {
      const row = await TransactionManager.query(db,
        `SELECT id, organization_id, election_title, ${field.column} as event_at
         FROM representative_elections WHERE id = ? AND organization_id = ?`,
        [electionId, organizationId]
      );
      if (row?.event_at) {
        const eventAt = row.event_at instanceof Date ? row.event_at : new Date(row.event_at);
        const startIso = eventAt.toISOString();
        const electionTitle = row.election_title || 'Representative election';
        event = {
          id: `election-${row.id}-${type}`,
          type,
          title: `${field.titleKey}: ${electionTitle}`,
          start: startIso,
          end: startIso,
          organizationId: row.organization_id,
          electionId: row.id,
          electionTitle,
          phaseLabel: field.titleKey,
          link: `#/organization/${row.organization_id}/representatives`
        };
      }
    }
  }

  const pollMatch = eventId.match(/^poll-(.+)$/);
  if (!event && pollMatch) {
    const row = await TransactionManager.query(db, `
      SELECT sp.id, sp.organization_id, sp.title, sl.start_at, sl.end_at, m.id AS meeting_id
      FROM scheduling_polls sp
      INNER JOIN scheduling_poll_slots sl ON sl.id = sp.chosen_slot_id AND sl.scheduling_poll_id = sp.id
      LEFT JOIN meetings m ON m.created_from_scheduling_poll_id = sp.id
      WHERE sp.id = ? AND sp.organization_id = ?
        AND sp.status = 'finalized'
        AND sp.chosen_slot_id IS NOT NULL
    `, [pollMatch[1], organizationId]);
    if (row) {
      const startIso = (row.start_at instanceof Date ? row.start_at : new Date(row.start_at)).toISOString();
      const endIso = row.end_at
        ? (row.end_at instanceof Date ? row.end_at : new Date(row.end_at)).toISOString()
        : startIso;
      event = {
        id: `poll-${row.id}`,
        type: 'scheduling_poll_finalized',
        title: (row.title || 'Scheduled').trim(),
        start: startIso,
        end: endIso,
        organizationId: row.organization_id,
        schedulingPollId: row.id,
        link: `#/organization/${row.organization_id}/schedule`
      };
      if (row.meeting_id) {
        event.meetingId = row.meeting_id;
        event.link = `#/organization/${row.organization_id}/meetings/${row.meeting_id}`;
      }
    }
  }

  if (!event) return null;
  await enrichEvents(db, [event], baseUrl || '');
  return event;
}

/**
 * Escape text for iCal SUMMARY/DESCRIPTION (RFC 5545): backslash, semicolon, comma, newline.
 * @param {string} s
 * @returns {string}
 */
function escapeIcalText(s) {
  if (s == null) return '';
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

/**
 * Fold a content line per RFC 5545 §3.1 (75 octets).
 * @param {string} line
 * @returns {string}
 */
function foldIcalLine(line) {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line;
  const chunks = [];
  let current = '';
  for (const char of line) {
    const next = current + char;
    if (Buffer.byteLength(next, 'utf8') > 75) {
      chunks.push(current);
      current = char;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks.map((chunk, index) => (index === 0 ? chunk : ' ' + chunk)).join('\r\n');
}

/**
 * @param {string} name
 * @param {string} value
 * @returns {string}
 */
function formatIcalProperty(name, value) {
  return foldIcalLine(`${name}:${value}`);
}

/**
 * @param {string} iso
 * @param {string} [timeZone]
 * @returns {{ year: string, month: string, day: string, hour: string, minute: string, second: string }}
 */
function getZonedParts(iso, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = fmt.formatToParts(new Date(iso));
  const get = (type) => parts.find(p => p.type === type)?.value || '00';
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second')
  };
}

/**
 * Format a date for iCal DTSTART/DTEND (UTC datetime YYYYMMDDTHHmmssZ).
 * @param {string} iso
 * @returns {string}
 */
function toIcalDate(iso) {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  const sec = String(d.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${day}T${h}${min}${sec}Z`;
}

/**
 * @param {string} iso
 * @param {string} timeZone
 * @returns {string}
 */
function toIcalLocalDateTime(iso, timeZone) {
  const p = getZonedParts(iso, timeZone);
  return `${p.year}${p.month}${p.day}T${p.hour}${p.minute}${p.second}`;
}

/**
 * @param {string} iso
 * @param {string} timeZone
 * @returns {string}
 */
function toIcalLocalDate(iso, timeZone) {
  const p = getZonedParts(iso, timeZone);
  return `${p.year}${p.month}${p.day}`;
}

/**
 * @param {string} icalDate - YYYYMMDD
 * @returns {string}
 */
function addOneDayToIcalDate(icalDate) {
  const y = parseInt(icalDate.slice(0, 4), 10);
  const m = parseInt(icalDate.slice(4, 6), 10) - 1;
  const d = parseInt(icalDate.slice(6, 8), 10);
  const next = new Date(Date.UTC(y, m, d + 1));
  const ny = next.getUTCFullYear();
  const nm = String(next.getUTCMonth() + 1).padStart(2, '0');
  const nd = String(next.getUTCDate()).padStart(2, '0');
  return `${ny}${nm}${nd}`;
}

/**
 * @param {string} [timeZone]
 * @returns {boolean}
 */
function isValidIanaTimezone(timeZone) {
  if (!timeZone || typeof timeZone !== 'string') return false;
  try {
    Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate RFC 5545 iCalendar content from events.
 * @param {Array} events
 * @param {Object} [options]
 * @param {string} [options.productId]
 * @param {string} [options.baseUrl]
 * @param {string} [options.calendarName]
 * @param {string} [options.timezone]
 * @returns {string}
 */
function toIcal(events, options = {}) {
  const productId = options.productId || '-//colabora//Calendar//EN';
  const timeZone = isValidIanaTimezone(options.timezone) ? options.timezone : null;
  const now = toIcalDate(new Date().toISOString());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:' + productId,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH'
  ];

  if (options.calendarName) {
    lines.push(formatIcalProperty('X-WR-CALNAME', escapeIcalText(options.calendarName)));
  }
  lines.push('REFRESH-INTERVAL;VALUE=DURATION:PT6H');
  lines.push('X-PUBLISHED-TTL:PT6H');

  for (const ev of events) {
    const uid = ev.id + '@colabora';
    const summary = escapeIcalText(ev.title);
    const useAllDay = ev.allDay === true;
    const useLocalTz = !useAllDay && timeZone;

    let dtStartLine;
    let dtEndLine;
    if (useAllDay) {
      const startDate = timeZone ? toIcalLocalDate(ev.start, timeZone) : toIcalDate(ev.start).slice(0, 8);
      const endDate = addOneDayToIcalDate(startDate);
      dtStartLine = formatIcalProperty('DTSTART;VALUE=DATE', startDate);
      dtEndLine = formatIcalProperty('DTEND;VALUE=DATE', endDate);
    } else if (useLocalTz) {
      dtStartLine = formatIcalProperty(`DTSTART;TZID=${timeZone}`, toIcalLocalDateTime(ev.start, timeZone));
      dtEndLine = formatIcalProperty(
        `DTEND;TZID=${timeZone}`,
        toIcalLocalDateTime(ev.end || ev.start, timeZone)
      );
    } else {
      dtStartLine = formatIcalProperty('DTSTART', toIcalDate(ev.start));
      dtEndLine = formatIcalProperty('DTEND', toIcalDate(ev.end || ev.start));
    }

    lines.push('BEGIN:VEVENT');
    lines.push(formatIcalProperty('UID', uid));
    lines.push(formatIcalProperty('DTSTAMP', now));
    lines.push(dtStartLine);
    lines.push(dtEndLine);
    lines.push(formatIcalProperty('SUMMARY', summary));

    if (ev.description) {
      lines.push(formatIcalProperty('DESCRIPTION', escapeIcalText(ev.description)));
    }
    if (ev.location) {
      lines.push(formatIcalProperty('LOCATION', escapeIcalText(ev.location)));
    }

    const eventUrl = ev.meetingLink || (ev.link ? buildAppUrl(ev.link, options.baseUrl) : '');
    if (eventUrl) {
      lines.push(formatIcalProperty('URL', eventUrl));
    }

    if (ev.alarms && ev.alarms.length > 0) {
      for (const alarm of ev.alarms) {
        lines.push('BEGIN:VALARM');
        lines.push(formatIcalProperty('TRIGGER', alarm.trigger));
        lines.push('ACTION:DISPLAY');
        lines.push(formatIcalProperty('DESCRIPTION', escapeIcalText(alarm.description || ev.title)));
        lines.push('END:VALARM');
      }
    }

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

/**
 * Load user timezone preference from users table.
 * @param {Object} db
 * @param {string} userId
 * @returns {Promise<string|null>}
 */
async function getUserTimezone(db, userId) {
  try {
    const row = await TransactionManager.query(db,
      'SELECT preferences FROM users WHERE id = ?',
      [userId]
    );
    if (!row?.preferences) return null;
    const prefs = typeof row.preferences === 'string'
      ? JSON.parse(row.preferences)
      : row.preferences;
    const tz = prefs?.timezone;
    return isValidIanaTimezone(tz) ? tz : null;
  } catch {
    return null;
  }
}

module.exports = {
  getEvents,
  resolveEventById,
  toIcal,
  escapeIcalText,
  foldIcalLine,
  toIcalDate,
  buildMeetingDescription,
  buildEventDescription,
  getUserTimezone,
  AGENDA_MAX_ITEMS
};
