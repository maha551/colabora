/**
 * Background Job Scheduler for Organizational Documents
 * Handles automated deadline monitoring and status transitions
 */

const { v4: uuidv4 } = require('uuid');

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
      console.log('📅 Scheduler already running');
      return;
    }

    console.log('🚀 Starting Document Scheduler...');
    this.isRunning = true;

    // Check proposal deadlines every 15 minutes
    this.jobs.set('proposal-check', setInterval(() => {
      this.checkProposalDeadlines().catch(err => {
        console.error('❌ Error in proposal deadline check:', err);
      });
    }, 15 * 60 * 1000)); // 15 minutes

    // Check voting deadlines every 15 minutes
    this.jobs.set('voting-check', setInterval(() => {
      this.checkVotingDeadlines().catch(err => {
        console.error('❌ Error in voting deadline check:', err);
      });
    }, 15 * 60 * 1000)); // 15 minutes

    // Process expired documents hourly
    this.jobs.set('expired-check', setInterval(() => {
      this.processExpiredDocuments().catch(err => {
        console.error('❌ Error in expired document processing:', err);
      });
    }, 60 * 60 * 1000)); // 1 hour

    // Run initial checks immediately
    setTimeout(() => {
      this.checkProposalDeadlines().catch(console.error);
      this.checkVotingDeadlines().catch(console.error);
    }, 5000); // 5 seconds after startup

    console.log('✅ Document Scheduler started successfully');
  }

  /**
   * Stop the scheduler and clear all jobs
   */
  stop() {
    if (!this.isRunning) return;

    console.log('🛑 Stopping Document Scheduler...');

    for (const [name, job] of this.jobs) {
      clearInterval(job);
      console.log(`🧹 Cleared job: ${name}`);
    }

    this.jobs.clear();
    this.isRunning = false;
    console.log('✅ Document Scheduler stopped');
  }

  /**
   * Check for documents where proposal deadline has passed
   * Transition them to voting status
   */
  async checkProposalDeadlines() {
    console.log('🔍 Checking proposal deadlines...');

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

      console.log(`📋 Found ${documents.length} documents ready for voting`);

      for (const doc of documents) {
        try {
          await this.transitionToVoting(doc.id, doc.owner_id);
          console.log(`✅ Transitioned document "${doc.title}" to voting status`);
        } catch (error) {
          console.error(`❌ Failed to transition document ${doc.id}:`, error);
        }
      }

    } catch (error) {
      console.error('❌ Error checking proposal deadlines:', error);
    }
  }

  /**
   * Check for documents where voting deadline has passed
   * Calculate final results and set final status
   */
  async checkVotingDeadlines() {
    console.log('🗳️ Checking voting deadlines...');

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

      console.log(`📋 Found ${documents.length} documents with expired voting periods`);

      for (const doc of documents) {
        try {
          await this.finalizeVoting(doc);
        } catch (error) {
          console.error(`❌ Failed to finalize voting for document ${doc.id}:`, error);
        }
      }

    } catch (error) {
      console.error('❌ Error checking voting deadlines:', error);
    }
  }

  /**
   * Process documents that have been in proposal status too long
   */
  async processExpiredDocuments() {
    console.log('⏰ Processing expired documents...');

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

      console.log(`📋 Found ${documents.length} expired documents`);

      for (const doc of documents) {
        try {
          await this.transitionToExpired(doc.id, doc.owner_id);
          console.log(`✅ Marked document "${doc.title}" as expired`);
        } catch (error) {
          console.error(`❌ Failed to expire document ${doc.id}:`, error);
        }
      }

    } catch (error) {
      console.error('❌ Error processing expired documents:', error);
    }
  }

  /**
   * Transition document from proposal to voting status
   */
  async transitionToVoting(documentId, userId) {
    const votingPeriodDays = 7; // Configurable
    const votingDeadline = new Date();
    votingDeadline.setDate(votingDeadline.getDate() + votingPeriodDays);

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

        // Require 30% participation for quorum
        minVotersRequired = Math.max(1, Math.ceil(memberCount * 0.3));
        console.log(`📊 Document ${documentId}: ${memberCount} org members, requiring ${minVotersRequired} for quorum`);
      }
    } catch (error) {
      console.warn(`⚠️ Could not calculate quorum for document ${documentId}:`, error.message);
      minVotersRequired = 1; // Minimum fallback
    }

    await new Promise((resolve, reject) => {
      this.db.run(`
        UPDATE documents
        SET status = 'voting',
            voting_deadline = ?,
            voting_started_at = CURRENT_TIMESTAMP,
            min_voters_required = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [votingDeadline.toISOString(), minVotersRequired, documentId], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });

    // Log status change
    await this.logStatusChange(documentId, 'proposal', 'voting', 'system', 'proposal_deadline_passed');

    // Send notifications to organization members
    await this.notifyVotingStarted(documentId);
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

      // For now, just log the notification (email system can be added later)
      console.log(`📧 Would send voting started notifications for "${doc.title}" to ${members.length} members`);

      // TODO: Implement actual email notifications
      // This could integrate with services like SendGrid, Mailgun, etc.

    } catch (error) {
      console.error(`❌ Error sending voting notifications for document ${documentId}:`, error);
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

    console.log(`📊 Document ${doc.id} voting results: ${proVotes}/${actualVotes} PRO votes (${approvalRate.toFixed(1)}%), ${totalEligible} eligible voters`);

    // Check quorum (minimum 30% participation or min_voters_required)
    const quorumRequired = Math.max(doc.min_voters_required || 0, Math.ceil(totalEligible * 0.3));
    const quorumMet = actualVotes >= quorumRequired;

    let finalStatus, reason;

    if (!quorumMet) {
      finalStatus = 'rejected';
      reason = 'insufficient_participation';
      console.log(`❌ Quorum not met: ${actualVotes}/${quorumRequired} required`);
    } else if (approvalRate >= (doc.acceptance_threshold || 75)) {
      finalStatus = 'agreed';
      reason = 'approval_threshold_met';
      console.log(`✅ Approval threshold met: ${approvalRate.toFixed(1)}% >= ${doc.acceptance_threshold || 75}%`);
    } else {
      finalStatus = 'rejected';
      reason = 'insufficient_approval';
      console.log(`❌ Approval threshold not met: ${approvalRate.toFixed(1)}% < ${doc.acceptance_threshold || 75}%`);
    }

    // Update final status
    await new Promise((resolve, reject) => {
      this.db.run(`
        UPDATE documents
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [finalStatus, doc.id], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });

    // Log status change
    await this.logStatusChange(doc.id, 'voting', finalStatus, 'system', reason);

    // TODO: Send final result notifications
    console.log(`📧 Would send ${finalStatus} notifications for document ${doc.id}`);
  }

  /**
   * Mark document as expired
   */
  async transitionToExpired(documentId, userId) {
    await new Promise((resolve, reject) => {
      this.db.run(`
        UPDATE documents
        SET status = 'expired', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [documentId], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });

    await this.logStatusChange(documentId, 'proposal', 'expired', 'system', 'proposal_timeout');
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

    console.log(`📝 Logged status change: ${oldStatus} → ${newStatus} (${reason})`);
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
}

module.exports = DocumentScheduler;
