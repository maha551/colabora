/**
 * Data Transformation Utilities
 * Handles conversion between snake_case (database) and camelCase (API)
 * Also handles boolean normalization (SQLite 0/1 to JavaScript true/false)
 */

const { logger } = require('../middleware/logger');

/**
 * Convert a string from snake_case to camelCase
 * @param {string} str - String in snake_case
 * @returns {string} String in camelCase
 */
function toCamelCase(str) {
  if (!str || typeof str !== 'string') return str;
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert a string from camelCase to snake_case
 * @param {string} str - String in camelCase
 * @returns {string} String in snake_case
 */
function toSnakeCase(str) {
  if (!str || typeof str !== 'string') return str;
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Recursively transform object keys from snake_case to camelCase
 * @param {any} input - Input data (object, array, or primitive)
 * @returns {any} Transformed data
 */
function camelCaseKeys(input) {
  if (Array.isArray(input)) {
    return input.map(item => camelCaseKeys(item));
  }

  if (input !== null && typeof input === 'object' && !(input instanceof Date)) {
    return Object.entries(input).reduce((acc, [key, value]) => {
      const camelKey = toCamelCase(key);
      acc[camelKey] = camelCaseKeys(value);
      return acc;
    }, {});
  }

  return input;
}

/**
 * Recursively transform object keys from camelCase to snake_case
 * @param {any} input - Input data (object, array, or primitive)
 * @returns {any} Transformed data
 */
function snakeCaseKeys(input) {
  if (Array.isArray(input)) {
    return input.map(item => snakeCaseKeys(item));
  }

  if (input !== null && typeof input === 'object' && !(input instanceof Date)) {
    return Object.entries(input).reduce((acc, [key, value]) => {
      const snakeKey = toSnakeCase(key);
      acc[snakeKey] = snakeCaseKeys(value);
      return acc;
    }, {});
  }

  return input;
}

/**
 * Normalize boolean values from SQLite (0/1) to JavaScript (true/false)
 * Handles: 0, 1, "0", "1", null, undefined, true, false
 * @param {any} value - Value to normalize
 * @returns {boolean|null|undefined} Normalized boolean or original value
 */
function normalizeBoolean(value) {
  if (value === null || value === undefined) {
    return value;
  }
  
  if (typeof value === 'boolean') {
    return value;
  }
  
  if (typeof value === 'number') {
    return value !== 0;
  }
  
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    if (lower === 'true' || lower === '1') {
      return true;
    }
    if (lower === 'false' || lower === '0' || lower === '') {
      return false;
    }
    // Return original if not a boolean string
    return value;
  }
  
  return value;
}

/**
 * Convert JavaScript boolean to SQLite boolean (0 or 1)
 * @param {any} value - Value to convert
 * @returns {number} 0 or 1
 */
function toSqliteBoolean(value) {
  if (value === null || value === undefined) {
    return 0;
  }
  
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  
  if (typeof value === 'number') {
    return value !== 0 ? 1 : 0;
  }
  
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    return (lower === 'true' || lower === '1') ? 1 : 0;
  }
  
  return 0;
}

/**
 * Recursively normalize boolean values in an object/array
 * Converts SQLite 0/1 to JavaScript true/false
 * @param {any} input - Input data
 * @returns {any} Data with normalized booleans
 */
function normalizeBooleans(input) {
  if (Array.isArray(input)) {
    return input.map(item => normalizeBooleans(item));
  }

  if (input !== null && typeof input === 'object' && !(input instanceof Date)) {
    return Object.entries(input).reduce((acc, [key, value]) => {
      // Check if key suggests a boolean field
      const isBooleanField = typeof value === 'number' && (value === 0 || value === 1) &&
        (key.includes('_enabled') || key.includes('_disabled') || 
         key.includes('_allowed') || key.includes('_locked') ||
         key.includes('_anonymous') || key.includes('_active') ||
         key.includes('_met') || key.includes('_read') ||
         key.includes('_open') || key.includes('Open') ||
         key.includes('is_') || key.includes('has_') ||
         key === 'approved' || key === 'applied' || key === 'success' ||
         key === 'read' || key === 'elected' || key === 'quorum_met' ||
         key === 'amendmentsOpen');
      
      if (isBooleanField) {
        acc[key] = normalizeBoolean(value);
      } else {
        acc[key] = normalizeBooleans(value);
      }
      return acc;
    }, {});
  }

  return input;
}

/**
 * Recursively convert JavaScript booleans to SQLite booleans (0/1) in an object/array
 * @param {any} input - Input data
 * @returns {any} Data with SQLite booleans
 */
function toSqliteBooleans(input) {
  if (Array.isArray(input)) {
    return input.map(item => toSqliteBooleans(item));
  }

  if (input !== null && typeof input === 'object' && !(input instanceof Date)) {
    return Object.entries(input).reduce((acc, [key, value]) => {
      // Check if value is a boolean
      if (typeof value === 'boolean') {
        acc[key] = toSqliteBoolean(value);
      } else {
        acc[key] = toSqliteBooleans(value);
      }
      return acc;
    }, {});
  }

  return input;
}

/**
 * Normalize date values to ensure consistent formatting
 * Converts strings to Date objects if needed, or ensures ISO string format
 * @param {any} input - Input data
 * @returns {any} Data with normalized dates
 */
function normalizeDates(input) {
  if (Array.isArray(input)) {
    return input.map(item => normalizeDates(item));
  }

  if (input !== null && typeof input === 'object' && !(input instanceof Date)) {
    return Object.entries(input).reduce((acc, [key, value]) => {
      // Check if key suggests a date field
      const isDateField = (key.includes('_at') || key.includes('_date') || 
                          key.includes('_on') || key.includes('Created') || 
                          key.includes('Updated') || key.includes('Deleted')) &&
                         typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/);
      
      if (isDateField && typeof value === 'string') {
        try {
          // Try to parse as Date, but keep as string if invalid
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            acc[key] = value; // Keep as ISO string for API consistency
          } else {
            acc[key] = value;
          }
        } catch {
          acc[key] = value;
        }
      } else {
        acc[key] = normalizeDates(value);
      }
      return acc;
    }, {});
  }

  return input;
}

/**
 * Transform database result to API response format
 * Combines camelCase conversion, boolean normalization, and date normalization
 * @param {any} data - Database result
 * @returns {any} API-ready data
 */
function transformForApi(data) {
  let result = camelCaseKeys(data);
  result = normalizeBooleans(result);
  result = normalizeDates(result);
  return result;
}

/**
 * Transform API request to database format
 * Combines snake_case conversion and boolean conversion
 * @param {any} data - API request data
 * @returns {any} Database-ready data
 */
function transformForDatabase(data) {
  let result = snakeCaseKeys(data);
  result = toSqliteBooleans(result);
  return result;
}

module.exports = {
  toCamelCase,
  toSnakeCase,
  camelCaseKeys,
  snakeCaseKeys,
  normalizeBoolean,
  toSqliteBoolean,
  normalizeBooleans,
  toSqliteBooleans,
  normalizeDates,
  transformForApi,
  transformForDatabase
};

