/**
 * Background Job Scheduler for Organizational Documents
 * Handles automated deadline monitoring and status transitions
 */

const { v4: uuidv4 } = require('uuid');
const { logger } = require('../middleware/logger');

class DocumentScheduler {
  constructor(db) {
    this.db = db;
    this.jobs = new Map();
    this.isRunning = false;
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

    // Run initial checks immediately
    setTimeout(() => {
      this.checkProposalDeadlines().catch(err => logger.error('Error in proposal deadline check', { error: err.message }));
      this.checkProposalCutoff().catch(err => logger.error('Error in proposal cutoff check', { error: err.message }));
      this.checkVotingDeadlines().catch(err => logger.error('Error in voting deadline check', { error: err.message }));
      this.checkDeletionDeadlines().catch(err => logger.error('Error in deletion deadline check', { error: err.message }));
      this.processExpiredRuleProposals().catch(err => logger.error('Error in rule proposal expiration check', { error: err.message }));
    }, 5000); // 5 seconds after startup

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

      // Find documents where proposal_deadline < now and status = 'proposal'
      const documents = await new Promise((resolve, reject) => {
        this.db.all(`
          SELECT id, title, owner_id, organization_id
          FROM documents
          WHERE status = 'proposal'
          AND proposal_deadline < ?
          AND proposal_deadline IS NOT NULL
        `, [now], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });

      logger.debug('Found documents ready for voting', { count: documents.length });

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

      // Find documents where voting_deadline < now and status = 'voting'
      const documents = await new Promise((resolve, reject) => {
        this.db.all(`
          SELECT id, title, owner_id, organization_id, acceptance_threshold, min_voters_required
          FROM documents
          WHERE status = 'voting'
          AND voting_deadline < ?
          AND voting_deadline IS NOT NULL
        `, [now], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });

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
      const documents = await new Promise((resolve, reject) => {
        this.db.all(`
          SELECT id, title, owner_id, created_at
          FROM documents
          WHERE status = 'proposal'
          AND created_at < ?
          AND proposal_deadline IS NULL
        `, [thirtyDaysAgo.toISOString()], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });

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
    const document = await new Promise((resolve, reject) => {
      this.db.get('SELECT organization_id FROM documents WHERE id = ?', [documentId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    // Fetch governance rules to get default_voting_deadline_hours
    let votingDeadlineHours = 168; // Default 7 days (168 hours)
    if (document?.organization_id) {
      try {
        const governanceModule = require('../routes/governance');
        const governanceRules = await governanceModule.getGovernanceRules(this.db, document.organization_id);
        if (governanceRules?.defaultVotingDeadlineHours) {
          votingDeadlineHours = governanceRules.defaultVotingDeadlineHours;
        }
      } catch (govErr) {
        logger.warn('Could not fetch governance rules for voting deadline, using default', { error: govErr.message, organizationId: doc?.organization_id });
      }
    }

    const votingDeadline = new Date();
    votingDeadline.setHours(votingDeadline.getHours() + votingDeadlineHours);
    logger.debug('Voting deadline set from governance rules', { documentId, votingDeadlineHours, days: (votingDeadlineHours / 24).toFixed(1) });

    // Get organization member count for quorum calculation
    let minVotersRequired = 0;
    try {
      const doc = await new Promise((resolve, reject) => {
        this.db.get('SELECT organization_id FROM documents WHERE id = ?', [documentId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (doc?.organization_id) {
        const memberCount = await new Promise((resolve, reject) => {
          this.db.get(`
            SELECT COUNT(*) as count FROM organization_members
            WHERE organization_id = ? AND status = 'active'
          `, [doc.organization_id], (err, row) => {
            if (err) reject(err);
            else resolve(row?.count || 0);
          });
        });

        // Get governance rules to use defaultQuorumPercentage
        let quorumPercentage = 0.3; // Default 30%
        try {
          const governanceModule = require('../routes/governance');
          const governanceRules = await governanceModule.getGovernanceRules(this.db, doc.organization_id);
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
    await new Promise((resolve, reject) => {
      this.db.run(`
        UPDATE documents
        SET min_voters_required = ?
        WHERE id = ? AND (min_voters_required IS NULL OR min_voters_required = 0)
      `, [minVotersRequired, documentId], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });

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
      const doc = await new Promise((resolve, reject) => {
        this.db.get(`
          SELECT d.title, d.organization_id, o.name as org_name
          FROM documents d
          LEFT JOIN organizations o ON d.organization_id = o.id
          WHERE d.id = ?
        `, [documentId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (!doc) return;

      // Get organization members to notify
      const members = await new Promise((resolve, reject) => {
        this.db.all(`
          SELECT u.email, u.name
          FROM organization_members om
          JOIN users u ON om.user_id = u.id
          WHERE om.organization_id = ? AND om.status = 'active'
        `, [doc.organization_id], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });

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
    const votes = await new Promise((resolve, reject) => {
      this.db.all(`
        SELECT vote FROM document_votes WHERE document_id = ?
      `, [doc.id], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    // Get eligible voters count
    const VoterManager = require('./voting');
    const eligibleVoters = await VoterManager.getEligibleVoters(this.db, doc.id);
    const totalEligible = eligibleVoters.length;

    const actualVotes = votes.length;
    const proVotes = votes.filter(v => v.vote === 'PRO').length;
    const approvalRate = actualVotes > 0 ? (proVotes / actualVotes) * 100 : 0;

    logger.info('Document voting results', { documentId: doc.id, proVotes, actualVotes, approvalRate, totalEligible });

    // Check quorum - use stored min_voters_required if available, otherwise calculate from eligible voters (30%)
    // Check quorum - use stored min_voters_required if available, otherwise calculate from governance rules
    let quorumRequired;
    if (doc.min_voters_required && doc.min_voters_required > 0) {
      quorumRequired = doc.min_voters_required;
    } else {
      // Get governance rules to use defaultQuorumPercentage
      let quorumPercentage = 0.3; // Default 30%
      if (doc.organization_id) {
        try {
          const governanceModule = require('../routes/governance');
          const governanceRules = await governanceModule.getGovernanceRules(this.db, doc.organization_id);
          if (governanceRules?.defaultQuorumPercentage) {
            quorumPercentage = governanceRules.defaultQuorumPercentage;
          }
        } catch (govErr) {
          logger.warn('Could not fetch governance rules for quorum, using default 30%', { error: govErr.message, organizationId: doc.organization_id });
        }
      }
      quorumRequired = Math.max(1, Math.ceil(totalEligible * quorumPercentage));
    }
    const quorumMet = actualVotes >= quorumRequired;

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
    const DocumentStatusManager = require('./document-status');
    if (finalStatus === 'agreed') {
      await DocumentStatusManager.transitionToAgreed(this.db, doc.id, 'system');
    } else {
      await DocumentStatusManager.transitionToRejected(this.db, doc.id, 'system', reason);
    }

    // Broadcast WebSocket update
    const webSocketManager = require('./websocket');
    webSocketManager.broadcastDocumentUpdate(doc.id, 'document-status-changed', {
      oldStatus: 'voting',
      newStatus: finalStatus,
      reason: reason,
      approvalRate: approvalRate.toFixed(1),
      quorumMet: quorumMet
    });
  }

  /**
   * Check for documents where proposal cutoff has passed
   * Disable new paragraph proposals
   */
  async checkProposalCutoff() {
    logger.debug('Checking proposal cutoff deadlines');

    try {
      const now = new Date().toISOString();

      // Find documents where paragraph_proposals_cutoff < now and status = 'proposal'
      const documents = await new Promise((resolve, reject) => {
        this.db.all(`
          SELECT id, title, paragraph_proposals_cutoff
          FROM documents
          WHERE status = 'proposal'
          AND paragraph_proposals_cutoff < ?
          AND paragraph_proposals_cutoff IS NOT NULL
        `, [now], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });

      logger.debug('Found documents past proposal cutoff', { count: documents.length });

      // Broadcast WebSocket updates for proposal cutoff
      const webSocketManager = require('./websocket');
      for (const doc of documents) {
        webSocketManager.broadcastDocumentUpdate(doc.id, 'proposal-cutoff-reached', {
          documentId: doc.id,
          cutoffDate: doc.paragraph_proposals_cutoff
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

      // Find documents with expired deletion votes
      const documents = await new Promise((resolve, reject) => {
        this.db.all(`
          SELECT id, title, organization_id, deletion_vote_deadline, deletion_proposed_by
          FROM documents
          WHERE deletion_vote_deadline < ?
          AND deletion_vote_deadline IS NOT NULL
          AND deletion_proposed_at IS NOT NULL
        `, [now], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });

      logger.debug('Found documents with expired deletion votes', { count: documents.length });

      for (const doc of documents) {
        try {
          await this.finalizeDeletionVote(doc);
        } catch (error) {
          logger.error('Failed to finalize deletion vote for document', { error: error.message, stack: error.stack, documentId: doc.id });
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
    const votes = await new Promise((resolve, reject) => {
      this.db.all(`
        SELECT vote FROM document_deletion_votes WHERE document_id = ?
      `, [doc.id], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    // Get organization member count
    const memberCount = await new Promise((resolve, reject) => {
      this.db.get(`
        SELECT COUNT(*) as count FROM organization_members
        WHERE organization_id = ? AND status = 'active'
      `, [doc.organization_id], (err, row) => {
        if (err) reject(err);
        else resolve(row?.count || 0);
      });
    });

    const actualVotes = votes.length;
    const proVotes = votes.filter(v => v.vote === 'PRO').length;
    const approvalRate = actualVotes > 0 ? (proVotes / actualVotes) * 100 : 0;
    const quorumRequired = Math.max(1, Math.ceil(memberCount * 0.3));
    const quorumMet = actualVotes >= quorumRequired;

    // Get governance rules for threshold
    let threshold = 75.0;
    if (doc.organization_id) {
      try {
        const governanceModule = require('../routes/governance');
        const governanceRules = await governanceModule.getGovernanceRules(this.db, doc.organization_id);
        threshold = governanceRules?.defaultAcceptanceThreshold || 75.0;
      } catch (govErr) {
        logger.warn('Could not fetch governance rules for acceptance threshold, using default', { error: govErr.message, documentId: doc.id });
      }
    }

    if (quorumMet && approvalRate >= threshold) {
      // Delete the document
      logger.info('Deleting document (deletion vote approved)', { documentId: doc.id, approvalRate });
      
      // Delete document (cascade will handle related records)
      await new Promise((resolve, reject) => {
        this.db.run(`DELETE FROM documents WHERE id = ?`, [doc.id], function(err) {
          if (err) reject(err);
          else resolve();
        });
      });

      // Broadcast WebSocket update
      const webSocketManager = require('./websocket');
      webSocketManager.broadcastDocumentUpdate(doc.id, 'document-deleted', {
        documentId: doc.id,
        reason: 'deletion_approved',
        approvalRate: approvalRate.toFixed(1)
      });
    } else {
      // Cancel deletion proposal
      await new Promise((resolve, reject) => {
        this.db.run(`
          UPDATE documents
          SET deletion_proposed_at = NULL,
              deletion_proposed_by = NULL,
              deletion_vote_deadline = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [doc.id], function(err) {
          if (err) reject(err);
          else resolve();
        });
      });

      // Delete deletion votes
      await new Promise((resolve, reject) => {
        this.db.run(`DELETE FROM document_deletion_votes WHERE document_id = ?`, [doc.id], function(err) {
          if (err) reject(err);
          else resolve();
        });
      });

      logger.info('Deletion vote for document rejected', { documentId: doc.id, approvalRate, quorumMet });

      // Broadcast WebSocket update
      const webSocketManager = require('./websocket');
      webSocketManager.broadcastDocumentUpdate(doc.id, 'deletion-vote-rejected', {
        documentId: doc.id,
        approvalRate: approvalRate.toFixed(1),
        quorumMet: quorumMet
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

    await new Promise((resolve, reject) => {
      this.db.run(`
        INSERT INTO document_status_history
        (id, document_id, old_status, new_status, changed_by, change_reason)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [historyId, documentId, oldStatus, newStatus, changedBy, reason], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });

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
   * Process expired rule proposals
   * Auto-rejects proposals where voting deadline has passed
   */
  async processExpiredRuleProposals() {
    logger.debug('Processing expired rule proposals');

    try {
      const now = new Date().toISOString();

      // Find active proposals past their voting deadline
      const expiredProposals = await new Promise((resolve, reject) => {
        this.db.all(`
          SELECT id, organization_id, title, current_rule_field, voting_ends_at, votes_yes, votes_no, votes_abstain, votes_cast
          FROM governance_rule_proposals
          WHERE status = 'active'
            AND voting_ends_at IS NOT NULL
            AND voting_ends_at < ?
        `, [now], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });

      logger.debug('Found expired rule proposals', { count: expiredProposals.length });

      for (const proposal of expiredProposals) {
        try {
          // Recalculate vote counts to ensure accuracy
          const voteCounts = await new Promise((resolve, reject) => {
            this.db.get(`
              SELECT 
                COUNT(CASE WHEN vote_choice = 'yes' THEN 1 END) as votes_yes,
                COUNT(CASE WHEN vote_choice = 'no' THEN 1 END) as votes_no,
                COUNT(CASE WHEN vote_choice = 'abstain' THEN 1 END) as votes_abstain,
                COUNT(*) as votes_cast
              FROM governance_rule_proposal_votes
              WHERE proposal_id = ?
            `, [proposal.id], (err, row) => {
              if (err) reject(err);
              else resolve(row || { votes_yes: 0, votes_no: 0, votes_abstain: 0, votes_cast: 0 });
            });
          });

          // Update proposal with final counts and mark as expired
          await new Promise((resolve, reject) => {
            this.db.run(`
              UPDATE governance_rule_proposals SET
                status = 'expired',
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
            ], function(err) {
              if (err) reject(err);
              else resolve();
            });
          });

          // Log audit event (using direct database insert since we can't easily access logAudit)
          try {
            const auditId = uuidv4();
            this.db.run(`
              INSERT INTO organization_audit (
                id, organization_id, action_type, performed_by_user_id, affected_user_id,
                details, ip_address, user_agent, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              auditId,
              proposal.organization_id,
              'rule_proposal_expired',
              'system',
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
            logger.warn('Failed to log audit event for expired proposal', { error: auditErr.message, proposalId: proposal.id });
          }

          // Broadcast WebSocket update
          try {
            const webSocketManager = require('./websocket');
            webSocketManager.broadcastOrganizationUpdate(proposal.organization_id, 'rule-proposal-expired', {
              proposalId: proposal.id,
              organizationId: proposal.organization_id,
              status: 'expired'
            });
          } catch (wsErr) {
            logger.warn('Failed to broadcast rule proposal expiration', { error: wsErr.message, proposalId: proposal.id });
          }

          logger.info('Marked rule proposal as expired', {
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
}

module.exports = DocumentScheduler;
