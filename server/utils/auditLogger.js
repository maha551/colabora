/**
 * Shared audit logging utility for organization_audit table.
 * Used by structure proposals, tree proposals, document status, and other decision flows.
 */

const { v4: uuidv4 } = require('uuid');
const TransactionManager = require('../database/services/TransactionManager');
const { logger } = require('../middleware/logger');
const {
  resolveAuditPerformedByUserId,
  resolveAuditAffectedUserId,
} = require('./auditUserIds');

/**
 * Log an audit event to organization_audit.
 * @param {Object} db - Knex/database instance
 * @param {string} organizationId - Organization ID
 * @param {string} actionType - Action type (must be in organization_audit CHECK constraint)
 * @param {string} performedByUserId - User ID who performed the action (use 'system' for scheduler)
 * @param {Object} [details={}] - Additional details (will be JSON stringified)
 * @param {Object} [req=null] - Express request (optional; used for ip_address, user_agent)
 */
async function logOrganizationAudit(db, organizationId, actionType, performedByUserId, details = {}, req = null) {
  if (!organizationId) return;

  const auditData = {
    id: uuidv4(),
    organization_id: organizationId,
    action_type: actionType,
    performed_by_user_id: resolveAuditPerformedByUserId(performedByUserId),
    affected_user_id: resolveAuditAffectedUserId(null),
    details: typeof details === 'object' ? JSON.stringify(details) : String(details),
    ip_address: req?.ip ?? null,
    user_agent: req?.get?.('User-Agent') ?? null,
    created_at: new Date().toISOString()
  };

  try {
    await TransactionManager.execute(db, `INSERT INTO organization_audit (
      id, organization_id, action_type, performed_by_user_id, affected_user_id,
      details, ip_address, user_agent, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      auditData.id,
      auditData.organization_id,
      auditData.action_type,
      auditData.performed_by_user_id,
      auditData.affected_user_id,
      auditData.details,
      auditData.ip_address,
      auditData.user_agent,
      auditData.created_at
    ]);
  } catch (err) {
    logger.error('Error logging audit event', { error: err.message, organizationId, actionType });
    // Don't throw - audit logging failures must not break main flows
  }
}

module.exports = {
  logOrganizationAudit
};
