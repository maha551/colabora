#!/usr/bin/env node

/**
 * Database migration to add organizational documents schema enhancements
 */

const DatabaseManager = require('./server/database/DatabaseManager');
const config = require('./server/config');

async function addOrganizationalSchema() {
  console.log('🚀 Adding organizational documents schema enhancements...');

  const dbManager = new DatabaseManager(config);

  try {
    const db = await dbManager.initialize();

    // Add voting period fields to documents table
    console.log('📝 Adding voting-related columns to documents table...');

    await new Promise((resolve, reject) => {
      db.run('ALTER TABLE documents ADD COLUMN voting_deadline DATETIME', (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          console.log('❌ voting_deadline column error:', err.message);
          reject(err);
        } else {
          console.log('✅ Added voting_deadline column');
          resolve();
        }
      });
    });

    await new Promise((resolve, reject) => {
      db.run('ALTER TABLE documents ADD COLUMN min_voters_required INTEGER DEFAULT 0', (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          console.log('❌ min_voters_required column error:', err.message);
          reject(err);
        } else {
          console.log('✅ Added min_voters_required column');
          resolve();
        }
      });
    });

    await new Promise((resolve, reject) => {
      db.run('ALTER TABLE documents ADD COLUMN voting_started_at DATETIME', (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          console.log('❌ voting_started_at column error:', err.message);
          reject(err);
        } else {
          console.log('✅ Added voting_started_at column');
          resolve();
        }
      });
    });

    // Create user_notifications table
    console.log('📧 Creating user_notifications table...');
    await new Promise((resolve, reject) => {
      db.run(`CREATE TABLE IF NOT EXISTS user_notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        notification_type TEXT NOT NULL,
        enabled BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(user_id, notification_type)
      )`, (err) => {
        if (err) {
          console.error('❌ Error creating user_notifications table:', err.message);
          reject(err);
        } else {
          console.log('✅ Created user_notifications table');
          resolve();
        }
      });
    });

    // Create document_status_history table
    console.log('📋 Creating document_status_history table...');
    await new Promise((resolve, reject) => {
      db.run(`CREATE TABLE IF NOT EXISTS document_status_history (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        old_status TEXT,
        new_status TEXT NOT NULL,
        changed_by TEXT,
        change_reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents(id)
      )`, (err) => {
        if (err) {
          console.error('❌ Error creating document_status_history table:', err.message);
          reject(err);
        } else {
          console.log('✅ Created document_status_history table');
          resolve();
        }
      });
    });

    console.log('🎉 Schema enhancements completed successfully!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Schema enhancement failed:', error);
    process.exit(1);
  }
}

addOrganizationalSchema();
