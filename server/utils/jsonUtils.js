/**
 * Safe JSON Parsing Utilities
 * Provides error-safe JSON parsing with logging and sensible defaults
 */

const { logger } = require('../middleware/logger');

/**
 * Safely parse JSON string with error handling
 * @param {string|null|undefined} jsonString - JSON string to parse
 * @param {*} defaultValue - Default value to return on parse failure (default: null)
 * @returns {*} Parsed JSON object or default value
 */
function safeJsonParse(jsonString, defaultValue = null) {
  if (jsonString === null || jsonString === undefined) {
    return defaultValue;
  }

  // PostgreSQL json/jsonb columns and aggregates (e.g. json_agg) are already parsed
  // into JS objects/arrays by node-postgres, so return them as-is rather than
  // discarding them (they cannot be JSON.parse-d again).
  if (typeof jsonString === 'object') {
    return jsonString;
  }

  if (typeof jsonString !== 'string') {
    logger.warn('safeJsonParse called with non-string value', { 
      type: typeof jsonString,
      value: String(jsonString).substring(0, 100)
    });
    return defaultValue;
  }

  if (jsonString.trim() === '') {
    return defaultValue;
  }

  try {
    return JSON.parse(jsonString);
  } catch (error) {
    logger.warn('JSON parse failed', { 
      error: error.message, 
      jsonString: jsonString.substring(0, 100),
      defaultValue: defaultValue !== null ? 'using default' : 'null'
    });
    return defaultValue;
  }
}

/**
 * Safely parse JSON string as array (returns empty array on failure)
 * @param {string|null|undefined} jsonString - JSON string to parse
 * @returns {Array} Parsed JSON array or empty array
 */
function safeJsonParseArray(jsonString) {
  const result = safeJsonParse(jsonString, []);
  return Array.isArray(result) ? result : [];
}

/**
 * Safely parse JSON string as object (returns empty object on failure)
 * @param {string|null|undefined} jsonString - JSON string to parse
 * @returns {Object} Parsed JSON object or empty object
 */
function safeJsonParseObject(jsonString) {
  const result = safeJsonParse(jsonString, {});
  return typeof result === 'object' && result !== null && !Array.isArray(result) ? result : {};
}

/**
 * Safely stringify object to JSON
 * @param {*} obj - Object to stringify
 * @param {string} defaultValue - Default value to return on stringify failure (default: '{}')
 * @returns {string} JSON string or default value
 */
function safeJsonStringify(obj, defaultValue = '{}') {
  try {
    return JSON.stringify(obj);
  } catch (error) {
    logger.warn('JSON stringify failed', { 
      error: error.message,
      type: typeof obj
    });
    return defaultValue;
  }
}

module.exports = {
  safeJsonParse,
  safeJsonParseArray,
  safeJsonParseObject,
  safeJsonStringify
};

