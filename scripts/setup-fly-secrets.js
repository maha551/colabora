#!/usr/bin/env node

/**
 * Script to generate and set Fly.io secrets
 * 
 * Usage:
 *   node scripts/setup-fly-secrets.js
 *   node scripts/setup-fly-secrets.js --app colabora-fresh-final
 */

const crypto = require('crypto');
const { execSync } = require('child_process');

// Generate secure random secret
function generateSecret(length = 64) {
  return crypto.randomBytes(length).toString('hex');
}

// Get app name from command line or use default
const appName = process.argv.includes('--app') 
  ? process.argv[process.argv.indexOf('--app') + 1]
  : 'colabora-fresh-final';

console.log('🔐 Generating secure secrets for Fly.io...\n');

// Generate secrets
const sessionSecret = generateSecret(64);
const jwtSecret = generateSecret(64);

console.log('Generated secrets:');
console.log(`SESSION_SECRET: ${sessionSecret.substring(0, 20)}... (${sessionSecret.length} chars)`);
console.log(`JWT_SECRET: ${jwtSecret.substring(0, 20)}... (${jwtSecret.length} chars)\n`);

console.log(`📋 To set these secrets on Fly.io, run:\n`);
console.log(`fly secrets set SESSION_SECRET="${sessionSecret}" --app ${appName}`);
console.log(`fly secrets set JWT_SECRET="${jwtSecret}" --app ${appName}\n`);

// Ask if user wants to set them automatically
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Do you want to set these secrets automatically? (y/N): ', (answer) => {
  if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
    try {
      console.log('\n🚀 Setting secrets on Fly.io...\n');
      
      execSync(`fly secrets set SESSION_SECRET="${sessionSecret}" --app ${appName}`, { stdio: 'inherit' });
      execSync(`fly secrets set JWT_SECRET="${jwtSecret}" --app ${appName}`, { stdio: 'inherit' });
      
      console.log('\n✅ Secrets set successfully!\n');
      console.log('Note: You may need to restart your Fly.io app for the secrets to take effect.');
      console.log('Run: fly apps restart --app ' + appName);
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

