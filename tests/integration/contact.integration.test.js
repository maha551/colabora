const request = require('supertest');
const { safeDeleteTestDatabase } = require('../utils/test-helpers');

let server;
let testDbPath;

describe('Public Contact API Integration Tests', () => {
  beforeAll(async () => {
    testDbPath = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';

    await safeDeleteTestDatabase(testDbPath);

    const startTestServer = require('../../server/bootstrap').startApplication;
    server = await startTestServer({ port: 3027, returnServer: true });

    await new Promise((resolve) => setTimeout(resolve, 2000));
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

    await safeDeleteTestDatabase(testDbPath);
  });

  describe('POST /api/public/contact', () => {
    test('should accept valid contact submission', async () => {
      const response = await request(server)
        .post('/api/public/contact')
        .send({
          name: 'Test User',
          email: 'contact-test@example.com',
          subject: 'Hello',
          message: 'This is a test message from integration tests.',
        })
        .expect(200);

      expect(response.body).toHaveProperty('message');
    });

    test('should reject missing required fields', async () => {
      const response = await request(server)
        .post('/api/public/contact')
        .send({
          name: 'Test User',
          email: 'not-an-email',
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should silently accept honeypot submissions', async () => {
      const response = await request(server)
        .post('/api/public/contact')
        .send({
          name: 'Bot',
          email: 'bot@example.com',
          subject: 'Spam',
          message: 'Buy now',
          website: 'http://spam.example',
        })
        .expect(200);

      expect(response.body).toHaveProperty('message');
    });
  });
});
