const request = require('supertest');
const { authenticateUser, safeDeleteTestDatabase } = require('../utils/test-helpers');

let server;
let adminToken;
let testUserId;
let testDbPath;

describe('Admin Organization Delete Integration Tests', () => {
  beforeAll(async () => {
    testDbPath = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';

    await safeDeleteTestDatabase(testDbPath);

    const startTestServer = require('../../server/bootstrap').startApplication;
    server = await startTestServer({ port: 3021, returnServer: true });
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

  test('should reject hard delete on active organization', async () => {
    const orgRes = await request(server)
      .post('/api/admin/organizations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Delete Guard Org', representatives: [testUserId] })
      .expect(201);

    const orgId = orgRes.body.organization.id;

    await request(server)
      .delete(`/api/admin/organizations/${orgId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ confirmName: 'Delete Guard Org' })
      .expect(400);
  });

  test('should hard delete inactive organization with confirmation', async () => {
    const orgRes = await request(server)
      .post('/api/admin/organizations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Hard Delete Org', representatives: [testUserId] })
      .expect(201);

    const orgId = orgRes.body.organization.id;
    const orgName = orgRes.body.organization.name;

    await request(server)
      .patch(`/api/admin/organizations/${orgId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(200);

    await request(server)
      .delete(`/api/admin/organizations/${orgId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ confirmName: orgName, force: true })
      .expect(200);

    await request(server)
      .get(`/api/admin/organizations/${orgId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });
});
