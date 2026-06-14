const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { safeDeleteTestDatabase } = require('../utils/test-helpers');

let server;
let testDbPath;

describe('Auth Regression Tests', () => {
  beforeAll(async () => {
    testDbPath = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';

    await safeDeleteTestDatabase(testDbPath);

    const startTestServer = require('../../server/bootstrap').startApplication;
    server = await startTestServer({ port: 3023, returnServer: true });

    await new Promise(resolve => setTimeout(resolve, 3000));
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => {
        server.close((err) => {
          if (err) console.warn('Error closing server:', err.message);
          resolve();
        });
      });
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      await safeDeleteTestDatabase(testDbPath);
    } catch (error) {
      console.warn('Could not clean up test database:', error.message);
    }
  });

  test('Login flow should work correctly', async () => {
    const response = await request(server)
      .post('/api/auth/login')
      .send({
        email: 'alice@example.com',
        password: 'SecurePass123!'
      })
      .expect(200);

    expect(response.body).toHaveProperty('token');
    expect(response.body).toHaveProperty('user');
    expect(response.body.user.email).toBe('alice@example.com');
  });

  test('Token validation should work', async () => {
    // Login
    const loginResponse = await request(server)
      .post('/api/auth/login')
      .send({
        email: 'alice@example.com',
        password: 'SecurePass123!'
      })
      .expect(200);

    const token = loginResponse.body.token;

    // Use token to access protected endpoint
    const meResponse = await request(server)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(meResponse.body.user.email).toBe('alice@example.com');
  });

  test('Invalid token should be rejected', async () => {
    const response = await request(server)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid.token.here')
      .expect(401);

    expect(response.body.error).toContain('token');
  });

  test('Logout should work', async () => {
    const response = await request(server)
      .post('/api/auth/logout')
      .expect(200);

    expect(response.body.message).toContain('successful');
  });

  test('Password security: weak passwords should be rejected', async () => {
    const response = await request(server)
      .post('/api/auth/register')
      .send(require('../utils/test-helpers').withLegalConsent({
        name: 'Test User',
        email: 'weakpass@test.com',
        password: 'weak'
      }))
      .expect(400);

    expect(response.body).toHaveProperty('error');
  });
});

