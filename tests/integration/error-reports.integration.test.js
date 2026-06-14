const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { authenticateUser, safeDeleteTestDatabase } = require('../utils/test-helpers');

let server;
let authToken;
let testDbPath;

describe('Error Reports API Integration Tests', () => {
  beforeAll(async () => {
    testDbPath = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';

    await safeDeleteTestDatabase(testDbPath);

    const startTestServer = require('../../server/bootstrap').startApplication;
    server = await startTestServer({ port: 3026, returnServer: true });

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

  describe('POST /api/error-reports', () => {
    test('should create error report', async () => {
      const reportData = {
        title: 'Test Error Report',
        description: 'This is a test error report',
        errorMessage: 'Test error message',
        url: 'http://localhost:3000/test',
        userAgent: 'Test User Agent'
      };

      const response = await request(server)
        .post('/api/error-reports')
        .set('Authorization', `Bearer ${authToken}`)
        .send(reportData)
        .expect(201);

      expect(response.body).toHaveProperty('report');
      expect(response.body.report.title).toBe(reportData.title);
    });

    test('should create error report without authentication', async () => {
      const reportData = {
        title: 'Anonymous Error Report',
        description: 'Error report without auth',
        errorMessage: 'Test error'
      };

      const response = await request(server)
        .post('/api/error-reports')
        .send(reportData)
        .expect(201);

      expect(response.body.report).toBeDefined();
    });

    test('should reject report without title', async () => {
      const response = await request(server)
        .post('/api/error-reports')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          description: 'Missing title'
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/error-reports (admin only)', () => {
    test('should retrieve error reports as admin', async () => {
      const adminToken = await authenticateUser(server, 'admin@colabora.local', 'AdminSecurePass123!');

      const response = await request(server)
        .get('/api/error-reports')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('reports');
      expect(Array.isArray(response.body.reports)).toBe(true);
    });

    test('should reject access without admin role', async () => {
      const response = await request(server)
        .get('/api/error-reports')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);

      expect(response.body.error.toLowerCase()).toContain('admin');
    });
  });
});

