#!/usr/bin/env node

/**
 * Script to generate and set Fly.io secrets
 * 
 * Usage:
 *   node scripts/setup-fly-secrets.js
 *   node scripts/setup-fly-secrets.js --app colabora-app
 *   node scripts/setup-fly-secrets.js --check-only  (just check, don't set)
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Generate secure random secret
function generateSecret(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

// Get app name from fly.toml or command line
function getAppName() {
  // Check command line first
  const appIndex = process.argv.indexOf('--app');
  if (appIndex !== -1 && process.argv[appIndex + 1]) {
    return process.argv[appIndex + 1];
  }
  
  // Try to read from fly.toml
  const flyTomlPath = path.join(__dirname, '..', 'fly.toml');
  if (fs.existsSync(flyTomlPath)) {
    const content = fs.readFileSync(flyTomlPath, 'utf8');
    const match = content.match(/app\s*=\s*['"]([^'"]+)['"]/);
    if (match) {
      return match[1];
    }
  }
  
  // Default fallback
  return 'colabora-app';
}

const appName = getAppName();
const checkOnly = process.argv.includes('--check-only');

console.log('🔐 Fly.io Secrets Setup');
console.log('======================\n');
console.log(`App: ${appName}\n`);

// Check current secrets
let currentSecrets = [];
try {
  const output = execSync(`fly secrets list --app ${appName} --json`, { encoding: 'utf8' });
  currentSecrets = JSON.parse(output).map(s => s.Name);
  console.log('📋 Current secrets:', currentSecrets.length > 0 ? currentSecrets.join(', ') : 'none');
} catch (error) {
  console.log('⚠️  Could not fetch current secrets (app may not exist yet)');
  console.log('   Error:', error.message.split('\n')[0]);
}

console.log('');

// Required secrets
const requiredSecrets = {
  JWT_SECRET: {
    description: 'JWT token signing secret (minimum 32 characters)',
    generate: () => generateSecret(32)
  }
};

// Check which secrets are missing
const missingSecrets = [];
for (const [name, config] of Object.entries(requiredSecrets)) {
  if (currentSecrets.includes(name)) {
    console.log(`✅ ${name} is set`);
  } else {
    console.log(`❌ ${name} is MISSING - ${config.description}`);
    missingSecrets.push(name);
  }
}

if (missingSecrets.length === 0) {
  console.log('\n✅ All required secrets are set!');
  process.exit(0);
}

if (checkOnly) {
  console.log('\n📝 Run without --check-only to generate and set missing secrets.');
  process.exit(0);
}

// Generate missing secrets
console.log('\n🔑 Generating missing secrets...\n');
const secretsToSet = {};

for (const name of missingSecrets) {
  const secret = requiredSecrets[name].generate();
  secretsToSet[name] = secret;
  console.log(`Generated ${name} (${secret.length} characters)`);
}

console.log('\n📋 To set these secrets on Fly.io, run:\n');
for (const [name, value] of Object.entries(secretsToSet)) {
  console.log(`fly secrets set ${name}="${value}" --app ${appName}`);
}

// Ask if user wants to set them automatically
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('');
rl.question('Do you want to set these secrets automatically? (y/N): ', (answer) => {
  if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
    try {
      console.log('\n🚀 Setting secrets on Fly.io...\n');
      
      for (const [name, value] of Object.entries(secretsToSet)) {
        console.log(`Setting ${name}...`);
        execSync(`fly secrets set ${name}="${value}" --app ${appName}`, { stdio: 'inherit' });
      }
      
      console.log('\n✅ Secrets set successfully!\n');
      console.log('Note: You may need to restart your Fly.io app for the secrets to take effect.');
      console.log(`Run: fly apps restart --app ${appName}`);
    } catch (error) {
      console.error('\n❌ Failed to set secrets:', error.message);
      console.log('\nPlease set them manually using the commands shown above.');
      process.exit(1);
    }
  } else {
    console.log('\n📝 Please set the secrets manually using the commands shown above.');
  }
  
  rl.close();
});

