/**
 * Standardized Error Handling Middleware
 * Provides consistent error response format across all routes
 */

const { logger } = require('./logger');

/**
 * Standard error response format
 */
class ApiError extends Error {
  constructor(statusCode, message, code = null, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.name = 'ApiError';
  }

  toJSON() {
    return {
      error: this.message,
      ...(this.code && { code: this.code }),
      ...(this.details && { details: this.details })
    };
  }
}

/**
 * Create standardized error response
 */
function createErrorResponse(statusCode, message, code = null, details = null) {
  return {
    statusCode,
    body: {
      error: message,
      ...(code && { code }),
      ...(details && { details })
    }
  };
}

/**
 * Express error handling middleware
 * Should be used as the last middleware in the app
 */
function errorHandler(err, req, res, next) {
  // Log the error
  logger.error('Request error', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.url,
    userId: req.user?.id || 'anonymous',
    ip: req.ip
  });

  // Handle known API errors
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json(err.toJSON());
  }

  // Handle validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.message
    });
  }

  // Handle database errors
  if (err.code && err.code.startsWith('SQLITE_')) {
    logger.error('Database error', { error: err.message, code: err.code });
    return res.status(500).json({
      error: 'Database error occurred',
      code: 'DATABASE_ERROR'
    });
  }

  // Default error response
  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message;

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
}

/**
 * Async route wrapper to catch errors
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  ApiError,
  createErrorResponse,
  errorHandler,
  asyncHandler
};

