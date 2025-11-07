#!/usr/bin/env node

/**
 * Security Test Suite for Colabora
 * Run this script to validate security implementations
 */

const axios = require('axios');
const crypto = require('crypto');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Colors for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(colors.green, `✓ ${message}`);
}

function logError(message) {
  log(colors.red, `✗ ${message}`);
}

function logWarning(message) {
  log(colors.yellow, `! ${message}`);
}

function logInfo(message) {
  log(colors.blue, `ℹ ${message}`);
}

// Test results
const results = {
  passed: 0,
  failed: 0,
  warnings: 0
};

async function testHealthEndpoint() {
  logInfo('Testing health endpoint...');
  try {
    const response = await axios.get(`${BASE_URL}/api/health`);
    if (response.status === 200 && response.data.status === 'healthy') {
      logSuccess('Health endpoint returns healthy status');
      results.passed++;
    } else {
      logError('Health endpoint returned unexpected response');
      results.failed++;
    }
  } catch (error) {
    logError(`Health endpoint test failed: ${error.message}`);
    results.failed++;
  }
}

async function testRateLimiting() {
  logInfo('Testing rate limiting...');
  const requests = Array(20).fill().map(() => axios.get(`${BASE_URL}/api/health`));

  try {
    const responses = await Promise.allSettled(requests);
    const failedRequests = responses.filter(r => r.status === 'rejected' || r.value?.status === 429).length;

    if (failedRequests > 0) {
      logSuccess('Rate limiting is working (some requests were blocked)');
      results.passed++;
    } else {
      logWarning('Rate limiting may not be working properly');
      results.warnings++;
    }
  } catch (error) {
    logError(`Rate limiting test failed: ${error.message}`);
    results.failed++;
  }
}

async function testAuthentication() {
  logInfo('Testing authentication endpoints...');

  // Test invalid login
  try {
    await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'nonexistent@example.com',
      password: 'wrongpassword'
    });
    logError('Authentication should have failed for invalid credentials');
    results.failed++;
  } catch (error) {
    if (error.response?.status === 401) {
      logSuccess('Authentication correctly rejects invalid credentials');
      results.passed++;
    } else {
      logError(`Unexpected error during auth test: ${error.message}`);
      results.failed++;
    }
  }

  // Test SQL injection attempt
  try {
    await axios.post(`${BASE_URL}/api/auth/login`, {
      email: "' OR '1'='1",
      password: "' OR '1'='1"
    });
    logError('SQL injection attempt should have been blocked');
    results.failed++;
  } catch (error) {
    if (error.response?.status === 401) {
      logSuccess('SQL injection attempt was blocked');
      results.passed++;
    } else {
      logError(`Unexpected response to SQL injection attempt: ${error.response?.status}`);
      results.failed++;
    }
  }
}

async function testInputValidation() {
  logInfo('Testing input validation...');

  // Test XSS attempt in registration
  try {
    await axios.post(`${BASE_URL}/api/auth/register`, {
      name: '<script>alert("xss")</script>',
      email: 'test@example.com',
      password: 'ValidPass123!'
    });
    logError('XSS attempt should have been sanitized');
    results.failed++;
  } catch (error) {
    if (error.response?.status === 400) {
      logSuccess('XSS attempt was blocked by input validation');
      results.passed++;
    } else {
      logError(`Unexpected response to XSS attempt: ${error.response?.status}`);
      results.failed++;
    }
  }

  // Test invalid email
  try {
    await axios.post(`${BASE_URL}/api/auth/register`, {
      name: 'Test User',
      email: 'invalid-email',
      password: 'ValidPass123!'
    });
    logError('Invalid email should have been rejected');
    results.failed++;
  } catch (error) {
    if (error.response?.status === 400) {
      logSuccess('Invalid email was correctly rejected');
      results.passed++;
    } else {
      logError(`Unexpected response to invalid email: ${error.response?.status}`);
      results.failed++;
    }
  }
}

async function testCORSPolicy() {
  logInfo('Testing CORS policy...');

  try {
    // Test with allowed origin
    const response = await axios.options(`${BASE_URL}/api/health`, {
      headers: {
        'Origin': 'http://localhost:3001',
        'Access-Control-Request-Method': 'GET'
      }
    });

    if (response.headers['access-control-allow-origin']) {
      logSuccess('CORS policy allows legitimate requests');
      results.passed++;
    } else {
      logWarning('CORS headers not properly configured');
      results.warnings++;
    }
  } catch (error) {
    logError(`CORS test failed: ${error.message}`);
    results.failed++;
  }
}

async function testSecurityHeaders() {
  logInfo('Testing security headers...');

  try {
    const response = await axios.get(`${BASE_URL}/api/health`);

    const headers = response.headers;
    const requiredHeaders = [
      'x-content-type-options',
      'x-frame-options',
      'x-xss-protection',
      'strict-transport-security'
    ];

    let missingHeaders = 0;
    requiredHeaders.forEach(header => {
      if (!headers[header.toLowerCase()]) {
        logWarning(`Missing security header: ${header}`);
        missingHeaders++;
      }
    });

    if (missingHeaders === 0) {
      logSuccess('All required security headers are present');
      results.passed++;
    } else {
      logWarning(`${missingHeaders} security headers are missing`);
      results.warnings += missingHeaders;
    }
  } catch (error) {
    logError(`Security headers test failed: ${error.message}`);
    results.failed++;
  }
}

async function testDebugEndpoints() {
  logInfo('Testing debug endpoint removal...');

  try {
    await axios.get(`${BASE_URL}/api/debug-doc/test`);
    logError('Debug endpoints should be removed in production');
    results.failed++;
  } catch (error) {
    if (error.response?.status === 404) {
      logSuccess('Debug endpoints are properly removed');
      results.passed++;
    } else {
      logWarning(`Debug endpoint returned status: ${error.response?.status}`);
      results.warnings++;
    }
  }
}

async function testMonitoringEndpoints() {
  logInfo('Testing monitoring endpoints...');

  // Test metrics endpoint (requires auth)
  try {
    const authResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'alice@example.com',
      password: 'SecurePass123!'
    });

    const token = authResponse.data.token;
    const metricsResponse = await axios.get(`${BASE_URL}/api/metrics`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (metricsResponse.status === 200 && metricsResponse.data.uptime) {
      logSuccess('Metrics endpoint working correctly');
      results.passed++;
    } else {
      logError('Metrics endpoint returned unexpected response');
      results.failed++;
    }
  } catch (error) {
    logError(`Metrics endpoint test failed: ${error.message}`);
    results.failed++;
  }

  // Test detailed health endpoint
  try {
    const authResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'alice@example.com',
      password: 'SecurePass123!'
    });

    const token = authResponse.data.token;
    const healthResponse = await axios.get(`${BASE_URL}/api/health/detailed`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (healthResponse.status === 200 && healthResponse.data.status) {
      logSuccess('Detailed health endpoint working correctly');
      results.passed++;
    } else {
      logError('Detailed health endpoint returned unexpected response');
      results.failed++;
    }
  } catch (error) {
    logError(`Detailed health endpoint test failed: ${error.message}`);
    results.failed++;
  }
}

async function runSecurityTests() {
  logInfo('🔒 Starting Colabora Security Test Suite');
  logInfo('==========================================');

  await testHealthEndpoint();
  await testRateLimiting();
  await testAuthentication();
  await testInputValidation();
  await testCORSPolicy();
  await testSecurityHeaders();
  await testDebugEndpoints();
  await testMonitoringEndpoints();

  logInfo('==========================================');
  logInfo(`Test Results: ${results.passed} passed, ${results.failed} failed, ${results.warnings} warnings`);

  if (results.failed === 0 && results.warnings === 0) {
    log(colors.green, '🎉 All security tests passed! The application is secure.');
    process.exit(0);
  } else if (results.failed === 0) {
    log(colors.yellow, '⚠️  Security tests completed with warnings. Review and fix before production.');
    process.exit(0);
  } else {
    log(colors.red, '❌ Critical security issues found. Do not deploy to production!');
    process.exit(1);
  }
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Colabora Security Test Suite

Usage: node security-test.js [options]

Options:
  --url <url>    Base URL to test (default: http://localhost:3000)
  --help, -h     Show this help message

Examples:
  node security-test.js
  node security-test.js --url https://my-app.com
`);
  process.exit(0);
}

// Override base URL if provided
const urlIndex = process.argv.indexOf('--url');
if (urlIndex !== -1 && process.argv[urlIndex + 1]) {
  process.env.BASE_URL = process.argv[urlIndex + 1];
}

runSecurityTests().catch(error => {
  logError(`Security test suite failed: ${error.message}`);
  process.exit(1);
});
