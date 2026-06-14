#!/usr/bin/env node
/**
 * Search for API Errors in Database
 * 
 * Searches the error_reports table for API errors matching specified criteria.
 * Can filter by error message pattern, status, priority, date range, and user.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const config = require('../server/config');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  pattern: null,
  status: null,
  priority: null,
  from: null,
  to: null,
  user: null,
  output: 'console', // console, json, csv
  limit: 100,
  verbose: false
};

// Parse arguments
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--pattern' || arg === '-p') {
    options.pattern = args[++i];
  } else if (arg === '--status' || arg === '-s') {
    options.status = args[++i];
  } else if (arg === '--priority' || arg === '-pr') {
    options.priority = args[++i];
  } else if (arg === '--from' || arg === '-f') {
    options.from = args[++i];
  } else if (arg === '--to' || arg === '-t') {
    options.to = args[++i];
  } else if (arg === '--user' || arg === '-u') {
    options.user = args[++i];
  } else if (arg === '--output' || arg === '-o') {
    options.output = args[++i];
  } else if (arg === '--limit' || arg === '-l') {
    options.limit = parseInt(args[++i]) || 100;
  } else if (arg === '--verbose' || arg === '-v') {
    options.verbose = true;
  } else if (arg === '--help' || arg === '-h') {
    printHelp();
    process.exit(0);
  }
}

// Get database path
const dbPath = config.DATABASE_URL || path.join(__dirname, '../colabora.db');
const db = new sqlite3.Database(dbPath);

console.log('🔍 Searching for API errors in database...\n');
console.log(`Database: ${dbPath}\n`);

// Check if error_reports table exists
db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='error_reports'", [], (err, row) => {
  if (err) {
    console.error('❌ Error checking for error_reports table:', err.message);
    db.close();
    process.exit(1);
  }

  if (!row) {
    console.error('❌ error_reports table does not exist.');
    console.error('   Migrations run automatically on application startup.');
    console.error('   If the table is missing, check migration_history table to see if migrations have run.');
    console.error('   Restart the application to trigger automatic migrations.');
    db.close();
    process.exit(1);
  }

  // Build query
  buildAndExecuteQuery();
});

function buildAndExecuteQuery() {
  let query = 'SELECT * FROM error_reports WHERE 1=1';
  const params = [];
  const conditions = [];

  // Pattern search (in error_message, error_stack, title, description)
  if (options.pattern) {
    const pattern = `%${options.pattern}%`;
    conditions.push(`(
      error_message LIKE ? OR 
      error_stack LIKE ? OR 
      title LIKE ? OR 
      description LIKE ?
    )`);
    params.push(pattern, pattern, pattern, pattern);
  }

  // Status filter
  if (options.status) {
    const statuses = options.status.split(',').map(s => s.trim());
    if (statuses.length === 1) {
      conditions.push('status = ?');
      params.push(statuses[0]);
    } else {
      const placeholders = statuses.map(() => '?').join(',');
      conditions.push(`status IN (${placeholders})`);
      params.push(...statuses);
    }
  }

  // Priority filter
  if (options.priority) {
    const priorities = options.priority.split(',').map(p => p.trim());
    if (priorities.length === 1) {
      conditions.push('priority = ?');
      params.push(priorities[0]);
    } else {
      const placeholders = priorities.map(() => '?').join(',');
      conditions.push(`priority IN (${placeholders})`);
      params.push(...priorities);
    }
  }

  // Date range filter
  if (options.from) {
    conditions.push('created_at >= ?');
    params.push(options.from);
  }
  if (options.to) {
    conditions.push('created_at <= ?');
    params.push(options.to);
  }

  // User filter
  if (options.user) {
    conditions.push('(user_id = ? OR user_email LIKE ?)');
    params.push(options.user, `%${options.user}%`);
  }

  if (conditions.length > 0) {
    query += ' AND ' + conditions.join(' AND ');
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(options.limit);

  // First, get summary statistics
  getSummaryStats(query, params, () => {
    // Then get detailed results
    getDetailedResults(query, params);
  });
}

function getSummaryStats(query, params, callback) {
  // Build count query (remove LIMIT)
  const countQuery = query.replace(/LIMIT \?$/, '');
  const countParams = params.slice(0, -1); // Remove limit param

  // Extract WHERE clause
  const whereClause = query.includes('WHERE') ? query.split('WHERE')[1].replace(/LIMIT \?$/, '').trim() : '1=1';

  // Get total count
  db.get(`SELECT COUNT(*) as total FROM error_reports WHERE ${whereClause}`, 
    countParams, (err, totalRow) => {
    if (err) {
      console.error('❌ Error getting summary:', err.message);
      callback();
      return;
    }

    // Get counts by status
    db.all(`SELECT status, COUNT(*) as count FROM error_reports WHERE ${whereClause} GROUP BY status`, 
      countParams, (err, statusRows) => {
      if (err) {
        console.error('❌ Error getting status counts:', err.message);
        callback();
        return;
      }

      // Get counts by priority
      db.all(`SELECT priority, COUNT(*) as count FROM error_reports WHERE ${whereClause} GROUP BY priority`, 
        countParams, (err, priorityRows) => {
        if (err) {
          console.error('❌ Error getting priority counts:', err.message);
          callback();
          return;
        }

        // Display summary
        console.log('📊 Summary Statistics:');
        console.log(`   Total matching errors: ${totalRow.total}`);
        
        if (statusRows && statusRows.length > 0) {
          console.log('\n   By Status:');
          statusRows.forEach(row => {
            console.log(`     ${row.status}: ${row.count}`);
          });
        }

        if (priorityRows && priorityRows.length > 0) {
          console.log('\n   By Priority:');
          priorityRows.forEach(row => {
            console.log(`     ${row.priority}: ${row.count}`);
          });
        }

        console.log('\n' + '='.repeat(80) + '\n');
        callback();
      });
    });
  });
}

function getDetailedResults(query, params) {
  db.all(query, params, (err, errors) => {
    if (err) {
      console.error('❌ Error querying database:', err.message);
      db.close();
      process.exit(1);
    }

    if (errors.length === 0) {
      console.log('✅ No errors found matching the criteria.');
      db.close();
      return;
    }

    console.log(`Found ${errors.length} error(s):\n`);

    if (options.output === 'json') {
      // JSON output
      console.log(JSON.stringify(errors, null, 2));
    } else if (options.output === 'csv') {
      // CSV output
      console.log('id,user_id,user_email,title,error_message,status,priority,created_at,url');
      errors.forEach(error => {
        const row = [
          error.id,
          error.user_id || '',
          error.user_email || '',
          `"${(error.title || '').replace(/"/g, '""')}"`,
          `"${(error.error_message || '').replace(/"/g, '""')}"`,
          error.status,
          error.priority,
          error.created_at,
          error.url || ''
        ].join(',');
        console.log(row);
      });
    } else {
      // Console output (formatted)
      errors.forEach((error, index) => {
        console.log(`${index + 1}. Error Report #${error.id}`);
        console.log('   ' + '-'.repeat(78));
        
        if (error.title) {
          console.log(`   Title: ${error.title}`);
        }
        
        if (error.error_message) {
          const message = error.error_message.length > 100 
            ? error.error_message.substring(0, 100) + '...' 
            : error.error_message;
          console.log(`   Error: ${message}`);
        }
        
        if (error.user_email) {
          console.log(`   User: ${error.user_email}${error.user_id ? ` (${error.user_id})` : ''}`);
        } else if (error.user_id) {
          console.log(`   User ID: ${error.user_id}`);
        } else {
          console.log(`   User: anonymous`);
        }
        
        console.log(`   Status: ${error.status} | Priority: ${error.priority}`);
        console.log(`   Created: ${error.created_at}`);
        
        if (error.url) {
          console.log(`   URL: ${error.url}`);
        }
        
        if (error.error_stack && options.verbose) {
          const stackLines = error.error_stack.split('\n').slice(0, 5);
          console.log(`   Stack trace (first 5 lines):`);
          stackLines.forEach(line => {
            console.log(`     ${line}`);
          });
        }
        
        if (error.description && options.verbose) {
          const desc = error.description.length > 200 
            ? error.description.substring(0, 200) + '...' 
            : error.description;
          console.log(`   Description: ${desc}`);
        }
        
        console.log('');
      });
    }

    db.close();
  });
}

function printHelp() {
  console.log(`
🔍 Search Database API Errors

Usage: node scripts/search-db-errors.js [options]

Options:
  -p, --pattern <pattern>    Search for errors matching pattern (searches in error_message, error_stack, title, description)
  -s, --status <status>      Filter by status (new, in_progress, resolved, dismissed). Comma-separated for multiple.
  -pr, --priority <priority> Filter by priority (low, medium, high, critical). Comma-separated for multiple.
  -f, --from <date>          Filter errors from date (YYYY-MM-DD format)
  -t, --to <date>            Filter errors to date (YYYY-MM-DD format)
  -u, --user <user>          Filter by user ID or email (partial match for email)
  -o, --output <format>      Output format: console (default), json, csv
  -l, --limit <number>        Limit number of results (default: 100)
  -v, --verbose              Show full stack traces and descriptions
  -h, --help                 Show this help message

Examples:
  # Search for all "Failed to create" errors
  node scripts/search-db-errors.js --pattern "Failed to create"

  # Search for document creation errors
  node scripts/search-db-errors.js --pattern "Failed to create.*document"

  # Show only unresolved errors
  node scripts/search-db-errors.js --status new,in_progress

  # Search by date range
  node scripts/search-db-errors.js --from "2025-01-01" --to "2025-01-31"

  # Export to JSON
  node scripts/search-db-errors.js --pattern "ApiError" --output json

  # Show detailed information including stack traces
  node scripts/search-db-errors.js --pattern "Failed to create" --verbose
`);
}
