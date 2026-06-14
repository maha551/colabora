/**
 * Database Helper Utilities
 * 
 * Provides common database-related helper functions to reduce code duplication.
 * 
 * Usage:
 *   const { requireDatabase } = require('../utils/dbHelpers');
 *   const db = requireDatabase(req.app.locals.db, 'fetching documents');
 */

const { ApiError } = require('../middleware/errorHandler');

/**
 * Check if database is available, throw error if not
 * @param {Object} db - Database connection
 * @param {string} context - Context for error message (e.g., 'fetching documents')
 * @returns {Object} Database connection (if available)
 * @throws {ApiError} If database is unavailable
 */
function requireDatabase(db, context = 'operation') {
  if (!db) {
    throw ApiError.database(
      `Database unavailable for ${context}`,
      null,
      'DATABASE_UNAVAILABLE'
    );
  }
  return db;
}

module.exports = {
  requireDatabase
};

