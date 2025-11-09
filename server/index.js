const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const rateLimit = require('express-rate-limit');

// Security imports
const config = require('./config');
const { requireAuth, generateToken, hashPassword, verifyPassword } = require('./middleware/auth');
const { requestLogger, errorLogger, securityLogger } = require('./middleware/logger');
const { metricsCollector, requestMetrics } = require('./middleware/monitoring');

let serverStarted = false;
let serverStartTimeout = null;

// Import route handlers
const authRoutes = require('./routes/auth');
const documentRoutes = require('./routes/documents');
const paragraphRoutes = require('./routes/paragraphs');
const proposalRoutes = require('./routes/proposals');
const voteRoutes = require('./routes/votes');
const commentRoutes = require('./routes/comments');
const activityRoutes = require('./routes/activity');
const pendingVotesRoutes = require('./routes/pending-votes');
const debatedProposalsRoutes = require('./routes/debated-proposals');
const agreedVersionsRoutes = require('./routes/agreed-versions');

// Initialize Express app
const app = express();
const PORT = config.PORT;

// Log environment information
console.log('🌍 Starting Colabora Server...');
console.log(`📍 Environment: ${config.NODE_ENV}`);
console.log(`🚪 Port: ${PORT}`);
console.log(`💾 Database: ${config.DATABASE_URL}`);

// Trust proxy in production
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Security headers
app.use(helmet(config.SECURITY_HEADERS));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
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
app.use('/api', limiter);

// CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);

    if (config.ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Body parsing
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(requestLogger);

// Request metrics collection
app.use(requestMetrics);

// Session configuration
app.use(session(config.SESSION_CONFIG));

// Secure authentication middleware (for backward compatibility)
app.use((req, res, next) => {
  // Try JWT token first
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7);
      const decoded = require('jsonwebtoken').verify(token, config.JWT_CONFIG.secret, {
        issuer: config.JWT_CONFIG.issuer,
        audience: config.JWT_CONFIG.audience
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

// Initialize database and start server only after initialization completes
const fs = require('fs');

// Ensure data directory exists
const dbPath = config.DATABASE_URL.startsWith('sqlite:///')
  ? config.DATABASE_URL.replace('sqlite:///', '')
  : config.DATABASE_URL;

const dbDir = path.dirname(dbPath);
console.log(`📁 Database path: ${dbPath}`);
console.log(`📂 Database directory: ${dbDir}`);

try {
  if (!fs.existsSync(dbDir)) {
    console.log('Creating database directory...');
    fs.mkdirSync(dbDir, { recursive: true });
    console.log('✅ Created database directory:', dbDir);
  } else {
    console.log('✅ Database directory already exists');
  }
} catch (dirErr) {
  console.error('❌ Error creating database directory:', dirErr.message);
  console.error('Directory error details:', dirErr);
}

console.log('🔌 Attempting to connect to database...');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err.message);
    console.error('Database path:', dbPath);
    console.error('Database error details:', err);
    process.exit(1);
  }

  console.log('✅ Connected to SQLite database at:', dbPath);

  // Make database available to routes
  app.locals.db = db;

  // Initialize database and start server when complete
  initializeDatabaseAndStartServer(db);
});

function initializeDatabaseAndStartServer(db) {
  console.log('🚀 Starting database initialization...');
  initializeDatabase(db);

  console.log('⏳ Waiting for database initialization...');
  let checkCount = 0;
  const checkInterval = setInterval(() => {
    checkCount++;
    console.log(`🔍 Database readiness check #${checkCount}...`);

    db.get('SELECT COUNT(*) as count FROM paragraphs WHERE document_id = ?', ['demo-doc-1'], (err, row) => {
      if (err) {
        console.log('❌ Database check failed:', err.message);
        return;
      }

      console.log(`✅ Database check: found ${row.count} paragraphs for demo-doc-1`);
      if (row && row.count > 0) {
      console.log('🎉 Database initialization complete!');
      clearInterval(checkInterval);
      // Only start server in non-test mode
      if (process.env.NODE_ENV !== 'test') {
        startServer();
      }
      }
    });
  }, 2000);

  serverStartTimeout = setTimeout(() => {
    clearInterval(checkInterval);
    if (!serverStarted) {
      console.log('Database initialization timeout, starting server anyway for debugging...');
      // Only start server in non-test mode
      if (process.env.NODE_ENV !== 'test') {
        startServer();
      }
    }
  }, 10000);
}

// Health check endpoint for Fly.io (always available, even during startup)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Health check endpoint (always available, even during startup)
app.get('/api/health', (req, res) => {
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
    environment: config.NODE_ENV,
    version: '1.0.0'
  });
});

function registerRoutes() {
  // Debug middleware to log all API requests
  app.use('/api', (req, res, next) => {
    console.log(`API REQUEST: ${req.method} ${req.path}`);
    next();
  });

  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/pending-votes', pendingVotesRoutes);
  app.use('/api/debated-proposals', debatedProposalsRoutes);
  app.use('/api/agreed-versions', agreedVersionsRoutes);
  app.use('/api/documents', documentRoutes);
  app.use('/api/documents/:documentId/activity', activityRoutes);
  app.use('/api/documents/:documentId/paragraphs', paragraphRoutes);
  app.use('/api/documents/:documentId/paragraphs/:paragraphId/proposals', proposalRoutes);
  app.use('/api/documents/:documentId/paragraphs/:paragraphId/proposals/:proposalId/vote', voteRoutes);
  app.use('/api/documents/:documentId/paragraphs/:paragraphId/proposals/:proposalId/comments', commentRoutes);
}

function startServer() {
  if (serverStarted) {
    return;
  }
  serverStarted = true;

  if (serverStartTimeout) {
    clearTimeout(serverStartTimeout);
    serverStartTimeout = null;
  }

  console.log('Starting HTTP server...');

  // Register routes
  registerRoutes();

  // Serve static files from client build in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../client/build')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '../client/build/index.html'));
    });
  }

  // Error handling middleware
  app.use(errorLogger);
  app.use((err, req, res, next) => {
    // Don't leak error details in production
    const isDevelopment = config.NODE_ENV === 'development';

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

  // Graceful shutdown handling
  const gracefulShutdown = (signal) => {
    console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
    metricsCollector.shutdown();
    server.close(() => {
      console.log('✅ Server shutdown complete');
      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      console.error('❌ Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  // Start server
  console.log(`🔄 Attempting to start server on 0.0.0.0:${PORT}...`);
  const server = app.listen(PORT, '0.0.0.0', () => {
    serverInstance = server; // For testing export
    console.log(`🚀 Server successfully started on 0.0.0.0:${PORT}`);
    console.log(`🌍 Environment: ${config.NODE_ENV}`);
    console.log(`🔒 Security: ${config.NODE_ENV === 'production' ? 'Production mode enabled' : 'Development mode - NOT SECURE FOR PRODUCTION'}`);
    console.log(`📊 Rate limiting: ${config.RATE_LIMIT_MAX_REQUESTS} requests per ${config.RATE_LIMIT_WINDOW_MS / 1000}s`);
    console.log(`📈 Monitoring: Active - collecting metrics every 60s`);
    console.log('✅ Server initialization complete - ready to accept connections');
  });

  server.on('error', (error) => {
    console.error('❌ Server failed to start:', error.message);
    process.exit(1);
  });

  // Register shutdown handlers
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

// Test endpoint (defined in startServer function)
app.get('/api/test', (req, res) => {
  const db = req.app.locals.db;
  db.all('SELECT * FROM paragraphs', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ paragraphs: rows });
  });
});


// Metrics endpoint (admin only)
app.get('/api/metrics', requireAuth, (req, res) => {
  // TODO: Add admin role check when roles are implemented
  // For now, return basic metrics for authenticated users

  const metrics = metricsCollector.getMetricsSummary();

  res.json({
    timestamp: new Date().toISOString(),
    ...metrics
  });
});

// Advanced health check with monitoring data
app.get('/api/health/detailed', requireAuth, (req, res) => {
  const healthStatus = metricsCollector.getHealthStatus();

  res.json({
    timestamp: new Date().toISOString(),
    ...healthStatus
  });
});

function ensureColumn(db, tableName, columnName, columnDefinition) {
  db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
    if (err) {
      console.error(`Error inspecting table ${tableName}:`, err.message);
      return;
    }
    const hasColumn = columns.some(column => column.name === columnName);
    if (!hasColumn) {
      db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`, alterErr => {
        if (alterErr) {
          console.error(`Error adding column ${columnName} to ${tableName}:`, alterErr.message);
        }
      });
    }
  });
}

function ensureDocumentTitleParagraph(db, documentId, documentTitle) {
  if (!documentId) {
    return;
  }

  const paragraphId = `${documentId}-title`;
  const safeTitle = documentTitle || 'Untitled Document';

  db.run(`
    INSERT OR IGNORE INTO paragraphs (id, document_id, title, heading_level, text, order_index)
    VALUES (?, ?, ?, ?, ?, -1)
  `, [paragraphId, documentId, safeTitle, 'h1', safeTitle], (err) => {
    if (err) {
      console.error('Error ensuring document title paragraph (insert):', err.message);
    }
  });

  db.run(`
    UPDATE paragraphs
    SET title = ?,
        text = CASE
          WHEN text IS NULL OR text = '' THEN ?
          ELSE text
        END,
        heading_level = 'h1',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND document_id = ?
  `, [safeTitle, safeTitle, paragraphId, documentId], (err) => {
    if (err) {
      console.error('Error ensuring document title paragraph (update):', err.message);
    }
  });
}

function initializeDatabase(db) {
  console.log('Initializing database...');

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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      acceptance_threshold REAL DEFAULT 75.0 NOT NULL,
      voting_anonymous BOOLEAN DEFAULT 0 NOT NULL,
      voting_anonymity_locked BOOLEAN DEFAULT 0 NOT NULL,
      vote_change_allowed BOOLEAN DEFAULT 1 NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id)
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
    )`,

    `CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY,
      paragraph_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      old_text TEXT NOT NULL,
      new_text TEXT NOT NULL,
      approval_percentage REAL,
      proposal_id TEXT,
      heading_level TEXT,
      accepted_at TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (paragraph_id) REFERENCES paragraphs(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (proposal_id) REFERENCES proposals(id)
    )`
  ];

  // Schema migration function to ensure history table has accepted_at column
  function ensureHistoryAcceptedAt(db) {
    return new Promise((resolve, reject) => {
      db.all("PRAGMA table_info(history)", (err, cols) => {
        if (err) {
          console.error("Failed to inspect history table:", err);
          return reject(err);
        }

        const hasAcceptedAt = cols && cols.some(c => c.name === 'accepted_at');
        if (!hasAcceptedAt) {
          console.log("Adding accepted_at column to history table...");
          db.run("ALTER TABLE history ADD COLUMN accepted_at TEXT", (addErr) => {
            if (addErr) {
              console.error("Failed to add accepted_at to history:", addErr);
              return reject(addErr);
            }
            console.log("✅ Added accepted_at column to history table");
            resolve();
          });
        } else {
          resolve();
        }
      });
    });
  }

  // Execute table creation sequentially to ensure proper initialization
  let tablesCreated = 0;
  const totalTables = tables.length;

  function createNextTable() {
    if (tablesCreated >= totalTables) {
      // All tables created, now ensure new columns exist
      console.log('All tables created, ensuring new columns...');
      ensureColumn(db, 'users', 'avatar', 'TEXT');
      ensureColumn(db, 'users', 'bio', 'TEXT');

      // Ensure history table has accepted_at column
      ensureHistoryAcceptedAt(db).catch(err => {
        console.error('Error ensuring history table schema:', err);
      });
      
      // Wait a bit for column additions to complete, then insert demo data
      setTimeout(async () => {
        await insertDemoData(db);
      }, 500);
      return;
    }

    const sql = tables[tablesCreated];
    db.run(sql, (err) => {
      if (err) {
        console.error(`Error creating table ${tablesCreated + 1}:`, err);
      } else {
        console.log(`Created table ${tablesCreated + 1}/${totalTables}`);
      }
      tablesCreated++;
      createNextTable();
    });
  }

  createNextTable();
}

async function insertDemoData(db) {
  console.log('Inserting demo data...');

  // Demo users with secure passwords
  const demoUsers = [
    { id: 'cmgxlfj9z0000orjgnfy3revt', name: 'Alice Johnson', email: 'alice@example.com', password: 'SecurePass123!' },
    { id: 'cmgxlfj9z0000orjgnfy3revu', name: 'Bob Smith', email: 'bob@example.com', password: 'SecurePass123!' },
    { id: 'cmgxlfj9z0000orjgnfy3revv', name: 'Charlie Brown', email: 'charlie@example.com', password: 'SecurePass123!' },
    { id: 'cmgxlfj9z0000orjgnfy3revw', name: 'Diana Prince', email: 'diana@example.com', password: 'SecurePass123!' }
  ];

  // Insert demo users with hashed passwords
  let usersInserted = 0;
  for (const user of demoUsers) {
    try {
      const passwordHash = await hashPassword(user.password);
      db.run(`
        INSERT OR IGNORE INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)
      `, [user.id, user.name, user.email, passwordHash], (err) => {
        if (err) {
          console.error('Error inserting user:', err);
        }
        usersInserted++;
        if (usersInserted === demoUsers.length) {
          console.log('Users inserted, inserting document...');
          insertDocument(db);
        }
      });
    } catch (error) {
      console.error('Error hashing password for demo user:', error);
      usersInserted++;
    }
  }

  function insertDocument(db) {
    // Insert tutorial document with options
    db.run(`
      INSERT OR IGNORE INTO documents (
        id, title, owner_id, 
        acceptance_threshold, voting_anonymous, voting_anonymity_locked, vote_change_allowed
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      'demo-doc-1', 
      'Document Options Tutorial', 
      'cmgxlfj9z0000orjgnfy3revt',
      75.0,  // acceptance_threshold
      0,     // voting_anonymous (public/open)
      0,     // voting_anonymity_locked
      1      // vote_change_allowed (flexible)
    ], (err) => {
      if (err) {
        console.error('Error inserting document:', err);
        return;
      }
      console.log('Tutorial document inserted, inserting paragraphs...');
      insertParagraphs(db);
    });
  }

  function insertParagraphs(db) {
    // Insert tutorial paragraphs
    const demoParagraphs = [
      { id: 'demo-doc-1-title', title: 'Document Options Tutorial', text: 'Document Options Tutorial', order_index: -1, heading_level: 'h1' },
      { id: 'para-h1', title: 'Introduction', text: 'Welcome to Colabora\'s new document options system! These settings control how voting works in your document. All options are set when you create a document and cannot be changed afterward.', order_index: 0, heading_level: 'h1' },
      { id: 'para-1', text: 'This tutorial document will help you understand the different options available when creating documents. Each option affects how collaborators interact with proposals and votes.', order_index: 1 },
      { id: 'para-h2-1', title: 'Acceptance Threshold', text: 'What is Acceptance Threshold?', order_index: 2, heading_level: 'h2' },
      { id: 'para-2', text: 'The acceptance threshold is the percentage of collaborators who must vote PRO for a proposal to be automatically accepted. The default is 75%, but you can set it anywhere from 1% to 100% when creating a document. For example, with 4 collaborators and a 75% threshold, you need 3 PRO votes for automatic acceptance.', order_index: 3 },
      { id: 'para-h2-2', title: 'Voting Anonymity', text: 'Public vs Anonymous Voting', order_index: 4, heading_level: 'h2' },
      { id: 'para-3', text: 'Public (Open) Voting: Everyone can see who voted what. User names and avatars are shown with votes, providing full transparency. Anonymous (Closed) Voting: Votes are hidden - only vote counts are visible. You cannot see who voted what, providing privacy-focused collaboration.', order_index: 5 },
      { id: 'para-h2-3', title: 'Vote Flexibility', text: 'Flexible vs Locked Votes', order_index: 6, heading_level: 'h2' },
      { id: 'para-4', text: 'Flexible Votes: You can change your vote anytime after casting it. Vote buttons remain active, allowing reconsideration. Locked Votes: Once you vote, you cannot change it. Vote buttons are disabled after your first vote, ensuring committed decision-making.', order_index: 7 },
      { id: 'para-h2-4', title: 'Creating Documents with Options', text: 'How to Set Options', order_index: 8, heading_level: 'h2' },
      { id: 'para-5', text: 'When creating a new document, you\'ll see a "Document Options" section. Set your preferences before creating - remember, these are permanent choices! Choose carefully based on your collaboration needs.', order_index: 9 }
    ];

    let paragraphsInserted = 0;
    demoParagraphs.forEach(para => {
      db.run(`
        INSERT OR IGNORE INTO paragraphs (id, document_id, title, text, order_index, heading_level)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [para.id, 'demo-doc-1', para.title || null, para.text, para.order_index, para.heading_level || null], (err) => {
        if (err) {
          console.error('Error inserting paragraph:', err);
        }
        paragraphsInserted++;
        if (paragraphsInserted === demoParagraphs.length) {
          console.log('Paragraphs inserted, inserting collaborators...');
          insertCollaborators(db);
        }
      });
    });
  }

  function insertCollaborators(db) {
    // Add collaborators
    const collaborators = ['cmgxlfj9z0000orjgnfy3revu', 'cmgxlfj9z0000orjgnfy3revv', 'cmgxlfj9z0000orjgnfy3revw'];
    let collaboratorsInserted = 0;

    collaborators.forEach(userId => {
      db.run(`
        INSERT OR IGNORE INTO document_collaborators (id, document_id, user_id) VALUES (?, ?, ?)
      `, [`${userId}-demo-doc-1`, 'demo-doc-1', userId], (err) => {
        if (err) {
          console.error('Error inserting collaborator:', err);
        }
        collaboratorsInserted++;
        if (collaboratorsInserted === collaborators.length) {
          console.log('Collaborators inserted, inserting proposals...');
          insertProposals(db);
        }
      });
    });
  }

  function insertProposals(db) {
    // Insert tutorial proposals with examples
    const demoProposals = [
      {
        id: 'proposal-1',
        paragraph_id: 'para-2',
        user_id: 'cmgxlfj9z0000orjgnfy3revu',
        text: 'This proposal demonstrates how the 75% acceptance threshold works. With 4 collaborators, we need 3 PRO votes for automatic acceptance. Try voting on this proposal to see how the threshold affects approval!',
        type: 'BODY',
        approved: false
      },
      {
        id: 'proposal-2',
        paragraph_id: 'para-3',
        user_id: 'cmgxlfj9z0000orjgnfy3revv',
        text: 'In public voting mode (like this document), you can see who voted what. Look at the votes below to see user names and avatars. This provides full transparency in the collaboration process.',
        type: 'BODY',
        approved: false
      },
      {
        id: 'proposal-3',
        paragraph_id: 'para-4',
        user_id: 'cmgxlfj9z0000orjgnfy3revw',
        text: 'With flexible votes enabled (like this document), you can change your vote anytime. Try voting PRO, then change to NEUTRAL, then to CONTRA. Notice how the vote buttons remain active!',
        type: 'BODY',
        approved: false
      }
    ];

    let proposalsInserted = 0;
    demoProposals.forEach(proposal => {
      db.run(`
        INSERT OR IGNORE INTO proposals (id, paragraph_id, user_id, text, type, heading_level, approved)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [proposal.id, proposal.paragraph_id, proposal.user_id, proposal.text, proposal.type, proposal.heading_level || null, proposal.approved ? 1 : 0], (err) => {
        if (err) {
          console.error('Error inserting proposal:', err);
        }
        proposalsInserted++;
        if (proposalsInserted === demoProposals.length) {
          console.log('Proposals inserted, inserting votes...');
          insertVotes(db);
        }
      });
    });
  }

  function insertVotes(db) {
    // Insert demo votes
    const demoVotes = [
      // Proposal 1: Show threshold example (3 PRO votes = 75% with 4 users)
      { id: 'vote-1', proposal_id: 'proposal-1', user_id: 'cmgxlfj9z0000orjgnfy3revt', vote: 'PRO' },
      { id: 'vote-2', proposal_id: 'proposal-1', user_id: 'cmgxlfj9z0000orjgnfy3revu', vote: 'PRO' },
      { id: 'vote-3', proposal_id: 'proposal-1', user_id: 'cmgxlfj9z0000orjgnfy3revv', vote: 'PRO' },
      // Proposal 2: Show public voting (can see who voted)
      { id: 'vote-4', proposal_id: 'proposal-2', user_id: 'cmgxlfj9z0000orjgnfy3revt', vote: 'PRO' },
      { id: 'vote-5', proposal_id: 'proposal-2', user_id: 'cmgxlfj9z0000orjgnfy3revu', vote: 'NEUTRAL' },
      { id: 'vote-6', proposal_id: 'proposal-2', user_id: 'cmgxlfj9z0000orjgnfy3revv', vote: 'PRO' },
      // Proposal 3: Show flexible votes (can change)
      { id: 'vote-7', proposal_id: 'proposal-3', user_id: 'cmgxlfj9z0000orjgnfy3revt', vote: 'PRO' },
      { id: 'vote-8', proposal_id: 'proposal-3', user_id: 'cmgxlfj9z0000orjgnfy3revw', vote: 'NEUTRAL' }
    ];

    let votesInserted = 0;
    demoVotes.forEach(vote => {
      db.run(`
        INSERT OR IGNORE INTO votes (id, proposal_id, user_id, vote) VALUES (?, ?, ?, ?)
      `, [vote.id, vote.proposal_id, vote.user_id, vote.vote], (err) => {
        if (err) {
          console.error('Error inserting vote:', err);
        }
        votesInserted++;
        if (votesInserted === demoVotes.length) {
          console.log('Votes inserted, inserting comments...');
          insertComments(db);
        }
      });
    });
  }

  function insertComments(db) {
    // Insert tutorial comments
    const demoComments = [
      {
        id: 'comment-1',
        proposal_id: 'proposal-1',
        user_id: 'cmgxlfj9z0000orjgnfy3revt',
        text: 'This proposal has 3 PRO votes out of 4 collaborators, which equals 75% - exactly the threshold needed for automatic acceptance!',
        parent_id: null
      },
      {
        id: 'comment-2',
        proposal_id: 'proposal-2',
        user_id: 'cmgxlfj9z0000orjgnfy3revu',
        text: 'Notice how you can see who voted what in public voting mode. Try creating a document with anonymous voting to see the difference!',
        parent_id: null
      },
      {
        id: 'comment-3',
        proposal_id: 'proposal-3',
        user_id: 'cmgxlfj9z0000orjgnfy3revw',
        text: 'Since this document uses flexible votes, you can change your vote anytime. Try it out!',
        parent_id: null
      }
    ];

    let commentsInserted = 0;
    demoComments.forEach(comment => {
      db.run(`
        INSERT OR IGNORE INTO comments (id, proposal_id, user_id, text, parent_id)
        VALUES (?, ?, ?, ?, ?)
      `, [comment.id, comment.proposal_id, comment.user_id, comment.text, comment.parent_id], (err) => {
        if (err) {
          console.error('Error inserting comment:', err);
        }
        commentsInserted++;
        if (commentsInserted === demoComments.length) {
          console.log('Demo data insertion complete!');
          console.log('Database initialized with demo data including headings.');
        }
      });
    });
  }
}

// Always register routes
registerRoutes();

// Only start listening in non-test mode
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

// Export server instance for testing
if (process.env.NODE_ENV === 'test') {
  // For tests, export a function to start the server
  module.exports = async function startTestServer(port = 3000) {
    return new Promise((resolve) => {
      console.log(`🔄 Starting test server on port ${port}...`);
      const testServer = app.listen(port, '0.0.0.0', () => {
        console.log(`🚀 Test server started on port ${port}`);
        resolve(testServer);
      });

      testServer.on('error', (error) => {
        console.error('❌ Test server failed to start:', error.message);
        process.exit(1);
      });
    });
  };
} else {
  // For production, just export the app
  module.exports = app;
}
