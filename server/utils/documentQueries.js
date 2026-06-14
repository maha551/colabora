/**
 * Query helper utilities for document queries
 * Handles conditional JOINs and field selection for documents with different owner types
 * (user owners vs organization owners)
 */

/**
 * Build owner JOIN clause for document queries
 * Handles both user owners and organization owners
 * @param {string} prefix - Table prefix (default: 'd')
 * @returns {string} SQL JOIN clause
 */
function buildOwnerJoin(prefix = 'd') {
  return `
    LEFT JOIN users u ON ${prefix}.owner_id = u.id AND ${prefix}.ownership_type != 'organizational'
    LEFT JOIN organizations o_owner ON ${prefix}.owner_id = o_owner.id AND ${prefix}.ownership_type = 'organizational'
  `;
}

/**
 * Build owner SELECT fields
 * @param {string} prefix - Table prefix (default: 'd')
 * @returns {string} SQL SELECT fields
 */
function buildOwnerSelect(prefix = 'd') {
  return `
    CASE 
      WHEN ${prefix}.ownership_type = 'organizational' THEN o_owner.name
      ELSE u.name
    END as owner_name,
    CASE 
      WHEN ${prefix}.ownership_type = 'organizational' THEN NULL
      ELSE u.email
    END as owner_email,
    CASE 
      WHEN ${prefix}.ownership_type = 'organizational' THEN NULL
      ELSE u.avatar
    END as owner_avatar,
    CASE 
      WHEN ${prefix}.ownership_type = 'organizational' THEN 'organization'
      ELSE 'user'
    END as owner_type
  `;
}

/**
 * Build access check WHERE clause
 * @param {string} prefix - Table prefix (default: 'd')
 * @param {string} userIdParam - Parameter placeholder for userId (default: '?')
 * @returns {string} SQL WHERE clause fragment
 */
function buildAccessCheck(prefix = 'd', userIdParam = '?') {
  return `
    (
      (${prefix}.ownership_type != 'organizational' AND ${prefix}.owner_id = ${userIdParam})
      OR dc.user_id = ${userIdParam}
      OR (${prefix}.ownership_type = 'organizational' 
          AND om.user_id IS NOT NULL 
          AND om.status = 'active' 
          AND o.is_active = true)
    )
  `;
}

module.exports = {
  buildOwnerJoin,
  buildOwnerSelect,
  buildAccessCheck
};

