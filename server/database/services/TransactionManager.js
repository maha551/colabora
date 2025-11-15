/**
 * Database Transaction Manager
 * Provides a clean interface for executing database operations within transactions
 */
class TransactionManager {
  /**
   * Execute operations within a database transaction
   * @param {Object} db - SQLite database instance
   * @param {Function} operations - Async function that receives the db instance
   * @returns {Promise<any>} Result of the operations
   */
  static async executeInTransaction(db, operations) {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION', (beginErr) => {
          if (beginErr) {
            reject(new Error(`Failed to begin transaction: ${beginErr.message}`));
            return;
          }

          // Execute the operations
          operations(db)
            .then((result) => {
              // Commit the transaction
              db.run('COMMIT', (commitErr) => {
                if (commitErr) {
                  db.run('ROLLBACK', () => {
                    reject(new Error(`Failed to commit transaction: ${commitErr.message}`));
                  });
                } else {
                  resolve(result);
                }
              });
            })
            .catch((error) => {
              // Rollback on error
              db.run('ROLLBACK', () => {
                reject(error);
              });
            });
        });
      });
    });
  }

  /**
   * Execute multiple operations atomically
   * @param {Object} db - SQLite database instance
   * @param {Array<Function>} operationFunctions - Array of async functions
   * @returns {Promise<Array>} Results of all operations
   */
  static async executeMultipleInTransaction(db, operationFunctions) {
    return this.executeInTransaction(db, async (db) => {
      const results = [];
      for (const operation of operationFunctions) {
        const result = await operation(db);
        results.push(result);
      }
      return results;
    });
  }

  /**
   * Execute operations with automatic rollback on any failure
   * @param {Object} db - SQLite database instance
   * @param {Array<Object>} operations - Array of operation objects with {sql, params, description}
   * @returns {Promise<Array>} Results of all operations
   */
  static async executeBatchInTransaction(db, operations) {
    return this.executeInTransaction(db, async (db) => {
      const results = [];

      for (const operation of operations) {
        const { sql, params = [], description = 'Database operation' } = operation;

        try {
          const result = await new Promise((resolve, reject) => {
            db.run(sql, params, function(err) {
              if (err) {
                reject(new Error(`${description} failed: ${err.message}`));
              } else {
                resolve({ changes: this.changes, lastID: this.lastID });
              }
            });
          });
          results.push(result);
        } catch (error) {
          throw new Error(`${description} failed: ${error.message}`);
        }
      }

      return results;
    });
  }

  /**
   * Query helper that can be used within transactions
   * @param {Object} db - SQLite database instance
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<any>} Query result
   */
  static async query(db, sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) {
          reject(new Error(`Query failed: ${err.message}`));
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * Query all helper that can be used within transactions
   * @param {Object} db - SQLite database instance
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Array>} Query results
   */
  static async queryAll(db, sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(new Error(`Query all failed: ${err.message}`));
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Execute helper that can be used within transactions
   * @param {Object} db - SQLite database instance
   * @param {string} sql - SQL statement
   * @param {Array} params - Statement parameters
   * @returns {Promise<Object>} Execution result with changes and lastID
   */
  static async execute(db, sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) {
          reject(new Error(`Execute failed: ${err.message}`));
        } else {
          resolve({ changes: this.changes, lastID: this.lastID });
        }
      });
    });
  }
}

module.exports = TransactionManager;

