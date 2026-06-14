const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { metricsCollector } = require('../middleware/monitoring');
const { requireAuth, requireDocumentAccess } = require('../middleware/auth');
const webSocketManager = require('../modules/websocket');
const { logger } = require('../middleware/logger');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const TransactionManager = require('../database/services/TransactionManager');
const { proposalValidation } = require('../middleware/validation');
const UnifiedVotingService = require('../modules/unified-voting');
const { extractUserIds } = require('../utils/memberUtils');
const { getUserId, hasNewCommentSchema } = require('../utils/routeHelpers');

const router = express.Router({ mergeParams: true });

// Create a new proposal/suggestion
router.post('/', requireAuth, requireDocumentAccess, ...proposalValidation.create, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.documentId;
  const paragraphId = req.params.paragraphId;
  const { text, type = 'BODY' } = req.body;
  // transformRequest snake-cases the body; accept both spellings.
  const headingLevel = req.body.headingLevel ?? req.body.heading_level;
  const userId = getUserId(req);

  const normalizedHeadingLevel = type === 'TITLE' && headingLevel && ['h1', 'h2', 'h3'].includes(headingLevel.toLowerCase())
    ? headingLevel.toLowerCase()
    : null;

  // Validation middleware handles empty text check

  // Check if there's an active structure proposal that would block new paragraph proposals
  const activeStructureQuery = `
    SELECT id FROM structure_proposals
    WHERE document_id = ? AND approved = false AND applied = false
      AND (status IS NULL OR status NOT IN ('approved', 'rejected'))
  `;

  let activeStructure;
  try {
    activeStructure = await TransactionManager.query(db, activeStructureQuery, [documentId]);
  } catch (err) {
    logger.error('Error checking active structure proposals', { error: err.message, documentId });
    throw ApiError.database('Failed to check active structure proposals');
  }

  if (activeStructure) {
    throw ApiError.validation(
      'Cannot create paragraph proposals while a structure proposal is active. Please vote on or wait for the structure proposal to be resolved first.',
      null,
      'STRUCTURE_PROPOSAL_ACTIVE'
    );
  }

  // Check if proposal cutoff has passed for organizational documents
  const doc = await TransactionManager.query(db, `
    SELECT status, paragraph_proposals_cutoff, ownership_type, amendments_open, document_kind
    FROM documents WHERE id = ?
  `, [documentId]);

  // Meeting minutes documents use direct write only; no paragraph proposals
  if (doc?.document_kind === 'meeting_minutes') {
    throw ApiError.forbidden(
      'Cannot create paragraph proposals on meeting minutes documents.',
      'MEETING_MINUTES_NO_PROPOSALS'
    );
  }

  // Check document status - block on agreed/rejected/voting documents (organizational only)
  if (doc?.ownership_type === 'organizational') {
    if (doc.status === 'rejected') {
      throw ApiError.forbidden(
        'Cannot create paragraph proposals on rejected documents.',
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
        'Cannot create paragraph proposals during the voting period. Please wait for voting to complete.',
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
      logger.info('Proposal cutoff passed, blocking new proposal', { 
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

  // Verify paragraph exists and belongs to document
  logger.debug('Checking paragraph', { paragraphId, documentId });

  const paragraph = await TransactionManager.query(db, `
    SELECT id, document_id, title, text, order_index
    FROM paragraphs WHERE id = ? AND document_id = ?
  `, [paragraphId, documentId]);

  logger.debug('Paragraph check result', { paragraphId, documentId, found: !!paragraph });
  if (!paragraph) {
    logger.warn('Paragraph not found', { paragraphId, documentId });
    throw ApiError.notFound('Paragraph not found');
  }

  // Enforce proposal type matches paragraph type (no conversion allowed)
  const isHeadingParagraph = paragraph.title && paragraph.title.trim().length > 0;
  const isBodyParagraph = paragraph.text && paragraph.text.trim().length > 0;

  // Document title paragraph (first paragraph) is always heading-only
  const isDocumentTitle = paragraph.order_index === 1;

  if (isDocumentTitle && type !== 'TITLE') {
    throw ApiError.validation('Document title paragraph only accepts TITLE proposals.');
  }

  if (isHeadingParagraph && type !== 'TITLE') {
    throw ApiError.validation('Heading paragraphs only accept TITLE proposals. Paragraph type cannot be changed.');
  }

  if (isBodyParagraph && type !== 'BODY') {
    throw ApiError.validation('Body paragraphs only accept BODY proposals. Paragraph type cannot be changed.');
  }

  const proposalId = uuidv4();

  await TransactionManager.execute(db, `
    INSERT INTO proposals (id, paragraph_id, user_id, text, type, heading_level)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [proposalId, paragraphId, userId, text.trim(), type, normalizedHeadingLevel]);

  // Update document timestamp (non-blocking but tracked)
  try {
    await TransactionManager.execute(db, `
      UPDATE documents SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `, [documentId]);
    logger.debug('Document timestamp updated', { documentId });
  } catch (err) {
    logger.error('Error updating document timestamp', { 
      error: err.message, 
      documentId,
      stack: err.stack 
    });
    // Track metric for monitoring
    metricsCollector.recordError('document_timestamp_update_failed', {
      documentId,
      error: err.message
    });
  }

  // Return the created proposal with user info
  const proposal = await TransactionManager.query(db, `
    SELECT p.*,
           u.name as user_name,
           u.email as user_email
    FROM proposals p
    JOIN users u ON p.user_id = u.id
    WHERE p.id = ?
  `, [proposalId]);

  if (!proposal) {
    throw ApiError.database('Proposal created but failed to retrieve');
  }

  const result = {
    ...proposal,
    user: {
      id: proposal.user_id,
      name: proposal.user_name,
      email: proposal.user_email
    },
    votes: [],
    comments: []
  };

  // Record business metrics
  metricsCollector.recordBusinessEvent('proposal_created', {
    proposalId,
    paragraphId,
    userId,
    type,
    documentId
  });

  // Queue proposal creation for digest emails (fire-and-forget)
  (async () => {
    try {
      const notificationService = require('../modules/notifications');
      const urls = require('../emails/urls');

      // Get document and organization info
      const doc = await TransactionManager.query(db, `
        SELECT d.title, d.organization_id, o.name as org_name
        FROM documents d
        LEFT JOIN organizations o ON d.organization_id = o.id
        WHERE d.id = ?
      `, [documentId]);

      if (doc && doc.organization_id) {
        // Get organization members to notify
        const members = await TransactionManager.queryAll(db, `
          SELECT u.id as user_id
          FROM organization_members om
          JOIN users u ON om.user_id = u.id
          WHERE om.organization_id = ? AND om.status = 'active'
            AND om.user_id NOT IN (SELECT id FROM organizations)
        `, [doc.organization_id]);

        if (members && members.length > 0) {
          const userIds = extractUserIds(members);
          const eventData = {
            title: `New Proposal: ${doc.title}`,
            message: `A new proposal was created for "${doc.title}"`,
            link: urls.document(documentId),
            organizationName: doc.org_name
          };

          await notificationService.notifyUsers(
            db,
            userIds,
            'proposal_created',
            eventData,
            false // digest notification
          );
        }
      }
    } catch (error) {
      logger.error('Error queueing proposal creation for digest', {
        error: error.message,
        proposalId,
        documentId
      });
    }
  })();

  // Broadcast real-time update via WebSocket
  webSocketManager.broadcastProposalUpdate(documentId, paragraphId, result);

  res.status(201).json({ 
    message: 'Proposal created successfully',
    proposal: result
  });
}));

// Get all proposals for a paragraph (this is mainly handled in the documents route, but keeping for completeness)
router.get('/', requireAuth, requireDocumentAccess, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const paragraphId = req.params.paragraphId;
  const documentId = req.params.documentId;

  const query = `
    SELECT p.*,
           u.name as user_name,
           u.email as user_email
    FROM proposals p
    JOIN users u ON p.user_id = u.id
    WHERE p.paragraph_id = ?
    ORDER BY p.created_at DESC
  `;

  const proposals = await TransactionManager.queryAll(db, query, [paragraphId]);

  // Get document voting_anonymous setting
  const doc = await TransactionManager.query(db, `
    SELECT voting_anonymous FROM documents WHERE id = (SELECT document_id FROM paragraphs WHERE id = ?)
  `, [paragraphId]);

  const isAnonymous = doc?.voting_anonymous === true;
  const userId = getUserId(req);

  // Batch optimization: Fetch all votes and comments upfront
  // This eliminates N+1 queries by fetching all needed data in batch before the map
  const allProposalIds = proposals.map(p => p.id);
  const votesByProposal = new Map();
  const commentsByProposal = new Map();
  
  if (allProposalIds.length > 0) {
    // Batch fetch all votes
    try {
      const votesPlaceholders = allProposalIds.map(() => '?').join(',');
      const allVotes = await TransactionManager.queryAll(db, `
        SELECT v.*,
               u.name as user_name,
               u.email as user_email
        FROM votes v
        JOIN users u ON v.user_id = u.id
        WHERE v.proposal_id IN (${votesPlaceholders})
        ORDER BY v.created_at ASC
      `, allProposalIds);
      
      // Group votes by proposal_id
      allVotes.forEach(vote => {
        if (!votesByProposal.has(vote.proposal_id)) {
          votesByProposal.set(vote.proposal_id, []);
        }
        votesByProposal.get(vote.proposal_id).push(vote);
      });
    } catch (err) {
      logger.error('Error batch fetching votes for proposals', { error: err.message });
      // Continue with empty map - proposals will have empty votes arrays
    }

    // Batch fetch all comments - check schema for backward compatibility
    try {
      const hasNewSchema = await hasNewCommentSchema(db);
      const commentsPlaceholders = allProposalIds.map(() => '?').join(',');
      const commentWhereClause = hasNewSchema
        ? `c.commentable_type = 'proposal' AND c.commentable_id IN (${commentsPlaceholders})`
        : `c.proposal_id IN (${commentsPlaceholders})`;
      
      const allComments = await TransactionManager.queryAll(db, `
        SELECT c.*,
               u.name as user_name,
               u.email as user_email,
               u.avatar as user_avatar,
               pc.user_id as parent_user_id,
               pu.name as parent_user_name
        FROM comments c
        JOIN users u ON c.user_id = u.id
        LEFT JOIN comments pc ON c.parent_id = pc.id
        LEFT JOIN users pu ON pc.user_id = pu.id
        WHERE ${commentWhereClause} AND c.deleted_at IS NULL
        ORDER BY c.created_at
      `, allProposalIds);
      
      // Group comments by proposal_id (handle both old and new schema)
      allComments.forEach(comment => {
        const proposalId = hasNewSchema ? comment.commentable_id : comment.proposal_id;
        if (!commentsByProposal.has(proposalId)) {
          commentsByProposal.set(proposalId, []);
        }
        commentsByProposal.get(proposalId).push(comment);
      });
    } catch (err) {
      logger.error('Error batch fetching comments for proposals', { error: err.message });
      // Continue with empty map - proposals will have empty comments arrays
    }
  }

  // Get votes and comments for each proposal using batch-fetched data
  const proposalsWithData = await Promise.all(proposals.map(async (prop) => {
    // Get votes from batch-fetched map
    const votes = votesByProposal.get(prop.id) || [];

    // Format votes using UnifiedVotingService
    const processedVotes = UnifiedVotingService.formatVotesForResponse(votes, isAnonymous, userId).map(vote => {
      const voteData = {
        id: vote.id,
        vote: vote.vote,
        createdAt: vote.createdAt || vote.created_at
      };
      
      // In anonymous mode, include userId for own vote (matching current behavior)
      if (isAnonymous && vote.userId === userId) {
        voteData.userId = vote.userId;
      }
      
      // Include user object if present
      if (vote.user) {
        voteData.user = vote.user;
      }
      
      return voteData;
    });

    // Get comments from batch-fetched map
    const comments = commentsByProposal.get(prop.id) || [];

    const processedComments = comments.map(comment => ({
      id: comment.id,
      proposalId: comment.proposal_id || comment.commentable_id,
      userId: comment.user_id,
      text: comment.text,
      parentId: comment.parent_id || undefined,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      deletedAt: comment.deleted_at || null,
      editedAt: comment.edited_at || null,
      editCount: comment.edit_count || 0,
      user: {
        id: comment.user_id,
        name: comment.user_name,
        email: comment.user_email,
        avatar: comment.user_avatar
      },
      parent: comment.parent_id ? {
        id: comment.parent_id,
        user: {
          id: comment.parent_user_id,
          name: comment.parent_user_name
        }
      } : null,
      replies: []
    }));

    return {
      ...prop,
      user: {
        id: prop.user_id,
        name: prop.user_name,
        email: prop.user_email
      },
      votes: processedVotes,
      comments: processedComments
    };
  }));

  res.json({ proposals: proposalsWithData });
}));

// Delete a proposal (only by creator, cannot delete approved proposals)
router.delete('/:proposalId', requireAuth, requireDocumentAccess, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.documentId;
  const paragraphId = req.params.paragraphId;
  const proposalId = req.params.proposalId;
  const userId = getUserId(req);

  // Check if proposal exists and get ownership info
  const proposal = await TransactionManager.query(db, `
    SELECT p.user_id, p.approved, p.paragraph_id
    FROM proposals p
    JOIN paragraphs par ON p.paragraph_id = par.id
    WHERE p.id = ? AND par.id = ? AND par.document_id = ?
  `, [proposalId, paragraphId, documentId]);

  if (!proposal) {
    throw ApiError.notFound('Proposal not found', 'PROPOSAL_NOT_FOUND');
  }

  // Check if user is the creator
  if (proposal.user_id !== userId) {
    throw ApiError.forbidden('Only the proposal creator can delete it', 'NOT_PROPOSAL_CREATOR');
  }

  // Check if proposal is approved - prevent deletion of approved proposals
  if (proposal.approved) {
    throw ApiError.validation(
      'Cannot delete an approved proposal. Approved proposals are part of the document history.',
      null,
      'CANNOT_DELETE_APPROVED_PROPOSAL'
    );
  }

  // Check if proposal is referenced in history (currently accepted version)
  const historyEntry = await TransactionManager.query(db, `
    SELECT id FROM history 
    WHERE proposal_id = ? AND paragraph_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `, [proposalId, paragraphId]);

  if (historyEntry) {
    throw ApiError.validation(
      'Cannot delete a proposal that has been accepted. It is part of the document history.',
      null,
      'CANNOT_DELETE_ACCEPTED_PROPOSAL'
    );
  }

  // Delete the proposal and all related data in a transaction
  await TransactionManager.executeInTransaction(db, async (txDb) => {
    // Delete votes
    await TransactionManager.execute(txDb, 
      'DELETE FROM votes WHERE proposal_id = ?', 
      [proposalId]
    );

    // Comments are handled by unified comments table with soft delete
    // They will remain in the database but won't be displayed (deleted_at IS NULL check)
    // No need to explicitly delete comments here

    // Delete proposal
    await TransactionManager.execute(txDb, 
      'DELETE FROM proposals WHERE id = ?', 
      [proposalId]
    );
  });

  // Record business metrics
  metricsCollector.recordBusinessEvent('proposal_deleted', {
    proposalId,
    paragraphId,
    userId,
    documentId
  });

  // Broadcast deletion via WebSocket
  webSocketManager.broadcastProposalUpdate(documentId, paragraphId, {
    id: proposalId,
    deleted: true
  });

  // Also broadcast to organization room if document belongs to organization
  try {
    const doc = await TransactionManager.query(db, 
      'SELECT organization_id FROM documents WHERE id = ?', 
      [documentId]
    );
    if (doc?.organization_id) {
      webSocketManager.broadcastOrganizationUpdate(doc.organization_id, 'proposal-deleted', {
        type: 'proposal-deleted',
        documentId,
        proposalId,
        paragraphId,
        deletedBy: userId
      });
    }
  } catch (orgErr) {
    logger.error('Error broadcasting organization update for proposal deletion', {
      error: orgErr.message,
      documentId,
      proposalId
    });
    // Continue - proposal is deleted, broadcast is non-critical
  }

  logger.info('Proposal deleted successfully', { proposalId, paragraphId, documentId, userId });

  res.json({ 
    message: 'Proposal deleted successfully',
    proposalId
  });
}));

module.exports = router;
