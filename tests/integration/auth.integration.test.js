const request = require('supertest');
const path = require('path');
const fs = require('fs');

// Import the app - we'll need to handle the database setup
let app;
let server;
let testDbPath;

describe('Authentication API Integration Tests', () => {
  beforeAll(async () => {
    // Get the database path (set by setup.js with timestamp)
    testDbPath = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';

    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Import and start test server
    const startTestServer = require('../../server/index');
    server = await startTestServer(3001); // Use port 3001 for auth tests

    // Wait for database initialization
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  afterAll(async () => {
    // Close server
    if (server) {
      server.close();
    }

    // Clean up test database
    try {
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
    } catch (error) {
      console.warn('Could not clean up test database:', error.message);
    }
  });

  describe('POST /api/auth/register', () => {
    test('should register a new user successfully', async () => {
      const userData = {
        name: 'Integration Test User',
        email: 'integration@test.com',
        password: 'TestPass123!'
      };

      const response = await request(server)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('token');
      expect(response.body.user.name).toBe(userData.name);
      expect(response.body.user.email).toBe(userData.email);
      expect(response.body.message).toBe('Registration successful');
    });

    test('should reject duplicate email registration', async () => {
      const userData = {
        name: 'Duplicate User',
        email: 'integration@test.com', // Same email as previous test
        password: 'AnotherPass123!'
      };

      const response = await request(server)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.error).toContain('already exists');
    });

    test('should reject invalid registration data', async () => {
      const invalidData = {
        name: '',
        email: 'invalid-email',
        password: 'weak'
      };

      const response = await request(server)
        .post('/api/auth/register')
        .send(invalidData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('details');
    });
  });

  describe('POST /api/auth/login', () => {
    test('should login with correct credentials', async () => {
      const loginData = {
        email: 'integration@test.com',
        password: 'TestPass123!'
      };

      const response = await request(server)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('token');
      expect(response.body.user.email).toBe(loginData.email);
      expect(response.body.message).toBe('Login successful');
    });

    test('should reject invalid credentials', async () => {
      const loginData = {
        email: 'integration@test.com',
        password: 'WrongPassword123!'
      };

      const response = await request(server)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.error).toBe('Invalid credentials');
    });

    test('should reject non-existent user', async () => {
      const loginData = {
        email: 'nonexistent@test.com',
        password: 'SomePassword123!'
      };

      const response = await request(server)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.error).toBe('Invalid credentials');
    });
  });

  describe('GET /api/auth/me', () => {
    let authToken;

    beforeAll(async () => {
      // Get authentication token for subsequent tests
      const loginResponse = await request(server)
        .post('/api/auth/login')
        .send({
          email: 'integration@test.com',
          password: 'TestPass123!'
        });

      authToken = loginResponse.body.token;
    });

    test('should return current user with valid token', async () => {
      const response = await request(server)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe('integration@test.com');
      expect(response.body.user.name).toBe('Integration Test User');
    });

    test('should reject request without token', async () => {
      const response = await request(server)
        .get('/api/auth/me')
        .expect(401);

      expect(response.body.error).toBe('Not authenticated');
    });

    test('should reject request with invalid token', async () => {
      const response = await request(server)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid.jwt.token')
        .expect(401);

      expect(response.body.error).toBe('Invalid or expired token');
    });
  });

  describe('POST /api/auth/logout', () => {
    test('should logout successfully', async () => {
      const response = await request(server)
        .post('/api/auth/logout')
        .expect(200);

      expect(response.body.message).toBe('Logout successful');
    });
  });

  describe('Security Tests', () => {
    test('should prevent SQL injection in login', async () => {
      const maliciousData = {
        email: "' OR '1'='1'; --",
        password: "' OR '1'='1'; --"
      };

      const response = await request(server)
        .post('/api/auth/login')
        .send(maliciousData)
        .expect(400); // Should get validation error, not 401

      expect(response.body.error).toBe('Invalid input');
    });

    test('should prevent XSS in registration', async () => {
      const xssData = {
        name: '<script>alert("xss")</script>',
        email: 'xss@test.com',
        password: 'SecurePass123!'
      };

      const response = await request(server)
        .post('/api/auth/register')
        .send(xssData)
        .expect(400);

      expect(response.body.error).toBe('Invalid input');
    });

    test('should handle rate limiting', async () => {
      const requests = Array(15).fill().map(() =>
        request(server)
          .post('/api/auth/login')
          .send({
            email: 'integration@test.com',
            password: 'TestPass123!'
          })
      );

      const responses = await Promise.allSettled(requests);
      const rateLimitedResponses = responses.filter(r =>
        r.status === 'fulfilled' && r.value.status === 429
      );

      // At least some requests should be rate limited
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Demo Users', () => {
    test('should allow login with demo users', async () => {
      const demoUsers = [
        { email: 'alice@example.com', password: 'SecurePass123!' },
        { email: 'bob@example.com', password: 'SecurePass123!' },
        { email: 'charlie@example.com', password: 'SecurePass123!' },
        { email: 'diana@example.com', password: 'SecurePass123!' }
      ];

      for (const user of demoUsers) {
        const response = await request(server)
          .post('/api/auth/login')
          .send(user)
          .expect(200);

        expect(response.body).toHaveProperty('user');
        expect(response.body).toHaveProperty('token');
        expect(response.body.user.email).toBe(user.email);
      }
    });
  });
});
