const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { exportToPDF, exportToMarkdown, exportToWord, exportMinutesToPDF, exportMinutesToMarkdown, exportMinutesToWord } = require('../modules/export');
const { logger } = require('../middleware/logger');
const TransactionManager = require('../database/services/TransactionManager');
const { getUserId } = require('../utils/routeHelpers');
const MeetingMinutesService = require('../services/MeetingMinutesService');

/**
 * Helper function to check document access (reused from documents.js)
 */
async function getDocumentWithAccess(db, documentId, userId) {
  const { buildOwnerJoin, buildOwnerSelect, buildAccessCheck } = require('../utils/documentQueries');
  
  const accessQuery = `
    SELECT d.id, d.title, d.description, d.owner_id, d.ownership_type, d.organization_id, 
      d.parent_id, d.sort_order, d.status, d.proposal_deadline, d.voting_deadline, 
      d.paragraph_proposals_cutoff, d.voting_started_at, d.min_voters_required, d.adopted_at, 
      d.deletion_proposed_at, d.acceptance_threshold, d.voting_anonymous, d.voting_anonymity_locked, 
      d.vote_change_allowed, d.structure_proposals_enabled, d.amendments_open, d.created_at, d.updated_at,
      d.document_kind, d.meeting_id,
      ${buildOwnerSelect('d')}
    FROM documents d
    ${buildOwnerJoin('d')}
    LEFT JOIN document_collaborators dc ON d.id = dc.document_id AND dc.user_id = ?
    LEFT JOIN organization_members om ON d.organization_id = om.organization_id AND om.user_id = ? AND om.status = 'active'
    LEFT JOIN organizations o ON d.organization_id = o.id AND o.is_active = true
    WHERE d.id = ? 
      AND ${buildAccessCheck('d')}
  `;

  // Parameters: userId (dc JOIN), userId (om JOIN), documentId, userId (owner check), userId (dc check)
  try {
    const document = await TransactionManager.query(db, accessQuery, [userId, userId, documentId, userId, userId]);
    return document;
  } catch (err) {
    throw err;
  }
}

/**
 * Helper function to get document paragraphs
 */
async function getDocumentParagraphs(db, documentId) {
  const query = `
    SELECT 
      p.id,
      p.text,
      p.heading_level,
      p.order_index,
      p.created_at,
      p.updated_at
    FROM paragraphs p
    WHERE p.document_id = ?
    ORDER BY p.order_index ASC, p.created_at ASC
  `;

  try {
    const rows = await TransactionManager.queryAll(db, query, [documentId]);
    return rows;
  } catch (err) {
    throw err;
  }
}

/**
 * Get agreed view paragraphs for export (history-based content)
 * For agreed documents, uses approved history; optionally includes pending amendments
 */
async function getAgreedParagraphsForExport(db, documentId, document, includePending) {
  const { safeJsonParse } = require('../utils/jsonUtils');
  const threshold = document.acceptance_threshold != null ? document.acceptance_threshold : 75.0;
  let agreedViewQuery = `
    SELECT p.id, p.order_index, p.title, p.text,
      (
        SELECT json_agg(
          json_build_object(
            'new_text', h.new_text,
            'heading_level', h.heading_level,
            'approval_percentage', h.approval_percentage,
            'proposal_type', pr_h.type
          ) ORDER BY h.created_at DESC
        )
        FROM history h
        LEFT JOIN proposals pr_h ON h.proposal_id = pr_h.id
        WHERE h.paragraph_id = p.id
          AND h.approval_percentage IS NOT NULL
          AND h.approval_percentage >= ?
      ) as history_json
    FROM paragraphs p
    WHERE p.document_id = ?
    ORDER BY p.order_index ASC, p.created_at ASC
  `;
  const rows = await TransactionManager.queryAll(db, agreedViewQuery, [threshold, documentId]);
  const result = [];
  for (const row of rows) {
    let text = row.title || row.text || '';
    let headingLevel = row.heading_level;
    let history = [];
    if (row.history_json && row.history_json !== '[null]' && row.history_json !== 'null') {
      try {
        const raw = typeof row.history_json === 'string' ? safeJsonParse(row.history_json, []) : (row.history_json || []);
        history = Array.isArray(raw) ? raw : [];
      } catch (_) { history = []; }
    }
    if (history.length > 0) {
      const top = history[0];
      text = top.new_text || text;
      headingLevel = top.heading_level || (top.proposal_type === 'TITLE' ? 'h1' : null);
    }
    if (includePending && document.amendments_open === 1) {
      const { resolveThresholdMetAmendmentForParagraph } = require('../services/DocumentService');
      const VoterManager = require('../modules/voting');
      const eligibleVoters = await VoterManager.getEligibleVoterCount(db, documentId);
      let calculationMethod = 'all_members';
      if (document.organization_id) {
        try {
          const governanceModule = require('./governance');
          const governanceRules = await governanceModule.getGovernanceRules(db, document.organization_id);
          calculationMethod = governanceRules?.thresholdCalculationMethod || 'all_members';
        } catch (_) { /* use default */ }
      }
      const pending = await resolveThresholdMetAmendmentForParagraph(db, row.id, document, {
        eligibleVoters,
        calculationMethod,
      });
      if (pending) {
        text = pending.text || text;
        headingLevel = pending.heading_level || (pending.type === 'TITLE' ? 'h1' : null);
      }
    }
    result.push({
      id: row.id,
      text,
      heading_level: headingLevel,
      order_index: row.order_index,
      order: row.order_index
    });
  }
  return result;
}

/**
 * Format a meeting minutes event as a readable line for export.
 * Uses same event types as timeline (vote_started, vote_ended, date_decided, document_created, brainstorm_started, etc.).
 * When enriched.schedulingPoll is provided (e.g. for date_decided with schedulingPollId), use poll title and chosen slot.
 */
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
 * Get merged timeline (events + paragraphs) for a meeting minutes document, same order as GET /minutes/timeline.
 * Returns array of { type: 'event', eventLine, orderIndex } | { type: 'paragraph', text, heading_level, order_index }.
 */
async function getMergedMinutesContent(db, { documentId, meetingId, minutesDocumentId, organizationId }) {
  const mid = minutesDocumentId || documentId;
  const { items } = await MeetingMinutesService.getTimeline(db, {
    organizationId: organizationId || null,
    meetingId,
    minutesDocumentId: mid,
    limit: null,
    offset: null
  });
  const merged = [];
  for (const item of items) {
    if (item.type === 'event') {
      const eventLine = formatMinutesEventLine(item.eventType, item.payload, { schedulingPoll: item.schedulingPoll });
      merged.push({
        type: 'event',
        eventLine,
        orderIndex: item.orderIndex
      });
    } else if (item.type === 'paragraph') {
      merged.push({
        type: 'paragraph',
        text: item.text || '',
        heading_level: item.headingLevel || item.heading_level || null,
        order_index: item.orderIndex
      });
    }
  }
  return merged;
}

/**
 * Get rich merged content for minutes export: block list from getTimeline + agenda.
 * Each block is typed: paragraph, vote, brainstorm, topic_heading, or event.
 * Used by minutes-specific export path for full formatting (votes with options/counts, brainstorms with options, agenda as headings).
 */
async function getMergedMinutesContentForExport(db, { organizationId, meetingId, minutesDocumentId }) {
  const { items } = await MeetingMinutesService.getTimeline(db, {
    organizationId: organizationId || null,
    meetingId,
    minutesDocumentId,
    limit: null,
    offset: null
  });
  const agendaItems = await MeetingMinutesService.listAgendaItems(db, { meetingId });
  const agendaById = new Map(agendaItems.map(a => [a.id, a.title || '']));
  const todos = await MeetingMinutesService.listTodos(db, { meetingId });

  // Vote IDs that have a vote_ended event: we emit only that block (skip vote_started for those)
  const voteIdsWithEnded = new Set();
  for (const item of items) {
    if (item.type === 'event' && (item.eventType === 'vote_ended') && item.vote?.id) {
      voteIdsWithEnded.add(item.vote.id);
    }
  }
  const blocks = [];
  // To-dos (collected) at top of document: single block with orderIndex -1 so it sorts first
  if (todos.length > 0) {
    blocks.push({
      type: 'todos_summary',
      orderIndex: -1,
      todos: todos.map(t => ({
        id: t.id,
        title: t.title,
        description: t.description,
        dueDate: t.dueDate,
        status: t.status,
        responsibleUserName: t.responsibleUserName,
        agendaItemId: t.agendaItemId,
        agendaItemTitle: t.agendaItemId ? (agendaById.get(t.agendaItemId) || '') : null
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
      const options = (item.options || []).map(o => ({
        id: o.id,
        label: o.label || '',
        sortOrder: o.sortOrder
      }));
      blocks.push({
        type: 'brainstorm',
        orderIndex: item.orderIndex != null ? item.orderIndex : idx,
        eventType: item.eventType,
        options
      });
      continue;
    }
    if (item.eventType === 'topic_set') {
      const agendaItemId = item.payload && (item.payload.agendaItemId != null ? item.payload.agendaItemId : item.payload.agenda_item_id);
      const title = agendaItemId != null ? (agendaById.get(agendaItemId) ?? '[Topic no longer available]') : '';
      blocks.push({
        type: 'topic_heading',
        orderIndex: item.orderIndex != null ? item.orderIndex : idx,
        agendaItemId: agendaItemId || null,
        title
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
 * Sanitize filename by removing special characters
 */
function sanitizeFilename(filename) {
  return filename
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Export single document
 * GET /api/export/documents/:id?format=pdf|markdown|docx
 */
router.get('/documents/:id', requireAuth, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const { format = 'pdf', version = 'official' } = req.query;
  const userId = getUserId(req);

  try {
    // Get document with access check
    const document = await getDocumentWithAccess(db, id, userId);
    if (!document) {
      return next(ApiError.notFound('Document', 'DOCUMENT_NOT_FOUND_OR_ACCESS_DENIED'));
    }

    // Get content: for meeting minutes use rich block list and minutes-specific export
    let paragraphs;
    const isMeetingMinutes = document.document_kind === 'meeting_minutes' || document.meeting_id;
    const meetingId = document.meeting_id;

    if (isMeetingMinutes && meetingId) {
      const blocks = await MeetingMinutesService.getMergedMinutesBlocks(db, { organizationId: document.organization_id, meetingId, minutesDocumentId: id });
      let buffer;
      let contentType;
      let filename;
      switch (format) {
        case 'pdf':
          buffer = await exportMinutesToPDF(document, blocks);
          contentType = 'application/pdf';
          filename = `${sanitizeFilename(document.title || 'minutes')}.pdf`;
          break;
        case 'markdown':
          buffer = Buffer.from(exportMinutesToMarkdown(document, blocks), 'utf-8');
          contentType = 'text/markdown';
          filename = `${sanitizeFilename(document.title || 'minutes')}.md`;
          break;
        case 'docx':
          buffer = await exportMinutesToWord(document, blocks);
          contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          filename = `${sanitizeFilename(document.title || 'minutes')}.docx`;
          break;
        default:
          return next(ApiError.validation('Invalid format. Supported formats: pdf, markdown, docx', null, 'INVALID_EXPORT_FORMAT'));
      }
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
      logger.info('Document exported (minutes)', { documentId: id, format, userId, filename });
      return;
    }

    {
      const useAgreedView = document.status === 'agreed';
      const includePending = version === 'with_amendments' && document.amendments_open === 1;
      if (useAgreedView) {
        paragraphs = await getAgreedParagraphsForExport(db, id, document, includePending);
      } else {
        paragraphs = await getDocumentParagraphs(db, id);
      }
    }

    let buffer;
    let contentType;
    let filename;

    switch (format) {
      case 'pdf':
        buffer = await exportToPDF(document, paragraphs);
        contentType = 'application/pdf';
        filename = `${sanitizeFilename(document.title || 'document')}.pdf`;
        break;
      case 'markdown':
        const md = exportToMarkdown(document, paragraphs);
        buffer = Buffer.from(md, 'utf-8');
        contentType = 'text/markdown';
        filename = `${sanitizeFilename(document.title || 'document')}.md`;
        break;
      case 'docx':
        buffer = await exportToWord(document, paragraphs);
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        filename = `${sanitizeFilename(document.title || 'document')}.docx`;
        break;
      default:
        return next(ApiError.validation('Invalid format. Supported formats: pdf, markdown, docx', null, 'INVALID_EXPORT_FORMAT'));
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
    
    logger.info('Document exported', { 
      documentId: id, 
      format, 
      userId,
      filename 
    });
  } catch (error) {
    // Re-throw ApiError instances
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Export error', { error: error.message, documentId: id, userId, stack: error.stack });
    throw ApiError.database('Export failed', { originalError: error.message }, 'EXPORT_FAILED');
  }
}));

module.exports = router;
