const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { metricsCollector } = require('../middleware/monitoring');
const { requireAuth, requireDocumentAccess } = require('../middleware/auth');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { voteValidation } = require('../middleware/validation');
const VoterManager = require('../modules/voting');
const UnifiedVotingService = require('../modules/unified-voting');
const TransactionManager = require('../database/services/TransactionManager');
const documentLockManager = require('../modules/locks');
const votingLockManager = require('../utils/votingLocks');
const webSocketManager = require('../modules/websocket');
const { logger } = require('../middleware/logger');
const { executeQuery, executeQueryAll, getUserId } = require('../utils/routeHelpers');
const { calculateVoteCounts, validateVoteCounts } = require('../utils/voteCounts');
const voteVerificationLog = require('../utils/voteVerificationLog');
const { generateReceiptId, computeVoteHash } = require('../utils/voteReceipt');

const router = express.Router({ mergeParams: true });

// Cast or update a vote on a proposal
router.post('/', requireAuth, requireDocumentAccess, voteValidation.create, asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.documentId;
  const paragraphId = req.params.paragraphId;
  const proposalId = req.params.proposalId;
  const { vote } = req.body;
  const userId = getUserId(req);

  // Validate required parameters
  if (!documentId || !paragraphId || !proposalId) {
    throw ApiError.badRequest('Missing required parameters: documentId, paragraphId, or proposalId');
  }

  if (!vote) {
    throw ApiError.badRequest('Vote value is required');
  }

  // Validation middleware handles type checking and enum validation
  // Normalize vote: trim whitespace and convert to uppercase
  const normalizedVote = vote.trim().toUpperCase();

  // Use document data cached by requireDocumentAccess middleware
  // This eliminates redundant database query
  const doc = req.document;
  if (!doc) {
    throw ApiError.notFound('Document');
  }

  // Meeting minutes documents do not use paragraph proposal voting
  if (doc.document_kind === 'meeting_minutes') {
    throw ApiError.forbidden(
      'Cannot vote on meeting minutes documents.',
      'MEETING_MINUTES_NO_VOTING'
    );
  }

  // Extract voting fields (middleware query includes these now)
  const votingDeadline = doc.voting_deadline;
  const docStatus = doc.status;
  const voteChangeAllowed = doc.vote_change_allowed;

  // Initial deadline check (will be re-checked inside lock for atomicity - FIX 4.4)
  if (votingDeadline && new Date() > new Date(votingDeadline)) {
    throw ApiError.forbidden('Voting deadline has passed for this document', 'VOTING_DEADLINE_PASSED');
  }

  // Check document status - allow voting on agreed documents only when amendments are open
  if (docStatus === 'agreed') {
    if (!doc.amendments_open) {
      throw ApiError.forbidden('Cannot vote on agreed documents', 'DOCUMENT_AGREED');
    }
  }

  // Verify proposal exists and belongs to the correct paragraph and document
  const proposal = await executeQuery(
    db,
    `SELECT p.id, p.paragraph_id, pr.text as proposal_text
     FROM proposals p
     JOIN paragraphs pr ON p.paragraph_id = pr.id
     WHERE p.id = ? AND pr.id = ? AND pr.document_id = ?`,
    [proposalId, paragraphId, documentId],
    {
      message: 'Error verifying proposal',
      context: { proposalId, paragraphId, documentId, userId },
      userMessage: 'Failed to verify proposal',
      code: 'PROPOSAL_VERIFY_ERROR'
    }
  );

  if (!proposal) {
    throw ApiError.notFound('Proposal');
  }

    // Proposal lock covers only vote write and approval-flag update; agreed-view is
    // updated asynchronously after the response to avoid holding this lock while acquiring the document lock.
    // INSIDE LOCK: Only critical write operations to minimize lock hold time.
    const lockStartTime = Date.now();
    let voteResult;
    try {
      voteResult = await votingLockManager.withVoteLock('proposal', proposalId, async () => {
      // FIX 4.4: Re-check deadline inside lock to prevent race conditions (TIME.1)
      // This ensures deadline is enforced atomically
      const currentDoc = await TransactionManager.query(db, `
        SELECT voting_deadline, status, vote_change_allowed, amendments_open, voting_anonymous FROM documents WHERE id = ?
      `, [documentId]);

      if (!currentDoc) {
        throw ApiError.notFound('Document');
      }

      // Atomic deadline check inside lock
      if (currentDoc.voting_deadline && new Date() > new Date(currentDoc.voting_deadline)) {
        throw ApiError.forbidden('Voting deadline has passed for this document', 'VOTING_DEADLINE_PASSED');
      }

      // Re-check status inside lock (may have changed) - allow agreed when amendments open
      if (currentDoc.status === 'agreed' && !currentDoc.amendments_open) {
        throw ApiError.forbidden('Cannot vote on agreed documents', 'DOCUMENT_AGREED');
      }

      // Check if user already voted on this proposal (inside lock for atomicity)
      const existingVote = await TransactionManager.query(db, `
        SELECT id, vote, receipt_id FROM votes WHERE proposal_id = ? AND user_id = ?
      `, [proposalId, userId]);

      const voteRecordedAt = new Date().toISOString();

      if (existingVote) {
        // FIX 4.2: Use document data cached from middleware (vote_change_allowed already available)
        // vote_change_allowed is a document setting that doesn't change frequently, so cached value is safe
        if (!currentDoc || !voteChangeAllowed) {
          throw ApiError.forbidden('Votes are locked for this document. You cannot change your vote.');
        }

        const receiptId = existingVote.receipt_id || generateReceiptId();
        const voteHash = computeVoteHash('paragraph', {
          contestId: proposalId,
          choice: normalizedVote,
          timestamp: voteRecordedAt,
          receiptId
        });

        // Update existing vote in transaction (CRITICAL: must be inside lock). Verification log appended after lock.
        await TransactionManager.executeInTransaction(db, async (txDb) => {
          await TransactionManager.execute(txDb, `
            UPDATE votes SET vote = ?, receipt_id = ?, vote_hash = ? WHERE proposal_id = ? AND user_id = ?
          `, [normalizedVote, receiptId, voteHash, proposalId, userId]);
          await checkAndUpdateProposalApproval(txDb, proposalId, documentId);
        }, { timeout: 5000 });

        return {
          voteId: existingVote.id,
          action: 'updated',
          receiptId,
          contestId: proposalId,
          voteType: 'paragraph',
          voteRecordedAt
        };
      } else {
        const voteId = uuidv4();
        const receiptId = generateReceiptId();
        const voteHash = computeVoteHash('paragraph', {
          contestId: proposalId,
          choice: normalizedVote,
          timestamp: voteRecordedAt,
          receiptId
        });

        try {
          await TransactionManager.executeInTransaction(db, async (txDb) => {
            await TransactionManager.execute(txDb, `
              INSERT INTO votes (id, proposal_id, user_id, vote, receipt_id, vote_hash)
              VALUES (?, ?, ?, ?, ?, ?)
            `, [voteId, proposalId, userId, normalizedVote, receiptId, voteHash]);
            await checkAndUpdateProposalApproval(txDb, proposalId, documentId);
          }, { timeout: 5000 });
        } catch (insertError) {
          if (insertError.message && (insertError.message.includes('UNIQUE constraint') || insertError.code === 'SQLITE_CONSTRAINT')) {
            const newExistingVote = await TransactionManager.query(db, `
              SELECT id, vote, receipt_id FROM votes WHERE proposal_id = ? AND user_id = ?
            `, [proposalId, userId]);

            if (newExistingVote) {
              if (!voteChangeAllowed) {
                throw ApiError.forbidden('Vote already exists and votes are locked for this document.');
              }
              const existingReceiptId = newExistingVote.receipt_id || generateReceiptId();
              const existingVoteHash = computeVoteHash('paragraph', {
                contestId: proposalId,
                choice: normalizedVote,
                timestamp: voteRecordedAt,
                receiptId: existingReceiptId
              });
              await TransactionManager.executeInTransaction(db, async (txDb) => {
                await TransactionManager.execute(txDb, `
                  UPDATE votes SET vote = ?, receipt_id = ?, vote_hash = ? WHERE proposal_id = ? AND user_id = ?
                `, [normalizedVote, existingReceiptId, existingVoteHash, proposalId, userId]);
                await checkAndUpdateProposalApproval(txDb, proposalId, documentId);
              }, { timeout: 5000 });
              return {
                voteId: newExistingVote.id,
                action: 'updated',
                receiptId: existingReceiptId,
                contestId: proposalId,
                voteType: 'paragraph',
                voteRecordedAt
              };
            } else {
              throw insertError;
            }
          } else {
            throw insertError;
          }
        }

        return {
          voteId,
          action: 'cast',
          receiptId,
          contestId: proposalId,
          voteType: 'paragraph',
          voteRecordedAt
        };
      }
      });
    } catch (lockError) {
      // Log lock errors with context
      const lockDuration = Date.now() - lockStartTime;
      logger.error('Error in vote lock', {
        error: lockError.message,
        stack: lockError.stack,
        proposalId,
        documentId,
        userId,
        lockDuration,
        isTimeout: lockError.message?.includes('timeout') || lockError.message?.includes('Transaction timeout')
      });
      throw lockError;
    }
    
    const lockDuration = Date.now() - lockStartTime;
    if (lockDuration > 1000) {
      logger.warn('Vote lock held for extended period', { proposalId, documentId, lockDuration });
    } else {
      logger.debug('Vote lock released', { proposalId, documentId, lockDuration });
    }

    // OUTSIDE LOCK: Send response immediately to prevent client timeout
    const { voteId: finalVoteId, action, receiptId, contestId, voteType, voteRecordedAt } = voteResult;

    const responseStartTime = Date.now();
    res.json({
      success: true,
      message: action === 'updated' ? 'Vote updated successfully' : 'Vote cast successfully',
      voteId: finalVoteId,
      vote: normalizedVote,
      action,
      receiptId,
      contestId,
      voteType,
      voteRecordedAt
    });
    const responseTime = Date.now() - responseStartTime;
    logger.debug('Vote response sent', { proposalId, documentId, responseTime });

    // Single-phase update: Fetch all votes and calculate counts, then broadcast both together
    // This ensures vote counts and votes array are always in sync
    (async () => {
      const asyncStartTime = Date.now();
      try {
        // Record business metrics (non-blocking)
        metricsCollector.recordBusinessEvent('vote_cast', {
          voteId: finalVoteId,
          proposalId,
          userId,
          vote: normalizedVote,
          documentId
        });

        // Deferred verification log append (outside proposal lock to avoid nested locking)
        const verificationEntry = {
          voteType: 'paragraph',
          contestId: proposalId,
          choice: normalizedVote,
          timestamp: voteRecordedAt,
          receiptId,
          voteHash: computeVoteHash('paragraph', { contestId: proposalId, choice: normalizedVote, timestamp: voteRecordedAt, receiptId })
        };
        await voteVerificationLog.appendLogEntry(db, verificationEntry);

        // Fetch all votes for WebSocket broadcast
        const fetchStartTime = Date.now();
        const votes = await TransactionManager.queryAll(db, `
          SELECT v.id, v.user_id, v.vote, v.created_at,
                 u.name as user_name, u.email as user_email
          FROM votes v
          LEFT JOIN users u ON v.user_id = u.id
          WHERE v.proposal_id = ?
          ORDER BY v.created_at ASC
        `, [proposalId]);
        const fetchDuration = Date.now() - fetchStartTime;
        if (fetchDuration > 500) {
          logger.warn('Vote fetch took longer than expected', { proposalId, documentId, fetchDuration, voteCount: votes.length });
        }

        // Get document settings for formatting
        const docSettings = await TransactionManager.query(db, `
          SELECT voting_anonymous FROM documents WHERE id = ?
        `, [documentId]);
        
        const isAnonymous = docSettings?.voting_anonymous === true;

        // Format votes for broadcast
        const formattedVotes = UnifiedVotingService.formatVotesForResponse(votes, isAnonymous, userId);

        // Add null check for formattedVotes
        if (!formattedVotes || !Array.isArray(formattedVotes)) {
          logger.error('formattedVotes is null or not an array', { proposalId, documentId, votes });
          throw new Error('Failed to format votes for response');
        }

        // Calculate vote counts from formatted votes array
        let voteCounts = calculateVoteCounts(formattedVotes);

        // Validate that vote counts match votes array
        const validation = validateVoteCounts(voteCounts, formattedVotes);
        if (!validation.isValid) {
          logger.error('Vote counts validation failed - using recalculated counts', {
            error: validation.error,
            proposalId,
            documentId,
            provided: validation.provided,
            calculated: validation.calculated
          });
          
          // Use recalculated counts instead of incorrect provided counts
          voteCounts = calculateVoteCounts(formattedVotes);
        } else if (validation.warning) {
          logger.warn('Vote counts validation warning', {
            warning: validation.warning,
            proposalId,
            documentId,
            provided: validation.provided,
            calculated: validation.calculated
          });
        }

        // Add userId and vote to voteCounts for current user detection (after validation)
        voteCounts.userId = userId;
        voteCounts.vote = normalizedVote;

        // Broadcast WebSocket update IMMEDIATELY (without approval status)
        // Approval will be calculated separately and broadcast when ready
        const wsStartTime = Date.now();
        logger.info('Broadcasting vote update via WebSocket', {
          documentId,
          proposalId,
          paragraphId,
          voteId: finalVoteId,
          userId,
          vote: normalizedVote,
          voteCount: formattedVotes.length,
          voteCounts,
          isAnonymous,
          action
        });
        
        webSocketManager.broadcastVoteUpdate(documentId, proposalId, paragraphId, {
          voteId: finalVoteId,
          userId,
          vote: normalizedVote,
          action,
          voteCounts,
          allVotes: formattedVotes,
          isAnonymous
          // Don't include approval status - it will come in a separate update
        });

        // Also broadcast to organization room if document belongs to organization
        const orgDoc = await TransactionManager.query(db, 'SELECT organization_id FROM documents WHERE id = ?', [documentId]);
        if (orgDoc?.organization_id) {
          webSocketManager.broadcastOrganizationUpdate(orgDoc.organization_id, 'proposal-vote', {
            type: 'proposal-vote',
            documentId,
            proposalId,
            paragraphId,
            voteId: finalVoteId,
            userId,
            vote: normalizedVote,
            action,
            voteCounts,
            allVotes: formattedVotes,
            isAnonymous
          });
        }
        const wsDuration = Date.now() - wsStartTime;
        logger.debug('WebSocket broadcast completed', { proposalId, documentId, wsDuration });

        // NOW calculate approval status asynchronously (non-blocking)
        // This can take time but won't delay the vote update
        (async () => {
          try {
            // Get document info for approval check
            const docInfo = await TransactionManager.query(db, `
              SELECT acceptance_threshold, organization_id FROM documents WHERE id = ?
            `, [documentId]);
            
            const acceptanceThreshold = docInfo?.acceptance_threshold || 75.0;
            const organizationId = docInfo?.organization_id || null;
            
            // Get eligible voter count (this is the slow part)
            const totalEligible = await VoterManager.getEligibleVoterCount(db, documentId);
            
            if (totalEligible > 0) {
              // Calculate approval status using current vote counts
              const proVotes = voteCounts.pro || 0;
              const totalVotes = voteCounts.total || 0;
              
              const approvalStatus = await UnifiedVotingService.checkApproval({
                db,
                proposalId,
                organizationId,
                proVotes,
                totalVotes,
                totalEligible,
                acceptanceThreshold
              });
              
              // Broadcast approval update separately if proposal was approved
              if (approvalStatus.approved) {
                logger.info('Proposal approved, broadcasting approval update', {
                  proposalId,
                  documentId,
                  approvalPercentage: approvalStatus.approvalPercentage
                });
                
                // Broadcast proposal update with approval status
                webSocketManager.broadcastProposalUpdate(documentId, paragraphId, {
                  id: proposalId,
                  approved: true,
                  approvalPercentage: approvalStatus.approvalPercentage
                });
              }
            }
          } catch (approvalError) {
            // Log error but don't fail - approval check is non-critical
            logger.warn('Error checking approval status (non-blocking)', {
              error: approvalError.message,
              proposalId,
              documentId
            });
          }
        })();

        // Invalidate caches after WebSocket broadcast to ensure fresh data on next query
        UnifiedVotingService.invalidateCache(documentId, 'document', proposalId);

        // Update agreed view after response so we never hold the proposal lock while acquiring
        // the document lock (avoids long holds and deadlock). Runs async after res.json().
        const runAgreedViewUpdate = async () => {
          logger.debug('Starting agreed-view update after vote', { proposalId, documentId });
          await updateAgreedViewForParagraph(db, proposalId, documentId);
          logger.debug('Agreed-view update completed', { proposalId, documentId });
        };
        try {
          await runAgreedViewUpdate();
        } catch (agreedViewError) {
          logger.error('Agreed-view update failed after vote', {
            error: agreedViewError?.message || 'Unknown error',
            stack: agreedViewError?.stack,
            proposalId,
            documentId
          });
          // Single retry after short delay (reEvaluateAllProposalsForDocument can reconcile if both fail)
          await new Promise(resolve => setTimeout(resolve, 500));
          try {
            await runAgreedViewUpdate();
          } catch (retryError) {
            logger.error('Agreed-view update retry failed', {
              error: retryError?.message || 'Unknown error',
              proposalId,
              documentId
            });
          }
        }
        
        const asyncDuration = Date.now() - asyncStartTime;
        logger.debug('Async vote processing completed', { proposalId, documentId, asyncDuration });
      } catch (error) {
        // Log errors but don't fail - vote was already successfully cast
        logger.error('Error in async vote processing after response', {
          error: error.message,
          stack: error.stack,
          voteId: finalVoteId,
          proposalId,
          documentId
        });
      }
    })();

    // Approval check is now done inside the vote transaction (WP5 atomicity)
    
    // Response already sent via res.json() inside the lock callback
    // No need to return anything
}));

// Helper function to check and update proposal approval status
async function checkAndUpdateProposalApproval(db, proposalId, documentId) {
  try {
    // Get document info (acceptance threshold, organization_id, ownership_type)
    const doc = await TransactionManager.query(db, 
      `SELECT acceptance_threshold, organization_id, ownership_type FROM documents WHERE id = ?`, 
      [documentId]
    );

    const acceptanceThreshold = doc?.acceptance_threshold || 75.0;

    // Use unified service to check and update approval
    const result = await UnifiedVotingService.checkAndUpdateApproval(db, {
      proposalId,
      contextId: documentId,
      contextType: 'document',
      voteTable: 'votes',
      proposalIdColumn: 'proposal_id',
      proposalTable: 'proposals',
      approvalColumn: 'approved',
      acceptanceThreshold,
      organizationId: doc?.organization_id || null,
      onApproved: async (approvalResult) => {
        logger.debug('Proposal approval check', { 
          proposalId, 
          approvalPercentage: approvalResult.approvalPercentage,
          calculationMethod: approvalResult.details.calculationMethod,
          approved: true 
        });
      },
      onNotApproved: async (approvalResult) => {
        logger.debug('Proposal approval check', { 
          proposalId, 
          approvalPercentage: approvalResult.approvalPercentage,
          approved: false 
        });
      }
    });

    // Agreed-view update is NOT done here; it is run by the vote route after the proposal
    // lock is released (async), to avoid holding the proposal lock while acquiring the document lock.

  } catch (error) {
    logger.error('Error in checkAndUpdateProposalApproval', { 
      errorMessage: error?.message || 'Unknown error', 
      stack: error?.stack, 
      proposalId, 
      documentId 
    });
  }
}

// Helper function to update the agreed view for a paragraph based on the highest approved proposal
// EDGE CASE HANDLING:
// - Multiple proposals reaching threshold simultaneously: Handled by documentLockManager.withLock() 
//   which serializes updates. Proposal selection is deterministic (approval % > votes > recency).
// - Proposal approval dropping below threshold: Handled in checkAndUpdateProposalApproval() which
//   calls this function to find the next best approved proposal or clear paragraph if none exist.
// - Document status transitions during voting: Status is checked inside voting lock (line 109-111)
//   to prevent voting on agreed documents. Document status transitions use atomic WHERE clause.
async function updateAgreedViewForParagraph(db, proposalId, documentId, options = {}) {
  const { forceCanonical = false } = options;
  try {
    logger.debug('Starting updateAgreedView', { proposalId, documentId, forceCanonical });

    // Meeting minutes documents: paragraph content is the agreed content; do not overwrite
    const docKind = await TransactionManager.query(db,
      'SELECT document_kind FROM documents WHERE id = ?',
      [documentId]
    );
    if (docKind?.document_kind === 'meeting_minutes') {
      return;
    }
    
    // FIX 5.4: Fetch all data BEFORE lock to minimize lock scope
    // Batch query: Get proposal data, document threshold, and paragraph info in parallel
    const [proposalData, doc, eligibleVoters] = await Promise.all([
      TransactionManager.query(db, `SELECT paragraph_id FROM proposals WHERE id = ?`, [proposalId]),
      TransactionManager.query(db, `SELECT acceptance_threshold, organization_id, ownership_type, status, amendments_open, amendment_adoption_vote_id FROM documents WHERE id = ?`, [documentId]),
      VoterManager.getEligibleVoterCount(db, documentId)
    ]);

    if (!forceCanonical && doc?.amendment_adoption_vote_id) {
      logger.debug('Skipping agreed view update — amendment adoption vote pending', { documentId });
      return;
    }

    const isAmendmentWindow = !forceCanonical
      && doc?.status === 'agreed'
      && (doc?.amendments_open === 1 || doc?.amendments_open === true);

    if (!proposalData) {
      logger.warn('Proposal not found in updateAgreedView', { proposalId, documentId });
      return;
    }

    const paragraphId = proposalData.paragraph_id;
    // FIX 5.2: Handle 0% threshold correctly
    const acceptanceThreshold = doc?.acceptance_threshold != null ? doc.acceptance_threshold : 75.0;
    
    if (eligibleVoters === 0) {
      logger.warn('Document has no eligible voters - cannot calculate approval percentage', { documentId });
      return;
    }

    logger.debug('Found paragraph for proposal in updateAgreedView', { paragraphId, proposalId, documentId });

    // Get ALL proposals for this paragraph with current vote counts (not just approved ones)
    // We need to check current vote counts, not just the approved flag
    const allProposals = await TransactionManager.queryAll(
      db,
      `SELECT pr.id, pr.text, pr.type, pr.user_id, pr.heading_level, pr.created_at,
        COUNT(CASE WHEN v.vote = 'PRO' THEN 1 END) as pro_votes,
        COUNT(v.id) as total_votes
      FROM proposals pr
      LEFT JOIN votes v ON pr.id = v.proposal_id
      WHERE pr.paragraph_id = ?
      GROUP BY pr.id`,
      [paragraphId]
    );

    if (allProposals.length === 0) {
      logger.debug('No proposals found for paragraph', { paragraphId, documentId });
      return;
    }

    // Get governance rules to determine threshold calculation method
    let calculationMethod = 'all_members'; // Default
    if (doc?.organization_id) {
      try {
        const governanceModule = require('./governance');
        const governanceRules = await governanceModule.getGovernanceRules(db, doc.organization_id);
        calculationMethod = governanceRules?.thresholdCalculationMethod || 'all_members';
      } catch (govErr) {
        logger.debug('Could not fetch governance rules for agreed view, using default', { error: govErr.message, documentId });
        calculationMethod = 'all_members';
      }
    }

    let documentLevelApproval = null;
    if (doc?.ownership_type === 'organizational' && doc?.status === 'agreed') {
      const docVotes = await TransactionManager.queryAll(db,
        'SELECT vote FROM document_votes WHERE document_id = ?',
        [documentId]
      );
      const totalVotes = docVotes.length;
      const proVotes = docVotes.filter((v) => v.vote === 'PRO').length;
      if (totalVotes > 0) {
        documentLevelApproval = UnifiedVotingService.calculateApprovalPercentage({
          proVotes,
          totalVotes,
          totalEligible: eligibleVoters,
          calculationMethod
        });
      }
    }
    
    // Calculate approval percentages based on calculation method
    // Use UnifiedVotingService for consistency with other voting logic
    const proposalsWithPercentages = allProposals.map((p) => {
      const approvalPercentage = documentLevelApproval != null
        ? documentLevelApproval
        : UnifiedVotingService.calculateApprovalPercentage({
        proVotes: p.pro_votes,
        totalVotes: p.total_votes,
        totalEligible: eligibleVoters,
        calculationMethod
      });
      return {
        ...p,
        approvalPercentage,
        eligibleVoters,
        calculationMethod
      };
    });

    // Filter to only proposals that meet the threshold
    const validProposals = proposalsWithPercentages.filter(p => p.approvalPercentage >= acceptanceThreshold);

    // FIX 5.4: Only lock during actual database updates, not during data fetching/calculations
    if (validProposals.length === 0) {
        logger.debug('No proposals meet current acceptance threshold', { paragraphId, documentId, acceptanceThreshold });

        if (isAmendmentWindow) {
          await TransactionManager.execute(db,
            `UPDATE proposals SET amendment_candidate = false WHERE paragraph_id = ?`,
            [paragraphId]
          );
          return;
        }
        
        // Get current paragraph to check if it needs to be cleared
        const currentParagraph = await TransactionManager.query(
          db,
          `SELECT text, title, order_index, heading_level FROM paragraphs WHERE id = ?`,
          [paragraphId]
        );

        if (!currentParagraph) {
          logger.warn('Paragraph not found', { paragraphId, documentId });
          return;
        }

        // Check if paragraph has content that needs to be cleared
        const hasContent = (currentParagraph.text && currentParagraph.text.trim()) || 
                          (currentParagraph.title && currentParagraph.title.trim());
        const isFirstParagraph = currentParagraph.order_index === 1;

        // Don't clear document title paragraph (first paragraph)
        if (isFirstParagraph) {
          logger.debug('Skipping clear for document title paragraph', { paragraphId, documentId });
          return;
        }

        // FIX 5.6: Clear paragraph content if it has any (moved outside lock, only lock during update)
        if (hasContent) {
          // Use document lock only during the actual update
          await documentLockManager.withLock(documentId, async () => {
            await TransactionManager.executeInTransaction(db, async (txDb) => {
              // Clear paragraph based on type
              const clearQuery = currentParagraph.title 
                ? `UPDATE paragraphs SET title = '', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
                : `UPDATE paragraphs SET text = '', updated_at = CURRENT_TIMESTAMP WHERE id = ?`;

              await TransactionManager.execute(txDb, clearQuery, [paragraphId]);
              
              // Update document timestamp
              await TransactionManager.execute(
                txDb,
                `UPDATE documents SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [documentId]
              );

              // Create history entry to record the threshold fall and paragraph clearing
              const lastHistoryEntry = await TransactionManager.query(
                txDb,
                `SELECT approval_percentage, proposal_id FROM history 
                 WHERE paragraph_id = ? 
                 ORDER BY created_at DESC, accepted_at DESC 
                 LIMIT 1`,
                [paragraphId]
              );

              const lastApprovalPercentage = lastHistoryEntry?.approval_percentage || 0;
              const lastProposalId = lastHistoryEntry?.proposal_id || null;
              const historyId = uuidv4();
              const oldText = currentParagraph.text || '';
              const oldTitle = currentParagraph.title || '';

              await TransactionManager.execute(
                txDb,
                `INSERT INTO history
                (id, paragraph_id, user_id, old_text, new_text, approval_percentage, proposal_id, heading_level, created_at, accepted_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [
                  historyId,
                  paragraphId,
                  null, // System-initiated change
                  currentParagraph.title ? oldTitle : oldText,
                  '', // Empty (cleared)
                  lastApprovalPercentage,
                  lastProposalId,
                  currentParagraph.heading_level
                ]
              );

              logger.debug('Created history entry for threshold fall', {
                historyId,
                paragraphId,
                documentId,
                lastApprovalPercentage,
                lastProposalId
              });
            }, { timeout: 10000 });
          });

          logger.debug('Cleared paragraph content (no approved proposals)', { paragraphId, documentId });

          // Broadcast paragraph update (reverted to empty) via WebSocket (outside lock)
          try {
            const updatedPara = await TransactionManager.query(
              db,
              `SELECT id, text, title, heading_level, order_index FROM paragraphs WHERE id = ?`,
              [paragraphId]
            );
            if (updatedPara) {
              webSocketManager.broadcastDocumentUpdate(documentId, 'paragraph', {
                paragraphId,
                text: updatedPara.text || '',
                title: updatedPara.title || '',
                headingLevel: updatedPara.heading_level,
                orderIndex: updatedPara.order_index,
                reverted: true // Indicates paragraph was reverted to empty state
              });
              logger.debug('Broadcasted paragraph revert', { paragraphId, documentId });
            }
          } catch (paraErr) {
            logger.error('Error fetching updated paragraph for broadcast', { 
              errorMessage: paraErr?.message || 'Unknown error', 
              paragraphId 
            });
          }
        }
        
        return;
      }

      // FIX 5.5: Improved proposal selection - sort by approval percentage first, then votes, then recency
      // This deterministic sorting ensures consistent selection when multiple proposals reach threshold simultaneously
      validProposals.sort((a, b) => {
        // Primary: Highest approval percentage
        if (b.approvalPercentage !== a.approvalPercentage) {
          return b.approvalPercentage - a.approvalPercentage;
        }
        // Secondary: Most votes (pro_votes DESC)
        if (b.pro_votes !== a.pro_votes) {
          return b.pro_votes - a.pro_votes;
        }
        // Tertiary: Most recent if tied (created_at DESC)
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      const bestProposal = validProposals[0];

      if (isAmendmentWindow) {
        await TransactionManager.execute(db,
          `UPDATE proposals SET amendment_candidate = false WHERE paragraph_id = ?`,
          [paragraphId]
        );
        await TransactionManager.execute(db,
          `UPDATE proposals SET amendment_candidate = true WHERE id = ?`,
          [bestProposal.id]
        );
        logger.debug('Marked amendment candidate (deferred canonical apply)', {
          proposalId: bestProposal.id,
          paragraphId,
          documentId,
        });
        return;
      }

      // Get current paragraph content and check if it's the first paragraph (title paragraph)
      const currentParagraph = await TransactionManager.query(
        db,
        `SELECT text, title, order_index FROM paragraphs WHERE id = ?`,
        [paragraphId]
      );

      if (!currentParagraph) {
        logger.warn('Paragraph not found', { paragraphId, documentId });
        return;
      }

      // FIX 5.6: Check if this is the first paragraph more reliably
      // First paragraph always has order_index = 1 and is the document title
      const isFirstParagraph = currentParagraph.order_index === 1;

      const newValue = bestProposal.text;
      const oldValue = bestProposal.type === 'TITLE' ? currentParagraph.title : currentParagraph.text;
      const bestApprovalPercentage = bestProposal.approvalPercentage;

      logger.info('Applying approved proposal to paragraph', { proposalId: bestProposal.id, paragraphId, documentId, approvalPercentage: bestApprovalPercentage });
      if (isFirstParagraph && bestProposal.type === 'TITLE') {
        logger.debug('This is the document title paragraph - will update documents.title', { paragraphId, documentId });
      }

      // Check if we need to update the paragraph content
      const needsUpdate = oldValue !== newValue;

      if (!needsUpdate) {
        logger.debug('Paragraph already has the correct approved content', { paragraphId, documentId });
        // Even if paragraph doesn't need update, we might need to update documents.title
        if (isFirstParagraph && bestProposal.type === 'TITLE') {
          // Use lock only for the update
          await documentLockManager.withLock(documentId, async () => {
            // Check if documents.title needs updating
            const docRow = await TransactionManager.query(
              db,
              `SELECT title FROM documents WHERE id = ?`,
              [documentId]
            );
            const currentDocTitle = docRow?.title;
            if (currentDocTitle !== newValue) {
              logger.debug('Updating documents.title', { documentId, oldTitle: currentDocTitle, newTitle: newValue });
              await TransactionManager.execute(
                db,
                `UPDATE documents SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [newValue, documentId]
              );
              logger.info('Updated documents.title', { documentId, newTitle: newValue });
            }
          });
        }
        return;
      }

      // FIX 5.4: Only lock during actual database updates
      let historyIdToFetch = null;
      await documentLockManager.withLock(documentId, async () => {
        // Execute all updates in a transaction (inside lock)
        historyIdToFetch = await TransactionManager.executeInTransaction(db, async (txDb) => {
        // Update paragraph content
        if (bestProposal.type === 'TITLE') {
          // For TITLE proposals, update the title field and heading_level, clear text (mutually exclusive)
          await TransactionManager.execute(
            txDb,
            `UPDATE paragraphs SET title = ?, heading_level = ?, text = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [newValue, bestProposal.heading_level, '', paragraphId]
          );

          // If this is the first paragraph (document title paragraph), also update documents.title
          if (isFirstParagraph) {
            await TransactionManager.execute(
              txDb,
              `UPDATE documents SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
              [newValue, documentId]
            );
            logger.info('Updated documents.title', { documentId, newTitle: newValue });
          }
        } else {
          // For BODY proposals, update the text field, clear title and heading_level (mutually exclusive)
          await TransactionManager.execute(
            txDb,
            `UPDATE paragraphs SET text = ?, title = NULL, heading_level = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [newValue, paragraphId]
          );
        }

        // Update or create history entry to record this approval
        // First check if history entry already exists for this proposal
        const existingHistory = await TransactionManager.query(
          txDb,
          `SELECT id FROM history WHERE proposal_id = ? AND paragraph_id = ?`,
          [bestProposal.id, paragraphId]
        );

        let historyIdToFetch = null;

        if (existingHistory) {
          // Update existing history entry with current approval percentage and accepted_at
          // Set accepted_at if it's null (for entries created before migration)
          await TransactionManager.execute(
            txDb,
            `UPDATE history SET approval_percentage = ?, accepted_at = COALESCE(accepted_at, CURRENT_TIMESTAMP) WHERE id = ?`,
            [bestApprovalPercentage, existingHistory.id]
          );
          historyIdToFetch = existingHistory.id;
          logger.debug('Updated history entry', { historyId: existingHistory.id, approvalPercentage: bestApprovalPercentage, paragraphId, documentId });
        } else {
          // Create new history entry with accepted_at set to current timestamp
          const { v4: uuidv4 } = require('uuid');
          const historyId = uuidv4();
          historyIdToFetch = historyId;

          await TransactionManager.execute(
            txDb,
            `INSERT INTO history
            (id, paragraph_id, user_id, old_text, new_text, approval_percentage, proposal_id, heading_level, created_at, accepted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [
              historyId,
              paragraphId,
              bestProposal.user_id,
              oldValue,
              newValue,
              bestApprovalPercentage,
              bestProposal.id,
              bestProposal.heading_level
            ]
          );
          logger.debug('Created history entry for approved proposal', { historyId, paragraphId, proposalId, documentId });
        }
        
        // Store historyId for fetching after transaction commits
        return historyIdToFetch;
      }, { timeout: 10000 });
      });

      logger.info('Successfully applied approved proposal to paragraph', { paragraphId, proposalId, documentId });

      // FIX 5.4: Broadcast paragraph update via WebSocket (outside lock for better performance)
      // Fetch history entry and include in broadcast
      try {
        const updatedPara = await TransactionManager.query(
          db,
          `SELECT id, text, title, heading_level, order_index FROM paragraphs WHERE id = ?`,
          [paragraphId]
        );
        
        // Fetch history entry if it was created/updated
        let transformedHistory = null;
        if (historyIdToFetch) {
          try {
            const historyEntry = await TransactionManager.query(
              db,
              `SELECT h.*, u.name as user_name, u.email as user_email, u.avatar as user_avatar,
                     pr.type as proposal_type
              FROM history h
              LEFT JOIN users u ON h.user_id = u.id
              LEFT JOIN proposals pr ON h.proposal_id = pr.id
              WHERE h.id = ?`,
              [historyIdToFetch]
            );
            
            if (historyEntry) {
              // Transform history entry to API format (camelCase)
              transformedHistory = {
                id: historyEntry.id,
                paragraphId: historyEntry.paragraph_id,
                userId: historyEntry.user_id,
                oldText: historyEntry.old_text,
                newText: historyEntry.new_text,
                approvalPercentage: historyEntry.approval_percentage,
                proposalId: historyEntry.proposal_id,
                acceptedAt: historyEntry.accepted_at || historyEntry.created_at,
                createdAt: historyEntry.created_at,
                headingLevel: historyEntry.heading_level,
                type: historyEntry.proposal_type || 'BODY',
                user: historyEntry.user_id ? {
                  id: historyEntry.user_id,
                  name: historyEntry.user_name,
                  email: historyEntry.user_email,
                  avatar: historyEntry.user_avatar
                } : null
              };
            }
          } catch (historyErr) {
            logger.error('Error fetching history entry for WebSocket broadcast', {
              errorMessage: historyErr?.message || 'Unknown error',
              historyId: historyIdToFetch,
              paragraphId,
              documentId
            });
            // Continue without history - paragraph update is more important
          }
        }
        
        if (updatedPara) {
          const updateData = {
            paragraphId,
            text: updatedPara.text || '',
            title: updatedPara.title || null,
            headingLevel: updatedPara.heading_level,
            orderIndex: updatedPara.order_index,
            proposalId: bestProposal.id,
            approvalPercentage: bestApprovalPercentage,
            history: transformedHistory ? [transformedHistory] : []
          };
          
          logger.debug('Broadcasting paragraph update with history', { 
            paragraphId, 
            documentId, 
            proposalId: bestProposal.id,
            hasHistory: !!transformedHistory
          });
          
          webSocketManager.broadcastDocumentUpdate(documentId, 'paragraph', updateData);
          logger.debug('Broadcasted paragraph update', { paragraphId, documentId });
        }
      } catch (paraErr) {
        logger.error('Error fetching paragraph for WebSocket broadcast', { 
          errorMessage: paraErr?.message || 'Unknown error', 
          paragraphId, 
          documentId 
        });
      }

      logger.debug('Completed updateAgreedView', { proposalId, documentId, paragraphId });

  } catch (error) {
    logger.error('Error updating agreed view for paragraph', { 
      errorMessage: error?.message || 'Unknown error', 
      stack: error?.stack, 
      proposalId, 
      documentId 
    });
    throw error;
  }
}

/**
 * Re-evaluate all paragraph proposals for a document after membership change
 * @param {Object} db - Database instance
 * @param {string} documentId - Document ID
 * @returns {Promise<void>}
 */
async function reEvaluateAllProposalsForDocument(db, documentId) {
  try {
    logger.debug('Re-evaluating proposals for document', { documentId });

    // Get all paragraphs with proposals for this document
    const paragraphsWithProposals = await TransactionManager.queryAll(
      db,
      `SELECT DISTINCT p.id as paragraph_id, pr.id as proposal_id
       FROM paragraphs p
       JOIN proposals pr ON p.id = pr.paragraph_id
       WHERE p.document_id = ?`,
      [documentId]
    );

    if (paragraphsWithProposals.length === 0) {
      logger.debug('No paragraphs with proposals found for document', { documentId });
      return;
    }

    logger.debug('Found paragraphs with proposals', { documentId, count: paragraphsWithProposals.length });

    // Re-evaluate each paragraph by calling updateAgreedViewForParagraph
    // Process sequentially to avoid overwhelming the database
    for (const { paragraph_id, proposal_id } of paragraphsWithProposals) {
      try {
        await updateAgreedViewForParagraph(db, proposal_id, documentId);
      } catch (error) {
        // Log error but continue processing other paragraphs
        logger.error('Error re-evaluating proposal for paragraph', {
          error: error.message,
          documentId,
          paragraphId: paragraph_id,
          proposalId: proposal_id
        });
      }
    }

    logger.info('Completed re-evaluation of proposals for document', { documentId, paragraphCount: paragraphsWithProposals.length });
  } catch (error) {
    logger.error('Error in reEvaluateAllProposalsForDocument', {
      error: error.message,
      stack: error.stack,
      documentId
    });
    // Don't throw - this is a background operation
  }
}

/**
 * Re-evaluate all paragraph proposals for all documents in an organization
 * @param {Object} db - Database instance
 * @param {string} organizationId - Organization ID
 * @returns {Promise<void>}
 */
async function reEvaluateOrganizationProposals(db, organizationId) {
  try {
    logger.debug('Re-evaluating proposals for organization', { organizationId });

    // Get all documents with proposals for this organization (optimized query)
    const documentsWithProposals = await TransactionManager.queryAll(
      db,
      `SELECT DISTINCT d.id
       FROM documents d
       JOIN paragraphs p ON d.id = p.document_id
       JOIN proposals pr ON p.id = pr.paragraph_id
       WHERE d.organization_id = ?
         AND d.ownership_type = 'organizational'`,
      [organizationId]
    );

    if (documentsWithProposals.length === 0) {
      logger.debug('No documents with proposals found for organization', { organizationId });
      return;
    }

    logger.debug('Found documents with proposals', { organizationId, count: documentsWithProposals.length });

    // Process documents sequentially to avoid overwhelming the database
    for (const doc of documentsWithProposals) {
      try {
        await reEvaluateAllProposalsForDocument(db, doc.id);
      } catch (error) {
        // Log error but continue processing other documents
        logger.error('Error re-evaluating proposals for document', {
          error: error.message,
          organizationId,
          documentId: doc.id
        });
      }
    }

    logger.info('Completed re-evaluation of proposals for organization', {
      organizationId,
      documentCount: documentsWithProposals.length
    });
  } catch (error) {
    logger.error('Error in reEvaluateOrganizationProposals', {
      error: error.message,
      stack: error.stack,
      organizationId
    });
    // Don't throw - this is a background operation
  }
}

module.exports = router;

// Export functions for use in other modules and tests
async function applyProposalToCanonical(db, proposalId, documentId) {
  await updateAgreedViewForParagraph(db, proposalId, documentId, { forceCanonical: true });
}

module.exports.updateAgreedViewForParagraph = updateAgreedViewForParagraph;
module.exports.applyProposalToCanonical = applyProposalToCanonical;
module.exports.reEvaluateAllProposalsForDocument = reEvaluateAllProposalsForDocument;
module.exports.reEvaluateOrganizationProposals = reEvaluateOrganizationProposals;
