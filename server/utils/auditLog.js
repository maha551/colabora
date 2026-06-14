/**
 * Shared audit logging for organization actions.
 * Accepts either Express req (for route callers) or { ip, userAgent } (for service callers).
 */

const { v4: uuidv4 } = require('uuid');
const TransactionManager = require('../database/services/TransactionManager');
const {
  resolveAuditPerformedByUserId,
  resolveAuditAffectedUserId,
} = require('./auditUserIds');

/**
 * @param {Object} knex - Knex/db instance
 * @param {string} organizationId - Organization ID
 * @param {string} actionType - Audit action type
 * @param {string} performedByUserId - User who performed the action
 * @param {string|null} affectedUserId - Optional affected user ID
 * @param {Object} details - Optional details object (will be JSON.stringified)
 * @param {Object} context - Either Express req or { ip, userAgent } for service callers
 */
async function logAudit(knex, organizationId, actionType, performedByUserId, affectedUserId = null, details = {}, context = {}) {
  const ip = context?.ip ?? context?.ip_address ?? null;
  const userAgent = context?.userAgent ?? (typeof context?.get === 'function' ? context.get('User-Agent') : null) ?? null;

  const auditData = {
    id: uuidv4(),
    organization_id: organizationId,
    action_type: actionType,
    performed_by_user_id: resolveAuditPerformedByUserId(performedByUserId),
    affected_user_id: resolveAuditAffectedUserId(affectedUserId),
    details: JSON.stringify(details),
    ip_address: ip,
    user_agent: userAgent,
    created_at: new Date().toISOString()
  };

  await TransactionManager.query(knex, `INSERT INTO organization_audit (
    id, organization_id, action_type, performed_by_user_id, affected_user_id,
    details, ip_address, user_agent, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    auditData.id, auditData.organization_id, auditData.action_type,
    auditData.performed_by_user_id, auditData.affected_user_id,
    auditData.details, auditData.ip_address, auditData.user_agent, auditData.created_at
  ]);
}

module.exports = { logAudit };
