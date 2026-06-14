/**
 * Field Extraction Utility
 * Handles extraction of fields from request bodies that may be in camelCase or snake_case
 * 
 * This utility standardizes the pattern:
 *   const field = req.body.fieldName || req.body.field_name;
 *   const value = req.body.fieldValue !== undefined ? req.body.fieldValue : req.body.field_value;
 */

/**
 * Extract a field value from request body, handling both camelCase and snake_case
 * @param {Object} body - Request body object
 * @param {string} camelCaseName - Field name in camelCase
 * @param {string} snakeCaseName - Field name in snake_case
 * @param {*} defaultValue - Default value if field is not found
 * @returns {*} Field value or defaultValue
 */
function extractField(body, camelCaseName, snakeCaseName, defaultValue = undefined) {
  // Prefer camelCase, fallback to snake_case
  if (body[camelCaseName] !== undefined) {
    return body[camelCaseName];
  }
  if (body[snakeCaseName] !== undefined) {
    return body[snakeCaseName];
  }
  return defaultValue;
}

/**
 * Extract a field value that must exist (throws if not found)
 * @param {Object} body - Request body object
 * @param {string} camelCaseName - Field name in camelCase
 * @param {string} snakeCaseName - Field name in snake_case
 * @returns {*} Field value
 * @throws {Error} If field is not found
 */
function extractRequiredField(body, camelCaseName, snakeCaseName) {
  const value = extractField(body, camelCaseName, snakeCaseName);
  if (value === undefined) {
    throw new Error(`Required field missing: ${camelCaseName} or ${snakeCaseName}`);
  }
  return value;
}

/**
 * Extract operation type from operation object (handles both camelCase and snake_case)
 * @param {Object} operation - Operation object
 * @returns {string} Operation type
 */
function extractOperationType(operation) {
  return operation.operation_type || operation.operationType || null;
}

/**
 * Extract all operation fields from operation object (handles both camelCase and snake_case)
 * @param {Object} operation - Operation object
 * @returns {Object} Extracted operation fields
 */
function extractOperationFields(operation) {
  return {
    operationType: extractOperationType(operation),
    targetParagraphId: operation.target_paragraph_id || operation.targetParagraphId,
    sourceParagraphIds: operation.source_paragraph_ids || operation.sourceParagraphIds,
    newPositionIndex: operation.new_position_index !== undefined ? operation.new_position_index : operation.newPositionIndex,
    newParentId: operation.new_parent_id || operation.newParentId,
    newText: operation.new_text || operation.newText,
    newHeadingLevel: operation.new_heading_level || operation.newHeadingLevel,
    operationData: operation.operation_data || operation.operationData
  };
}

module.exports = {
  extractField,
  extractRequiredField,
  extractOperationType,
  extractOperationFields
};

