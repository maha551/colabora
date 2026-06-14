const winston = require('winston');
const path = require('path');
const config = require('../config');
// Lazy import getUserId to avoid circular dependency with routeHelpers
// routeHelpers imports logger, so we import getUserId only when needed

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

// Add colors to winston
winston.addColors(colors);

// Define log format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.colorize({ all: true })
);

// Define which transports to use based on environment
const transports = [];

// Console transport for all environments
transports.push(
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
        return `${timestamp} ${level}: ${message} ${metaStr}`;
      })
    )
  })
);

// File transport for production
if (config.NODE_ENV === 'production') {
  transports.push(
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/error.log'),
      level: 'error',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      )
    }),
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/combined.log'),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      )
    })
  );
}

// Create the logger
const logger = winston.createLogger({
  level: config.LOG_LEVEL || 'warn', // Default to warn level to reduce noise
  levels,
  format,
  transports,
  exitOnError: false, // Don't exit on uncaught exceptions
});

// Security-focused logging functions
const securityLogger = {
  // Log authentication attempts - only failures and admin logins
  authAttempt: (email, success, ip, userAgent) => {
    if (!success || email.includes('admin')) {
      const level = success ? 'info' : 'warn';
      logger.log(level, 'Authentication attempt', {
        email,
        success,
        ip,
        userAgent,
        event: 'auth_attempt'
      });
    }
  },

  // Log failed authentication
  authFailure: (email, reason, ip, userAgent) => {
    logger.warn('Authentication failure', {
      email,
      reason,
      ip,
      userAgent,
      event: 'auth_failure'
    });
  },

  // Log suspicious activity
  suspiciousActivity: (userId, action, details, ip, userAgent) => {
    logger.warn('Suspicious activity detected', {
      userId,
      action,
      details,
      ip,
      userAgent,
      event: 'suspicious_activity'
    });
  },

  // Log rate limit hits
  rateLimitHit: (ip, endpoint, userAgent) => {
    logger.warn('Rate limit exceeded', {
      ip,
      endpoint,
      userAgent,
      event: 'rate_limit_hit'
    });
  },

  // Log security events
  securityEvent: (event, details) => {
    logger.error('Security event', {
      event,
      details,
      timestamp: new Date().toISOString()
    });
  },

  // Log admin actions (Winston + optional DB persistence via PlatformAuditService)
  adminAction: (adminId, action, details, req = null) => {
    logger.info('Admin action', {
      adminId,
      action,
      details,
      event: 'admin_action',
      timestamp: new Date().toISOString()
    });

    const targetType = details?.targetType || details?.organizationId
      ? 'organization'
      : details?.promotedUserId || details?.userId
        ? 'user'
        : details?.targetType || null;
    const targetId = details?.organizationId || details?.promotedUserId || details?.userId || details?.targetId || null;

    try {
      const PlatformAuditService = require('../services/PlatformAuditService');
      const db = req?.app?.locals?.db || req?.app?.locals?.knex;
      if (db) {
        PlatformAuditService.logAction(db, {
          adminUserId: adminId,
          action,
          targetType,
          targetId,
          details,
          req,
        }).catch(() => {});
      }
    } catch {
      // Platform audit is best-effort
    }
  }
};

// Request logging middleware
function requestLogger(req, res, next) {
  const start = Date.now();
  const ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
  const userAgent = req.get('User-Agent') || 'unknown';

  // Log response - only errors and slow requests (>1s)
  res.on('finish', () => {
    const duration = Date.now() - start;
    const shouldLog = res.statusCode >= 400 || duration > 1000;

    if (shouldLog) {
      // Lazy import to avoid circular dependency
      const { getUserId } = require('../utils/routeHelpers');
      const level = res.statusCode >= 400 ? 'warn' : 'info';
      logger.log(level, 'Slow/Error Request', {
        method: req.method,
        url: req.url,
        status: res.statusCode,
        duration: `${duration}ms`,
        ip,
        userAgent,
        userId: getUserId(req, false) || 'anonymous'
      });
    }
  });

  next();
}

// Error logging middleware
function errorLogger(err, req, res, next) {
  // Safety check: ensure err exists
  if (!err) {
    err = new Error('Unknown error occurred');
  }

  const ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
  const userAgent = req.get('User-Agent') || 'unknown';

  logger.error('Application error', {
    error: err?.message || 'Unknown error',
    stack: err?.stack || null,
    method: req?.method || 'UNKNOWN',
    url: req?.url || 'UNKNOWN',
    ip,
    userAgent,
    userId: req?.user?.id || 'anonymous',
    body: config.NODE_ENV === 'development' ? req?.body : '[REDACTED]',
    query: req?.query || {},
    params: req?.params || {}
  });

  next(err);
}

module.exports = {
  logger,
  securityLogger,
  requestLogger,
  errorLogger
};
