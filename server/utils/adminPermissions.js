'use strict';

const { isRepresentative } = require('../modules/permissions');

function isPlatformAdmin(userRole) {
  return userRole === 'admin';
}

/**
 * Representatives and platform admins may perform org management mutations.
 * @returns {Promise<{ allowed: boolean, asAdmin: boolean }>}
 */
async function canManageOrganizationActions(db, userId, organizationId, userRole) {
  if (isPlatformAdmin(userRole)) {
    return { allowed: true, asAdmin: true };
  }
  const isRep = await isRepresentative(db, userId, organizationId);
  return { allowed: isRep, asAdmin: false };
}

module.exports = {
  isPlatformAdmin,
  canManageOrganizationActions,
};
