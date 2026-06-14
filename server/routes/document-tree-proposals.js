const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const { logger } = require('../middleware/logger');
const { metricsCollector } = require('../middleware/monitoring');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const webSocketManager = require('../modules/websocket');
const UnifiedVotingService = require('../modules/unified-voting');
const TransactionManager = require('../database/services/TransactionManager');
const votingLockManager = require('../utils/votingLocks');
const voteVerificationLog = require('../utils/voteVerificationLog');
const { generateReceiptId, computeVoteHash } = require('../utils/voteReceipt');
const { getUserId } = require('../utils/routeHelpers');
const { calculateVoteCounts, validateVoteCounts } = require('../utils/voteCounts');
const { logOrganizationAudit } = require('../utils/auditLogger');

const router = express.Router({ mergeParams: true });

// Helper function to check if user is member of an ACTIVE organization
// Note: Different from permissions.isActiveMember - this also verifies the organization is active
async function isActiveMemberWithOrgCheck(db, userId, organizationId) {
  const membership = await TransactionManager.query(db, `
    SELECT om.status, o.is_active
    FROM organization_members om
    JOIN organizations o ON om.organization_id = o.id
    WHERE om.organization_id = ? AND om.user_id = ? AND om.status = 'active' AND o.is_active = true
  `, [organizationId, userId]);
  return !!membership;
}

async function assertDocumentAccess(db, userId, documentId) {
  const { buildAccessCheck } = require('../utils/documentQueries');
  const document = await TransactionManager.query(db, `
    SELECT d.id, d.status, d.amendments_open, d.ownership_type, d.organization_id
    FROM documents d
    LEFT JOIN document_collaborators dc ON d.id = dc.document_id AND dc.user_id = ?
    LEFT JOIN organization_members om ON d.organization_id = om.organization_id AND om.user_id = ? AND om.status = 'active'
    LEFT JOIN organizations o ON d.organization_id = o.id AND o.is_active = true
    WHERE d.id = ?
      AND ${buildAccessCheck('d')}
  `, [userId, userId, documentId, userId, userId]);

  if (!document) {
    throw ApiError.notFound('Document', 'DOCUMENT_NOT_FOUND_OR_ACCESS_DENIED');
  }
  return document;
}

// Helper function to check if proposal should be approved
async function checkProposalApproval(db, proposalId, organizationId) {
  const result = await UnifiedVotingService.checkAndUpdateApproval(db, {
    proposalId,
    contextId: organizationId,
    contextType: 'organization',
    voteTable: 'document_tree_proposal_votes',
    proposalIdColumn: 'proposal_id',
    proposalTable: 'document_tree_proposals',
    approvalColumn: 'status',
    acceptanceThreshold: 75.0, // Default, will be overridden by governance rules if available
    organizationId,
    statusValue: 'approved',
    statusCondition: "AND status = 'pending'",
    onApproved: async (approvalResult) => {
      logger.debug('Tree proposal approved', { proposalId, organizationId, approvalPercentage: approvalResult.approvalPercentage });
    }
  });

  return result.approved;
}

const MAX_TREE_SORT_ORDER = 10000;

function normalizeTargetParentId(targetParentId) {
  return targetParentId === undefined || targetParentId === null || targetParentId === '' ? null : targetParentId;
}

function normalizeNewOrder(newOrder) {
  if (newOrder === undefined || newOrder === null || newOrder === '') return null;
  if (!Number.isInteger(Number(newOrder))) return NaN;
  return Number(newOrder);
}

// Validate tree operation
async function validateTreeOperation(db, { documentId, operationType, targetParentId, newOrder }) {
  // Get document info
  const doc = await TransactionManager.query(db, 
    'SELECT id, parent_id, organization_id, sort_order FROM documents WHERE id = ?', 
    [documentId]
  );
  
  if (!doc) {
    return { valid: false, error: 'Document not found', code: 'DOCUMENT_NOT_FOUND' };
  }

  const normalizedTargetParentId = normalizeTargetParentId(targetParentId);
  const normalizedNewOrder = normalizeNewOrder(newOrder);

  if (operationType === 'MOVE') {
    // No-op move guard (same parent)
    if (normalizedTargetParentId === (doc.parent_id || null)) {
      return { valid: false, error: 'Document is already under the selected parent', code: 'MOVE_NO_OP' };
    }

    if (normalizedTargetParentId !== null) {
      // Check if target parent exists and belongs to same organization
      const targetParent = await TransactionManager.query(db,
        'SELECT id, organization_id FROM documents WHERE id = ?',
        [normalizedTargetParentId]
      );
      
      if (!targetParent) {
        return { valid: false, error: 'Target parent document not found', code: 'MOVE_TARGET_PARENT_NOT_FOUND' };
      }
      if (targetParent.organization_id !== doc.organization_id) {
        return { valid: false, error: 'Target parent must belong to same organization', code: 'MOVE_TARGET_PARENT_ORG_MISMATCH' };
      }
      if (normalizedTargetParentId === documentId) {
        return { valid: false, error: 'Cannot move document to itself', code: 'MOVE_TO_SELF' };
      }

      // Check for circular reference (target parent is a descendant of document)
      const checkCircular = async (checkId, visited = new Set()) => {
        if (visited.has(checkId) || checkId === documentId) {
          return true; // Circular reference detected
        }
        visited.add(checkId);
        const child = await TransactionManager.query(db, 
          'SELECT parent_id FROM documents WHERE id = ?', 
          [checkId]
        );
        if (!child || !child.parent_id) {
          return false;
        }
        return await checkCircular(child.parent_id, visited);
      };

      const isCircular = await checkCircular(normalizedTargetParentId);
      if (isCircular) {
        return { valid: false, error: 'Circular reference detected: cannot move document to its own descendant', code: 'MOVE_CIRCULAR_REFERENCE' };
      }
    }

    return { valid: true, error: null, normalizedTargetParentId, normalizedNewOrder: null };
  } else if (operationType === 'DELETE') {
    // Check if document has children
    const result = await TransactionManager.query(db, 
      'SELECT COUNT(*) as count FROM documents WHERE parent_id = ?', 
      [documentId]
    );
    if (result.count > 0) {
      return { valid: false, error: 'Cannot delete document with child documents. Delete children first.', code: 'DELETE_HAS_CHILDREN' };
    }
    return { valid: true, error: null, normalizedTargetParentId: null, normalizedNewOrder: null };
  } else if (operationType === 'REORDER') {
    if (normalizedNewOrder === null || Number.isNaN(normalizedNewOrder)) {
      return { valid: false, error: 'REORDER operation requires an integer new_order value', code: 'REORDER_INVALID_NEW_ORDER' };
    }
    if (normalizedNewOrder < 0 || normalizedNewOrder > MAX_TREE_SORT_ORDER) {
      return { valid: false, error: `REORDER operation new_order must be between 0 and ${MAX_TREE_SORT_ORDER}`, code: 'REORDER_NEW_ORDER_OUT_OF_RANGE' };
    }
    if ((doc.sort_order ?? null) === normalizedNewOrder) {
      return { valid: false, error: 'Document already has this order value', code: 'REORDER_NO_OP' };
    }
    return { valid: true, error: null, normalizedTargetParentId: null, normalizedNewOrder };
  } else {
    return { valid: false, error: 'Invalid operation type', code: 'INVALID_OPERATION_TYPE' };
  }
}

async function applyTreeOperation(trx, proposal) {
  if (proposal.operation_type === 'MOVE') {
    await TransactionManager.execute(trx,
      'UPDATE documents SET parent_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [normalizeTargetParentId(proposal.target_parent_id), proposal.document_id]
    );
    return;
  }
  if (proposal.operation_type === 'DELETE') {
    const documentId = proposal.document_id;
    // Remove dependent rows before deleting the document (FK constraints have no
    // cascade). Mirrors the cleanup performed by DocumentService document deletion.
    await TransactionManager.execute(trx, `
      DELETE FROM structure_proposal_votes
      WHERE structure_proposal_id IN (SELECT id FROM structure_proposals WHERE document_id = ?)
    `, [documentId]);
    await TransactionManager.execute(trx, 'DELETE FROM structure_proposals WHERE document_id = ?', [documentId]);
    await TransactionManager.execute(trx, `
      DELETE FROM votes
      WHERE proposal_id IN (
        SELECT id FROM proposals WHERE paragraph_id IN (SELECT id FROM paragraphs WHERE document_id = ?)
      )
    `, [documentId]);
    await TransactionManager.execute(trx, `
      DELETE FROM comments
      WHERE (commentable_type = 'proposal' AND commentable_id IN (
              SELECT id FROM proposals WHERE paragraph_id IN (SELECT id FROM paragraphs WHERE document_id = ?)
            ))
         OR (commentable_type = 'structure_proposal' AND commentable_id IN (
              SELECT id FROM structure_proposals WHERE document_id = ?
            ))
    `, [documentId, documentId]);
    await TransactionManager.execute(trx, `
      DELETE FROM history WHERE paragraph_id IN (SELECT id FROM paragraphs WHERE document_id = ?)
    `, [documentId]);
    await TransactionManager.execute(trx, `
      DELETE FROM proposals WHERE paragraph_id IN (SELECT id FROM paragraphs WHERE document_id = ?)
    `, [documentId]);
    await TransactionManager.execute(trx, 'DELETE FROM paragraphs WHERE document_id = ?', [documentId]);
    await TransactionManager.execute(trx, 'DELETE FROM document_collaborators WHERE document_id = ?', [documentId]);
    await TransactionManager.execute(trx, `
      DELETE FROM document_tree_proposal_votes
      WHERE proposal_id IN (SELECT id FROM document_tree_proposals WHERE document_id = ?)
    `, [documentId]);
    await TransactionManager.execute(trx, 'DELETE FROM document_tree_proposals WHERE document_id = ?', [documentId]);
    await TransactionManager.execute(trx, 'DELETE FROM documents WHERE id = ?', [documentId]);
    return;
  }
  if (proposal.operation_type === 'REORDER') {
    await TransactionManager.execute(trx,
      'UPDATE documents SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [proposal.new_order, proposal.document_id]
    );
    return;
  }
  throw ApiError.validation('Unsupported tree operation type', null, 'UNSUPPORTED_TREE_OPERATION');
}

// Get all tree proposals for a document
router.get('/:documentId', requireAuth, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const { documentId } = req.params;
  const userId = getUserId(req);

  // Check document access
  const { buildAccessCheck } = require('../utils/documentQueries');
  
  const document = await TransactionManager.query(db, `
    SELECT d.id, d.organization_id, d.ownership_type
    FROM documents d
    LEFT JOIN document_collaborators dc ON d.id = dc.document_id AND dc.user_id = ?
    LEFT JOIN organization_members om ON d.organization_id = om.organization_id AND om.user_id = ? AND om.status = 'active'
    LEFT JOIN organizations o ON d.organization_id = o.id AND o.is_active = true
    WHERE d.id = ? 
      AND ${buildAccessCheck('d')}
  `, [userId, userId, documentId, userId, userId]);

  if (!document) {
    return next(ApiError.notFound('Document', 'DOCUMENT_NOT_FOUND_OR_ACCESS_DENIED'));
  }

  // Get proposals
  const query = `
    SELECT dtp.*,
           u.name as proposed_by_name,
           u.email as proposed_by_email
    FROM document_tree_proposals dtp
    JOIN users u ON dtp.proposed_by_user_id = u.id
    WHERE dtp.document_id = ?
    ORDER BY dtp.created_at DESC
  `;

  let proposals = [];
  try {
    proposals = await TransactionManager.queryAll(db, query, [documentId]);
  } catch (err) {
    if (err.message.includes('no such table')) {
      return res.json({ success: true, proposals: [] });
    }
    logger.error('Error fetching tree proposals', { error: err.message, documentId });
    throw ApiError.database('Failed to fetch tree proposals', { originalError: err.message }, 'FETCH_TREE_PROPOSALS_FAILED');
  }

  // Enrich with votes
  const enrichProposal = async (proposal) => {
    let votes = [];
    try {
      votes = await TransactionManager.queryAll(db, `
        SELECT dtpv.*,
               u.name as voter_name,
               u.email as voter_email
        FROM document_tree_proposal_votes dtpv
        LEFT JOIN users u ON dtpv.user_id = u.id
        WHERE dtpv.proposal_id = ?
        ORDER BY dtpv.created_at ASC
      `, [proposal.id]);
    } catch (err) {
      if (!err.message.includes('no such table')) {
        logger.error('Error fetching votes', { error: err.message, proposalId: proposal.id });
      }
    }

    const voteCounts = { pro: 0, neutral: 0, contra: 0 };
    (votes || []).forEach(vote => {
      if (vote.vote === 'PRO') voteCounts.pro++;
      else if (vote.vote === 'NEUTRAL') voteCounts.neutral++;
      else if (vote.vote === 'CONTRA') voteCounts.contra++;
    });

    const totalVotes = voteCounts.pro + voteCounts.neutral + voteCounts.contra;
    const totalEligible = await UnifiedVotingService.getEligibleVoterCount(db, proposal.organization_id, 'organization');
    const governanceRules = await UnifiedVotingService.getGovernanceRules(db, proposal.organization_id);
    const quorumPercentage = governanceRules?.defaultQuorumPercentage ?? 0.5;
    const minVotersRequired = governanceRules?.minVotersRequired;
    const quorumRequired = minVotersRequired && minVotersRequired > 0
      ? minVotersRequired
      : Math.max(1, Math.ceil(totalEligible * quorumPercentage));
    const quorumMet = totalVotes >= quorumRequired;

    // Prefer votingDeadline (camelCase) for new clients; voting_deadline retained for backward compatibility.
    return {
      ...proposal,
      votes: votes || [],
      voteCounts,
      quorumMet,
      quorumRequired,
      totalEligible,
      votingDeadline: proposal.voting_deadline ?? null
    };
  };

  try {
    const enrichedProposals = await Promise.all((proposals || []).map(enrichProposal));
    res.json({ success: true, proposals: enrichedProposals });
  } catch (err) {
    // Re-throw ApiError instances
    if (err instanceof ApiError) {
      throw err;
    }
    logger.error('Error enriching proposals', { error: err.message, documentId });
    throw ApiError.database('Failed to process proposals', { originalError: err.message }, 'PROCESS_PROPOSALS_FAILED');
  }
}));

// Create tree proposal
router.post('/', requireAuth, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  // transformRequest snake-cases the body; accept both camelCase and snake_case.
  const documentId = req.body.documentId ?? req.body.document_id;
  const operationType = req.body.operationType ?? req.body.operation_type;
  const targetParentId = req.body.targetParentId ?? req.body.target_parent_id;
  const newOrder = req.body.newOrder ?? req.body.new_order;
  const reason = req.body.reason;
  const userId = getUserId(req);

  if (!documentId || !operationType) {
    return next(ApiError.validation('documentId and operationType are required', null, 'DOCUMENT_ID_AND_OPERATION_TYPE_REQUIRED'));
  }

  if (!['MOVE', 'DELETE', 'REORDER'].includes(operationType)) {
    return next(ApiError.validation('Invalid operationType. Must be MOVE, DELETE, or REORDER', null, 'INVALID_OPERATION_TYPE'));
  }

  try {
    // Check document access and get organization
    const { buildAccessCheck } = require('../utils/documentQueries');
    
    const document = await TransactionManager.query(db, `
      SELECT d.id, d.organization_id, d.ownership_type, d.status, d.amendments_open
      FROM documents d
      LEFT JOIN document_collaborators dc ON d.id = dc.document_id AND dc.user_id = ?
      LEFT JOIN organization_members om ON d.organization_id = om.organization_id AND om.user_id = ? AND om.status = 'active'
      LEFT JOIN organizations o ON d.organization_id = o.id AND o.is_active = true
      WHERE d.id = ? 
        AND ${buildAccessCheck('d')}
    `, [userId, userId, documentId, userId, userId]);

    if (!document) {
      return next(ApiError.notFound('Document', 'DOCUMENT_NOT_FOUND_OR_ACCESS_DENIED'));
    }

    if (document.status === 'agreed' && !document.amendments_open) {
      return next(ApiError.forbidden(
        'Document is not open for amendments. Request an organization vote to open it.',
        'AMENDMENTS_NOT_OPEN'
      ));
    }
    if (document.status === 'rejected') {
      return next(ApiError.forbidden(
        'Cannot create tree proposals on rejected documents.',
        'DOCUMENT_REJECTED'
      ));
    }

    // For organizational documents, check if user is active member
    if (document.ownership_type === 'organizational') {
      try {
        const isMember = await isActiveMemberWithOrgCheck(db, userId, document.organization_id);
        if (!isMember) {
          return next(ApiError.forbidden('Only active organization members can create tree proposals', 'NOT_ACTIVE_MEMBER'));
        }

        await createProposal();
      } catch (err) {
        // Re-throw ApiError instances
        if (err instanceof ApiError) {
          throw err;
        }
        logger.error('Error checking membership', { error: err.message, userId, organizationId: document.organization_id });
        throw ApiError.database('Failed to verify membership', { originalError: err.message }, 'VERIFY_MEMBERSHIP_FAILED');
      }
    } else {
      await createProposal();
    }

    async function createProposal() {
      // Validate operation
      let normalizedTargetParentId = null;
      let normalizedNewOrder = null;
      try {
        const validation = await validateTreeOperation(db, { documentId, operationType, targetParentId, newOrder });
        if (!validation.valid) {
          return next(ApiError.validation(validation.error || 'Invalid tree operation', null, validation.code || 'INVALID_TREE_OPERATION'));
        }
        normalizedTargetParentId = validation.normalizedTargetParentId ?? null;
        normalizedNewOrder = validation.normalizedNewOrder ?? null;
        if (operationType === 'DELETE' && document.status === 'voting') {
          return next(ApiError.validation('Cannot propose deletion while document is in voting state', null, 'DELETE_NOT_ALLOWED_DURING_VOTING'));
        }
      } catch (err) {
        // Re-throw ApiError instances
        if (err instanceof ApiError) {
          throw err;
        }
        logger.error('Error validating tree operation', { error: err.message, documentId, operationType });
        throw ApiError.database('Failed to validate operation', { originalError: err.message }, 'VALIDATE_OPERATION_FAILED');
      }

      // Check for existing pending proposal
      let existing = null;
      try {
        existing = await TransactionManager.query(db, `
          SELECT id FROM document_tree_proposals
          WHERE document_id = ? AND status = 'pending'
        `, [documentId]);
      } catch (err) {
        if (!err.message.includes('no such table')) {
          logger.error('Error checking existing proposals', { error: err.message, documentId });
          throw ApiError.database('Failed to check existing proposals', { originalError: err.message }, 'CHECK_EXISTING_PROPOSALS_FAILED');
        }
      }

      if (existing) {
        return next(ApiError.validation('There is already a pending proposal for this document', null, 'PENDING_PROPOSAL_EXISTS'));
      }

      // Voting deadline from organization governance (default 7 days)
      let votingDeadlineHours = 168;
      if (document.organization_id) {
        try {
          const governanceRules = await UnifiedVotingService.getGovernanceRules(db, document.organization_id);
          if (governanceRules?.defaultVotingDeadlineHours != null) {
            votingDeadlineHours = governanceRules.defaultVotingDeadlineHours;
          }
        } catch (govErr) {
          logger.warn('Could not fetch governance rules for tree proposal deadline, using default', { error: govErr.message, organizationId: document.organization_id });
        }
      }
      const votingDeadline = new Date();
      votingDeadline.setHours(votingDeadline.getHours() + votingDeadlineHours);
      const votingDeadlineIso = votingDeadline.toISOString();

      // Create proposal
      const proposalId = uuidv4();
      await TransactionManager.execute(db, `
        INSERT INTO document_tree_proposals (
          id, document_id, organization_id, proposed_by_user_id,
          operation_type, target_parent_id, new_order, reason, status,
          voting_deadline, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [proposalId, documentId, document.organization_id, userId, operationType, normalizedTargetParentId, normalizedNewOrder, reason || null, votingDeadlineIso]);

      // Get created proposal with user info
      const proposal = await TransactionManager.query(db, `
        SELECT dtp.*,
               u.name as proposed_by_name,
               u.email as proposed_by_email
        FROM document_tree_proposals dtp
        JOIN users u ON dtp.proposed_by_user_id = u.id
        WHERE dtp.id = ?
      `, [proposalId]);

      metricsCollector.recordBusinessEvent('document_tree_proposal_created', {
        proposalId,
        documentId,
        organizationId: document.organization_id,
        operationType,
        userId
      });

      webSocketManager.broadcastDocumentUpdate(documentId, 'tree-proposal-created', {
        proposalId,
        documentId,
        operationType,
        userId
      });
      if (document.organization_id) {
        webSocketManager.broadcastOrganizationUpdate(document.organization_id, 'tree-proposal-created', {
          proposalId,
          documentId,
          operationType,
          userId
        });
      }

      res.status(201).json({
        success: true,
        proposal: {
          ...proposal,
          votes: [],
          voteCounts: { pro: 0, neutral: 0, contra: 0 }
        }
      });
    }
  } catch (error) {
    // Re-throw ApiError instances
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Error creating tree proposal', { error: error.message, documentId, userId });
    throw ApiError.database('Failed to create tree proposal', { originalError: error.message }, 'CREATE_TREE_PROPOSAL_FAILED');
  }
}));

// Vote on tree proposal
router.post('/:proposalId/vote', requireAuth, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const { proposalId } = req.params;
  const { vote } = req.body;
  const userId = getUserId(req);

  if (!['PRO', 'NEUTRAL', 'CONTRA'].includes(vote)) {
    return next(ApiError.validation('Invalid vote. Must be PRO, NEUTRAL, or CONTRA', null, 'INVALID_VOTE_TYPE'));
  }

  try {
    // Get proposal and check access
    const proposal = await TransactionManager.query(db, `
      SELECT dtp.*, d.organization_id, d.id as document_id, d.voting_anonymous
      FROM document_tree_proposals dtp
      JOIN documents d ON dtp.document_id = d.id
      WHERE dtp.id = ?
    `, [proposalId]);

    if (!proposal) {
      return next(ApiError.notFound('Proposal', 'PROPOSAL_NOT_FOUND'));
    }

    if (proposal.status !== 'pending') {
      return next(ApiError.validation('Can only vote on pending proposals', null, 'CAN_ONLY_VOTE_ON_PENDING'));
    }

    if (proposal.voting_deadline && new Date(proposal.voting_deadline) <= new Date()) {
      return next(ApiError.forbidden('Voting has ended for this proposal', 'VOTING_CLOSED'));
    }

    const doc = await assertDocumentAccess(db, userId, proposal.document_id);

    if (doc.status === 'rejected') {
      return next(ApiError.forbidden(
        'Cannot vote on tree proposals for rejected documents.',
        'DOCUMENT_REJECTED'
      ));
    }
    if (doc.status === 'agreed' && !doc.amendments_open) {
      return next(ApiError.forbidden(
        'Cannot vote on tree proposals for agreed documents unless amendments are open.',
        'DOCUMENT_AGREED'
      ));
    }

    if (doc.ownership_type === 'organizational' && doc.organization_id) {
      const isMember = await isActiveMemberWithOrgCheck(db, userId, doc.organization_id);
      if (!isMember) {
        return next(ApiError.forbidden('Only active organization members can vote', 'NOT_ACTIVE_MEMBER'));
      }
    }

    // Use voting lock to prevent race conditions
    // Lock on tree_proposal level to prevent concurrent votes on the same proposal
    return await votingLockManager.withVoteLock('tree_proposal', proposalId, async () => {
      const existing = await TransactionManager.query(db,
        'SELECT id, vote, receipt_id FROM document_tree_proposal_votes WHERE proposal_id = ? AND user_id = ?',
        [proposalId, userId]
      );

      const voteId = existing ? existing.id : uuidv4();
      const isUpdate = !!existing;
      const documentId = proposal.document_id;
      const isAnonymous = proposal.voting_anonymous === true;
      const voteRecordedAt = new Date().toISOString();
      const receiptId = existing?.receipt_id || generateReceiptId();
      const voteHash = computeVoteHash('document_tree', {
        contestId: proposalId,
        choice: vote,
        timestamp: voteRecordedAt,
        receiptId
      });

      await TransactionManager.executeInTransaction(db, async (txDb) => {
        if (existing) {
          await TransactionManager.execute(txDb, `
            UPDATE document_tree_proposal_votes
            SET vote = ?, updated_at = CURRENT_TIMESTAMP, receipt_id = ?, vote_hash = ?
            WHERE proposal_id = ? AND user_id = ?
          `, [vote, receiptId, voteHash, proposalId, userId]);
        } else {
          await TransactionManager.execute(txDb, `
            INSERT INTO document_tree_proposal_votes (id, proposal_id, user_id, vote, created_at, updated_at, receipt_id, vote_hash)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?)
          `, [voteId, proposalId, userId, vote, receiptId, voteHash]);
        }
        await voteVerificationLog.appendLogEntry(txDb, {
          voteType: 'document_tree',
          contestId: proposalId,
          choice: vote,
          timestamp: voteRecordedAt,
          receiptId,
          voteHash
        });
        // WP5 atomicity: approval check inside same transaction as vote INSERT/UPDATE (txDb)
        await checkProposalApproval(txDb, proposalId, proposal.organization_id);
      });

      // Fetch all votes for broadcast (outside transaction for read)
      const votes = await TransactionManager.queryAll(db, `
        SELECT v.id, v.user_id, v.vote, v.created_at,
               u.name as user_name, u.email as user_email
        FROM document_tree_proposal_votes v
        LEFT JOIN users u ON v.user_id = u.id
        WHERE v.proposal_id = ?
        ORDER BY v.created_at ASC
      `, [proposalId]);

      let formattedVotes = [];
      if (votes && votes.length > 0) {
        formattedVotes = UnifiedVotingService.formatVotesForResponse(votes, isAnonymous, userId);

        // Calculate vote counts from formatted votes
        const voteCounts = calculateVoteCounts(formattedVotes);
        voteCounts.userId = userId;
        voteCounts.vote = vote;

        // Validate that vote counts match votes array
        const validation = validateVoteCounts(voteCounts, formattedVotes);
        if (!validation.isValid) {
          logger.error('Vote counts validation failed for tree proposal', {
            error: validation.error,
            proposalId,
            documentId,
            provided: validation.provided,
            calculated: validation.calculated
          });
        } else if (validation.warning) {
          logger.warn('Vote counts validation warning for tree proposal', {
            warning: validation.warning,
            proposalId,
            documentId,
            provided: validation.provided,
            calculated: validation.calculated
          });
        }

        // Broadcast to document room with both vote counts and all votes
        webSocketManager.broadcastDocumentUpdate(documentId, 'tree-proposal-vote', {
          type: 'tree-proposal-vote',
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

        // Broadcast to organization room with both vote counts and all votes
        webSocketManager.broadcastOrganizationUpdate(proposal.organization_id, 'tree-proposal-vote', {
          type: 'tree-proposal-vote',
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

      // Record metrics for new votes only
      if (!isUpdate) {
        metricsCollector.recordBusinessEvent('document_tree_proposal_voted', {
          proposalId,
          vote,
          userId
        });
      }

      // Invalidate caches
      UnifiedVotingService.invalidateCache(proposal.organization_id, 'organization', proposalId);

      res.json({
        success: true,
        message: isUpdate ? 'Vote updated successfully' : 'Vote recorded successfully',
        votes: formattedVotes,
        voteId,
        vote,
        isAnonymous,
        receiptId,
        contestId: proposalId,
        voteType: 'document_tree',
        voteRecordedAt
      });
    });
  } catch (error) {
    // Re-throw ApiError instances
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Error in tree proposal vote endpoint', { error: error.message, stack: error.stack, proposalId, userId });
    throw ApiError.database('Failed to process vote request', { originalError: error.message }, 'PROCESS_VOTE_REQUEST_FAILED');
  }
}));

// Complete vote on tree proposal (close voting, evaluate outcome, apply if approved)
router.post('/:proposalId/complete', requireAuth, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const { proposalId } = req.params;
  const userId = getUserId(req);

  const proposal = await TransactionManager.query(db, `
    SELECT dtp.*, d.owner_id, d.organization_id, d.ownership_type, d.acceptance_threshold
    FROM document_tree_proposals dtp
    JOIN documents d ON dtp.document_id = d.id
    WHERE dtp.id = ?
  `, [proposalId]);

  if (!proposal) {
    return next(ApiError.notFound('Proposal', 'PROPOSAL_NOT_FOUND'));
  }

  if (proposal.status !== 'pending' && proposal.status !== 'approved') {
    return next(ApiError.validation('Proposal already closed or applied', null, 'PROPOSAL_ALREADY_CLOSED'));
  }

  await assertDocumentAccess(db, userId, proposal.document_id);

  if (proposal.ownership_type === 'organizational' && proposal.organization_id) {
    const repResult = await TransactionManager.query(db, `
      SELECT COUNT(*) as count FROM organization_representatives
      WHERE organization_id = ? AND user_id = ? AND status = 'active'
    `, [proposal.organization_id, userId]);
    if (Number(repResult?.count || 0) === 0) {
      return next(ApiError.forbidden('Only representatives can complete tree proposal votes', 'NOT_REPRESENTATIVE'));
    }
  } else if (proposal.owner_id !== userId) {
    return next(ApiError.forbidden('Only document owner can complete tree proposal votes', 'NOT_DOCUMENT_OWNER'));
  }

  return await votingLockManager.withVoteLock('tree_proposal', proposalId, async () => {
    // Re-fetch inside lock (status may have changed)
    const lockedProposal = await TransactionManager.query(db, `
      SELECT status FROM document_tree_proposals WHERE id = ?
    `, [proposalId]);

    if (!lockedProposal || (lockedProposal.status !== 'pending' && lockedProposal.status !== 'approved')) {
      return next(ApiError.validation('Proposal already closed or applied', null, 'PROPOSAL_ALREADY_CLOSED'));
    }

    let fullProposal;
    let outcome;

    if (lockedProposal.status === 'approved') {
      // Already approved (e.g. by scheduler at deadline) - just apply
      fullProposal = await TransactionManager.query(db, `
        SELECT dtp.*, d.owner_id, d.organization_id, d.ownership_type, d.title as document_title
        FROM document_tree_proposals dtp
        JOIN documents d ON dtp.document_id = d.id
        WHERE dtp.id = ?
      `, [proposalId]);
      outcome = 'approved';
      const applyValidation = await validateTreeOperation(db, {
        documentId: fullProposal.document_id,
        operationType: fullProposal.operation_type,
        targetParentId: fullProposal.target_parent_id,
        newOrder: fullProposal.new_order
      });
      if (!applyValidation.valid) {
        return next(ApiError.validation(applyValidation.error || 'Tree operation no longer valid', null, applyValidation.code || 'TREE_OPERATION_NO_LONGER_VALID'));
      }
      await TransactionManager.executeInTransaction(db, async (trx) => {
        await applyTreeOperation(trx, fullProposal);
        await TransactionManager.execute(trx,
          'UPDATE document_tree_proposals SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          ['applied', proposalId]
        );
      });
    } else {
      // Pending - require quorum, re-evaluate approval, then apply if approved
      const voteAggregation = await UnifiedVotingService.aggregateVotes(db, 'document_tree_proposal_votes', 'proposal_id', proposalId);
      const totalEligible = await UnifiedVotingService.getEligibleVoterCount(db, proposal.organization_id, 'organization');
      const acceptanceThreshold = proposal.acceptance_threshold || 75.0;

      await UnifiedVotingService.requireQuorumForComplete(db, {
        proposalId,
        organizationId: proposal.organization_id,
        proVotes: voteAggregation.proVotes,
        totalVotes: voteAggregation.totalVotes,
        totalEligible,
        acceptanceThreshold
      });

      await checkProposalApproval(db, proposalId, proposal.organization_id);

      fullProposal = await TransactionManager.query(db, `
        SELECT dtp.*, d.owner_id, d.organization_id, d.ownership_type, d.title as document_title
        FROM document_tree_proposals dtp
        JOIN documents d ON dtp.document_id = d.id
        WHERE dtp.id = ?
      `, [proposalId]);

      outcome = fullProposal.status === 'approved' ? 'approved' : 'rejected';
      if (fullProposal.status === 'approved') {
        const applyValidation = await validateTreeOperation(db, {
          documentId: fullProposal.document_id,
          operationType: fullProposal.operation_type,
          targetParentId: fullProposal.target_parent_id,
          newOrder: fullProposal.new_order
        });
        if (!applyValidation.valid) {
          return next(ApiError.validation(applyValidation.error || 'Tree operation no longer valid', null, applyValidation.code || 'TREE_OPERATION_NO_LONGER_VALID'));
        }
      }
      await TransactionManager.executeInTransaction(db, async (trx) => {
        if (fullProposal.status === 'approved') {
          await applyTreeOperation(trx, fullProposal);
          await TransactionManager.execute(trx,
            'UPDATE document_tree_proposals SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            ['applied', proposalId]
          );
        } else {
          await TransactionManager.execute(trx,
            'UPDATE document_tree_proposals SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            ['rejected', proposalId]
          );
        }
      });
    }

    webSocketManager.broadcastDocumentUpdate(fullProposal.document_id, 'document-tree-proposal-completed', {
      type: 'document-tree-proposal-completed',
      proposalId,
      documentId: fullProposal.document_id,
      outcome,
      applied: outcome === 'approved'
    });

    if (fullProposal.organization_id) {
      webSocketManager.broadcastOrganizationUpdate(fullProposal.organization_id, 'document-tree-proposal-completed', {
        type: 'document-tree-proposal-completed',
        proposalId,
        documentId: fullProposal.document_id,
        outcome,
        applied: outcome === 'approved'
      });

      const actionType = outcome === 'approved' ? 'tree_proposal_approved' : 'tree_proposal_rejected';
      await logOrganizationAudit(db, fullProposal.organization_id, actionType, userId, {
        proposalId,
        documentId: fullProposal.document_id,
        documentTitle: fullProposal.document_title,
        operationType: fullProposal.operation_type,
        outcome
      }, req);
    }

    metricsCollector.recordBusinessEvent('document_tree_proposal_completed', {
      proposalId,
      documentId: fullProposal.document_id,
      outcome,
      userId
    });

    res.json({
      success: true,
      message: 'Vote completed successfully',
      outcome,
      applied: outcome === 'approved'
    });
  });
}));

// Cancel/withdraw proposal: creator can withdraw, org representative can cancel (pending only)
router.delete('/:proposalId', requireAuth, asyncHandler(async (req, res, next) => {
  const db = req.app.locals.db;
  const { proposalId } = req.params;
  const userId = getUserId(req);

  const proposal = await TransactionManager.query(db, `
    SELECT dtp.proposed_by_user_id, dtp.status, dtp.document_id, dtp.organization_id
    FROM document_tree_proposals dtp
    WHERE dtp.id = ?
  `, [proposalId]);

  if (!proposal) {
    return next(ApiError.notFound('Proposal', 'PROPOSAL_NOT_FOUND'));
  }

  if (proposal.status === 'applied') {
    return next(ApiError.validation('Cannot delete an applied proposal', null, 'CANNOT_DELETE_APPLIED_PROPOSAL'));
  }

  await assertDocumentAccess(db, userId, proposal.document_id);

  if (proposal.proposed_by_user_id !== userId) {
    return next(ApiError.forbidden('Only the proposal creator can delete it', 'NOT_AUTHORIZED'));
  }

  // Delete votes first (ignore errors if table doesn't exist)
  try {
    await TransactionManager.execute(db, 
      'DELETE FROM document_tree_proposal_votes WHERE proposal_id = ?', 
      [proposalId]
    );
  } catch (err) {
    if (!err.message.includes('no such table')) {
      throw err;
    }
  }

  // Delete proposal
  await TransactionManager.execute(db, 
    'DELETE FROM document_tree_proposals WHERE id = ?', 
    [proposalId]
  );

  res.json({ success: true, message: 'Proposal deleted successfully' });
}));

module.exports = router;
