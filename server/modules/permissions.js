/**
 * Permission Helper Functions for Democratic Constitution System
 * Calculates permissions dynamically based on governance rules
 */

const { logger } = require('../middleware/logger');
const { safeJsonParseArray } = require('../utils/jsonUtils');
const TransactionManager = require('../database/services/TransactionManager');

/**
 * Check if user is representative of organization
 * Returns object with status and details for better error handling
 * Uses organization_representatives table as the source of truth
 */
async function isRepresentative(knex, userId, organizationId) {
  try {
    const row = await TransactionManager.query(knex,
      'SELECT 1 FROM organization_representatives WHERE organization_id = ? AND user_id = ? AND status = ?', 
      [organizationId, userId, 'active']
    );
    
    // If row exists in table, user is a representative
    const isRep = !!row;
    if (isRep) {
      logger.debug('User is a representative', { userId, organizationId });
    } else {
      logger.debug('User is not a representative', { userId, organizationId });
    }
    return isRep;
  } catch (error) {
    // If table doesn't exist, fall back to checking JSON column
    if (error.message && error.message.includes('no such table')) {
      logger.debug('organization_representatives table does not exist, falling back to JSON column', {
        userId,
        organizationId
      });
      
      try {
        // Fallback to JSON column check
        const org = await TransactionManager.query(knex, 'SELECT representatives FROM organizations WHERE id = ?', [organizationId]);
        
        if (!org) {
          return false;
        }
        
        const representatives = safeJsonParseArray(org.representatives);
        return representatives && representatives.includes(userId);
      } catch (orgErr) {
        logger.error('Error checking representative status (fallback)', { 
          error: orgErr.message, 
          userId, 
          organizationId 
        });
        throw orgErr;
      }
    }
    
    logger.error('Error checking representative status', { 
      error: error.message, 
      userId, 
      organizationId
    });
    throw error;
  }
}

/**
 * Get detailed representative status information
 * Uses organization_representatives table as the source of truth
 */
async function getRepresentativeStatus(knex, userId, organizationId) {
  try {
    const row = await TransactionManager.query(knex, `
      SELECT or.user_id, o.name as organization_name,
             (SELECT COUNT(*) FROM organization_representatives WHERE organization_id = ? AND status = 'active') as total_representatives
      FROM organizations o
      LEFT JOIN organization_representatives or ON or.organization_id = o.id AND or.user_id = ? AND or.status = 'active'
      WHERE o.id = ?
    `, [organizationId, userId, organizationId]);
    
    if (!row) {
      return {
        isRepresentative: false,
        organizationExists: false,
        error: 'Organization not found'
      };
    }

    const isRep = !!row.user_id;
    
    // Fetch all representative IDs for completeness
    if (isRep) {
      try {
        const repRows = await TransactionManager.queryAll(knex,
          'SELECT user_id FROM organization_representatives WHERE organization_id = ? AND status = ?', 
          [organizationId, 'active']
        );
        return {
          isRepresentative: isRep,
          organizationExists: true,
          organizationName: row.organization_name,
          totalRepresentatives: row.total_representatives || 0,
          representativeIds: repRows.map(r => r.user_id)
        };
      } catch (repErr) {
        logger.warn('Error fetching all representative IDs, using count only', { error: repErr.message });
        return {
          isRepresentative: isRep,
          organizationExists: true,
          organizationName: row.organization_name,
          totalRepresentatives: row.total_representatives || 0,
          representativeIds: []
        };
      }
    } else {
      // User is not a rep, but organization exists
      return {
        isRepresentative: false,
        organizationExists: true,
        organizationName: row.organization_name,
        totalRepresentatives: row.total_representatives || 0,
        representativeIds: []
      };
    }
  } catch (error) {
    logger.error('Error fetching representative status details', { 
      error: error.message, 
      userId, 
      organizationId 
    });
    throw error;
  }
}

/**
 * Check if user is active member of organization
 */
async function isActiveMember(knex, userId, organizationId) {
  try {
    const row = await TransactionManager.query(knex,
      'SELECT status FROM organization_members WHERE organization_id = ? AND user_id = ?', 
      [organizationId, userId]
    );
    
    const isActive = row && row.status === 'active';
    
    if (!isActive) {
      logger.debug('User is not an active member', { 
        userId, 
        organizationId, 
        status: row?.status || 'not_member' 
      });
    } else {
      logger.debug('User is an active member', { userId, organizationId });
    }
    
    return Boolean(row && row.status === 'active');
  } catch (error) {
    // If table doesn't exist, return false (user is not a member)
    // This allows the system to continue functioning even if migrations haven't run
    if (error.message && (error.message.includes('no such table') || error.message.includes('does not exist'))) {
      logger.debug('organization_members table does not exist, assuming user is not a member', {
        userId,
        organizationId
      });
      return false;
    }
    
    logger.error('Error checking active member status', { 
      error: error.message, 
      userId, 
      organizationId 
    });
    throw error;
  }
}

/**
 * Get detailed member status information
 */
async function getMemberStatus(knex, userId, organizationId) {
  try {
    const row = await TransactionManager.query(knex, `
      SELECT om.status, om.joined_at, o.name as organization_name
      FROM organization_members om
      JOIN organizations o ON om.organization_id = o.id
      WHERE om.organization_id = ? AND om.user_id = ?
    `, [organizationId, userId]);
    
    if (!row) {
      return {
        isMember: false,
        organizationExists: false,
        error: 'Member not found'
      };
    }

    return {
      isMember: true,
      organizationExists: true,
      organizationName: row.organization_name,
      status: row.status,
      joinedAt: row.joined_at,
      isActive: row.status === 'active'
    };
  } catch (error) {
    logger.error('Error fetching member status details', { 
      error: error.message, 
      userId, 
      organizationId 
    });
    throw error;
  }
}

/**
 * Get count of active representatives for an organization
 */
async function getRepresentativesCount(knex, organizationId) {
  try {
    const row = await TransactionManager.query(knex,
      'SELECT COUNT(*) as count FROM organization_representatives WHERE organization_id = ? AND status = ?', 
      [organizationId, 'active']
    );
    return row ? row.count : 0;
  } catch (error) {
    logger.error('Error getting representatives count', { error: error.message, organizationId });
    throw error;
  }
}

/**
 * Check if user can propose rules
 * @param {Object} db - Database connection
 * @param {string} userId - User ID
 * @param {string} organizationId - Organization ID
 * @param {Object} rules - Governance rules (transformed to camelCase)
 * @param {string} userRole - User role (optional, for admin check)
 * @returns {Promise<boolean>}
 */
async function canProposeRules(knex, userId, organizationId, rules, userRole = null) {
  // System admins always can
  if (userRole === 'admin') return true;

  const isRep = await isRepresentative(knex, userId, organizationId);
  const isMember = await isActiveMember(knex, userId, organizationId);

  // Bootstrap mode: members can propose
  if (rules?.bootstrapMode && isMember) return true;

  // Recovery mode: all active members can propose
  if (rules?.recoveryMode && isMember) return true;

  // Normal mode: check rule
  if (rules?.membersCanProposeRules && isMember) return true;
  if (isRep) return true;

  return false;
}

/**
 * Check if user can create documents
 */
async function canCreateDocuments(knex, userId, organizationId, rules, userRole = null) {
  if (userRole === 'admin') return true;

  const isRep = await isRepresentative(knex, userId, organizationId);
  const isMember = await isActiveMember(knex, userId, organizationId);

  // Bootstrap mode: members can create
  if (rules?.bootstrapMode && isMember) return true;

  // Recovery mode: all active members can create
  if (rules?.recoveryMode && isMember) return true;

  // Normal mode: check rule
  if (rules?.membersCanCreateDocuments && isMember) return true;
  if (isRep) return true;

  return false;
}

/**
 * Check if user can initialize elections
 */
async function canInitializeElections(knex, userId, organizationId, rules, userRole = null) {
  if (userRole === 'admin') return true;

  const isRep = await isRepresentative(knex, userId, organizationId);
  const isMember = await isActiveMember(knex, userId, organizationId);

  // Bootstrap mode: only representatives
  if (rules?.bootstrapMode) return isRep;

  // Recovery mode: all active members can initialize
  if (rules?.recoveryMode && isMember) return true;

  // Normal mode: check rule
  if (rules?.membersCanInitializeElections && isMember) return true;
  if (isRep) return true;

  return false;
}

/**
 * Check if user can invite members
 */
async function canInviteMembers(knex, userId, organizationId, rules, userRole = null) {
  if (userRole === 'admin') return true;

  const isRep = await isRepresentative(knex, userId, organizationId);
  const isMember = await isActiveMember(knex, userId, organizationId);

  // Check if representatives can invite (existing rule)
  // Handle both camelCase and snake_case formats
  const representativeCanInvite = rules?.representativeCanInviteMembers ?? rules?.representative_can_invite_members;
  if (!representativeCanInvite) return false;

  // Bootstrap mode: only representatives
  // Handle both camelCase and snake_case formats
  const bootstrapMode = rules?.bootstrapMode ?? rules?.bootstrap_mode;
  if (bootstrapMode) return isRep;

  // Recovery mode: all active members can invite
  // Handle both camelCase and snake_case formats
  const recoveryMode = rules?.recoveryMode ?? rules?.recovery_mode;
  if (recoveryMode && isMember) return true;

  // Normal mode: check rule
  // Handle both camelCase and snake_case formats
  const membersCanInvite = rules?.membersCanInviteMembers ?? rules?.members_can_invite_members;
  if (membersCanInvite && isMember) return true;
  if (isRep) return true;

  return false;
}

/**
 * Check if user can manage rule proposals
 */
async function canManageRuleProposals(knex, userId, organizationId, rules, userRole = null) {
  if (userRole === 'admin') return true;

  const isRep = await isRepresentative(knex, userId, organizationId);
  const isMember = await isActiveMember(knex, userId, organizationId);

  // Bootstrap mode: only representatives
  if (rules?.bootstrapMode) return isRep;

  // Recovery mode: all active members can manage
  if (rules?.recoveryMode && isMember) return true;

  // Normal mode: check rule
  if (rules?.membersCanManageRuleProposals && isMember) return true;
  if (isRep) return true;

  return false;
}

/**
 * Check if user can start document voting (or rule proposal voting) for the organization.
 * When representativeCanCreateVotes is false, only admin can start. When true, only representatives (or admin) can start.
 */
async function canStartDocumentVoting(knex, userId, organizationId, rules, userRole = null) {
  if (userRole === 'admin') return true;

  const repCanCreate = rules?.representativeCanCreateVotes ?? rules?.representative_can_create_votes;
  if (repCanCreate === false || repCanCreate === 0) return false;

  const isRep = await isRepresentative(knex, userId, organizationId);
  return !!isRep;
}

const BoundedCache = require('../utils/BoundedCache');
const PERMISSION_CACHE_TTL = 60000; // 1 minute
const permissionCache = new BoundedCache({ maxSize: 500 });

/**
 * Get cached permission or calculate and cache it
 */
async function getCachedPermission(knex, userId, organizationId, permissionType, rules, userRole = null) {
  const cacheKey = `${userId}:${organizationId}:${permissionType}`;
  const cached = permissionCache.get(cacheKey);
  if (cached) return cached.value;

  let value;
  
  switch (permissionType) {
    case 'proposeRules':
      value = await canProposeRules(knex, userId, organizationId, rules, userRole);
      break;
    case 'createDocuments':
      value = await canCreateDocuments(knex, userId, organizationId, rules, userRole);
      break;
    case 'initializeElections':
      value = await canInitializeElections(knex, userId, organizationId, rules, userRole);
      break;
    case 'inviteMembers':
      value = await canInviteMembers(knex, userId, organizationId, rules, userRole);
      break;
    case 'manageRuleProposals':
      value = await canManageRuleProposals(knex, userId, organizationId, rules, userRole);
      break;
    case 'startDocumentVoting':
      value = await canStartDocumentVoting(knex, userId, organizationId, rules, userRole);
      break;
    default:
      throw new Error(`Unknown permission type: ${permissionType}`);
  }

  permissionCache.set(cacheKey, { value, expires: Date.now() + PERMISSION_CACHE_TTL }, PERMISSION_CACHE_TTL);

  return value;
}

/**
 * Invalidate permission cache for an organization
 */
function invalidatePermissionCache(organizationId) {
  const keysToDelete = [];
  for (const [key] of permissionCache.entries()) {
    if (key.includes(`:${organizationId}:`)) {
      keysToDelete.push(key);
    }
  }
  keysToDelete.forEach(key => permissionCache.delete(key));
  
  logger.debug(`Invalidated permission cache for organization ${organizationId}`, {
    keysDeleted: keysToDelete.length
  });
}

module.exports = {
  isRepresentative,
  isActiveMember,
  getRepresentativeStatus,
  getMemberStatus,
  getRepresentativesCount,
  canProposeRules,
  canCreateDocuments,
  canInitializeElections,
  canInviteMembers,
  canManageRuleProposals,
  canStartDocumentVoting,
  getCachedPermission,
  invalidatePermissionCache
};

