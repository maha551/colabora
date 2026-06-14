const path = require('path');
const KnexConnection = require('./knexConnection');
const UserService = require('./services/UserService');
const { hashPassword } = require('../middleware/auth');
const demoUsers = require('../demoUsers');
const { logger } = require('../middleware/logger');
const { ensureSystemUser } = require('./ensureSystemUser');

class DatabaseManager {
  constructor(config) {
    this.config = config;
    this.connection = new KnexConnection(config);
    this.db = null;
  }

  async initialize() {
    logger.info('Initializing database connection');
    this.db = await this.connection.initialize();

    try {
      await this.runKnexMigrations();
      await this.initializeDemoData();
      this.logAdminSetupGuidance();
      logger.info('Database initialized via Knex migrations');
      return this.db;
    } catch (error) {
      logger.error('Database initialization failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async runKnexMigrations() {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    if (this.config.NODE_ENV === 'test' && process.env.SKIP_RUNTIME_MIGRATIONS === '1') {
      logger.info('Skipping runtime migrations in test environment (handled by test setup)');
      return;
    }

    const migrationsDirectory = path.resolve(__dirname, '../../knex/migrations');
    logger.info('Running Knex migrations', { migrationsDirectory });

    const [batchNo, log] = await this.db.migrate.latest({
      directory: migrationsDirectory
    });

    logger.info('Knex migrations completed', {
      batchNo,
      executedCount: log.length,
      executedMigrations: log
    });
  }

  async initializeDemoData() {
    await ensureSystemUser(this.db);

    if (this.config.NODE_ENV === 'production') {
      logger.info('Skipping demo user creation in production');
      return;
    }

    const demoUsersData = [
      { ...demoUsers[0], password: 'SecurePass123!', role: 'user' },
      { ...demoUsers[1], password: 'SecurePass123!', role: 'user' },
      { ...demoUsers[2], password: 'SecurePass123!', role: 'user' },
      { ...demoUsers[3], password: 'SecurePass123!', role: 'user' },
      { ...demoUsers[4], password: 'AdminSecurePass123!', role: 'admin' }
    ];

    for (const userData of demoUsersData) {
      const existingUser = await UserService.findByEmail(this.db, userData.email);
      if (existingUser) {
        continue;
      }

      const hashedPassword = await hashPassword(userData.password);
      try {
        await UserService.create(this.db, {
          name: userData.name,
          email: userData.email,
          passwordHash: hashedPassword,
          role: userData.role
        });
      } catch (error) {
        // The findByEmail check above has a race window: when multiple app
        // instances/workers initialize the same database concurrently, another
        // boot may insert the same demo user between our SELECT and INSERT.
        // Treat a unique-violation as "already created" rather than failing
        // the whole startup.
        if (!this.isDuplicateUserError(error)) {
          throw error;
        }
      }
    }

    logger.info('Demo users ensured for non-production environment');
  }

  /**
   * Detect a PostgreSQL unique-violation (duplicate key) error.
   * Note: UserService.create re-wraps the original pg error in a generic Error,
   * so the SQLSTATE code (23505) is preserved only in the message text; match on
   * both the code (when present) and the message for robustness.
   * @param {Error} error
   * @returns {boolean}
   */
  isDuplicateUserError(error) {
    if (!error) {
      return false;
    }
    if (error.code === '23505') {
      return true;
    }
    const message = error.message || '';
    return /duplicate key value|unique constraint|23505/i.test(message);
  }

  logAdminSetupGuidance() {
    if (this.config.NODE_ENV !== 'production' || !this.db) {
      return;
    }

    this.db('users')
      .where('role', 'admin')
      .first()
      .then(admin => {
        if (!admin) {
          logger.warn('No admin user found. Run "npm run setup-admin" with ADMIN_SETUP_EMAIL and ADMIN_SETUP_PASSWORD.');
        }
      })
      .catch(error => {
        logger.warn('Unable to verify admin user presence', { error: error.message });
      });
  }

  getInstance() {
    return this.db || this.connection.getInstance();
  }

  async close() {
    await this.connection.close();
    this.db = null;
  }

  async isHealthy() {
    return this.connection.checkHealth();
  }

  async attemptRecovery() {
    try {
      const recovered = await this.connection.attemptRecovery();
      if (!recovered) {
        this.db = null;
        return false;
      }

      this.db = this.connection.getInstance();
      await this.runKnexMigrations();
      await this.initializeDemoData();
      return true;
    } catch (error) {
      logger.error('Database recovery failed', {
        error: error.message,
        stack: error.stack
      });
      this.db = null;
      return false;
    }
  }

  getConnection() {
    return this.connection;
  }
}

module.exports = DatabaseManager;
