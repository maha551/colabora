const { logger } = require('../../middleware/logger');

/**
 * Knex Transaction Manager
 * Provides transaction management with isolation levels and timeouts
 */
class KnexTransactionManager {
  /**
   * Execute operations within a database transaction
   * @param {Object} knex - Knex instance
   * @param {Function} operations - Async function that receives the transaction object
   * @param {Object} options - Transaction options
   * @param {string} options.isolationLevel - Transaction isolation level (read committed, serializable, etc.)
   * @param {number} options.timeout - Transaction timeout in milliseconds (default: 30000)
   * @returns {Promise<any>} Result of the operations
   */
  static async executeInTransaction(knex, operations, options = {}) {
    const {
      isolationLevel = 'read committed',
      timeout = 30000
    } = options;

    // Knex/PostgreSQL expect lowercase: "read uncommitted", "read committed", "snapshot", "repeatable read", "serializable"
    const normalizedLevel = typeof isolationLevel === 'string' ? isolationLevel.toLowerCase() : isolationLevel;

    if (normalizedLevel !== 'read committed') {
      // Use custom isolation level for PostgreSQL
      // Knex expects transaction(container, config) - callback first, config second
      return await knex.transaction(async (trx) => {
        return await this.executeWithTimeout(trx, operations, timeout);
      }, { isolationLevel: normalizedLevel });
    } else {
      // Default transaction (READ COMMITTED in PostgreSQL)
      return await knex.transaction(async (trx) => {
        return await this.executeWithTimeout(trx, operations, timeout);
      });
    }
  }

  /**
   * Execute operations with timeout
   * @param {Object} trx - Transaction object
   * @param {Function} operations - Async function
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<any>}
   */
  static async executeWithTimeout(trx, operations, timeout) {
    try {
      // Set statement timeout for this transaction (milliseconds)
      await trx.raw(`SET LOCAL statement_timeout = ${timeout}`);
      return await operations(trx);
    } catch (error) {
      if (error.message && error.message.includes('canceling statement due to statement timeout')) {
        throw new Error(`Transaction timeout after ${timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Query helper that can be used within transactions
   * @param {Object} knexOrTrx - Knex instance or transaction object
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<any>} Query result (single row)
   */
  static async query(knexOrTrx, sql, params = []) {
    try {
      const result = await knexOrTrx.raw(sql, params);
      
      // Handle different result formats
      if (result.rows && Array.isArray(result.rows)) {
        // PostgreSQL format
        return result.rows[0] || null;
      } else if (result && typeof result === 'object') {
        // Single object result
        return result;
      }
      
      return null;
    } catch (error) {
      // Defensive error handling - error might be undefined or null in some edge cases
      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      const errorCode = error?.code;
      
      // Use errorMessage instead of error to avoid winston's error formatter issues
      // Also make logger call defensive in case logger is undefined
      if (logger && typeof logger.error === 'function') {
        try {
          logger.error('TransactionManager.query error', {
            errorMessage: errorMessage,
            errorCode: errorCode,
            errorType: error?.constructor?.name || typeof error,
            sql: sql ? sql.substring(0, 100) : 'N/A',
            params: params ? params.length : 0,
            hasError: !!error,
            stack: error?.stack
          });
        } catch (logError) {
          // If logging fails, at least log to console as fallback
          console.error('TransactionManager.query error:', errorMessage, { errorCode, sql: sql?.substring(0, 100) });
        }
      }
      
      // Re-throw the error, or create a new one if error is undefined/null
      if (error) {
        throw error;
      } else {
        throw new Error(`Database query failed: ${errorMessage}`);
      }
    }
  }

  /**
   * Query all helper that can be used within transactions
   * @param {Object} knexOrTrx - Knex instance or transaction object
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Array>} Query results (all rows)
   */
  static async queryAll(knexOrTrx, sql, params = []) {
    try {
      const result = await knexOrTrx.raw(sql, params);
      
      // Handle different result formats
      if (result.rows && Array.isArray(result.rows)) {
        // PostgreSQL format
        return result.rows;
      }
      
      return [];
    } catch (error) {
      // Defensive error handling - error might be undefined or null in some edge cases
      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      const errorCode = error?.code;
      
      // Use errorMessage instead of error to avoid winston's error formatter issues
      // Also make logger call defensive in case logger is undefined
      if (logger && typeof logger.error === 'function') {
        try {
          logger.error('TransactionManager.queryAll error', {
            errorMessage: errorMessage,
            errorCode: errorCode,
            errorType: error?.constructor?.name || typeof error,
            sql: sql ? sql.substring(0, 100) : 'N/A',
            params: params ? params.length : 0,
            hasError: !!error,
            stack: error?.stack
          });
        } catch (logError) {
          // If logging fails, at least log to console as fallback
          console.error('TransactionManager.queryAll error:', errorMessage, { errorCode, sql: sql?.substring(0, 100) });
        }
      }
      
      // Re-throw the error, or create a new one if error is undefined/null
      if (error) {
        throw error;
      } else {
        throw new Error(`Database queryAll failed: ${errorMessage}`);
      }
    }
  }

  /**
   * Execute helper (INSERT, UPDATE, DELETE)
   * @param {Object} knexOrTrx - Knex instance or transaction object
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Object>} Execution result with changes and lastID
   */
  static async execute(knexOrTrx, sql, params = []) {
    try {
      const result = await knexOrTrx.raw(sql, params);
      return {
        changes: result.rowCount || 0,
        lastID: null // Use RETURNING clause to get last ID
      };
    } catch (error) {
      // Defensive error handling - error might be undefined or null in some edge cases
      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      const errorCode = error?.code;
      
      // Use errorMessage instead of error to avoid winston's error formatter issues
      // Also make logger call defensive in case logger is undefined
      if (logger && typeof logger.error === 'function') {
        try {
          logger.error('TransactionManager.execute error', {
            errorMessage: errorMessage,
            errorCode: errorCode,
            errorType: error?.constructor?.name || typeof error,
            sql: sql ? sql.substring(0, 100) : 'N/A',
            params: params ? params.length : 0,
            hasError: !!error,
            stack: error?.stack
          });
        } catch (logError) {
          // If logging fails, at least log to console as fallback
          console.error('TransactionManager.execute error:', errorMessage, { errorCode, sql: sql?.substring(0, 100) });
        }
      }
      
      // Re-throw the error, or create a new one if error is undefined/null
      if (error) {
        throw error;
      } else {
        throw new Error(`Database execute failed: ${errorMessage}`);
      }
    }
  }

  /**
   * Execute multiple operations atomically
   * @param {Object} knex - Knex instance
   * @param {Array<Function>} operationFunctions - Array of async functions
   * @param {Object} options - Transaction options
   * @returns {Promise<Array>} Results of all operations
   */
  static async executeMultipleInTransaction(knex, operationFunctions, options = {}) {
    return await this.executeInTransaction(knex, async (trx) => {
      const results = [];
      for (const operation of operationFunctions) {
        const result = await operation(trx);
        results.push(result);
      }
      return results;
    }, options);
  }

  /**
   * Execute batch operations with automatic rollback on any failure
   * @param {Object} knex - Knex instance
   * @param {Array<Object>} operations - Array of operation objects with {sql, params, description}
   * @param {Object} options - Transaction options
   * @returns {Promise<Array>} Results of all operations
   */
  static async executeBatchInTransaction(knex, operations, options = {}) {
    return await this.executeInTransaction(knex, async (trx) => {
      const results = [];
      
      for (const operation of operations) {
        const { sql, params = [], description = 'Database operation' } = operation;
        
        try {
          const result = await this.execute(trx, sql, params);
          results.push(result);
        } catch (error) {
          const errorMessage = error?.message || error?.toString() || 'Unknown error';
          throw new Error(`${description} failed: ${errorMessage}`);
        }
      }
      
      return results;
    }, options);
  }
}

// Export as both names for backward compatibility
module.exports = KnexTransactionManager;
module.exports.TransactionManager = KnexTransactionManager;

