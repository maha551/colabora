const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const demoUsers = require('./demoUsers');

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

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL
    : /^http:\/\/localhost:\d+$/,
  credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(session({
  name: 'colabora.sid',
  secret: process.env.SESSION_SECRET || 'colabora-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

// Token-based authentication middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - Auth check`);

  if (req.session && req.session.userId && !req.user) {
    const sessionUser = demoUsers.find(u => u.id === req.session.userId);
    if (sessionUser) {
      req.user = sessionUser;
      console.log(`Session auth successful for user: ${sessionUser.name}`);
    }
  }

  if (!req.user) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      console.log(`Token received: ${token.substring(0, 20)}...`);
      if (token && token.startsWith('demo-token-')) {
        const tokenParts = token.split('-');
        if (tokenParts.length >= 3) {
          const userId = tokenParts[2];
          const user = demoUsers.find(u => u.id === userId);
          if (user) {
            req.user = user;
            console.log(`Token auth successful for user: ${user.name}`);
            if (req.session) {
              req.session.userId = user.id;
              req.session.user = user;
            }
          } else {
            console.log(`Token auth failed - user not found: ${userId}`);
          }
        } else {
          console.log('Token auth failed - invalid token format');
        }
      } else {
        console.log('Token auth failed - invalid token prefix');
      }
    } else {
      console.log('No authorization header found');
    }
  } else {
    console.log(`User already authenticated: ${req.user?.name}`);
  }
  next();
});

// Initialize database and start server only after initialization completes
// Note: Using /data/ for Fly.io persistent storage (survives redeploys)
const db = new sqlite3.Database('/data/colabora.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }

  console.log('Connected to SQLite database.');

  // Make database available to routes
  app.locals.db = db;

  // Initialize database and start server when complete
  initializeDatabaseAndStartServer(db);
});

function initializeDatabaseAndStartServer(db) {
  initializeDatabase(db);

  console.log('Waiting for database initialization...');
  const checkInterval = setInterval(() => {
    db.get('SELECT COUNT(*) as count FROM paragraphs WHERE document_id = ?', ['demo-doc-1'], (err, row) => {
      if (err) {
        console.log('Database check failed:', err.message);
        return;
      }

      console.log(`Database check: found ${row.count} paragraphs for demo-doc-1`);
      if (row && row.count > 0) {
        clearInterval(checkInterval);
        startServer();
      }
    });
  }, 1000);

  serverStartTimeout = setTimeout(() => {
    clearInterval(checkInterval);
    if (!serverStarted) {
      console.log('Database initialization timeout, starting server anyway for debugging...');
      startServer();
    }
  }, 10000);
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

  // Debug middleware to log all API requests
  app.use('/api', (req, res, next) => {
    console.log(`API REQUEST: ${req.method} ${req.path}`);
    next();
  });

  // Routes (moved here from global scope to ensure they're registered after DB init)
  app.use('/api/auth', authRoutes);
  app.use('/api/pending-votes', pendingVotesRoutes);
  app.use('/api/documents', documentRoutes);
  app.use('/api/documents/:documentId/activity', activityRoutes);
  app.use('/api/documents/:documentId/paragraphs', paragraphRoutes);
  app.use('/api/documents/:documentId/paragraphs/:paragraphId/proposals', proposalRoutes);
  app.use('/api/documents/:documentId/paragraphs/:paragraphId/proposals/:proposalId/vote', voteRoutes);
  app.use('/api/documents/:documentId/paragraphs/:paragraphId/proposals/:proposalId/comments', commentRoutes);

  // Serve static files from client build in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../client/build')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '../client/build/index.html'));
    });
  }

  // Error handling middleware
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
  });

  // Start server
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('Demo data should now be available!');
  });
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

// Health check endpoint for Fly.io
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Debug endpoint for document access
app.get('/api/debug-doc/:id', (req, res) => {
  const db = req.app.locals.db;
  const documentId = req.params.id;
  const userId = req.user ? req.user.id : 'no-user';

  console.log(`Debug: User ${userId} checking document ${documentId}`);

  db.all('SELECT document_id, COUNT(*) as count FROM paragraphs GROUP BY document_id', [], (err, docCounts) => {
    if (err) {
      return res.json({ error: 'Query failed', details: err.message });
    }

    db.get('SELECT * FROM documents WHERE id = ?', [documentId], (err, doc) => {
      if (err) {
        return res.json({ error: 'Document query failed', details: err.message });
      }

      res.json({
        user: req.user,
        document: doc,
        documentCounts: docCounts,
        requestedId: documentId
      });
    });
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      owner_id TEXT NOT NULL,
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (paragraph_id) REFERENCES paragraphs(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (proposal_id) REFERENCES proposals(id)
    )`
  ];

  // Execute table creation sequentially to ensure proper initialization
  let tablesCreated = 0;
  const totalTables = tables.length;

  function createNextTable() {
    if (tablesCreated >= totalTables) {
      // All tables created, now ensure new columns exist
      console.log('All tables created, ensuring new columns...');
      ensureColumn(db, 'users', 'avatar', 'TEXT');
      ensureColumn(db, 'users', 'bio', 'TEXT');
      
      // Wait a bit for column additions to complete, then insert demo data
      setTimeout(() => {
        console.log('Inserting demo data...');
        insertDemoData(db);
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

function insertDemoData(db) {
  console.log('Inserting demo data...');

  // Insert demo users
  let usersInserted = 0;
  demoUsers.forEach(user => {
    db.run(`
      INSERT OR IGNORE INTO users (id, name, email) VALUES (?, ?, ?)
    `, [user.id, user.name, user.email], (err) => {
      if (err) {
        console.error('Error inserting user:', err);
      }
      usersInserted++;
      if (usersInserted === demoUsers.length) {
        console.log('Users inserted, inserting document...');
        insertDocument();
      }
    });
  });

  function insertDocument() {
    // Insert demo document
    db.run(`
      INSERT OR IGNORE INTO documents (id, title, owner_id) VALUES (?, ?, ?)
    `, ['demo-doc-1', 'Sample Collaborative Document', 'cmgxlfj9z0000orjgnfy3revt'], (err) => {
      if (err) {
        console.error('Error inserting document:', err);
        return;
      }
      console.log('Document inserted, inserting paragraphs...');
      insertParagraphs();
    });
  }

  function insertParagraphs() {
    // Insert demo paragraphs with headings
    const demoParagraphs = [
      { id: 'demo-doc-1-title', title: 'Sample Collaborative Document', text: 'Sample Collaborative Document', order_index: -1, heading_level: 'h1' },
      { id: 'para-h1', title: 'Introduction', text: 'This document demonstrates the collaborative editing features of our platform.', order_index: 0, heading_level: 'h1' },
      { id: 'para-h2-1', title: 'Getting Started', text: 'To begin collaborating, first create a new document or join an existing one.', order_index: 1, heading_level: 'h2' },
      { id: 'para-1', text: 'This is the first paragraph of our collaborative document. It contains some sample text that can be edited by multiple users through our voting system.', order_index: 2 },
      { id: 'para-h2-2', title: 'Making Changes', text: 'Learn how to propose and approve changes in our collaborative environment.', order_index: 3, heading_level: 'h2' },
      { id: 'para-2', text: 'Here is another paragraph that demonstrates the collaborative editing features. Users can suggest changes, vote on proposals, and discuss modifications.', order_index: 4 },
      { id: 'para-h3', title: 'Voting Process', text: 'Understanding how the 75% approval system works.', order_index: 5, heading_level: 'h3' },
      { id: 'para-3', text: 'The voting system requires 75% approval for changes to be accepted. This ensures consensus-driven decision making while allowing progress.', order_index: 6 }
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
          insertCollaborators();
        }
      });
    });
  }

  function insertCollaborators() {
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
          insertProposals();
        }
      });
    });
  }

  function insertProposals() {
    // Insert demo proposals
    const demoProposals = [
      {
        id: 'proposal-h1',
        paragraph_id: 'para-h1',
        user_id: 'cmgxlfj9z0000orjgnfy3revu',
        text: 'Getting Started with Collaboration',
        type: 'TITLE',
        heading_level: 'h1',
        approved: true
      },
      {
        id: 'proposal-1',
        paragraph_id: 'para-1',
        user_id: 'cmgxlfj9z0000orjgnfy3revu',
        text: 'This is the first paragraph of our collaborative document. It contains sample text that can be modified by multiple users through our voting system.',
        type: 'BODY',
        approved: true
      },
      {
        id: 'proposal-2',
        paragraph_id: 'para-1',
        user_id: 'cmgxlfj9z0000orjgnfy3revv',
        text: 'This is the first paragraph of our collaborative document. It contains some sample text that can be edited by multiple users with approval from the team.',
        type: 'BODY',
        approved: false
      },
      {
        id: 'proposal-3',
        paragraph_id: 'para-2',
        user_id: 'cmgxlfj9z0000orjgnfy3revw',
        text: 'This paragraph showcases the collaborative editing capabilities. Team members can propose changes, vote on suggestions, and discuss modifications in real-time.',
        type: 'BODY',
        approved: false
      },
      {
        id: 'proposal-h2',
        paragraph_id: 'para-h2-2',
        user_id: 'cmgxlfj9z0000orjgnfy3revt',
        text: 'Proposing and Approving Changes',
        type: 'TITLE',
        heading_level: 'h2',
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
          insertVotes();
        }
      });
    });
  }

  function insertVotes() {
    // Insert demo votes
    const demoVotes = [
      { id: 'vote-1', proposal_id: 'proposal-1', user_id: 'cmgxlfj9z0000orjgnfy3revt', vote: 'PRO' },
      { id: 'vote-2', proposal_id: 'proposal-1', user_id: 'cmgxlfj9z0000orjgnfy3revu', vote: 'PRO' },
      { id: 'vote-3', proposal_id: 'proposal-1', user_id: 'cmgxlfj9z0000orjgnfy3revv', vote: 'PRO' },
      { id: 'vote-4', proposal_id: 'proposal-1', user_id: 'cmgxlfj9z0000orjgnfy3revw', vote: 'PRO' },
      { id: 'vote-5', proposal_id: 'proposal-2', user_id: 'cmgxlfj9z0000orjgnfy3revt', vote: 'NEUTRAL' },
      { id: 'vote-6', proposal_id: 'proposal-2', user_id: 'cmgxlfj9z0000orjgnfy3revu', vote: 'CONTRA' },
      { id: 'vote-7', proposal_id: 'proposal-3', user_id: 'cmgxlfj9z0000orjgnfy3revt', vote: 'PRO' },
      { id: 'vote-8', proposal_id: 'proposal-3', user_id: 'cmgxlfj9z0000orjgnfy3revv', vote: 'PRO' }
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
          insertComments();
        }
      });
    });
  }

  function insertComments() {
    // Insert demo comments
    const demoComments = [
      {
        id: 'comment-1',
        proposal_id: 'proposal-2',
        user_id: 'cmgxlfj9z0000orjgnfy3revt',
        text: 'I think this wording is clearer and more professional.',
        parent_id: null
      },
      {
        id: 'comment-2',
        proposal_id: 'proposal-2',
        user_id: 'cmgxlfj9z0000orjgnfy3revu',
        text: 'Agreed, but maybe we can combine the best parts of both versions?',
        parent_id: null
      },
      {
        id: 'comment-3',
        proposal_id: 'proposal-3',
        user_id: 'cmgxlfj9z0000orjgnfy3revw',
        text: 'This captures the real-time aspect better.',
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
