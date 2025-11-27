/**
 * Migration to add created_by_admin_id column to organizations table
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const config = require('../config');

const dbPath = config.DATABASE_URL || path.join(__dirname, '../../colabora.db');
const db = new sqlite3.Database(dbPath);

console.log('Adding created_by_admin_id column to organizations table...');

db.run(`
  ALTER TABLE organizations ADD COLUMN created_by_admin_id TEXT
`, (err) => {
  if (err) {
    if (err.message.includes('duplicate column name')) {
      console.log('✅ Column created_by_admin_id already exists');
    } else {
      console.error('❌ Error adding column:', err.message);
      db.close();
      process.exit(1);
    }
  } else {
    console.log('✅ Column created_by_admin_id added successfully');
  }
  
  // Update existing organizations to have a default admin if they don't have one
  db.run(`
    UPDATE organizations 
    SET created_by_admin_id = (
      SELECT id FROM users WHERE role = 'admin' LIMIT 1
    )
    WHERE created_by_admin_id IS NULL
  `, (updateErr) => {
    if (updateErr) {
      console.warn('⚠️  Could not set default admin for existing organizations:', updateErr.message);
    } else {
      console.log('✅ Updated existing organizations with default admin');
    }
    db.close();
  });
});

