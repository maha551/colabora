/**
 * Response Transformation Middleware
 * Automatically transforms API responses to camelCase and normalizes booleans
 */

const { transformForApi } = require('../utils/dataTransform');
const { logger } = require('./logger');

/**
 * Middleware to transform response data before sending
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function transformResponse(req, res, next) {
  // Store original json method
  const originalJson = res.json.bind(res);

  // Override json method to transform data
  res.json = function(data) {
    try {
      // Transform the response data
      const transformed = transformForApi(data);
      
      // Call original json method with transformed data
      return originalJson(transformed);
    } catch (error) {
      logger.error('Error transforming response', {
        error: error.message,
        stack: error.stack,
        path: req.path
      });
      
      // If transformation fails, send original data
      return originalJson(data);
    }
  };

  next();
}

module.exports = transformResponse;

