#!/usr/bin/env node

/**
 * Reset Deployed Database Script
 * Removes the existing database file to force recreation with updated schema
 * This is needed when schema changes break compatibility with existing data
 */

const fs = require('fs');
const path = require('path');

console.log('🗑️  Resetting deployed database...');

// Database path for Fly.io deployment
const dbPath = process.env.DATABASE_URL || '/data/colabora.db';
const dbDir = path.dirname(dbPath);

console.log(`📍 Database path: ${dbPath}`);
console.log(`📁 Database directory: ${dbDir}`);

try {
  // Check if database file exists
  if (fs.existsSync(dbPath)) {
    console.log('📄 Found existing database file');
    fs.unlinkSync(dbPath);
    console.log('✅ Removed old database file');
  } else {
    console.log('ℹ️  No existing database file found');
  }

  // Check if WAL and SHM files exist (SQLite temporary files)
  const walFile = `${dbPath}-wal`;
  const shmFile = `${dbPath}-shm`;

  if (fs.existsSync(walFile)) {
    fs.unlinkSync(walFile);
    console.log('✅ Removed WAL file');
  }

  if (fs.existsSync(shmFile)) {
    fs.unlinkSync(shmFile);
    console.log('✅ Removed SHM file');
  }

  console.log('🎉 Database reset complete!');
  console.log('📝 The app will recreate the database with the updated schema on next restart');

} catch (error) {
  console.error('❌ Error resetting database:', error);
  process.exit(1);
}