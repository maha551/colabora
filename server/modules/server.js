const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const { requestLogger, errorLogger, securityLogger } = require('../middleware/logger');
const { metricsCollector, requestMetrics } = require('../middleware/monitoring');
const HealthCheckService = require('./health');

// Server initialization and configuration
class ServerManager {
  constructor(config) {
    this.config = config;
    this.app = null;
    this.server = null;
    this.serverStarted = false;
    this.serverStartTimeout = null;
    this.healthService = null;
  }

  initialize(db = null) {
    this.app = express();

    // Initialize health service (will be updated with DB later)
    this.healthService = new HealthCheckService(this.config, db);

    this.setupSecurity();
    this.setupMiddleware();
    this.setupBasicRoutes(); // Health endpoints
    this.setupErrorHandling();

    return this.app;
  }

  // Update health service with database connection
  updateHealthService(db) {
    this.healthService = new HealthCheckService(this.config, db);
  }

  setupSecurity() {
    // Trust proxy in production
    if (this.config.NODE_ENV === 'production') {
      this.app.set('trust proxy', 1);
    }

    // Security headers
    this.app.use(helmet(this.config.SECURITY_HEADERS));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: this.config.RATE_LIMIT_WINDOW_MS,
      max: this.config.RATE_LIMIT_MAX_REQUESTS,
      message: {
        error: 'Too many requests from this IP, please try again later.'
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        securityLogger.rateLimitHit(
          req.ip,
          req.path,
          req.get('User-Agent')
        );
        metricsCollector.recordSecurityEvent('rate_limit_hit', {
          ip: req.ip,
          endpoint: req.path,
          userAgent: req.get('User-Agent')
        });
        res.status(429).json({
          error: 'Too many requests from this IP, please try again later.'
        });
      }
    });
    this.app.use('/api', limiter);
  }

  setupMiddleware() {
    // CORS configuration
    this.app.use(cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, etc.)
        if (!origin) return callback(null, true);

        if (this.config.ALLOWED_ORIGINS.includes(origin)) {
          return callback(null, true);
        }

        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

    // Body parsing
    this.app.use(bodyParser.json({ limit: '10mb' }));
    this.app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use(requestLogger);

    // Request metrics collection
    this.app.use(requestMetrics);

    // Session configuration
    this.app.use(session(this.config.SESSION_CONFIG));

    // Authentication middleware
    this.app.use((req, res, next) => {
      // Try JWT token first
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const token = authHeader.substring(7);
          const decoded = require('jsonwebtoken').verify(token, this.config.JWT_CONFIG.secret, {
            issuer: this.config.JWT_CONFIG.issuer,
            audience: this.config.JWT_CONFIG.audience
          });

          req.user = {
            id: decoded.userId,
            email: decoded.email,
            name: decoded.name
          };

          // Update session for backward compatibility
          if (req.session) {
            req.session.userId = decoded.userId;
            req.session.user = req.user;
          }
        } catch (error) {
          // Token invalid - return error for API requests
          if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'Invalid or expired token' });
          }
          // For non-API requests, continue to session check
        }
      }

      // Fallback to session auth
      if (!req.user && req.session && req.session.userId) {
        req.user = req.session.user;
      }

      next();
    });
  }

  setupBasicRoutes() {
    // Health check endpoint (always available, even during startup)
    this.app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // Health check endpoint (always available, even during startup)
    this.app.get('/api/health', (req, res) => {
      const uptime = process.uptime();
      const db = req.app.locals.db;

      let status = 'healthy';
      let dbStatus = 'not_initialized';

      if (db) {
        try {
          // Simple synchronous check - don't wait for database
          dbStatus = 'connected';
        } catch (error) {
          dbStatus = 'error';
          status = 'degraded';
        }
      } else {
        dbStatus = 'initializing';
        status = 'starting';
      }

      res.json({
        status: status,
        timestamp: new Date().toISOString(),
        uptime: `${Math.floor(uptime)}s`,
        database: dbStatus,
        environment: this.config.NODE_ENV,
        version: '1.0.0'
      });
    });

    // Routes will be registered by the main application
  }

  setupErrorHandling() {
    // Error handling middleware
    this.app.use(errorLogger);
    this.app.use((err, req, res, next) => {
      // Don't leak error details in production
      const isDevelopment = this.config.NODE_ENV === 'development';

      // Log security-related errors
      if (err.message && err.message.includes('CORS')) {
        securityLogger.suspiciousActivity(
          req.user?.id || 'anonymous',
          'cors_violation',
          { origin: req.headers.origin, error: err.message },
          req.ip,
          req.get('User-Agent')
        );
      }

      res.status(err.status || 500).json({
        error: isDevelopment ? err.message : 'Something went wrong!',
        ...(isDevelopment && { stack: err.stack })
      });
    });
  }

  start(port, callback) {
    if (this.serverStarted) {
      return;
    }
    this.serverStarted = true;

    if (this.serverStartTimeout) {
      clearTimeout(this.serverStartTimeout);
      this.serverStartTimeout = null;
    }

    console.log('Starting HTTP server...');

    // Serve static files from client build in production
    if (this.config.NODE_ENV === 'production') {
      // Path from server/modules to client/build: up two levels, then down to client/build
      const staticPath = path.join(__dirname, '../../client/build');
      this.app.use(express.static(staticPath));

      // Catch-all route to serve React app
      this.app.get('*', (req, res) => {
        res.sendFile(path.join(staticPath, 'index.html'));
      });
    }

    // Graceful shutdown handling
    const gracefulShutdown = (signal) => {
      console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
      metricsCollector.shutdown();
      if (this.server) {
        this.server.close(() => {
          console.log('✅ Server shutdown complete');
          process.exit(0);
        });
      }

      // Force shutdown after 10 seconds
      setTimeout(() => {
        console.error('❌ Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    // Start server
    console.log(`🔄 Attempting to start server on 0.0.0.0:${port}...`);
    this.server = this.app.listen(port, '0.0.0.0', () => {
      console.log(`🚀 Server successfully started on 0.0.0.0:${port}`);
      console.log(`🌍 Environment: ${this.config.NODE_ENV}`);
      console.log(`🔒 Security: ${this.config.NODE_ENV === 'production' ? 'Production mode enabled' : 'Development mode - NOT SECURE FOR PRODUCTION'}`);
      console.log(`📊 Rate limiting: ${this.config.RATE_LIMIT_MAX_REQUESTS} requests per ${this.config.RATE_LIMIT_WINDOW_MS / 1000}s`);
      console.log(`📈 Monitoring: Active - collecting metrics every 60s`);
      console.log('✅ Server initialization complete - ready to accept connections');

      if (callback) callback();
    });

    this.server.on('error', (error) => {
      console.error('❌ Server failed to start:', error.message);
      process.exit(1);
    });

    // Register shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  }
}

module.exports = ServerManager;
