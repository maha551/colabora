/**
 * Permission Helper Functions for Democratic Constitution System
 * Calculates permissions dynamically based on governance rules
 */

const { logger } = require('../middleware/logger');

/**
 * Check if user is representative of organization
 */
function isRepresentative(db, userId, organizationId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT representatives FROM organizations WHERE id = ?', [organizationId], (err, row) => {
      if (err) return reject(err);
      if (!row) return resolve(false);

      try {
        const representatives = JSON.parse(row.representatives || '[]');
        resolve(representatives.includes(userId));
      } catch (e) {
        resolve(false);
      }
    });
  });
}

/**
 * Check if user is active member of organization
 */
function isActiveMember(db, userId, organizationId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT status FROM organization_members WHERE organization_id = ? AND user_id = ?', [organizationId, userId], (err, row) => {
      if (err) return reject(err);
      resolve(row && row.status === 'active');
    });
  });
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
async function canProposeRules(db, userId, organizationId, rules, userRole = null) {
  // System admins always can
  if (userRole === 'admin') return true;

  const isRep = await isRepresentative(db, userId, organizationId);
  const isMember = await isActiveMember(db, userId, organizationId);

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
async function canCreateDocuments(db, userId, organizationId, rules, userRole = null) {
  if (userRole === 'admin') return true;

  const isRep = await isRepresentative(db, userId, organizationId);
  const isMember = await isActiveMember(db, userId, organizationId);

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
async function canInitializeElections(db, userId, organizationId, rules, userRole = null) {
  if (userRole === 'admin') return true;

  const isRep = await isRepresentative(db, userId, organizationId);
  const isMember = await isActiveMember(db, userId, organizationId);

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
async function canInviteMembers(db, userId, organizationId, rules, userRole = null) {
  if (userRole === 'admin') return true;

  const isRep = await isRepresentative(db, userId, organizationId);
  const isMember = await isActiveMember(db, userId, organizationId);

  // Check if representatives can invite (existing rule)
  if (!rules?.representativeCanInviteMembers) return false;

  // Bootstrap mode: only representatives
  if (rules?.bootstrapMode) return isRep;

  // Recovery mode: all active members can invite
  if (rules?.recoveryMode && isMember) return true;

  // Normal mode: check rule
  if (rules?.membersCanInviteMembers && isMember) return true;
  if (isRep) return true;

  return false;
}

/**
 * Check if user can manage rule proposals
 */
async function canManageRuleProposals(db, userId, organizationId, rules, userRole = null) {
  if (userRole === 'admin') return true;

  const isRep = await isRepresentative(db, userId, organizationId);
  const isMember = await isActiveMember(db, userId, organizationId);

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
 * Permission cache for performance
 */
const permissionCache = new Map();
const CACHE_TTL = 60000; // 1 minute

/**
 * Get cached permission or calculate and cache it
 */
async function getCachedPermission(db, userId, organizationId, permissionType, rules, userRole = null) {
  const cacheKey = `${userId}:${organizationId}:${permissionType}`;
  const cached = permissionCache.get(cacheKey);
  
  if (cached && Date.now() < cached.expires) {
    return cached.value;
  }

  let value;
  
  switch (permissionType) {
    case 'proposeRules':
      value = await canProposeRules(db, userId, organizationId, rules, userRole);
      break;
    case 'createDocuments':
      value = await canCreateDocuments(db, userId, organizationId, rules, userRole);
      break;
    case 'initializeElections':
      value = await canInitializeElections(db, userId, organizationId, rules, userRole);
      break;
    case 'inviteMembers':
      value = await canInviteMembers(db, userId, organizationId, rules, userRole);
      break;
    case 'manageRuleProposals':
      value = await canManageRuleProposals(db, userId, organizationId, rules, userRole);
      break;
    default:
      throw new Error(`Unknown permission type: ${permissionType}`);
  }

  permissionCache.set(cacheKey, {
    value,
    expires: Date.now() + CACHE_TTL
  });

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
  canProposeRules,
  canCreateDocuments,
  canInitializeElections,
  canInviteMembers,
  canManageRuleProposals,
  getCachedPermission,
  invalidatePermissionCache
};

