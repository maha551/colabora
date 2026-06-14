const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const { requestLogger, errorLogger, securityLogger, logger } = require('../middleware/logger');
const { metricsCollector, requestMetrics } = require('../middleware/monitoring');
const { errorHandler, ApiError } = require('../middleware/errorHandler');
const transformRequest = require('../middleware/transformRequest');
const transformResponse = require('../middleware/transformResponse');
const HealthCheckService = require('./health');
const { createRedisClient, RedisStore } = require('../utils/redisStore');
const { createResponseCache } = require('../utils/responseCache');

// Server initialization and configuration
class ServerManager {
  constructor(config, dbManager = null) {
    this.config = config;
    this.app = null;
    this.server = null;
    this.serverStarted = false;
    this.serverStartTimeout = null;
    this.healthService = null;
    this.dbManager = dbManager;
    this.redisClient = null;
    this.redisStore = null;
  }

  async initialize(db = null) {
    this.app = express();

    // Initialize Redis client for rate limiting and WebSocket adapter
    this.redisClient = createRedisClient();
    if (this.redisClient) {
      this.redisStore = new RedisStore(this.redisClient);
      await this.redisStore.connect();
      // Store Redis client in app.locals for WebSocket to use
      this.app.locals.redisClient = this.redisClient;
    }
    this.app.locals.responseCache = createResponseCache(this.app.locals.redisClient || null);

    // Initialize health service (will be updated with DB later)
    this.healthService = new HealthCheckService(this.config, db);

    // Setup CORS first (before rate limiting) to handle preflight requests
    this.setupCORS();
    this.setupSecurity();
    this.setupMiddleware();
    this.setupBasicRoutes(); // Health endpoints
    // Note: Error handling is registered after routes in bootstrap.js
    // to ensure it catches errors from all routes

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

    // Create rate limit stores (Redis if available, otherwise in-memory)
    // Each rate limiter needs its own store instance with unique prefix
    const redisStore = this.redisStore; // Capture for closure
    
    // Helper to create a store with a unique prefix
    const createStore = (prefix) => {
      if (redisStore && redisStore.isConnected) {
        // Create a new store instance with unique prefix for this limiter
        // express-rate-limit requires each limiter to have its own store instance
        return {
          async increment(key) {
            // Use prefix to namespace keys per limiter
            return await redisStore.increment(`${prefix}:${key}`);
          },
          async decrement(key) {
            return await redisStore.decrement(`${prefix}:${key}`);
          },
          async resetKey(key) {
            return await redisStore.resetKey(`${prefix}:${key}`);
          }
        };
      }
      // In-memory store (undefined = default in-memory store)
      return undefined;
    };

    if (redisStore && redisStore.isConnected) {
      logger.info('Rate limiting using Redis store (shared across instances)');
    } else {
      logger.info('Rate limiting using in-memory store (single instance only)');
    }

    const skipRateLimitInTests = () => process.env.NODE_ENV === 'test';

    // Rate limiting - separate limits for auth vs other endpoints
    // Optimized for 300 concurrent users: increased limits, better skip logic
    const authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: this.config.NODE_ENV === 'production' ? 10 : 50,
      store: createStore('auth'), // Unique store instance for auth limiter
      message: {
        error: 'Too many authentication attempts, please try again later.'
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
          userAgent: req.get('User-Agent'),
          type: 'auth'
        });
        // Rate limit window is 15 minutes = 900 seconds
        const retryAfterSeconds = 15 * 60; // 900 seconds
        res.status(429).json({
          error: 'Too many authentication attempts. Please try again in 15 minutes.',
          retryAfter: retryAfterSeconds
        });
      },
      // Skip OPTIONS requests (CORS preflight) - must not be rate limited
      // Skip logout endpoint from auth rate limiting (cleanup operation, not auth attempt)
      // Skip /me endpoint - it's a read-only auth check, not an authentication attempt
      // Skip when database is unavailable (system error, not auth attempt)
      skip: (req) => {
        if (skipRateLimitInTests()) return true;
        if (req.method === 'OPTIONS') return true;
        
        // Skip rate limiting when database is unavailable (system error, not auth attempt)
        // This prevents counting system errors as failed authentication attempts
        // Check both dbManager (initialization) and dbAvailable (runtime status)
        if (!req.app.locals.dbManager || 
            !req.app.locals.db || 
            req.app.locals.dbAvailable === false) {
          return true;
        }
        
        // Handle both full path (/api/auth/me) and relative path (/me)
        // req.path can be either depending on when middleware runs
        // Also check req.url and req.originalUrl for better path detection
        const path = req.path || req.url || req.originalUrl || '';
        const normalizedPath = path.split('?')[0]; // Remove query string
        
        // Check if this is the /me endpoint (read-only auth check)
        if (normalizedPath === '/me' || 
            normalizedPath === '/api/auth/me' || 
            normalizedPath.endsWith('/me')) {
          return true;
        }
        
        // Skip logout endpoint from auth rate limiting
        if ((normalizedPath === '/logout' || 
             normalizedPath === '/api/auth/logout' || 
             normalizedPath.endsWith('/logout')) && 
            req.method === 'POST') {
          return true;
        }
        
        return false;
      }
    });

    // API rate limiter - optimized for 300 concurrent users
    // Increased limits: 1000 requests per 15 minutes (was 500)
    // This allows ~1.1 requests/second per user, which is reasonable for active discussion
    const apiLimiter = rateLimit({
      windowMs: this.config.RATE_LIMIT_WINDOW_MS,
      max: this.config.RATE_LIMIT_MAX_REQUESTS,
      store: createStore('api'), // Unique store instance for API limiter
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
          userAgent: req.get('User-Agent'),
          type: 'api'
        });
        const retryAfterSeconds = Math.ceil(this.config.RATE_LIMIT_WINDOW_MS / 1000);
        res.set('Retry-After', retryAfterSeconds.toString());
        res.status(429).json({
          error: 'Too many requests from this IP, please try again later.',
          retryAfter: retryAfterSeconds
        });
      },
      // Skip rate limiting for:
      // 1. OPTIONS requests (CORS preflight) - must not be rate limited
      // 2. Vote endpoints (they're user actions, not automated)
      // 3. Document creation (user action, not automated polling)
      // 4. Paragraph creation (user action, not automated polling)
      // 5. Batch document endpoint (used by activity feed, already optimized)
      // 6. Health check endpoints (monitoring)
      // 7. Read-only GET endpoints for documents (frequently accessed, low risk)
      skip: (req) => {
        if (skipRateLimitInTests()) return true;
        // Always skip OPTIONS requests (CORS preflight)
        if (req.method === 'OPTIONS') {
          return true;
        }
        const path = req.path || req.url || req.originalUrl || '';
        const normalizedPath = path.split('?')[0];
        // Skip /api/auth/me - cheap session check, called once per load
        if (path === '/api/auth/me' || path === '/auth/me' || path.endsWith('/me')) {
          return true;
        }
        // Skip health check endpoints (path is '/health' when limiter is mounted at /api)
        if (path === '/health' || path.startsWith('/api/health')) {
          return true;
        }
        // Skip vote endpoints (critical user actions)
        if (path.includes('/vote') && req.method === 'POST') {
          return true;
        }
        // Skip document creation - it's a user action, not automated polling
        if ((normalizedPath === '/api/documents' || normalizedPath === '/documents' || normalizedPath.endsWith('/documents'))
            && req.method === 'POST') {
          return true;
        }
        // Skip paragraph creation - it's a user action, not automated polling
        if (path.includes('/paragraphs') && req.method === 'POST') {
          return true;
        }
        // Skip batch endpoint - already optimized and used by activity feed
        if (path === '/api/documents/batch' && req.method === 'POST') {
          return true;
        }
        // Skip read-only GET requests for documents (frequently accessed, low abuse risk)
        // This helps with 300 users frequently refreshing document views
        if (req.method === 'GET' && (
          path.startsWith('/api/documents/') && 
          !path.includes('/vote') && 
          !path.includes('/export')
        )) {
          return true;
        }
        // Skip public guest scheduling (has dedicated limiters)
        if (path.startsWith('/public/guest')) {
          return true;
        }
        if (path.startsWith('/public/contact')) {
          return true;
        }
        // Skip Telegram webhook (has dedicated limiter in route module)
        if (path.startsWith('/webhooks/telegram')) {
          return true;
        }
        return false;
      }
    });

    const guestLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: this.config.GUEST_RATE_LIMIT_MAX,
      store: createStore('guest'),
      message: { error: 'Too many requests. Please try again later.' },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        securityLogger.rateLimitHit(req.ip, req.path, req.get('User-Agent'));
        res.status(429).json({
          error: 'Too many requests. Please try again later.',
          retryAfter: 15 * 60
        });
      },
      skip: (req) => skipRateLimitInTests() || req.method === 'OPTIONS'
    });

    const guestPutLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: this.config.GUEST_PUT_RATE_LIMIT_MAX,
      store: createStore('guest_put'),
      message: { error: 'Too many save attempts. Please try again later.' },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        securityLogger.rateLimitHit(req.ip, req.path, req.get('User-Agent'));
        res.status(429).json({
          error: 'Too many save attempts. Please try again later.',
          retryAfter: 15 * 60
        });
      },
      skip: (req) => skipRateLimitInTests() || req.method !== 'PUT'
    });

    const contactLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: this.config.CONTACT_RATE_LIMIT_MAX,
      store: createStore('contact'),
      message: { error: 'Too many contact requests. Please try again later.' },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        securityLogger.rateLimitHit(req.ip, req.path, req.get('User-Agent'));
        res.status(429).json({
          error: 'Too many contact requests. Please try again later.',
          retryAfter: 15 * 60
        });
      },
      skip: (req) => skipRateLimitInTests() || req.method === 'OPTIONS'
    });

    // Apply guest limiters before general API limiter
    this.app.use('/api/public/guest', guestLimiter);
    this.app.use('/api/public/guest', guestPutLimiter);
    this.app.use('/api/public/contact', contactLimiter);

    // Apply auth limiter to auth endpoints
    this.app.use('/api/auth', authLimiter);
    // Apply general API limiter to all other API endpoints
    this.app.use('/api', apiLimiter);
  }

  setupCORS() {
    // CORS configuration - must be before rate limiting to handle preflight requests
    const allowedOrigins = new Set(
      (this.config.ALLOWED_ORIGINS || [])
        .map(o => o && o.trim())
        .filter(Boolean)
    );
    if (this.config.FRONTEND_URL) {
      allowedOrigins.add(this.config.FRONTEND_URL);
    }

    // In development, be more permissive with CORS
    const isDevelopment = this.config.NODE_ENV === 'development';

    // Add middleware before CORS to handle health checks and same-origin requests
    // This allows us to access the full request object to check paths
    this.app.use((req, res, next) => {
      // Mark health check endpoints to bypass CORS origin check
      const isHealthCheck = req.path === '/health' || 
                           req.path === '/api/health' || 
                           req.path === '/api/health/ready' ||
                           (req.url && (req.url.startsWith('/health') || req.url.startsWith('/api/health')));
      
      if (isHealthCheck && !req.headers.origin) {
        // Health checks without origin - set a flag that CORS can check
        req._isHealthCheck = true;
      }
      
      // Check if request is same-origin (no origin header + host matches allowed origin)
      if (!req.headers.origin && req.headers.host) {
        const protocol = req.protocol || (req.secure ? 'https:' : 'http:') || 'https:';
        const hostOrigin = `${protocol}//${req.headers.host}`;
        
        const isSameOrigin = Array.from(allowedOrigins).some(allowedOrigin => {
          try {
            const allowedUrl = new URL(allowedOrigin);
            const requestUrl = new URL(hostOrigin);
            return allowedUrl.hostname === requestUrl.hostname && 
                   allowedUrl.protocol === requestUrl.protocol;
          } catch (e) {
            return allowedOrigin === hostOrigin || 
                   allowedOrigin.replace(/^https?:\/\//, '') === req.headers.host;
          }
        });
        
        if (isSameOrigin) {
          req._isSameOrigin = true;
        }
      }
      
      next();
    });

    this.app.use(cors({
      origin: (origin, callback) => {
        // CORS library passes origin as string (or undefined), not request object
        // We use req._isHealthCheck and req._isSameOrigin flags set by middleware above
        
        // Allow requests with no origin header
        if (!origin) {
          // Note: We can't access req here, but the middleware above sets flags
          // For health checks and same-origin requests, we need to allow them
          // Since we can't check the flags here, we'll use a different approach:
          // Allow all requests without origin in production if they're same-origin
          // This is safe because same-origin requests don't send origin headers
          
          // In development, allow origin-less requests (mobile apps, Postman, etc.)
          if (isDevelopment) {
            return callback(null, true);
          }
          
          // In production, allow requests without origin header
          // This handles:
          // 1. Same-origin requests (which don't send origin headers)
          // 2. Health checks (which don't send origin headers)
          // Security is maintained because we still validate origins when present
          return callback(null, true);
        }

        // Ensure origin is a string before processing
        if (typeof origin !== 'string') {
          logger.warn('CORS received invalid origin type', { 
            origin, 
            type: typeof origin
          });
          return callback(new Error('Invalid origin'));
        }

        // In development, allow all localhost origins (any port) and 127.0.0.1
        if (isDevelopment) {
          if (origin.startsWith('http://localhost:') || 
              origin.startsWith('http://127.0.0.1:') ||
              origin.startsWith('https://localhost:') ||
              origin.startsWith('https://127.0.0.1:') ||
              origin === 'http://localhost' ||
              origin === 'http://127.0.0.1' ||
              origin === 'https://localhost' ||
              origin === 'https://127.0.0.1') {
            logger.debug('CORS allowing localhost origin in development', { origin });
            return callback(null, true);
          }
        }

        // Check allowed origins list
        if (allowedOrigins.has(origin)) {
          return callback(null, true);
        }

        // Log the blocked origin for debugging
        logger.warn('CORS blocked origin', { 
          origin, 
          allowedOrigins: Array.from(allowedOrigins).join(', ') || 'none',
          environment: this.config.NODE_ENV
        });
        return callback(new Error(`Not allowed by CORS: ${origin}`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-Requested-With'],
      exposedHeaders: ['Content-Type', 'Authorization'],
      preflightContinue: false,
      optionsSuccessStatus: 204,
      maxAge: isDevelopment ? 86400 : 3600 // Cache preflight for 24h in dev, 1h in prod
    }));
  }

  setupMiddleware() {

    // Body parsing
    this.app.use(bodyParser.json({ limit: '10mb' }));
    this.app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

    // Request transformation (convert camelCase to snake_case for database)
    this.app.use(transformRequest);

    // Request logging
    this.app.use(requestLogger);

    // Request metrics collection
    this.app.use(requestMetrics);

    // Response transformation (convert snake_case to camelCase, normalize booleans)
    // Apply to all API routes
    this.app.use('/api', transformResponse);

    // Note: Authentication is handled by route-level middleware (requireAuth, requireAdmin)
    // in server/middleware/auth.js. Routes explicitly declare their auth requirements.
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
    this.app.get('/api/health', async (req, res) => {
      const uptime = process.uptime();
      const db = req.app.locals.db;

      let status = 'healthy';
      let dbStatus = 'not_initialized';

      if (db) {
        try {
          // Actually query the database to verify connectivity
          const dbCheckPromise = Promise.race([
            (async () => {
              const result = await db.raw('SELECT 1 as test');
              const row = result.rows?.[0] || result[0];
              if (row && row.test === 1) {
                return true;
              } else {
                throw new Error('Database test query returned invalid result');
              }
            })(),
            new Promise((_, reject) => {
              setTimeout(() => {
                reject(new Error('Database query timeout'));
              }, 2000); // 2 second timeout
            })
          ]);
          await dbCheckPromise;
          dbStatus = 'connected';
        } catch (error) {
          dbStatus = 'error';
          status = 'degraded';
          logger.warn('Database health check failed', { error: error.message });
        }
      } else {
        dbStatus = 'initializing';
        status = 'starting';
      }

      // Set headers to identify this as a health check response
      res.setHeader('X-Health-Check', 'true');
      res.setHeader('X-Service-Name', 'colabora-app');
      
      res.status(200).json({
        status: status,
        timestamp: new Date().toISOString(),
        uptime: `${Math.floor(uptime)}s`,
        database: dbStatus,
        environment: this.config.NODE_ENV,
        version: '1.0.0',
        service: 'colabora-app',
        endpoint: 'basic-health-check',
        purpose: 'service-monitoring'
      });
    });

    // Note: /api/health/ready endpoint is registered in bootstrap.js
    // to ensure it's available immediately and handles all states properly
    // Routes will be registered by the main application
  }

  /**
   * Register error handling middleware
   * Must be called AFTER all routes are registered
   * This ensures errors from routes are properly caught
   */
  registerErrorHandler() {
    // Error logging middleware (must be before error handler)
    this.app.use(errorLogger);
    // Use the standardized error handler from errorHandler.js
    // This properly handles ApiError instances with statusCode and toJSON()
    // Must be the last middleware registered
    this.app.use(errorHandler);
    logger.info('Error handler middleware registered');
  }

  /**
   * Close the server gracefully
   * @returns {Promise<void>}
   */
  async close() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('Server shutdown complete');
          this.server = null;
          this.serverStarted = false;
          resolve();
        });
      } else {
        resolve();
      }
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

    logger.info('Starting HTTP server');

    // Serve static files from client build in production
    if (this.config.NODE_ENV === 'production') {
      // Path from server/modules to client/build: up two levels, then down to client/build
      const staticPath = path.join(__dirname, '../../client/build');
      this.app.use(express.static(staticPath));

      // Catch-all route to serve React app (for SPA routing)
      this.app.get('*', (req, res) => {
        // Skip API routes
        if (req.path.startsWith('/api')) {
          const err = ApiError.notFound('API endpoint');
          return res.status(err.statusCode).json(err.toJSON());
        }
        // Static legal markdown and locale JSON must not fall back to index.html
        if (
          (req.path.startsWith('/legal/') && req.path.endsWith('.md'))
          || (req.path.startsWith('/locales/') && req.path.endsWith('.json'))
        ) {
          return res.status(404).send('Not found');
        }
        res.sendFile(path.join(staticPath, 'index.html'));
      });
    }

    // Graceful shutdown handling
    const gracefulShutdown = async (signal) => {
      logger.info('Received shutdown signal, shutting down gracefully', { signal });
      metricsCollector.shutdown();
      
      // Set timeout FIRST to ensure it's available in callbacks
      const shutdownTimeout = setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000); // 30 seconds to allow in-flight queries to complete
      
      // Stop accepting new requests
      if (this.server) {
        this.server.close(() => {
          logger.info('Server stopped accepting new connections');
        });
      }
      
      // Wait for in-flight queries to complete (up to 30 seconds)
      if (this.dbManager) {
        try {
          const connection = this.dbManager.getConnection();
          if (connection && connection.getPoolStats) {
            const stats = connection.getPoolStats();
            logger.info('Database connection pool stats before shutdown', { stats });
          }
          
          // Close database connection pool (waits for in-flight queries)
          await this.dbManager.close();
          logger.info('Database connection pool closed');
        } catch (err) {
          logger.error('Error closing database connection pool', { error: err.message });
        }
      }
      
      clearTimeout(shutdownTimeout);
      logger.info('Server shutdown complete');
      process.exit(0);
    };

    // Start server (Windows often blocks listen on 0.0.0.0 for excluded ports; dev binds loopback)
    const listenHost =
      process.env.LISTEN_HOST ||
      (this.config.NODE_ENV === 'development' ? '127.0.0.1' : '0.0.0.0');

    logger.info('Attempting to start server', { port, host: listenHost });
    this.server = this.app.listen(port, listenHost, () => {
      logger.info('Server successfully started', { 
        port, 
        host: listenHost,
        environment: this.config.NODE_ENV,
        security: this.config.NODE_ENV === 'production' ? 'Production mode enabled' : 'Development mode - NOT SECURE FOR PRODUCTION',
        rateLimit: `${this.config.RATE_LIMIT_MAX_REQUESTS} API requests per ${this.config.RATE_LIMIT_WINDOW_MS / 1000}s, 50 auth requests per 15min`,
        monitoring: 'Active - collecting metrics every 60s'
      });
      
      // Initialize WebSocket server for real-time updates (async)
      (async () => {
        try {
          const webSocketManager = require('./websocket');
          // Get database reference BEFORE initializing to ensure it's set before connection handlers
          const knex = this.app.locals.knex || this.app.locals.db;
          // Pass Redis client and database reference for multi-instance support and authorization
          const initResult = await webSocketManager.initialize(this.server, this.redisClient, knex);
          if (initResult && initResult.success === false) {
            logger.warn('WebSocket initialization failed, server will continue in degraded mode', {
              error: initResult.error
            });
            this.app.locals.webSocketAvailable = false;
          } else {
            // Database reference is already set in initialize() if provided
            // But also call setDatabase() here for consistency and in case database wasn't available yet
            if (knex) {
              webSocketManager.setDatabase(knex);
              logger.debug('WebSocket authorization enabled with Knex database reference');
            } else {
              logger.warn('WebSocket initialized but database not available for authorization checks');
            }
            logger.info('WebSocket server initialized - real-time updates enabled');
            this.app.locals.webSocketAvailable = true;
          }
        } catch (wsError) {
          logger.error('WebSocket initialization error, server will continue in degraded mode', {
            error: wsError.message,
            stack: wsError.stack
          });
          this.app.locals.webSocketAvailable = false;
          // Don't throw - allow server to continue without WebSocket
        }
      })();
      
      logger.info('Server initialization complete - ready to accept connections');

      if (callback) callback();
    });

    this.server.on('error', (error) => {
      logger.error('Server failed to start', { error: error.message, stack: error.stack, port });

      if (this.config.NODE_ENV === 'test') {
        // In test, do not exit - Jest workers would be killed (process.exit(1))
        logger.error('Test mode: Server error logged but not exiting');
      } else {
        // Fail fast outside tests to let the orchestrator restart cleanly.
        process.exit(1);
      }
    });

    // Register shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  }
}

module.exports = ServerManager;
