const DatabaseConnection = require('./connection');
const UserService = require('./services/UserService');
const { hashPassword } = require('../middleware/auth');
const demoUsers = require('../demoUsers');
const { logger } = require('../middleware/logger');

/**
 * Database Manager
 * Orchestrates database initialization, schema setup, and demo data creation
 */
class DatabaseManager {
  constructor(config) {
    this.config = config;
    this.connection = new DatabaseConnection(config);
    this.db = null;
  }

  /**
   * Initialize the database with schema and demo data
   * @returns {Promise<Object>} Database instance
   */
  async initialize() {
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info('Database initialization attempt', { attempt, maxRetries, databasePath: this.config.DATABASE_URL });

        // Initialize connection
        this.db = await this.connection.initialize();

        // Initialize schema and demo data
        await this.initializeSchema();
        await this.initializeDemoData();

        logger.info('Database fully initialized');
        return this.db;

      } catch (error) {
        logger.error('Database initialization attempt failed', { attempt, maxRetries, error: error.message, stack: error.stack });
        lastError = error;

        // Clean up failed connection
        if (this.db) {
          try {
            await this.connection.close();
          } catch (closeError) {
            logger.warn('Failed to close failed database connection', { error: closeError.message });
          }
          this.db = null;
        }

        // Don't retry in production for faster startup
        if (this.config.NODE_ENV === 'production') {
          logger.warn('Production mode: Not retrying database initialization');
          break;
        }

        // Wait before retrying (exponential backoff)
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          logger.info('Retrying database initialization', { delay, attempt, maxRetries });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // If we get here, all retries failed
    logger.error('All database initialization attempts failed', { maxRetries, lastError: lastError?.message });
    throw new Error(`Database initialization failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
  }

  /**
   * Initialize database schema
   * @returns {Promise<void>}
   */
  async initializeSchema() {
    logger.info('Initializing database schema');

    try {
      const tables = this.getTableDefinitions();

      for (const table of tables) {
        await this.executeTableCreation(table);
      }

      // Ensure role column exists
      await this.ensureRoleColumn();

      logger.info('Database schema initialized');
    } catch (error) {
      logger.error('Schema initialization failed', { error: error.message, stack: error.stack });

      // If we're in production and schema init fails, try to recreate database
      if (this.config.NODE_ENV === 'production') {
        logger.warn('Production mode: Attempting database recreation due to schema incompatibility');
        await this.recreateDatabase();
      } else {
        throw error;
      }
    }
  }

  /**
   * Recreate the database (for production schema incompatibility issues)
   * @returns {Promise<void>}
   */
  async recreateDatabase() {
    logger.warn('Recreating database due to schema incompatibility');

    try {
      // Close current connection
      if (this.db) {
        await new Promise((resolve) => {
          this.db.close((err) => {
            if (err) logger.warn('Error closing database', { error: err.message });
            resolve();
          });
        });
      }

      // Remove database file if it exists
      const fs = require('fs');
      const dbPath = this.config.DATABASE_URL;

      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
        logger.info('Removed old database file');
      }

      // Remove WAL and SHM files if they exist
      const walFile = `${dbPath}-wal`;
      const shmFile = `${dbPath}-shm`;

      if (fs.existsSync(walFile)) fs.unlinkSync(walFile);
      if (fs.existsSync(shmFile)) fs.unlinkSync(shmFile);

      logger.info('Reinitializing database connection');

      // Reinitialize connection and schema
      this.db = await this.connection.initialize();
      await this.initializeSchema();
      await this.initializeDemoData();

      logger.info('Database recreated successfully');

    } catch (error) {
      logger.error('Database recreation failed', { error: error.message, stack: error.stack });
      throw new Error(`Database recreation failed: ${error.message}`);
    }
  }

  /**
   * Get all table definitions
   * @returns {Array<Object>} Table definitions
   */
  getTableDefinitions() {
    return [
      {
        name: 'users',
        sql: `CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT,
          avatar TEXT,
          bio TEXT,
          role TEXT DEFAULT 'user',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      },
      {
        name: 'organizations',
        sql: `CREATE TABLE IF NOT EXISTS organizations (
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
          branding_color TEXT,
          branding_logo_url TEXT,
          branding_title TEXT,
          FOREIGN KEY (created_by_admin_id) REFERENCES users(id)
        )`
      },
      {
        name: 'organization_governance_rules',
        sql: `CREATE TABLE IF NOT EXISTS organization_governance_rules (
          id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL,
          representative_term_months INTEGER DEFAULT 12,
          representative_term_limits INTEGER,
          election_voting_method TEXT CHECK(election_voting_method IN ('simple_majority', 'ranked_choice', 'approval')) DEFAULT 'simple_majority',
          election_quorum_percentage REAL DEFAULT 0.5,
          election_notice_days INTEGER DEFAULT 14,
          default_voting_deadline_hours INTEGER DEFAULT 168,
          default_quorum_percentage REAL DEFAULT 0.5,
          document_proposal_period_days INTEGER DEFAULT 365,
          threshold_calculation_method TEXT CHECK(threshold_calculation_method IN ('all_votes', 'all_members')) DEFAULT 'all_votes',
          default_acceptance_threshold REAL DEFAULT 75.0,
          anonymous_voting_enabled BOOLEAN DEFAULT 1,
          vote_change_allowed BOOLEAN DEFAULT 0,
          representative_can_create_votes BOOLEAN DEFAULT 1,
          representative_can_invite_members BOOLEAN DEFAULT 1,
          representative_can_manage_documents BOOLEAN DEFAULT 1,
          representative_approval_required BOOLEAN DEFAULT 1,
          tamper_proof_enabled BOOLEAN DEFAULT 1,
          audit_trail_enabled BOOLEAN DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          UNIQUE(organization_id)
        )`
      },
      {
        name: 'organization_members',
        sql: `CREATE TABLE IF NOT EXISTS organization_members (
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
        )`
      },
      {
        name: 'documents',
        sql: `CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            owner_id TEXT NOT NULL,
            collaborators TEXT, -- JSON array of collaborator objects (for legacy/personal docs)
            ownership_type TEXT CHECK(ownership_type IN ('personal', 'shared', 'organizational')) DEFAULT 'personal',
            creator_ids TEXT, -- JSON array for shared docs
            organization_id TEXT, -- For organizational docs
            parent_id TEXT, -- For hierarchical document structure
            status TEXT CHECK(status IN ('proposal', 'draft', 'agreed', 'voting', 'rejected', 'expired')) DEFAULT 'draft',
            proposal_deadline DATETIME, -- Deadline for proposal period (default 1 year from creation, configurable via governance)
            voting_deadline DATETIME, -- Deadline for voting period
            paragraph_proposals_cutoff DATETIME, -- When to disable new paragraph proposals
            voting_started_at DATETIME, -- When voting period started
            min_voters_required INTEGER DEFAULT 0, -- Minimum voters for quorum
            adopted_at DATETIME, -- When document was adopted
            deletion_proposed_at DATETIME, -- When deletion was proposed
            deletion_proposed_by TEXT, -- Who proposed deletion
            deletion_vote_deadline DATETIME, -- Deadline for deletion vote
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
          )`
      },
      {
        name: 'document_collaborators',
        sql: `CREATE TABLE IF NOT EXISTS document_collaborators (
          id TEXT PRIMARY KEY,
          document_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (document_id) REFERENCES documents(id),
          FOREIGN KEY (user_id) REFERENCES users(id),
          UNIQUE(document_id, user_id)
        )`
      },
      {
        name: 'paragraphs',
        sql: `CREATE TABLE IF NOT EXISTS paragraphs (
          id TEXT PRIMARY KEY,
          document_id TEXT NOT NULL,
          title TEXT,
          heading_level TEXT,
          text TEXT NOT NULL,
          order_index INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (document_id) REFERENCES documents(id)
        )`
      },
      {
        name: 'proposals',
        sql: `CREATE TABLE IF NOT EXISTS proposals (
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
        )`
      },
      {
        name: 'votes',
        sql: `CREATE TABLE IF NOT EXISTS votes (
          id TEXT PRIMARY KEY,
          proposal_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          vote TEXT CHECK(vote IN ('PRO', 'NEUTRAL', 'CONTRA')) NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (proposal_id) REFERENCES proposals(id),
          FOREIGN KEY (user_id) REFERENCES users(id),
          UNIQUE(proposal_id, user_id)
        )`
      },
      {
        name: 'history',
        sql: `CREATE TABLE IF NOT EXISTS history (
          id TEXT PRIMARY KEY,
          paragraph_id TEXT NOT NULL,
          proposal_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          old_text TEXT,
          new_text TEXT NOT NULL,
          approval_percentage REAL NOT NULL,
          heading_level TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (paragraph_id) REFERENCES paragraphs(id),
          FOREIGN KEY (proposal_id) REFERENCES proposals(id),
          FOREIGN KEY (user_id) REFERENCES users(id)
        )`
      },
      {
        name: 'structure_proposals',
        sql: `CREATE TABLE IF NOT EXISTS structure_proposals (
          id TEXT PRIMARY KEY,
          document_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          status TEXT CHECK(status IN ('draft', 'proposed', 'approved', 'rejected')) DEFAULT 'draft',
          changes TEXT NOT NULL, -- JSON array of structure changes
          voting_deadline DATETIME,
          acceptance_threshold REAL DEFAULT 75.0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (document_id) REFERENCES documents(id),
          FOREIGN KEY (user_id) REFERENCES users(id)
        )`
      },
      {
        name: 'structure_proposal_votes',
        sql: `CREATE TABLE IF NOT EXISTS structure_proposal_votes (
          id TEXT PRIMARY KEY,
          structure_proposal_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          vote TEXT CHECK(vote IN ('PRO', 'CONTRA', 'NEUTRAL')) NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (structure_proposal_id) REFERENCES structure_proposals(id),
          FOREIGN KEY (user_id) REFERENCES users(id),
          UNIQUE(structure_proposal_id, user_id)
        )`
      },
      {
        name: 'comments',
        sql: `CREATE TABLE IF NOT EXISTS comments (
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
      },
      {
        name: 'document_deletion_votes',
        sql: `CREATE TABLE IF NOT EXISTS document_deletion_votes (
          id TEXT PRIMARY KEY,
          document_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          vote TEXT CHECK(vote IN ('PRO', 'NEUTRAL', 'CONTRA')) NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id),
          UNIQUE(document_id, user_id)
        )`
      },
      {
        name: 'document_status_history',
        sql: `CREATE TABLE IF NOT EXISTS document_status_history (
          id TEXT PRIMARY KEY,
          document_id TEXT NOT NULL,
          old_status TEXT,
          new_status TEXT NOT NULL,
          changed_by TEXT,
          change_reason TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
          FOREIGN KEY (changed_by) REFERENCES users(id)
        )`
      }
    ];
  }

  /**
   * Execute table creation
   * @param {Object} table - Table definition
   * @returns {Promise<void>}
   */
  async executeTableCreation(table) {
    try {
      await this.connection.execute(table.sql);
      logger.debug('Created table', { tableName: table.name });
    } catch (error) {
      logger.error('Error creating table', { tableName: table.name, error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Ensure role column exists (for backward compatibility)
   * @returns {Promise<void>}
   */
  async ensureRoleColumn() {
    try {
      await this.connection.execute('ALTER TABLE users ADD COLUMN role TEXT DEFAULT \'user\'');
      logger.debug('Role column ensured');
    } catch (error) {
      // Ignore error if column already exists
      if (!error.message.includes('duplicate column name')) {
        logger.error('Error adding role column', { error: error.message, stack: error.stack });
        throw error;
      }
    }
  }

  /**
   * Initialize demo data
   * @returns {Promise<void>}
   */
  async initializeDemoData() {
    logger.info('Creating demo users');

    const demoUsersData = [
      { ...demoUsers[0], password: 'SecurePass123!', role: 'user' },
      { ...demoUsers[1], password: 'SecurePass123!', role: 'user' },
      { ...demoUsers[2], password: 'SecurePass123!', role: 'user' },
      { ...demoUsers[3], password: 'SecurePass123!', role: 'user' },
      { ...demoUsers[4], password: 'AdminSecurePass123!', role: 'admin' } // Admin user
    ];

    for (const userData of demoUsersData) {
      try {
        // Check if user already exists
        const existingUser = await UserService.findByEmail(this.db, userData.email);
        if (existingUser) {
          logger.debug('Demo user already exists, skipping', { userName: userData.name });
          continue;
        }

        // Hash password and create user
        const hashedPassword = await hashPassword(userData.password);
        await UserService.create(this.db, {
          name: userData.name,
          email: userData.email,
          passwordHash: hashedPassword,
          role: userData.role
        });

        logger.debug('Created demo user', { userName: userData.name, role: userData.role });
      } catch (error) {
        // Handle unique constraint violations gracefully
        if (error.message && error.message.includes('UNIQUE constraint failed')) {
          logger.debug('Demo user already exists (constraint violation), skipping', { userName: userData.name });
        } else {
          logger.error('Error creating demo user', { userName: userData.name, error: error.message, stack: error.stack });
          // Don't throw error for demo user creation failures - they're not critical
          logger.warn('Continuing despite demo user creation error', { userName: userData.name });
        }
      }
    }

    logger.info('Demo users created');
  }

  /**
   * Get database instance
   * @returns {Object} Database instance
   */
  getInstance() {
    return this.connection.getInstance();
  }

  /**
   * Close database connection
   * @returns {Promise<void>}
   */
  async close() {
    await this.connection.close();
  }

  /**
   * Check database health
   * @returns {Promise<boolean>} Health status
   */
  async isHealthy() {
    return this.connection.isHealthy();
  }
}

module.exports = DatabaseManager;
