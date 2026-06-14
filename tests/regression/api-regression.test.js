const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { authenticateUser, safeDeleteTestDatabase } = require('../utils/test-helpers');

let server;
let authToken;
let testDbPath;

describe('API Regression Tests', () => {
  beforeAll(async () => {
    testDbPath = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';

    await safeDeleteTestDatabase(testDbPath);

    const startTestServer = require('../../server/bootstrap').startApplication;
    server = await startTestServer({ port: 3022, returnServer: true });

    await new Promise(resolve => setTimeout(resolve, 3000));

    authToken = await authenticateUser(server, 'alice@example.com', 'SecurePass123!');
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

  test('Health endpoint should return healthy status', async () => {
    const response = await request(server)
      .get('/api/health')
      .expect(200);

    expect(response.body.status).toBe('healthy');
  });

  test('Auth endpoints should return expected structure', async () => {
    const loginResponse = await request(server)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'SecurePass123!' })
      .expect(200);

    expect(loginResponse.body).toHaveProperty('token');
    expect(loginResponse.body).toHaveProperty('user');
    expect(loginResponse.body.user).toHaveProperty('id');
    expect(loginResponse.body.user).toHaveProperty('email');
  });

  test('Documents list endpoint should return array', async () => {
    const response = await request(server)
      .get('/api/documents')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('documents');
    expect(Array.isArray(response.body.documents)).toBe(true);
  });

  test('Organizations endpoint should return expected structure', async () => {
    const response = await request(server)
      .get('/api/organizations')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('organizations');
    expect(Array.isArray(response.body.organizations)).toBe(true);
  });

  test('Search endpoint should return results structure', async () => {
    const response = await request(server)
      .get('/api/search')
      .set('Authorization', `Bearer ${authToken}`)
      .query({ q: 'test' })
      .expect(200);

    expect(response.body).toHaveProperty('results');
    expect(response.body).toHaveProperty('count');
    expect(Array.isArray(response.body.results)).toBe(true);
  });

  test('Notifications endpoint should return array', async () => {
    const response = await request(server)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('notifications');
    expect(Array.isArray(response.body.notifications)).toBe(true);
  });

  test('All endpoints should require authentication where needed', async () => {
    const protectedEndpoints = [
      { method: 'get', path: '/api/documents' },
      { method: 'get', path: '/api/organizations' },
      { method: 'get', path: '/api/search', query: { q: 'test' } },
      { method: 'get', path: '/api/notifications' }
    ];

    for (const endpoint of protectedEndpoints) {
      const req = request(server)[endpoint.method](endpoint.path);
      if (endpoint.query) {
        req.query(endpoint.query);
      }
      const response = await req.expect(401);
      expect(response.body.error).toBeDefined();
    }
  });
});

