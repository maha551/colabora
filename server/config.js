const path = require('path');
require('dotenv').config();

// Validation helper
function requireEnvVar(name, defaultValue = null) {
  const value = process.env[name] || defaultValue;
  if (!value && defaultValue === null) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

// Generate secure secrets if not provided
function generateSecureSecret(length = 32) {
  return require('crypto').randomBytes(length).toString('hex');
}

const config = {
  // Server Configuration
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT) || 3000,

  // Security Secrets
  SESSION_SECRET: requireEnvVar('SESSION_SECRET', generateSecureSecret()),
  JWT_SECRET: requireEnvVar('JWT_SECRET', generateSecureSecret()),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',

  // Database Configuration
  DATABASE_URL: process.env.DATABASE_URL || (NODE_ENV === 'production' ? '/data/colabora.db' : path.join(__dirname, '../colabora.db')),

  // CORS Configuration
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3001',
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || 'http://localhost:3001').split(','),

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_FILE: process.env.LOG_FILE || 'server.log',

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,

  // Security Headers
  SECURITY_HEADERS: {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  },

  // Database Settings
  DB_POOL: {
    max: 10,
    min: 1,
    idleTimeoutMillis: 30000,
    acquireTimeoutMillis: 60000,
  },

  // File Upload Limits
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB

  // Session Configuration
  SESSION_CONFIG: {
    name: 'colabora.sid',
    secret: requireEnvVar('SESSION_SECRET', generateSecureSecret()),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  },

  // JWT Configuration
  JWT_CONFIG: {
    secret: requireEnvVar('JWT_SECRET', generateSecureSecret()),
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    issuer: 'colabora-app',
    audience: 'colabora-users'
  }
};

// Validate critical configuration in production
if (config.NODE_ENV === 'production') {
  const requiredVars = ['SESSION_SECRET', 'JWT_SECRET', 'DATABASE_URL'];
  const missing = requiredVars.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables in production: ${missing.join(', ')}`);
  }

  // Ensure secrets are not default values
  if (config.SESSION_SECRET.includes('change-in-production') ||
      config.JWT_SECRET.includes('change-in-production')) {
    throw new Error('Default secrets detected in production. Please set secure SESSION_SECRET and JWT_SECRET environment variables.');
  }
}

module.exports = config;
