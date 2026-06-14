/**
 * Standardized Error Handling Middleware
 * Provides consistent error response format across all routes
 */

const { logger } = require('./logger');

function mapPostgresDatabaseError(error) {
  if (error.code === '23505') {
    const constraintMatch = error.message.match(/constraint "([^"]+)"/);
    const constraintName = constraintMatch ? constraintMatch[1] : 'unique';
    return new Error(`Duplicate entry: ${constraintName} constraint violation`);
  }
  if (error.code === '23503') return new Error('Foreign key constraint violation');
  if (error.code === '23502') {
    const columnMatch = error.message.match(/column "([^"]+)"/);
    const columnName = columnMatch ? columnMatch[1] : 'column';
    return new Error(`Not null constraint violation on column: ${columnName}`);
  }
  if (error.code === '42P01') {
    const tableMatch = error.message.match(/relation "([^"]+)"/);
    const tableName = tableMatch ? tableMatch[1] : 'table';
    return new Error(`Table does not exist: ${tableName}`);
  }
  if (error.code === '42703') {
    const columnMatch = error.message.match(/column "([^"]+)"/);
    const columnName = columnMatch ? columnMatch[1] : 'column';
    return new Error(`Column does not exist: ${columnName}`);
  }
  return error;
}

/**
 * Safely get user ID from request (non-throwing version for error handler)
 * This avoids circular dependency with routeHelpers which imports ApiError
 * @param {Object} req - Express request object
 * @param {boolean} required - Ignored in this context, always returns null if not found
 * @returns {string|null} User ID or null
 */
function getUserId(req, required = false) {
  if (!req.user || !req.user.id) {
    return null;
  }
  return req.user.id;
}

/**
 * Error severity levels
 */
const ErrorSeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Error categories
 */
const ErrorCategory = {
  VALIDATION: 'validation',
  DATABASE: 'database',
  AUTH: 'authentication',
  AUTHORIZATION: 'authorization',
  NOT_FOUND: 'not_found',
  RATE_LIMIT: 'rate_limit',
  NETWORK: 'network',
  INTERNAL: 'internal',
  EXTERNAL: 'external'
};

/**
 * Standard error response format with enhanced structure
 */
class ApiError extends Error {
  constructor(
    statusCode,
    message,
    code = null,
    details = null,
    category = ErrorCategory.INTERNAL,
    severity = ErrorSeverity.MEDIUM,
    requestId = null,
    userId = null
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.category = category;
    this.severity = severity;
    this.requestId = requestId;
    this.userId = userId;
    this.timestamp = new Date().toISOString();
    this.name = 'ApiError';
  }

  /**
   * Create a validation error
   */
  static validation(message, details = null, code = 'VALIDATION_ERROR') {
    return new ApiError(
      400,
      message,
      code,
      details,
      ErrorCategory.VALIDATION,
      ErrorSeverity.LOW
    );
  }

  /**
   * Create a database error
   */
  static database(message, details = null, code = 'DATABASE_ERROR') {
    return new ApiError(
      500,
      message,
      code,
      details,
      ErrorCategory.DATABASE,
      ErrorSeverity.HIGH
    );
  }

  /**
   * Create an authentication error
   */
  static auth(message = 'Authentication required', code = 'AUTH_ERROR') {
    return new ApiError(
      401,
      message,
      code,
      null,
      ErrorCategory.AUTH,
      ErrorSeverity.MEDIUM
    );
  }

  /**
   * Create an authorization error
   */
  static forbidden(message = 'Access denied', code = 'FORBIDDEN') {
    return new ApiError(
      403,
      message,
      code,
      null,
      ErrorCategory.AUTHORIZATION,
      ErrorSeverity.MEDIUM
    );
  }

  /**
   * Create a not found error
   */
  static notFound(resource = 'Resource', code = 'NOT_FOUND') {
    return new ApiError(
      404,
      `${resource} not found`,
      code,
      null,
      ErrorCategory.NOT_FOUND,
      ErrorSeverity.LOW
    );
  }

  /**
   * Create a rate limit error
   */
  static rateLimit(message = 'Too many requests', retryAfter = null, code = 'RATE_LIMIT') {
    const details = retryAfter ? { retryAfter } : null;
    return new ApiError(
      429,
      message,
      code,
      details,
      ErrorCategory.RATE_LIMIT,
      ErrorSeverity.LOW
    );
  }

  /**
   * Create a conflict error (409)
   */
  static conflict(message, details = null, code = 'CONFLICT_ERROR') {
    return new ApiError(
      409,
      message,
      code,
      details,
      ErrorCategory.EXTERNAL,
      ErrorSeverity.MEDIUM
    );
  }

  /**
   * Create a bad request error (400)
   */
  static badRequest(message, details = null, code = 'BAD_REQUEST') {
    return new ApiError(
      400,
      message,
      code,
      details,
      ErrorCategory.VALIDATION,
      ErrorSeverity.LOW
    );
  }

  /**
   * Create a service unavailable error (503)
   */
  static serviceUnavailable(message = 'Service temporarily unavailable', details = null, code = 'SERVICE_UNAVAILABLE') {
    return new ApiError(
      503,
      message,
      code,
      details,
      ErrorCategory.NETWORK,
      ErrorSeverity.HIGH
    );
  }

  /**
   * Set request context
   */
  setContext(requestId, userId) {
    this.requestId = requestId;
    this.userId = userId;
    return this;
  }

  /**
   * Standard error response format (used by API)
   * Format: { success: false, error: 'message', code: 'CODE', details: {} }
   */
  toJSON() {
    return {
      success: false,
      error: this.message,
      ...(this.code && { code: this.code }),
      ...(this.details && { details: this.details })
    };
  }

  /**
   * Get detailed error format (for logging/debugging)
   */
  toDetailedJSON() {
    return {
      success: false,
      error: this.message,
      code: this.code || 'INTERNAL_ERROR',
      category: this.category,
      severity: this.severity,
      timestamp: this.timestamp,
      ...(this.details && { details: this.details }),
      ...(this.requestId && { requestId: this.requestId })
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
 * Wrapped in try-catch to ensure it always returns JSON for API routes
 */
function errorHandler(err, req, res, next) {
  // Outer try-catch to ensure we always return JSON for API routes, even if handler fails
  try {
    // Safety check: ensure err is not null/undefined
    if (!err) {
      err = new Error('Unknown error occurred');
    }

    // Check if this is an API route
    const isApiRoute = req.path && req.path.startsWith('/api');

    // Check if response has already been sent
    if (res.headersSent) {
      logger.warn('Error occurred but response already sent', {
        error: err?.message || 'Unknown error',
        method: req?.method || 'UNKNOWN',
        url: req?.url || 'UNKNOWN'
      });
      // Once headers are sent, we cannot send another response
      // Delegate to Express default handler
      return next(err);
    }

    // Always set JSON content type for API routes
    // For non-API routes, still set JSON to ensure consistent error format
    if (isApiRoute) {
      res.type('application/json');
    }

    // Generate request ID if not present (with safety checks)
    const requestId = req?.id || req?.headers?.['x-request-id'] || require('uuid').v4();
    const userId = getUserId(req, false) || 'anonymous';

    // Safely extract error properties
    const errorMessage = err?.message || 'Internal server error';
    const errorStack = err?.stack || null;
    const errorCode = err?.code || 'UNKNOWN_ERROR';
    const errorCategory = err?.category || 'unknown';
    const errorSeverity = err?.severity || 'medium';

    // Log the error with enhanced context (with safety checks)
    try {
      logger.error('Request error', {
        error: errorMessage,
        stack: errorStack,
        method: req?.method || 'UNKNOWN',
        url: req?.url || 'UNKNOWN',
        userId: userId,
        ip: req?.ip || 'unknown',
        requestId: requestId,
        category: errorCategory,
        severity: errorSeverity,
        code: errorCode
      });
    } catch (logError) {
      // If logging fails, at least try to log minimal info
      console.error('Error logging failed:', logError?.message || 'Unknown logging error');
      console.error('Original error:', errorMessage);
    }

    // Handle known API errors
    if (err instanceof ApiError) {
      // Set context if not already set
      if (!err.requestId) {
        try {
          err.setContext(requestId, userId);
        } catch (contextError) {
          // If setting context fails, continue without it
          logger.warn('Failed to set error context', { error: contextError?.message });
        }
      }
      try {
        return res.status(err.statusCode || 500).json(err.toJSON());
      } catch (jsonError) {
        // If toJSON fails, return minimal error
        return res.status(err.statusCode || 500).json({
          success: false,
          error: err.message || 'Internal server error',
          code: err.code || 'INTERNAL_ERROR'
        });
      }
    }

    // Handle validation errors
    if (err?.name === 'ValidationError') {
      try {
        const apiError = ApiError.validation('Validation failed', err?.message || null, 'VALIDATION_ERROR');
        apiError.setContext(requestId, userId);
        return res.status(400).json(apiError.toJSON());
      } catch (validationError) {
        // If creating validation error fails, return minimal error
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR'
        });
      }
    }

    // Handle PostgreSQL errors
    // PostgreSQL errors have 5-character codes (e.g., 23505, 40P01) or connection error codes
    const isDatabaseEngineError = err?.code && typeof err.code === 'string' && (
      /^[0-9A-Z]{5}$/.test(err.code) || // 5-character PostgreSQL error codes
      err.code.startsWith('ECONN') || // Connection errors
      err.code === 'ETIMEDOUT' ||
      err.code === 'ENOTFOUND'
    );

    if (isDatabaseEngineError) {
      try {
        logger.error('PostgreSQL database error', { 
          error: errorMessage, 
          code: err.code,
          method: req?.method || 'UNKNOWN',
          url: req?.url || 'UNKNOWN',
          userId: userId,
          requestId: requestId
        });

        let mappedError;
        let errorMessageForResponse = errorMessage;
        try {
          mappedError = mapPostgresDatabaseError(err);
          errorMessageForResponse = mappedError?.message || errorMessage;
        } catch (mapError) {
          // If mapping fails, use original message
          logger.warn('Failed to map database error', { error: mapError?.message });
        }

        // Create appropriate database error based on PostgreSQL error code
        let apiError;
        if (err.code === '23505') {
          // unique_violation
          apiError = ApiError.database(
            'A record with this value already exists. Please use a different value.',
            process.env.NODE_ENV !== 'production' ? { pgCode: err.code, message: errorMessageForResponse } : null,
            'DATABASE_CONSTRAINT'
          );
        } else if (err.code === '23503') {
          // foreign_key_violation
          apiError = ApiError.database(
            'Database constraint violation. The operation conflicts with existing data.',
            process.env.NODE_ENV !== 'production' ? { pgCode: err.code, message: errorMessageForResponse } : null,
            'DATABASE_CONSTRAINT'
          );
        } else if (err.code === '23502') {
          // not_null_violation
          apiError = ApiError.validation(
            'Required field is missing.',
            process.env.NODE_ENV !== 'production' ? { pgCode: err.code, message: errorMessageForResponse } : null,
            'VALIDATION_ERROR'
          );
        } else if (err.code === '40P01' || err.code === '40001') {
          // deadlock_detected
          apiError = ApiError.database(
            'Database deadlock detected. Please try again in a moment.',
            { pgCode: err.code, retryable: true },
            'DATABASE_BUSY'
          );
        } else if (err.code === '57P01' || err.code === '57P02' || err.code === '57P03') {
          // connection termination errors
          apiError = ApiError.database(
            'Database connection lost. The system is attempting to reconnect. Please wait a moment and try again.',
            { pgCode: err.code, retryable: true, connectionIssue: true },
            'DATABASE_CONNECTION_LOST'
          );
        } else if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND' || err.code === 'ECONNRESET') {
          // Connection errors
          apiError = ApiError.database(
            'Unable to connect to database. The system is attempting to reconnect. Please wait a moment and try again.',
            { pgCode: err.code, retryable: true, connectionIssue: true },
            'DATABASE_CONNECTION_ERROR'
          );
        } else if (err.code === '42P01') {
          // undefined_table
          apiError = ApiError.database(
            'Database table does not exist. Please contact support.',
            process.env.NODE_ENV !== 'production' ? { pgCode: err.code, message: errorMessageForResponse } : null,
            'DATABASE_ERROR'
          );
        } else if (err.code === '42703') {
          // undefined_column
          apiError = ApiError.database(
            'Database schema error. Please contact support.',
            process.env.NODE_ENV !== 'production' ? { pgCode: err.code, message: errorMessageForResponse } : null,
            'DATABASE_ERROR'
          );
        } else {
          // Check if error message indicates connection termination
          const isConnectionTermination = errorMessageForResponse && (
            errorMessageForResponse.toLowerCase().includes('connection terminated') ||
            errorMessageForResponse.toLowerCase().includes('connection closed') ||
            errorMessageForResponse.toLowerCase().includes('connection lost') ||
            errorMessageForResponse.toLowerCase().includes('server closed the connection')
          );
          
          if (isConnectionTermination) {
            apiError = ApiError.database(
              'Database connection lost. The system is attempting to reconnect. Please wait a moment and try again.',
              { pgCode: err.code, retryable: true, connectionIssue: true },
              'DATABASE_CONNECTION_LOST'
            );
          } else {
            // Generic PostgreSQL error
            apiError = ApiError.database(
              'Database error occurred',
              process.env.NODE_ENV !== 'production' ? { pgCode: err.code, message: errorMessageForResponse } : null,
              'DATABASE_ERROR'
            );
          }
        }
        
        apiError.setContext(requestId, userId);
        return res.status(500).json(apiError.toJSON());
      } catch (pgError) {
        // If PostgreSQL error handling fails, return minimal error
        return res.status(500).json({
          success: false,
          error: 'Database error occurred',
          code: 'DATABASE_ERROR'
        });
      }
    }

    // Default error response - convert to ApiError format
    try {
      const statusCode = err?.statusCode || 500;
      const message = process.env.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : (errorMessage || 'Internal server error');

      const apiError = new ApiError(
        statusCode,
        message,
        'INTERNAL_ERROR',
        process.env.NODE_ENV !== 'production' && errorStack ? { stack: errorStack } : null,
        ErrorCategory.INTERNAL,
        ErrorSeverity.HIGH
      );
      apiError.setContext(requestId, userId);
      
      return res.status(statusCode).json(apiError.toJSON());
    } catch (defaultError) {
      // If default error handling fails, return minimal error
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  } catch (handlerError) {
    // Error handler itself failed - ensure API routes get JSON
    const isApiRoute = req?.path && req.path.startsWith('/api');
    
    // Log the handler error
    try {
      logger.error('Error handler failed', {
        error: handlerError?.message || 'Unknown handler error',
        stack: handlerError?.stack,
        originalError: err?.message || 'Unknown original error',
        method: req?.method || 'UNKNOWN',
        url: req?.url || 'UNKNOWN'
      });
    } catch (logError) {
      // If even logging fails, use console
      console.error('Error handler failed and logging failed:', handlerError?.message || 'Unknown error');
    }

    // For API routes, always return JSON even if handler failed
    if (isApiRoute && !res.headersSent) {
      try {
        res.type('application/json');
        res.status(500).json({
          success: false,
          error: 'Internal server error',
          code: 'ERROR_HANDLER_FAILED'
        });
        return;
      } catch (sendError) {
        // If sending response fails, delegate to Express
        // But this should rarely happen
      }
    }

    // For non-API routes or if we can't send JSON, delegate to Express default handler
    // This allows Express to handle non-API routes with its default behavior
    return next(handlerError);
  }
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
  ErrorSeverity,
  ErrorCategory,
  createErrorResponse,
  errorHandler,
  asyncHandler
};

