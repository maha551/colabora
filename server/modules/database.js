const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

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
      console.log(`📁 Database path: ${dbPath}`);
      console.log(`📂 Database directory: ${dbDir}`);

      try {
        if (!fs.existsSync(dbDir)) {
          console.log('Creating database directory...');
          fs.mkdirSync(dbDir, { recursive: true });
          console.log('✅ Created database directory:', dbDir);
        } else {
          console.log('✅ Database directory already exists');
        }
      } catch (dirErr) {
        console.error('❌ Error creating database directory:', dirErr.message);
        console.error('Directory error details:', dirErr);

        // In production, try alternative database path if /data is not writable
        if (this.config.NODE_ENV === 'production') {
          console.log('🔄 Production environment detected, trying alternative database path...');
          const altDbPath = path.join(__dirname, '../colabora.db');
          const altDbDir = path.dirname(altDbPath);

          try {
            if (!fs.existsSync(altDbDir)) {
              fs.mkdirSync(altDbDir, { recursive: true });
              console.log('✅ Created alternative database directory:', altDbDir);
            }
            dbPath = altDbPath;
            console.log('✅ Using alternative database path:', dbPath);
          } catch (altDirErr) {
            console.error('❌ Failed to create alternative database directory:', altDirErr.message);
            console.error('💥 Cannot create database directory in production. Exiting...');
            process.exit(1);
          }
        } else {
          // In development, exit on directory creation failure
          console.error('💥 Cannot create database directory. Exiting...');
          process.exit(1);
        }
      }

      console.log('🔌 Attempting to connect to database...');
      this.db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error('❌ Error opening database:', err.message);
          console.error('Database path:', dbPath);
          console.error('Database error details:', err);
          reject(err);
        } else {
          console.log('✅ Connected to SQLite database at:', dbPath);

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
