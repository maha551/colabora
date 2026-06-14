#!/usr/bin/env node
/**
 * Quick Fly.io Database Connectivity Check
 * Simple script to verify database is accessible from Fly.io app
 */

const { Client } = require('pg');
const net = require('net');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('ERROR: DATABASE_URL not set');
  process.exit(1);
}

// Parse connection details
let host, port;
try {
  const url = new URL(databaseUrl);
  host = url.hostname;
  port = parseInt(url.port) || 5432;
  console.log(`Checking connectivity to ${host}:${port}...\n`);
} catch (error) {
  console.error('ERROR: Invalid DATABASE_URL:', error.message);
  process.exit(1);
}

// Test 1: TCP connectivity
console.log('1. Testing TCP connectivity...');
const socket = new net.Socket();
const tcpTimeout = setTimeout(() => {
  socket.destroy();
  console.log('   ❌ TCP connection timeout');
  process.exit(1);
}, 5000);

socket.on('connect', () => {
  clearTimeout(tcpTimeout);
  console.log('   ✅ TCP connection successful');
  socket.destroy();
  
  // Test 2: PostgreSQL connection
  console.log('\n2. Testing PostgreSQL connection...');
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 10000
  });
  
  client.connect()
    .then(() => {
      console.log('   ✅ PostgreSQL connection successful');
      return client.query('SELECT version(), current_database(), inet_server_addr()');
    })
    .then((result) => {
      if (result.rows[0]) {
        console.log(`   Database: ${result.rows[0].current_database}`);
        console.log(`   Server: ${result.rows[0].inet_server_addr || 'N/A'}`);
        console.log(`   Version: ${result.rows[0].version.split(' ')[0]} ${result.rows[0].version.split(' ')[1]}`);
      }
      return client.query(`
        SELECT 
          name, setting, unit
        FROM pg_settings 
        WHERE name IN ('tcp_keepalives_idle', 'tcp_keepalives_interval', 'max_connections')
        ORDER BY name
      `);
    })
    .then((result) => {
      if (result.rows.length > 0) {
        console.log('\n   Server Settings:');
        result.rows.forEach(row => {
          console.log(`     ${row.name}: ${row.setting}${row.unit ? ' ' + row.unit : ''}`);
        });
      }
      return client.end();
    })
    .then(() => {
      console.log('\n✅ All connectivity tests passed!');
      process.exit(0);
    })
    .catch((err) => {
      console.log(`   ❌ PostgreSQL connection failed: ${err.message}`);
      if (err.code) {
        console.log(`   Error code: ${err.code}`);
      }
      client.end().catch(() => {});
      process.exit(1);
    });
});

socket.on('error', (err) => {
  clearTimeout(tcpTimeout);
  console.log(`   ❌ TCP connection failed: ${err.message}`);
  console.log(`   Error code: ${err.code}`);
  if (err.code === 'ENOTFOUND') {
    console.log('   → Hostname not found - check DNS');
  } else if (err.code === 'ECONNREFUSED') {
    console.log('   → Connection refused - server may be down');
  } else if (err.code === 'ETIMEDOUT') {
    console.log('   → Connection timeout - network/firewall issue');
  }
  process.exit(1);
});

socket.connect(port, host);
