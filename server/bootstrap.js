/**
 * Application Bootstrap
 * Handles application initialization, database setup, and server startup
 */

const config = require('./config');
const DatabaseManager = require('./database/DatabaseManager');
const ServerManager = require('./modules/server');

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
    console.log('🌍 Starting Colabora Server...');

    // Override config if options provided
    const runtimeConfig = { ...config };
    if (options.port) {
      console.log(`🔧 Overriding port from ${runtimeConfig.PORT} to ${options.port}`);
      runtimeConfig.PORT = options.port;
      process.env.PORT = options.port.toString();
      // Also update the cached config object
      config.PORT = options.port;
    }

    console.log(`📍 Environment: ${runtimeConfig.NODE_ENV}`);
    console.log(`🚪 Port: ${runtimeConfig.PORT} (options.port: ${options.port || 'undefined'})`);
    console.log(`💾 Database: ${runtimeConfig.DATABASE_URL}`);

    // Add global error handlers for production stability
    if (runtimeConfig.NODE_ENV === 'production') {
      process.on('unhandledRejection', (reason, promise) => {
        console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
        // Don't exit in production, just log
      });

      process.on('uncaughtException', (error) => {
        console.error('🚨 Uncaught Exception:', error);
        // Don't exit in production, just log
        // The health check will restart the container if needed
      });
    }

    // Initialize database manager and connection
    console.log('🔌 Initializing database...');
    let db = null; // Declare db outside try block
    try {
      dbManager = new DatabaseManager(runtimeConfig);
      db = await dbManager.initialize();
      console.log('✅ Database initialized successfully');
    } catch (dbError) {
      console.error('🚨 Database initialization failed:', dbError);
      // In production, don't fail completely - try to continue without database
      if (runtimeConfig.NODE_ENV === 'production') {
        console.warn('⚠️  Continuing without database - app may not function properly');
        dbManager = null;
        db = null;
      } else {
        throw dbError;
      }
    }

    // Initialize server manager
    console.log('🚀 Initializing server...');
    serverManager = new ServerManager(runtimeConfig);
    const app = serverManager.initialize();
    console.log('✅ Server initialized successfully');

    // Make database available to routes (might be null in production if DB failed)
    app.locals.db = dbManager ? db : null;
    app.locals.dbAvailable = !!dbManager;

    // Register routes
    registerRoutes(app);

    // Start server and optionally return instance
    console.log('🎯 Starting server...');

    if (options.returnServer) {
      // For testing: start server and return the instance
      return new Promise((resolve, reject) => {
        const startCallback = () => {
          console.log('🎉 Server started successfully!');
          console.log(`🌐 Server running on port ${runtimeConfig.PORT}`);

          // Return a mock server object for supertest compatibility
          const mockServer = {
            address: () => ({ port: runtimeConfig.PORT }),
            close: (callback) => {
              // Gracefully shutdown
              serverManager.close().then(() => {
                if (dbManager) {
                  dbManager.close().catch(console.error);
                }
                if (callback) callback();
              }).catch(callback);
            },
            // Store references for cleanup
            _dbManager: dbManager,
            _serverManager: serverManager
          };
          console.log('🔧 Resolving promise with mock server...');
          resolve(mockServer);
        };

        console.log('🚀 Calling serverManager.start with callback...');
        serverManager.start(runtimeConfig.PORT, startCallback);

        // Handle startup errors
        setTimeout(() => {
          reject(new Error('Server startup timeout'));
        }, 10000); // 10 second timeout
      });
    } else {
      // Normal startup
      serverManager.start(runtimeConfig.PORT, () => {
        console.log('🎉 Server started successfully!');
        console.log(`🌐 Server running on port ${runtimeConfig.PORT}`);
      });
    }

  } catch (error) {
    console.error('❌ Failed to start application:', error);

    // Clean up resources on failure
    if (dbManager) {
      try {
        await dbManager.close();
      } catch (cleanupError) {
        console.error('Error during database cleanup:', cleanupError);
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
  console.log('🔗 Registering routes...');

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
      console.error('Health check error:', error);
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
      console.error('Readiness check error:', error);
      res.status(500).json({
        status: 'error',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Middleware to check database availability
  const requireDatabase = (req, res, next) => {
    if (!req.app.locals.dbAvailable) {
      return res.status(503).json({
        error: 'Service temporarily unavailable',
        message: 'Database connection is not available'
      });
    }
    next();
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
  app.use('/api/documents/:documentId/paragraphs', requireDatabase, paragraphRoutes);
  app.use('/api/documents/:documentId/paragraphs/:paragraphId/proposals', requireDatabase, proposalRoutes);
  app.use('/api/documents/:documentId/paragraphs/:paragraphId/proposals/:proposalId/vote', requireDatabase, voteRoutes);
  app.use('/api/documents/:documentId/paragraphs/:paragraphId/proposals/:proposalId/comments', requireDatabase, commentRoutes);

  console.log('✅ Routes registered successfully');
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the application
startApplication().catch((error) => {
  console.error('💥 Critical error during application startup:', error);
  process.exit(1);
});

module.exports = { startApplication };

