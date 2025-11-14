#!/usr/bin/env node

const http = require('http');

console.log('🏥 COLABORA HEALTH CHECK');
console.log('=' .repeat(40));

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

let checksPassed = 0;
let totalChecks = 0;

// Helper function for HTTP requests
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, options, (res) => {
      let data = '';

      res.on('data', chunk => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({ statusCode: res.statusCode, data: jsonData });
        } catch (e) {
          resolve({ statusCode: res.statusCode, data });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    // Timeout after 5 seconds
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

// Helper function for checks
function check(description, condition, details = '') {
  totalChecks++;
  const status = condition ? '✅ PASS' : '❌ FAIL';
  console.log(`${status}: ${description}`);

  if (condition) {
    checksPassed++;
  } else if (details) {
    console.log(`   Details: ${details}`);
  }

  return condition;
}

// Run health checks
async function runHealthChecks() {
  console.log('\n🌐 BASIC CONNECTIVITY');

  try {
    // Test basic connectivity
    const basicHealth = await makeRequest(`${BASE_URL}/health`);
    check('Basic health endpoint responds', basicHealth.statusCode === 200);

    if (basicHealth.data) {
      check('Health response format valid', typeof basicHealth.data === 'object' && basicHealth.data.status);
      check('Uptime reported', typeof basicHealth.data.uptime === 'number');
    }

  } catch (error) {
    check('Basic health endpoint accessible', false, error.message);
  }

  console.log('\n📊 DETAILED HEALTH CHECKS');

  try {
    // Test detailed health endpoint
    const detailedHealth = await makeRequest(`${BASE_URL}/api/health`);
    check('API health endpoint responds', detailedHealth.statusCode === 200);

    if (detailedHealth.data) {
      check('Detailed health format valid', typeof detailedHealth.data === 'object');
      check('Status field present', typeof detailedHealth.data.status === 'string');
      check('Environment reported', typeof detailedHealth.data.environment === 'string');
      check('Database status included', typeof detailedHealth.data.database === 'string');

      // Check status values
      check('Overall status healthy', detailedHealth.data.status === 'healthy' || detailedHealth.data.status === 'warning');
      check('Database connected', detailedHealth.data.database === 'connected');

      // Log additional info
      console.log(`   📍 Environment: ${detailedHealth.data.environment}`);
      console.log(`   🗄️  Database: ${detailedHealth.data.database}`);
      console.log(`   ⏱️  Uptime: ${detailedHealth.data.uptime}`);

      if (detailedHealth.data.checks) {
        console.log('\n🔍 INDIVIDUAL CHECKS:');
        Object.entries(detailedHealth.data.checks).forEach(([checkName, checkData]) => {
          const status = checkData.status === 'healthy' ? '✅' : checkData.status === 'warning' ? '⚠️' : '❌';
          console.log(`   ${status} ${checkName}: ${checkData.message || checkData.status}`);
        });
      }
    }

  } catch (error) {
    check('API health endpoint accessible', false, error.message);
  }

  console.log('\n📈 PERFORMANCE CHECKS');

  try {
    // Test response time
    const startTime = Date.now();
    await makeRequest(`${BASE_URL}/health`);
    const responseTime = Date.now() - startTime;

    check('Response time acceptable', responseTime < 1000, `Response time: ${responseTime}ms`);
    console.log(`   ⏱️  Response time: ${responseTime}ms`);

  } catch (error) {
    check('Response time measurable', false, error.message);
  }

  // Summary
  console.log('\n' + '=' .repeat(40));
  console.log(`📊 HEALTH CHECK RESULTS: ${checksPassed}/${totalChecks} checks passed`);

  if (checksPassed === totalChecks) {
    console.log('\n🎉 ALL HEALTH CHECKS PASSED!');
    console.log('🚀 Application is healthy and ready!');
    process.exit(0);
  } else {
    console.log('\n⚠️  SOME HEALTH CHECKS FAILED!');
    console.log('🔧 Please investigate the failing checks.');
    process.exit(1);
  }
}

// Check if server is running
function checkServerRunning() {
  return new Promise((resolve) => {
    const req = http.get(`${BASE_URL}/health`, (res) => {
      resolve(true);
    });

    req.on('error', () => {
      resolve(false);
    });

    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// Main execution
async function main() {
  console.log(`Checking health of Colabora server at ${BASE_URL}`);
  console.log('Make sure the server is running before running this check.\n');

  const serverRunning = await checkServerRunning();
  if (!serverRunning) {
    console.log('❌ SERVER NOT RUNNING!');
    console.log('💡 Start the server first with: npm start');
    console.log('   Then run this health check.');
    process.exit(1);
  }

  console.log('✅ Server is running, starting health checks...\n');

  try {
    await runHealthChecks();
  } catch (error) {
    console.error('❌ Health check failed with error:', error.message);
    process.exit(1);
  }
}

main();
