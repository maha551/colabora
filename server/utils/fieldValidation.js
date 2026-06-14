/**
 * Field Name Validation Utility
 * Prevents SQL injection by validating field names against whitelists
 */

const { ApiError } = require('../middleware/errorHandler');
const { logger } = require('../middleware/logger');
const { PROPOSABLE_POLICY_DB_FIELDS } = require('./governanceRuleFields');

/**
 * Field whitelists for each table
 * These must be maintained as the database schema evolves
 */
const FIELD_WHITELISTS = {
  organizations: [
    'name',
    'description',
    'membership_policy',
    'voting_threshold',
    'branding_color',
    'branding_logo_url',
    'branding_title',
    'branding_banner_url',
    'icon_set',
    'font_family'
  ],
  
  organization_governance_rules: [...PROPOSABLE_POLICY_DB_FIELDS],
  
  representative_elections: [
    'status',
    'voting_deadline',
    'votes_yes',
    'votes_no',
    'votes_abstain',
    'total_votes',
    'completed_at',
    'votes_cast',
    'updated_at',
    'nomination_starts_at',
    'nomination_ends_at',
    'voting_starts_at',
    'voting_ends_at',
    'total_voters'
  ],
  
  election_candidates: [
    'votes_received',
    'elected',
    'elected_position',
    'accepted_nomination'
  ],
  
  error_reports: [
    'status',
    'priority',
    'assigned_to',
    'resolution_notes',
    'resolved_at'
  ],
  
  notification_preferences: [
    'email_enabled',
    'immediate_notifications_enabled',
    'digest_frequency',
    'channel_preferences',
  ],
  
  organization_votes: [
    'votes_yes',
    'votes_no',
    'votes_abstain',
    'total_votes'
  ]
};

/**
 * Validate field names against a whitelist
 * @param {string[]} fields - Array of field names to validate
 * @param {string[]} allowedFields - Array of allowed field names
 * @returns {void}
 * @throws {ApiError} If any field is not in the whitelist
 */
function validateFieldNames(fields, allowedFields) {
  if (!Array.isArray(fields)) {
    throw ApiError.validation('Fields must be an array', 'INVALID_FIELDS');
  }
  
  if (!Array.isArray(allowedFields)) {
    throw ApiError.validation('Allowed fields must be an array', 'INVALID_WHITELIST');
  }
  
  const invalidFields = fields.filter(field => !allowedFields.includes(field));
  
  if (invalidFields.length > 0) {
    logger.warn('Invalid field names detected', {
      invalidFields,
      allowedFields,
      attemptedFields: fields
    });
    throw ApiError.validation(
      `Invalid field names: ${invalidFields.join(', ')}`,
      'INVALID_FIELD_NAMES',
      { invalidFields, allowedFields }
    );
  }
}

/**
 * Build a safe UPDATE SET clause from field names and values
 * @param {Object} updates - Object with field names as keys and values as values
 * @param {string[]} allowedFields - Array of allowed field names
 * @returns {Object} Object with `setClause` (string) and `values` (array)
 * @throws {ApiError} If any field is not in the whitelist
 */
function buildUpdateClause(updates, allowedFields) {
  if (!updates || typeof updates !== 'object') {
    throw ApiError.validation('Updates must be an object', 'INVALID_UPDATES');
  }
  
  const fieldNames = Object.keys(updates);
  validateFieldNames(fieldNames, allowedFields);
  
  const setClause = fieldNames.map(field => `${field} = ?`).join(', ');
  const values = fieldNames.map(field => updates[field]);
  
  return {
    setClause,
    values
  };
}

/**
 * Build UPDATE fields array and values array from request body
 * Validates field names against whitelist
 * @param {Object} body - Request body with field updates
 * @param {string[]} allowedFields - Array of allowed field names
 * @param {Object} fieldMapping - Optional mapping from request field names to DB field names
 * @returns {Object} Object with `updateFields` (array of "field = ?" strings) and `updateValues` (array)
 * @throws {ApiError} If any field is not in the whitelist
 */
function buildUpdateFields(body, allowedFields, fieldMapping = {}) {
  const updateFields = [];
  const updateValues = [];
  
  // Build updates object, applying field mapping if provided
  const updates = {};
  for (const [requestField, value] of Object.entries(body)) {
    if (value === undefined) {
      continue; // Skip undefined values
    }
    
    // Apply field mapping if provided, otherwise use field name as-is
    const dbField = fieldMapping[requestField] || requestField;
    updates[dbField] = value;
  }
  
  // Validate all field names
  const fieldNames = Object.keys(updates);
  validateFieldNames(fieldNames, allowedFields);
  
  // Build update clause
  for (const [field, value] of Object.entries(updates)) {
    updateFields.push(`${field} = ?`);
    updateValues.push(value);
  }
  
  return {
    updateFields,
    updateValues
  };
}

/**
 * Get field whitelist for a table
 * @param {string} tableName - Name of the table
 * @returns {string[]} Array of allowed field names
 * @throws {ApiError} If table name is not recognized
 */
function getFieldWhitelist(tableName) {
  const whitelist = FIELD_WHITELISTS[tableName];
  
  if (!whitelist) {
    logger.error('Unknown table name for field validation', { tableName });
    throw ApiError.database(
      `Field validation not configured for table: ${tableName}`,
      { tableName },
      'UNKNOWN_TABLE'
    );
  }
  
  return whitelist;
}

/**
 * Validate and build update clause for a specific table
 * @param {Object} updates - Object with field updates
 * @param {string} tableName - Name of the table
 * @param {Object} fieldMapping - Optional mapping from request field names to DB field names
 * @returns {Object} Object with `setClause` (string) and `values` (array)
 */
function validateAndBuildUpdate(tableName, updates, fieldMapping = {}) {
  const allowedFields = getFieldWhitelist(tableName);
  return buildUpdateClause(updates, allowedFields);
}

module.exports = {
  validateFieldNames,
  buildUpdateClause,
  buildUpdateFields,
  getFieldWhitelist,
  validateAndBuildUpdate,
  FIELD_WHITELISTS
};

