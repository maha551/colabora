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
      runtimeConfig.PORT = options.port;
      process.env.PORT = options.port.toString();
    }

    console.log(`📍 Environment: ${runtimeConfig.NODE_ENV}`);
    console.log(`🚪 Port: ${runtimeConfig.PORT}`);
    console.log(`💾 Database: ${runtimeConfig.DATABASE_URL}`);

    // Initialize database manager and connection
    console.log('🔌 Initializing database...');
    dbManager = new DatabaseManager(runtimeConfig);
    const db = await dbManager.initialize();
    console.log('✅ Database initialized successfully');

    // Initialize server manager
    console.log('🚀 Initializing server...');
    serverManager = new ServerManager(runtimeConfig);
    const app = serverManager.initialize();
    console.log('✅ Server initialized successfully');

    // Make database available to routes
    app.locals.db = db;

    // Register routes
    registerRoutes(app);

    // Start server and optionally return instance
    console.log('🎯 Starting server...');

    if (options.returnServer) {
      // For testing: start server and return the instance
      return new Promise((resolve, reject) => {
        serverInstance = serverManager.start(runtimeConfig.PORT, () => {
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
          resolve(mockServer);
        });
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

  // Health check routes
  app.get('/api/health/detailed', async (req, res) => {
    try {
      const healthService = new (require('./modules/health'))(config, req.app.locals.db);
      const health = await healthService.getDetailedHealth();
      res.json(health);
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  app.get('/api/health/ready', async (req, res) => {
    try {
      const healthService = new (require('./modules/health'))(config, req.app.locals.db);
      const ready = await healthService.getReadiness();
      res.json(ready);
    } catch (error) {
      res.status(500).json({ status: 'not ready', message: error.message });
    }
  });

  // Register API routes
  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/organizations', organizationRoutes);
  app.use('/api/governance', governanceRoutes);
  app.use('/api/pending-votes', pendingVotesRoutes);
  app.use('/api/debated-proposals', debatedProposalsRoutes);
  app.use('/api/agreed-versions', agreedVersionsRoutes);
  app.use('/api/documents', documentRoutes);
  app.use('/api/documents/:documentId/activity', activityRoutes);
  app.use('/api/documents/:documentId/structure-proposals', structureProposalRoutes);
  app.use('/api/documents/:documentId/structure-history', structureHistoryRoutes);
  app.use('/api/documents/:documentId/paragraphs', paragraphRoutes);
  app.use('/api/documents/:documentId/paragraphs/:paragraphId/proposals', proposalRoutes);
  app.use('/api/documents/:documentId/paragraphs/:paragraphId/proposals/:proposalId/vote', voteRoutes);
  app.use('/api/documents/:documentId/paragraphs/:paragraphId/proposals/:proposalId/comments', commentRoutes);

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

