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

  // Security Secrets - Use secure defaults for development
  SESSION_SECRET: requireEnvVar('SESSION_SECRET', generateSecureSecret()),
  JWT_SECRET: requireEnvVar('JWT_SECRET', generateSecureSecret()),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',

  // Database Configuration
  DATABASE_URL: process.env.DATABASE_URL || (process.env.NODE_ENV === 'production' ? '/data/colabora.db' : path.join(__dirname, '../colabora.db')),

  // CORS Configuration
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3001',
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || 'http://localhost:3001,https://colabora-fresh.fly.dev').split(','),

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_FILE: process.env.LOG_FILE || 'server.log',

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 
    (process.env.NODE_ENV === 'development' ? 1000 : 100), // Higher limit for development

  // Security Headers - Properly configured for React app
  SECURITY_HEADERS: {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'", // Required for React development
          "'unsafe-eval'",   // Required for some React features
          "https://cdn.jsdelivr.net" // For any external CDNs if needed
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'", // Required for styled-components and CSS-in-JS
          "https://fonts.googleapis.com"
        ],
        fontSrc: [
          "'self'",
          "https://fonts.gstatic.com",
          "data:" // For inline fonts
        ],
        imgSrc: [
          "'self'",
          "data:",  // For inline images/data URLs
          "blob:",  // For file uploads
          "https:" // For external images
        ],
        connectSrc: [
          "'self'",
          "https://api.github.com" // If using GitHub API
        ],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
      }
    },
    hsts: process.env.NODE_ENV === 'production' ? {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    } : false,
    noSniff: true,
    xssFilter: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" }
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
  const requiredVars = ['SESSION_SECRET', 'JWT_SECRET'];
  const missing = requiredVars.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    const errorMsg = `Missing required environment variables in production: ${missing.join(', ')}. Please set these as Fly.io secrets.`;
    // Error will be thrown, no need to log here
    throw new Error(errorMsg);
  }

  // Validate secret strength
  const validateSecret = (secret, name) => {
    if (secret.length < 32) {
      throw new Error(`${name} must be at least 32 characters long for production`);
    }
    // Check if it's the default/fallback value
    if (secret === generateSecureSecret() || secret.includes('your-') || secret.includes('fallback')) {
      throw new Error(`${name} appears to be a default/fallback value. Please set a secure ${name} as a Fly.io secret.`);
    }
  };

  try {
    validateSecret(config.SESSION_SECRET, 'SESSION_SECRET');
    validateSecret(config.JWT_SECRET, 'JWT_SECRET');
  } catch (validationError) {
    // Error will be thrown, no need to log here
    throw validationError;
  }
}

module.exports = config;
