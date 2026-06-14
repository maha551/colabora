/**
 * Member Utility Functions
 * Utilities for working with member data structures
 */

/**
 * Extract user IDs from an array of member objects
 * @param {Array} members - Array of member objects with user_id property
 * @returns {Array<string>} Array of user IDs
 */
function extractUserIds(members) {
  if (!Array.isArray(members)) {
    return [];
  }
  return members.map(m => m.user_id).filter(id => id != null);
}

module.exports = {
  extractUserIds
};

