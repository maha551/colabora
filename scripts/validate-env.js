#!/usr/bin/env node

/**
 * Environment Variable Validation Script
 * Validates that all required environment variables are set correctly
 * 
 * Usage:
 *   node scripts/validate-env.js
 *   node scripts/validate-env.js --production
 */

const crypto = require('crypto');
require('dotenv').config();

// Generate secure secret for comparison
function generateSecureSecret(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

const isProduction = process.argv.includes('--production') || process.env.NODE_ENV === 'production';

console.log(`🔍 Validating environment variables (${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'} mode)...\n`);

const errors = [];
const warnings = [];

// Required variables
const requiredVars = {
  SESSION_SECRET: {
    minLength: 32,
    description: 'Session encryption secret'
  },
  JWT_SECRET: {
    minLength: 32,
    description: 'JWT token signing secret'
  }
};

// Check required variables
for (const [varName, config] of Object.entries(requiredVars)) {
  const value = process.env[varName];
  
  if (!value) {
    if (isProduction) {
      errors.push(`❌ ${varName} is required but not set`);
    } else {
      warnings.push(`⚠️  ${varName} is not set (using generated fallback)`);
    }
    continue;
  }

  if (value.length < config.minLength) {
    errors.push(`❌ ${varName} must be at least ${config.minLength} characters (currently ${value.length})`);
  }

  // Check for common weak values
  if (value.includes('your-') || value.includes('change-me') || value.includes('secret')) {
    if (isProduction) {
      errors.push(`❌ ${varName} appears to be a placeholder value`);
    } else {
      warnings.push(`⚠️  ${varName} appears to be a placeholder value`);
    }
  }
}

// Optional but recommended variables
const optionalVars = {
  DATABASE_URL: 'Database connection URL',
  FRONTEND_URL: 'Frontend application URL',
  ALLOWED_ORIGINS: 'Comma-separated list of allowed CORS origins'
};

for (const [varName, description] of Object.entries(optionalVars)) {
  if (!process.env[varName]) {
    warnings.push(`⚠️  ${varName} (${description}) is not set - using default`);
  }
}

// Display results
if (errors.length > 0) {
  console.log('❌ Validation FAILED:\n');
  errors.forEach(error => console.log(`  ${error}`));
  console.log('\n');
  process.exit(1);
}

if (warnings.length > 0) {
  console.log('⚠️  Warnings:\n');
  warnings.forEach(warning => console.log(`  ${warning}`));
  console.log('\n');
}

if (errors.length === 0 && warnings.length === 0) {
  console.log('✅ All environment variables are valid!\n');
} else if (errors.length === 0) {
  console.log('✅ Required environment variables are valid (some optional variables missing)\n');
}

// Display current values (masked)
console.log('Current environment variables:');
console.log(`  NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
console.log(`  PORT: ${process.env.PORT || '3000 (default)'}`);
console.log(`  SESSION_SECRET: ${process.env.SESSION_SECRET ? '✅ Set (' + process.env.SESSION_SECRET.length + ' chars)' : '❌ Not set'}`);
console.log(`  JWT_SECRET: ${process.env.JWT_SECRET ? '✅ Set (' + process.env.JWT_SECRET.length + ' chars)' : '❌ Not set'}`);
console.log(`  DATABASE_URL: ${process.env.DATABASE_URL || 'Using default'}`);
console.log(`  FRONTEND_URL: ${process.env.FRONTEND_URL || 'Using default'}\n`);

if (isProduction && errors.length === 0) {
  console.log('✅ Production environment validation passed!\n');
}

