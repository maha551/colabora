const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { metricsCollector } = require('../middleware/monitoring');
const { requireAuth, requireDocumentAccess } = require('../middleware/auth');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { logger } = require('../middleware/logger');
const { safeJsonParseArray } = require('../utils/jsonUtils');
const TransactionManager = require('../database/services/TransactionManager');
const { commentValidation, structureProposalValidation } = require('../middleware/validation');
const webSocketManager = require('../modules/websocket');
const UnifiedVotingService = require('../modules/unified-voting');
const { enrichStructureProposal } = require('../utils/structureProposalEnricher');
const votingLockManager = require('../utils/votingLocks');
const voteVerificationLog = require('../utils/voteVerificationLog');
const { generateReceiptId, computeVoteHash } = require('../utils/voteReceipt');
const { getUserId } = require('../utils/routeHelpers');
const { calculateVoteCounts, validateVoteCounts } = require('../utils/voteCounts');
const { logOrganizationAudit } = require('../utils/auditLogger');

const router = express.Router({ mergeParams: true });

// Structure proposal approval: status is the source of truth for 'approved'/'rejected';
// approved (boolean) is kept in sync for backward compatibility and existing callers.

// Helper function to get document voting settings
async function getDocumentVotingSettings(db, documentId) {
  try {
    const doc = await TransactionManager.query(db, `SELECT voting_anonymous FROM documents WHERE id = ?`, [documentId]);
    return { votingAnonymous: doc?.voting_anonymous === true };
  } catch (err) {
    logger.error('Error fetching document voting setting', { error: err.message, documentId });
    throw new ApiError(500, 'Failed to fetch document settings', 'DATABASE_ERROR', { details: err.message });
  }
}

// Get all structure proposals for a document
router.get('/', requireAuth, requireDocumentAccess, asyncHandler(async (req, res) => {
  logger.debug('GET /structure-proposals called', { documentId: req.params.documentId });
  const db = req.app.locals.db;
  const documentId = req.params.documentId;

  const query = `
    SELECT sp.*,
           u.name as user_name,
           u.email as user_email
    FROM structure_proposals sp
    JOIN users u ON sp.user_id = u.id
    WHERE sp.document_id = ?
    ORDER BY sp.created_at DESC
  `;

  logger.debug('Executing structure proposals query', { documentId });

  let structureProposals;
  try {
    structureProposals = await TransactionManager.queryAll(db, query, [documentId]);
  } catch (err) {
    logger.error('Error fetching structure proposals', { error: err.message, documentId });
    throw new ApiError(500, 'Failed to fetch structure proposals', 'DATABASE_ERROR', { details: err.message });
  }

  // Get document voting settings
  const userId = getUserId(req);
  const { votingAnonymous: isAnonymous } = await getDocumentVotingSettings(db, documentId);

  // Batch optimization: Fetch all operations, votes, and comments upfront
  // This eliminates N+1 queries by fetching all needed data in batch before enrichment
  const allProposalIds = structureProposals.map(sp => sp.id);
  const operationsByProposal = new Map();
  const votesByProposal = new Map();
  const commentsByProposal = new Map();
  
  if (allProposalIds.length > 0) {
    // Batch fetch operations
    try {
      const operationsPlaceholders = allProposalIds.map(() => '?').join(',');
      const allOperations = await TransactionManager.queryAll(db,
        `SELECT id, structure_proposal_id, operation_type, source_paragraph_ids, target_paragraph_id, 
                new_position_index, new_parent_id, new_text, new_heading_level, operation_data, created_at
         FROM structure_operations
         WHERE structure_proposal_id IN (${operationsPlaceholders})
         ORDER BY created_at ASC`,
        allProposalIds
      );
      
      allOperations.forEach(op => {
        if (!operationsByProposal.has(op.structure_proposal_id)) {
          operationsByProposal.set(op.structure_proposal_id, []);
        }
        operationsByProposal.get(op.structure_proposal_id).push(op);
      });
    } catch (err) {
      logger.error('Error batch fetching structure operations', { error: err.message });
      throw new ApiError(500, 'Failed to fetch structure operations', 'DATABASE_ERROR', { details: err.message });
    }

    // Batch fetch votes
    try {
      const votesPlaceholders = allProposalIds.map(() => '?').join(',');
      const allVotes = await TransactionManager.queryAll(db,
        `SELECT v.*, u.name as user_name, u.email as user_email
         FROM structure_proposal_votes v
         LEFT JOIN users u ON v.user_id = u.id
         WHERE v.structure_proposal_id IN (${votesPlaceholders})
         ORDER BY v.created_at ASC`,
        allProposalIds
      );
      
      allVotes.forEach(vote => {
        if (!votesByProposal.has(vote.structure_proposal_id)) {
          votesByProposal.set(vote.structure_proposal_id, []);
        }
        votesByProposal.get(vote.structure_proposal_id).push(vote);
      });
    } catch (err) {
      logger.error('Error batch fetching structure proposal votes', { error: err.message });
      throw new ApiError(500, 'Failed to fetch structure proposal votes', 'DATABASE_ERROR', { details: err.message });
    }

    // Batch fetch comments
    try {
      const commentsPlaceholders = allProposalIds.map(() => '?').join(',');
      const allComments = await TransactionManager.queryAll(db,
        `SELECT c.*, u.name as user_name, u.email as user_email, u.avatar as user_avatar,
                pc.user_id as parent_user_id, pu.name as parent_user_name
         FROM comments c
         LEFT JOIN users u ON c.user_id = u.id
         LEFT JOIN comments pc ON c.parent_id = pc.id
         LEFT JOIN users pu ON pc.user_id = pu.id
         WHERE c.commentable_type = 'structure_proposal' AND c.commentable_id IN (${commentsPlaceholders})
           AND c.deleted_at IS NULL
         ORDER BY c.created_at ASC`,
        allProposalIds
      );
      
      allComments.forEach(comment => {
        if (!commentsByProposal.has(comment.commentable_id)) {
          commentsByProposal.set(comment.commentable_id, []);
        }
        commentsByProposal.get(comment.commentable_id).push(comment);
      });
    } catch (err) {
      logger.error('Error batch fetching structure proposal comments', { error: err.message });
      throw new ApiError(500, 'Failed to fetch structure proposal comments', 'DATABASE_ERROR', { details: err.message });
    }
  }

  // Enrich each structure proposal with pre-fetched data
  const enrichedProposals = await Promise.all(
    structureProposals.map(sp => enrichStructureProposal(
      db, 
      sp, 
      isAnonymous, 
      userId,
      operationsByProposal.get(sp.id) || [],
      votesByProposal.get(sp.id) || [],
      commentsByProposal.get(sp.id) || []
    ))
  );
  logger.debug('Sending structure proposals response', { documentId, count: enrichedProposals.length });
  res.json({ structureProposals: enrichedProposals });
}));

// Create a new structure proposal
router.post('/', requireAuth, requireDocumentAccess, ...structureProposalValidation.create, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const documentId = req.params.documentId;
  const { title, description, operations } = req.body;
  const userId = getUserId(req);

  // Structure proposals must be enabled for the document.
  const enabledRow = await TransactionManager.query(db, 'SELECT structure_proposals_enabled FROM documents WHERE id = ?', [documentId]);
  if (enabledRow && enabledRow.structure_proposals_enabled !== true && enabledRow.structure_proposals_enabled !== 1) {
    return next(ApiError.forbidden('Structure proposals are not enabled for this document', 'STRUCTURE_PROPOSALS_NOT_ENABLED'));
  }

  if (!title || !operations || !Array.isArray(operations) || operations.length === 0) {
    return next(ApiError.validation('Title and operations are required', null, 'TITLE_AND_OPERATIONS_REQUIRED'));
  }

  // Check document status - block on agreed/rejected documents
  const doc = await TransactionManager.query(db, `
    SELECT status, ownership_type, amendments_open FROM documents WHERE id = ?
  `, [documentId]);

  if (!doc) {
    return next(ApiError.notFound('Document', 'DOCUMENT_NOT_FOUND'));
  }

  // Block structure proposals on rejected documents
  if (doc.status === 'rejected') {
    return next(ApiError.forbidden(
      'Cannot create structure proposals on rejected documents.',
      'DOCUMENT_REJECTED'
    ));
  }
  // Allow structure proposals on agreed documents only when amendments are open
  if (doc.status === 'agreed') {
    if (!doc.amendments_open) {
      return next(ApiError.forbidden(
        'Document is not open for amendments. Request an organization vote to open it.',
        'AMENDMENTS_NOT_OPEN'
      ));
    }
  }

      // Validate operations
      const { extractOperationFields } = require('../utils/fieldExtractor');
      for (const op of operations) {
        // Extract all operation fields using utility
        const {
          operationType,
          targetParagraphId,
          sourceParagraphIds,
          newPositionIndex,
          newText,
          newHeadingLevel
        } = extractOperationFields(op);
        
        if (!operationType || !['MOVE', 'MERGE', 'DELETE', 'RENAME_HEADING', 'CHANGE_HEADING_LEVEL', 'INSERT_NEW'].includes(operationType)) {
          return next(ApiError.validation(`Invalid operation type: ${operationType}. SPLIT operation is not yet implemented.`, null, 'INVALID_OPERATION_TYPE'));
        }

        switch (operationType) {
          case 'MOVE':
            if (!targetParagraphId || newPositionIndex === null || newPositionIndex === undefined) {
              return next(ApiError.validation('MOVE operation requires targetParagraphId and newPositionIndex', null, 'MOVE_OPERATION_INVALID'));
            }
            if (newPositionIndex < 0 || newPositionIndex > 10000) {
              return next(ApiError.validation('MOVE operation newPositionIndex must be between 0 and 10000', null, 'MOVE_POSITION_INDEX_INVALID'));
            }
            break;
          case 'MERGE':
            if (!targetParagraphId || !sourceParagraphIds || !Array.isArray(sourceParagraphIds) || sourceParagraphIds.length === 0) {
              return next(ApiError.validation('MERGE operation requires targetParagraphId and non-empty sourceParagraphIds array', null, 'MERGE_OPERATION_INVALID'));
            }
            break;
          case 'DELETE':
            if (!targetParagraphId) {
              return next(ApiError.validation('DELETE operation requires targetParagraphId', null, 'DELETE_OPERATION_INVALID'));
            }
            break;
          case 'RENAME_HEADING':
            if (!targetParagraphId || !newText || !newText.trim()) {
              return next(ApiError.validation('RENAME_HEADING operation requires targetParagraphId and newText', null, 'RENAME_HEADING_OPERATION_INVALID'));
            }
            break;
          case 'CHANGE_HEADING_LEVEL':
            if (!targetParagraphId || !newHeadingLevel) {
              return next(ApiError.validation('CHANGE_HEADING_LEVEL operation requires targetParagraphId and newHeadingLevel', null, 'CHANGE_HEADING_LEVEL_OPERATION_INVALID'));
            }
            if (!['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(newHeadingLevel.toLowerCase())) {
              return next(ApiError.validation('CHANGE_HEADING_LEVEL newHeadingLevel must be h1-h6', null, 'INVALID_HEADING_LEVEL'));
            }
            break;
          case 'INSERT_NEW':
            if (!newText || !newText.trim() || newPositionIndex === null || newPositionIndex === undefined) {
              return next(ApiError.validation('INSERT_NEW operation requires newText and newPositionIndex', null, 'INSERT_NEW_OPERATION_INVALID'));
            }
            if (newPositionIndex < 0 || newPositionIndex > 10000) {
              return next(ApiError.validation('INSERT_NEW operation newPositionIndex must be between 0 and 10000', null, 'INSERT_NEW_POSITION_INDEX_INVALID'));
            }
            break;
        }
      }

      // Detect operation conflicts before creating proposal
      const { detectOperationConflicts } = require('../utils/structureProposalValidation');
      const conflictCheck = detectOperationConflicts(operations);
      if (conflictCheck.hasConflicts) {
        return next(ApiError.validation(
          `Operation conflicts detected: ${conflictCheck.conflicts.join('; ')}`,
          { conflicts: conflictCheck.conflicts },
          'OPERATION_CONFLICTS'
        ));
      }

      const structureProposalId = uuidv4();
      const totalOperations = operations.length;
      const operationIds = [];

      // Create structure proposal and operations in a transaction
      await TransactionManager.executeInTransaction(db, async (trx) => {
        // Validate all paragraphs exist INSIDE transaction (atomic)
        const { validateOperationsParagraphsExist } = require('../utils/structureProposalValidation');
        await validateOperationsParagraphsExist(trx, documentId, operations);
        // Check for active proposal INSIDE transaction (atomic) to prevent race conditions
        // Handle case where structure_proposals table might not exist yet (during migration)
        let activeProposal = null;
        try {
          activeProposal = await TransactionManager.query(trx, `
            SELECT id FROM structure_proposals
            WHERE document_id = ? AND approved = false AND applied = false
              AND (status IS NULL OR status NOT IN ('approved', 'rejected'))
            LIMIT 1
          `, [documentId]);
        } catch (err) {
          logger.error('Error checking active proposals', { error: err.message, documentId });
          throw ApiError.database('Failed to check active proposals', { originalError: err.message }, 'CHECK_ACTIVE_PROPOSALS_FAILED');
        }
        
        if (activeProposal) {
          throw ApiError.validation('There is already an active structure proposal for this document', null, 'ACTIVE_PROPOSAL_EXISTS');
        }

        const { detectConflictsWithPendingProposals } = require('../utils/structureProposalValidation');
        const pendingConflictCheck = await detectConflictsWithPendingProposals(trx, documentId, operations);
        if (pendingConflictCheck.hasConflicts) {
          throw ApiError.validation(
            pendingConflictCheck.conflicts.join('; '),
            { conflicts: pendingConflictCheck.conflicts },
            'STRUCTURE_PROPOSAL_PARAGRAPH_CONFLICT'
          );
        }

        // Create structure proposal
        await TransactionManager.execute(trx, `
          INSERT INTO structure_proposals (id, document_id, user_id, title, description)
          VALUES (?, ?, ?, ?, ?)
        `, [structureProposalId, documentId, userId, title, description || null]);

        // Insert operations
        for (const op of operations) {
          const operationId = uuidv4();
          operationIds.push(operationId);
          // Extract all operation fields using utility
          const {
            operationType,
            targetParagraphId,
            sourceParagraphIds,
            newPositionIndex,
            newParentId,
            newText,
            newHeadingLevel,
            operationData
          } = extractOperationFields(op);

          await TransactionManager.execute(trx, `
            INSERT INTO structure_operations (
              id, structure_proposal_id, operation_type, source_paragraph_ids,
              target_paragraph_id, new_position_index, new_parent_id,
              new_text, new_heading_level, operation_data
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            operationId,
            structureProposalId,
            operationType,
            sourceParagraphIds ? JSON.stringify(sourceParagraphIds) : null,
            targetParagraphId || null,
            newPositionIndex || null,
            newParentId || null,
            newText || null,
            newHeadingLevel || null,
            operationData ? JSON.stringify(operationData) : null
          ]);
        }

        // Check if proposal should be auto-approved (for personal documents with only owner)
        await checkAndUpdateStructureProposalApproval(trx, documentId, structureProposalId);
      });

      // Fetch the proposal to get the approval status
      let proposal = null;
      try {
        proposal = await TransactionManager.query(db, 'SELECT approved, status FROM structure_proposals WHERE id = ?', [structureProposalId]);
      } catch (err) {
        logger.error('Error fetching proposal approval status', { error: err.message, proposalId: structureProposalId, documentId });
        // Still return success, but without approval status
        return res.status(201).json({
          structureProposal: {
            id: structureProposalId,
            documentId,
            userId,
            title,
            description,
            operations: operations.map((op, idx) => ({ ...op, id: operationIds[idx] || uuidv4() })),
            votes: [],
            comments: [],
            approved: false
          }
        });
      }

      // Return success with approval status
      res.status(201).json({
        structureProposal: {
          id: structureProposalId,
          documentId,
          userId,
          title,
          description,
          operations: operations.map((op, idx) => ({ ...op, id: operationIds[idx] || uuidv4() })),
          votes: [],
          comments: [],
          approved: proposal?.approved === true
        }
      });

      // Record metrics
      metricsCollector.recordBusinessEvent('structure_proposal_created', {
        structureProposalId,
        documentId,
        userId,
        operationCount: operations.length
      });

      // Broadcast WebSocket notification
      webSocketManager.broadcastDocumentUpdate(documentId, 'structure-proposal-created', {
        proposalId: structureProposalId,
        title,
        userId,
        operationCount: totalOperations,
        approved: proposal?.approved === true
      });
}));

// Get a specific structure proposal
router.get('/:proposalId', requireAuth, requireDocumentAccess, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { documentId, proposalId } = req.params;

  const query = `
    SELECT sp.*,
           u.name as user_name,
           u.email as user_email
    FROM structure_proposals sp
    JOIN users u ON sp.user_id = u.id
    WHERE sp.id = ? AND sp.document_id = ?
  `;

  let structureProposal;
  try {
    structureProposal = await TransactionManager.query(db, query, [proposalId, documentId]);
  } catch (err) {
    logger.error('Error fetching structure proposal', { error: err.message, proposalId, documentId });
    throw new ApiError(500, 'Failed to fetch structure proposal', 'DATABASE_ERROR', { details: err.message });
  }

  if (!structureProposal) {
    throw new ApiError(404, 'Structure proposal not found', 'NOT_FOUND');
  }

  // Get document voting settings
  const userId = getUserId(req);
  const { votingAnonymous: isAnonymous } = await getDocumentVotingSettings(db, documentId);

  // Enrich with operations, votes, and comments
  const result = await enrichStructureProposal(db, structureProposal, isAnonymous, userId);
  res.json({ structureProposal: result });
}));

// Vote on a structure proposal
router.post('/:proposalId/vote', requireAuth, requireDocumentAccess, ...structureProposalValidation.vote, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const { documentId, proposalId } = req.params;
  const { vote } = req.body;
  const userId = getUserId(req);

  if (!['PRO', 'NEUTRAL', 'CONTRA'].includes(vote)) {
    return next(ApiError.validation('Invalid vote type. Must be PRO, NEUTRAL, or CONTRA', null, 'INVALID_VOTE_TYPE'));
  }

  try {
    // Check if structure proposal exists, is not applied, and voting not closed
    const proposal = await TransactionManager.query(db, `
      SELECT id, applied, voting_deadline FROM structure_proposals
      WHERE id = ? AND document_id = ?
    `, [proposalId, documentId]);

    if (!proposal) {
      return next(ApiError.notFound('Structure proposal', 'STRUCTURE_PROPOSAL_NOT_FOUND'));
    }

    if (proposal.applied) {
      return next(ApiError.validation('Cannot vote on an already applied structure proposal', null, 'PROPOSAL_ALREADY_APPLIED'));
    }

    if (proposal.voting_deadline && new Date(proposal.voting_deadline) <= new Date()) {
      return next(ApiError.forbidden('Voting has ended for this proposal', 'VOTING_CLOSED'));
    }

    // Check document status - block voting on agreed/rejected documents (allow agreed when amendments open)
    const doc = await TransactionManager.query(db, `
      SELECT status, amendments_open FROM documents WHERE id = ?
    `, [documentId]);

    if (doc?.status === 'rejected') {
      return next(ApiError.forbidden(
        'Cannot vote on structure proposals for rejected documents.',
        'DOCUMENT_REJECTED'
      ));
    }
    if (doc?.status === 'agreed' && !doc.amendments_open) {
      return next(ApiError.forbidden(
        'Cannot vote on structure proposals for agreed documents unless amendments are open.',
        'DOCUMENT_AGREED'
      ));
    }

    // Use voting lock to prevent race conditions
    // Lock on structure_proposal level to prevent concurrent votes on the same proposal
    return await votingLockManager.withVoteLock('structure_proposal', proposalId, async () => {
      const existingVote = await TransactionManager.query(db,
        'SELECT id, receipt_id FROM structure_proposal_votes WHERE structure_proposal_id = ? AND user_id = ?',
        [proposalId, userId]
      );

      const voteId = existingVote ? existingVote.id : uuidv4();
      const isUpdate = !!existingVote;
      const voteRecordedAt = new Date().toISOString();
      const receiptId = existingVote?.receipt_id || generateReceiptId();
      const voteHash = computeVoteHash('structure', {
        contestId: proposalId,
        choice: vote,
        timestamp: voteRecordedAt,
        receiptId
      });

      await TransactionManager.executeInTransaction(db, async (txDb) => {
        const insertSql = `
          INSERT INTO structure_proposal_votes (id, structure_proposal_id, user_id, vote, receipt_id, vote_hash)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT (id) DO UPDATE SET
            structure_proposal_id = EXCLUDED.structure_proposal_id,
            user_id = EXCLUDED.user_id,
            vote = EXCLUDED.vote,
            receipt_id = EXCLUDED.receipt_id,
            vote_hash = EXCLUDED.vote_hash
        `;
        await TransactionManager.execute(txDb, insertSql, [voteId, proposalId, userId, vote, receiptId, voteHash]);
        await voteVerificationLog.appendLogEntry(txDb, {
          voteType: 'structure',
          contestId: proposalId,
          choice: vote,
          timestamp: voteRecordedAt,
          receiptId,
          voteHash
        });
        // WP5 atomicity: approval check inside same transaction as vote INSERT (txDb)
        await checkAndUpdateStructureProposalApproval(txDb, documentId, proposalId);
      });

      // Get document voting settings and fetch votes for WebSocket update (outside transaction for read)
      let formattedVotes = [];
      let isAnonymous = false;
      
      try {
        const { votingAnonymous: votingAnonymous } = await getDocumentVotingSettings(db, documentId);
        isAnonymous = votingAnonymous;

        // Fetch all votes for this proposal to include in WebSocket update
        const votes = await TransactionManager.queryAll(db, `
          SELECT v.id, v.user_id, v.vote, v.created_at,
                 u.name as user_name, u.email as user_email
          FROM structure_proposal_votes v
          LEFT JOIN users u ON v.user_id = u.id
          WHERE v.structure_proposal_id = ?
          ORDER BY v.created_at ASC
        `, [proposalId]);

        // Format votes for broadcast using unified service
        formattedVotes = UnifiedVotingService.formatVotesForResponse(votes, isAnonymous, userId);

        // Calculate vote counts from formatted votes
        const voteCounts = calculateVoteCounts(formattedVotes);
        voteCounts.userId = userId;
        voteCounts.vote = vote;

        // Validate that vote counts match votes array
        const validation = validateVoteCounts(voteCounts, formattedVotes);
        if (!validation.isValid) {
          logger.error('Vote counts validation failed for structure proposal', {
            error: validation.error,
            proposalId,
            documentId,
            provided: validation.provided,
            calculated: validation.calculated
          });
        } else if (validation.warning) {
          logger.warn('Vote counts validation warning for structure proposal', {
            warning: validation.warning,
            proposalId,
            documentId,
            provided: validation.provided,
            calculated: validation.calculated
          });
        }

        // Broadcast real-time update via WebSocket with both vote counts and all votes
        webSocketManager.broadcastDocumentUpdate(documentId, 'structure-proposal-vote', {
          type: 'structure-proposal-vote',
          proposalId,
          voteId,
          userId,
          vote,
          action: isUpdate ? 'updated' : 'cast',
          voteCounts,
          allVotes: formattedVotes, // Include all votes for instant UI update
          isAnonymous // Include anonymity flag so client knows how to display
        });

        // Also broadcast to organization room if document belongs to organization
        const doc = await TransactionManager.query(db, 'SELECT organization_id FROM documents WHERE id = ?', [documentId]);
        if (doc?.organization_id) {
          webSocketManager.broadcastOrganizationUpdate(doc.organization_id, 'structure-proposal-vote', {
            type: 'structure-proposal-vote',
            proposalId,
            documentId,
            voteId,
            userId,
            vote,
            action: isUpdate ? 'updated' : 'cast',
            voteCounts,
            allVotes: formattedVotes,
            isAnonymous
          });
        }
      } catch (docErr) {
        logger.error('Error fetching document voting settings or votes', { error: docErr.message, documentId, proposalId });
        // Fallback: broadcast without votes, client will reload
        webSocketManager.broadcastDocumentUpdate(documentId, 'structure-proposal-vote', {
          type: 'structure-proposal-vote',
          proposalId,
          voteId,
          userId,
          vote,
          action: isUpdate ? 'updated' : 'cast'
        });

        // Try to broadcast to organization room even on error
        try {
          const doc = await TransactionManager.query(db, 'SELECT organization_id FROM documents WHERE id = ?', [documentId]);
          if (doc?.organization_id) {
            webSocketManager.broadcastOrganizationUpdate(doc.organization_id, 'structure-proposal-vote', {
              type: 'structure-proposal-vote',
              proposalId,
              documentId,
              voteId,
              userId,
              vote,
              action: isUpdate ? 'updated' : 'cast'
            });
          }
        } catch (orgErr) {
          logger.warn('Failed to broadcast structure proposal vote to organization room', { error: orgErr.message, documentId });
        }
      }

      // Invalidate caches
      UnifiedVotingService.invalidateCache(documentId, 'document', proposalId);

      res.json({
        message: isUpdate ? 'Vote updated successfully' : 'Vote recorded successfully',
        votes: formattedVotes,
        voteId,
        vote,
        isAnonymous,
        receiptId,
        contestId: proposalId,
        voteType: 'structure',
        voteRecordedAt
      });
    });
  } catch (error) {
    // Re-throw ApiError instances
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Error in structure proposal vote endpoint', { error: error.message, stack: error.stack, proposalId, documentId, userId });
    throw ApiError.database('Failed to process vote request', { originalError: error.message }, 'PROCESS_VOTE_REQUEST_FAILED');
  }
}));

// Complete vote on structure proposal (close voting, evaluate outcome, apply if approved)
router.post('/:proposalId/complete', requireAuth, requireDocumentAccess, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const { documentId, proposalId } = req.params;
  const userId = getUserId(req);

  // Check if user is document owner or representative (same as apply)
  const document = await TransactionManager.query(db,
    'SELECT owner_id, ownership_type, organization_id, acceptance_threshold FROM documents WHERE id = ?',
    [documentId]
  );

  if (!document) {
    return next(ApiError.notFound('Document', 'DOCUMENT_NOT_FOUND'));
  }

  if (document.ownership_type === 'organizational' && document.organization_id) {
    const repResult = await TransactionManager.query(db, `
      SELECT COUNT(*) as count FROM organization_representatives
      WHERE organization_id = ? AND user_id = ? AND status = 'active'
    `, [document.organization_id, userId]);
    if ((repResult?.count || 0) === 0) {
      return next(ApiError.forbidden('Only representatives can complete structure proposal votes', 'NOT_REPRESENTATIVE'));
    }
  } else {
    if (document.owner_id !== userId) {
      return next(ApiError.forbidden('Only document owner can complete structure proposal votes', 'NOT_DOCUMENT_OWNER'));
    }
  }

  // Fetch proposal; reject if applied or already closed
  const proposal = await TransactionManager.query(db, `
    SELECT id, applied, voting_deadline, approved FROM structure_proposals
    WHERE id = ? AND document_id = ?
  `, [proposalId, documentId]);

  if (!proposal) {
    return next(ApiError.notFound('Structure proposal', 'STRUCTURE_PROPOSAL_NOT_FOUND'));
  }
  if (proposal.applied) {
    return next(ApiError.validation('Structure proposal already applied', null, 'PROPOSAL_ALREADY_APPLIED'));
  }
  if (proposal.voting_deadline && new Date(proposal.voting_deadline) <= new Date()) {
    return next(ApiError.validation('Voting has already been completed for this proposal', null, 'PROPOSAL_ALREADY_CLOSED'));
  }

  // Require participation threshold (quorum) before completing
  const voteAggregation = await UnifiedVotingService.aggregateVotes(db, 'structure_proposal_votes', 'structure_proposal_id', proposalId);
  const totalEligible = await UnifiedVotingService.getEligibleVoterCount(db, documentId, 'document');
  const acceptanceThreshold = document.acceptance_threshold || 75.0;

  await UnifiedVotingService.requireQuorumForComplete(db, {
    proposalId,
    organizationId: document.organization_id || null,
    proVotes: voteAggregation.proVotes,
    totalVotes: voteAggregation.totalVotes,
    totalEligible,
    acceptanceThreshold
  });

  // Lock voting by setting voting_deadline to now
  const now = new Date().toISOString();
  await TransactionManager.execute(db, `
    UPDATE structure_proposals SET voting_deadline = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND document_id = ?
  `, [now, proposalId, documentId]);

  // Re-evaluate approval and update approved flag
  await checkAndUpdateStructureProposalApproval(db, documentId, proposalId);

  // Fetch updated proposal to check if approved
  const updatedProposal = await TransactionManager.query(db, `
    SELECT approved FROM structure_proposals WHERE id = ? AND document_id = ?
  `, [proposalId, documentId]);

  const applied = updatedProposal?.approved === true;
  if (applied) {
    const knex = req.app.locals.knex || req.app.locals.db;
    await applyStructureProposal(knex, documentId, proposalId, userId);
    await TransactionManager.execute(db, `
      UPDATE structure_proposals SET applied = true, status = 'approved', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND document_id = ? AND approved = true
    `, [proposalId, documentId]);
  } else {
    await TransactionManager.execute(db, `
      UPDATE structure_proposals SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND document_id = ?
    `, [proposalId, documentId]);
  }

  const outcome = applied ? 'approved' : 'rejected';

  webSocketManager.broadcastDocumentUpdate(documentId, 'structure-proposal-completed', {
    proposalId,
    documentId,
    applied,
    outcome,
    userId
  });

  const doc = await TransactionManager.query(db, 'SELECT organization_id FROM documents WHERE id = ?', [documentId]);
  if (doc?.organization_id) {
    webSocketManager.broadcastOrganizationUpdate(doc.organization_id, 'structure-proposal-completed', {
      proposalId,
      documentId,
      applied,
      outcome,
      userId
    });

    const proposalRow = await TransactionManager.query(db, 'SELECT title FROM structure_proposals WHERE id = ?', [proposalId]);
    await logOrganizationAudit(db, doc.organization_id, applied ? 'structure_proposal_approved' : 'structure_proposal_rejected', userId, {
      proposalId,
      documentId,
      proposalTitle: proposalRow?.title || 'Structure proposal'
    }, req);
  }

  metricsCollector.recordBusinessEvent('structure_proposal_completed', {
    structureProposalId: proposalId,
    documentId,
    userId,
    outcome
  });

  res.json({
    message: 'Vote completed successfully',
    applied,
    outcome
  });
}));

// Apply an already-approved proposal without closing voting via /complete (tests + manual ops).
// POST /:proposalId/complete closes voting, enforces quorum, then may apply; this endpoint applies when approved is already true.
router.post('/:proposalId/apply', requireAuth, requireDocumentAccess, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const { documentId, proposalId } = req.params;
  const userId = getUserId(req);

  const document = await TransactionManager.query(db,
    'SELECT owner_id, ownership_type, organization_id FROM documents WHERE id = ?',
    [documentId]
  );

  if (!document) {
    return next(ApiError.notFound('Document', 'DOCUMENT_NOT_FOUND'));
  }

  if (document.ownership_type === 'organizational' && document.organization_id) {
    const repResult = await TransactionManager.query(db, `
      SELECT COUNT(*) as count FROM organization_representatives
      WHERE organization_id = ? AND user_id = ? AND status = 'active'
    `, [document.organization_id, userId]);
    if ((repResult?.count || 0) === 0) {
      return next(ApiError.forbidden('Only representatives can apply structure proposals', 'NOT_REPRESENTATIVE'));
    }
  } else if (document.owner_id !== userId) {
    return next(ApiError.forbidden('Only document owner can apply structure proposals', 'NOT_DOCUMENT_OWNER'));
  }

  const proposal = await TransactionManager.query(db, `
    SELECT id, applied, approved FROM structure_proposals
    WHERE id = ? AND document_id = ?
  `, [proposalId, documentId]);

  if (!proposal) {
    return next(ApiError.notFound('Structure proposal', 'STRUCTURE_PROPOSAL_NOT_FOUND'));
  }
  if (proposal.applied) {
    return next(ApiError.validation('Structure proposal already applied', null, 'PROPOSAL_ALREADY_APPLIED'));
  }
  if (proposal.approved !== true) {
    return next(ApiError.validation('Cannot apply an unapproved structure proposal', null, 'STRUCTURE_PROPOSAL_NOT_APPROVED'));
  }

  const knex = req.app.locals.knex || req.app.locals.db;
  await applyStructureProposal(knex, documentId, proposalId, userId);
  await TransactionManager.execute(db, `
    UPDATE structure_proposals SET applied = true, status = 'approved', updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND document_id = ? AND approved = true
  `, [proposalId, documentId]);

  webSocketManager.broadcastDocumentUpdate(documentId, 'structure-proposal-applied', {
    proposalId,
    documentId,
    userId
  });

  const docRow = await TransactionManager.query(db, 'SELECT organization_id FROM documents WHERE id = ?', [documentId]);
  if (docRow?.organization_id) {
    webSocketManager.broadcastOrganizationUpdate(docRow.organization_id, 'structure-proposal-applied', {
      proposalId,
      documentId,
      userId
    });
  }

  metricsCollector.recordBusinessEvent('structure_proposal_applied', {
    structureProposalId: proposalId,
    documentId,
    userId
  });

  res.json({
    message: 'Structure proposal applied successfully',
    applied: true
  });
}));

// Cancel/delete a structure proposal (only by creator)
router.delete('/:proposalId', requireAuth, requireDocumentAccess, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const { documentId, proposalId } = req.params;
  const userId = getUserId(req);

  // Check if user is the creator of the proposal
  const creatorQuery = `
    SELECT user_id, applied FROM structure_proposals
    WHERE id = ? AND document_id = ?
  `;

  let proposal = null;
  try {
    proposal = await TransactionManager.query(db, creatorQuery, [proposalId, documentId]);
  } catch (err) {
    logger.error('Error checking proposal creator', { error: err.message, proposalId: req.params.proposalId, documentId });
    throw ApiError.database('Failed to check proposal ownership', { originalError: err.message }, 'CHECK_PROPOSAL_OWNERSHIP_FAILED');
  }

  if (!proposal) {
    return next(ApiError.notFound('Structure proposal', 'STRUCTURE_PROPOSAL_NOT_FOUND'));
  }

  if (proposal.user_id !== userId) {
    return next(ApiError.forbidden('Only the proposal creator can delete it', 'NOT_PROPOSAL_CREATOR'));
  }

  if (proposal.applied) {
    return next(ApiError.validation('Cannot delete an already applied proposal', null, 'CANNOT_DELETE_APPLIED_PROPOSAL'));
  }

  // Delete the proposal and all related data in a transaction
  await TransactionManager.executeInTransaction(db, async (trx) => {
    await TransactionManager.execute(trx, 'DELETE FROM structure_operations WHERE structure_proposal_id = ?', [proposalId]);

    await TransactionManager.execute(trx, 'DELETE FROM structure_proposal_votes WHERE structure_proposal_id = ?', [proposalId]);

    // Comments are now handled by unified comments table with CASCADE or soft delete
    // No need to explicitly delete comments here

    // Delete proposal
    await TransactionManager.execute(trx, 'DELETE FROM structure_proposals WHERE id = ?', [proposalId]);
  });

  res.json({ message: 'Structure proposal deleted successfully' });
}));

// Comment routes are now handled by unified comments route mounted in bootstrap.js
// POST /api/documents/:documentId/structure-proposals/:proposalId/comments
// GET /api/documents/:documentId/structure-proposals/:proposalId/comments
// PUT /api/documents/:documentId/structure-proposals/:proposalId/comments/:commentId
// DELETE /api/documents/:documentId/structure-proposals/:proposalId/comments/:commentId

// Helper function to check and update structure proposal approval
async function checkAndUpdateStructureProposalApproval(db, documentId, proposalId) {
  try {
    // Get document threshold, ownership type, organization_id
    const document = await TransactionManager.query(db, 
      'SELECT acceptance_threshold, ownership_type, owner_id, organization_id FROM documents WHERE id = ?', 
      [documentId]
    );

    if (!document) {
      logger.error('Document not found', { documentId });
      return;
    }

    const threshold = document.acceptance_threshold || 75.0;

    await UnifiedVotingService.checkAndUpdateApproval(db, {
      proposalId,
      contextId: documentId,
      contextType: 'document',
      voteTable: 'structure_proposal_votes',
      proposalIdColumn: 'structure_proposal_id',
      proposalTable: 'structure_proposals',
      approvalColumn: 'approved',
      acceptanceThreshold: threshold,
      organizationId: document.organization_id || null,
      autoApprovePersonal: true,
      documentInfo: document,
      onApproved: async () => {
        logger.debug('Structure proposal approved', { proposalId, documentId });
      }
    });
  } catch (error) {
    logger.error('Error in checkAndUpdateStructureProposalApproval', { error: error.message, proposalId, documentId });
    // Error is logged, function completes (don't throw to avoid breaking the calling code)
  }
}

// Helper function to create structure version snapshot
async function createStructureVersion(knexOrTrx, documentId, proposalId, userId, operations) {
  // Get current document structure before changes
  const structureQuery = `
    SELECT id, text, title, order_index, heading_level, created_at, updated_at
    FROM paragraphs
    WHERE document_id = ?
    ORDER BY order_index ASC
  `;

  const paragraphs = await TransactionManager.queryAll(knexOrTrx, structureQuery, [documentId]);

  const currentStructure = paragraphs.map(p => ({
    id: p.id,
    text: p.text,
    title: p.title,
    orderIndex: p.order_index,
    headingLevel: p.heading_level,
    createdAt: p.created_at,
    updatedAt: p.updated_at
  }));

  // Get next version number
  const result = await TransactionManager.query(knexOrTrx,
    'SELECT MAX(version_number) as max_version FROM document_structure_versions WHERE document_id = ?',
    [documentId]
  );

  const nextVersion = (result?.max_version || 0) + 1;
  const versionId = uuidv4();

  // Create version record
  await TransactionManager.execute(knexOrTrx, `
    INSERT INTO document_structure_versions (
      id, document_id, version_number, created_by, structure_snapshot,
      change_type, related_proposal_id, description
    ) VALUES (?, ?, ?, ?, ?, 'structure_proposal', ?, 'Applied structure proposal')
  `, [
    versionId,
    documentId,
    nextVersion,
    userId,
    JSON.stringify(currentStructure),
    proposalId
  ]);

  // Create detailed change log for each operation
  // Fail-fast: if history creation fails, rollback the entire transaction
  await createChangeLog(knexOrTrx, documentId, versionId, operations);
}

// Helper function to create detailed change log
async function createChangeLog(knexOrTrx, documentId, versionId, operations) {
  if (!operations || operations.length === 0) {
    return;
  }

  const { extractOperationFields } = require('../utils/fieldExtractor');
  
  await Promise.all(operations.map(async (operation) => {
    const logId = uuidv4();
    // Extract all operation fields using utility
    const {
      operationType: operation_type,
      sourceParagraphIds: source_paragraph_ids,
      targetParagraphId: target_paragraph_id,
      newPositionIndex: new_position_index,
      newText: new_text,
      newHeadingLevel: new_heading_level
    } = extractOperationFields(operation);

    // Get old data for affected paragraphs
    let oldDataQueries = [];

    if (target_paragraph_id) {
      oldDataQueries.push(
        TransactionManager.query(knexOrTrx, 
          'SELECT order_index, text, title, heading_level FROM paragraphs WHERE id = ?', 
          [target_paragraph_id]
        ).catch((err) => {
          // Log warning if query fails (paragraph may not exist, which is acceptable for history)
          logger.warn('Failed to fetch old paragraph data for history', {
            paragraphId: target_paragraph_id,
            operationType: operation_type,
            error: err.message
          });
          return null;
        })
      );
    }

    if (source_paragraph_ids && operation_type === 'MERGE') {
      const sourceIds = safeJsonParseArray(source_paragraph_ids);
      sourceIds.forEach(id => {
        oldDataQueries.push(
          TransactionManager.query(knexOrTrx, 
            'SELECT order_index, text, title, heading_level FROM paragraphs WHERE id = ?', 
            [id]
          ).catch((err) => {
            // Log warning if query fails (paragraph may not exist, which is acceptable for history)
            logger.warn('Failed to fetch old paragraph data for history', {
              paragraphId: id,
              operationType: operation_type,
              error: err.message
            });
            return null;
          })
        );
      });
    }

    const oldDataArray = await Promise.all(oldDataQueries);
    const oldData = oldDataArray.filter(d => d !== null);

    // Prepare new data based on operation
    let newData = {};
    let metadata = {};

    switch (operation_type) {
      case 'MOVE':
        newData = { order_index: new_position_index };
        break;
      case 'MERGE':
        metadata = { source_paragraph_ids: safeJsonParseArray(source_paragraph_ids) };
        break;
      case 'DELETE':
        newData = { text: '' };
        break;
      case 'INSERT_NEW':
        newData = {
          text: new_text,
          order_index: new_position_index,
          heading_level: new_heading_level
        };
        break;
      case 'RENAME_HEADING':
        newData = { title: new_text };
        break;
      case 'CHANGE_HEADING_LEVEL':
        newData = { heading_level: new_heading_level };
        break;
    }

    // Fail-fast: if history log creation fails, propagate error to rollback transaction
    await TransactionManager.execute(knexOrTrx, `
      INSERT INTO structure_change_log (
        id, document_id, version_id, operation_type, paragraph_id,
        old_data, new_data, operation_metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      logId,
      documentId,
      versionId,
      operation_type,
      target_paragraph_id,
      JSON.stringify(oldData),
      JSON.stringify(newData),
      JSON.stringify(metadata)
    ]);
  }));
}

// Helper function to apply structure proposal changes
async function applyStructureProposal(knexOrTrx, documentId, proposalId, userId) {
  // Get all operations for this proposal
  const operationsQuery = `
    SELECT id, structure_proposal_id, operation_type, source_paragraph_ids, target_paragraph_id, 
      new_position_index, new_parent_id, new_text, new_heading_level, operation_data, created_at
    FROM structure_operations
    WHERE structure_proposal_id = ?
    ORDER BY
      CASE operation_type
        WHEN 'DELETE' THEN 1
        WHEN 'MERGE' THEN 2
        WHEN 'SPLIT' THEN 3
        WHEN 'MOVE' THEN 4
        WHEN 'RENAME_HEADING' THEN 5
        WHEN 'CHANGE_HEADING_LEVEL' THEN 6
        WHEN 'INSERT_NEW' THEN 7
        ELSE 8
      END,
      created_at ASC
  `;

  const operations = await TransactionManager.queryAll(knexOrTrx, operationsQuery, [proposalId]);

  if (!operations || operations.length === 0) {
    return; // Nothing to apply
  }

  // Execute all operations within a transaction
  await TransactionManager.executeInTransaction(knexOrTrx, async (trx) => {
    // Create structure version snapshot BEFORE applying changes
    // Fail-fast: if versioning fails, rollback the entire transaction
    await createStructureVersion(trx, documentId, proposalId, userId, operations);

    // Separate MOVE operations from other operations
    const { extractOperationFields } = require('../utils/fieldExtractor');
    const moveOperations = [];
    const otherOperations = [];
    
    operations.forEach(op => {
      const { operationType } = extractOperationFields(op);
      if (operationType === 'MOVE') {
        moveOperations.push(op);
      } else {
        otherOperations.push(op);
      }
    });

    logger.debug('Separated operations for batch processing', { 
      documentId, 
      moveCount: moveOperations.length, 
      otherCount: otherOperations.length 
    });

    // Separate operations by type
    const deleteMergeOps = otherOperations.filter(op => {
      const { operationType: opType } = extractOperationFields(op);
      return opType === 'DELETE' || opType === 'MERGE';
    });
    const remainingOps = otherOperations.filter(op => {
      const { operationType: opType } = extractOperationFields(op);
      return opType !== 'DELETE' && opType !== 'MERGE';
    });

    // Check if there are any operations to execute
    if (deleteMergeOps.length === 0 && moveOperations.length === 0 && remainingOps.length === 0) {
      logger.debug('No operations to execute, finalizing proposal', { documentId });
      logger.info('Successfully applied 0 structure operations', { documentId });
      return;
    }

    // Track affected paragraph IDs and order_index ranges for optimized renormalization check
    const affectedParagraphIds = new Set();
    const affectedOrderIndexRange = { min: Infinity, max: -1 };

    // Helper to track affected paragraphs
    const trackAffectedParagraph = (paragraphId, orderIndex) => {
      if (paragraphId) {
        affectedParagraphIds.add(paragraphId);
      }
      if (orderIndex !== null && orderIndex !== undefined && orderIndex >= 0) {
        affectedOrderIndexRange.min = Math.min(affectedOrderIndexRange.min, orderIndex);
        affectedOrderIndexRange.max = Math.max(affectedOrderIndexRange.max, orderIndex);
      }
    };

    // Step 1: Execute DELETE and MERGE operations first (they remove paragraphs)
    for (let i = 0; i < deleteMergeOps.length; i++) {
      const operation = deleteMergeOps[i];
      const { operationType, targetParagraphId, sourceParagraphIds, newPositionIndex } = extractOperationFields(operation);
      logger.debug('Executing DELETE/MERGE operation', { 
        operationIndex: i + 1, 
        total: deleteMergeOps.length, 
        operationType, 
        documentId 
      });

      // Track affected paragraphs before execution
      if (targetParagraphId) {
        affectedParagraphIds.add(targetParagraphId);
      }
      if (sourceParagraphIds) {
        const sourceIds = safeJsonParseArray(sourceParagraphIds);
        sourceIds.forEach(id => affectedParagraphIds.add(id));
      }

      await executeOperation(trx, documentId, operation);
    }

    // Step 2: Process MOVE operations in batch
    if (moveOperations.length > 0) {
      // Track affected paragraphs from MOVE operations
      moveOperations.forEach(op => {
        const { targetParagraphId, newPositionIndex } = extractOperationFields(op);
        trackAffectedParagraph(targetParagraphId, newPositionIndex);
      });
      await executeMoveOperations(trx, documentId, moveOperations);
    }

    // Step 3: Process remaining operations (RENAME, CHANGE_HEADING, INSERT, etc.)
    for (let i = 0; i < remainingOps.length; i++) {
      const operation = remainingOps[i];
      const { operationType, targetParagraphId, newPositionIndex } = extractOperationFields(operation);
      logger.debug('Executing remaining structure operation', { 
        operationIndex: i + 1, 
        total: remainingOps.length, 
        operationType, 
        documentId 
      });

      // Track affected paragraphs
      trackAffectedParagraph(targetParagraphId, newPositionIndex);

      await executeOperation(trx, documentId, operation);
    }

    // After all operations are applied, invalidate affected paragraph proposals
    // This is non-critical but should succeed - log errors but don't fail transaction
    try {
      await invalidateAffectedProposals(trx, documentId, operations);
    } catch (invalidateErr) {
      logger.error('Error invalidating affected proposals', { 
        error: invalidateErr.message, 
        documentId 
      });
      // Don't fail the whole operation for this - invalidation is a cleanup operation
    }

    // Optional renormalization as safety net (should rarely be needed now)
    // Only check affected paragraphs for performance optimization
    try {
      let paragraphsToCheck = [];
      
      if (affectedParagraphIds.size > 0 || affectedOrderIndexRange.min !== Infinity) {
        // Check only affected paragraphs and their neighbors (to catch gaps)
        const rangePadding = 2; // Check a few paragraphs before/after the affected range
        const minIndex = Math.max(0, affectedOrderIndexRange.min - rangePadding);
        const maxIndex = affectedOrderIndexRange.max + rangePadding;
        
        // Build query to check affected paragraphs and their order_index range
        if (affectedParagraphIds.size > 0) {
          const idsList = Array.from(affectedParagraphIds);
          const placeholders = idsList.map(() => '?').join(',');
          paragraphsToCheck = await TransactionManager.queryAll(trx, `
            SELECT id, order_index FROM paragraphs
            WHERE document_id = ? 
              AND (id IN (${placeholders}) OR (order_index >= ? AND order_index <= ?))
              AND order_index >= 0
            ORDER BY order_index ASC, updated_at ASC
          `, [documentId, ...idsList, minIndex, maxIndex]);
        } else {
          // Fallback: check the affected range if we have one
          paragraphsToCheck = await TransactionManager.queryAll(trx, `
            SELECT id, order_index FROM paragraphs
            WHERE document_id = ? AND order_index >= ? AND order_index <= ?
            ORDER BY order_index ASC, updated_at ASC
          `, [documentId, minIndex, maxIndex]);
        }
      } else {
        // If no affected paragraphs tracked, skip renormalization check
        logger.debug('No affected paragraphs tracked, skipping renormalization check', { documentId });
        paragraphsToCheck = [];
      }

      if (paragraphsToCheck.length === 0) {
        logger.debug('No paragraphs to check for renormalization', { documentId });
      } else {
        // Check if renormalization is needed (gaps or duplicates) in the affected range
        let needsRenormalization = false;
        const usedPositions = new Set();
        
        for (let i = 0; i < paragraphsToCheck.length; i++) {
          const pos = paragraphsToCheck[i].order_index;
          if (usedPositions.has(pos)) {
            // Duplicate position found
            needsRenormalization = true;
            break;
          }
          usedPositions.add(pos);
        }
        
        // If we found duplicates or if the range suggests gaps, check full document
        if (needsRenormalization) {
          logger.warn('Renormalization needed after structure operations (duplicates found)', { 
            documentId, 
            affectedCount: paragraphsToCheck.length 
          });
          
          // Fetch all paragraphs for full renormalization
          const allParagraphs = await TransactionManager.queryAll(trx, `
            SELECT id, order_index FROM paragraphs
            WHERE document_id = ? AND order_index >= 0
            ORDER BY order_index ASC, updated_at ASC
          `, [documentId]);
          
          // Renormalize to sequential positions
          await Promise.all(allParagraphs.map((para, index) =>
            TransactionManager.execute(trx, `
              UPDATE paragraphs SET order_index = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND document_id = ?
            `, [index, para.id, documentId])
          ));
          logger.debug('Renormalized order_index for paragraphs', { 
            documentId, 
            paragraphCount: allParagraphs.length 
          });
        } else {
          logger.debug('No renormalization needed (checked affected paragraphs)', { 
            documentId,
            checkedCount: paragraphsToCheck.length
          });
        }
      }
    } catch (orderErr) {
      logger.error('Error checking paragraphs for renormalization', { 
        error: orderErr.message, 
        documentId 
      });
      // Continue even if check fails - renormalization is a safety net
    }

    logger.info('Successfully applied structure operations', { 
      documentId, 
      operationCount: operations.length 
    });
  });
}

// Helper function to invalidate paragraph proposals affected by structure changes
async function invalidateAffectedProposals(knexOrTrx, documentId, operations) {
  // Get all paragraph IDs affected by the operations
  const affectedParagraphIds = new Set();

  operations.forEach(op => {
    if (op.target_paragraph_id) {
      affectedParagraphIds.add(op.target_paragraph_id);
    }
    if (op.source_paragraph_ids) {
      const sourceIds = safeJsonParseArray(op.source_paragraph_ids);
      sourceIds.forEach(id => affectedParagraphIds.add(id));
    }
  });

  if (affectedParagraphIds.size === 0) {
    return; // No paragraphs affected
  }

  const idsList = Array.from(affectedParagraphIds);
  const placeholders = idsList.map(() => '?').join(',');

  // Mark proposals for affected paragraphs as invalidated
  // The invalidated column exists in the proposals table schema
  logger.debug('Invalidating proposals for paragraphs', { paragraphIds: idsList, documentId });

  await TransactionManager.execute(knexOrTrx, `
    UPDATE proposals SET invalidated = true, updated_at = CURRENT_TIMESTAMP
    WHERE paragraph_id IN (${placeholders}) AND invalidated = false
  `, idsList);
  
  logger.debug('Invalidated proposals for affected paragraphs', { paragraphCount: idsList.length, documentId });
}

// Helper function to validate paragraph existence
async function validateParagraphExists(knexOrTrx, documentId, paragraphId) {
  const row = await TransactionManager.query(
    knexOrTrx,
    'SELECT id FROM paragraphs WHERE id = ? AND document_id = ?',
    [paragraphId, documentId]
  );
  
  if (!row) {
    throw new Error(`Paragraph ${paragraphId} does not exist in document ${documentId}`);
  }
}

// Helper function to validate multiple paragraphs exist
async function validateParagraphsExist(knexOrTrx, documentId, paragraphIds) {
  if (!Array.isArray(paragraphIds) || paragraphIds.length === 0) {
    return; // Empty array is valid
  }

  const placeholders = paragraphIds.map(() => '?').join(',');
  const query = `SELECT COUNT(*) as count FROM paragraphs WHERE id IN (${placeholders}) AND document_id = ?`;

  const row = await TransactionManager.query(knexOrTrx, query, [...paragraphIds, documentId]);

  const found = Number(row?.count ?? 0);
  if (found !== paragraphIds.length) {
    throw new Error(`Some paragraphs do not exist in document ${documentId}`);
  }
}

// Helper function to batch execute all MOVE operations together
// This avoids conflicts when multiple paragraphs are moved simultaneously
async function executeMoveOperations(knexOrTrx, documentId, moveOperations) {
  if (!moveOperations || moveOperations.length === 0) {
    return; // No moves to execute
  }

  const { extractOperationFields } = require('../utils/fieldExtractor');
  
  // Extract target paragraph IDs and desired positions from MOVE operations
  const moveMap = new Map(); // paragraphId -> desired position
  const paragraphIds = [];
  
  moveOperations.forEach(op => {
    const {
      operationType: operation_type,
      targetParagraphId: target_paragraph_id,
      newPositionIndex: new_position_index
    } = extractOperationFields(op);
    
    if (operation_type !== 'MOVE') {
      logger.warn('Non-MOVE operation passed to executeMoveOperations', { operationType: operation_type });
      return;
    }
    
    if (!target_paragraph_id || new_position_index === null || new_position_index === undefined) {
      logger.warn('MOVE operation missing required fields', { operation: op });
      return;
    }
    
    // If multiple operations target the same paragraph, use the last one
    // (operations are already sorted by created_at)
    moveMap.set(target_paragraph_id, new_position_index);
    paragraphIds.push(target_paragraph_id);
  });
  
  if (moveMap.size === 0) {
    return; // No valid moves
  }
  
  // Validate all paragraphs exist
  await validateParagraphsExist(knexOrTrx, documentId, paragraphIds);
  
  // Validate target positions are within reasonable bounds
  let hasInvalidPosition = false;
  moveMap.forEach((targetPos, paraId) => {
    if (targetPos < 0 || targetPos > 10000) {
      logger.error('Invalid target position for MOVE operation', { paraId, targetPos, documentId });
      hasInvalidPosition = true;
    }
  });
  
  if (hasInvalidPosition) {
    throw new Error('MOVE operation target positions must be between 0 and 10000');
  }
  
  // Fetch current paragraph positions
  const paragraphs = await TransactionManager.queryAll(knexOrTrx, `
    SELECT id, order_index
    FROM paragraphs
    WHERE document_id = ? AND order_index >= 0
    ORDER BY order_index ASC, updated_at ASC
  `, [documentId]);
  
  if (!paragraphs || paragraphs.length === 0) {
    logger.warn('No paragraphs found for MOVE operations', { documentId });
    return;
  }
  
  // Validate all moved paragraphs exist in the fetched list
  const paragraphIdsSet = new Set(paragraphs.map(p => p.id));
  let allMovedExist = true;
  moveMap.forEach((targetPos, paraId) => {
    if (!paragraphIdsSet.has(paraId)) {
      logger.error('Moved paragraph not found in document', { paraId, documentId });
      allMovedExist = false;
    }
  });
  
  if (!allMovedExist) {
    throw new Error('Some moved paragraphs do not exist in the document');
  }

  // Build current position map
  const currentPositions = new Map();
  paragraphs.forEach((para, index) => {
    currentPositions.set(para.id, para.order_index !== null ? para.order_index : index);
  });
  
  const movedParagraphs = new Set(moveMap.keys());
  
  // Algorithm: Build new order by inserting moved paragraphs at their target positions
  // 1. Create list of moved paragraphs sorted by target position, then by original position
  const movedList = Array.from(moveMap.entries())
    .map(([paraId, targetPos]) => ({
      id: paraId,
      targetPos: targetPos,
      originalPos: currentPositions.get(paraId) || 0
    }))
    .sort((a, b) => {
      // Sort by target position first, then by original position for conflicts
      if (a.targetPos !== b.targetPos) {
        return a.targetPos - b.targetPos;
      }
      return a.originalPos - b.originalPos;
    });
  
  // 2. Build new order by iterating through original positions and inserting moved paragraphs
  const newOrder = [];
  let movedIndex = 0;
  
  paragraphs.forEach((para, originalIndex) => {
    // Insert all moved paragraphs that should come before this position
    while (movedIndex < movedList.length && movedList[movedIndex].targetPos <= originalIndex) {
      newOrder.push(movedList[movedIndex].id);
      movedIndex++;
    }
    
    // Add current paragraph if it's not being moved
    if (!movedParagraphs.has(para.id)) {
      newOrder.push(para.id);
    }
  });
  
  // 3. Add any remaining moved paragraphs (target position beyond document length)
  while (movedIndex < movedList.length) {
    newOrder.push(movedList[movedIndex].id);
    movedIndex++;
  }
  
  // 4. Assign sequential positions (0, 1, 2, ...)
  const finalPositions = new Map();
  newOrder.forEach((paraId, index) => {
    finalPositions.set(paraId, index);
  });
  
  // Validate: all moved paragraphs should have final positions
  let allValid = true;
  moveMap.forEach((targetPos, paraId) => {
    if (!finalPositions.has(paraId)) {
      logger.error('Failed to assign final position to moved paragraph', { paraId, targetPos, documentId });
      allValid = false;
    }
  });
  
  if (!allValid) {
    throw new Error('Failed to calculate final positions for all moved paragraphs');
  }
  
  // Apply all position updates
  const updates = Array.from(finalPositions.entries());
  
  if (updates.length === 0) {
    return; // No updates needed
  }
  
  logger.debug('Applying batch MOVE operations', { 
    documentId, 
    moveCount: moveMap.size,
    updateCount: updates.length 
  });
  
  // Update all paragraphs in parallel using Promise.all
  await Promise.all(updates.map(([paraId, newPos]) =>
    TransactionManager.execute(knexOrTrx, `
      UPDATE paragraphs SET order_index = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND document_id = ?
    `, [newPos, paraId, documentId])
  ));
  
  logger.debug('Successfully applied batch MOVE operations', { 
    documentId, 
    moveCount: moveMap.size 
  });
}

// Helper function to execute individual operations
async function executeOperation(knexOrTrx, documentId, operation) {
  // Extract all operation fields using utility
  const { extractOperationFields } = require('../utils/fieldExtractor');
  const {
    operationType: operation_type,
    sourceParagraphIds: source_paragraph_ids,
    targetParagraphId: target_paragraph_id,
    newPositionIndex: new_position_index,
    newParentId: new_parent_id,
    newText: new_text,
    newHeadingLevel: new_heading_level,
    operationData: operation_data
  } = extractOperationFields(operation);

  switch (operation_type) {
    case 'DELETE':
      if (!target_paragraph_id) {
        throw new Error('DELETE operation missing target_paragraph_id');
      }

      // Validate target paragraph exists
      await validateParagraphExists(knexOrTrx, documentId, target_paragraph_id);

      // Mark paragraph as deleted by setting text to empty and updating order
      await TransactionManager.execute(knexOrTrx, `
        UPDATE paragraphs SET text = '', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND document_id = ?
      `, [target_paragraph_id, documentId]);
      break;

    case 'MERGE':
      if (!source_paragraph_ids || !target_paragraph_id) {
        throw new Error('MERGE operation missing required fields');
      }

      const sourceIds = safeJsonParseArray(source_paragraph_ids);
      if (!Array.isArray(sourceIds) || sourceIds.length === 0) {
        throw new Error('Invalid source_paragraph_ids');
      }

      // Validate all referenced paragraphs exist
      const allParagraphIds = [target_paragraph_id, ...sourceIds];
      await validateParagraphsExist(knexOrTrx, documentId, allParagraphIds);

      // Get text from all source paragraphs
      const placeholders = sourceIds.map(() => '?').join(',');
      const textQuery = `SELECT id, text, order_index FROM paragraphs WHERE id IN (${placeholders}) AND document_id = ? ORDER BY order_index`;

      const paragraphs = await TransactionManager.queryAll(knexOrTrx, textQuery, [...sourceIds, documentId]);

      if (paragraphs.length !== sourceIds.length) {
        throw new Error('Some source paragraphs not found');
      }

      const mergedText = paragraphs.map(p => p.text).join('\n\n');
      const minOrderIndex = Math.min(...paragraphs.map(p => p.order_index));

      // Update target paragraph with merged text and preserve minimum order_index
      await TransactionManager.execute(knexOrTrx, `
        UPDATE paragraphs SET text = ?, order_index = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND document_id = ?
      `, [mergedText, minOrderIndex, target_paragraph_id, documentId]);

      // Mark source paragraphs as merged (empty text) to hide them from UI
      // We don't delete them to preserve foreign key relationships
      const sourceIdsToUpdate = sourceIds.filter(id => id !== target_paragraph_id);

      if (sourceIdsToUpdate.length > 0) {
        // Update all source paragraphs in parallel
        await Promise.all(sourceIdsToUpdate.map(sourceId =>
          TransactionManager.execute(knexOrTrx, `
            UPDATE paragraphs SET text = '', order_index = -999, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND document_id = ?
          `, [sourceId, documentId])
        ));
      }
      break;

    case 'MOVE':
      // MOVE operations are now handled in batch by executeMoveOperations
      // This case should not be reached in normal flow, but kept for backward compatibility
      logger.warn('MOVE operation executed individually (should use batch processing)', { 
        target_paragraph_id, 
        documentId 
      });
      if (!target_paragraph_id || new_position_index === null || new_position_index === undefined) {
        throw new Error('MOVE operation missing required fields');
      }
      
      // Validate position is within reasonable bounds
      if (new_position_index < 0 || new_position_index > 10000) {
        throw new Error('MOVE operation newPositionIndex must be between 0 and 10000');
      }

      // Validate target paragraph exists
      await validateParagraphExists(knexOrTrx, documentId, target_paragraph_id);

      // Update paragraph position
      await TransactionManager.execute(knexOrTrx, `
        UPDATE paragraphs SET order_index = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND document_id = ?
      `, [new_position_index, target_paragraph_id, documentId]);
      break;

    case 'RENAME_HEADING':
      if (!target_paragraph_id || !new_text) {
        throw new Error('RENAME_HEADING operation missing required fields');
      }

      // Validate target paragraph exists
      await validateParagraphExists(knexOrTrx, documentId, target_paragraph_id);

      await TransactionManager.execute(knexOrTrx, `
        UPDATE paragraphs SET title = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND document_id = ?
      `, [new_text, target_paragraph_id, documentId]);
      break;

    case 'CHANGE_HEADING_LEVEL':
      if (!target_paragraph_id || !new_heading_level) {
        throw new Error('CHANGE_HEADING_LEVEL operation missing required fields');
      }

      // Validate target paragraph exists
      await validateParagraphExists(knexOrTrx, documentId, target_paragraph_id);

      await TransactionManager.execute(knexOrTrx, `
        UPDATE paragraphs SET heading_level = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND document_id = ?
      `, [new_heading_level, target_paragraph_id, documentId]);
      break;

    case 'INSERT_NEW':
      if (!new_text || new_position_index === null || new_position_index < 0) {
        throw new Error('INSERT_NEW operation missing required fields or invalid position');
      }

      // Validate that the position index is within reasonable bounds
      if (new_position_index > 10000) {
        throw new Error('INSERT_NEW position index too large');
      }

      // Validate position index BEFORE attempting insert - check for conflicts
      const existingParagraph = await TransactionManager.query(knexOrTrx, `
        SELECT id FROM paragraphs
        WHERE document_id = ? AND order_index = ?
      `, [documentId, new_position_index]);

      if (existingParagraph) {
        throw new Error(`INSERT_NEW position ${new_position_index} conflicts with existing paragraph ${existingParagraph.id}`);
      }

      // Enforce either/or: if heading_level is provided, create heading (title), otherwise create body (text)
      // Standardized to h1-h3 only (matches paragraph creation validation)
      const isHeading = new_heading_level && ['h1', 'h2', 'h3'].includes(new_heading_level.toLowerCase());
      const paragraphTitle = isHeading ? new_text.trim() : null;
      const paragraphText = isHeading ? '' : new_text.trim();
      const paragraphHeadingLevel = isHeading ? new_heading_level.toLowerCase() : null;

      const newParagraphId = uuidv4();
      await TransactionManager.execute(knexOrTrx, `
        INSERT INTO paragraphs (id, document_id, title, text, order_index, heading_level)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [newParagraphId, documentId, paragraphTitle, paragraphText, new_position_index, paragraphHeadingLevel]);
      break;

    case 'SPLIT':
      // LIMITATION: SPLIT operation is not yet implemented
      // This operation would allow splitting a paragraph into multiple paragraphs at specified character positions.
      // Implementation would require:
      // - operation_data schema with splitAt positions and new paragraph definitions
      // - Validation of split positions within paragraph text bounds
      // - Creation of new paragraph records with proper order_index values
      // - Handling of paragraph relationships and history
      // See docs/active/STRUCTURE_PROPOSALS.md for current limitations
      // Frontend does not currently provide UI for SPLIT operations
      throw new Error('SPLIT operation is not yet implemented. This feature is planned for a future release.');

    default:
      throw new Error(`Unknown operation type: ${operation_type}`);
  }
}

module.exports = router;
