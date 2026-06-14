#!/usr/bin/env node

/**
 * Smoke Test Suite for Colabora
 * Quick validation that the application starts and basic functionality works
 */

const { spawn } = require('child_process');
const http = require('http');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TEST_TIMEOUT = 30000; // 30 seconds

function log(message, status = 'info') {
  const timestamp = new Date().toISOString();
  const colors = {
    success: '\x1b[32m',
    error: '\x1b[31m',
    warning: '\x1b[33m',
    info: '\x1b[36m',
    reset: '\x1b[0m'
  };

  const color = colors[status] || colors.info;
  console.log(`${color}[${timestamp}] ${message}${colors.reset}`);
}

async function waitForServer(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    function checkServer() {
      http.get(url, (res) => {
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          retry();
        }
      }).on('error', retry);
    }

    function retry() {
      if (Date.now() - startTime > timeout) {
        reject(new Error(`Server did not respond within ${timeout}ms`));
      } else {
        setTimeout(checkServer, 1000);
      }
    }

    checkServer();
  });
}

async function runSmokeTests() {
  log('🚀 Starting Colabora Smoke Tests');
  log('================================');

  let serverProcess = null;

  try {
    // Start the server
    log('Starting application server...');
    serverProcess = spawn('node', ['server/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' }
    });

    // Collect server output for debugging
    let serverOutput = '';
    serverProcess.stdout.on('data', (data) => {
      serverOutput += data.toString();
    });

    serverProcess.stderr.on('data', (data) => {
      serverOutput += data.toString();
    });

    // Wait for server to start
    log('Waiting for server to start...');
    await waitForServer(`${BASE_URL}/api/health`, 20000);
    log('✅ Server started successfully', 'success');

    // Test health endpoint
    log('Testing health endpoint...');
    const healthResponse = await fetch(`${BASE_URL}/api/health`);
    if (!healthResponse.ok) {
      throw new Error(`Health check failed: ${healthResponse.status}`);
    }
    const healthData = await healthResponse.json();
    if (healthData.status !== 'healthy') {
      throw new Error(`Health check returned unhealthy status: ${healthData.status}`);
    }
    log('✅ Health endpoint responding correctly', 'success');

    // Test authentication with demo user
    log('Testing authentication...');
    const authResponse = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'alice@example.com',
        password: 'SecurePass123!'
      })
    });

    if (!authResponse.ok) {
      throw new Error(`Authentication failed: ${authResponse.status}`);
    }

    const authData = await authResponse.json();
    if (!authData.token || !authData.user) {
      throw new Error('Authentication response missing token or user data');
    }
    log('✅ Authentication working correctly', 'success');

    // Test metrics endpoint
    log('Testing metrics endpoint...');
    const metricsResponse = await fetch(`${BASE_URL}/api/metrics`, {
      headers: { 'Authorization': `Bearer ${authData.token}` }
    });

    if (!metricsResponse.ok) {
      throw new Error(`Metrics endpoint failed: ${metricsResponse.status}`);
    }

    const metricsData = await metricsResponse.json();
    if (!metricsData.uptime || !metricsData.requests) {
      throw new Error('Metrics response missing required data');
    }
    log('✅ Metrics endpoint working correctly', 'success');

    // Test document access
    log('Testing document access...');
    const documentsResponse = await fetch(`${BASE_URL}/api/documents`, {
      headers: { 'Authorization': `Bearer ${authData.token}` }
    });

    if (!documentsResponse.ok) {
      throw new Error(`Document access failed: ${documentsResponse.status}`);
    }

    const documentsData = await documentsResponse.json();
    if (!documentsData.documents || !Array.isArray(documentsData.documents)) {
      throw new Error('Documents response does not contain documents array');
    }
    log('✅ Document access working correctly', 'success');

    log('================================');
    log('🎉 All smoke tests passed!', 'success');
    log('================================');

    return true;

    } catch (error) {
    log(`❌ Smoke test failed: ${error.message}`, 'error');

    if (typeof serverOutput !== 'undefined' && serverOutput) {
      log('Server output:', 'warning');
      console.log(serverOutput.slice(-1000)); // Last 1000 chars
    }

    return false;
  } finally {
    // Clean up server process
    if (serverProcess) {
      log('Stopping server...');
      serverProcess.kill('SIGTERM');

      // Give it time to shut down gracefully
      setTimeout(() => {
        if (!serverProcess.killed) {
          serverProcess.kill('SIGKILL');
        }
      }, 5000);
    }
  }
}

// Run smoke tests
runSmokeTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Smoke test runner failed:', error);
    process.exit(1);
  });
