/**
 * Background Job Scheduler for Organizational Documents
 * Handles automated deadline monitoring and status transitions
 */

const { v4: uuidv4 } = require('uuid');
const { logger } = require('../middleware/logger');
const TransactionManager = require('../database/services/TransactionManager');

class DocumentScheduler {
  constructor(knex) {
    this.db = knex; // Knex instance
    this.jobs = new Map();
    this.isRunning = false;
  }

  /**
   * Get boolean value for SQL queries
   * @param {boolean} value - Boolean value
   * @returns {boolean}
   */
  sqlBoolean(value) {
    return !!value;
  }

  /**
   * Start the scheduler with all background jobs
   */
  start() {
    if (this.isRunning) {
      logger.debug('Scheduler already running');
      return;
    }

    logger.info('Starting Document Scheduler');
    this.isRunning = true;

    // Check proposal deadlines every 15 minutes
    this.jobs.set('proposal-check', setInterval(() => {
      this.checkProposalDeadlines().catch(err => {
        logger.error('Error in proposal deadline check', { error: err.message, stack: err.stack });
      });
    }, 15 * 60 * 1000)); // 15 minutes

    // Check proposal cutoff every 15 minutes
    this.jobs.set('proposal-cutoff-check', setInterval(() => {
      this.checkProposalCutoff().catch(err => {
        logger.error('Error in proposal cutoff check', { error: err.message, stack: err.stack });
      });
    }, 15 * 60 * 1000)); // 15 minutes

    // Check voting deadlines every 15 minutes
    this.jobs.set('voting-check', setInterval(() => {
      this.checkVotingDeadlines().catch(err => {
        logger.error('Error in voting deadline check', { error: err.message, stack: err.stack });
      });
    }, 15 * 60 * 1000)); // 15 minutes

    // Check deletion vote deadlines every 15 minutes
    this.jobs.set('deletion-check', setInterval(() => {
      this.checkDeletionDeadlines().catch(err => {
        logger.error('Error in deletion deadline check', { error: err.message, stack: err.stack });
      });
    }, 15 * 60 * 1000)); // 15 minutes

    // Process expired documents hourly
    this.jobs.set('expired-check', setInterval(() => {
      this.processExpiredDocuments().catch(err => {
        logger.error('Error in expired document processing', { error: err.message, stack: err.stack });
      });
    }, 60 * 60 * 1000)); // 1 hour

    // Check expired rule proposals every 2 hours
    this.jobs.set('rule-proposal-expiration-check', setInterval(() => {
      this.processExpiredRuleProposals().catch(err => {
        logger.error('Error in rule proposal expiration check', { error: err.message, stack: err.stack });
      });
    }, 2 * 60 * 60 * 1000)); // 2 hours

    // Expire overdue structure proposals every 15 minutes
    this.jobs.set('structure-proposal-expiration-check', setInterval(() => {
      this.expireOverdueStructureProposals().catch(err => {
        logger.error('Error in structure proposal expiration check', { error: err.message, stack: err.stack });
      });
    }, 15 * 60 * 1000)); // 15 minutes

    // Expire overdue tree proposals every 15 minutes
    this.jobs.set('tree-proposal-expiration-check', setInterval(() => {
      this.expireOverdueTreeProposals().catch(err => {
        logger.error('Error in tree proposal expiration check', { error: err.message, stack: err.stack });
      });
    }, 15 * 60 * 1000)); // 15 minutes

    // Deadlines approaching digest (batched, once per user per day) - daily
    this.jobs.set('deadlines-digest', setInterval(() => {
      this.sendDeadlinesApproachingDigests().catch(err => {
        logger.error('Error in deadlines digest', { error: err.message, stack: err.stack });
      });
    }, 24 * 60 * 60 * 1000)); // 24 hours

    // Send digest emails - daily
    this.jobs.set('digest-emails', setInterval(() => {
      this.sendDigestEmails().catch(err => {
        logger.error('Error in digest email processing', { error: err.message, stack: err.stack });
      });
    }, 24 * 60 * 60 * 1000)); // 24 hours

    // Check term expirations daily
    this.jobs.set('term-expiration-check', setInterval(() => {
      this.checkTermExpirations().catch(err => {
        logger.error('Error in term expiration check', { error: err.message, stack: err.stack });
      });
    }, 24 * 60 * 60 * 1000)); // 24 hours

    // Advance election phases every 15 minutes (same as other deadline checks)
    this.jobs.set('election-phase-advance', setInterval(() => {
      this.advanceElectionPhases().catch(err => {
        logger.error('Error in election phase advancement', { error: err.message, stack: err.stack });
      });
    }, 15 * 60 * 1000)); // 15 minutes

    // Process pending resignations daily
    this.jobs.set('pending-resignation-check', setInterval(() => {
      this.processPendingResignations().catch(err => {
        logger.error('Error in pending resignation check', { error: err.message, stack: err.stack });
      });
    }, 24 * 60 * 60 * 1000)); // 24 hours

    // Clean up expired password reset tokens daily
    this.jobs.set('password-reset-token-cleanup', setInterval(() => {
      this.cleanupExpiredPasswordResetTokens().catch(err => {
        logger.error('Error in password reset token cleanup', { error: err.message, stack: err.stack });
      });
    }, 24 * 60 * 60 * 1000)); // 24 hours

    // Run initial checks immediately.
    // Skipped under NODE_ENV=test: this burst fires ~12 DB-heavy jobs concurrently
    // 5s after every server start, which exhausts the small test connection pool
    // (each integration suite boots its own server) and causes cascading 503s.
    // The interval jobs above (15min+) and `isRunning` are still registered, so the
    // scheduler is considered "running" for tests; production behavior is unchanged.
    if (process.env.NODE_ENV !== 'test') {
      setTimeout(() => {
        this.checkProposalDeadlines().catch(err => logger.error('Error in proposal deadline check', { error: err.message }));
        this.checkProposalCutoff().catch(err => logger.error('Error in proposal cutoff check', { error: err.message }));
        this.checkVotingDeadlines().catch(err => logger.error('Error in voting deadline check', { error: err.message }));
        this.checkDeletionDeadlines().catch(err => logger.error('Error in deletion deadline check', { error: err.message }));
        this.processExpiredRuleProposals().catch(err => logger.error('Error in rule proposal expiration check', { error: err.message }));
        this.expireOverdueStructureProposals().catch(err => logger.error('Error in structure proposal expiration check', { error: err.message }));
        this.sendDeadlinesApproachingDigests().catch(err => logger.error('Error in deadlines digest', { error: err.message }));
        this.sendDigestEmails().catch(err => logger.error('Error in digest email processing', { error: err.message }));
        this.checkTermExpirations().catch(err => logger.error('Error in term expiration check', { error: err.message }));
        this.advanceElectionPhases().catch(err => logger.error('Error in election phase advancement', { error: err.message }));
        this.processPendingResignations().catch(err => logger.error('Error in pending resignation check', { error: err.message }));
        this.cleanupExpiredPasswordResetTokens().catch(err => logger.error('Error in password reset token cleanup', { error: err.message }));
      }, 5000); // 5 seconds after startup
    }

    logger.info('Document Scheduler started successfully');
  }

  /**
   * Stop the scheduler and clear all jobs
   */
  stop() {
    if (!this.isRunning) return;

    logger.info('Stopping Document Scheduler');

    for (const [name, job] of this.jobs) {
      clearInterval(job);
      logger.debug('Cleared scheduler job', { jobName: name });
    }

    this.jobs.clear();
    this.isRunning = false;
    logger.info('Document Scheduler stopped');
  }

  /**
   * Check for documents where proposal deadline has passed
   * Transition them to voting status
   */
  async checkProposalDeadlines() {
    logger.debug('Checking proposal deadlines');

    try {
      const now = new Date().toISOString();

      // FIX 6.1: Use <= instead of < to catch documents exactly at deadline
      const documents = await TransactionManager.queryAll(this.db, `
        SELECT id, title, owner_id, organization_id
        FROM documents
        WHERE status = 'proposal'
        AND proposal_deadline <= ?
        AND proposal_deadline IS NOT NULL
      `, [now]);

      // Log when no documents transition: helps diagnose "document not moving to voting"
      const proposalCountRow = await TransactionManager.query(this.db, `
        SELECT COUNT(*) as count FROM documents WHERE status = 'proposal'
      `);
      const proposalWithNullDeadline = await TransactionManager.query(this.db, `
        SELECT COUNT(*) as count FROM documents WHERE status = 'proposal' AND (proposal_deadline IS NULL OR proposal_deadline > ?)
      `, [now]);
      logger.debug('Proposal deadline check', {
        transitioningNow: documents.length,
        totalInProposal: proposalCountRow?.count ?? 0,
        proposalWithFutureOrNullDeadline: proposalWithNullDeadline?.count ?? 0,
        now
      });

      for (const doc of documents) {
        try {
          await this.transitionToVoting(doc.id, doc.owner_id);
          logger.info('Transitioned document to voting status', { documentId: doc.id, title: doc.title.substring(0, 50) });
        } catch (error) {
          logger.error('Failed to transition document to voting status', { error: error.message, stack: error.stack, documentId: doc.id });
        }
      }

    } catch (error) {
      logger.error('Error checking proposal deadlines', { error: error.message, stack: error.stack });
    }
  }

  /**
   * Check for documents where voting deadline has passed
   * Calculate final results and set final status
   */
  async checkVotingDeadlines() {
    logger.debug('Checking voting deadlines');

    try {
      const now = new Date().toISOString();

      // FIX 6.1: Use <= instead of < to catch documents exactly at deadline
      // This prevents missing documents if scheduler runs while deadline is being set
      const documents = await TransactionManager.queryAll(this.db, `
        SELECT id, title, owner_id, organization_id, acceptance_threshold, min_voters_required
        FROM documents
        WHERE status = 'voting'
        AND voting_deadline <= ?
        AND voting_deadline IS NOT NULL
      `, [now]);

      logger.debug('Found documents with expired voting periods', { count: documents.length });

      for (const doc of documents) {
        try {
          await this.finalizeVoting(doc);
        } catch (error) {
          logger.error('Failed to finalize voting for document', { error: error.message, stack: error.stack, documentId: doc.id });
        }
      }

    } catch (error) {
      logger.error('Error checking voting deadlines', { error: error.message, stack: error.stack });
    }
  }

  /**
   * Process documents that have been in proposal status too long
   */
  async processExpiredDocuments() {
    logger.debug('Processing expired documents');

    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Find documents stuck in proposal status for too long
      const documents = await TransactionManager.queryAll(this.db, `
        SELECT id, title, owner_id, created_at
        FROM documents
          WHERE status = 'proposal'
          AND created_at < ?
          AND proposal_deadline IS NULL
        `, [thirtyDaysAgo.toISOString()]);

      logger.debug('Found expired documents', { count: documents.length });

      for (const doc of documents) {
        try {
          await this.transitionToExpired(doc.id, doc.owner_id);
          logger.info('Marked document as expired', { documentId: doc.id, title: doc.title.substring(0, 50) });
        } catch (error) {
          logger.error('Failed to expire document', { error: error.message, stack: error.stack, documentId: doc.id });
        }
      }

    } catch (error) {
      logger.error('Error processing expired documents', { error: error.message, stack: error.stack });
    }
  }

  /**
   * Transition document from proposal to voting status
   */
  async transitionToVoting(documentId, userId) {
    // Get document's organization_id to fetch governance rules
    const document = await TransactionManager.query(this.db, 'SELECT organization_id FROM documents WHERE id = ?', [documentId]);

    // Fetch governance rules to get default_voting_deadline_hours
    let votingDeadlineHours = 168; // Default 7 days (168 hours)
    if (document?.organization_id) {
      try {
        const governanceModule = require('../routes/governance');
        const { transformRulesToCamelCase } = require('../utils/governanceFieldMapping');
        const rulesRaw = await governanceModule.getGovernanceRules(this.db, document.organization_id);
        const governanceRules = rulesRaw ? transformRulesToCamelCase(rulesRaw) : null;
        if (governanceRules?.defaultVotingDeadlineHours) {
          votingDeadlineHours = governanceRules.defaultVotingDeadlineHours;
        }
      } catch (govErr) {
        logger.warn('Could not fetch governance rules for voting deadline, using default', { error: govErr.message, organizationId: document?.organization_id });
      }
    }

    const votingDeadline = new Date();
    votingDeadline.setHours(votingDeadline.getHours() + votingDeadlineHours);
    logger.debug('Voting deadline set from governance rules', { documentId, votingDeadlineHours, days: (votingDeadlineHours / 24).toFixed(1) });

    // Get organization member count for quorum calculation
    let minVotersRequired = 0;
    try {
      const doc = await TransactionManager.query(this.db, 'SELECT organization_id FROM documents WHERE id = ?', [documentId]);

      if (doc?.organization_id) {
        const memberCountRow = await TransactionManager.query(this.db, `
          SELECT COUNT(*) as count FROM organization_members
          WHERE organization_id = ? AND status = 'active'
        `, [doc.organization_id]);
        const memberCount = memberCountRow?.count || 0;

        // Get governance rules to use defaultQuorumPercentage
        let quorumPercentage = 0.3; // Default 30%
        try {
          const governanceModule = require('../routes/governance');
          const { transformRulesToCamelCase } = require('../utils/governanceFieldMapping');
          const rulesRaw = await governanceModule.getGovernanceRules(this.db, doc.organization_id);
          const governanceRules = rulesRaw ? transformRulesToCamelCase(rulesRaw) : null;
          if (governanceRules?.defaultQuorumPercentage) {
            quorumPercentage = governanceRules.defaultQuorumPercentage;
          }
        } catch (govErr) {
          logger.warn('Could not fetch governance rules for quorum, using default 30%', { error: govErr.message, organizationId: doc.organization_id });
        }
        
        // Require quorum percentage participation (from governance rules or default 30%)
        minVotersRequired = Math.max(1, Math.ceil(memberCount * quorumPercentage));
        logger.debug('Document quorum calculation', { documentId, memberCount, minVotersRequired, quorumPercentage: (quorumPercentage * 100).toFixed(0) });
      }
    } catch (error) {
      logger.warn('Could not calculate quorum for document', { error: error.message, documentId });
      minVotersRequired = 1; // Minimum fallback
    }

    // Use DocumentStatusManager for proper status transitions
    const DocumentStatusManager = require('./document-status');
    await DocumentStatusManager.transitionToVoting(this.db, documentId, userId || 'system');

    // Update min_voters_required if not already set
    await TransactionManager.execute(this.db, `
      UPDATE documents
      SET min_voters_required = ?
      WHERE id = ? AND (min_voters_required IS NULL OR min_voters_required = 0)
    `, [minVotersRequired, documentId]);

    // Broadcast WebSocket update
    const webSocketManager = require('./websocket');
    webSocketManager.broadcastDocumentUpdate(documentId, 'document-status-changed', {
      oldStatus: 'proposal',
      newStatus: 'voting',
      votingDeadline: votingDeadline.toISOString(),
      reason: 'proposal_deadline_passed'
    });
  }

  /**
   * Send notifications when voting starts for a document
   */
  async notifyVotingStarted(documentId) {
    try {
      const doc = await TransactionManager.query(this.db, `
        SELECT d.title, d.organization_id, o.name as org_name
        FROM documents d
        LEFT JOIN organizations o ON d.organization_id = o.id
        WHERE d.id = ?
      `, [documentId]);

      if (!doc) return;

      // Get organization members to notify
      const members = await TransactionManager.queryAll(this.db, `
        SELECT u.email, u.name
        FROM organization_members om
        JOIN users u ON om.user_id = u.id
        WHERE om.organization_id = ? AND om.status = 'active'
          AND om.user_id NOT IN (SELECT id FROM organizations)
      `, [doc.organization_id]);

      // Log notification (email notifications not implemented)
      logger.debug('Would send voting started notifications', { documentId: doc.id, title: doc.title.substring(0, 50), memberCount: members.length });

    } catch (error) {
      logger.error('Error sending voting notifications for document', { error: error.message, stack: error.stack, documentId });
    }
  }

  /**
   * Finalize voting and determine final status
   */
  async finalizeVoting(doc) {
    // Get voting results
    const votes = await TransactionManager.queryAll(this.db, `
        SELECT vote FROM document_votes WHERE document_id = ?
      `, [doc.id]);

    // Get eligible voters count
    const VoterManager = require('./voting');
    const eligibleVoters = await VoterManager.getEligibleVoters(this.db, doc.id);
    const totalEligible = eligibleVoters.length;

    const actualVotes = votes.length;
    const proVotes = votes.filter(v => v.vote === 'PRO').length;
    const approvalRate = actualVotes > 0 ? (proVotes / actualVotes) * 100 : 0;

    logger.info('Document voting results', { documentId: doc.id, proVotes, actualVotes, approvalRate, totalEligible });

    // FIX 6.3: Always recalculate quorum from current membership (min_voters_required may be outdated)
    // Always recalculate from current eligible voters and governance rules
    let quorumPercentage = 0.3; // Default 30%
    if (doc.organization_id) {
      try {
        const governanceModule = require('../routes/governance');
        const { transformRulesToCamelCase } = require('../utils/governanceFieldMapping');
        const rulesRaw = await governanceModule.getGovernanceRules(this.db, doc.organization_id);
        const governanceRules = rulesRaw ? transformRulesToCamelCase(rulesRaw) : null;
        if (governanceRules?.defaultQuorumPercentage) {
          quorumPercentage = governanceRules.defaultQuorumPercentage;
        }
      } catch (govErr) {
        logger.warn('Could not fetch governance rules for quorum, using default 30%', { error: govErr.message, organizationId: doc.organization_id });
      }
    }
    const quorumRequired = Math.max(1, Math.ceil(totalEligible * quorumPercentage));
    const quorumMet = actualVotes >= quorumRequired;
    
    logger.debug('Quorum calculation', { 
      documentId: doc.id, 
      totalEligible, 
      quorumPercentage: (quorumPercentage * 100).toFixed(1) + '%',
      quorumRequired, 
      actualVotes,
      quorumMet,
      note: 'Recalculated from current membership (min_voters_required may be outdated)'
    });

    let finalStatus, reason;

    if (!quorumMet) {
      finalStatus = 'rejected';
      reason = 'insufficient_participation';
      logger.warn('Quorum not met', { documentId: doc.id, actualVotes, quorumRequired });
    } else if (approvalRate >= (doc.acceptance_threshold || 75)) {
      finalStatus = 'agreed';
      reason = 'approval_threshold_met';
      logger.info('Approval threshold met', { documentId: doc.id, approvalRate, threshold: doc.acceptance_threshold || 75 });
    } else {
      finalStatus = 'rejected';
      reason = 'insufficient_approval';
      logger.warn('Approval threshold not met', { documentId: doc.id, approvalRate, threshold: doc.acceptance_threshold || 75 });
    }

    // Use DocumentStatusManager for proper status transitions
    // Note: DocumentStatusManager will handle both document and organization broadcasts
    const DocumentStatusManager = require('./document-status');
    if (finalStatus === 'agreed') {
      await DocumentStatusManager.transitionToAgreed(this.db, doc.id, 'system');
    } else {
      await DocumentStatusManager.transitionToRejected(this.db, doc.id, 'system', reason);
    }

    // Broadcast WebSocket update (DocumentStatusManager already broadcasts, but we include additional data)
    const webSocketManager = require('./websocket');
    webSocketManager.broadcastDocumentUpdate(doc.id, 'document-status-changed', {
      oldStatus: 'voting',
      newStatus: finalStatus,
      reason: reason,
      approvalRate: approvalRate.toFixed(1),
      quorumMet: quorumMet
    });

    // Also broadcast as organization update if document belongs to an organization
    // (DocumentStatusManager already does this, but we include additional data here)
    if (doc.organization_id) {
      webSocketManager.broadcastOrganizationUpdate(doc.organization_id, 'document-status-changed', {
        documentId: doc.id,
        oldStatus: 'voting',
        newStatus: finalStatus,
        reason: reason,
        approvalRate: approvalRate.toFixed(1),
        quorumMet: quorumMet
      });
    }
  }

  /**
   * FIX 6.2: Retry mechanism for finalizeVoting with exponential backoff
   */
  async retryFinalizeVoting(doc, options = {}) {
    const {
      maxRetries = 3,
      initialDelay = 1000,
      maxDelay = 10000,
      backoffMultiplier = 2
    } = options;

    let lastError;
    let delay = initialDelay;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.finalizeVoting(doc);
      } catch (error) {
        lastError = error;
        
        // Only retry on transient errors (database locks, connection issues)
        const retryableErrors = ['ECONNRESET', 'ETIMEDOUT', 'deadlock', 'timeout'];
        const isRetryable = error.code && retryableErrors.some(code => error.code.includes(code)) ||
                            error.message && (error.message.includes('locked') ||
                                             error.message.includes('transaction') ||
                                             error.message.includes('timeout') ||
                                             error.message.includes('deadlock') ||
                                             error.message.includes('connection'));
        
        if (!isRetryable || attempt === maxRetries) {
          // Not retryable or max retries reached
          logger.warn('FinalizeVoting failed and will not be retried', {
            error: error.message,
            code: error.code,
            attempt: attempt + 1,
            documentId: doc.id
          });
          throw error;
        }

        // Log retry attempt
        logger.warn(`FinalizeVoting failed, retrying (attempt ${attempt + 1}/${maxRetries})`, {
          error: error.message,
          code: error.code,
          delay,
          documentId: doc.id
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

  /**
   * Check for documents where proposal cutoff has passed
   * Disable new paragraph proposals and broadcast updates
   */
  async checkProposalCutoff() {
    logger.debug('Checking proposal cutoff deadlines');

    try {
      const now = new Date().toISOString();

      // Find documents where paragraph_proposals_cutoff < now and status = 'proposal'
      // Also find documents that should have cutoff set but don't (approaching proposal deadline)
      const documents = await TransactionManager.queryAll(this.db, `
        SELECT id, title, paragraph_proposals_cutoff, proposal_deadline, ownership_type
        FROM documents
        WHERE status = 'proposal'
        AND ownership_type = 'organizational'
        AND (
          (paragraph_proposals_cutoff < ? AND paragraph_proposals_cutoff IS NOT NULL)
          OR (paragraph_proposals_cutoff IS NULL AND proposal_deadline < ?)
        )
      `, [now, now]);

      logger.debug('Found documents past proposal cutoff or needing cutoff set', { count: documents.length });

      // Broadcast WebSocket updates for proposal cutoff
      const webSocketManager = require('./websocket');
      for (const doc of documents) {
        // If cutoff is null but deadline passed, set it to the deadline (enforce cutoff)
        if (!doc.paragraph_proposals_cutoff && doc.proposal_deadline) {
          await TransactionManager.execute(this.db, `
            UPDATE documents
            SET paragraph_proposals_cutoff = proposal_deadline
            WHERE id = ? AND paragraph_proposals_cutoff IS NULL
          `, [doc.id]);
          logger.info('Set proposal cutoff for document', { documentId: doc.id, cutoffDate: doc.proposal_deadline });
        }

        webSocketManager.broadcastDocumentUpdate(doc.id, 'proposal-cutoff-reached', {
          documentId: doc.id,
          cutoffDate: doc.paragraph_proposals_cutoff || doc.proposal_deadline,
          proposalsLocked: true,
          message: 'The proposal cutoff deadline has passed. New paragraph proposals are no longer accepted.'
        });
      }

    } catch (error) {
      logger.error('Error checking proposal cutoff', { error: error.message, stack: error.stack });
    }
  }

  /**
   * Check for documents where deletion vote deadline has passed
   * Finalize deletion votes
   */
  async checkDeletionDeadlines() {
    logger.debug('Checking deletion vote deadlines');

    try {
      const now = new Date().toISOString();

      // FIX 6.1: Use <= instead of < to catch documents exactly at deadline
      // Find documents with expired deletion votes
      const documents = await TransactionManager.queryAll(this.db, `
        SELECT id, title, organization_id, deletion_vote_deadline, deletion_proposed_by
        FROM documents
        WHERE deletion_vote_deadline <= ?
        AND deletion_vote_deadline IS NOT NULL
        AND deletion_proposed_at IS NOT NULL
      `, [now]);

      logger.debug('Found documents with expired deletion votes', { count: documents.length });

      // FIX 8.4: Add retry mechanism for failed deletion finalizations
      for (const doc of documents) {
        try {
          await this.retryFinalizeDeletionVote(doc);
        } catch (error) {
          logger.error('Failed to finalize deletion vote for document after retries', { error: error.message, stack: error.stack, documentId: doc.id });
          // Log to a failed finalizations queue for manual review (could be implemented later)
        }
      }

    } catch (error) {
      logger.error('Error checking deletion deadlines', { error: error.message, stack: error.stack });
    }
  }

  /**
   * Finalize deletion vote and delete document if approved
   */
  async finalizeDeletionVote(doc) {
    // Get deletion votes
    const votes = await TransactionManager.queryAll(this.db, `
      SELECT vote FROM document_deletion_votes WHERE document_id = ?
    `, [doc.id]);

    // Get organization member count
    const memberCountRow = await TransactionManager.query(this.db, `
      SELECT COUNT(*) as count FROM organization_members
      WHERE organization_id = ? AND status = 'active'
    `, [doc.organization_id]);
    const memberCount = memberCountRow?.count || 0;

    const actualVotes = votes.length;
    const proVotes = votes.filter(v => v.vote === 'PRO').length;
    const contraVotes = votes.filter(v => v.vote === 'CONTRA').length;
    const neutralVotes = votes.filter(v => v.vote === 'NEUTRAL').length;

    // Use unified service to check approval (handles quorum and calculation method correctly)
    const UnifiedVotingService = require('./unified-voting');
    const approvalResult = await UnifiedVotingService.checkApproval({
      db: this.db,
      organizationId: doc.organization_id || null,
      proVotes,
      totalVotes: actualVotes,
      totalEligible: memberCount,
      acceptanceThreshold: 75.0 // Default, will be overridden by governance rules if available
    });

    const auditId = uuidv4();
    const auditOutcome = approvalResult.approved ? 'accepted' : 'rejected';
    try {
      await TransactionManager.execute(this.db, `
        INSERT INTO decisions_audit (
          id, kind, outcome, organization_id, document_id, document_title,
          pro_votes, contra_votes, neutral_votes, total_eligible_voters,
          approval_percentage, threshold, changed_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [
        auditId,
        'document_deletion',
        auditOutcome,
        doc.organization_id,
        doc.id,
        doc.title || null,
        proVotes,
        contraVotes,
        neutralVotes,
        memberCount,
        approvalResult.approvalPercentage,
        approvalResult.details?.threshold ?? 75.0,
        doc.deletion_proposed_by || null,
      ]);
    } catch (auditErr) {
      logger.warn('Failed to write deletion decision audit', {
        documentId: doc.id,
        error: auditErr.message,
      });
    }

    if (approvalResult.approved) {
      // Delete the document
      logger.info('Deleting document (deletion vote approved)', { 
        documentId: doc.id, 
        approvalPercentage: approvalResult.approvalPercentage,
        calculationMethod: approvalResult.details.calculationMethod
      });
      
      // Delete document (cascade will handle related records)
      await TransactionManager.execute(this.db, `DELETE FROM documents WHERE id = ?`, [doc.id]);

      // Broadcast WebSocket update
      const webSocketManager = require('./websocket');
      webSocketManager.broadcastDocumentUpdate(doc.id, 'document-deleted', {
        documentId: doc.id,
        reason: 'deletion_approved',
        approvalPercentage: approvalResult.approvalPercentage.toFixed(1)
      });
    } else {
      // Cancel deletion proposal
      await TransactionManager.execute(this.db, `
        UPDATE documents
        SET deletion_proposed_at = NULL,
            deletion_proposed_by = NULL,
            deletion_vote_deadline = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [doc.id]);

      // Delete deletion votes
      await TransactionManager.execute(this.db, `DELETE FROM document_deletion_votes WHERE document_id = ?`, [doc.id]);

      logger.info('Deletion vote for document rejected', { 
        documentId: doc.id, 
        approvalPercentage: approvalResult.approvalPercentage,
        quorumMet: approvalResult.quorumMet 
      });

      // Broadcast WebSocket update
      const webSocketManager = require('./websocket');
      webSocketManager.broadcastDocumentUpdate(doc.id, 'deletion-vote-rejected', {
        type: 'deletion-vote-rejected',
        documentId: doc.id,
        approvalPercentage: approvalResult.approvalPercentage.toFixed(1),
        quorumMet: approvalResult.quorumMet
      });
    }
  }

  /**
   * Mark document as expired
   */
  async transitionToExpired(documentId, userId) {
    const DocumentStatusManager = require('./document-status');
    await DocumentStatusManager.transitionToExpired(this.db, documentId, userId || 'system');
  }

  /**
   * Log status change to history table
   */
  async logStatusChange(documentId, oldStatus, newStatus, changedBy, reason) {
    const historyId = uuidv4();

    await TransactionManager.execute(this.db, `
      INSERT INTO document_status_history
      (id, document_id, old_status, new_status, changed_by, change_reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [historyId, documentId, oldStatus, newStatus, changedBy, reason]);

    logger.debug('Logged status change', { documentId, oldStatus, newStatus, reason });
  }

  /**
   * Get scheduler status for monitoring
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeJobs: Array.from(this.jobs.keys()),
      nextRuns: {
        'proposal-check': new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        'voting-check': new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        'expired-check': new Date(Date.now() + 60 * 60 * 1000).toISOString()
      }
    };
  }

  /**
   * Expire overdue structure proposals
   * Sets status = 'rejected' for structure proposals whose voting_deadline has passed
   * and that are not yet applied or already decided.
   */
  async expireOverdueStructureProposals() {
    logger.debug('Expiring overdue structure proposals');

    try {
      const now = new Date().toISOString();
      // Use <= to catch proposals exactly at deadline (same rationale as document voting in checkVotingDeadlines)
      const result = await TransactionManager.execute(this.db, `
        UPDATE structure_proposals
        SET status = 'rejected', updated_at = ?
        WHERE voting_deadline IS NOT NULL
          AND voting_deadline <= ?
          AND applied = false
          AND (status IS NULL OR status NOT IN ('approved', 'rejected'))
      `, [now, now]);
      const count = result?.changes ?? result?.rowCount ?? 0;
      if (count > 0) {
        logger.debug('Expired overdue structure proposals', { count });
      }
    } catch (err) {
      logger.error('Error expiring overdue structure proposals', { error: err.message, stack: err.stack });
      throw err;
    }
  }

  /**
   * Expire overdue tree proposals
   * Sets status = 'rejected' for document_tree_proposals whose voting_deadline has passed
   * and that are still pending.
   */
  async expireOverdueTreeProposals() {
    logger.debug('Expiring overdue tree proposals');

    try {
      const now = new Date().toISOString();
      // Use <= to catch proposals exactly at deadline (same rationale as document voting in checkVotingDeadlines)
      const result = await TransactionManager.execute(this.db, `
        UPDATE document_tree_proposals
        SET status = 'rejected', updated_at = ?
        WHERE voting_deadline IS NOT NULL
          AND voting_deadline <= ?
          AND status = 'pending'
      `, [now, now]);
      const count = result?.changes ?? result?.rowCount ?? 0;
      if (count > 0) {
        logger.debug('Expired overdue tree proposals', { count });
      }
    } catch (err) {
      logger.error('Error expiring overdue tree proposals', { error: err.message, stack: err.stack });
      throw err;
    }
  }

  /**
   * Process expired rule proposals
   * Auto-rejects proposals where voting deadline has passed
   */
  async processExpiredRuleProposals() {
    logger.debug('Processing expired rule proposals');

    try {
      // Check if table exists first.
      const tableQuery = "SELECT table_name as name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'governance_rule_proposals'";
      
      const tableRow = await TransactionManager.query(this.db, tableQuery);
      const tableExists = !!tableRow;

      if (!tableExists) {
        logger.debug('governance_rule_proposals table does not exist, skipping expired proposals processing');
        return;
      }

      const now = new Date().toISOString();

      // Find active proposals past their voting deadline
      const expiredProposals = await TransactionManager.queryAll(this.db, `
        SELECT id, organization_id, title, current_rule_field, voting_ends_at, votes_yes, votes_no, votes_abstain, votes_cast, created_by
        FROM governance_rule_proposals
        WHERE status = 'active'
          AND voting_ends_at IS NOT NULL
          AND voting_ends_at < ?
      `, [now]);

      logger.debug('Found expired rule proposals', { count: expiredProposals.length });

      for (const proposal of expiredProposals) {
        try {
          const RuleProposalService = require('../services/governance/RuleProposalService');
          await RuleProposalService.updateRuleProposalVoteCounts(this.db, proposal.id);
          const voteCountsRow = await TransactionManager.query(this.db, `
            SELECT votes_yes, votes_no, votes_abstain, votes_cast
            FROM governance_rule_proposals
            WHERE id = ?
          `, [proposal.id]);
          const voteCounts = {
            votes_yes: voteCountsRow?.votes_yes || 0,
            votes_no: voteCountsRow?.votes_no || 0,
            votes_abstain: voteCountsRow?.votes_abstain || 0,
            votes_cast: voteCountsRow?.votes_cast || 0
          };

          // Update proposal with final counts and mark as cancelled (expired)
          // Note: Schema only allows: 'draft', 'active', 'approved', 'rejected', 'cancelled'
          // Using 'cancelled' for expired proposals that didn't meet the threshold
          await TransactionManager.execute(this.db, `
            UPDATE governance_rule_proposals SET
              status = 'cancelled',
              votes_yes = ?,
              votes_no = ?,
              votes_abstain = ?,
              votes_cast = ?,
              updated_at = ?
            WHERE id = ?
          `, [
            voteCounts.votes_yes,
            voteCounts.votes_no,
            voteCounts.votes_abstain,
            voteCounts.votes_cast,
            now,
            proposal.id
          ]);

          // Log audit event (using direct database insert since we can't easily access logAudit)
          // Use created_by user ID instead of 'system' to satisfy foreign key constraint
          try {
            const auditId = uuidv4();
            await TransactionManager.execute(this.db, `
              INSERT INTO organization_audit (
                id, organization_id, action_type, performed_by_user_id, affected_user_id,
                details, ip_address, user_agent, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              auditId,
              proposal.organization_id,
              'rule_proposal_expired',
              proposal.created_by || null, // Use proposal creator, or null if not available
              null,
              JSON.stringify({
                proposalId: proposal.id,
                title: proposal.title,
                field: proposal.current_rule_field,
                votesYes: voteCounts.votes_yes,
                votesNo: voteCounts.votes_no,
                votesAbstain: voteCounts.votes_abstain
              }),
              null,
              null,
              now
            ]);
          } catch (auditErr) {
            // Audit logging failures shouldn't break the main operation
            logger.warn('Failed to log audit event for expired proposal', { 
              error: auditErr.message, 
              proposalId: proposal.id,
              organizationId: proposal.organization_id
            });
          }

          // Broadcast WebSocket update
          try {
            const webSocketManager = require('./websocket');
            webSocketManager.broadcastOrganizationUpdate(proposal.organization_id, 'rule-proposal-expired', {
              proposalId: proposal.id,
              organizationId: proposal.organization_id,
              status: 'cancelled' // Status is 'cancelled' in database (expired proposals are marked as cancelled)
            });
          } catch (wsErr) {
            logger.warn('Failed to broadcast rule proposal expiration', { error: wsErr.message, proposalId: proposal.id });
          }

          logger.info('Marked rule proposal as cancelled (expired)', {
            proposalId: proposal.id,
            organizationId: proposal.organization_id,
            title: proposal.title
          });
        } catch (error) {
          logger.error('Failed to expire rule proposal', {
            error: error.message,
            stack: error.stack,
            proposalId: proposal.id
          });
        }
      }
    } catch (error) {
      logger.error('Error processing expired rule proposals', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Send batched "deadlines approaching" digest to each user with items in the next 7 days (once per user per day).
   */
  async sendDeadlinesApproachingDigests() {
    try {
      const notificationService = require('./notifications');
      const userMap = await notificationService.getApproachingDeadlinesByUser(this.db);
      let sentCount = 0;
      for (const [userId, sections] of userMap) {
        try {
          const sent = await notificationService.sendDeadlinesDigestIfDue(this.db, userId, sections);
          if (sent) sentCount++;
        } catch (error) {
          logger.error('Error sending deadlines digest for user', { error: error.message, userId });
        }
      }
      logger.info('Deadlines digest processing completed', { userCount: userMap.size, emailsSent: sentCount });
    } catch (error) {
      logger.error('Error in sendDeadlinesApproachingDigests', { error: error.message, stack: error.stack });
    }
  }

  /**
   * Process and send digest emails for all users
   */
  async sendDigestEmails() {
    try {
      const notificationService = require('./notifications');
      
      // Get all users with email enabled and digest frequency not 'off'
      try {
        const emailEnabledValue = this.sqlBoolean(true);
        var users = await TransactionManager.queryAll(this.db, `
          SELECT u.id, u.email
          FROM users u
          INNER JOIN notification_preferences np ON u.id = np.user_id
          WHERE np.email_enabled = ?
            AND np.digest_frequency != 'off'
        `, [emailEnabledValue]);
      } catch (err) {
        throw err;
      }

      logger.debug('Processing digest emails for users', { userCount: users.length });

      let sentCount = 0;
      for (const user of users) {
        try {
          const sent = await notificationService.sendDigestIfDue(this.db, user.id);
          if (sent) {
            sentCount++;
          }
        } catch (error) {
          logger.error('Error sending digest for user', {
            error: error.message,
            userId: user.id
          });
        }
      }

      logger.info('Digest email processing completed', {
        totalUsers: users.length,
        emailsSent: sentCount
      });
    } catch (error) {
      logger.error('Error processing digest emails', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Check for representative terms expiring soon and create elections
   */
  async checkTermExpirations() {
    logger.debug('Checking term expirations');

    try {
      // Check if representative_terms table exists.
      const tableQuery = "SELECT table_name as name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'representative_terms'";
      
      const rows = await TransactionManager.queryAll(this.db, tableQuery);
      const tableExists = rows.length > 0;

      if (!tableExists) {
        logger.debug('representative_terms table does not exist, skipping term expiration check');
        return;
      }

      const now = new Date();
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      // Find terms expiring within 30 days that don't have elections yet
      const falseVal = this.sqlBoolean(false);
      const expiringTerms = await TransactionManager.queryAll(this.db, `
        SELECT rt.*, o.id as organization_id
        FROM representative_terms rt
        INNER JOIN organizations o ON rt.organization_id = o.id
        WHERE rt.term_status = 'active'
          AND rt.term_end_date <= ?
          AND rt.term_end_date > ?
          AND rt.resignation_pending = ?
          AND NOT EXISTS (
            SELECT 1 FROM representative_elections re
            WHERE re.triggered_by_term_id = rt.id
              AND re.status IN ('draft', 'nomination', 'voting')
          )
        ORDER BY rt.term_end_date ASC
      `, [thirtyDaysFromNow.toISOString(), now.toISOString(), falseVal]);

      if (expiringTerms.length === 0) {
        logger.debug('No terms expiring soon');
        return;
      }

      logger.info('Found expiring terms', { count: expiringTerms.length });

      // Group by organization to batch elections
      const termsByOrg = {};
      for (const term of expiringTerms) {
        if (!termsByOrg[term.organization_id]) {
          termsByOrg[term.organization_id] = [];
        }
        termsByOrg[term.organization_id].push(term);
      }

      // Process each organization (limit to 5 elections per org per day)
      for (const [organizationId, terms] of Object.entries(termsByOrg)) {
        // Limit to 5 elections per organization per day
        const termsToProcess = terms.slice(0, 5);

        for (const term of termsToProcess) {
          try {
            // Get governance rules for election configuration
            const rules = await TransactionManager.query(this.db, `SELECT id, organization_id, representative_term_months, representative_term_limits, 
              election_voting_method, election_quorum_percentage, election_notice_days, 
              default_voting_deadline_hours, default_quorum_percentage, document_proposal_period_days, 
              threshold_calculation_method, default_acceptance_threshold, anonymous_voting_enabled, 
              vote_change_allowed, default_structure_proposals_enabled, default_voting_anonymity_locked, 
              representative_can_create_votes, representative_can_invite_members, representative_can_manage_documents, 
              representative_approval_required, tamper_proof_enabled, audit_trail_enabled, 
              created_at, updated_at
              FROM organization_governance_rules WHERE organization_id = ?`, 
              [organizationId]);

            // Get member count for quorum
            const memberRow = await TransactionManager.query(this.db,
              'SELECT COUNT(*) as count FROM organization_members WHERE organization_id = ? AND status = ?',
              [organizationId, 'active']
            );
            const memberCount = memberRow ? memberRow.count : 0;
            const quorumPercentage = rules?.election_quorum_percentage || 0.5;
            const quorumRequired = Math.ceil(memberCount * quorumPercentage);

            // Create election
            const electionId = uuidv4();
            const electionTitle = `Automatic Election - Term Expiration`;
            const electionDescription = `Automatic election triggered by term expiration.`;

            // Schedule election phases
            const nominationStart = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
            const votingStart = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days
            const votingEnd = new Date(votingStart.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 more days

            await TransactionManager.execute(this.db, `
              INSERT INTO representative_elections (
                id, organization_id, election_title, election_description,
                positions_available, status, created_by, trigger_type, triggered_by_term_id,
                nomination_starts_at, nomination_ends_at,
                voting_starts_at, voting_ends_at,
                quorum_required, auto_advance_phases, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              electionId, organizationId, electionTitle, electionDescription,
              1, 'draft', 'system', 'term_expiration', term.id,
              nominationStart.toISOString(), votingStart.toISOString(),
              votingStart.toISOString(), votingEnd.toISOString(),
              quorumRequired, 1, now.toISOString(), now.toISOString()
            ]);
            
            logger.info('Created election for expiring term', {
              organizationId,
              electionId,
              termId: term.id
            });
          } catch (error) {
            logger.error('Error creating election for expiring term', {
              error: error.message,
              organizationId,
              termId: term.id
            });
          }
        }
      }
    } catch (error) {
      logger.error('Error checking term expirations', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Advance election phases automatically based on dates
   */
  async advanceElectionPhases() {
    logger.debug('Checking election phase transitions');

    try {
      const now = new Date().toISOString();

      // Find elections that need phase transitions
      const trueValue = this.sqlBoolean(true);
      const falseValue = this.sqlBoolean(false);
      const electionsToAdvance = await TransactionManager.queryAll(this.db, `
        SELECT id, organization_id, status, nomination_ends_at, voting_ends_at, auto_advance_phases, phase_transition_in_progress, nomination_starts_at
        FROM representative_elections
        WHERE auto_advance_phases = ?
          AND phase_transition_in_progress = ?
          AND status IN ('draft', 'nomination', 'voting')
          AND (
            (status = 'draft' AND nomination_starts_at <= ?)
            OR (status = 'nomination' AND nomination_ends_at <= ?)
            OR (status = 'voting' AND voting_ends_at <= ?)
          )
      `, [trueValue, falseValue, now, now, now]);

      if (electionsToAdvance.length === 0) {
        logger.debug('No elections need phase transitions');
        return;
      }

      logger.info('Found elections to advance', { count: electionsToAdvance.length });

      for (const election of electionsToAdvance) {
        try {
          // Set transition flag to prevent race conditions
          const trueVal = this.sqlBoolean(true);
          const falseVal = this.sqlBoolean(false);
          await TransactionManager.execute(this.db, `
            UPDATE representative_elections 
            SET phase_transition_in_progress = ? 
            WHERE id = ? AND phase_transition_in_progress = ?
          `, [trueVal, election.id, falseVal]);
          
          // Verify the flag was set by re-querying
          const checkElection = await TransactionManager.query(this.db, 'SELECT phase_transition_in_progress FROM representative_elections WHERE id = ?', [election.id]);
          if (!checkElection || checkElection.phase_transition_in_progress !== trueVal) {
            logger.debug('Election already being transitioned', { electionId: election.id });
            continue;
          }

          let newPhase = election.status;
          let updates = {};

          if (election.status === 'draft' && election.nomination_starts_at <= now) {
            newPhase = 'nomination';
            updates = { status: 'nomination' };
          } else if (election.status === 'nomination' && election.nomination_ends_at <= now) {
            // Check if there are candidates before moving to voting
            try {
              const candidateRow = await TransactionManager.query(this.db,
                'SELECT COUNT(*) as count FROM election_candidates WHERE election_id = ?', 
                [election.id]
              );
              const candidateCount = candidateRow ? candidateRow.count : 0;
              
              if (candidateCount === 0) {
                // No candidates, cancel election
                const falseVal = this.sqlBoolean(false);
                await TransactionManager.execute(this.db, `
                  UPDATE representative_elections 
                  SET status = 'cancelled', phase_transition_in_progress = ?, election_completed_at = ?
                  WHERE id = ?
                `, [falseVal, now, election.id]);
                logger.info('Cancelled election due to no candidates', { electionId: election.id });
                continue;
              }

              newPhase = 'voting';
              updates = { status: 'voting', voting_starts_at: now };
            } catch (candidateErr) {
              logger.error('Error checking candidates', { error: candidateErr.message, electionId: election.id });
              await TransactionManager.execute(this.db, `UPDATE representative_elections SET phase_transition_in_progress = ${this.sqlBoolean(false)} WHERE id = ?`, [election.id]);
              continue;
            }
          } else if (election.status === 'voting' && election.voting_ends_at <= now) {
            // Voting phase ended - election should be completed manually or by quorum check
            // Just reset the flag, don't auto-complete
            const falseVal = this.sqlBoolean(false);
            await TransactionManager.execute(this.db, 'UPDATE representative_elections SET phase_transition_in_progress = ? WHERE id = ?', [falseVal, election.id]);
            continue;
          }

          if (newPhase !== election.status) {
            // Update election phase
            const updateFields = Object.keys(updates).map(field => `${field} = ?`).join(', ');
            const updateValues = Object.values(updates);
            
            try {
              await TransactionManager.execute(this.db, `
                UPDATE representative_elections 
                SET ${updateFields}, phase_transition_in_progress = ?, updated_at = ?
                WHERE id = ?
              `, [...updateValues, now, election.id]);
              
              logger.info('Advanced election phase', {
                electionId: election.id,
                organizationId: election.organization_id,
                oldPhase: election.status,
                newPhase
              });

              // Broadcast WebSocket update
              const webSocketManager = require('./websocket');
              webSocketManager.broadcastOrganizationUpdate(election.organization_id, 'election-phase-advanced', {
                organizationId: election.organization_id,
                electionId: election.id,
                oldPhase: election.status,
                newPhase
              });
            } catch (updateErr) {
              logger.error('Error updating election phase', { error: updateErr.message, electionId: election.id });
              // Reset flag
              await TransactionManager.execute(this.db, `UPDATE representative_elections SET phase_transition_in_progress = ${this.sqlBoolean(false)} WHERE id = ?`, [election.id]);
            }
          } else {
            // Reset flag if no transition needed
            const falseVal = this.sqlBoolean(false);
            await TransactionManager.execute(this.db, 'UPDATE representative_elections SET phase_transition_in_progress = ? WHERE id = ?', [falseVal, election.id]);
          }
        } catch (error) {
          logger.error('Error advancing election phase', {
            error: error.message,
            electionId: election.id
          });
          // Reset flag on error
          try {
            const falseVal = this.sqlBoolean(false);
            await TransactionManager.execute(this.db, 'UPDATE representative_elections SET phase_transition_in_progress = ? WHERE id = ?', [falseVal, election.id]);
          } catch (resetErr) {
            logger.error('Error resetting transition flag', { error: resetErr.message, electionId: election.id });
          }
        }
      }
    } catch (error) {
      logger.error('Error checking election phase transitions', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Process pending resignations - check for failed elections and retry
   */
  async processPendingResignations() {
    logger.debug('Processing pending resignations');

    try {
      // Check if representative_terms table exists.
      const tableQuery = "SELECT table_name as name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'representative_terms'";
      
      const tableRow = await TransactionManager.query(this.db, tableQuery);
      const tableExists = !!tableRow;

      if (!tableExists) {
        logger.debug('representative_terms table does not exist, skipping pending resignation processing');
        return;
      }

      // Find pending resignations with failed elections (cancelled > 30 days ago)
      const trueVal = this.sqlBoolean(true);
      const pendingResignations = await TransactionManager.queryAll(this.db, `
        SELECT rt.*, re.status as election_status, re.election_completed_at
        FROM representative_terms rt
        LEFT JOIN representative_elections re ON rt.replacement_election_id = re.id
        WHERE rt.resignation_pending = ?
          AND rt.term_status = 'active'
          AND (
            re.status = 'cancelled'
            OR (re.status IS NULL AND rt.replacement_election_id IS NOT NULL)
            OR (rt.failed_election_attempts < 3 AND re.election_completed_at IS NULL AND re.status = 'cancelled')
          )
      `, [trueVal]);

      if (pendingResignations.length === 0) {
        logger.debug('No pending resignations to process');
        return;
      }

      logger.info('Found pending resignations to process', { count: pendingResignations.length });

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      for (const resignation of pendingResignations) {
        try {
          // Check if election failed more than 30 days ago
          if (resignation.election_status === 'cancelled' && resignation.election_completed_at) {
            const completedDate = new Date(resignation.election_completed_at);
            if (completedDate > thirtyDaysAgo) {
              // Too recent, wait
              continue;
            }
          }

          // Check attempt limit
          if (resignation.failed_election_attempts >= 3) {
            logger.warn('Resignation has exceeded max election attempts', {
              termId: resignation.id,
              attempts: resignation.failed_election_attempts
            });
            // Could notify organization here
            continue;
          }

          // Create new election for this resignation
          const rules = await TransactionManager.query(this.db, `SELECT id, organization_id, representative_term_months, representative_term_limits, 
            election_voting_method, election_quorum_percentage, election_notice_days, 
            default_voting_deadline_hours, default_quorum_percentage, document_proposal_period_days, 
            threshold_calculation_method, default_acceptance_threshold, anonymous_voting_enabled, 
            vote_change_allowed, default_structure_proposals_enabled, default_voting_anonymity_locked, 
            representative_can_create_votes, representative_can_invite_members, representative_can_manage_documents, 
            representative_approval_required, tamper_proof_enabled, audit_trail_enabled, 
            created_at, updated_at
            FROM organization_governance_rules WHERE organization_id = ?`,
            [resignation.organization_id]
          );

          const memberRow = await TransactionManager.query(this.db,
            'SELECT COUNT(*) as count FROM organization_members WHERE organization_id = ? AND status = ?',
            [resignation.organization_id, 'active']
          );

          const memberCount = memberRow ? memberRow.count : 0;
          const quorumPercentage = rules?.election_quorum_percentage || 0.5;
          const quorumRequired = Math.ceil(memberCount * quorumPercentage);

          const electionId = uuidv4();
          const now = new Date();
          const nominationStart = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
          const votingStart = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
          const votingEnd = new Date(votingStart.getTime() + 7 * 24 * 60 * 60 * 1000);

          await TransactionManager.execute(this.db, `
            INSERT INTO representative_elections (
              id, organization_id, election_title, election_description,
              positions_available, status, created_by, trigger_type, triggered_by_term_id,
              nomination_starts_at, nomination_ends_at,
              voting_starts_at, voting_ends_at,
              quorum_required, auto_advance_phases, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            electionId, resignation.organization_id,
            'Automatic Election - Replacement for Resigned Representative (Retry)',
            'Election triggered by resignation. Previous election failed.',
            1, 'draft', 'system', 'resignation', resignation.id,
            nominationStart.toISOString(), votingStart.toISOString(),
            votingStart.toISOString(), votingEnd.toISOString(),
            quorumRequired, 1, now.toISOString(), now.toISOString()
          ]);

          // Update term with new election and increment attempt counter
          try {
            await TransactionManager.execute(this.db, `
              UPDATE representative_terms 
              SET replacement_election_id = ?, failed_election_attempts = failed_election_attempts + 1
              WHERE id = ?
            `, [electionId, resignation.id]);
            
            logger.info('Created retry election for pending resignation', {
              termId: resignation.id,
              electionId,
              attempts: (resignation.failed_election_attempts || 0) + 1
            });
          } catch (updateErr) {
            logger.error('Error updating term with new election', { error: updateErr.message });
          }
        } catch (error) {
          logger.error('Error processing pending resignation', {
            error: error.message,
            termId: resignation.id
          });
        }
      }
    } catch (error) {
      logger.error('Error processing pending resignations', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Clean up expired password reset tokens
   * Removes tokens that are expired or have been used
   */
  async cleanupExpiredPasswordResetTokens() {
    logger.debug('Cleaning up expired password reset tokens');

    try {
      // Check if table exists first.
      const tableQuery = "SELECT table_name as name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'password_reset_tokens'";
      
      const tableRow = await TransactionManager.query(this.db, tableQuery);
      const tableExists = !!tableRow;

      if (!tableExists) {
        logger.debug('password_reset_tokens table does not exist, skipping cleanup');
        return;
      }

      const now = new Date().toISOString();

      // Delete expired tokens (expires_at < now) or used tokens (used_at IS NOT NULL)
      const result = await TransactionManager.execute(this.db, `
        DELETE FROM password_reset_tokens
        WHERE expires_at < ? OR used_at IS NOT NULL
      `, [now]);

      const deletedCount = result?.rowCount || 0;

      if (deletedCount > 0) {
        logger.info('Cleaned up expired password reset tokens', { deletedCount });
      } else {
        logger.debug('No expired password reset tokens to clean up');
      }
    } catch (error) {
      logger.error('Error cleaning up expired password reset tokens', {
        error: error.message,
        stack: error.stack
      });
    }
  }
}

module.exports = DocumentScheduler;
