/** Sentinel user id for scheduler/system-initiated audit events. */
const SYSTEM_USER_ID = 'system';

/**
 * Resolve performed_by_user_id for organization_audit (NOT NULL + FK to users).
 */
function resolveAuditPerformedByUserId(userId) {
  if (!userId || userId === SYSTEM_USER_ID) {
    return SYSTEM_USER_ID;
  }
  return userId;
}

/**
 * Resolve affected_user_id for organization_audit (nullable FK to users).
 */
function resolveAuditAffectedUserId(userId) {
  if (!userId || userId === SYSTEM_USER_ID) {
    return null;
  }
  return userId;
}

module.exports = {
  SYSTEM_USER_ID,
  resolveAuditPerformedByUserId,
  resolveAuditAffectedUserId,
};
