// Import modules
const config = require('./config');
const DatabaseManager = require('./modules/database');
const ServerManager = require('./modules/server');

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

// Initialize managers
const dbManager = new DatabaseManager(config);
const serverManager = new ServerManager(config);

// Log environment information
console.log('🌍 Starting Colabora Server...');
console.log(`📍 Environment: ${config.NODE_ENV}`);
console.log(`🚪 Port: ${config.PORT}`);
console.log(`💾 Database: ${config.DATABASE_URL}`);

// Initialize database and server
async function startApplication() {
  try {
    // Initialize database connection first
    const db = await dbManager.initialize();
    console.log('✅ Database connection initialized');

    // Initialize server
    const app = serverManager.initialize();
    console.log('✅ Server initialized');

    // Make database available to routes
    app.locals.db = db;

    // Register routes
    registerRoutes(app);

    // Start server immediately (don't wait for schema)
    serverManager.start(config.PORT, async () => {
      console.log('🎉 Server started successfully!');

      // Initialize database schema in background
      try {
        await initializeDatabase(db);
        console.log('✅ Database schema initialized');
      } catch (error) {
        console.error('❌ Database schema initialization failed:', error);
        // Don't exit - server is running, just log the error
      }
    });

    } catch (error) {
    console.error('❌ Failed to start application:', error);
    process.exit(1);
  }
}

// Start the application
startApplication();

// Register routes function
function registerRoutes(app) {
  // Health check routes (detailed)
  app.get('/api/health/detailed', (req, res) => {
    const healthService = new (require('./modules/health'))(config, req.app.locals.db);
    healthService.getDetailedHealth().then(health => {
      res.json(health);
    }).catch(err => {
      res.status(500).json({ status: 'error', message: err.message });
    });
  });

  app.get('/api/health/ready', (req, res) => {
    const healthService = new (require('./modules/health'))(config, req.app.locals.db);
    healthService.getReadiness().then(ready => {
      res.json(ready);
    }).catch(err => {
      res.status(500).json({ status: 'not ready', message: err.message });
    });
  });

  // Routes
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
}

// Initialize database function
async function initializeDatabase(db) {
  console.log('Initializing database schema...');

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');

  // Create all tables synchronously - SQLite will handle the dependencies
  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      avatar TEXT,
      bio TEXT,
      role TEXT DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      representatives TEXT NOT NULL, -- JSON array of user IDs
      membership_policy TEXT CHECK(membership_policy IN ('open', 'invitation')) DEFAULT 'invitation',
      voting_enabled BOOLEAN DEFAULT false,
      voting_threshold REAL DEFAULT 0.5,
      is_active BOOLEAN DEFAULT true,
      created_by_admin_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by_admin_id) REFERENCES users(id)
    )`,

    `CREATE TABLE IF NOT EXISTS organization_members (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT CHECK(status IN ('active', 'legacy', 'suspended')) DEFAULT 'active',
      invited_by_rep_id TEXT,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      left_at DATETIME,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (invited_by_rep_id) REFERENCES users(id),
      UNIQUE(organization_id, user_id)
    )`,

    `CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        owner_id TEXT NOT NULL,
        collaborators TEXT, -- JSON array of collaborator objects (for legacy/personal docs)
        ownership_type TEXT CHECK(ownership_type IN ('personal', 'shared', 'organizational')) DEFAULT 'personal',
        creator_ids TEXT, -- JSON array for shared docs
        organization_id TEXT, -- For organizational docs
        parent_id TEXT, -- For hierarchical document structure
        status TEXT CHECK(status IN ('proposal', 'draft', 'agreed')) DEFAULT 'draft',
        proposal_deadline DATETIME, -- Deadline for proposal period (default 1 year from creation, configurable via governance)
        acceptance_threshold REAL DEFAULT 75.0 NOT NULL,
        voting_anonymous BOOLEAN DEFAULT 0 NOT NULL,
        voting_anonymity_locked BOOLEAN DEFAULT 0 NOT NULL,
        vote_change_allowed BOOLEAN DEFAULT 1 NOT NULL,
        structure_proposals_enabled BOOLEAN DEFAULT 0 NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users(id),
        FOREIGN KEY (organization_id) REFERENCES organizations(id),
        FOREIGN KEY (parent_id) REFERENCES documents(id)
      )`,

    `CREATE TABLE IF NOT EXISTS document_collaborators (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(document_id, user_id)
    )`,

    `CREATE TABLE IF NOT EXISTS paragraphs (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      title TEXT,
      heading_level TEXT,
      text TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents(id)
    )`,

    `CREATE TABLE IF NOT EXISTS proposals (
      id TEXT PRIMARY KEY,
      paragraph_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      text TEXT NOT NULL,
      type TEXT CHECK(type IN ('BODY', 'TITLE')) DEFAULT 'BODY',
      heading_level TEXT,
      approved BOOLEAN DEFAULT FALSE,
      invalidated BOOLEAN DEFAULT FALSE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (paragraph_id) REFERENCES paragraphs(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`,

    `CREATE TABLE IF NOT EXISTS votes (
      id TEXT PRIMARY KEY,
      proposal_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      vote TEXT CHECK(vote IN ('PRO', 'NEUTRAL', 'CONTRA')) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (proposal_id) REFERENCES proposals(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(proposal_id, user_id)
    )`,

    `CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      proposal_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      text TEXT NOT NULL,
      parent_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (proposal_id) REFERENCES proposals(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (parent_id) REFERENCES comments(id)
    )`
  ];

  // Execute table creation sequentially to ensure proper initialization
  let tablesCreated = 0;
  const totalTables = tables.length;

  function createNextTable() {
    if (tablesCreated >= totalTables) {
      // After creating all tables, ensure role column exists
      console.log('Ensuring role column exists...');
      db.run('ALTER TABLE users ADD COLUMN role TEXT DEFAULT \'user\'', (err) => {
        // Ignore error if column already exists
        if (err && !err.message.includes('duplicate column name')) {
          console.error('Error adding role column:', err);
        } else {
          console.log('✅ Role column ensured');
        }
        console.log('✅ Database schema initialized');
      });
      return;
    }

    const sql = tables[tablesCreated];
    db.run(sql, (err) => {
      if (err) {
        console.error(`❌ Error creating table ${tablesCreated + 1}:`, err);
      } else {
        console.log(`✅ Created table ${tablesCreated + 1}/${totalTables}`);
      }
      tablesCreated++;
      createNextTable();
    });
  }

  createNextTable();
}
