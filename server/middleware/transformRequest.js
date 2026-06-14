/**
 * Request Transformation Middleware
 * Transforms incoming camelCase requests to snake_case for database
 * Preserves special fields like passwords and tokens
 */

const { transformForDatabase } = require('../utils/dataTransform');
const { logger } = require('./logger');

/**
 * Fields that should NOT be transformed (preserve as-is)
 */
const PRESERVE_FIELDS = [
  'password',
  'passwordHash',
  'password_hash',
  'token',
  'authToken',
  'auth_token',
  'apiKey',
  'api_key',
  'secret',
  'jwt',
  'sessionId',
  'session_id'
];

/**
 * Check if a field should be preserved (not transformed)
 * @param {string} key - Field key
 * @returns {boolean} True if field should be preserved
 */
function shouldPreserveField(key) {
  return PRESERVE_FIELDS.some(preserve => 
    key.toLowerCase().includes(preserve.toLowerCase())
  );
}

/**
 * Transform request body for database (with field preservation)
 * @param {any} data - Request data
 * @param {string} prefix - Key prefix for nested objects
 * @returns {any} Transformed data
 */
function transformRequestData(data, prefix = '') {
  if (Array.isArray(data)) {
    return data.map(item => transformRequestData(item, prefix));
  }

  if (data !== null && typeof data === 'object' && !(data instanceof Date)) {
    return Object.entries(data).reduce((acc, [key, value]) => {
      // Preserve special fields
      if (shouldPreserveField(key)) {
        acc[key] = value;
      } else {
        // Transform the key to snake_case
        const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
        // Recursively transform nested objects
        acc[snakeKey] = transformRequestData(value, `${prefix}${key}.`);
      }
      return acc;
    }, {});
  }

  return data;
}

/**
 * Middleware to transform request data before processing
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function transformRequest(req, res, next) {
  try {
    // Transform request body if present
    if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
      // Save original body before transform so preserve logic can restore from it
      req.originalBody = { ...req.body };

      req.body = transformForDatabase(req.body);

      // Restore preserved fields from the real original body (e.g. authToken, password)
      PRESERVE_FIELDS.forEach(field => {
        if (req.originalBody[field] !== undefined) {
          req.body[field] = req.originalBody[field];
        }
      });
    }

    // Transform query parameters if needed (optional - query params are usually simple)
    // We'll leave query params as-is for now since they're typically simple key-value pairs

    next();
  } catch (error) {
    logger.error('Error transforming request', {
      error: error.message,
      stack: error.stack,
      path: req.path
    });
    
    // If transformation fails, continue with original request
    next();
  }
}

module.exports = transformRequest;

