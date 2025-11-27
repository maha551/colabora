const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { logger } = require('../middleware/logger');

/**
 * Database Connection Manager
 * Centralizes database setup and provides a clean interface for database operations
 */
class DatabaseConnection {
  constructor(config) {
    this.config = config;
    this.db = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the database connection
   * @returns {Promise<Object>} SQLite database instance
   */
  async initialize() {
    return new Promise((resolve, reject) => {
      try {
        const dbPath = this.config.DATABASE_URL;

        // Ensure database directory exists
        const dbDir = path.dirname(dbPath);
        if (!fs.existsSync(dbDir)) {
          fs.mkdirSync(dbDir, { recursive: true });
        }

        this.db = new sqlite3.Database(dbPath, (err) => {
          if (err) {
            reject(new Error(`Failed to connect to database: ${err.message}`));
          } else {
            logger.info('Connected to database', { dbPath });
            this.isInitialized = true;
            resolve(this.db);
          }
        });

        // Set up error handling
        this.db.on('error', (err) => {
          logger.error('Database error', { error: err.message, stack: err.stack });
        });

        // Enable foreign keys
        this.db.run('PRAGMA foreign_keys = ON');

        // Set up connection pooling settings
        if (this.config.DB_POOL) {
          this.db.configure('busyTimeout', 5000);
        }

      } catch (error) {
        reject(new Error(`Database initialization failed: ${error.message}`));
      }
    });
  }

  /**
   * Get the database instance
   * @returns {Object} SQLite database instance
   */
  getInstance() {
    if (!this.isInitialized || !this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Close the database connection
   * @returns {Promise<void>}
   */
  async close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            reject(new Error(`Failed to close database: ${err.message}`));
          } else {
            logger.info('Database connection closed');
            this.isInitialized = false;
            this.db = null;
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Check if database is healthy
   * @returns {Promise<boolean>} Health status
   */
  async isHealthy() {
    if (!this.isInitialized || !this.db) {
      return false;
    }

    return new Promise((resolve) => {
      this.db.get('SELECT 1', (err, row) => {
        resolve(!err && row !== undefined);
      });
    });
  }

  /**
   * Execute a query with promise wrapper
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<any>} Query result
   */
  query(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.getInstance().get(sql, params, (err, row) => {
        if (err) {
          reject(new Error(`Query failed: ${err.message}`));
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * Execute a query that returns all rows
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Array>} Query results
   */
  queryAll(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.getInstance().all(sql, params, (err, rows) => {
        if (err) {
          reject(new Error(`Query all failed: ${err.message}`));
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Execute a statement
   * @param {string} sql - SQL statement
   * @param {Array} params - Statement parameters
   * @returns {Promise<Object>} Execution result
   */
  execute(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.getInstance().run(sql, params, function(err) {
        if (err) {
          reject(new Error(`Execute failed: ${err.message}`));
        } else {
          resolve({ changes: this.changes, lastID: this.lastID });
        }
      });
    });
  }
}

module.exports = DatabaseConnection;

