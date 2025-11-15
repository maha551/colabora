const { v4: uuidv4 } = require('uuid');

class UserService {
  /**
   * Find user by ID
   * @param {Object} db - SQLite database instance
   * @param {string} id - User ID
   * @returns {Promise<Object|null>} User object or null if not found
   */
  static async findById(db, id) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT id, name, email, avatar, bio, role, created_at, updated_at FROM users WHERE id = ?',
        [id],
        (err, row) => {
          if (err) {
            reject(new Error(`Failed to find user by ID: ${err.message}`));
          } else {
            resolve(row || null);
          }
        }
      );
    });
  }

  /**
   * Find user by email
   * @param {Object} db - SQLite database instance
   * @param {string} email - User email
   * @returns {Promise<Object|null>} User object or null if not found
   */
  static async findByEmail(db, email) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT id, name, email, password_hash, avatar, bio, role, created_at, updated_at FROM users WHERE email = ?',
        [email],
        (err, row) => {
          if (err) {
            reject(new Error(`Failed to find user by email: ${err.message}`));
          } else {
            resolve(row || null);
          }
        }
      );
    });
  }

  /**
   * Find user by email with basic info (for login)
   * @param {Object} db - SQLite database instance
   * @param {string} email - User email
   * @returns {Promise<Object|null>} User object with password hash or null if not found
   */
  static async findByEmailForAuth(db, email) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT id, name, email, password_hash, role FROM users WHERE email = ?',
        [email],
        (err, row) => {
          if (err) {
            reject(new Error(`Failed to find user for authentication: ${err.message}`));
          } else {
            resolve(row || null);
          }
        }
      );
    });
  }

  /**
   * Create a new user
   * @param {Object} db - SQLite database instance
   * @param {Object} userData - User data
   * @param {string} userData.name - User name
   * @param {string} userData.email - User email
   * @param {string} userData.passwordHash - Hashed password
   * @param {string} [userData.role='user'] - User role
   * @param {string} [userData.avatar] - User avatar URL
   * @param {string} [userData.bio] - User bio
   * @returns {Promise<string>} Created user ID
   */
  static async create(db, userData) {
    return new Promise((resolve, reject) => {
      const userId = uuidv4();
      const { name, email, passwordHash, role = 'user', avatar, bio } = userData;

      const sql = `
        INSERT INTO users (id, name, email, password_hash, role, avatar, bio, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;
      const params = [userId, name, email, passwordHash, role, avatar || null, bio || null];

      db.run(sql, params, function(err) {
        if (err) {
          reject(new Error(`Failed to create user: ${err.message}`));
        } else {
          resolve(userId);
        }
      });
    });
  }

  /**
   * Update user profile
   * @param {Object} db - SQLite database instance
   * @param {string} userId - User ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<boolean>} Success status
   */
  static async updateProfile(db, userId, updates) {
    return new Promise((resolve, reject) => {
      const { name, avatar, bio } = updates;
      const sql = `
        UPDATE users
        SET name = ?, avatar = ?, bio = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      const params = [name, avatar, bio, userId];

      db.run(sql, params, function(err) {
        if (err) {
          reject(new Error(`Failed to update user profile: ${err.message}`));
        } else {
          resolve(this.changes > 0);
        }
      });
    });
  }

  /**
   * Update user role
   * @param {Object} db - SQLite database instance
   * @param {string} userId - User ID
   * @param {string} role - New role
   * @returns {Promise<boolean>} Success status
   */
  static async updateRole(db, userId, role) {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE users SET role = ? WHERE id = ?',
        [role, userId],
        function(err) {
          if (err) {
            reject(new Error(`Failed to update user role: ${err.message}`));
          } else {
            resolve(this.changes > 0);
          }
        }
      );
    });
  }

  /**
   * Get user role
   * @param {Object} db - SQLite database instance
   * @param {string} userId - User ID
   * @returns {Promise<string|null>} User role or null if not found
   */
  static async getRole(db, userId) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT role FROM users WHERE id = ?',
        [userId],
        (err, row) => {
          if (err) {
            reject(new Error(`Failed to get user role: ${err.message}`));
          } else {
            resolve(row ? row.role : null);
          }
        }
      );
    });
  }

  /**
   * Check if user exists by email
   * @param {Object} db - SQLite database instance
   * @param {string} email - User email
   * @returns {Promise<boolean>} Whether user exists
   */
  static async existsByEmail(db, email) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT id FROM users WHERE email = ?',
        [email],
        (err, row) => {
          if (err) {
            reject(new Error(`Failed to check user existence: ${err.message}`));
          } else {
            resolve(!!row);
          }
        }
      );
    });
  }

  /**
   * Get all admin users
   * @param {Object} db - SQLite database instance
   * @returns {Promise<Array>} Array of admin users
   */
  static async getAdmins(db) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT id, name, email FROM users WHERE role = ?',
        ['admin'],
        (err, rows) => {
          if (err) {
            reject(new Error(`Failed to get admin users: ${err.message}`));
          } else {
            resolve(rows || []);
          }
        }
      );
    });
  }

  /**
   * Get user basic info (for admin operations)
   * @param {Object} db - SQLite database instance
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} User basic info or null if not found
   */
  static async getBasicInfo(db, userId) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT id, name, email, role FROM users WHERE id = ?',
        [userId],
        (err, row) => {
          if (err) {
            reject(new Error(`Failed to get user basic info: ${err.message}`));
          } else {
            resolve(row || null);
          }
        }
      );
    });
  }

  /**
   * Get user name and email (for document ownership display)
   * @param {Object} db - SQLite database instance
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} User name and email or null if not found
   */
  static async getNameAndEmail(db, userId) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT name, email FROM users WHERE id = ?',
        [userId],
        (err, row) => {
          if (err) {
            reject(new Error(`Failed to get user name and email: ${err.message}`));
          } else {
            resolve(row || null);
          }
        }
      );
    });
  }
}

module.exports = UserService;

