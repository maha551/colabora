/**
 * Application Bootstrap
 * Handles application initialization, database setup, and server startup
 */

const config = require('./config');
const DatabaseManager = require('./database/DatabaseManager');
const ServerManager = require('./modules/server');
const { logger } = require('./middleware/logger');

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

  try {
    logger.info('Starting Colabora Server', { 
      environment: config.NODE_ENV,
      port: config.PORT 
    });

    // Override config if options provided
    const runtimeConfig = { ...config };
    if (options.port) {
      logger.info('Overriding port', { 
        oldPort: runtimeConfig.PORT, 
        newPort: options.port 
      });
      runtimeConfig.PORT = options.port;
      process.env.PORT = options.port.toString();
      // Also update the cached config object
      config.PORT = options.port;
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
        // Don't exit in production, just log
      });

      process.on('uncaughtException', (error) => {
        logger.error('Uncaught Exception', { 
          error: error.message,
          stack: error.stack 
        });
        // Don't exit in production, just log
        // The health check will restart the container if needed
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
      // Fail fast - database is critical for app functionality
      // Don't register routes if database fails - app won't work anyway
      logger.error('Database initialization failed - shutting down');
      if (options.returnServer) {
        throw dbError;
      } else {
        process.exit(1);
      }
    }

    // Ensure database is available before proceeding
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
    serverManager = new ServerManager(runtimeConfig);
    const app = serverManager.initialize();
    logger.info('Server initialized successfully');

    // Make database available to routes (might be null in production if DB failed)
    app.locals.db = dbManager ? db : null;
    app.locals.dbAvailable = !!dbManager;

    // Initialize background scheduler if database is available
    let scheduler = null;
    if (dbManager && db) {
      logger.info('Initializing background scheduler');
      try {
        const DocumentScheduler = require('./modules/scheduler');
        scheduler = new DocumentScheduler(db);
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

    // Start server and optionally return instance
    logger.info('Starting server');

    if (options.returnServer) {
      // For testing: start server and return the instance
      return new Promise((resolve, reject) => {
        const startCallback = () => {
          logger.info('Server started successfully', { port: runtimeConfig.PORT });

          // Return a mock server object for supertest compatibility
          const mockServer = {
            address: () => ({ port: runtimeConfig.PORT }),
            close: (callback) => {
              // Gracefully shutdown
              serverManager.close().then(() => {
                if (scheduler) {
                  scheduler.stop();
                }
                if (dbManager) {
                  dbManager.close().catch((err) => {
                    logger.error('Error closing database during cleanup', { error: err.message, stack: err.stack });
                  });
                }
                if (callback) callback();
              }).catch(callback);
            },
            // Store references for cleanup
            _dbManager: dbManager,
            _serverManager: serverManager,
            _scheduler: scheduler
          };
          logger.debug('Resolving promise with mock server for testing');
          resolve(mockServer);
        };

        logger.debug('Calling serverManager.start with callback');
        serverManager.start(runtimeConfig.PORT, startCallback);

        // Handle startup errors
        setTimeout(() => {
          reject(new Error('Server startup timeout'));
        }, 10000); // 10 second timeout
      });
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
  const activityRoutes = require('./routes/activity');
  const structureProposalRoutes = require('./routes/structure-proposals');
  const structureHistoryRoutes = require('./routes/structure-history');
  const documentTreeProposalRoutes = require('./routes/document-tree-proposals');
  const pendingVotesRoutes = require('./routes/pending-votes');
  const debatedProposalsRoutes = require('./routes/debated-proposals');
  const agreedVersionsRoutes = require('./routes/agreed-versions');
  const organizationRoutes = require('./routes/organizations');
  const governanceRoutes = require('./routes/governance');
  const adminRoutes = require('./routes/admin');

  // Health check routes - work even without database
  app.get('/api/health/detailed', async (req, res) => {
    try {
      if (!req.app.locals.dbAvailable) {
        res.json({
          status: 'degraded',
          message: 'Database unavailable',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          database: false
        });
        return;
      }

      const healthService = new (require('./modules/health'))(config, req.app.locals.db);
      const health = await healthService.getDetailedHealth();
      res.json(health);
    } catch (error) {
      logger.error('Health check error', { error: error.message });
      res.status(500).json({
        status: 'error',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  app.get('/api/health/ready', async (req, res) => {
    try {
      // Basic readiness check - if we can respond, we're ready
      const isReady = req.app.locals.dbAvailable !== false;

      res.json({
        status: isReady ? 'ready' : 'degraded',
        database: req.app.locals.dbAvailable,
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    } catch (error) {
      logger.error('Readiness check error', { error: error.message });
      res.status(500).json({
        status: 'error',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Middleware to check database availability
  const requireDatabase = async (req, res, next) => {
    if (!req.app.locals.dbAvailable || !req.app.locals.db) {
      return res.status(503).json({
        error: 'Service temporarily unavailable',
        message: 'Database connection is not available',
        timestamp: new Date().toISOString()
      });
    }

    // Perform a quick health check
    try {
      await new Promise((resolve, reject) => {
        req.app.locals.db.get('SELECT 1', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      next();
    } catch (error) {
      // Database connection lost
      req.app.locals.dbAvailable = false;
      return res.status(503).json({
        error: 'Database connection lost',
        message: 'The database connection is no longer available. Please try again later.',
        timestamp: new Date().toISOString()
      });
    }
  };

  // Register API routes with database availability checks
  app.use('/api/auth', requireDatabase, authRoutes);
  app.use('/api/admin', requireDatabase, adminRoutes);
  app.use('/api/organizations', requireDatabase, organizationRoutes);
  app.use('/api/governance', requireDatabase, governanceRoutes);
  app.use('/api/pending-votes', requireDatabase, pendingVotesRoutes);
  app.use('/api/debated-proposals', requireDatabase, debatedProposalsRoutes);
  app.use('/api/agreed-versions', requireDatabase, agreedVersionsRoutes);
  app.use('/api/documents', requireDatabase, documentRoutes);
  app.use('/api/documents/:documentId/activity', requireDatabase, activityRoutes);
  app.use('/api/documents/:documentId/structure-proposals', requireDatabase, structureProposalRoutes);
  app.use('/api/documents/:documentId/structure-history', requireDatabase, structureHistoryRoutes);
  app.use('/api/documents/tree-proposals', requireDatabase, documentTreeProposalRoutes);
  app.use('/api/documents/:documentId/paragraphs', requireDatabase, paragraphRoutes);
  app.use('/api/documents/:documentId/paragraphs/:paragraphId/proposals', requireDatabase, proposalRoutes);
  app.use('/api/documents/:documentId/paragraphs/:paragraphId/proposals/:proposalId/vote', requireDatabase, voteRoutes);
  app.use('/api/documents/:documentId/paragraphs/:paragraphId/proposals/:proposalId/comments', requireDatabase, commentRoutes);

  logger.info('Routes registered successfully');
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { 
    error: error.message,
    stack: error.stack 
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { 
    reason: reason?.message || String(reason),
    stack: reason?.stack 
  });
  process.exit(1);
});

// Start the application
startApplication().catch((error) => {
  logger.error('Critical error during application startup', { 
    error: error.message,
    stack: error.stack 
  });
  process.exit(1);
});

module.exports = { startApplication };

