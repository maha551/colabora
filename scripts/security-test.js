#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔒 COLABORA SECURITY VALIDATION');
console.log('=' .repeat(50));

let passedChecks = 0;
let totalChecks = 0;
const issues = [];

// Helper function for checks
function check(description, condition, details = '') {
  totalChecks++;
  const status = condition ? '✅ PASS' : '❌ FAIL';
  console.log(`${status}: ${description}`);

  if (!condition) {
    issues.push(`${description}${details ? ': ' + details : ''}`);
  } else {
    passedChecks++;
  }

  return condition;
}

// 1. Environment Variables Check
console.log('\n🔑 ENVIRONMENT VARIABLES');
check('SESSION_SECRET is available', process.env.SESSION_SECRET && process.env.SESSION_SECRET.length > 10, 'Should be at least 10 characters');
check('JWT_SECRET is available', process.env.JWT_SECRET && process.env.JWT_SECRET.length > 10, 'Should be at least 10 characters');
check('Secrets are different', process.env.SESSION_SECRET !== process.env.JWT_SECRET, 'Session and JWT secrets should be different');

// 2. File Permissions Check
console.log('\n📁 FILE PERMISSIONS');
try {
  const configPath = path.join(__dirname, '../server/config.js');
  const stat = fs.statSync(configPath);
  check('Config file permissions', (stat.mode & 0o777) <= 0o644, `Current: ${(stat.mode & 0o777).toString(8)}`);
} catch (err) {
  check('Config file exists', false, err.message);
}

// 3. Hardcoded Secrets Check
console.log('\n🔍 HARDCODED SECRETS SCAN');
const scanDirs = ['server', 'client/src', 'scripts'];
let hardcodedFound = false;

function scanForSecrets(dir) {
  if (!fs.existsSync(dir)) return;

  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory() && !['node_modules', '.git', 'build'].includes(item)) {
      scanForSecrets(fullPath);
    } else if (stat.isFile() && ['.js', '.ts', '.tsx', '.json'].includes(path.extname(item))) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');

        // Check for hardcoded patterns
        const patterns = [
          /password.*['"]\w{3,}['"]/i,
          /secret.*['"]\w{5,}['"]/i,
          /token.*['"]\w{10,}['"]/i,
          /key.*['"]\w{10,}['"]/i,
          /cmgxlfj9z0000orjgnfy3revt/, // Old hardcoded user ID
        ];

        for (const pattern of patterns) {
          if (pattern.test(content)) {
            console.log(`⚠️  Potential hardcoded secret in: ${fullPath}`);
            hardcodedFound = true;
          }
        }
      } catch (err) {
        // Skip files that can't be read
      }
    }
  }
}

scanDirs.forEach(dir => scanForSecrets(dir));
check('No hardcoded secrets found', !hardcodedFound);

// 4. Database Security Check
console.log('\n🗄️ DATABASE SECURITY');
try {
  const config = require('../server/config');
  const dbPath = config.DATABASE_URL.startsWith('sqlite:///')
    ? config.DATABASE_URL.replace('sqlite:///', '')
    : config.DATABASE_URL;

  // Check if database file has restrictive permissions
  if (fs.existsSync(dbPath)) {
    const stat = fs.statSync(dbPath);
    check('Database file permissions', (stat.mode & 0o777) <= 0o600, `Current: ${(stat.mode & 0o777).toString(8)}`);
    } else {
    console.log('ℹ️  Database file does not exist yet (will be created on first run)');
  }
} catch (err) {
  check('Database configuration valid', false, err.message);
}

// 5. Dependency Security Check
console.log('\n📦 DEPENDENCY SECURITY');
try {
  const packageJson = require('../package.json');
  const clientPackageJson = require('../client/package.json');

  // Check for vulnerable dependencies in server
  const serverDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const suspiciousServerDeps = Object.keys(serverDeps).filter(dep =>
    ['bcryptjs', 'cors', 'express-rate-limit', 'helmet', 'jsonwebtoken', 'winston'].includes(dep) &&
    !Object.keys(packageJson.dependencies).includes(dep)
  );

  check('Server dependencies clean', suspiciousServerDeps.length === 0, `Found in wrong location: ${suspiciousServerDeps.join(', ')}`);

  // Check for client-side server dependencies
  const clientDeps = Object.keys(clientPackageJson.dependencies || {});
  const serverDepsInClient = clientDeps.filter(dep =>
    ['bcryptjs', 'cors', 'express', 'helmet', 'jsonwebtoken', 'winston'].includes(dep)
  );

  check('Client dependencies clean', serverDepsInClient.length === 0, `Server deps in client: ${serverDepsInClient.join(', ')}`);

} catch (err) {
  check('Package.json validation', false, err.message);
}

// 6. Code Security Check
console.log('\n💻 CODE SECURITY');
try {
  // Check for dangerous patterns
  const serverFiles = [
    'server/index.js',
    'server/routes/auth.js',
    'server/routes/admin.js',
    'server/middleware/auth.js'
  ];

  let dangerousPatterns = false;
  serverFiles.forEach(file => {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');

      // Check for dangerous patterns
      if (content.includes('eval(') || content.includes('Function(') || content.includes('.constructor')) {
        console.log(`⚠️  Dangerous pattern found in: ${file}`);
        dangerousPatterns = true;
      }
    }
  });

  check('No dangerous code patterns', !dangerousPatterns);

} catch (err) {
  check('Code security scan', false, err.message);
}

// 7. Admin System Check
console.log('\n👑 ADMIN SYSTEM');
check('Admin setup script exists', fs.existsSync(path.join(__dirname, 'setup-admin.js')));
check('Admin setup documentation exists', fs.existsSync(path.join(__dirname, '../ADMIN_SETUP.md')));

// 8. Configuration Validation
console.log('\n⚙️ CONFIGURATION');
try {
  const config = require('../server/config');

  check('CORS origins configured', Array.isArray(config.ALLOWED_ORIGINS) && config.ALLOWED_ORIGINS.length > 0);
  check('Rate limiting configured', typeof config.RATE_LIMIT_MAX_REQUESTS === 'number');
  check('Security headers configured', typeof config.SECURITY_HEADERS === 'object');

} catch (err) {
  check('Configuration validation', false, err.message);
}

// Summary
console.log('\n' + '=' .repeat(50));
console.log(`📊 SECURITY CHECK RESULTS: ${passedChecks}/${totalChecks} checks passed`);

if (issues.length > 0) {
  console.log('\n❌ ISSUES FOUND:');
  issues.forEach(issue => console.log(`   - ${issue}`));
  console.log('\n🔧 Please fix these security issues before deployment!');
  process.exit(1);
} else {
  console.log('\n✅ ALL SECURITY CHECKS PASSED!');
  console.log('🚀 Ready for secure deployment!');
}

console.log('\n🔐 SECURITY RECOMMENDATIONS:');
console.log('   - Regularly rotate SESSION_SECRET and JWT_SECRET');
console.log('   - Monitor admin access logs');
console.log('   - Keep dependencies updated');
console.log('   - Use HTTPS in production');
console.log('   - Implement rate limiting');
console.log('   - Enable security headers');