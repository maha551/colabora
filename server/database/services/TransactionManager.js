/**
 * Database Transaction Manager
 * Provides a clean interface for executing database operations within transactions
 * 
 * NOTE: This now delegates to KnexTransactionManager for backward compatibility.
 * New code should use KnexTransactionManager directly.
 */
const KnexTransactionManager = require('./KnexTransactionManager');

class TransactionManager {
  /**
   * Execute operations within a database transaction
   * @param {Object} knex - Knex instance
   * @param {Function} operations - Async function that receives the transaction object
   * @param {Object} options - Transaction options
   * @param {number} options.timeout - Transaction timeout in milliseconds (default: 30000)
   * @param {string} options.isolationLevel - Transaction isolation level (default: 'READ COMMITTED')
   * @returns {Promise<any>} Result of the operations
   */
  static async executeInTransaction(knex, operations, options = {}) {
    return KnexTransactionManager.executeInTransaction(knex, operations, options);
  }

  /**
   * Execute multiple operations atomically
   * @param {Object} knex - Knex instance
   * @param {Array<Function>} operationFunctions - Array of async functions
   * @returns {Promise<Array>} Results of all operations
   */
  static async executeMultipleInTransaction(knex, operationFunctions) {
    return KnexTransactionManager.executeMultipleInTransaction(knex, operationFunctions);
  }

  /**
   * Execute operations with automatic rollback on any failure
   * @param {Object} knex - Knex instance
   * @param {Array<Object>} operations - Array of operation objects with {sql, params, description}
   * @returns {Promise<Array>} Results of all operations
   */
  static async executeBatchInTransaction(knex, operations) {
    return KnexTransactionManager.executeBatchInTransaction(knex, operations);
  }

  /**
   * Query helper that can be used within transactions
   * @param {Object} knexOrTrx - Knex instance or transaction object
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<any>} Query result (single row)
   */
  static async query(knexOrTrx, sql, params = []) {
    return KnexTransactionManager.query(knexOrTrx, sql, params);
  }

  /**
   * Query all helper that can be used within transactions
   * @param {Object} knexOrTrx - Knex instance or transaction object
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Array>} Query results (all rows)
   */
  static async queryAll(knexOrTrx, sql, params = []) {
    return KnexTransactionManager.queryAll(knexOrTrx, sql, params);
  }

  /**
   * Execute helper (INSERT, UPDATE, DELETE)
   * @param {Object} knexOrTrx - Knex instance or transaction object
   * @param {string} sql - SQL statement
   * @param {Array} params - Statement parameters
   * @returns {Promise<Object>} Execution result with changes and lastID
   */
  static async execute(knexOrTrx, sql, params = []) {
    return KnexTransactionManager.execute(knexOrTrx, sql, params);
  }
}

module.exports = TransactionManager;

