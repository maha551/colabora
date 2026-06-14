/**
 * Route Handler Helper Utilities
 * 
 * Standardizes error handling patterns across route handlers.
 * Builds on the existing ApiError class from middleware/errorHandler.js
 * 
 * Usage:
 *   const { handleRouteOperation, executeQuery } = require('../utils/routeHelpers');
 *   const result = await executeQuery(db, query, params, errorContext);
 */

const { ApiError } = require('../middleware/errorHandler');
const { logger } = require('../middleware/logger');
const TransactionManager = require('../database/services/TransactionManager');

/**
 * Error context object structure
 * @typedef {Object} ErrorContext
 * @property {string} message - Error message for logging
 * @property {Object} context - Additional context for logging (userId, documentId, etc.)
 * @property {string} userMessage - User-friendly error message
 * @property {string} [code] - Optional error code
 */

/**
 * Execute a database query with standardized error handling
 * 
 * @param {Object} db - Database connection
 * @param {string} query - SQL query string
 * @param {Array} params - Query parameters
 * @param {ErrorContext} errorContext - Error context for logging and user messages
 * @returns {Promise<Object>} Single row result
 * @throws {ApiError} Standardized API error
 * 
 * @example
 * const document = await executeQuery(
 *   db,
 *   'SELECT * FROM documents WHERE id = ?',
 *   [documentId],
 *   {
 *     message: 'Error fetching document',
 *     context: { documentId, userId },
 *     userMessage: 'Failed to fetch document',
 *     code: 'DOCUMENT_FETCH_ERROR'
 *   }
 * );
 */
async function executeQuery(db, query, params, errorContext) {
  try {
    const result = await TransactionManager.query(db, query, params);
    return result;
  } catch (err) {
    // If it's already an ApiError, re-throw it
    if (err instanceof ApiError) {
      throw err;
    }

    // Log the error with context
    logger.error(errorContext.message, {
      error: err.message,
      stack: err.stack,
      ...errorContext.context
    });

    // Create standardized error
    throw ApiError.database(
      errorContext.userMessage || 'Database operation failed',
      { originalError: err.message },
      errorContext.code || 'DATABASE_ERROR'
    );
  }
}

/**
 * Execute a database query that returns multiple rows
 * 
 * @param {Object} db - Database connection
 * @param {string} query - SQL query string
 * @param {Array} params - Query parameters
 * @param {ErrorContext} errorContext - Error context for logging and user messages
 * @returns {Promise<Array>} Array of row results
 * @throws {ApiError} Standardized API error
 * 
 * @example
 * const documents = await executeQueryAll(
 *   db,
 *   'SELECT * FROM documents WHERE owner_id = ?',
 *   [userId],
 *   {
 *     message: 'Error fetching documents',
 *     context: { userId },
 *     userMessage: 'Failed to fetch documents',
 *     code: 'DOCUMENTS_FETCH_ERROR'
 *   }
 * );
 */
async function executeQueryAll(db, query, params, errorContext) {
  try {
    const result = await TransactionManager.queryAll(db, query, params);
    return result;
  } catch (err) {
    // If it's already an ApiError, re-throw it
    if (err instanceof ApiError) {
      throw err;
    }

    // Log the error with context
    logger.error(errorContext.message, {
      error: err.message,
      stack: err.stack,
      ...errorContext.context
    });

    // Create standardized error
    throw ApiError.database(
      errorContext.userMessage || 'Database operation failed',
      { originalError: err.message },
      errorContext.code || 'DATABASE_ERROR'
    );
  }
}

/**
 * Execute a database operation (INSERT, UPDATE, DELETE) with standardized error handling
 * 
 * @param {Object} db - Database connection
 * @param {string} sql - SQL statement
 * @param {Array} params - Query parameters
 * @param {ErrorContext} errorContext - Error context for logging and user messages
 * @returns {Promise<Object>} Result with changes and lastID
 * @throws {ApiError} Standardized API error
 * 
 * @example
 * const result = await executeUpdate(
 *   db,
 *   'UPDATE documents SET title = ? WHERE id = ?',
 *   [newTitle, documentId],
 *   {
 *     message: 'Error updating document',
 *     context: { documentId, userId },
 *     userMessage: 'Failed to update document',
 *     code: 'DOCUMENT_UPDATE_ERROR'
 *   }
 * );
 */
async function executeUpdate(db, sql, params, errorContext) {
  try {
    const result = await TransactionManager.execute(db, sql, params);
    return result;
  } catch (err) {
    // If it's already an ApiError, re-throw it
    if (err instanceof ApiError) {
      throw err;
    }

    // Log the error with context
    logger.error(errorContext.message, {
      error: err.message,
      stack: err.stack,
      ...errorContext.context
    });

    // Create standardized error
    throw ApiError.database(
      errorContext.userMessage || 'Database operation failed',
      { originalError: err.message },
      errorContext.code || 'DATABASE_ERROR'
    );
  }
}

/**
 * Execute an operation with standardized error handling
 * Useful for non-database operations or complex multi-step operations
 * 
 * @param {Function} operation - Async function to execute
 * @param {ErrorContext} errorContext - Error context for logging and user messages
 * @returns {Promise<any>} Result of the operation
 * @throws {ApiError} Standardized API error
 * 
 * @example
 * const result = await handleRouteOperation(
 *   async () => {
 *     // Complex operation
 *     const doc = await fetchDocument();
 *     await updateRelatedData(doc);
 *     return doc;
 *   },
 *   {
 *     message: 'Error processing document',
 *     context: { documentId },
 *     userMessage: 'Failed to process document',
 *     code: 'DOCUMENT_PROCESS_ERROR'
 *   }
 * );
 */
async function handleRouteOperation(operation, errorContext) {
  try {
    const result = await operation();
    return result;
  } catch (err) {
    // If it's already an ApiError, re-throw it
    if (err instanceof ApiError) {
      throw err;
    }

    // Log the error with context
    logger.error(errorContext.message, {
      error: err.message,
      stack: err.stack,
      ...errorContext.context
    });

    // Determine error type and create appropriate ApiError
    let apiError;
    if (err.message && err.message.includes('not found')) {
      apiError = ApiError.notFound(
        errorContext.userMessage || 'Resource not found',
        errorContext.code || 'NOT_FOUND'
      );
    } else if (err.message && err.message.includes('permission') || err.message.includes('access')) {
      apiError = ApiError.forbidden(
        errorContext.userMessage || 'Access denied',
        errorContext.code || 'FORBIDDEN'
      );
    } else {
      apiError = ApiError.database(
        errorContext.userMessage || 'Operation failed',
        { originalError: err.message },
        errorContext.code || 'OPERATION_ERROR'
      );
    }

    throw apiError;
  }
}

/**
 * Validate request data with standardized error handling
 * 
 * @param {Object} data - Data to validate
 * @param {Function|Object} validator - Validation function or schema
 * @param {ErrorContext} errorContext - Error context for logging and user messages
 * @returns {Object} Validated data
 * @throws {ApiError} Standardized validation error
 * 
 * @example
 * const validatedData = validateRequestData(
 *   req.body,
 *   (data) => {
 *     if (!data.title) throw new Error('Title is required');
 *     return data;
 *   },
 *   {
 *     message: 'Validation failed',
 *     context: { userId },
 *     userMessage: 'Invalid input data',
 *     code: 'VALIDATION_ERROR'
 *   }
 * );
 */
function validateRequestData(data, validator, errorContext) {
  try {
    if (typeof validator === 'function') {
      return validator(data);
    }
    // If validator is an object (schema), you could integrate with a validation library here
    return data;
  } catch (err) {
    // If it's already an ApiError, re-throw it
    if (err instanceof ApiError) {
      throw err;
    }

    // Log the validation error
    logger.warn(errorContext.message, {
      error: err.message,
      ...errorContext.context
    });

    // Create validation error
    throw ApiError.validation(
      errorContext.userMessage || err.message || 'Validation failed',
      { originalError: err.message },
      errorContext.code || 'VALIDATION_ERROR'
    );
  }
}

/**
 * Convert legacy error response pattern to ApiError
 * Helper for migrating old error patterns to standardized ApiError
 * 
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @param {string} [code] - Optional error code
 * @param {Object} [details] - Optional error details
 * @returns {ApiError} Standardized API error
 * 
 * @example
 * // Old: return res.status(400).json({ error: 'Invalid input' });
 * // New: return next(convertToApiError(400, 'Invalid input', 'INVALID_INPUT'));
 */
function convertToApiError(statusCode, message, code = null, details = null) {
  switch (statusCode) {
    case 400:
      return ApiError.validation(message, details, code || 'VALIDATION_ERROR');
    case 401:
      return ApiError.auth(message, code || 'AUTH_ERROR');
    case 403:
      return ApiError.forbidden(message, code || 'FORBIDDEN');
    case 404:
      return ApiError.notFound(message, code || 'NOT_FOUND');
    case 409:
      return ApiError.validation(message, details, code || 'CONFLICT_ERROR');
    case 429:
      return ApiError.rateLimit(message, null, code || 'RATE_LIMIT');
    case 500:
    default:
      return ApiError.database(message, details, code || 'INTERNAL_ERROR');
  }
}

/**
 * Safely get user ID from request, with optional fallback
 * @param {Object} req - Express request object
 * @param {boolean} required - If true, throw error if user not found
 * @returns {string|null} User ID or null
 * @throws {ApiError} If required and user not found
 * 
 * @example
 * const userId = getUserId(req); // Throws if not authenticated
 * const userId = getUserId(req, false); // Returns null if not authenticated
 */
function getUserId(req, required = true) {
  if (!req.user || !req.user.id) {
    if (required) {
      throw ApiError.auth('Authentication required', 'NOT_AUTHENTICATED');
    }
    return null;
  }
  return req.user.id;
}

/**
 * Check if comments table has new polymorphic schema (commentable_type, commentable_id)
 * 
 * @param {Object} db - Database connection
 * @returns {Promise<boolean>} True if new schema exists, false otherwise
 */
async function hasNewCommentSchema(db) {
  try {
    const columnCheck = await TransactionManager.queryAll(db, `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'comments'
        AND column_name = 'commentable_type'
    `);
    return columnCheck && columnCheck.length > 0;
  } catch (err) {
    logger.warn('Could not check comments table schema, assuming new schema', { error: err.message });
    return true; // Assume new schema to be safe
  }
}

module.exports = {
  executeQuery,
  executeQueryAll,
  executeUpdate,
  handleRouteOperation,
  validateRequestData,
  convertToApiError,
  getUserId,
  hasNewCommentSchema
};

