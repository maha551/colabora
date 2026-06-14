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

// Single JWT secret instance (sign + verify must use the same value)
const jwtSecret = requireEnvVar('JWT_SECRET', generateSecureSecret());

const config = {
  // Application branding
  APP_NAME: 'colabora',

  // Server Configuration
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT) || 3000,

  // Security Secrets - Use secure defaults for development
  JWT_SECRET: jwtSecret,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',

  // Database Configuration (PostgreSQL-only runtime)
  DATABASE_URL: process.env.DATABASE_URL,

  // PostgreSQL Connection Pool Configuration (only applies when using PostgreSQL)
  PG_POOL_MIN: process.env.PG_POOL_MIN,
  PG_POOL_MAX: process.env.PG_POOL_MAX,
  PG_POOL_ACQUIRE_TIMEOUT: process.env.PG_POOL_ACQUIRE_TIMEOUT,
  PG_STATEMENT_TIMEOUT: process.env.PG_STATEMENT_TIMEOUT,
  PG_IDLE_TRANSACTION_TIMEOUT: process.env.PG_IDLE_TRANSACTION_TIMEOUT,
  // PostgreSQL TCP Keepalive Configuration (only applies when using PostgreSQL)
  PG_KEEPALIVE_ENABLED: process.env.PG_KEEPALIVE_ENABLED !== 'false', // Default: true
  PG_KEEPALIVE_INITIAL_DELAY: parseInt(process.env.PG_KEEPALIVE_INITIAL_DELAY) || 30000, // Default: 30 seconds (reduced to start probes sooner)
  PG_SOCKET_TIMEOUT: parseInt(process.env.PG_SOCKET_TIMEOUT) || 120000, // Default: 2 min - recycle before server idle timeout (e.g. MPG/PGBouncer)

  // CORS Configuration
  // Auto-detect Fly.io URL if FRONTEND_URL is not set and we're on Fly.io
  FRONTEND_URL: (() => {
    if (process.env.FRONTEND_URL) {
      return process.env.FRONTEND_URL;
    }
    // Auto-detect Fly.io URL
    if (process.env.FLY_APP_NAME) {
      return `https://${process.env.FLY_APP_NAME}.fly.dev`;
    }
    // Default fallback for development
    return 'http://localhost:3001';
  })(),
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || 'http://localhost:3001')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean),

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_FILE: process.env.LOG_FILE || 'server.log',

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 
    (process.env.NODE_ENV === 'development' ? 2000 : 100), // Higher limit for development (2000 to handle multiple polling components)

  // Guest scheduling public routes (set PUBLIC_GUEST_SCHEDULING=false to disable)
  PUBLIC_GUEST_SCHEDULING: process.env.PUBLIC_GUEST_SCHEDULING !== 'false',
  GUEST_RATE_LIMIT_MAX: parseInt(process.env.GUEST_RATE_LIMIT_MAX, 10) ||
    (process.env.NODE_ENV === 'development' ? 500 : 60),
  GUEST_PUT_RATE_LIMIT_MAX: parseInt(process.env.GUEST_PUT_RATE_LIMIT_MAX, 10) ||
    (process.env.NODE_ENV === 'development' ? 200 : 20),

  // Public site / legal
  CONTACT_EMAIL: process.env.CONTACT_EMAIL || process.env.ADMIN_BOOTSTRAP_EMAIL || '',
  SITE_OPERATOR_NAME: process.env.SITE_OPERATOR_NAME || '',
  SITE_OPERATOR_ADDRESS: process.env.SITE_OPERATOR_ADDRESS || '',
  TERMS_VERSION: process.env.TERMS_VERSION || '2026-06-11',
  PRIVACY_VERSION: process.env.PRIVACY_VERSION || '2026-06-11',
  CONTACT_RATE_LIMIT_MAX: parseInt(process.env.CONTACT_RATE_LIMIT_MAX, 10) ||
    (process.env.NODE_ENV === 'development' ? 50 : 5),

  // Security Headers - Helmet: non-prod must use `contentSecurityPolicy: false` to disable CSP
  // (not `directives: false` — that triggers "CSP has no directives" in Helmet 7).
  SECURITY_HEADERS: (() => {
    const isProd = process.env.NODE_ENV === 'production';
    const shared = {
      hsts: isProd
        ? {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true
          }
        : false,
      noSniff: true,
      xssFilter: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
    };
    if (!isProd) {
      return { contentSecurityPolicy: false, ...shared };
    }
    const frameSources = ["'self'", 'https://meet.jit.si'];
    if (process.env.JITSI_MEET_BASE_URL) {
      const jitsi = process.env.JITSI_MEET_BASE_URL.replace(/\/$/, '');
      if (jitsi && !frameSources.includes(jitsi)) frameSources.push(jitsi);
    }
    if (process.env.BIGBLUEBUTTON_URL) {
      const bbb = process.env.BIGBLUEBUTTON_URL.replace(/\/$/, '');
      if (bbb && !frameSources.includes(bbb)) frameSources.push(bbb);
    }
    const directives = {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'sha256-ZswfTY7H35rbv8WC7NXBoiC7WNu86vSzCDChNWwZZDM='",
        "'sha256-n+fNvSaxUzYI8khlM+QtMSX+slZkhxvEsZ+npRl62YE='"
      ],
      styleSrc: ["'self'", 'https://fonts.bunny.net', "'unsafe-inline'", "'unsafe-hashes'"],
      fontSrc: ["'self'", 'https://fonts.bunny.net', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      frameSrc: frameSources,
      childSrc: frameSources,
      workerSrc: ["'self'"]
    };
    if (process.env.FRONTEND_URL) {
      directives.connectSrc.push(process.env.FRONTEND_URL);
    }
    if (process.env.ALLOWED_ORIGINS) {
      process.env.ALLOWED_ORIGINS.split(',')
        .map((o) => o.trim())
        .filter(Boolean)
        .forEach((origin) => directives.connectSrc.push(origin));
    }
    Object.keys(directives).forEach((key) => {
      if (Array.isArray(directives[key])) {
        directives[key] = Array.from(new Set(directives[key]));
      }
    });
    directives.upgradeInsecureRequests = [];
    return {
      contentSecurityPolicy: { useDefaults: false, directives },
      ...shared
    };
  })(),

  // File Upload Limits
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB

  // Email Configuration - Resend
  RESEND_API_KEY: process.env.RESEND_API_KEY || null,
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL || null,
  RESEND_FROM_NAME: process.env.RESEND_FROM_NAME || 'Colabora',
  APP_LOGO_URL: process.env.APP_LOGO_URL || null,
  SUPPORT_EMAIL: process.env.SUPPORT_EMAIL || null,

  // Web Push notifications (optional channel)
  WEB_PUSH_ENABLED: process.env.WEB_PUSH_ENABLED === 'true',
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY || null,
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || null,
  VAPID_SUBJECT: process.env.VAPID_SUBJECT || null,

  // Telegram notifications (optional channel)
  TELEGRAM_ENABLED: process.env.TELEGRAM_ENABLED === 'true',
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || null,
  TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME || null,
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET || null,

  // Explicit production admin bootstrap (used only when no admin exists)
  ADMIN_BOOTSTRAP_EMAIL: process.env.ADMIN_BOOTSTRAP_EMAIL || null,
  ADMIN_BOOTSTRAP_PASSWORD: process.env.ADMIN_BOOTSTRAP_PASSWORD || null,
  ADMIN_BOOTSTRAP_TOKEN: process.env.ADMIN_BOOTSTRAP_TOKEN || null,

  // Video meeting provider (Phase 3 — Meetings). If 'none', only manual meeting_link can be set.
  VIDEO_PROVIDER: process.env.VIDEO_PROVIDER || 'none', // 'jitsi' | 'bigbluebutton' | 'none'
  // BigBlueButton: use https in production; http allowed for local/dev (e.g. http://localhost:8090).
  BIGBLUEBUTTON_URL: process.env.BIGBLUEBUTTON_URL || null,
  BIGBLUEBUTTON_SECRET: process.env.BIGBLUEBUTTON_SECRET || null,
  JITSI_MEET_BASE_URL: process.env.JITSI_MEET_BASE_URL || 'https://meet.jit.si',

  // JWT Configuration (secret must match JWT_SECRET above)
  JWT_CONFIG: {
    secret: jwtSecret,
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    issuer: 'colabora-app',
    audience: 'colabora-users'
  }
};

// Read at access time so test suites can enable archive after module load.
Object.defineProperty(config, 'MINUTES_ARCHIVE_ENABLED', {
  enumerable: true,
  get() {
    return process.env.MINUTES_ARCHIVE_ENABLED === 'true';
  }
});
Object.defineProperty(config, 'MINUTES_ARCHIVE_PARITY_CHECK', {
  enumerable: true,
  get() {
    return process.env.MINUTES_ARCHIVE_PARITY_CHECK === 'true';
  }
});

// Validate critical configuration in production
// JWT_SECRET is REQUIRED in production - fail fast if missing
config.validationErrors = [];

if (!config.DATABASE_URL) {
  const errorMsg = 'CRITICAL: DATABASE_URL environment variable is required.';
  console.error(errorMsg);
  throw new Error(errorMsg);
}

if (!/^postgres(ql)?:\/\//i.test(config.DATABASE_URL)) {
  const errorMsg = 'CRITICAL: DATABASE_URL must start with postgres:// or postgresql://.';
  console.error(errorMsg);
  throw new Error(errorMsg);
}

if (config.NODE_ENV === 'production') {
  // JWT_SECRET is absolutely required - fail fast
  // Note: Using console.error here because logger depends on config, and these errors
  // occur during module initialization before logger is available
  if (!process.env.JWT_SECRET) {
    const errorMsg = 'CRITICAL: JWT_SECRET environment variable is required in production. Please set it as a Fly.io secret.';
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Validate secret strength
  const validateSecret = (secret, name) => {
    if (secret.length < 32) {
      const errorMsg = `${name} must be at least 32 characters long for production`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    // Check if it's a weak/placeholder value
    if (secret.includes('your-') || secret.includes('fallback') || secret.includes('changeme') || secret.includes('secret')) {
      const errorMsg = `${name} appears to be a placeholder value. Please set a secure random ${name} as a Fly.io secret.`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    return true;
  };

  validateSecret(config.JWT_SECRET, 'JWT_SECRET');

  // Validate FRONTEND_URL in production
  // Check if it's still localhost (which would be wrong in production)
  if (config.FRONTEND_URL.includes('localhost')) {
    const errorMsg = 'CRITICAL: FRONTEND_URL is set to localhost in production. Please set FRONTEND_URL environment variable to your production URL (e.g., https://your-app.fly.dev) or ensure FLY_APP_NAME is set for auto-detection.';
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Warn if FRONTEND_URL was auto-detected (good, but user should know)
  if (!process.env.FRONTEND_URL && process.env.FLY_APP_NAME) {
    console.warn(`⚠️  FRONTEND_URL not set, auto-detected from FLY_APP_NAME: ${config.FRONTEND_URL}`);
    console.warn('   Consider explicitly setting FRONTEND_URL for better control.');
  }
}

config.isVideoRoomCreationEnabled = function isVideoRoomCreationEnabled() {
  const provider = (config.VIDEO_PROVIDER || 'none').toLowerCase();
  return provider === 'jitsi' || provider === 'bigbluebutton';
};

module.exports = config;
