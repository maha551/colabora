/**
 * Application Bootstrap
 * Handles application initialization, database setup, and server startup
 */

const config = require('./config');
const DatabaseManager = require('./database/DatabaseManager');
const ServerManager = require('./modules/server');
const { logger } = require('./middleware/logger');
const TransactionManager = require('./database/services/TransactionManager');
const { initializeHttpAgents } = require('./utils/httpAgent');

/**
 * Initialize and start the application
 * @param {Object} options - Startup options
 * @param {boolean} options.returnServer - Whether to return server instance for testing
 * @param {number} options.port - Override port
 * @returns {Promise<http.Server|void>} Server instance if returnServer is true
 */
async function startApplication(options = {}) {
  let dbManager;
  let serverManager;
  let serverInstance;
  let fatalExitScheduled = false;

  const scheduleFatalExit = (reason) => {
    if (fatalExitScheduled) {
      return;
    }
    fatalExitScheduled = true;
    logger.error('Scheduling fatal process exit', { reason });
    setTimeout(() => {
      process.exit(1);
    }, 250);
  };

  try {
    // Initialize HTTP agents early for connection pooling (before any HTTP requests)
    initializeHttpAgents();
    
    logger.info('Starting colabora server', { 
      environment: config.NODE_ENV,
      port: config.PORT 
    });

    // Register notification channel adapters (web push, telegram, etc.)
    require('./modules/notificationChannels');

    // Check for configuration validation errors
    if (config.validationErrors && config.validationErrors.length > 0) {
      const errorMessages = config.validationErrors.join('; ');
      logger.error('Configuration validation failed', { errors: config.validationErrors });
      
      // Fail fast in all environments so orchestrators can recover reliably.
      logger.error('Configuration errors prevent startup');
      if (options.returnServer) {
        throw new Error(`Configuration validation failed: ${errorMessages}`);
      } else {
        process.exit(1);
      }
    }

    // Override config if options provided
    const runtimeConfig = { ...config };
    if (options.port) {
      logger.info('Overriding port', { 
        oldPort: runtimeConfig.PORT, 
        newPort: options.port 
      });
      runtimeConfig.PORT = options.port;
    }

    logger.info('Server configuration', {
      environment: runtimeConfig.NODE_ENV,
      port: runtimeConfig.PORT,
      database: runtimeConfig.DATABASE_URL
    });

    // Add global error handlers for production stability
    if (runtimeConfig.NODE_ENV === 'production') {
      process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled Rejection', { 
          reason: reason?.message || String(reason),
          stack: reason?.stack 
        });
        scheduleFatalExit('unhandledRejection');
      });

      process.on('uncaughtException', (error) => {
        logger.error('Uncaught Exception', { 
          error: error.message,
          stack: error.stack 
        });
        scheduleFatalExit('uncaughtException');
      });
    }

    // Initialize database manager and connection
    logger.info('Initializing database');
    let db = null; // Declare db outside try block
    try {
      dbManager = new DatabaseManager(runtimeConfig);
      db = await dbManager.initialize();
      logger.info('Database initialized successfully');
    } catch (dbError) {
      logger.error('Database initialization failed', { 
        error: dbError.message,
        stack: dbError.stack 
      });
      
      // Fail fast in all environments.
      logger.error('Database initialization failed - shutting down');
      if (options.returnServer) {
        throw dbError;
      } else {
        process.exit(1);
      }
    }

    // Ensure database is available before proceeding.
    if (!db || !dbManager) {
      logger.error('Database not available - cannot start application');
      if (options.returnServer) {
        throw new Error('Database not available');
      } else {
        process.exit(1);
      }
    }

    // Initialize server manager
    logger.info('Initializing server');
    serverManager = new ServerManager(runtimeConfig, dbManager);
    const app = await serverManager.initialize();
    logger.info('Server initialized successfully');

    // Make database available to routes (might be null in production if DB failed)
    // Store both Knex instance (preferred) and db (backward compatibility)
    app.locals.knex = dbManager ? db : null; // Knex instance (preferred)
    app.locals.db = dbManager ? db : null; // Backward compatibility
    app.locals.dbManager = dbManager; // Store dbManager for recovery attempts
    app.locals.dbAvailable = !!dbManager;

    // Initialize background scheduler if database is available
    let scheduler = null;
    if (dbManager && db) {
      logger.info('Initializing background scheduler');
      try {
        const DocumentScheduler = require('./modules/scheduler');
        scheduler = new DocumentScheduler(db); // Pass Knex instance
        scheduler.start();
        logger.info('Background scheduler initialized');
      } catch (schedulerError) {
        logger.error('Failed to initialize scheduler', { 
          error: schedulerError.message 
        });
        // Don't fail startup for scheduler issues
      }
    }

    // Register routes
    registerRoutes(app);

    // Register error handler AFTER routes to ensure it catches all route errors
    // This must be the last middleware registered
    serverManager.registerErrorHandler();

    // Start database health monitor if database manager is available
    let healthMonitorInterval = null;
    if (dbManager) {
      logger.info('Starting database health monitor');
      healthMonitorInterval = startDatabaseHealthMonitor(dbManager, app, runtimeConfig);
    }

    // Start server and optionally return instance
    logger.info('Starting server');

    if (options.returnServer) {
      // Test mode: avoid binding a network port and return an unbound HTTP server for supertest.
      const http = require('http');
      const testServer = http.createServer(app);
      const closeResources = async () => {
        if (healthMonitorInterval) {
          clearInterval(healthMonitorInterval);
          healthMonitorInterval = null;
        }
        if (scheduler) {
          scheduler.stop();
        }
        if (dbManager) {
          await dbManager.close();
        }
      };

      testServer.app = app;
      testServer.stop = (callback) => {
        closeResources()
          .then(() => {
            if (typeof callback === 'function') callback();
          })
          .catch((err) => {
            logger.error('Error closing test app resources', { error: err.message, stack: err.stack });
            if (typeof callback === 'function') callback(err);
          });
      };

      logger.info('Server initialized in in-process test mode', { port: runtimeConfig.PORT });
      return testServer;
    } else {
      // Normal startup
      serverManager.start(runtimeConfig.PORT, () => {
        logger.info('Server started successfully', { port: runtimeConfig.PORT });
      });
    }

  } catch (error) {
    logger.error('Failed to start application', { 
      error: error.message,
      stack: error.stack 
    });

    // Clean up resources on failure
    if (dbManager) {
      try {
        await dbManager.close();
      } catch (cleanupError) {
        logger.error('Error during database cleanup', { error: cleanupError.message, stack: cleanupError.stack });
      }
    }

    if (options.returnServer) {
      throw error;
    } else {
      process.exit(1);
    }
  }
}

/**
 * Start database health monitor for periodic connection checks and automatic recovery
 * @param {DatabaseManager} dbManager - Database manager instance
 * @param {Express} app - Express application instance
 * @param {Object} config - Runtime configuration
 * @returns {NodeJS.Timeout} Interval ID for cleanup
 */
function startDatabaseHealthMonitor(dbManager, app, config) {
  const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
  let lastHealthCheck = Date.now();
  let consecutiveFailures = 0;
  const MAX_CONSECUTIVE_FAILURES = 3;

  const healthCheck = async () => {
    try {
      const isHealthy = await dbManager.isHealthy();
      const now = Date.now();

      if (isHealthy) {
        if (consecutiveFailures > 0) {
          logger.info('Database health check passed after previous failures', {
            consecutiveFailures,
            timeSinceLastCheck: now - lastHealthCheck
          });
          consecutiveFailures = 0;
        }

        // Update app.locals if database was recovered
        if (!app.locals.dbAvailable || !app.locals.db) {
          const restoredDb = dbManager.getInstance();
          app.locals.db = restoredDb;
          app.locals.knex = restoredDb;
          app.locals.dbAvailable = true;
          logger.info('Database availability restored in health monitor');
          
          // Update WebSocket manager with restored database reference
          try {
            const webSocketManager = require('./modules/websocket');
            if (webSocketManager.isInitialized()) {
              webSocketManager.setDatabase(restoredDb);
              logger.debug('WebSocket manager updated with restored database reference');
            }
          } catch (wsError) {
            logger.warn('Failed to update WebSocket manager with restored database reference', { 
              error: wsError.message 
            });
          }
        }

        lastHealthCheck = now;
      } else {
        consecutiveFailures++;
        
        // Check if pool is completely destroyed (total: 0) - requires immediate recovery
        let poolDestroyed = false;
        try {
          if (dbManager && dbManager.connection && typeof dbManager.connection.getPoolStats === 'function') {
            const poolStats = dbManager.connection.getPoolStats();
            if (poolStats && poolStats.total === 0) {
              poolDestroyed = true;
              logger.error('Database health check: pool destroyed (total: 0) - triggering immediate recovery', {
                poolStats,
                consecutiveFailures
              });
            }
          }
        } catch (statsError) {
          // If we can't get pool stats, the pool may be destroyed
          logger.warn('Database health check: unable to get pool stats - pool may be destroyed', {
            error: statsError.message
          });
          poolDestroyed = true;
        }
        
        logger.warn('Database health check failed', {
          consecutiveFailures,
          maxFailures: MAX_CONSECUTIVE_FAILURES,
          poolDestroyed
        });

        // If pool is destroyed or we've had multiple consecutive failures, attempt recovery
        // Pool destruction requires immediate recovery (don't wait for 3 failures)
        const shouldRecover = poolDestroyed || consecutiveFailures >= MAX_CONSECUTIVE_FAILURES;
        if (shouldRecover) {
          logger.info('Attempting automatic database recovery after consecutive failures', {
            consecutiveFailures
          });

          try {
            const recoverySucceeded = await dbManager.attemptRecovery();
            if (recoverySucceeded) {
              logger.info('Database recovery successful in health monitor');
              const recoveredDb = dbManager.getInstance();
              app.locals.db = recoveredDb;
              app.locals.knex = recoveredDb;
              app.locals.dbAvailable = true;
              consecutiveFailures = 0;
              
              // Update WebSocket manager with recovered database reference
              try {
                const webSocketManager = require('./modules/websocket');
                if (webSocketManager.isInitialized()) {
                  webSocketManager.setDatabase(recoveredDb);
                  logger.debug('WebSocket manager updated with recovered database reference');
                }
              } catch (wsError) {
                logger.warn('Failed to update WebSocket manager with recovered database reference', { 
                  error: wsError.message 
                });
              }
            } else {
              logger.warn('Database recovery failed in health monitor');
              app.locals.dbAvailable = false;
              app.locals.db = null;
            }
          } catch (recoveryError) {
            logger.error('Database recovery attempt threw error in health monitor', {
              error: recoveryError.message,
              stack: recoveryError.stack
            });
            app.locals.dbAvailable = false;
            app.locals.db = null;
          }
        } else {
          // Mark as unavailable but don't attempt recovery yet
          app.locals.dbAvailable = false;
        }
      }
    } catch (error) {
      logger.error('Database health monitor error', {
        error: error.message,
        stack: error.stack
      });
      consecutiveFailures++;
      app.locals.dbAvailable = false;
      app.locals.db = null;

      // Attempt recovery on error
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        try {
          const recoverySucceeded = await dbManager.attemptRecovery();
          if (recoverySucceeded) {
            try {
              logger.info('Database recovery successful after health monitor error');
              const recoveredDb = dbManager.getInstance();
              app.locals.db = recoveredDb;
              app.locals.knex = recoveredDb;
              app.locals.dbAvailable = true;
              consecutiveFailures = 0;
              
              // Update WebSocket manager with recovered database reference
              try {
                const webSocketManager = require('./modules/websocket');
                if (webSocketManager.isInitialized()) {
                  webSocketManager.setDatabase(recoveredDb);
                  logger.debug('WebSocket manager updated with recovered database reference after error');
                }
              } catch (wsError) {
                logger.warn('Failed to update WebSocket manager with recovered database reference', { 
                  error: wsError.message 
                });
              }
            } catch (instanceError) {
              logger.error('Failed to get database instance after recovery in health monitor', {
                error: instanceError.message,
                stack: instanceError.stack
              });
              app.locals.dbAvailable = false;
              app.locals.db = null;
            }
          }
        } catch (recoveryError) {
          logger.error('Recovery failed after health monitor error', {
            error: recoveryError.message
          });
        }
      }
    }
  };

  // Start periodic health checks
  const intervalId = setInterval(healthCheck, HEALTH_CHECK_INTERVAL);
  
  // Run initial health check immediately
  healthCheck().catch(err => {
    logger.error('Initial database health check failed', { error: err.message });
  });

  logger.info('Database health monitor started', {
    intervalMs: HEALTH_CHECK_INTERVAL,
    maxConsecutiveFailures: MAX_CONSECUTIVE_FAILURES
  });

  return intervalId;
}

/**
 * Register all application routes
 * @param {Object} app - Express application instance
 */
function registerRoutes(app) {
  logger.info('Registering routes');

  // Import route handlers
  const authRoutes = require('./routes/auth');
  const documentRoutes = require('./routes/documents');
  const paragraphRoutes = require('./routes/paragraphs');
  const proposalRoutes = require('./routes/proposals');
  const voteRoutes = require('./routes/votes');
  const commentRoutes = require('./routes/comments');
  const commentUpvoteRoutes = require('./routes/comment-upvotes');
  const activityRoutes = require('./routes/activity');
  const structureProposalRoutes = require('./routes/structure-proposals');
  const structureHistoryRoutes = require('./routes/structure-history');
  const documentTreeProposalRoutes = require('./routes/document-tree-proposals');
  const treeProposalCommentRoutes = require('./routes/tree-proposal-comments');
  const pendingVotesRoutes = require('./routes/pending-votes');
  const pendingDecisionsRoutes = require('./routes/pending-decisions');
  const debatedProposalsRoutes = require('./routes/debated-proposals');
  const agreedVersionsRoutes = require('./routes/agreed-versions');
  const decisionsRoutes = require('./routes/decisions');
  const calendarRoutes = require('./routes/calendar');
  const organizationRoutes = require('./routes/organizations');
  const governanceRoutes = require('./routes/governance');
  const notificationRoutes = require('./routes/notifications');
  const adminRoutes = require('./routes/admin');
  const searchRoutes = require('./routes/search');
  const geocodeRoutes = require('./routes/geocode');
  const exportRoutes = require('./routes/export');
  const errorReportsRoutes = require('./routes/error-reports');
  const ballotExportRoutes = require('./routes/ballot-export');
  const voteVerificationRoutes = require('./routes/vote-verification');
  const configRoutes = require('./routes/config');
  const guestSchedulingRoutes = require('./routes/public/guest-scheduling');
  const contactRoutes = require('./routes/public/contact');
  const telegramWebhookRoutes = require('./routes/webhooks/telegram');

  // Health check routes - work even without database
  app.get('/api/health/detailed', async (req, res) => {
    // Set headers to identify this as a health check response
    res.setHeader('X-Health-Check', 'true');
    res.setHeader('X-Service-Name', 'colabora-app');
    
    try {
      // Check WebSocket status
      const webSocketManager = require('./modules/websocket');
      const webSocketAvailable = webSocketManager.isInitialized();

      if (!req.app.locals.dbAvailable) {
        res.status(200).json({
          status: 'degraded',
          message: 'Database unavailable',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          database: false,
          webSocket: webSocketAvailable,
          webSocketAvailable: webSocketAvailable,
          service: 'colabora-app',
          endpoint: 'detailed-health-check',
          purpose: 'system-monitoring'
        });
        return;
      }

      const healthService = new (require('./modules/health'))(config, req.app.locals.db);
      const health = await healthService.getDetailedHealth();
      
      // Add WebSocket status and identification to health response
      health.webSocket = webSocketAvailable;
      health.webSocketAvailable = webSocketAvailable;
      health.service = 'colabora-app';
      health.endpoint = 'detailed-health-check';
      health.purpose = 'system-monitoring';
      
      res.status(200).json(health);
    } catch (error) {
      logger.error('Health check error', { error: error.message });
      // Always return HTTP 200 with degraded status to prevent container restarts
      res.status(200).json({
        status: 'degraded',
        message: error.message,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: false,
        service: 'colabora-app',
        endpoint: 'detailed-health-check',
        purpose: 'system-monitoring'
      });
    }
  });

  // Liveness endpoint - just checks if the process is alive
  app.get('/api/health/live', (req, res) => {
    const webSocketManager = require('./modules/websocket');
    const webSocketAvailable = webSocketManager.isInitialized();
    
    // Set headers to identify this as a health check response
    res.setHeader('X-Health-Check', 'true');
    res.setHeader('X-Service-Name', 'colabora-app');
    
    res.status(200).json({
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      webSocket: webSocketAvailable,
      webSocketAvailable: webSocketAvailable,
      service: 'colabora-app',
      endpoint: 'liveness-check',
      purpose: 'process-monitoring'
    });
  });

  // Readiness endpoint - returns non-2xx when dependencies are unavailable.
  // Available immediately, even before database initialization.
  app.get('/api/health/ready', async (req, res) => {
    const startTime = Date.now();
    let healthCheckTimeout = null;
    let dbCheckTimeout = null;
    let responseSent = false;

    // Log health check request at debug level (health checks happen frequently)
    logger.debug('Health check request received', {
      path: req.path,
      method: req.method,
      ip: req.ip
    });

    // Check WebSocket status from app.locals (cached, no module loading)
    let webSocketAvailable = false;
    try {
      // Use cached WebSocket status if available, otherwise check module
      if (req.app.locals.webSocketAvailable !== undefined) {
        webSocketAvailable = req.app.locals.webSocketAvailable;
      } else {
        const webSocketManager = require('./modules/websocket');
        webSocketAvailable = webSocketManager.isInitialized();
        req.app.locals.webSocketAvailable = webSocketAvailable; // Cache it
      }
    } catch (wsError) {
      logger.debug('Error checking WebSocket status in health check', { error: wsError.message });
      webSocketAvailable = false;
    }

    // Helper function to send response safely
    const sendResponse = (status, data) => {
      if (responseSent) {
        logger.warn('Attempted to send duplicate health check response', { status, data });
        return;
      }
      responseSent = true;
      
      const responseTime = Date.now() - startTime;
      
      // Clear all timeouts
      if (healthCheckTimeout) {
        clearTimeout(healthCheckTimeout);
        healthCheckTimeout = null;
      }
      if (dbCheckTimeout) {
        clearTimeout(dbCheckTimeout);
        dbCheckTimeout = null;
      }

      const readinessCode = status === 'ready' ? 200 : 503;
      // Add clear identification that this is a health check endpoint.
      const response = {
        status: status,
        ...data,
        webSocket: webSocketAvailable,
        webSocketAvailable: webSocketAvailable,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        responseTimeMs: responseTime,
        service: 'colabora-app',
        endpoint: 'readiness-check',
        purpose: 'readiness-monitoring'
      };
      
      // Set headers to identify this as a health check response
      res.setHeader('X-Health-Check', 'true');
      res.setHeader('X-Service-Name', 'colabora-app');

      // Only log slow health checks (> 500ms) or errors at info level
      if (responseTime > 500 || status !== 'ready') {
        logger.info('Health check response', {
          status: status,
          responseTime: `${responseTime}ms`,
          database: data.database,
          databaseAvailable: data.databaseAvailable,
          webSocket: webSocketAvailable
        });
      } else {
        logger.debug('Health check response', {
          status: status,
          responseTime: `${responseTime}ms`
        });
      }

      res.status(readinessCode).json(response);
    };

    // Set overall timeout (2s - allows time for PostgreSQL connections)
    // This ensures we respond quickly but allows for slower database connections
    healthCheckTimeout = setTimeout(() => {
      if (!responseSent) {
        logger.warn('Health check timeout - responding with degraded status', {
          elapsed: `${Date.now() - startTime}ms`
        });
        sendResponse('degraded', {
          message: 'Health check timeout',
          database: false,
          databaseAvailable: false,
          webSocket: webSocketAvailable,
          webSocketAvailable: webSocketAvailable
        });
      }
    }, 2000);

    try {
      // Check for configuration errors first
      if (config.validationErrors && config.validationErrors.length > 0) {
        logger.warn('Health check: Configuration errors detected');
        sendResponse('degraded', {
          message: 'Configuration errors detected',
          configurationErrors: config.validationErrors,
          database: false,
          databaseAvailable: false,
          webSocket: webSocketAvailable,
          webSocketAvailable: webSocketAvailable
        });
        return;
      }

      // Check if database is initialized
      const dbAvailable = req.app.locals.dbAvailable;
      const db = req.app.locals.db;

      logger.debug('Health check state', {
        dbAvailable: dbAvailable,
        dbExists: !!db,
        dbAvailableType: typeof dbAvailable
      });

      // If database is not yet initialized, return starting status
      if (dbAvailable === undefined || db === undefined) {
        logger.debug('Health check: Application starting up');
        sendResponse('starting', {
          message: 'Application is starting up',
          database: false,
          databaseAvailable: false,
          webSocket: webSocketAvailable,
          webSocketAvailable: webSocketAvailable
        });
        return;
      }

      // If database is marked as unavailable, return degraded
      if (dbAvailable === false || !db) {
        logger.debug('Health check: Database unavailable');
        sendResponse('degraded', {
          message: 'Database unavailable',
          database: false,
          databaseAvailable: false,
          webSocket: webSocketAvailable,
          webSocketAvailable: webSocketAvailable
        });
        return;
      }

      // Verify database with a quick query (200ms timeout - SQLite should respond instantly)
      let dbHealthy = false;
      const dbCheckStartTime = Date.now();
      try {
        logger.debug('Health check: Starting database verification');
        const dbCheckPromise = Promise.race([
          (async () => {
            // Use a simple query that should be fast
            const row = await TransactionManager.query(db, 'SELECT 1 as test');
            
            if (row && row.test === 1) {
              return true;
            } else {
              throw new Error('Database test query returned invalid result');
            }
          })(),
          new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error('Database check timeout'));
            }, 1500); // 1.5s timeout - PostgreSQL connections may take longer, especially on first connect
          })
        ]);

        dbHealthy = await dbCheckPromise;
        const dbCheckTime = Date.now() - dbCheckStartTime;
        logger.debug('Health check: Database verification successful', {
          dbCheckTime: `${dbCheckTime}ms`
        });
      } catch (dbError) {
        // Database check failed - mark as unavailable and return non-ready
        const dbCheckTime = Date.now() - dbCheckStartTime;
        logger.warn('Database health check failed', { 
          error: dbError.message,
          errorType: dbError.name,
          dbCheckTime: `${dbCheckTime}ms`
        });
        
        // Mark database as unavailable for future requests
        req.app.locals.dbAvailable = false;
        dbHealthy = false;
      }

      // Determine final status
      const status = dbHealthy ? 'ready' : 'degraded';
      
      // Only log at info level if there's an issue or if it's slow
      const totalTime = Date.now() - startTime;
      if (status !== 'ready' || totalTime > 500) {
        logger.info('Health check: Final status determined', {
          status: status,
          dbHealthy: dbHealthy,
          dbAvailable: dbAvailable && !!db,
          responseTime: `${totalTime}ms`
        });
      } else {
        logger.debug('Health check: Final status determined', {
          status: status,
          responseTime: `${totalTime}ms`
        });
      }
      
      sendResponse(status, {
        database: dbHealthy,
        databaseAvailable: dbAvailable && !!db,
        webSocket: webSocketAvailable,
        webSocketAvailable: webSocketAvailable
      });

    } catch (error) {
      // Catch any unexpected errors and report non-ready
      logger.error('Readiness check error', { 
        error: error.message,
        stack: error.stack,
        errorType: error.name,
        elapsed: `${Date.now() - startTime}ms`
      });
      
      sendResponse('degraded', {
        message: 'Health check encountered an error',
        database: false,
        databaseAvailable: false,
        webSocket: webSocketAvailable,
        webSocketAvailable: webSocketAvailable
      });
    }
  });

  // Middleware to check database availability
  const requireDatabase = async (req, res, next) => {
    // If database was never initialized, return 503 immediately
    if (!req.app.locals.dbManager) {
      return res.status(503).json({
        error: 'Service temporarily unavailable',
        message: 'Database connection is not available',
        timestamp: new Date().toISOString()
      });
    }

    // Perform a quick health check
    let dbHealthy = false;
    try {
      if (!req.app.locals.db) {
        throw new Error('Database instance not available');
      }
      await TransactionManager.query(req.app.locals.db, 'SELECT 1');
      dbHealthy = true;
    } catch (error) {
      // Database connection lost - attempt recovery
      const errorMessage = error?.message || error?.toString() || String(error) || 'Unknown error';
      logger.warn('Database health check failed in middleware, attempting recovery', {
        error: errorMessage
      });

      try {
        const recoverySucceeded = await req.app.locals.dbManager.attemptRecovery();
        if (recoverySucceeded) {
          // Update app.locals with recovered database
          try {
            req.app.locals.db = req.app.locals.dbManager.getInstance();
            req.app.locals.dbAvailable = true;
            
            // Update WebSocket manager with recovered database reference
            try {
              const webSocketManager = require('./modules/websocket');
              if (webSocketManager.isInitialized()) {
                webSocketManager.setDatabase(req.app.locals.db);
                logger.debug('WebSocket authorization updated with recovered database');
              }
            } catch (wsError) {
              logger.warn('Failed to update WebSocket database reference', { error: wsError.message });
            }
            
            logger.info('Database recovery successful in middleware');
            dbHealthy = true;
          } catch (instanceError) {
            logger.error('Failed to get database instance after recovery', {
              error: instanceError.message,
              stack: instanceError.stack
            });
            req.app.locals.dbAvailable = false;
            req.app.locals.db = null;
          }
        } else {
          logger.warn('Database recovery failed in middleware');
          req.app.locals.dbAvailable = false;
        }
      } catch (recoveryError) {
        logger.error('Database recovery attempt threw error', {
          error: recoveryError.message,
          stack: recoveryError.stack
        });
        req.app.locals.dbAvailable = false;
      }
    }

    if (!dbHealthy) {
      return res.status(503).json({
        error: 'Database connection lost',
        message: 'The database connection is no longer available. Please try again later.',
        timestamp: new Date().toISOString()
      });
    }

    next();
  };

  // Register API routes with database availability checks
  app.use('/api/config', configRoutes);
  // Telegram webhook — no session auth; validated via X-Telegram-Bot-Api-Secret-Token
  app.use('/api/webhooks/telegram', requireDatabase, telegramWebhookRoutes);
  app.use('/api/public/guest', requireDatabase, guestSchedulingRoutes);
  app.use('/api/public/contact', contactRoutes);
  app.use('/api/auth', requireDatabase, authRoutes);
  app.use('/api/admin', requireDatabase, adminRoutes);
  app.use('/api/organizations', requireDatabase, organizationRoutes);
  app.use('/api/notifications', requireDatabase, notificationRoutes);
  app.use('/api/governance', requireDatabase, governanceRoutes);
  app.use('/api/pending-votes', requireDatabase, pendingVotesRoutes);
  app.use('/api/pending-decisions', requireDatabase, pendingDecisionsRoutes);
  app.use('/api/debated-proposals', requireDatabase, debatedProposalsRoutes);
  app.use('/api/agreed-versions', requireDatabase, agreedVersionsRoutes);
  app.use('/api/decisions', requireDatabase, decisionsRoutes);
  app.use('/api/calendar', requireDatabase, calendarRoutes);

  // Specific document routes first (before generic /api/documents route)
  app.use('/api/document-tree-proposals', requireDatabase, documentTreeProposalRoutes);
  app.use('/api/documents/:documentId/document-tree-proposals/:proposalId/comments', requireDatabase, treeProposalCommentRoutes);
  app.use('/api/documents/:documentId/activity', requireDatabase, activityRoutes);
  app.use('/api/documents/:documentId/structure-proposals', requireDatabase, structureProposalRoutes);
  app.use('/api/documents/:documentId/structure-history', requireDatabase, structureHistoryRoutes);
  app.use('/api/documents/:documentId/paragraphs', requireDatabase, paragraphRoutes);
  app.use('/api/documents/:documentId/paragraphs/:paragraphId/proposals', requireDatabase, proposalRoutes);
  app.use('/api/documents/:documentId/paragraphs/:paragraphId/proposals/:proposalId/vote', requireDatabase, voteRoutes);
  app.use('/api/documents/:documentId/paragraphs/:paragraphId/proposals/:proposalId/comments', requireDatabase, commentRoutes);
  app.use('/api/documents/:documentId/structure-proposals/:proposalId/comments', requireDatabase, commentRoutes);
  app.use('/api/comments', requireDatabase, commentUpvoteRoutes);

  // Generic document routes last
  app.use('/api/documents', requireDatabase, documentRoutes);
  app.use('/api/search', requireDatabase, searchRoutes);
  app.use('/api/geocode', requireDatabase, geocodeRoutes);
  app.use('/api/export', requireDatabase, exportRoutes);
  app.use('/api/verification', requireDatabase, ballotExportRoutes);
  app.use('/api/vote-verification', requireDatabase, voteVerificationRoutes);
  app.use('/api/error-reports', errorReportsRoutes); // No requireDatabase on mount; handler still requires DB for persistence

  logger.info('Routes registered successfully');
}

// Note: Signal handlers (SIGTERM/SIGINT) are registered in server/modules/server.js
// to ensure proper graceful shutdown with database cleanup.
// Production-safe error handlers are registered inside startApplication()
// This prevents frequent restarts in production environments like Fly.io

// Start the application only when this module is executed directly.
if (require.main === module) {
  startApplication().catch((error) => {
    logger.error('Critical error during application startup', { 
      error: error.message,
      stack: error.stack 
    });

    process.exit(1);
  });
}

module.exports = { startApplication };

