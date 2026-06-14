/**
 * Database Query Helper Utilities
 * 
 * Standardizes database query execution patterns across route handlers.
 * Builds on TransactionManager and integrates with routeHelpers for error handling.
 * 
 * Usage:
 *   const { queryOne, queryAll, executeInTransaction } = require('../utils/queryHelpers');
 *   const document = await queryOne(db, query, params, errorContext);
 */

const TransactionManager = require('../database/services/TransactionManager');
const { executeQuery, executeQueryAll, executeUpdate, handleRouteOperation } = require('./routeHelpers');

/**
 * Execute a single row query
 * 
 * @param {Object} db - Database connection
 * @param {string} query - SQL query string
 * @param {Array} params - Query parameters
 * @param {Object} errorContext - Error context for logging and user messages
 * @returns {Promise<Object|null>} Single row result or null
 * @throws {ApiError} Standardized API error
 * 
 * @example
 * const document = await queryOne(
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
async function queryOne(db, query, params, errorContext) {
  return executeQuery(db, query, params, errorContext);
}

/**
 * Execute a multiple row query
 * 
 * @param {Object} db - Database connection
 * @param {string} query - SQL query string
 * @param {Array} params - Query parameters
 * @param {Object} errorContext - Error context for logging and user messages
 * @returns {Promise<Array>} Array of row results
 * @throws {ApiError} Standardized API error
 * 
 * @example
 * const documents = await queryAll(
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
async function queryAll(db, query, params, errorContext) {
  return executeQueryAll(db, query, params, errorContext);
}

/**
 * Execute a database update operation (INSERT, UPDATE, DELETE)
 * 
 * @param {Object} db - Database connection
 * @param {string} sql - SQL statement
 * @param {Array} params - Query parameters
 * @param {Object} errorContext - Error context for logging and user messages
 * @returns {Promise<Object>} Result with changes and lastID
 * @throws {ApiError} Standardized API error
 * 
 * @example
 * const result = await execute(
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
async function execute(db, sql, params, errorContext) {
  return executeUpdate(db, sql, params, errorContext);
}

/**
 * Execute operations within a database transaction
 * 
 * @param {Object} db - Database connection
 * @param {Function} operation - Async function that receives the db instance
 * @param {Object} errorContext - Error context for logging and user messages
 * @returns {Promise<any>} Result of the operation
 * @throws {ApiError} Standardized API error
 * 
 * @example
 * const result = await executeInTransaction(
 *   db,
 *   async (txDb) => {
 *     const doc = await queryOne(txDb, 'SELECT * FROM documents WHERE id = ?', [id], errorContext);
 *     await execute(txDb, 'UPDATE documents SET title = ? WHERE id = ?', [newTitle, id], errorContext);
 *     return doc;
 *   },
 *   {
 *     message: 'Error in transaction',
 *     context: { documentId },
 *     userMessage: 'Failed to complete operation',
 *     code: 'TRANSACTION_ERROR'
 *   }
 * );
 */
async function executeInTransaction(db, operation, errorContext) {
  return handleRouteOperation(
    () => TransactionManager.executeInTransaction(db, operation),
    errorContext
  );
}

/**
 * Execute multiple operations atomically within a transaction
 * 
 * @param {Object} db - Database connection
 * @param {Array<Function>} operations - Array of async functions to execute
 * @param {Object} errorContext - Error context for logging and user messages
 * @returns {Promise<Array>} Results of all operations
 * @throws {ApiError} Standardized API error
 * 
 * @example
 * const results = await executeMultipleInTransaction(
 *   db,
 *   [
 *     (txDb) => queryOne(txDb, 'SELECT * FROM documents WHERE id = ?', [id1], errorContext),
 *     (txDb) => queryOne(txDb, 'SELECT * FROM documents WHERE id = ?', [id2], errorContext),
 *   ],
 *   {
 *     message: 'Error in transaction',
 *     context: { documentIds: [id1, id2] },
 *     userMessage: 'Failed to fetch documents',
 *     code: 'TRANSACTION_ERROR'
 *   }
 * );
 */
async function executeMultipleInTransaction(db, operations, errorContext) {
  return handleRouteOperation(
    () => TransactionManager.executeMultipleInTransaction(db, operations),
    errorContext
  );
}

module.exports = {
  queryOne,
  queryAll,
  execute,
  executeInTransaction,
  executeMultipleInTransaction
};

