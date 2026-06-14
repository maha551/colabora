const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { authenticateUser, safeDeleteTestDatabase } = require('../utils/test-helpers');

let server;
let authToken;
let testUserId;
let testDbPath;

describe('Notifications API Integration Tests', () => {
  beforeAll(async () => {
    testDbPath = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';

    await safeDeleteTestDatabase(testDbPath);

    const startTestServer = require('../../server/bootstrap').startApplication;
    server = await startTestServer({ port: 3016, returnServer: true });

    await new Promise(resolve => setTimeout(resolve, 3000));

    authToken = await authenticateUser(server, 'alice@example.com', 'SecurePass123!');
    
    const loginResponse = await request(server)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'SecurePass123!' });
    testUserId = loginResponse.body.user.id;
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

  describe('GET /api/notifications/preferences', () => {
    test('should retrieve notification preferences', async () => {
      const response = await request(server)
        .get('/api/notifications/preferences')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('preferences');
      expect(response.body.preferences).toHaveProperty('emailEnabled');
      expect(response.body.preferences).toHaveProperty('channelPreferences');
    });

    test('should reject request without authentication', async () => {
      const response = await request(server)
        .get('/api/notifications/preferences')
        .expect(401);
    });
  });

  describe('PUT /api/notifications/preferences', () => {
    test('should update notification preferences', async () => {
      const updateData = {
        emailEnabled: true,
        immediateNotificationsEnabled: true,
        digestFrequency: 'weekly'
      };

      const response = await request(server)
        .put('/api/notifications/preferences')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.preferences).toHaveProperty('emailEnabled', true);
      expect(response.body.preferences).toHaveProperty('digestFrequency', 'weekly');
    });

    test('should round-trip channelPreferences and sync legacy email columns', async () => {
      const channelPreferences = {
        email: { enabled: false, immediate: false, digestFrequency: 'off' },
        push: { enabled: true, immediate: true, digest: true },
        telegram: { enabled: true, immediate: false, digest: true },
      };

      const updateResponse = await request(server)
        .put('/api/notifications/preferences')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ channelPreferences })
        .expect(200);

      expect(updateResponse.body.success).toBe(true);
      expect(updateResponse.body.preferences.channelPreferences).toMatchObject(channelPreferences);
      expect(updateResponse.body.preferences.emailEnabled).toBe(false);
      expect(updateResponse.body.preferences.immediateNotificationsEnabled).toBe(false);
      expect(updateResponse.body.preferences.digestFrequency).toBe('off');

      const getResponse = await request(server)
        .get('/api/notifications/preferences')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(getResponse.body.preferences.channelPreferences).toMatchObject(channelPreferences);
      expect(getResponse.body.preferences.emailEnabled).toBe(false);
      expect(getResponse.body.preferences.digestFrequency).toBe('off');
    });

    test('should reject invalid digest frequency', async () => {
      const response = await request(server)
        .put('/api/notifications/preferences')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ digestFrequency: 'invalid' })
        .expect(400);

      expect(response.body.error).toContain('Invalid digest frequency');
    });

    test('should allow partial updates', async () => {
      const response = await request(server)
        .put('/api/notifications/preferences')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ emailEnabled: false })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should reject request without authentication', async () => {
      const response = await request(server)
        .put('/api/notifications/preferences')
        .send({ emailEnabled: true })
        .expect(401);
    });
  });

  describe('POST /api/notifications/push/subscribe', () => {
    test('should register a push subscription for the authenticated user', async () => {
      const subscription = {
        endpoint: `https://push.example.com/sub/${Date.now()}`,
        keys: {
          p256dh: 'dGVzdC1wMjU2ZGg=',
          auth: 'dGVzdC1hdXRo',
        },
      };

      const response = await request(server)
        .post('/api/notifications/push/subscribe')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ subscription })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.endpointId).toBeDefined();
    });

    test('should reject invalid push subscription payload', async () => {
      const response = await request(server)
        .post('/api/notifications/push/subscribe')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ subscription: { endpoint: 'https://push.example.com/sub/incomplete' } })
        .expect(400);

      expect(response.body.error).toBe('Invalid subscription');
    });

    test('should reject push subscribe without authentication', async () => {
      await request(server)
        .post('/api/notifications/push/subscribe')
        .send({ subscription: {} })
        .expect(401);
    });
  });

  describe('GET /api/notifications/push/status', () => {
    test('should report push subscription status', async () => {
      const response = await request(server)
        .get('/api/notifications/push/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('subscribed');
      expect(typeof response.body.subscribed).toBe('boolean');
    });
  });

  describe('GET /api/notifications', () => {
    test('should retrieve in-app notifications', async () => {
      const response = await request(server)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('notifications');
      expect(Array.isArray(response.body.notifications)).toBe(true);
    });

    test('should support pagination', async () => {
      const response = await request(server)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ limit: 10, offset: 0 })
        .expect(200);

      expect(response.body.notifications.length).toBeLessThanOrEqual(10);
    });

    test('should reject request without authentication', async () => {
      const response = await request(server)
        .get('/api/notifications')
        .expect(401);
    });
  });
});

