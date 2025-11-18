/**
 * Document Status Management System
 * Handles status transitions and business logic for organizational documents
 */

const { v4: uuidv4 } = require('uuid');

class DocumentStatusManager {
  /**
   * Transition document from proposal to voting status
   */
  static async transitionToVoting(db, documentId, userId) {
    console.log(`🎯 Transitioning document ${documentId} to voting status`);

    const votingPeriodDays = 7; // Configurable
    const votingDeadline = new Date();
    votingDeadline.setDate(votingDeadline.getDate() + votingPeriodDays);

    // Update document status
    await new Promise((resolve, reject) => {
      db.run(`
        UPDATE documents
        SET status = 'voting',
            voting_deadline = ?,
            voting_started_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [votingDeadline.toISOString(), documentId], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });

    // Log status change
    await this.logStatusChange(db, documentId, 'proposal', 'voting', userId || 'system', 'proposal_deadline_passed');

    // Send notifications to organization members
    await this.notifyStatusChange(db, documentId, 'proposal', 'voting');

    console.log(`✅ Document ${documentId} transitioned to voting status`);
    return { success: true, votingDeadline: votingDeadline.toISOString() };
  }

  /**
   * Transition document to agreed status
   */
  static async transitionToAgreed(db, documentId, userId) {
    console.log(`🎉 Transitioning document ${documentId} to agreed status`);

    await new Promise((resolve, reject) => {
      db.run(`
        UPDATE documents
        SET status = 'agreed', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [documentId], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });

    await this.logStatusChange(db, documentId, 'voting', 'agreed', userId || 'system', 'approval_threshold_met');
    await this.notifyStatusChange(db, documentId, 'voting', 'agreed');

    console.log(`✅ Document ${documentId} marked as agreed`);
    return { success: true };
  }

  /**
   * Transition document to rejected status
   */
  static async transitionToRejected(db, documentId, userId, reason = 'manual_rejection') {
    console.log(`❌ Transitioning document ${documentId} to rejected status (reason: ${reason})`);

    await new Promise((resolve, reject) => {
      db.run(`
        UPDATE documents
        SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [documentId], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });

    await this.logStatusChange(db, documentId, null, 'rejected', userId || 'system', reason);
    await this.notifyStatusChange(db, documentId, null, 'rejected');

    console.log(`✅ Document ${documentId} marked as rejected`);
    return { success: true, reason };
  }

  /**
   * Transition document to expired status
   */
  static async transitionToExpired(db, documentId, userId) {
    console.log(`⏰ Transitioning document ${documentId} to expired status`);

    await new Promise((resolve, reject) => {
      db.run(`
        UPDATE documents
        SET status = 'expired', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [documentId], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });

    await this.logStatusChange(db, documentId, 'proposal', 'expired', userId || 'system', 'proposal_timeout');
    await this.notifyStatusChange(db, documentId, 'proposal', 'expired');

    console.log(`✅ Document ${documentId} marked as expired`);
    return { success: true };
  }

  /**
   * Get current status and voting information for a document
   */
  static async getDocumentStatus(db, documentId) {
    const document = await new Promise((resolve, reject) => {
      db.get(`
        SELECT d.*, COUNT(dv.id) as vote_count
        FROM documents d
        LEFT JOIN document_votes dv ON d.id = dv.document_id
        WHERE d.id = ?
        GROUP BY d.id
      `, [documentId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!document) {
      throw new Error('Document not found');
    }

    // Get voting results breakdown
    const votes = await new Promise((resolve, reject) => {
      db.all(`
        SELECT vote, COUNT(*) as count
        FROM document_votes
        WHERE document_id = ?
        GROUP BY vote
      `, [documentId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

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
   * Check if voting can be finalized
   */
  static async canFinalizeVoting(db, documentId) {
    const doc = await new Promise((resolve, reject) => {
      db.get(`
        SELECT status, voting_deadline, acceptance_threshold, min_voters_required
        FROM documents WHERE id = ?
      `, [documentId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!doc || doc.status !== 'voting') {
      return { canFinalize: false, reason: 'not_in_voting_status' };
    }

    const now = new Date();
    const votingDeadline = new Date(doc.voting_deadline);

    if (now < votingDeadline) {
      return { canFinalize: false, reason: 'voting_still_active' };
    }

    return { canFinalize: true, deadline: doc.voting_deadline };
  }

  /**
   * Log status change to history table
   */
  static async logStatusChange(db, documentId, oldStatus, newStatus, changedBy, reason) {
    const historyId = uuidv4();

    await new Promise((resolve, reject) => {
      db.run(`
        INSERT INTO document_status_history
        (id, document_id, old_status, new_status, changed_by, change_reason)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [historyId, documentId, oldStatus, newStatus, changedBy, reason], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });

    console.log(`📝 Logged status change: ${oldStatus || 'null'} → ${newStatus} (${reason}) by ${changedBy}`);
  }

  /**
   * Send notifications for status changes
   */
  static async notifyStatusChange(db, documentId, oldStatus, newStatus) {
    // Get document and organization info
    const doc = await new Promise((resolve, reject) => {
      db.get(`
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
    let recipients = [];
    if (doc.organization_id) {
      const members = await new Promise((resolve, reject) => {
        db.all(`
          SELECT u.email, u.name
          FROM organization_members om
          JOIN users u ON om.user_id = u.id
          WHERE om.organization_id = ? AND om.status = 'active'
        `, [doc.organization_id], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
      recipients = members;
    }

    // For now, just log the notification (email system can be added later)
    console.log(`📧 Would notify ${recipients.length} users about status change: "${doc.title}" ${oldStatus || 'null'} → ${newStatus}`);

    // TODO: Implement actual email notifications
    // This could integrate with services like SendGrid, Mailgun, etc.
  }

  /**
   * Get status change history for a document
   */
  static async getStatusHistory(db, documentId) {
    const history = await new Promise((resolve, reject) => {
      db.all(`
        SELECT dsh.*, u.name as changed_by_name
        FROM document_status_history dsh
        LEFT JOIN users u ON dsh.changed_by = u.id
        WHERE dsh.document_id = ?
        ORDER BY dsh.created_at DESC
      `, [documentId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    return history;
  }
}

module.exports = DocumentStatusManager;
