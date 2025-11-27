const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { logger } = require('../middleware/logger');

// Database initialization and management
class DatabaseManager {
  constructor(config) {
    this.config = config;
    this.db = null;
  }

  initialize() {
    return new Promise((resolve, reject) => {
      // Ensure data directory exists with fallback handling
      let dbPath = this.config.DATABASE_URL.startsWith('sqlite:///')
        ? this.config.DATABASE_URL.replace('sqlite:///', '')
        : this.config.DATABASE_URL;

      const dbDir = path.dirname(dbPath);
      logger.debug('Database path configuration', { dbPath, dbDir });

      try {
        if (!fs.existsSync(dbDir)) {
          logger.info('Creating database directory', { dbDir });
          fs.mkdirSync(dbDir, { recursive: true });
          logger.info('Created database directory', { dbDir });
        } else {
          logger.debug('Database directory already exists', { dbDir });
        }
      } catch (dirErr) {
        logger.error('Error creating database directory', { error: dirErr.message, stack: dirErr.stack, dbDir });

        // In production, try alternative database path if /data is not writable
        if (this.config.NODE_ENV === 'production') {
          logger.info('Production environment detected, trying alternative database path', { originalPath: dbPath });
          const altDbPath = path.join(__dirname, '../colabora.db');
          const altDbDir = path.dirname(altDbPath);

          try {
            if (!fs.existsSync(altDbDir)) {
              fs.mkdirSync(altDbDir, { recursive: true });
              logger.info('Created alternative database directory', { altDbDir });
            }
            dbPath = altDbPath;
            logger.info('Using alternative database path', { dbPath });
          } catch (altDirErr) {
            logger.error('Failed to create alternative database directory', { error: altDirErr.message, stack: altDirErr.stack, altDbDir });
            logger.error('Cannot create database directory in production. Exiting');
            process.exit(1);
          }
        } else {
          // In development, exit on directory creation failure
          logger.error('Cannot create database directory. Exiting', { dbDir, error: dirErr.message });
          process.exit(1);
        }
      }

      logger.info('Attempting to connect to database', { dbPath });
      this.db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          logger.error('Error opening database', { error: err.message, stack: err.stack, dbPath });
          reject(err);
        } else {
          logger.info('Connected to SQLite database', { dbPath });

          // Enable foreign keys
          this.db.run('PRAGMA foreign_keys = ON');
          resolve(this.db);
        }
      });
    });
  }

  getInstance() {
    return this.db;
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = DatabaseManager;
