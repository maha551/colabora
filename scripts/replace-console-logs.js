#!/usr/bin/env node

/**
 * Script to help replace console.log with Winston logger
 * This script identifies console.log patterns and suggests replacements
 */

const fs = require('fs');
const path = require('path');

const filesToProcess = [
  'server/routes/documents.js',
  'server/routes/governance.js',
  'server/routes/organizations.js',
  'server/modules/scheduler.js',
  'server/modules/document-status.js',
  'server/routes/votes.js',
  'server/routes/proposals.js',
  'server/routes/comments.js',
  'server/routes/paragraphs.js',
  'server/routes/structure-proposals.js',
  'server/routes/structure-history.js',
  'server/routes/admin.js',
  'server/routes/auth.js',
  'server/modules/websocket.js',
  'server/database/DatabaseManager.js',
  'server/database/connection.js',
  'server/modules/server.js',
  'server/bootstrap.js',
  'server/config.js',
  'server/modules/health.js',
  'server/modules/database.js',
  'server/modules/locks.js',
];

console.log('Analyzing console.log usage...\n');

filesToProcess.forEach(filePath => {
  const fullPath = path.join(__dirname, '..', filePath);
  if (!fs.existsSync(fullPath)) {
    return;
  }
  
  const content = fs.readFileSync(fullPath, 'utf8');
  const consoleMatches = content.match(/console\.(log|error|warn|debug|info)/g);
  const count = consoleMatches ? consoleMatches.length : 0;
  
  if (count > 0) {
    console.log(`${filePath}: ${count} instances`);
  }
});

console.log('\nDone analyzing.');

