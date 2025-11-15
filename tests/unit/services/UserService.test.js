const UserService = require('../../../server/database/services/UserService');
const DatabaseConnection = require('../../../server/database/connection');
const path = require('path');

describe('UserService', () => {
  let db;
  let connection;

  beforeAll(async () => {
    // Create a test database connection
    const config = {
      DATABASE_URL: path.join(__dirname, '../../../test-user-service.db')
    };
    connection = new DatabaseConnection(config);
    db = await connection.initialize();

    // Create users table for testing
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        avatar TEXT,
        bio TEXT,
        role TEXT DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });

  afterAll(async () => {
    await connection.close();
  });

  beforeEach(async () => {
    // Clear users table before each test
    await connection.execute('DELETE FROM users');
  });

  describe('create', () => {
    test('should create a new user successfully', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        passwordHash: 'hashedpassword123',
        role: 'user'
      };

      const userId = await UserService.create(db, userData);

      expect(userId).toBeDefined();
      expect(typeof userId).toBe('string');

      // Verify user was created
      const createdUser = await UserService.findById(db, userId);
      expect(createdUser).toEqual({
        id: userId,
        name: 'Test User',
        email: 'test@example.com',
        avatar: null,
        bio: null,
        role: 'user',
        created_at: expect.any(String),
        updated_at: expect.any(String)
      });
    });

    test('should create user with avatar and bio', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        passwordHash: 'hashedpassword123',
        avatar: 'https://example.com/avatar.jpg',
        bio: 'Test bio'
      };

      const userId = await UserService.create(db, userData);

      const createdUser = await UserService.findById(db, userId);
      expect(createdUser.avatar).toBe('https://example.com/avatar.jpg');
      expect(createdUser.bio).toBe('Test bio');
    });
  });

  describe('findById', () => {
    test('should return user when found', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        passwordHash: 'hashedpassword123'
      };
      const userId = await UserService.create(db, userData);

      const user = await UserService.findById(db, userId);

      expect(user).toBeTruthy();
      expect(user.id).toBe(userId);
      expect(user.name).toBe('Test User');
    });

    test('should return null when user not found', async () => {
      const user = await UserService.findById(db, 'nonexistent-id');
      expect(user).toBeNull();
    });
  });

  describe('findByEmail', () => {
    test('should return user when found', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        passwordHash: 'hashedpassword123'
      };
      await UserService.create(db, userData);

      const user = await UserService.findByEmail(db, 'test@example.com');

      expect(user).toBeTruthy();
      expect(user.email).toBe('test@example.com');
      expect(user.name).toBe('Test User');
    });

    test('should return null when email not found', async () => {
      const user = await UserService.findByEmail(db, 'nonexistent@example.com');
      expect(user).toBeNull();
    });
  });

  describe('findByEmailForAuth', () => {
    test('should return user with password hash for authentication', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        passwordHash: 'hashedpassword123'
      };
      await UserService.create(db, userData);

      const user = await UserService.findByEmailForAuth(db, 'test@example.com');

      expect(user).toBeTruthy();
      expect(user.password_hash).toBe('hashedpassword123');
    });
  });

  describe('updateProfile', () => {
    test('should update user profile successfully', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        passwordHash: 'hashedpassword123'
      };
      const userId = await UserService.create(db, userData);

      const success = await UserService.updateProfile(db, userId, {
        name: 'Updated Name',
        avatar: 'new-avatar.jpg',
        bio: 'New bio'
      });

      expect(success).toBe(true);

      const updatedUser = await UserService.findById(db, userId);
      expect(updatedUser.name).toBe('Updated Name');
      expect(updatedUser.avatar).toBe('new-avatar.jpg');
      expect(updatedUser.bio).toBe('New bio');
    });

    test('should return false for non-existent user', async () => {
      const success = await UserService.updateProfile(db, 'nonexistent-id', {
        name: 'Updated Name'
      });
      expect(success).toBe(false);
    });
  });

  describe('updateRole', () => {
    test('should update user role successfully', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        passwordHash: 'hashedpassword123',
        role: 'user'
      };
      const userId = await UserService.create(db, userData);

      const success = await UserService.updateRole(db, userId, 'admin');

      expect(success).toBe(true);

      const updatedUser = await UserService.findById(db, userId);
      expect(updatedUser.role).toBe('admin');
    });
  });

  describe('getRole', () => {
    test('should return user role', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        passwordHash: 'hashedpassword123',
        role: 'admin'
      };
      const userId = await UserService.create(db, userData);

      const role = await UserService.getRole(db, userId);
      expect(role).toBe('admin');
    });

    test('should return null for non-existent user', async () => {
      const role = await UserService.getRole(db, 'nonexistent-id');
      expect(role).toBeNull();
    });
  });

  describe('existsByEmail', () => {
    test('should return true when user exists', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        passwordHash: 'hashedpassword123'
      };
      await UserService.create(db, userData);

      const exists = await UserService.existsByEmail(db, 'test@example.com');
      expect(exists).toBe(true);
    });

    test('should return false when user does not exist', async () => {
      const exists = await UserService.existsByEmail(db, 'nonexistent@example.com');
      expect(exists).toBe(false);
    });
  });

  describe('getBasicInfo', () => {
    test('should return basic user info', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        passwordHash: 'hashedpassword123',
        role: 'user'
      };
      const userId = await UserService.create(db, userData);

      const info = await UserService.getBasicInfo(db, userId);
      expect(info).toEqual({
        id: userId,
        name: 'Test User',
        email: 'test@example.com',
        role: 'user'
      });
    });
  });

  describe('getNameAndEmail', () => {
    test('should return user name and email', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        passwordHash: 'hashedpassword123'
      };
      const userId = await UserService.create(db, userData);

      const info = await UserService.getNameAndEmail(db, userId);
      expect(info).toEqual({
        name: 'Test User',
        email: 'test@example.com'
      });
    });
  });
});
