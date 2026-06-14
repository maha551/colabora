const request = require('supertest');
const { safeDeleteTestDatabase, withLegalConsent, addActiveOrganizationMemberForTests } = require('../utils/test-helpers');

let server;
let testDbPath;
let aliceToken;
let bobToken;
let aliceId;
let bobId;
let aliceEmail;
let adminToken;
let organizationId;

async function login(email, password) {
  const response = await request(server).post('/api/auth/login').send({ email, password }).expect(200);
  return { token: response.body.token, user: response.body.user };
}

describe('User profile_data visibility and validation', () => {
  beforeAll(async () => {
    testDbPath = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';
    await safeDeleteTestDatabase(testDbPath);

    const startTestServer = require('../../server/bootstrap').startApplication;
    server = await startTestServer({ port: 3036, returnServer: true });
    await new Promise(resolve => setTimeout(resolve, 3000));

    const admin = await login('admin@colabora.local', 'AdminSecurePass123!');
    adminToken = admin.token;

    const suffix = Date.now();
    aliceEmail = `profile-alice-${suffix}@example.com`;
    const bobEmail = `profile-bob-${suffix}@example.com`;
    const password = 'SecurePass123!';

    const aliceReg = await request(server)
      .post('/api/auth/register')
      .send(withLegalConsent({ name: 'Profile Alice', email: aliceEmail, password }))
      .expect(201);
    const bobReg = await request(server)
      .post('/api/auth/register')
      .send(withLegalConsent({ name: 'Profile Bob', email: bobEmail, password }))
      .expect(201);

    aliceToken = aliceReg.body.token;
    bobToken = bobReg.body.token;
    aliceId = aliceReg.body.user.id;
    bobId = bobReg.body.user.id;

    const orgResponse = await request(server)
      .post('/api/admin/organizations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Profile Data Org ${Date.now()}`,
        description: 'Profile data visibility test',
        representatives: [aliceId],
        membershipPolicy: 'invitation'
      })
      .expect(201);
    organizationId = orgResponse.body.organization.id;

    await addActiveOrganizationMemberForTests(server, organizationId, aliceToken, {
      id: bobId,
      email: bobEmail,
      password,
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await safeDeleteTestDatabase(testDbPath);
  });

  test('saves and retrieves headline, links, and contact for self', async () => {
    const putResponse = await request(server)
      .put('/api/auth/profile')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        profileData: {
          headline: 'Governance lead',
          links: [{ type: 'website', url: 'https://example.com', visibility: 'org_members' }],
          contact: {
            phone: '+1 555-0100',
            phoneVisibility: 'org_members',
            emailVisibility: 'hidden',
            preferredMethod: 'email',
          },
        },
      })
      .expect(200);

    expect(putResponse.body.user.profileData.headline).toBe('Governance lead');
    expect(putResponse.body.user.profileData.links).toHaveLength(1);

    const getResponse = await request(server)
      .get(`/api/auth/users/${aliceId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);

    expect(getResponse.body.user.profileData.headline).toBe('Governance lead');
  });

  test('co-org member sees org_members visibility fields', async () => {
    const response = await request(server)
      .get(`/api/auth/users/${aliceId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(200);

    expect(response.body.user.profileData.headline).toBe('Governance lead');
    expect(response.body.user.profileData.links).toHaveLength(1);
    expect(response.body.user.profileData.contact.phone).toBe('+1 555-0100');
  });

  test('co-org member does not see representatives-only or hidden fields', async () => {
    await request(server)
      .put('/api/auth/profile')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        profileData: {
          links: [
            { type: 'github', url: 'https://github.com/alice', visibility: 'representatives' },
            { type: 'website', url: 'https://hidden.example.com', visibility: 'hidden' },
          ],
        },
      })
      .expect(200);

    const response = await request(server)
      .get(`/api/auth/users/${aliceId}?organizationId=${organizationId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(200);

    const urls = (response.body.user.profileData.links || []).map((l) => l.url);
    expect(urls).not.toContain('https://github.com/alice');
    expect(urls).not.toContain('https://hidden.example.com');
  });

  test('rejects invalid profile link URL', async () => {
    const response = await request(server)
      .put('/api/auth/profile')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        profileData: {
          links: [{ type: 'website', url: 'javascript:alert(1)', visibility: 'org_members' }],
        },
      })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  test('rejects more than 5 links', async () => {
    const links = Array.from({ length: 6 }, (_, i) => ({
      type: 'website',
      url: `https://example${i}.com`,
      visibility: 'org_members',
    }));

    const response = await request(server)
      .put('/api/auth/profile')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ profileData: { links } })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  test('does not expose email unless emailVisibility allows', async () => {
    await request(server)
      .put('/api/auth/profile')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        profileData: {
          contact: {
            emailVisibility: 'hidden',
            phoneVisibility: 'hidden',
            preferredMethod: 'email',
          },
        },
      })
      .expect(200);

    const hidden = await request(server)
      .get(`/api/auth/users/${aliceId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(200);

    expect(hidden.body.user.email).toBeUndefined();
    expect(hidden.body.user.profileData?.contact?.email).toBeUndefined();

    await request(server)
      .put('/api/auth/profile')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        profileData: {
          contact: {
            emailVisibility: 'org_members',
            phoneVisibility: 'hidden',
            preferredMethod: 'email',
          },
        },
      })
      .expect(200);

    const visible = await request(server)
      .get(`/api/auth/users/${aliceId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(200);

    expect(visible.body.user.profileData.contact.email).toBe(aliceEmail);
  });

  test('tags are saved, filtered, and validated', async () => {
    await request(server)
      .put('/api/auth/profile')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        profileData: {
          tags: {
            interests: ['Governance', 'governance', 'facilitation'],
            skills: ['mediation'],
            visibility: 'org_members',
          },
        },
      })
      .expect(200);

    const self = await request(server)
      .get(`/api/auth/users/${aliceId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);

    expect(self.body.user.profileData.tags.interests).toEqual(['governance', 'facilitation']);

    const member = await request(server)
      .get(`/api/auth/users/${aliceId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(200);

    expect(member.body.user.profileData.tags.skills).toContain('mediation');

    const hiddenTags = await request(server)
      .put('/api/auth/profile')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        profileData: {
          tags: {
            interests: ['secret'],
            skills: [],
            visibility: 'hidden',
          },
        },
      })
      .expect(200);

    expect(hiddenTags.body.user.profileData.tags.visibility).toBe('hidden');

    const bobView = await request(server)
      .get(`/api/auth/users/${aliceId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(200);

    expect(bobView.body.user.profileData.tags).toBeUndefined();
  });

  test('timezone shown to co-org member by default and hidden when set', async () => {
    await request(server)
      .put('/api/auth/profile')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        preferences: {
          timezone: 'Europe/Berlin',
          timezoneVisibility: 'org_members',
        },
      })
      .expect(200);

    const visible = await request(server)
      .get(`/api/auth/users/${aliceId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(200);

    expect(visible.body.user.timezone).toBe('Europe/Berlin');

    await request(server)
      .put('/api/auth/profile')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        preferences: { timezoneVisibility: 'hidden' },
      })
      .expect(200);

    const hidden = await request(server)
      .get(`/api/auth/users/${aliceId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(200);

    expect(hidden.body.user.timezone).toBeUndefined();
  });
});
