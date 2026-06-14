#!/usr/bin/env node
/**
 * Database Connectivity Diagnostic Script
 * Checks database server status and network connectivity
 */

const { Client } = require('pg');
const net = require('net');
const { URL } = require('url');
const { logger } = require('../server/middleware/logger');

// Parse DATABASE_URL
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('ERROR: DATABASE_URL environment variable is not set');
  process.exit(1);
}

console.log('=== Database Connectivity Diagnostics ===\n');

// Parse connection details
let dbConfig;
try {
  const url = new URL(databaseUrl);
  dbConfig = {
    host: url.hostname,
    port: parseInt(url.port) || 5432,
    database: url.pathname.slice(1) || 'postgres',
    user: url.username,
    password: url.password,
    ssl: url.searchParams.get('sslmode') !== 'disable' ? { rejectUnauthorized: false } : false
  };
  
  console.log('Connection Details:');
  console.log(`  Host: ${dbConfig.host}`);
  console.log(`  Port: ${dbConfig.port}`);
  console.log(`  Database: ${dbConfig.database}`);
  console.log(`  User: ${dbConfig.user}`);
  console.log(`  SSL: ${dbConfig.ssl ? 'enabled' : 'disabled'}`);
  console.log('');
} catch (error) {
  console.error('ERROR: Failed to parse DATABASE_URL:', error.message);
  process.exit(1);
}

// Test 1: Basic TCP connectivity
async function testTcpConnectivity() {
  return new Promise((resolve) => {
    console.log('Test 1: TCP Socket Connectivity');
    console.log(`  Attempting to connect to ${dbConfig.host}:${dbConfig.port}...`);
    
    const socket = new net.Socket();
    let connected = false;
    let errorOccurred = false;
    
    const timeout = setTimeout(() => {
      if (!connected) {
        socket.destroy();
        console.log('  ❌ FAILED: Connection timeout after 10 seconds');
        resolve(false);
      }
    }, 10000);
    
    socket.on('connect', () => {
      connected = true;
      clearTimeout(timeout);
      console.log('  ✅ SUCCESS: TCP connection established');
      socket.destroy();
      resolve(true);
    });
    
    socket.on('error', (err) => {
      if (!connected && !errorOccurred) {
        errorOccurred = true;
        clearTimeout(timeout);
        console.log(`  ❌ FAILED: ${err.message}`);
        console.log(`  Error code: ${err.code}`);
        if (err.code === 'ENOTFOUND') {
          console.log('  → DNS resolution failed - hostname not found');
        } else if (err.code === 'ECONNREFUSED') {
          console.log('  → Connection refused - server may be down or port closed');
        } else if (err.code === 'ETIMEDOUT') {
          console.log('  → Connection timeout - network issue or firewall blocking');
        }
        resolve(false);
      }
    });
    
    socket.connect(dbConfig.port, dbConfig.host);
  });
}

// Test 2: PostgreSQL connection with keepalive
async function testPostgresConnection() {
  return new Promise((resolve) => {
    console.log('\nTest 2: PostgreSQL Connection');
    console.log('  Attempting PostgreSQL connection...');
    
    const client = new Client({
      ...dbConfig,
      connectionTimeoutMillis: 10000,
      // Configure keepalive on the client
      keepAlive: true,
      keepAliveInitialDelayMillis: 30000
    });
    
    let connectionEstablished = false;
    const timeout = setTimeout(() => {
      if (!connectionEstablished) {
        client.end().catch(() => {});
        console.log('  ❌ FAILED: Connection timeout after 10 seconds');
        resolve(false);
      }
    }, 10000);
    
    // Set up error handlers before connecting
    client.on('error', (err) => {
      if (!connectionEstablished) {
        clearTimeout(timeout);
        console.log(`  ❌ FAILED: ${err.message}`);
        console.log(`  Error code: ${err.code}`);
        if (err.message.includes('Connection terminated')) {
          console.log('  → Connection was terminated by server');
          console.log('  → Possible causes:');
          console.log('    - Database server idle timeout too short');
          console.log('    - Network firewall closing idle connections');
          console.log('    - Database server restarting');
        }
        resolve(false);
      }
    });
    
    client.connect()
      .then(() => {
        connectionEstablished = true;
        clearTimeout(timeout);
        console.log('  ✅ SUCCESS: PostgreSQL connection established');
        
        // Test query
        return client.query('SELECT version(), current_database(), current_user, inet_server_addr(), inet_server_port()');
      })
      .then((result) => {
        if (result && result.rows && result.rows.length > 0) {
          const row = result.rows[0];
          console.log('  Database Information:');
          console.log(`    PostgreSQL Version: ${row.version?.split(' ')[0]} ${row.version?.split(' ')[1]}`);
          console.log(`    Current Database: ${row.current_database}`);
          console.log(`    Current User: ${row.current_user}`);
          console.log(`    Server Address: ${row.inet_server_addr || 'N/A'}`);
          console.log(`    Server Port: ${row.inet_server_port || 'N/A'}`);
        }
        
        // Check connection settings
        return client.query(`
          SELECT 
            name, 
            setting, 
            unit,
            context
          FROM pg_settings 
          WHERE name IN (
            'tcp_keepalives_idle',
            'tcp_keepalives_interval', 
            'tcp_keepalives_count',
            'idle_in_transaction_session_timeout',
            'statement_timeout',
            'max_connections'
          )
          ORDER BY name
        `);
      })
      .then((result) => {
        if (result && result.rows && result.rows.length > 0) {
          console.log('\n  PostgreSQL Server Settings:');
          result.rows.forEach(row => {
            const value = row.setting + (row.unit ? ` ${row.unit}` : '');
            console.log(`    ${row.name}: ${value} (${row.context})`);
          });
        }
        
        // Check current connections
        return client.query(`
          SELECT 
            COUNT(*) as total_connections,
            COUNT(*) FILTER (WHERE state = 'active') as active,
            COUNT(*) FILTER (WHERE state = 'idle') as idle,
            COUNT(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
          FROM pg_stat_activity
          WHERE datname = current_database()
        `);
      })
      .then((result) => {
        if (result && result.rows && result.rows.length > 0) {
          const stats = result.rows[0];
          console.log('\n  Current Connection Statistics:');
          console.log(`    Total Connections: ${stats.total_connections}`);
          console.log(`    Active: ${stats.active}`);
          console.log(`    Idle: ${stats.idle}`);
          console.log(`    Idle in Transaction: ${stats.idle_in_transaction}`);
        }
        
        return client.end();
      })
      .then(() => {
        console.log('  ✅ Connection closed successfully');
        resolve(true);
      })
      .catch((err) => {
        clearTimeout(timeout);
        console.log(`  ❌ FAILED: ${err.message}`);
        if (err.code) {
          console.log(`  Error code: ${err.code}`);
        }
        if (err.message.includes('password authentication failed')) {
          console.log('  → Authentication failed - check username/password');
        } else if (err.message.includes('database') && err.message.includes('does not exist')) {
          console.log('  → Database does not exist');
        }
        client.end().catch(() => {});
        resolve(false);
      });
  });
}

// Test 3: Connection with keepalive configured on socket
async function testPostgresConnectionWithSocketKeepalive() {
  return new Promise((resolve) => {
    console.log('\nTest 3: PostgreSQL Connection with Socket Keepalive');
    console.log('  Testing connection with TCP keepalive configured...');
    
    const client = new Client({
      ...dbConfig,
      connectionTimeoutMillis: 10000
    });
    
    let connectionEstablished = false;
    const timeout = setTimeout(() => {
      if (!connectionEstablished) {
        client.end().catch(() => {});
        console.log('  ❌ FAILED: Connection timeout');
        resolve(false);
      }
    }, 10000);
    
    client.on('error', (err) => {
      if (!connectionEstablished) {
        clearTimeout(timeout);
        console.log(`  ❌ FAILED: ${err.message}`);
        resolve(false);
      }
    });
    
    // Configure keepalive on connection
    client.on('connect', () => {
      try {
        // Access the underlying socket
        const socket = client.connection?.stream || client.connection;
        if (socket && typeof socket.setKeepAlive === 'function') {
          socket.setKeepAlive(true, 30000); // 30 seconds
          socket.setNoDelay(true);
          console.log('  ✅ TCP keepalive configured on socket');
        } else {
          console.log('  ⚠️  WARNING: Could not access socket to configure keepalive');
        }
      } catch (err) {
        console.log(`  ⚠️  WARNING: Failed to configure keepalive: ${err.message}`);
      }
    });
    
    client.connect()
      .then(() => {
        connectionEstablished = true;
        clearTimeout(timeout);
        console.log('  ✅ Connection established with keepalive');
        
        // Wait a moment to see if connection stays alive
        return new Promise((resolveWait) => {
          setTimeout(() => {
            client.query('SELECT 1')
              .then(() => {
                console.log('  ✅ Connection still alive after 2 seconds');
                resolveWait();
              })
              .catch((err) => {
                console.log(`  ❌ Connection failed after 2 seconds: ${err.message}`);
                resolveWait();
              });
          }, 2000);
        });
      })
      .then(() => {
        return client.end();
      })
      .then(() => {
        resolve(true);
      })
      .catch((err) => {
        clearTimeout(timeout);
        console.log(`  ❌ FAILED: ${err.message}`);
        client.end().catch(() => {});
        resolve(false);
      });
  });
}

// Run all tests
async function runDiagnostics() {
  const results = {
    tcp: false,
    postgres: false,
    postgresKeepalive: false
  };
  
  results.tcp = await testTcpConnectivity();
  results.postgres = await testPostgresConnection();
  results.postgresKeepalive = await testPostgresConnectionWithSocketKeepalive();
  
  console.log('\n=== Summary ===');
  console.log(`TCP Connectivity: ${results.tcp ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`PostgreSQL Connection: ${results.postgres ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`PostgreSQL with Keepalive: ${results.postgresKeepalive ? '✅ PASS' : '❌ FAIL'}`);
  
  if (!results.tcp) {
    console.log('\n⚠️  TCP connectivity failed - check network/firewall settings');
  }
  
  if (results.tcp && !results.postgres) {
    console.log('\n⚠️  TCP works but PostgreSQL connection fails - check authentication/database settings');
  }
  
  if (results.postgres && !results.postgresKeepalive) {
    console.log('\n⚠️  Basic connection works but keepalive configuration may have issues');
  }
  
  if (results.tcp && results.postgres && results.postgresKeepalive) {
    console.log('\n✅ All tests passed - database connectivity is working');
  }
  
  process.exit(results.tcp && results.postgres ? 0 : 1);
}

// Run diagnostics
runDiagnostics().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
