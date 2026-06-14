/**
 * Document Status Management System
 * Handles status transitions and business logic for organizational documents
 */

const { v4: uuidv4 } = require('uuid');
const { logger } = require('../middleware/logger');
const TransactionManager = require('../database/services/TransactionManager');
const { logOrganizationAudit } = require('../utils/auditLogger');

class DocumentStatusManager {
  /**
   * Transition document from proposal to voting status
   */
  static async transitionToVoting(knex, documentId, userId, options = {}) {
    const changeReason = options.changeReason || 'proposal_deadline_passed';
    logger.info('Transitioning document to voting status', { documentId, userId });

    // Get document's organization_id to fetch governance rules
    const document = await TransactionManager.query(knex, 'SELECT organization_id FROM documents WHERE id = ?', [documentId]);

    // Fetch governance rules to get defaultVotingDeadlineHours
    let votingDeadlineHours = 168; // Default 7 days (168 hours)
    if (document?.organization_id) {
      try {
        const governanceModule = require('../routes/governance');
        const { transformRulesToCamelCase } = require('../utils/governanceFieldMapping');
        const rulesRaw = await governanceModule.getGovernanceRules(knex, document.organization_id);
        const governanceRules = rulesRaw ? transformRulesToCamelCase(rulesRaw) : null;
        if (governanceRules?.defaultVotingDeadlineHours) {
          votingDeadlineHours = governanceRules.defaultVotingDeadlineHours;
        }
      } catch (govErr) {
        logger.warn('Could not fetch governance rules for voting deadline, using default', { error: govErr.message, documentId });
      }
    }

    const votingDeadline = new Date();
    votingDeadline.setHours(votingDeadline.getHours() + votingDeadlineHours);
    logger.debug('Voting deadline set from governance rules', { documentId, votingDeadlineHours, days: (votingDeadlineHours / 24).toFixed(1) });

    // Update document status atomically (TIME.2 fix: prevent race conditions)
    // Only update if status is still 'proposal' - prevents duplicate transitions
    const result = await TransactionManager.execute(knex, `
      UPDATE documents
      SET status = 'voting',
          voting_deadline = ?,
          voting_started_at = CURRENT_TIMESTAMP,
          proposal_ended_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'proposal'
    `, [votingDeadline.toISOString(), documentId]);
    
    // Check if update succeeded (0 rows means status was already changed by another process)
    if (result.changes === 0) {
      logger.warn('Document status transition skipped - status already changed', { documentId });
      // Re-fetch to get current status
      const currentDoc = await TransactionManager.query(knex, 'SELECT status FROM documents WHERE id = ?', [documentId]);
      if (currentDoc?.status === 'voting') {
        logger.info('Document already in voting status', { documentId });
        return { success: true, alreadyTransitioned: true, votingDeadline: currentDoc.voting_deadline };
      }
      throw new Error(`Document ${documentId} is not in proposal status (current: ${currentDoc?.status || 'unknown'})`);
    }

    // Log status change
    await this.logStatusChange(knex, documentId, 'proposal', 'voting', userId ?? null, changeReason);

    // Send immediate notifications for voting started
    await this.notifyVotingStarted(knex, documentId, votingDeadline);

    // Queue status change for digest
    await this.notifyStatusChange(knex, documentId, 'proposal', 'voting');

    // Broadcast WebSocket update
    const webSocketManager = require('./websocket');
    webSocketManager.broadcastDocumentUpdate(documentId, 'document-status-changed', {
      oldStatus: 'proposal',
      newStatus: 'voting',
      votingDeadline: votingDeadline.toISOString(),
      reason: changeReason
    });

    // Also broadcast as organization update if document belongs to an organization
    if (document?.organization_id) {
      webSocketManager.broadcastOrganizationUpdate(document.organization_id, 'document-status-changed', {
        documentId: documentId,
        oldStatus: 'proposal',
        newStatus: 'voting',
        reason: changeReason
      });
    }

    logger.info('Document transitioned to voting status', { documentId, userId: userId || 'system' });
    return { success: true, votingDeadline: votingDeadline.toISOString() };
  }

  /**
   * Transition document to agreed status
   */
  static async transitionToAgreed(knex, documentId, userId) {
    logger.info('Transitioning document to agreed status', { documentId, userId: userId || 'system' });

    // Update document status atomically (TIME.2 fix: prevent race conditions)
    // Only update if status is still 'voting' - prevents duplicate transitions
    const result = await TransactionManager.execute(knex, `
      UPDATE documents
      SET status = 'agreed', 
          adopted_at = CURRENT_TIMESTAMP,
          voting_ended_at = CURRENT_TIMESTAMP,
          amendments_closed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'voting'
    `, [documentId]);
    
    // Check if update succeeded (0 rows means status was already changed by another process)
    if (result.changes === 0) {
      logger.warn('Document status transition skipped - status already changed', { documentId });
      // Re-fetch to get current status and organization_id
      const currentDoc = await TransactionManager.query(knex, 'SELECT organization_id, status FROM documents WHERE id = ?', [documentId]);
      if (currentDoc?.status === 'agreed') {
        logger.info('Document already in agreed status', { documentId });
        return { success: true, alreadyTransitioned: true };
      }
      throw new Error(`Document ${documentId} is not in voting status (current: ${currentDoc?.status || 'unknown'})`);
    }
    
    // Get document's organization_id and title after successful update
    const document = await TransactionManager.query(knex, 'SELECT organization_id, title FROM documents WHERE id = ?', [documentId]);

    await this.logStatusChange(knex, documentId, 'voting', 'agreed', userId ?? null, 'approval_threshold_met');
    await this.notifyStatusChange(knex, documentId, 'voting', 'agreed');

    // Broadcast WebSocket update
    const webSocketManager = require('./websocket');
    webSocketManager.broadcastDocumentUpdate(documentId, 'document-status-changed', {
      oldStatus: 'voting',
      newStatus: 'agreed',
      reason: 'approval_threshold_met',
      adoptedAt: new Date().toISOString()
    });

    // Also broadcast as organization update if document belongs to an organization
    if (document?.organization_id) {
      webSocketManager.broadcastOrganizationUpdate(document.organization_id, 'document-status-changed', {
        documentId: documentId,
        oldStatus: 'voting',
        newStatus: 'agreed',
        reason: 'approval_threshold_met'
      });

      if (userId) {
        await logOrganizationAudit(knex, document.organization_id, 'document_status_agreed', userId, {
          documentId,
          documentTitle: document?.title || 'Document'
        }, null);
      }
    }

    try {
      const docMeta = await TransactionManager.query(knex,
        'SELECT ownership_type FROM documents WHERE id = ?',
        [documentId]
      );
      if (docMeta?.ownership_type === 'organizational') {
        const votesRouter = require('../routes/votes');
        if (typeof votesRouter.reEvaluateAllProposalsForDocument === 'function') {
          await votesRouter.reEvaluateAllProposalsForDocument(knex, documentId);
        }
      }
    } catch (applyErr) {
      logger.error('Failed to apply organizational proposals after agree transition', {
        error: applyErr.message,
        documentId
      });
    }

    logger.info('Document marked as agreed', { documentId, userId: userId || 'system' });
    return { success: true };
  }

  /**
   * Transition document to rejected status
   */
  static async transitionToRejected(knex, documentId, userId, reason = 'manual_rejection') {
    logger.info('Transitioning document to rejected status', { documentId, reason, userId: userId || 'system' });

    // Get document's organization_id, title, and current status before updating (for logging/broadcasting)
    const documentBefore = await TransactionManager.query(knex, 'SELECT organization_id, title, status FROM documents WHERE id = ?', [documentId]);
    const oldStatus = documentBefore?.status || null;
    
    // Update document status atomically (TIME.2 fix: prevent race conditions)
    // Only update if status is not already 'rejected' or 'agreed' - prevents duplicate transitions
    // We allow rejection from 'proposal' or 'voting' status
    const result = await TransactionManager.execute(knex, `
      UPDATE documents
      SET status = 'rejected',
          voting_ended_at = CASE WHEN status = 'voting' THEN CURRENT_TIMESTAMP ELSE voting_ended_at END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status IN ('proposal', 'voting')
    `, [documentId]);
    
    // Check if update succeeded (0 rows means status was already changed by another process)
    if (result.changes === 0) {
      logger.warn('Document status transition skipped - status already changed', { documentId, attemptedOldStatus: oldStatus });
      // Re-fetch to get current status and organization_id
      const currentDoc = await TransactionManager.query(knex, 'SELECT organization_id, status FROM documents WHERE id = ?', [documentId]);
      if (currentDoc?.status === 'rejected') {
        logger.info('Document already in rejected status', { documentId });
        return { success: true, alreadyTransitioned: true, reason };
      }
      throw new Error(`Document ${documentId} cannot be rejected from current status: ${currentDoc?.status || 'unknown'}`);
    }
    
    // Get document's organization_id and title after successful update
    const document = await TransactionManager.query(knex, 'SELECT organization_id, title FROM documents WHERE id = ?', [documentId]);

    await this.logStatusChange(knex, documentId, oldStatus, 'rejected', userId ?? null, reason);
    await this.notifyStatusChange(knex, documentId, oldStatus, 'rejected');

    // Broadcast WebSocket update
    const webSocketManager = require('./websocket');
    webSocketManager.broadcastDocumentUpdate(documentId, 'document-status-changed', {
      oldStatus: oldStatus,
      newStatus: 'rejected',
      reason: reason
    });

    // Also broadcast as organization update if document belongs to an organization
    if (document?.organization_id) {
      webSocketManager.broadcastOrganizationUpdate(document.organization_id, 'document-status-changed', {
        documentId: documentId,
        oldStatus: oldStatus,
        newStatus: 'rejected',
        reason: reason
      });

      if (userId) {
        await logOrganizationAudit(knex, document.organization_id, 'document_status_rejected', userId, {
          documentId,
          documentTitle: document?.title || 'Document',
          reason
        }, null);
      }
    }

    logger.info('Document marked as rejected', { documentId, reason, userId: userId || 'system' });
    return { success: true, reason };
  }

  /**
   * Transition document to expired status
   */
  static async transitionToExpired(knex, documentId, userId) {
    logger.info('Transitioning document to expired status', { documentId, userId: userId || 'system' });

    // Update document status atomically (TIME.2 fix: prevent race conditions)
    // Only update if status is still 'proposal' - prevents duplicate transitions
    const result = await TransactionManager.execute(knex, `
      UPDATE documents
      SET status = 'expired', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'proposal'
    `, [documentId]);
    
    // Check if update succeeded (0 rows means status was already changed by another process)
    if (result.changes === 0) {
      logger.warn('Document status transition skipped - status already changed', { documentId });
      // Re-fetch to get current status
      const currentDoc = await TransactionManager.query(knex, 'SELECT organization_id, status FROM documents WHERE id = ?', [documentId]);
      if (currentDoc?.status === 'expired') {
        logger.info('Document already in expired status', { documentId });
        return { success: true, alreadyTransitioned: true };
      }
      // Status was changed to something else (likely 'voting'), which is fine
      logger.info('Document status changed before expiration', { documentId, currentStatus: currentDoc?.status });
      return { success: false, reason: 'status_already_changed', currentStatus: currentDoc?.status };
    }
    
    // Get document's organization_id after successful update
    const document = await TransactionManager.query(knex, 'SELECT organization_id FROM documents WHERE id = ?', [documentId]);

    await this.logStatusChange(knex, documentId, 'proposal', 'expired', userId ?? null, 'proposal_timeout');
    await this.notifyStatusChange(knex, documentId, 'proposal', 'expired');

    // Broadcast WebSocket update
    const webSocketManager = require('./websocket');
    webSocketManager.broadcastDocumentUpdate(documentId, 'document-status-changed', {
      oldStatus: 'proposal',
      newStatus: 'expired',
      reason: 'proposal_timeout'
    });

    // Also broadcast as organization update if document belongs to an organization
    if (document?.organization_id) {
      webSocketManager.broadcastOrganizationUpdate(document.organization_id, 'document-status-changed', {
        documentId: documentId,
        oldStatus: 'proposal',
        newStatus: 'expired',
        reason: 'proposal_timeout'
      });
    }

    logger.info('Document marked as expired', { documentId, userId: userId || 'system' });
    return { success: true };
  }

  /**
   * Get current status and voting information for a document
   */
  static async getDocumentStatus(knex, documentId) {
    const document = await TransactionManager.query(knex, `
      SELECT d.*, COUNT(dv.id) as vote_count
      FROM documents d
      LEFT JOIN document_votes dv ON d.id = dv.document_id
      WHERE d.id = ?
      GROUP BY d.id
    `, [documentId]);

    if (!document) {
      throw new Error('Document not found');
    }

    // Get voting results breakdown
    const votes = await TransactionManager.queryAll(knex, `
      SELECT vote, COUNT(*) as count
      FROM document_votes
      WHERE document_id = ?
      GROUP BY vote
    `, [documentId]);

    const voteBreakdown = {
      PRO: 0,
      NEUTRAL: 0,
      CONTRA: 0
    };

    votes.forEach(v => {
      voteBreakdown[v.vote] = v.count;
    });

    // Calculate approval rate
    const totalVotes = document.vote_count || 0;
    const approvalRate = totalVotes > 0 ? (voteBreakdown.PRO / totalVotes) * 100 : 0;

    return {
      document: {
        id: document.id,
        title: document.title,
        status: document.status,
        proposalDeadline: document.proposal_deadline,
        votingDeadline: document.voting_deadline,
        votingStartedAt: document.voting_started_at,
        acceptanceThreshold: document.acceptance_threshold,
        minVotersRequired: document.min_voters_required,
        createdAt: document.created_at
      },
      voting: {
        totalVotes,
        breakdown: voteBreakdown,
        approvalRate: Math.round(approvalRate * 10) / 10, // Round to 1 decimal
        quorumMet: totalVotes >= (document.min_voters_required || 0)
      }
    };
  }

  /**
   * When vote changes are allowed, document finalization should wait until voting_deadline.
   * @param {Object} doc - Document row with vote_change_allowed and voting_deadline
   * @returns {boolean}
   */
  static shouldDeferDocumentFinalization(doc) {
    const voteChangeAllowed = doc.vote_change_allowed === true || doc.vote_change_allowed === 1;
    if (!voteChangeAllowed || !doc.voting_deadline) return false;
    return new Date() < new Date(doc.voting_deadline);
  }

  /**
   * Check if voting can be finalized
   * @param {Object} knex - Database instance
   * @param {string} documentId - Document ID
   * @param {Object} options - Optional
   * @param {boolean} options.allowEarlyComplete - When true (rep/owner), allow early completion if quorum met (skip deadline check)
   */
  static async canFinalizeVoting(knex, documentId, options = {}) {
    const { allowEarlyComplete = false } = options;

    const doc = await TransactionManager.query(knex, `
      SELECT status, voting_deadline, acceptance_threshold, min_voters_required, organization_id, vote_change_allowed
      FROM documents WHERE id = ?
    `, [documentId]);

    if (!doc || doc.status !== 'voting') {
      return { canFinalize: false, reason: 'not_in_voting_status' };
    }

    const now = new Date();
    const votingDeadline = new Date(doc.voting_deadline);
    const deadlinePassed = now >= votingDeadline;

    // When deadline passed, allow finalize (scheduler or manual)
    if (deadlinePassed) {
      return { canFinalize: true, deadline: doc.voting_deadline };
    }

    // When deadline not passed: allow early complete only if rep/owner and quorum met
    if (allowEarlyComplete) {
      if (this.shouldDeferDocumentFinalization(doc)) {
        return { canFinalize: false, reason: 'voting_open_until_deadline' };
      }

      const UnifiedVotingService = require('./unified-voting');
      const voteAggregation = await UnifiedVotingService.aggregateVotes(knex, 'document_votes', 'document_id', documentId);
      const totalEligible = await UnifiedVotingService.getEligibleVoterCount(knex, doc.organization_id, 'organization');
      const acceptanceThreshold = doc.acceptance_threshold || 75.0;

      const approvalResult = await UnifiedVotingService.checkApproval({
        db: knex,
        organizationId: doc.organization_id || null,
        proVotes: voteAggregation.proVotes,
        totalVotes: voteAggregation.totalVotes,
        totalEligible,
        acceptanceThreshold
      });

      if (!approvalResult.quorumMet) {
        return { canFinalize: false, reason: 'participation_threshold_not_met' };
      }

      return { canFinalize: true, deadline: doc.voting_deadline, earlyComplete: true };
    }

    return { canFinalize: false, reason: 'voting_still_active' };
  }

  /**
   * Log status change to history table.
   * changed_by must be a valid user id or null (FK to users.id); use null for system-driven changes.
   */
  static async logStatusChange(knex, documentId, oldStatus, newStatus, changedBy, reason) {
    const historyId = uuidv4();
    const effectiveChangedBy = (changedBy && changedBy !== 'system') ? changedBy : null;

    await TransactionManager.execute(knex, `
      INSERT INTO document_status_history
      (id, document_id, old_status, new_status, changed_by, change_reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [historyId, documentId, oldStatus, newStatus, effectiveChangedBy, reason]);

    logger.debug('Logged status change', { documentId, oldStatus: oldStatus || 'null', newStatus, reason, changedBy: effectiveChangedBy ?? 'system' });
  }

  /**
   * Send immediate notification when voting starts
   */
  static async notifyVotingStarted(knex, documentId, votingDeadline) {
    try {
      const notificationService = require('./notifications');
      const urls = require('../emails/urls');

      // Get document and organization info
      const doc = await TransactionManager.query(knex, `
        SELECT d.title, d.organization_id, o.name as org_name
        FROM documents d
        LEFT JOIN organizations o ON d.organization_id = o.id
        WHERE d.id = ?
      `, [documentId]);

      if (!doc || !doc.organization_id) return;

      // Get organization members to notify
      const members = await TransactionManager.queryAll(knex, `
        SELECT u.id as user_id
        FROM organization_members om
        JOIN users u ON om.user_id = u.id
        WHERE om.organization_id = ? AND om.status = 'active'
          AND om.user_id NOT IN (SELECT id FROM organizations)
      `, [doc.organization_id]);

      const userIds = members.map(m => m.user_id);
      const eventData = {
        title: doc.title,
        votingDeadline: votingDeadline.toISOString(),
        link: urls.document(documentId),
        organizationName: doc.org_name,
        votingType: 'document'
      };

      await notificationService.notifyUsers(
        knex,
        userIds,
        'voting_started',
        eventData,
        true // immediate notification
      );

      logger.debug('Sent voting started notifications', {
        documentId,
        memberCount: userIds.length
      });
    } catch (error) {
      logger.error('Error sending voting started notifications', {
        error: error.message,
        documentId
      });
    }
  }

  /**
   * Queue status changes for digest emails
   */
  static async notifyStatusChange(knex, documentId, oldStatus, newStatus) {
    try {
      const notificationService = require('./notifications');
      const urls = require('../emails/urls');

      // Get document and organization info
      const doc = await TransactionManager.query(knex, `
        SELECT d.title, d.organization_id, o.name as org_name
        FROM documents d
        LEFT JOIN organizations o ON d.organization_id = o.id
        WHERE d.id = ?
      `, [documentId]);

      if (!doc || !doc.organization_id) return;

      // Get organization members to notify
      const members = await TransactionManager.queryAll(knex, `
        SELECT u.id as user_id
        FROM organization_members om
        JOIN users u ON om.user_id = u.id
        WHERE om.organization_id = ? AND om.status = 'active'
          AND om.user_id NOT IN (SELECT id FROM organizations)
      `, [doc.organization_id]);

      const userIds = members.map(m => m.user_id);
      
      // Create status change message
      let message = `Document "${doc.title}" status changed from ${oldStatus || 'unknown'} to ${newStatus}`;
      if (newStatus === 'agreed') {
        message = `Document "${doc.title}" has been approved and adopted`;
      } else if (newStatus === 'rejected') {
        message = `Document "${doc.title}" has been rejected`;
      }

      const eventData = {
        title: `Document Status Changed: ${doc.title}`,
        message: message,
        link: urls.document(documentId),
        organizationName: doc.org_name,
        oldStatus: oldStatus || 'unknown',
        newStatus: newStatus
      };

      await notificationService.notifyUsers(
        knex,
        userIds,
        'document_status_changed',
        eventData,
        false // digest notification
      );

      logger.debug('Queued status change for digest', {
        documentId,
        oldStatus,
        newStatus,
        memberCount: userIds.length
      });
    } catch (error) {
      logger.error('Error queueing status change for digest', {
        error: error.message,
        documentId
      });
    }
  }

  /**
   * Get status change history for a document
   */
  static async getStatusHistory(knex, documentId) {
    return await TransactionManager.queryAll(knex, `
      SELECT dsh.*, u.name as changed_by_name
      FROM document_status_history dsh
      LEFT JOIN users u ON dsh.changed_by = u.id
      WHERE dsh.document_id = ?
      ORDER BY dsh.created_at DESC
    `, [documentId]);
  }
}

module.exports = DocumentStatusManager;
