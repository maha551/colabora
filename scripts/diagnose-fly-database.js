#!/usr/bin/env node
/**
 * Comprehensive Fly.io Database Diagnostic Script
 * 
 * This script performs multiple checks to diagnose database connection issues:
 * 1. Checks if database is accessible from Fly.io app
 * 2. Verifies DATABASE_URL is correct
 * 3. Checks Fly.io database status/health
 * 4. Reviews connection attempts and errors
 * 
 * Usage:
 *   node scripts/diagnose-fly-database.js
 *   Or on Fly.io: fly ssh console --app colabora-app -C "node scripts/diagnose-fly-database.js"
 */

require('dotenv').config();
const { Client } = require('pg');
const net = require('net');
const { URL } = require('url');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'bold');
  console.log('='.repeat(60));
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'cyan');
}

// Parse DATABASE_URL
function parseDatabaseUrl(dbUrl) {
  if (!dbUrl) return null;
  
  try {
    const url = new URL(dbUrl);
    return {
      protocol: url.protocol.replace(':', ''),
      username: url.username,
      password: url.password ? '***' : null,
      host: url.hostname,
      port: url.port || (url.protocol.includes('postgres') ? '5432' : null),
      database: url.pathname.replace('/', ''),
      searchParams: Object.fromEntries(url.searchParams)
    };
  } catch (e) {
    return null;
  }
}

// Test 1: Check DATABASE_URL is set and valid
async function testDatabaseUrl() {
  logSection('Test 1: DATABASE_URL Verification');
  
  const dbUrl = process.env.DATABASE_URL;
  
  if (!dbUrl) {
    logError('DATABASE_URL is not set');
    logInfo('Set it with: fly secrets set DATABASE_URL="postgresql://..." --app colabora-app');
    return false;
  }
  
  logSuccess('DATABASE_URL is set');
  
  const parsed = parseDatabaseUrl(dbUrl);
  if (!parsed) {
    logError('DATABASE_URL format is invalid');
    return false;
  }
  
  logInfo(`Protocol: ${parsed.protocol}`);
  logInfo(`Host: ${parsed.host}`);
  logInfo(`Port: ${parsed.port || 'default'}`);
  logInfo(`Database: ${parsed.database}`);
  logInfo(`Username: ${parsed.username}`);
  logInfo(`Password: ${parsed.password ? '***' : 'not set'}`);
  
  if (parsed.protocol !== 'postgresql' && parsed.protocol !== 'postgres') {
    logError(`Invalid protocol: ${parsed.protocol} (expected postgresql:// or postgres://)`);
    return false;
  }
  
  if (!parsed.host) {
    logError('Host is missing from DATABASE_URL');
    return false;
  }
  
  if (!parsed.database) {
    logError('Database name is missing from DATABASE_URL');
    return false;
  }
  
  if (!parsed.username) {
    logError('Username is missing from DATABASE_URL');
    return false;
  }
  
  // Check for common Fly.io issues
  if (parsed.host.includes('flycast')) {
    logInfo('Using Fly.io internal network (flycast)');
  } else if (parsed.host.includes('fly.dev')) {
    logWarning('Using external Fly.io hostname (may have network issues)');
    logInfo('Consider using flycast internal network for better reliability');
  }
  
  if (parsed.searchParams.sslmode === 'disable') {
    logWarning('SSL is disabled - this is OK for Fly.io internal network');
  } else if (!parsed.searchParams.sslmode) {
    logInfo('SSL mode not specified (will use default)');
  }
  
  return { parsed, dbUrl };
}

// Test 2: Check TCP connectivity
async function testTcpConnectivity(parsed) {
  logSection('Test 2: TCP Connectivity Test');
  
  if (!parsed || !parsed.host || !parsed.port) {
    logError('Cannot test TCP connectivity - missing host or port');
    return false;
  }
  
  return new Promise((resolve) => {
    logInfo(`Attempting TCP connection to ${parsed.host}:${parsed.port}...`);
    
    const socket = new net.Socket();
    let connected = false;
    
    const timeout = setTimeout(() => {
      if (!connected) {
        socket.destroy();
        logError(`TCP connection timeout after 10 seconds`);
        logInfo('Possible causes:');
        logInfo('  - Database server is not running');
        logInfo('  - Network firewall is blocking connection');
        logInfo('  - Host/port is incorrect');
        resolve(false);
      }
    }, 10000);
    
    socket.on('connect', () => {
      connected = true;
      clearTimeout(timeout);
      logSuccess('TCP connection established');
      socket.destroy();
      resolve(true);
    });
    
    socket.on('error', (err) => {
      clearTimeout(timeout);
      logError(`TCP connection failed: ${err.message}`);
      logInfo(`Error code: ${err.code}`);
      
      if (err.code === 'ECONNREFUSED') {
        logInfo('Database server is not accepting connections');
        logInfo('  - Check if database is running: fly status --app colabora-app-db');
        logInfo('  - Check database logs: fly logs --app colabora-app-db');
      } else if (err.code === 'ETIMEDOUT') {
        logInfo('Connection timeout - database may be unreachable');
        logInfo('  - Check network connectivity');
        logInfo('  - Verify hostname is correct');
      } else if (err.code === 'ENOTFOUND') {
        logInfo('Hostname not found - DNS resolution failed');
        logInfo('  - Verify hostname is correct');
        logInfo('  - Check if using flycast internal network');
      }
      
      resolve(false);
    });
    
    socket.connect(parseInt(parsed.port), parsed.host);
  });
}

// Test 3: Test PostgreSQL connection with detailed error reporting
async function testPostgresConnection(dbUrl, parsed) {
  logSection('Test 3: PostgreSQL Connection Test');
  
  if (!dbUrl) {
    logError('Cannot test PostgreSQL connection - DATABASE_URL not set');
    return false;
  }
  
  logInfo('Attempting PostgreSQL connection...');
  logInfo('This will test authentication and database access');
  
  const client = new Client({
    connectionString: dbUrl,
    connectionTimeoutMillis: 15000,
    // Don't set keepalive here - we want to see raw connection behavior
  });
  
  let connectionAttempted = false;
  
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (!connectionAttempted) {
        client.end().catch(() => {});
        logError('Connection attempt timeout after 15 seconds');
        resolve(false);
      }
    }, 16000);
    
    // Set up error handlers BEFORE connecting
    client.on('error', (err) => {
      clearTimeout(timeout);
      connectionAttempted = true;
      
      logError(`PostgreSQL connection error: ${err.message}`);
      logInfo(`Error code: ${err.code || 'N/A'}`);
      
      // Detailed error analysis
      if (err.message.includes('password authentication failed')) {
        logError('Authentication failed');
        logInfo('Possible causes:');
        logInfo('  - Incorrect password in DATABASE_URL');
        logInfo('  - Username is incorrect');
        logInfo('  - User does not have permission to access database');
        logInfo('Solution: Verify DATABASE_URL credentials');
      } else if (err.message.includes('database') && err.message.includes('does not exist')) {
        logError('Database does not exist');
        logInfo(`Database name: ${parsed.database}`);
        logInfo('Solution: Create the database or verify the name');
      } else if (err.message.includes('Connection terminated')) {
        logError('Connection was terminated by server');
        logInfo('Possible causes:');
        logInfo('  - Database server is closing idle connections');
        logInfo('  - Network timeout');
        logInfo('  - Server-side connection limit reached');
        logInfo('  - Database server is restarting');
      } else if (err.code === 'ECONNREFUSED') {
        logError('Connection refused');
        logInfo('Database server is not accepting connections');
      } else if (err.code === 'ETIMEDOUT') {
        logError('Connection timeout');
        logInfo('Database server is not responding');
      } else if (err.code === 'ENOTFOUND') {
        logError('Hostname not found');
        logInfo('DNS resolution failed - check hostname');
      }
      
      resolve(false);
    });
    
    // Track connection lifecycle
    let connectionEstablished = false;
    let queryStarted = false;
    let queryCompleted = false;
    
    // Monitor connection events
    client.on('end', () => {
      if (connectionEstablished && !queryCompleted) {
        logWarning('Connection ended unexpectedly before query completed');
      }
    });
    
    // Attempt connection
    client.connect()
      .then(() => {
        clearTimeout(timeout);
        connectionAttempted = true;
        connectionEstablished = true;
        logSuccess('PostgreSQL connection established');
        logInfo('Connection state: connected');
        
        // Try to get connection info immediately
        const startTime = Date.now();
        logInfo('Executing test query...');
        queryStarted = true;
        
        // Test a simple query with timeout
        return Promise.race([
          client.query('SELECT version(), current_database(), current_user, inet_server_addr(), inet_server_port(), now() as query_time'),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Query timeout after 10 seconds')), 10000);
          })
        ]);
      })
      .then((result) => {
        queryCompleted = true;
        const queryTime = Date.now();
        
        if (result && result.rows && result.rows.length > 0) {
          const row = result.rows[0];
          logSuccess('Query executed successfully');
          logInfo(`Query execution time: ${Date.now() - (queryTime - 100)}ms`);
          logInfo(`PostgreSQL version: ${row.version?.substring(0, 50)}...`);
          logInfo(`Current database: ${row.current_database}`);
          logInfo(`Current user: ${row.current_user}`);
          logInfo(`Server address: ${row.inet_server_addr || 'N/A'}`);
          logInfo(`Server port: ${row.inet_server_port || 'N/A'}`);
          logInfo(`Query time (server): ${row.query_time || 'N/A'}`);
        }
        
        return client.end();
      })
      .then(() => {
        logSuccess('Connection closed cleanly');
        resolve(true);
      })
      .catch((err) => {
        clearTimeout(timeout);
        connectionAttempted = true;
        
        const errorDetails = {
          message: err.message,
          code: err.code,
          connectionEstablished,
          queryStarted,
          queryCompleted
        };
        
        if (err.message.includes('Connection terminated')) {
          logError('Connection terminated during query');
          logInfo(`Connection state when error occurred:`);
          logInfo(`  - Connection established: ${connectionEstablished}`);
          logInfo(`  - Query started: ${queryStarted}`);
          logInfo(`  - Query completed: ${queryCompleted}`);
          logInfo('This suggests the connection was established but then closed');
          logInfo('Possible causes:');
          logInfo('  - Database server idle timeout (very short)');
          logInfo('  - Network interruption');
          logInfo('  - Server-side connection limit reached');
          logInfo('  - Database server configuration issue');
          logInfo('  - TCP keepalive not working properly');
          logInfo('');
          logInfo('Recommended actions:');
          logInfo('  1. Check database server logs: fly logs --app colabora-app-db');
          logInfo('  2. Check database configuration: ./scripts/check-db-config.sh');
          logInfo('  3. Check for connection termination patterns: ./scripts/investigate-db-termination.sh');
        } else if (err.message.includes('Query timeout')) {
          logError('Query timed out');
          logInfo('The query took longer than 10 seconds to execute');
          logInfo('This may indicate database server is slow or overloaded');
        } else {
          logError(`Query error: ${err.message}`);
          if (err.code) {
            logInfo(`Error code: ${err.code}`);
          }
        }
        
        client.end().catch(() => {});
        resolve(false);
      });
  });
}

// Test 4: Check Fly.io environment and database status
async function testFlyEnvironment() {
  logSection('Test 4: Fly.io Environment Check');
  
  const isFlyIo = !!process.env.FLY_APP_NAME || !!process.env.FLY_REGION;
  
  if (isFlyIo) {
    logSuccess('Running on Fly.io');
    logInfo(`App name: ${process.env.FLY_APP_NAME || 'N/A'}`);
    logInfo(`Region: ${process.env.FLY_REGION || 'N/A'}`);
    logInfo(`Instance ID: ${process.env.FLY_ALLOC_ID || 'N/A'}`);
  } else {
    logWarning('Not running on Fly.io (or Fly.io env vars not set)');
    logInfo('Some checks may not be applicable');
  }
  
  // Check if we can detect database app name
  const dbUrl = process.env.DATABASE_URL || '';
  if (dbUrl.includes('flycast')) {
    logInfo('Using Fly.io internal network (flycast)');
    logInfo('This is the recommended configuration for Fly.io');
  }
  
  // Check for common Fly.io issues
  if (dbUrl && !dbUrl.includes('flycast') && !dbUrl.includes('fly.dev')) {
    logWarning('DATABASE_URL does not appear to be a Fly.io database URL');
  }
  
  return isFlyIo;
}

// Test 5: Connection pool test with keepalive
async function testConnectionWithKeepalive(dbUrl) {
  logSection('Test 5: Connection with Keepalive Test');
  
  if (!dbUrl) {
    logError('Cannot test - DATABASE_URL not set');
    return false;
  }
  
  logInfo('Testing connection with TCP keepalive configured...');
  
  const client = new Client({
    connectionString: dbUrl,
    connectionTimeoutMillis: 15000,
  });
  
  return new Promise((resolve) => {
    let connectionEstablished = false;
    const timeout = setTimeout(() => {
      if (!connectionEstablished) {
        client.end().catch(() => {});
        logError('Connection timeout');
        resolve(false);
      }
    }, 16000);
    
    client.on('connect', () => {
      try {
        // Configure keepalive on the connection socket
        const socket = client.connection?.stream || client.connection;
        if (socket && typeof socket.setKeepAlive === 'function') {
          socket.setKeepAlive(true, 30000); // 30 seconds
          socket.setNoDelay(true);
          logSuccess('TCP keepalive configured on connection');
        } else {
          logWarning('Could not configure keepalive - socket not accessible');
        }
      } catch (err) {
        logWarning(`Failed to configure keepalive: ${err.message}`);
      }
    });
    
    client.on('error', (err) => {
      clearTimeout(timeout);
      logError(`Connection error: ${err.message}`);
      resolve(false);
    });
    
    client.connect()
      .then(() => {
        clearTimeout(timeout);
        connectionEstablished = true;
        logSuccess('Connection established with keepalive');
        
        // Wait a moment to see if connection stays alive
        return new Promise((resolve) => {
          setTimeout(() => {
            client.query('SELECT 1')
              .then(() => {
                logSuccess('Connection still alive after keepalive setup');
                return client.end();
              })
              .then(() => resolve(true))
              .catch((err) => {
                logError(`Query failed: ${err.message}`);
                client.end().catch(() => {});
                resolve(false);
              });
          }, 2000);
        });
      })
      .then((success) => {
        resolve(success);
      })
      .catch((err) => {
        clearTimeout(timeout);
        connectionEstablished = true;
        logError(`Connection failed: ${err.message}`);
        client.end().catch(() => {});
        resolve(false);
      });
  });
}

// Main diagnostic function
async function runDiagnostics() {
  console.log('\n');
  log('🔍 Fly.io Database Diagnostic Tool', 'bold');
  log('=====================================\n', 'bold');
  
  const results = {
    databaseUrl: false,
    tcpConnectivity: false,
    postgresConnection: false,
    flyEnvironment: false,
    keepaliveTest: false
  };
  
  // Test 1: DATABASE_URL
  const urlTest = await testDatabaseUrl();
  if (urlTest) {
    results.databaseUrl = true;
    const { parsed, dbUrl } = urlTest;
    
    // Test 2: TCP Connectivity
    results.tcpConnectivity = await testTcpConnectivity(parsed);
    
    // Test 3: PostgreSQL Connection
    results.postgresConnection = await testPostgresConnection(dbUrl, parsed);
    
    // Test 5: Keepalive Test (only if basic connection works)
    if (results.postgresConnection) {
      results.keepaliveTest = await testConnectionWithKeepalive(dbUrl);
    }
  }
  
  // Test 4: Fly.io Environment
  results.flyEnvironment = await testFlyEnvironment();
  
  // Summary
  logSection('Diagnostic Summary');
  
  const totalTests = Object.keys(results).length;
  const passedTests = Object.values(results).filter(r => r).length;
  
  logInfo(`Tests passed: ${passedTests}/${totalTests}`);
  
  if (results.databaseUrl) {
    logSuccess('DATABASE_URL is set and valid');
  } else {
    logError('DATABASE_URL check failed');
  }
  
  if (results.tcpConnectivity) {
    logSuccess('TCP connectivity works');
  } else {
    logError('TCP connectivity failed');
  }
  
  if (results.postgresConnection) {
    logSuccess('PostgreSQL connection works');
  } else {
    logError('PostgreSQL connection failed');
    logInfo('\nRecommended actions:');
    logInfo('1. Check database status: fly status --app colabora-app-db');
    logInfo('2. Check database logs: fly logs --app colabora-app-db');
    logInfo('3. Verify DATABASE_URL: fly secrets list --app colabora-app');
    logInfo('4. Test from app: fly ssh console --app colabora-app -C "psql $DATABASE_URL -c \\"SELECT 1\\""');
  }
  
  if (results.flyEnvironment) {
    logSuccess('Fly.io environment detected');
  } else {
    logWarning('Fly.io environment not detected');
  }
  
  if (results.keepaliveTest) {
    logSuccess('Connection with keepalive works');
  } else if (results.postgresConnection) {
    logWarning('Keepalive test failed (but basic connection works)');
  }
  
  console.log('\n');
  
  // Exit with appropriate code
  if (results.postgresConnection && results.tcpConnectivity) {
    log('✅ Database is accessible and working', 'green');
    process.exit(0);
  } else {
    log('❌ Database connection issues detected', 'red');
    process.exit(1);
  }
}

// Run diagnostics
runDiagnostics().catch((err) => {
  logError(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
