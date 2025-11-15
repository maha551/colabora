const DatabaseConnection = require('./connection');
const UserService = require('./services/UserService');
const { hashPassword } = require('../middleware/auth');
const demoUsers = require('../demoUsers');

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
    try {
      // Initialize connection
      this.db = await this.connection.initialize();

      // Initialize schema and demo data
      await this.initializeSchema();
      await this.initializeDemoData();

      console.log('✅ Database fully initialized');
      return this.db;
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      throw error;
    }
  }

  /**
   * Initialize database schema
   * @returns {Promise<void>}
   */
  async initializeSchema() {
    console.log('Initializing database schema...');

    const tables = this.getTableDefinitions();

    for (const table of tables) {
      await this.executeTableCreation(table);
    }

    // Ensure role column exists
    await this.ensureRoleColumn();

    console.log('✅ Database schema initialized');
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
      console.log(`✅ Created table: ${table.name}`);
    } catch (error) {
      console.error(`❌ Error creating table ${table.name}:`, error);
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
      console.log('✅ Role column ensured');
    } catch (error) {
      // Ignore error if column already exists
      if (!error.message.includes('duplicate column name')) {
        console.error('Error adding role column:', error);
        throw error;
      }
    }
  }

  /**
   * Initialize demo data
   * @returns {Promise<void>}
   */
  async initializeDemoData() {
    console.log('Creating demo users...');

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
          console.log(`⚠️  Demo user ${userData.name} already exists`);
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

        console.log(`✅ Created demo user: ${userData.name} (${userData.role})`);
      } catch (error) {
        console.error(`❌ Error creating demo user ${userData.name}:`, error);
        throw error;
      }
    }

    console.log('✅ Demo users created');
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
