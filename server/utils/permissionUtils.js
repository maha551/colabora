/**
 * Permission Utilities
 * Utilities for checking user organization permissions
 * 
 * This utility consolidates permission checking patterns to reduce database queries
 * and provide consistent permission checking across the codebase.
 */

const { logger } = require('../middleware/logger');
const { ApiError } = require('../middleware/errorHandler');
const { isRepresentative, isActiveMember } = require('../modules/permissions');
// Note: getGovernanceRules is imported lazily inside getPermissionContext to avoid circular dependency
const {
  canProposeRules,
  canCreateDocuments,
  canInitializeElections,
  canInviteMembers,
  canManageRuleProposals
} = require('../modules/permissions');

/**
 * Get comprehensive user organization status in a single call
 * This function combines isRepresentative and isActiveMember checks using Promise.all
 * to execute them in parallel, reducing overall latency.
 * 
 * @param {Object} db - Database connection (knex instance)
 * @param {string} userId - User ID
 * @param {string} organizationId - Organization ID
 * @param {string} userRole - User role (optional, for admin check)
 * @returns {Promise<{isRepresentative: boolean, isActiveMember: boolean, isAdmin: boolean}>}
 * 
 * @example
 * const status = await getUserOrganizationStatus(db, userId, organizationId, userRole);
 * if (status.isRepresentative || status.isActiveMember) {
 *   // User has access
 * }
 */
async function getUserOrganizationStatus(db, userId, organizationId, userRole = null) {
  // Execute both permission checks in parallel, but handle errors individually
  // This way if one table is missing, we can still check the other
  const results = await Promise.allSettled([
    isRepresentative(db, userId, organizationId),
    isActiveMember(db, userId, organizationId)
  ]);
  
  // Handle isRepresentative result
  let isRep = false;
  if (results[0].status === 'fulfilled') {
    isRep = results[0].value;
  } else {
    logger.warn('Failed to check representative status', {
      error: results[0].reason?.message,
      userId,
      organizationId
    });
    // If check failed, default to false (user is not a representative)
    isRep = false;
  }
  
  // Handle isActiveMember result
  let isMember = false;
  if (results[1].status === 'fulfilled') {
    isMember = results[1].value;
  } else {
    logger.warn('Failed to check active member status', {
      error: results[1].reason?.message,
      userId,
      organizationId
    });
    // If check failed, default to false (user is not an active member)
    isMember = false;
  }
  
  // If both checks failed, check if it's due to missing tables (migration issue) or a real error
  if (results[0].status === 'rejected' && results[1].status === 'rejected') {
    const repError = results[0].reason?.message || '';
    const memberError = results[1].reason?.message || '';
    
    // If both errors are about missing tables, this is a migration issue - return false for both
    const bothTablesMissing = 
      (repError.includes('no such table') || repError.includes('does not exist')) &&
      (memberError.includes('no such table') || memberError.includes('does not exist'));
    
    if (bothTablesMissing) {
      logger.warn('Both permission tables missing - likely migration issue', {
        userId,
        organizationId,
        representativeError: repError,
        memberError: memberError
      });
      // Return false for both - user has no access, but don't throw error
      return {
        isRepresentative: false,
        isActiveMember: false,
        isAdmin: userRole === 'admin'
      };
    }
    
    // If it's a real database error (not just missing tables), throw
    const error = new Error('Both permission checks failed');
    error.cause = {
      representativeCheck: repError,
      memberCheck: memberError
    };
    throw error;
  }
  
  return {
    isRepresentative: isRep,
    isActiveMember: isMember,
    isAdmin: userRole === 'admin'
  };
}

/**
 * Get permission context for a user in an organization
 * This combines governance rules, user status, and common permission checks
 * in a single optimized call to reduce database queries.
 * 
 * @param {Object} db - Database connection
 * @param {string} userId - User ID
 * @param {string} organizationId - Organization ID
 * @param {string} userRole - User role (optional, for admin check)
 * @param {Array<string>} permissionTypes - Optional array of specific permissions to check
 * @returns {Promise<{rules: Object, status: Object, permissions: Object}>}
 * 
 * @example
 * const context = await getPermissionContext(db, userId, organizationId, userRole, ['canProposeRules', 'canCreateDocuments']);
 * if (context.permissions.canProposeRules) {
 *   // User can propose rules
 * }
 */
async function getPermissionContext(db, userId, organizationId, userRole = null, permissionTypes = []) {
  const GovernanceRulesService = require('../services/governance/GovernanceRulesService');

  // Fetch rules and status in parallel
  const [rules, status] = await Promise.all([
    GovernanceRulesService.getGovernanceRules(db, organizationId).catch(() => null), // Return null if rules don't exist
    getUserOrganizationStatus(db, userId, organizationId, userRole)
  ]);

  // Build permissions object based on requested types
  const permissions = {};
  
  // If no specific types requested, check all common permissions
  const typesToCheck = permissionTypes.length > 0 
    ? permissionTypes 
    : ['canProposeRules', 'canCreateDocuments', 'canInitializeElections', 'canInviteMembers', 'canManageRuleProposals'];

  // Check permissions in parallel
  const permissionChecks = typesToCheck.map(async (type) => {
    switch (type) {
      case 'canProposeRules':
        return canProposeRules(db, userId, organizationId, rules, userRole);
      case 'canCreateDocuments':
        return canCreateDocuments(db, userId, organizationId, rules, userRole);
      case 'canInitializeElections':
        return canInitializeElections(db, userId, organizationId, rules, userRole);
      case 'canInviteMembers':
        return canInviteMembers(db, userId, organizationId, rules, userRole);
      case 'canManageRuleProposals':
        return canManageRuleProposals(db, userId, organizationId, rules, userRole);
      default:
        return false;
    }
  });

  const permissionResults = await Promise.all(permissionChecks);
  typesToCheck.forEach((type, index) => {
    permissions[type] = permissionResults[index];
  });

  return {
    rules,
    status,
    permissions
  };
}

/**
 * Validate database connection and check user organization permissions.
 * Used by governance (and other) routes to ensure db is present and user has access.
 * @param {Object} db - Database connection
 * @param {string} userId - User ID
 * @param {string} organizationId - Organization ID
 * @param {string} userRole - User role
 * @param {string} endpointName - Name of endpoint for error messages
 * @returns {Promise<{isRepresentative: boolean, isActiveMember: boolean, isAdmin: boolean}>}
 */
async function validateDatabaseAndPermissions(db, userId, organizationId, userRole, endpointName) {
  if (!db) {
    logger.error(`Database not available in ${endpointName} endpoint`, { organizationId });
    throw ApiError.database('Database connection not available');
  }
  let status;
  try {
    status = await getUserOrganizationStatus(db, userId, organizationId, userRole);
  } catch (statusErr) {
    logger.error('Error checking user organization status', {
      error: statusErr.message,
      organizationId,
      userId
    });
    throw ApiError.database('Failed to verify access permissions', {
      organizationId,
      originalError: statusErr.message
    }, 'PERMISSION_CHECK_ERROR');
  }
  const hasAccess = status.isRepresentative || status.isActiveMember;
  if (!hasAccess) {
    throw ApiError.forbidden('Access denied');
  }
  return status;
}

/**
 * Check whether two users share at least one active organization membership.
 * @param {Object} db
 * @param {string} userIdA
 * @param {string} userIdB
 * @returns {Promise<boolean>}
 */
async function usersShareActiveOrganization(db, userIdA, userIdB) {
  if (userIdA === userIdB) return true;

  const TransactionManager = require('../database/services/TransactionManager');
  const row = await TransactionManager.query(db, `
    SELECT 1
    FROM organization_members om1
    JOIN organization_members om2 ON om1.organization_id = om2.organization_id
    JOIN organizations o ON om1.organization_id = o.id AND o.is_active = true
    WHERE om1.user_id = ?
      AND om2.user_id = ?
      AND om1.status = 'active'
      AND om2.status = 'active'
    LIMIT 1
  `, [userIdA, userIdB]);

  return !!row;
}

module.exports = {
  getUserOrganizationStatus,
  getPermissionContext,
  validateDatabaseAndPermissions,
  usersShareActiveOrganization
};

