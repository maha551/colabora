const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth, requireDocumentAccess } = require('../middleware/auth');
const { paragraphValidation } = require('../middleware/validation');
const { logger } = require('../middleware/logger');
const { metricsCollector } = require('../middleware/monitoring');
const webSocketManager = require('../modules/websocket');
const { safeJsonParse, safeJsonParseArray } = require('../utils/jsonUtils');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const TransactionManager = require('../database/services/TransactionManager');
const { getUserId } = require('../utils/routeHelpers');
const MinutesArchiveService = require('../services/MinutesArchiveService');
const config = require('../config');

// Helper function to retry operations with exponential backoff for transient errors
// (Same pattern as server/routes/documents.js:459-506)
async function retryOperation(operation, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 100,
    maxDelay = 2000,
    backoffMultiplier = 2
  } = options;

  let lastError;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      // Only retry on specific SQLite errors or PostgreSQL connection errors
      const retryableErrors = ['SQLITE_BUSY', 'SQLITE_LOCKED', 'SQLITE_PROTOCOL'];
      const isRetryable = error.code && retryableErrors.some(code => error.code.includes(code)) ||
                          error.message && (error.message.includes('SQLITE_BUSY') || 
                                           error.message.includes('SQLITE_LOCKED') ||
                                           error.message.includes('locked') ||
                                           error.message.includes('transaction'));
      
      if (!isRetryable || attempt === maxRetries) {
        // Not retryable or max retries reached
        throw error;
      }

      // Log retry attempt
      logger.warn(`Database operation failed, retrying (attempt ${attempt + 1}/${maxRetries})`, {
        error: error.message,
        code: error.code,
        delay
      });

      // Wait before retrying with exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Increase delay for next retry, but cap at maxDelay
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  // Should never reach here, but just in case
  throw lastError;
}

const router = express.Router({ mergeParams: true });

async function archiveMinutesParagraphSafely(writer, context = {}) {
  if (!config.MINUTES_ARCHIVE_ENABLED) return;
  try {
    await writer();
  } catch (err) {
    logger.warn('Minutes paragraph archive write failed', { error: err.message, ...context });
  }
}

// Middleware to check for active structure proposals that would prevent modifications
const checkNoActiveStructureProposals = asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const documentId = req.params.documentId;

  // Check if there are any active (unapproved, unapplied) structure proposals for this document
  const activeProposalQuery = `
    SELECT COUNT(*) as count FROM structure_proposals
    WHERE document_id = ? AND approved = false AND applied = false
  `;

  try {
    const result = await TransactionManager.query(db, activeProposalQuery, [documentId]);
    if (result && result.count > 0) {
      throw ApiError.validation(
        'Cannot modify paragraphs while there are active structure proposals. Please resolve all pending structure proposals before making changes.',
        { activeProposals: result.count },
        'ACTIVE_STRUCTURE_PROPOSALS'
      );
    }
    next();
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    logger.error('Error checking for active structure proposals', { error: err.message, documentId });
    throw ApiError.database('Failed to check active structure proposals');
  }
});


// Get contextual paragraphs around a specific paragraph
router.get('/context/:paragraphId', requireAuth, requireDocumentAccess, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.documentId;
  const paragraphId = req.params.paragraphId;
  const contextSize = parseInt(req.query.context) || 2; // Number of paragraphs before/after

  // First get the target paragraph's order
  const targetPara = await TransactionManager.query(
    db,
    'SELECT order_index FROM paragraphs WHERE id = ? AND document_id = ?',
    [paragraphId, documentId]
  );

  if (!targetPara) {
    throw ApiError.notFound('Target paragraph not found');
  }

  const targetOrder = targetPara.order_index;
  const minOrder = Math.max(0, targetOrder - contextSize);
  const maxOrder = targetOrder + contextSize;
  const userId = getUserId(req);

  // Get document voting_anonymous setting
  const doc = await TransactionManager.query(db, `SELECT voting_anonymous FROM documents WHERE id = ?`, [documentId]);
  const isAnonymous = doc?.voting_anonymous === true;

  // Build GROUP BY clause that's compatible with both SQLite and PostgreSQL
  // PostgreSQL requires all non-aggregated columns to be in GROUP BY
  // Check once per request and reuse (DB.2 optimization)
  const groupByClause = 'GROUP BY p.id, p.document_id, p.title, p.heading_level, p.text, p.order_index, p.created_at, p.updated_at';

  // Get paragraphs in the context window (PostgreSQL canonical, convert for SQLite)
  let contextQuery = `
    SELECT
      p.*,
      json_agg(
        json_build_object(
          'id', pr.id,
          'user_id', pr.user_id,
          'text', pr.text,
          'type', pr.type,
          'heading_level', pr.heading_level,
          'votes', (
            SELECT json_agg(json_build_object('user_id', v.user_id, 'vote', v.vote) ORDER BY v.created_at ASC)
            FROM votes v WHERE v.proposal_id = pr.id
          ),
          'comments', (
            SELECT json_agg(
              json_build_object(
                'id', c.id,
                'user_id', c.user_id,
                'text', c.text,
                'parent_id', c.parent_id,
                'created_at', c.created_at,
                'updated_at', c.updated_at
              ) ORDER BY c.created_at ASC
            )
            FROM comments c WHERE c.commentable_type = 'proposal' AND c.commentable_id = pr.id
          ),
          'created_at', pr.created_at,
          'approved', pr.approved
        ) ORDER BY pr.created_at ASC
      ) as proposals_json
    FROM paragraphs p
    LEFT JOIN proposals pr ON p.id = pr.paragraph_id
    WHERE p.document_id = ? AND p.order_index BETWEEN ? AND ?
    ${groupByClause}
    ORDER BY p.order_index
  `;
  const rows = await TransactionManager.queryAll(db, contextQuery, [documentId, minOrder, maxOrder]);

  // Process the results
  const paragraphs = rows.map(row => {
    const proposalsRaw = row.proposals_json && row.proposals_json !== '[null]' 
      ? safeJsonParse(row.proposals_json, []) 
      : [];
    const proposals = Array.isArray(proposalsRaw) ? proposalsRaw.filter(p => p.id !== null) : [];

    return {
      id: row.id,
      document_id: row.document_id,
      title: row.title,
      text: row.text,
      heading_level: row.heading_level,
      order: row.order_index,
      isDocumentTitle: row.order_index < 0,
      proposals: proposals.map(p => {
        const votesRaw = p.votes ? safeJsonParse(p.votes, []) : [];
        let votes = Array.isArray(votesRaw) ? votesRaw.filter(v => v.user_id) : [];
        // Filter user_id from votes if voting is anonymous
        if (isAnonymous) {
          votes = votes.map(v => {
            // Only include user_id for the current user's own vote
            if (v.user_id === userId) {
              return { userId: v.user_id, vote: v.vote };
            }
            return { vote: v.vote }; // Remove user_id for other users
          });
        }
        return {
          ...p,
          votes,
          comments: (() => {
            const commentsRaw = p.comments ? safeJsonParse(p.comments, []) : [];
            return Array.isArray(commentsRaw) ? commentsRaw.filter(c => c.id) : [];
          })()
        };
      })
    };
  });

  res.json({
    paragraphs,
    targetParagraphId: paragraphId,
    contextWindow: { min: minOrder, max: maxOrder, target: targetOrder }
  });
}));

// Get all paragraphs for a document
router.get('/', requireAuth, requireDocumentAccess, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.documentId;
  const userId = getUserId(req);

  // Get document voting_anonymous setting
  const doc = await TransactionManager.query(db, `SELECT voting_anonymous FROM documents WHERE id = ?`, [documentId]);
  const isAnonymous = doc?.voting_anonymous === true;

  // Build GROUP BY clause that's compatible with both SQLite and PostgreSQL
  // PostgreSQL requires all non-aggregated columns to be in GROUP BY
  // Check once per request and reuse (DB.2 optimization)
  const groupByClause = 'GROUP BY p.id, p.document_id, p.title, p.heading_level, p.text, p.order_index, p.created_at, p.updated_at';

  let allParagraphsQuery = `
    SELECT
      p.*,
      json_agg(
        json_build_object(
          'id', pr.id,
          'user_id', pr.user_id,
          'text', pr.text,
          'type', pr.type,
          'heading_level', pr.heading_level,
          'votes', (
            SELECT json_agg(json_build_object('user_id', v.user_id, 'vote', v.vote) ORDER BY v.created_at ASC)
            FROM votes v WHERE v.proposal_id = pr.id
          ),
          'comments', (
            SELECT json_agg(
              json_build_object(
                'id', c.id,
                'user_id', c.user_id,
                'text', c.text,
                'parent_id', c.parent_id,
                'created_at', c.created_at,
                'updated_at', c.updated_at
              ) ORDER BY c.created_at ASC
            )
            FROM comments c WHERE c.commentable_type = 'proposal' AND c.commentable_id = pr.id
          ),
          'created_at', pr.created_at,
          'updated_at', pr.updated_at
        ) ORDER BY pr.created_at ASC
      ) as proposals_json,
      json_agg(
        json_build_object(
          'id', h.id,
          'paragraph_id', h.paragraph_id,
          'user_id', h.user_id,
          'old_text', h.old_text,
          'new_text', h.new_text,
          'approval_percentage', h.approval_percentage,
          'proposal_id', h.proposal_id,
          'accepted_at', h.accepted_at
        ) ORDER BY h.created_at ASC
      ) as history_json
    FROM paragraphs p
    LEFT JOIN proposals pr ON p.id = pr.paragraph_id
    LEFT JOIN history h ON p.id = h.paragraph_id
    WHERE p.document_id = ?
    ${groupByClause}
    ORDER BY p.order_index ASC, p.created_at ASC
  `;
  const rows = await TransactionManager.queryAll(db, allParagraphsQuery, [documentId]);

  // Parse the JSON strings back to objects
  const paragraphs = rows.map(row => {
    const proposalsRaw = row.proposals_json && row.proposals_json !== '[null]' 
      ? safeJsonParse(row.proposals_json, []) 
      : [];
    let proposals = Array.isArray(proposalsRaw) ? proposalsRaw.filter(p => p.id !== null) : [];
    // Filter user_id from votes if voting is anonymous
    if (isAnonymous) {
      proposals = proposals.map(p => {
        if (p.votes) {
          const votes = safeJsonParse(p.votes, []);
          p.votes = votes.map(v => {
            // Only include user_id for the current user's own vote
            if (v.user_id === userId) {
              return { userId: v.user_id, vote: v.vote };
            }
            return { vote: v.vote }; // Remove user_id for other users
          });
        }
        return p;
      });
    }
    
    return {
      ...row,
      proposals,
      history: (() => {
        const historyRaw = row.history_json && row.history_json !== '[null]' 
          ? safeJsonParse(row.history_json, []) 
          : [];
        return Array.isArray(historyRaw) ? historyRaw.filter(h => h.id !== null) : [];
      })()
    };
  });

  res.json({ paragraphs });
}));

/**
 * Calculate and validate order_index for a paragraph
 * If requestedOrder is provided, validates uniqueness
 * If not provided, calculates next available order_index (MAX + 10)
 * @param {Object} trx - Transaction object
 * @param {string} documentId - Document ID
 * @param {number|undefined} requestedOrder - Requested order_index (optional)
 * @returns {Promise<number>} Validated or calculated order_index
 */
const PG_INT_MAX = 2147483647;

async function calculateAndValidateOrderIndex(trx, documentId, requestedOrder) {
  // If order explicitly provided, validate uniqueness
  if (requestedOrder !== null && requestedOrder !== undefined) {
    if (typeof requestedOrder !== 'number' || requestedOrder < 0 || !Number.isInteger(requestedOrder)) {
      throw ApiError.validation('Order index must be a non-negative integer');
    }

    if (requestedOrder > PG_INT_MAX) {
      throw ApiError.validation(
        'Order index exceeds maximum allowed value',
        { orderIndex: requestedOrder, max: PG_INT_MAX },
        'ORDER_INDEX_OVERFLOW'
      );
    }
    
    const existing = await TransactionManager.query(trx, 
      'SELECT COUNT(*) as count FROM paragraphs WHERE document_id = ? AND order_index = ?',
      [documentId, requestedOrder]
    );
    
    if (existing && existing.count > 0) {
      throw ApiError.validation(
        `Order index ${requestedOrder} already exists for this document`,
        { orderIndex: requestedOrder },
        'DUPLICATE_ORDER_INDEX'
      );
    }
    
    return requestedOrder;
  }
  
  // Calculate next order_index
  const maxResult = await TransactionManager.query(trx,
    'SELECT MAX(order_index) as max_order FROM paragraphs WHERE document_id = ?',
    [documentId]
  );
  
  const maxOrder = maxResult?.max_order;
  if (maxOrder === null) return 0;

  const nextOrder = maxOrder + 10;
  if (nextOrder > PG_INT_MAX) {
    await forceNormalizeParagraphOrder(trx, documentId);
    const refreshed = await TransactionManager.query(trx,
      'SELECT MAX(order_index) as max_order FROM paragraphs WHERE document_id = ?',
      [documentId]
    );
    return (refreshed?.max_order ?? 0) + 10;
  }

  return nextOrder;
}

async function normalizeParagraphOrder(db, documentId) {
  // First, check if normalization is actually needed
  let rows;
  try {
    rows = await TransactionManager.queryAll(db, `
      SELECT id, order_index, created_at
      FROM paragraphs
      WHERE document_id = ?
        AND (order_index IS NULL OR order_index >= 0)
      ORDER BY order_index ASC, created_at ASC, id ASC
    `, [documentId]);
  } catch (err) {
    logger.error('Error fetching paragraphs for normalization check', { error: err.message, documentId });
    throw err;
  }

  if (!rows || rows.length === 0) {
    return;
  }

  // Check if any paragraphs have duplicate or too-close order_index values
  let needsNormalization = false;
  const usedOrders = new Set();

  for (let i = 0; i < rows.length; i++) {
    const currentOrder = rows[i].order_index || 0;

    // Check for duplicates or orders that are too close (less than 1 apart)
    if (usedOrders.has(currentOrder) ||
        (i > 0 && Math.abs(currentOrder - (rows[i-1].order_index || 0)) < 1)) {
      needsNormalization = true;
      break;
    }

    usedOrders.add(currentOrder);
  }

  if (!needsNormalization) {
    logger.debug('Paragraph order normalization not needed for document', { documentId });
    return;
  }

  logger.debug('Normalizing paragraph order for document', { documentId });

  // Normalize order_index values
  try {
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const newOrder = index * 10; // Use larger gaps to allow insertions
      await TransactionManager.execute(db, `
        UPDATE paragraphs SET order_index = ? WHERE id = ?
      `, [newOrder, row.id]);
    }
  } catch (err) {
    logger.error('Error normalizing paragraph order', { error: err.message, documentId });
    throw err;
  }
}

async function forceNormalizeParagraphOrder(db, documentId) {
  const rows = await TransactionManager.queryAll(db, `
    SELECT id FROM paragraphs
    WHERE document_id = ? AND (order_index IS NULL OR order_index >= 0)
    ORDER BY order_index ASC, created_at ASC, id ASC
  `, [documentId]);

  if (!rows || rows.length === 0) return;

  logger.info('Force-normalizing paragraph order (overflow prevention)', { documentId, count: rows.length });
  for (let index = 0; index < rows.length; index++) {
    await TransactionManager.execute(db, `
      UPDATE paragraphs SET order_index = ? WHERE id = ?
    `, [index * 10, rows[index].id]);
  }
}

// Create a new paragraph
// Note: All user-created paragraphs are suggestions (empty paragraph + proposal)
// The asSuggestion flag defaults to true for backward compatibility
router.post('/', requireAuth, requireDocumentAccess, checkNoActiveStructureProposals, ...paragraphValidation.create, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.documentId;
  // After transformRequest middleware, fields are in snake_case
  // Support both camelCase and snake_case for backward compatibility
  const headingLevel = req.body.heading_level || req.body.headingLevel;
  const asSuggestion = req.body.as_suggestion !== undefined ? req.body.as_suggestion : req.body.asSuggestion;
  const { title, text, order, order_index } = req.body;

  const userId = getUserId(req);
  logger.debug('Creating paragraph', { documentId, userId, title, text, order, asSuggestion, headingLevel });

  // STEP 1: Check proposal cutoff BEFORE any database operations (Issue 3.5)
  // Check proposal cutoff for organizational documents (all user-created paragraphs are suggestions)
  const doc = await TransactionManager.query(db, `
    SELECT status, paragraph_proposals_cutoff, ownership_type, amendments_open, document_kind, meeting_id
    FROM documents WHERE id = ?
  `, [documentId]);

  // Check document status - block paragraph creation on agreed/rejected/voting documents (organizational only)
  if (doc?.ownership_type === 'organizational') {
    if (doc.status === 'rejected') {
      throw ApiError.forbidden(
        'Cannot create paragraphs on rejected documents.',
        'DOCUMENT_REJECTED'
      );
    }
    if (doc.status === 'agreed') {
      if (!doc.amendments_open) {
        throw ApiError.forbidden(
          'Document is not open for amendments. Request an organization vote to open it.',
          'AMENDMENTS_NOT_OPEN'
        );
      }
    }
    if (doc.status === 'voting') {
      throw ApiError.forbidden(
        'Cannot create paragraphs during the voting period. Please wait for voting to complete.',
        'DOCUMENT_IN_VOTING'
      );
    }
  }

  // Existing cutoff check (only applies when status === 'proposal')
  if (doc?.ownership_type === 'organizational' && 
      doc?.status === 'proposal' && 
      doc?.paragraph_proposals_cutoff) {
    const cutoffDate = new Date(doc.paragraph_proposals_cutoff);
    const now = new Date();
    if (now >= cutoffDate) {
      logger.info('Proposal cutoff passed, blocking paragraph suggestion', { 
        documentId, 
        cutoffDate: doc.paragraph_proposals_cutoff,
        now: now.toISOString()
      });
      throw ApiError.forbidden(
        'The proposal cutoff deadline has passed. New paragraph proposals are no longer accepted.',
        'PROPOSAL_CUTOFF_PASSED'
      );
    }
  }

  const bodyText = (text || '').trim();
  const headingText = title && typeof title === 'string' ? title.trim() : null;
  // Default to true: all user-created paragraphs are suggestions
  // Use loose check to handle both boolean false and numeric 0 (from transformForDatabase middleware)
  const createAsSuggestion = asSuggestion == null || !!asSuggestion;
  const normalizedHeadingLevel = headingLevel && ['h1', 'h2', 'h3'].includes((headingLevel || '').toLowerCase())
    ? headingLevel.toLowerCase()
    : null;

  // Determine paragraph type (validation middleware already ensured either/or)
  const hasTitle = headingText && headingText.length > 0;
  const hasText = bodyText && bodyText.length > 0;

  const paragraphId = uuidv4();
  const requestedOrderIndex = typeof (order ?? order_index) === 'number' ? (order ?? order_index) : undefined;

  // Meeting minutes: write content directly to paragraph (no approval). Other docs: empty paragraph + proposals.
  const isMinutesDoc = doc?.document_kind === 'meeting_minutes';
  const directWriteMinutes = isMinutesDoc && !createAsSuggestion;
  const resolvedOrderIndex = requestedOrderIndex;

  let paragraphTitle = null;
  let paragraphBody = '';
  let paragraphHeadingLevel = null;
  if (directWriteMinutes) {
    paragraphTitle = hasTitle ? headingText : null;
    paragraphBody = hasText ? bodyText : '';
    paragraphHeadingLevel = hasTitle ? (normalizedHeadingLevel || 'h2') : null;
  }

  // Track proposal IDs for efficient broadcasting (empty for minutes direct write)
  const createdProposalIds = [];

  // STEP 3: Wrap paragraph creation AND proposal creation in single transaction (Issue 3.1).
  // Serialize per-document so concurrent auto order_index calculation cannot collide.
  const documentLockManager = require('../modules/locks');
  await documentLockManager.withLock(documentId, async () => {
  await TransactionManager.executeInTransaction(db, async (trx) => {
    // 3a. Calculate/validate order_index
    const finalOrderIndex = await calculateAndValidateOrderIndex(trx, documentId, resolvedOrderIndex);
    
    // 3b. Create paragraph (with content for minutes, empty for others)
    await TransactionManager.execute(trx, `
      INSERT INTO paragraphs (id, document_id, title, heading_level, text, order_index)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [paragraphId, documentId, paragraphTitle, paragraphHeadingLevel, paragraphBody, finalOrderIndex]);
    
    // 3c. Create proposals (body and/or title) — skip for meeting minutes (content already in paragraph)
    if (!directWriteMinutes) {
      if (hasText) {
        const bodyProposalId = uuidv4();
        createdProposalIds.push(bodyProposalId);
        await TransactionManager.execute(trx, `
          INSERT INTO proposals (id, paragraph_id, user_id, text, type, heading_level)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [bodyProposalId, paragraphId, userId, bodyText, 'BODY', null]);
      }

      if (hasTitle) {
        const headingProposalId = uuidv4();
        createdProposalIds.push(headingProposalId);
        await TransactionManager.execute(trx, `
          INSERT INTO proposals (id, paragraph_id, user_id, text, type, heading_level)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [headingProposalId, paragraphId, userId, headingText, 'TITLE', normalizedHeadingLevel || 'h2']);
      }
    }
    
    // 3d. Update document timestamp (BLOCKING - within transaction)
    await TransactionManager.execute(trx, `
      UPDATE documents SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `, [documentId]);
    
    // Transaction commits automatically if no errors
    // Automatic rollback if any step fails
  });
  });

  // Fetch created paragraph (needed for response and for broadcast order)
  const paragraph = await TransactionManager.query(db, `
    SELECT id, document_id, title, heading_level, text, order_index, created_at, updated_at
    FROM paragraphs WHERE id = ?
  `, [paragraphId]);

  if (!paragraph) {
    throw ApiError.database('Paragraph created but failed to retrieve');
  }

  // Broadcast paragraph-created FIRST so clients have the paragraph before proposals (avoids "Consensus open" placeholder)
  webSocketManager.broadcastDocumentUpdate(documentId, 'paragraph-created', {
    paragraphId,
    paragraph: {
      id: paragraph.id,
      text: paragraph.text || '',
      title: paragraph.title || null,
      headingLevel: paragraph.heading_level,
      orderIndex: paragraph.order_index,
      documentId: paragraph.document_id
    }
  });

  // Then broadcast each proposal so real-time clients can add suggestions to the new paragraph
  if (createdProposalIds.length > 0) {
    const createdProposals = await TransactionManager.queryAll(db, `
      SELECT p.*,
             u.name as user_name,
             u.email as user_email
      FROM proposals p
      JOIN users u ON p.user_id = u.id
      WHERE p.id IN (${createdProposalIds.map(() => '?').join(',')})
    `, createdProposalIds);

    for (const proposal of createdProposals) {
      const proposalData = {
        ...proposal,
        user: {
          id: proposal.user_id,
          name: proposal.user_name,
          email: proposal.user_email
        },
        votes: [], // Empty initially, votes will come via separate events
        comments: [] // Empty initially, comments will come via separate events
      };

      metricsCollector.recordBusinessEvent('proposal_created', {
        proposalId: proposal.id,
        paragraphId,
        userId,
        type: proposal.type,
        documentId
      });

      webSocketManager.broadcastProposalUpdate(documentId, paragraphId, proposalData);
    }
  }

  // STEP 6: Normalize paragraph order with retry mechanism (Issue 3.3 - Part 2)
  retryOperation(
    () => normalizeParagraphOrder(db, documentId),
    { maxRetries: 3, initialDelay: 100, maxDelay: 2000, backoffMultiplier: 2 }
  )
    .then(() => {
      logger.debug('Paragraph order normalized', { documentId });
    })
    .catch((normalizeErr) => {
      logger.error('Failed to normalize paragraph order after retries', {
        error: normalizeErr.message,
        documentId,
        stack: normalizeErr.stack
      });
      metricsCollector.recordError('paragraph_order_normalization_failed', {
        documentId,
        error: normalizeErr.message
      });
    });

  // If this is a meeting minutes document, also notify meeting room so timeline refetches
  if (doc?.document_kind === 'meeting_minutes' && doc.meeting_id) {
    await archiveMinutesParagraphSafely(
      () => MinutesArchiveService.archiveParagraph(db, {
        meetingId: doc.meeting_id,
        minutesDocumentId: documentId,
        paragraph: {
          id: paragraph.id,
          title: paragraph.title ?? null,
          text: paragraph.text ?? '',
          headingLevel: paragraph.heading_level ?? null,
          orderIndex: paragraph.order_index,
          createdAt: paragraph.created_at
        },
        operation: 'upsert',
        createdByUserId: userId
      }),
      { documentId, meetingId: doc.meeting_id, route: 'POST /paragraphs' }
    );
    if (typeof webSocketManager.broadcastMeetingUpdate === 'function') {
      const item = {
        type: 'paragraph',
        id: paragraph.id,
        occurredAt: paragraph.created_at,
        orderIndex: paragraph.order_index,
        title: paragraph.title ?? null,
        text: paragraph.text ?? '',
        headingLevel: paragraph.heading_level
      };
      webSocketManager.broadcastMeetingUpdate(doc.meeting_id, 'minutes-paragraph-added', { paragraphId, item });
    }
  }

  res.status(201).json({ paragraph });
}));

// Update a paragraph
router.put('/:paragraphId', requireAuth, requireDocumentAccess, checkNoActiveStructureProposals, paragraphValidation.update, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.documentId;
  const paragraphId = req.params.paragraphId;
  const userId = getUserId(req);
  // After transformRequest middleware, fields are in snake_case
  // Support both camelCase and snake_case for backward compatibility
  const headingLevel = req.body.heading_level || req.body.headingLevel;
  const { title, text, order } = req.body;

  // Partial update: set title and/or text without clearing the other unless explicitly cleared

  // Get current paragraph for history
  const currentParagraph = await TransactionManager.query(db, `
    SELECT text, title, heading_level FROM paragraphs WHERE id = ? AND document_id = ?
  `, [paragraphId, documentId]);

  if (!currentParagraph) {
    throw ApiError.notFound('Paragraph not found');
  }

  // Determine what's being updated
  const hasTitle = title !== undefined && title !== null && typeof title === 'string' && title.trim().length > 0;
  const hasText = text !== undefined && text !== null && typeof text === 'string' && text.trim().length > 0;
  const normalizedHeadingLevel = headingLevel && ['h1', 'h2', 'h3'].includes(headingLevel.toLowerCase())
    ? headingLevel.toLowerCase()
    : null;

  // Use transaction for atomic paragraph update
  await TransactionManager.executeInTransaction(db, async (db) => {
    const updates = [];
    const params = [];

    // Update title/heading_level when title or headingLevel is in the request
    if (title !== undefined || headingLevel !== undefined) {
      if (hasTitle) {
        updates.push('title = ?');
        params.push(title.trim());
        updates.push('heading_level = ?');
        params.push(normalizedHeadingLevel || 'h2');
      } else {
        // Clearing title (empty string or null)
        updates.push('title = NULL');
        updates.push('heading_level = NULL');
      }
    }

    if (text !== undefined) {
      updates.push('text = ?');
      params.push(typeof text === 'string' ? text : '');
    }

    if (updates.length === 0 && order === undefined) {
      throw ApiError.validation('No fields to update.');
    }

    if (order !== undefined) {
      const PG_INT_MAX = 2147483647;
      const validOrder = Math.min(Math.max(Math.round(Number(order) || 0), 0), PG_INT_MAX);
      updates.push('order_index = ?');
      params.push(validOrder);
    }
    updates.push('updated_at = CURRENT_TIMESTAMP');

    const updateQuery = 'UPDATE paragraphs SET ' + updates.join(', ') + ' WHERE id = ? AND document_id = ?';
    params.push(paragraphId, documentId);

    await TransactionManager.execute(db, updateQuery, params);

    // History table requires proposal_id (NOT NULL). Direct paragraph updates (e.g. meeting minutes edit)
    // have no proposal, so we skip the history insert to avoid violating the constraint.
    // Proposal-based updates record history in the votes/acceptance flow instead.

    // Update document timestamp
    await TransactionManager.execute(db, `
      UPDATE documents SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `, [documentId]);
  });

  // Fetch updated paragraph for WebSocket broadcast (include created_at for timeline item occurredAt)
  const updatedPara = await TransactionManager.query(db, `
    SELECT id, document_id, text, title, heading_level, order_index, created_at FROM paragraphs WHERE id = ?
  `, [paragraphId]);

  if (updatedPara) {
    webSocketManager.broadcastDocumentUpdate(documentId, 'paragraph-updated', {
      paragraphId,
      text: updatedPara.text || '',
      title: updatedPara.title || null,
      headingLevel: updatedPara.heading_level,
      orderIndex: updatedPara.order_index
    });
  }

  // If this is a meeting minutes document, also notify meeting room so timeline refetches
  const doc = await TransactionManager.query(db, 'SELECT document_kind, meeting_id FROM documents WHERE id = ?', [documentId]);
  if (doc?.document_kind === 'meeting_minutes' && doc.meeting_id) {
    await archiveMinutesParagraphSafely(
      () => MinutesArchiveService.archiveParagraph(db, {
        meetingId: doc.meeting_id,
        minutesDocumentId: documentId,
        paragraph: {
          id: updatedPara.id,
          title: updatedPara.title ?? null,
          text: updatedPara.text ?? '',
          headingLevel: updatedPara.heading_level ?? null,
          orderIndex: updatedPara.order_index,
          createdAt: updatedPara.created_at
        },
        operation: 'upsert',
        createdByUserId: userId
      }),
      { documentId, meetingId: doc.meeting_id, route: 'PUT /paragraphs/:paragraphId' }
    );
    if (typeof webSocketManager.broadcastMeetingUpdate === 'function') {
      const item = {
        type: 'paragraph',
        id: updatedPara.id,
        occurredAt: updatedPara.created_at,
        orderIndex: updatedPara.order_index,
        title: updatedPara.title ?? null,
        text: updatedPara.text ?? '',
        headingLevel: updatedPara.heading_level
      };
      webSocketManager.broadcastMeetingUpdate(doc.meeting_id, 'minutes-paragraph-updated', { paragraphId, item });
    }
  }

  res.json({ message: 'Paragraph updated successfully' });
}));

// Delete a paragraph
router.delete('/:paragraphId', requireAuth, requireDocumentAccess, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.documentId;
  const paragraphId = req.params.paragraphId;

  // Resolve meeting_id before delete so we can broadcast to meeting room after
  const doc = await TransactionManager.query(db, 'SELECT document_kind, meeting_id FROM documents WHERE id = ?', [documentId]);

  const result = await TransactionManager.execute(db, `
    DELETE FROM paragraphs WHERE id = ? AND document_id = ?
  `, [paragraphId, documentId]);

  if (result.changes === 0) {
    throw ApiError.notFound('Paragraph not found');
  }

  if (doc?.document_kind === 'meeting_minutes' && doc.meeting_id) {
    await archiveMinutesParagraphSafely(
      () => MinutesArchiveService.archiveParagraph(db, {
        meetingId: doc.meeting_id,
        minutesDocumentId: documentId,
        paragraph: {
          id: paragraphId,
          orderIndex: Date.now(),
          createdAt: new Date().toISOString()
        },
        operation: 'delete'
      }),
      { documentId, meetingId: doc.meeting_id, route: 'DELETE /paragraphs/:paragraphId' }
    );
    if (typeof webSocketManager.broadcastMeetingUpdate === 'function') {
      webSocketManager.broadcastMeetingUpdate(doc.meeting_id, 'minutes-paragraph-removed', { paragraphId });
    }
  }

  // Update document timestamp (non-blocking but tracked)
  TransactionManager.execute(db, `
    UPDATE documents SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `, [documentId])
    .then(() => {
      logger.debug('Document timestamp updated after paragraph deletion', { documentId });
    })
    .catch((err) => {
      logger.error('Error updating document timestamp after paragraph deletion', { 
        error: err.message, 
        documentId,
        stack: err.stack 
      });
      // Track metric for monitoring
      metricsCollector.recordError('document_timestamp_update_failed', {
        documentId,
        context: 'paragraph_deletion',
        error: err.message
      });
    });

  // Normalize paragraph order (non-blocking but tracked)
  normalizeParagraphOrder(db, documentId)
    .then(() => {
      logger.debug('Paragraph order normalized after deletion', { documentId });
    })
    .catch((normalizeErr) => {
      logger.error('Failed to normalize paragraph order after deletion', { 
        error: normalizeErr.message, 
        documentId,
        stack: normalizeErr.stack 
      });
      // Track metric - this is important for data consistency
      metricsCollector.recordError('paragraph_order_normalization_failed', {
        documentId,
        context: 'after_deletion',
        error: normalizeErr.message
      });
    });

  res.json({ message: 'Paragraph deleted successfully' });
}));

module.exports = router;
