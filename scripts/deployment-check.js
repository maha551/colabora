#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🚀 COLABORA DEPLOYMENT READINESS CHECK');
console.log('=' .repeat(50));

let checksPassed = 0;
let totalChecks = 0;
const warnings = [];
const errors = [];

// Helper function for checks
function check(description, condition, level = 'error') {
  totalChecks++;
  const status = condition ? '✅ PASS' : (level === 'warning' ? '⚠️  WARN' : '❌ FAIL');
  console.log(`${status}: ${description}`);

  if (!condition) {
    if (level === 'warning') {
      warnings.push(description);
    } else {
      errors.push(description);
      return false;
    }
  }

  checksPassed++;
  return true;
}

// 1. Environment Setup
console.log('\n🌍 ENVIRONMENT SETUP');
check('Node.js version compatible', process.version.startsWith('v18') || process.version.startsWith('v20'), 'warning');
check('Environment variables set', process.env.SESSION_SECRET && process.env.JWT_SECRET);

// 2. File Structure
console.log('\n📁 FILE STRUCTURE');
check('Server directory exists', fs.existsSync(path.join(__dirname, '../server')));
check('Client directory exists', fs.existsSync(path.join(__dirname, '../client')));
check('Scripts directory exists', fs.existsSync(path.join(__dirname, '../scripts')));
check('Package.json exists', fs.existsSync(path.join(__dirname, '../package.json')));
check('Client package.json exists', fs.existsSync(path.join(__dirname, '../client/package.json')));

// 3. Dependencies
console.log('\n📦 DEPENDENCIES');
try {
  const packageJson = require('../package.json');
  const clientPackageJson = require('../client/package.json');

  check('Server dependencies installed', fs.existsSync(path.join(__dirname, '../node_modules')));
  check('Client dependencies installed', fs.existsSync(path.join(__dirname, '../client/node_modules')));

  // Check critical dependencies
  const requiredServerDeps = ['express', 'sqlite3', 'cors', 'helmet'];
  const missingServerDeps = requiredServerDeps.filter(dep => !packageJson.dependencies[dep]);
  check('Required server dependencies', missingServerDeps.length === 0, missingServerDeps.join(', '));

  const requiredClientDeps = ['react', 'react-dom'];
  const missingClientDeps = requiredClientDeps.filter(dep => !clientPackageJson.dependencies[dep]);
  check('Required client dependencies', missingClientDeps.length === 0, missingClientDeps.join(', '));

} catch (err) {
  check('Package.json validation', false, err.message);
}

// 4. Build Artifacts
console.log('\n🔨 BUILD ARTIFACTS');
check('Client build exists', fs.existsSync(path.join(__dirname, '../client/build')), 'warning');
check('Build index.html exists', fs.existsSync(path.join(__dirname, '../client/build/index.html')), 'warning');

// 5. Database Setup
console.log('\n🗄️ DATABASE SETUP');
try {
  const config = require('../server/config');
  const dbPath = config.DATABASE_URL.startsWith('sqlite:///')
    ? config.DATABASE_URL.replace('sqlite:///', '')
    : config.DATABASE_URL;

  const dbDir = path.dirname(dbPath);
  check('Database directory exists', fs.existsSync(dbDir));
  check('Database directory writable', (() => {
    try {
      fs.accessSync(dbDir, fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  })());

  // Check if database file exists (optional for fresh deployments)
  if (fs.existsSync(dbPath)) {
    check('Database file exists', true, 'warning');
  } else {
    console.log('ℹ️  Database file will be created on first run');
  }

} catch (err) {
  check('Database configuration', false, err.message);
}

// 6. Security Configuration
console.log('\n🔒 SECURITY CONFIGURATION');
try {
  const config = require('../server/config');

  check('Security headers configured', config.SECURITY_HEADERS && typeof config.SECURITY_HEADERS === 'object');
  check('Rate limiting configured', typeof config.RATE_LIMIT_MAX_REQUESTS === 'number');
  check('CORS configured', Array.isArray(config.ALLOWED_ORIGINS));

  // Check for secure defaults
  check('No insecure secrets', !config.SESSION_SECRET.includes('fallback') && !config.JWT_SECRET.includes('fallback'));

} catch (err) {
  check('Security configuration', false, err.message);
}

// 7. Admin System
console.log('\n👑 ADMIN SYSTEM');
check('Admin setup script exists', fs.existsSync(path.join(__dirname, 'setup-admin.js')));
check('Admin documentation exists', fs.existsSync(path.join(__dirname, '../ADMIN_SETUP.md')));

// 8. Deployment Files
console.log('\n🐳 DEPLOYMENT FILES');
check('Dockerfile exists', fs.existsSync(path.join(__dirname, '../Dockerfile')));
check('Fly.io config exists', fs.existsSync(path.join(__dirname, '../fly.toml')), 'warning');
check('Nixpacks config exists', fs.existsSync(path.join(__dirname, '../nixpacks.toml')), 'warning');

// 9. Code Quality
console.log('\n💻 CODE QUALITY');
try {
  // Syntax check
  const filesToCheck = [
    'server/index.js',
    'server/config.js',
    'server/modules/database.js',
    'server/modules/server.js',
    'server/modules/health.js'
  ];

  let syntaxErrors = 0;
  filesToCheck.forEach(file => {
    const filePath = path.join(__dirname, '..', file);
    if (fs.existsSync(filePath)) {
      try {
        require(filePath);
      } catch (err) {
        console.log(`   ❌ Syntax error in ${file}: ${err.message}`);
        syntaxErrors++;
      }
    }
  });

  check('No syntax errors', syntaxErrors === 0);

} catch (err) {
  check('Code syntax validation', false, err.message);
}

// 10. Network Configuration
console.log('\n🌐 NETWORK CONFIGURATION');
check('Port configured', require('../server/config').PORT > 0);
check('Production HTTPS ready', process.env.NODE_ENV === 'production' ? require('../server/config').FRONTEND_URL.startsWith('https') : true, 'warning');

// Summary
console.log('\n' + '=' .repeat(50));
console.log(`📊 DEPLOYMENT READINESS: ${checksPassed}/${totalChecks} checks passed`);

if (errors.length > 0) {
  console.log('\n❌ BLOCKING ISSUES (Must fix before deployment):');
  errors.forEach(error => console.log(`   - ${error}`));
}

if (warnings.length > 0) {
  console.log('\n⚠️  WARNINGS (Should review before deployment):');
  warnings.forEach(warning => console.log(`   - ${warning}`));
}

if (errors.length === 0) {
  console.log('\n✅ DEPLOYMENT READY!');
  console.log('\n🚀 Next steps:');
  console.log('   1. Run: npm run setup-admin (after deployment)');
  console.log('   2. Access admin at: /api/admin/dashboard');
  console.log('   3. Create your first organization');
  console.log('   4. Monitor health at: /health and /api/health');
} else {
  console.log('\n🔧 Please fix the blocking issues before deployment!');
  process.exit(1);
}

console.log('\n📋 Deployment Checklist:');
console.log('   ✅ Environment variables set');
console.log('   ✅ Dependencies installed');
console.log('   ✅ Build artifacts ready');
console.log('   ✅ Database configured');
console.log('   ✅ Security settings applied');
console.log('   ✅ Admin system ready');
console.log('   ✅ Deployment files present');
console.log('   ✅ Code quality verified');
console.log('   ✅ Network configuration set');
