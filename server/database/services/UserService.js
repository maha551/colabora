const { v4: uuidv4 } = require('uuid');
const TransactionManager = require('./TransactionManager');

class UserService {
  /**
   * Find user by ID
   * @param {Object} knex - Knex instance
   * @param {string} id - User ID
   * @returns {Promise<Object|null>} User object or null if not found
   */
  static async findById(knex, id) {
    try {
      return await TransactionManager.query(knex,
        'SELECT id, name, email, avatar, bio, role, created_at, updated_at FROM users WHERE id = ?',
        [id]
      );
    } catch (error) {
      throw new Error(`Failed to find user by ID: ${error.message}`);
    }
  }

  /**
   * Find user by email
   * @param {Object} knex - Knex instance
   * @param {string} email - User email
   * @returns {Promise<Object|null>} User object or null if not found
   */
  static async findByEmail(knex, email) {
    try {
      return await TransactionManager.query(knex,
        'SELECT id, name, email, password_hash, avatar, bio, role, created_at, updated_at FROM users WHERE email = ?',
        [email]
      );
    } catch (error) {
      throw new Error(`Failed to find user by email: ${error.message}`);
    }
  }

  /**
   * Find user by email with basic info (for login)
   * @param {Object} knex - Knex instance
   * @param {string} email - User email
   * @returns {Promise<Object|null>} User object with password hash or null if not found
   */
  static async findByEmailForAuth(knex, email) {
    try {
      return await TransactionManager.query(knex,
        'SELECT id, name, email, password_hash, role FROM users WHERE email = ?',
        [email]
      );
    } catch (error) {
      throw new Error(`Failed to find user for authentication: ${error.message}`);
    }
  }

  /**
   * Create a new user
   * @param {Object} knex - Knex instance
   * @param {Object} userData - User data
   * @param {string} userData.name - User name
   * @param {string} userData.email - User email
   * @param {string} userData.passwordHash - Hashed password
   * @param {string} [userData.role='user'] - User role
   * @param {string} [userData.avatar] - User avatar URL
   * @param {string} [userData.bio] - User bio
   * @returns {Promise<string>} Created user ID
   */
  static async create(knex, userData) {
    try {
      const userId = uuidv4();
      const { name, email, passwordHash, role = 'user', avatar, bio } = userData;

      const sql = `
        INSERT INTO users (id, name, email, password_hash, role, avatar, bio, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;
      const params = [userId, name, email, passwordHash, role, avatar || null, bio || null];

      await TransactionManager.execute(knex, sql, params);
      return userId;
    } catch (error) {
      throw new Error(`Failed to create user: ${error.message}`);
    }
  }

  /**
   * Update user profile
   * @param {Object} knex - Knex instance
   * @param {string} userId - User ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<boolean>} Success status
   */
  static async updateProfile(knex, userId, updates) {
    try {
      const { name, avatar, bio } = updates;
      const sql = `
        UPDATE users
        SET name = ?, avatar = ?, bio = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      const params = [name, avatar, bio, userId];

      await TransactionManager.execute(knex, sql, params);
      // Verify update by checking if user still exists
      const updated = await TransactionManager.query(knex, 'SELECT id FROM users WHERE id = ?', [userId]);
      return !!updated;
    } catch (error) {
      throw new Error(`Failed to update user profile: ${error.message}`);
    }
  }

  /**
   * Update user role
   * @param {Object} knex - Knex instance
   * @param {string} userId - User ID
   * @param {string} role - New role
   * @returns {Promise<boolean>} Success status
   */
  static async updateRole(knex, userId, role) {
    try {
      await TransactionManager.execute(knex, 'UPDATE users SET role = ? WHERE id = ?', [role, userId]);
      // Verify update by checking if user still exists
      const updated = await TransactionManager.query(knex, 'SELECT id FROM users WHERE id = ?', [userId]);
      return !!updated;
    } catch (error) {
      throw new Error(`Failed to update user role: ${error.message}`);
    }
  }

  /**
   * Get user role
   * @param {Object} knex - Knex instance
   * @param {string} userId - User ID
   * @returns {Promise<string|null>} User role or null if not found
   */
  static async getRole(knex, userId) {
    try {
      const row = await TransactionManager.query(knex, 'SELECT role FROM users WHERE id = ?', [userId]);
      return row ? row.role : null;
    } catch (error) {
      throw new Error(`Failed to get user role: ${error.message}`);
    }
  }

  /**
   * Check if user exists by email
   * @param {Object} knex - Knex instance
   * @param {string} email - User email
   * @returns {Promise<boolean>} Whether user exists
   */
  static async existsByEmail(knex, email) {
    try {
      const row = await TransactionManager.query(knex, 'SELECT id FROM users WHERE email = ?', [email]);
      return !!row;
    } catch (error) {
      throw new Error(`Failed to check user existence: ${error.message}`);
    }
  }

  /**
   * Get all admin users
   * @param {Object} knex - Knex instance
   * @returns {Promise<Array>} Array of admin users
   */
  static async getAdmins(knex) {
    try {
      return await TransactionManager.queryAll(knex, 'SELECT id, name, email FROM users WHERE role = ?', ['admin']);
    } catch (error) {
      throw new Error(`Failed to get admin users: ${error.message}`);
    }
  }

  /**
   * Get user basic info (for admin operations)
   * @param {Object} knex - Knex instance
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} User basic info or null if not found
   */
  static async getBasicInfo(knex, userId) {
    try {
      return await TransactionManager.query(knex, 'SELECT id, name, email, role FROM users WHERE id = ?', [userId]);
    } catch (error) {
      throw new Error(`Failed to get user basic info: ${error.message}`);
    }
  }

  /**
   * Get user name and email (for document ownership display)
   * @param {Object} knex - Knex instance
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} User name and email or null if not found
   */
  static async getNameAndEmail(knex, userId) {
    try {
      return await TransactionManager.query(knex, 'SELECT name, email FROM users WHERE id = ?', [userId]);
    } catch (error) {
      throw new Error(`Failed to get user name and email: ${error.message}`);
    }
  }
}

module.exports = UserService;

