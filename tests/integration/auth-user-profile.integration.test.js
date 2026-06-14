const request = require('supertest');
const { safeDeleteTestDatabase, createTestUser, addActiveOrganizationMemberForTests } = require('../utils/test-helpers');

let server;
let testDbPath;
let aliceToken;
let bobToken;
let aliceId;
let bobId;
let adminToken;
let organizationId;

async function login(email, password) {
  const response = await request(server).post('/api/auth/login').send({ email, password }).expect(200);
  return { token: response.body.token, user: response.body.user };
}

describe('GET /api/auth/users/:userId profile access', () => {
  beforeAll(async () => {
    testDbPath = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';
    await safeDeleteTestDatabase(testDbPath);

    const startTestServer = require('../../server/bootstrap').startApplication;
    server = await startTestServer({ port: 3035, returnServer: true });
    await new Promise(resolve => setTimeout(resolve, 3000));

    const admin = await login('admin@colabora.local', 'AdminSecurePass123!');
    const alice = await login('alice@example.com', 'SecurePass123!');
    const bob = await login('bob@example.com', 'SecurePass123!');
    adminToken = admin.token;
    aliceToken = alice.token;
    bobToken = bob.token;
    aliceId = alice.user.id;
    bobId = bob.user.id;

    const orgResponse = await request(server)
      .post('/api/admin/organizations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Profile Access Org ${Date.now()}`,
        description: 'Shared org profile test',
        representatives: [aliceId],
        membershipPolicy: 'invitation'
      })
      .expect(201);
    organizationId = orgResponse.body.organization.id;

    await addActiveOrganizationMemberForTests(server, organizationId, aliceToken, {
      id: bobId,
      email: 'bob@example.com',
      password: 'SecurePass123!',
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await safeDeleteTestDatabase(testDbPath);
  });

  test('returns full profile for self', async () => {
    const response = await request(server)
      .get(`/api/auth/users/${aliceId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);

    expect(response.body.user.email).toBe('alice@example.com');
    expect(response.body.user.preferences).toBeDefined();
    expect(response.body.user.profileData).toBeDefined();
  });

  test('returns 403 when users do not share an organization', async () => {
    const outsiderEmail = `outsider-${Date.now()}@test.com`;
    await createTestUser(server.app.locals.db, {
      name: 'Outsider User',
      email: outsiderEmail,
      password: 'TestPass123!',
    });
    const outsiderLogin = await login(outsiderEmail, 'TestPass123!');
    const response = await request(server)
      .get(`/api/auth/users/${aliceId}`)
      .set('Authorization', `Bearer ${outsiderLogin.token}`)
      .expect(403);

    expect(response.body.code).toBe('MEMBERSHIP_REQUIRED');
  });

  test('returns public subset without email for co-org members', async () => {
    const response = await request(server)
      .get(`/api/auth/users/${aliceId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(200);

    expect(response.body.user.name).toBeTruthy();
    expect(response.body.user.email).toBeUndefined();
    expect(response.body.user.preferences).toBeUndefined();
    expect(response.body.user.defaultHomeView).toBeUndefined();
    expect(response.body.user.role).toBeUndefined();
    expect(Array.isArray(response.body.memberships)).toBe(true);
    expect(response.body.memberships.length).toBeGreaterThan(0);
  });

  test('returns contextOrganization when organizationId query param matches', async () => {
    const response = await request(server)
      .get(`/api/auth/users/${aliceId}?organizationId=${organizationId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(200);

    expect(response.body.contextOrganization).toBeDefined();
    expect(response.body.contextOrganization.organizationId).toBe(organizationId);
    expect(response.body.contextOrganization.isRepresentative).toBe(true);
  });

  test('includes location only when show_on_map is true', async () => {
    await request(server)
      .put(`/api/organizations/${organizationId}/my-location`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        city: 'Berlin',
        region: 'Berlin',
        countryCode: 'de',
        latitude: 52.52,
        longitude: 13.405,
        showOnMap: true,
      })
      .expect(200);

    const response = await request(server)
      .get(`/api/auth/users/${aliceId}?organizationId=${organizationId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(200);

    expect(response.body.contextOrganization.location).toMatchObject({
      city: 'Berlin',
      countryCode: 'de',
    });
  });
});
