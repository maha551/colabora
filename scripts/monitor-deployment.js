#!/usr/bin/env node
/**
 * Deployment Monitoring Script
 * Monitors the application after deployment and checks for issues
 */

const https = require('https');
const http = require('http');

const APP_URL = process.env.APP_URL || 'https://colabora-app.fly.dev';
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL) || 30000; // 30 seconds
const MAX_CHECKS = parseInt(process.env.MAX_CHECKS) || 20; // 10 minutes total

let checkCount = 0;
let issuesFound = [];

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  const timestamp = new Date().toISOString();
  console.log(`${colors[color]}[${timestamp}] ${message}${colors.reset}`);
}

async function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const timeout = options.timeout || 10000;

    const req = protocol.get(url, { timeout }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function checkHealth() {
  try {
    const response = await makeRequest(`${APP_URL}/api/health/ready`, { timeout: 5000 });
    
    if (response.status !== 200) {
      return {
        status: 'error',
        message: `Health check returned status ${response.status}`,
        details: response.body
      };
    }

    const health = response.body;
    
    // Check status
    if (health.status === 'ready') {
      return { status: 'healthy', details: health };
    } else if (health.status === 'starting') {
      return { status: 'starting', details: health };
    } else if (health.status === 'degraded') {
      return { status: 'degraded', message: health.message || 'Application in degraded mode', details: health };
    } else {
      return { status: 'unknown', message: `Unknown status: ${health.status}`, details: health };
    }
  } catch (error) {
    return {
      status: 'error',
      message: `Health check failed: ${error.message}`,
      error: error
    };
  }
}

async function checkDetailedHealth() {
  try {
    const response = await makeRequest(`${APP_URL}/api/health/detailed`, { timeout: 10000 });
    
    if (response.status !== 200) {
      return { status: 'error', message: `Detailed health check returned status ${response.status}` };
    }

    return { status: 'ok', details: response.body };
  } catch (error) {
    return { status: 'error', message: `Detailed health check failed: ${error.message}` };
  }
}

async function checkDatabase() {
  try {
    // Try a simple API endpoint that requires database
    const response = await makeRequest(`${APP_URL}/api/health`, { timeout: 5000 });
    
    if (response.status === 200 && response.body.database === 'connected') {
      return { status: 'ok', message: 'Database is connected' };
    } else {
      return { status: 'warning', message: 'Database may not be fully connected', details: response.body };
    }
  } catch (error) {
    return { status: 'error', message: `Database check failed: ${error.message}` };
  }
}

function analyzeHealth(healthResult, detailedHealth) {
  const issues = [];

  // Check basic health
  if (healthResult.status === 'error') {
    issues.push({
      severity: 'critical',
      component: 'application',
      message: healthResult.message,
      recommendation: 'Check application logs and ensure the app is deployed correctly'
    });
  } else if (healthResult.status === 'degraded') {
    issues.push({
      severity: 'high',
      component: 'application',
      message: healthResult.message || 'Application is in degraded mode',
      recommendation: 'Check database connectivity and application logs'
    });
  }

  // Check detailed health if available
  if (detailedHealth.status === 'ok' && detailedHealth.details) {
    const checks = detailedHealth.details.checks || {};
    
    // Database check
    if (checks.database) {
      if (checks.database.status === 'error') {
        issues.push({
          severity: 'critical',
          component: 'database',
          message: checks.database.message || 'Database check failed',
          recommendation: 'Verify DATABASE_URL is set correctly and PostgreSQL is accessible'
        });
      } else if (checks.database.status === 'warning') {
        issues.push({
          severity: 'medium',
          component: 'database',
          message: checks.database.message || 'Database has warnings',
          recommendation: 'Review database connection pool and query performance'
        });
      }
    }

    // Memory check
    if (checks.memory && checks.memory.status === 'error') {
      issues.push({
        severity: 'high',
        component: 'memory',
        message: checks.memory.message || 'Memory issues detected',
        recommendation: 'Check memory usage and consider increasing VM memory'
      });
    }

    // Security check
    if (checks.security && checks.security.status === 'error') {
      issues.push({
        severity: 'critical',
        component: 'security',
        message: checks.security.message || 'Security configuration issues',
        recommendation: 'Verify JWT_SECRET and other security environment variables are set'
      });
    }
  }

  return issues;
}

async function runCheck() {
  checkCount++;
  log(`\n=== Check ${checkCount}/${MAX_CHECKS} ===`, 'cyan');
  
  // Basic health check
  log('Checking application health...', 'blue');
  const healthResult = await checkHealth();
  
  if (healthResult.status === 'healthy') {
    log('✓ Application is healthy', 'green');
  } else if (healthResult.status === 'starting') {
    log('⏳ Application is starting up...', 'yellow');
  } else if (healthResult.status === 'degraded') {
    log('⚠ Application is in degraded mode', 'yellow');
    log(`  Reason: ${healthResult.message}`, 'yellow');
  } else {
    log('✗ Application health check failed', 'red');
    log(`  Error: ${healthResult.message}`, 'red');
  }

  // Detailed health check (if basic check passed)
  if (healthResult.status !== 'error') {
    log('Checking detailed health...', 'blue');
    const detailedHealth = await checkDetailedHealth();
    
    if (detailedHealth.status === 'ok') {
      log('✓ Detailed health check passed', 'green');
      
      // Analyze for issues
      const issues = analyzeHealth(healthResult, detailedHealth);
      if (issues.length > 0) {
        log(`⚠ Found ${issues.length} issue(s):`, 'yellow');
        issues.forEach((issue, idx) => {
          log(`  ${idx + 1}. [${issue.severity.toUpperCase()}] ${issue.component}: ${issue.message}`, 
              issue.severity === 'critical' ? 'red' : 'yellow');
          log(`     Recommendation: ${issue.recommendation}`, 'yellow');
        });
        issuesFound.push(...issues);
      }
    } else {
      log('⚠ Detailed health check unavailable', 'yellow');
    }

    // Database check
    log('Checking database connectivity...', 'blue');
    const dbResult = await checkDatabase();
    if (dbResult.status === 'ok') {
      log('✓ Database is connected', 'green');
    } else {
      log(`⚠ ${dbResult.message}`, 'yellow');
      if (dbResult.status === 'error') {
        issuesFound.push({
          severity: 'critical',
          component: 'database',
          message: dbResult.message,
          recommendation: 'Check DATABASE_URL and PostgreSQL connection'
        });
      }
    }
  }

  // Summary
  if (healthResult.status === 'healthy' && issuesFound.length === 0) {
    log('\n✓ All checks passed! Application is running correctly.', 'green');
    return true;
  } else if (healthResult.status === 'starting') {
    log('\n⏳ Application is still starting. Will continue monitoring...', 'yellow');
    return false;
  } else {
    log('\n⚠ Issues detected. Will continue monitoring...', 'yellow');
    return false;
  }
}

async function main() {
  log('Starting deployment monitoring...', 'cyan');
  log(`Monitoring: ${APP_URL}`, 'cyan');
  log(`Check interval: ${CHECK_INTERVAL / 1000}s`, 'cyan');
  log(`Max checks: ${MAX_CHECKS}`, 'cyan');
  log('Press Ctrl+C to stop monitoring\n', 'cyan');

  const interval = setInterval(async () => {
    const isHealthy = await runCheck();
    
    if (isHealthy && checkCount >= 3) {
      // After at least 3 successful checks, we can stop
      log('\n✓ Application is stable. Monitoring complete.', 'green');
      if (issuesFound.length > 0) {
        log('\nSummary of issues found:', 'yellow');
        issuesFound.forEach((issue, idx) => {
          log(`${idx + 1}. [${issue.severity}] ${issue.component}: ${issue.message}`, 'yellow');
        });
      }
      clearInterval(interval);
      process.exit(0);
    }
    
    if (checkCount >= MAX_CHECKS) {
      log(`\n⚠ Reached maximum check count (${MAX_CHECKS}). Stopping monitoring.`, 'yellow');
      if (issuesFound.length > 0) {
        log('\nSummary of issues found:', 'yellow');
        issuesFound.forEach((issue, idx) => {
          log(`${idx + 1}. [${issue.severity}] ${issue.component}: ${issue.message}`, 'yellow');
        });
      }
      clearInterval(interval);
      process.exit(issuesFound.length > 0 ? 1 : 0);
    }
  }, CHECK_INTERVAL);

  // Run first check immediately
  await runCheck();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    log('\n\nMonitoring stopped by user.', 'cyan');
    if (issuesFound.length > 0) {
      log('\nIssues found during monitoring:', 'yellow');
      issuesFound.forEach((issue, idx) => {
        log(`${idx + 1}. [${issue.severity}] ${issue.component}: ${issue.message}`, 'yellow');
      });
    }
    clearInterval(interval);
    process.exit(issuesFound.length > 0 ? 1 : 0);
  });
}

main().catch(error => {
  log(`Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});

