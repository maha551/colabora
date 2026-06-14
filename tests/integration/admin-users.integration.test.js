const request = require('supertest');
const { authenticateUser, createTestUser, safeDeleteTestDatabase } = require('../utils/test-helpers');

let server;
let adminToken;
let testUserId;
let testDbPath;

describe('Admin Users Integration Tests', () => {
  beforeAll(async () => {
    testDbPath = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';

    await safeDeleteTestDatabase(testDbPath);

    const startTestServer = require('../../server/bootstrap').startApplication;
    server = await startTestServer({ port: 3020, returnServer: true });
    await new Promise((resolve) => setTimeout(resolve, 3000));

    adminToken = await authenticateUser(server, 'admin@colabora.local', 'AdminSecurePass123!');

    const loginResponse = await request(server)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'SecurePass123!' });
    testUserId = loginResponse.body.user.id;
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => {
        server.close(() => resolve());
      });
    }
    await safeDeleteTestDatabase(testDbPath);
  });

  test('should suspend and block login for user', async () => {
    const db = server.app.locals.db;
    const suspended = await createTestUser(db, {
      name: 'Suspend Me',
      email: 'suspend@test.com',
      password: 'TestPass123!',
      role: 'user',
    });

    await request(server)
      .patch(`/api/admin/users/${suspended.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false, reason: 'Test suspension' })
      .expect(200);

    const loginRes = await request(server)
      .post('/api/auth/login')
      .send({ email: 'suspend@test.com', password: 'TestPass123!' })
      .expect(403);

    expect(loginRes.body.error || loginRes.body.message).toMatch(/suspend/i);

    await request(server)
      .patch(`/api/admin/users/${suspended.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: true })
      .expect(200);

    await request(server)
      .post('/api/auth/login')
      .send({ email: 'suspend@test.com', password: 'TestPass123!' })
      .expect(200);
  });

  test('should demote admin when multiple admins exist', async () => {
    const db = server.app.locals.db;
    const extraAdmin = await createTestUser(db, {
      name: 'Extra Admin',
      email: 'extraadmin@test.com',
      password: 'TestPass123!',
      role: 'user',
    });

    await request(server)
      .post(`/api/admin/promote-admin/${extraAdmin.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(server)
      .post(`/api/admin/demote-admin/${extraAdmin.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const userRes = await request(server)
      .get(`/api/admin/users/${extraAdmin.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(userRes.body.user.role).toBe('user');
  });

  test('should reject demoting last admin', async () => {
    const db = server.app.locals.db;
    const admins = await db('users').where('role', 'admin');
    if (admins.length !== 1) return;

    await request(server)
      .post(`/api/admin/demote-admin/${admins[0].id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });
});
