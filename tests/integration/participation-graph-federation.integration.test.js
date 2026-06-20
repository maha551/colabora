const request = require('supertest');
const { startApplication } = require('../../server/bootstrap');
const { withLegalConsent } = require('../utils/test-helpers');
const {
  createFederationApex,
  seedMember,
} = require('../utils/participation-graph-fixtures');

let server;
let adminToken;
let delegateToken;
let delegateId;
let otherRepToken;
let otherRepId;
let chapterOnlyToken;
let chapterOnlyUserId;

beforeAll(async () => {
  server = await startApplication({ port: 3023, returnServer: true });
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const adminLogin = await request(server)
    .post('/api/auth/login')
    .send({ email: 'admin@colabora.local', password: 'AdminSecurePass123!' });
  adminToken = adminLogin.body.token;

  const aliceLogin = await request(server)
    .post('/api/auth/login')
    .send({ email: 'alice@example.com', password: 'SecurePass123!' });
  delegateToken = aliceLogin.body.token;
  delegateId = aliceLogin.body.user.id;

  const bobLogin = await request(server)
    .post('/api/auth/login')
    .send({ email: 'bob@example.com', password: 'SecurePass123!' });
  otherRepToken = bobLogin.body.token;
  otherRepId = bobLogin.body.user.id;

  const reg = await request(server)
    .post('/api/auth/register')
    .send(withLegalConsent({
      name: 'Chapter Only User',
      email: `pg4.chapter.only.${Date.now()}@test.com`,
      password: 'ChapterOnly123!',
    }))
    .expect(201);
  chapterOnlyToken = reg.body.token;
  chapterOnlyUserId = reg.body.user.id;
});

afterAll(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

describe('Participation graph federation', () => {
  test('PG4 chapter member without rep_link cannot cast apex vote', async () => {
    const apex = await createFederationApex(server, adminToken, {
      name: 'PG4 Apex ' + Date.now(),
      representatives: [delegateId, otherRepId],
    });
    await seedMember(server, apex.id, delegateId);

    const chapterName = 'PG4 Chapter ' + Date.now();
    const chapter = await request(server)
      .post(`/api/organizations/${apex.id}/subgroups`)
      .set('Authorization', `Bearer ${delegateToken}`)
      .send({ name: chapterName, profile: 'federation_chapter', visibility: 'open' })
      .expect(201);

    const chapterId = chapter.body.organization.id;
    await seedMember(server, chapterId, chapterOnlyUserId);

    const voteRes = await request(server)
      .post(`/api/organizations/${apex.id}/votes`)
      .set('Authorization', `Bearer ${delegateToken}`)
      .send({ title: 'Apex policy vote', voteType: 'policy' });

    expect(voteRes.status).toBeGreaterThanOrEqual(200);
    expect(voteRes.status).toBeLessThan(300);
    const voteId = voteRes.body.vote.id;

    await request(server)
      .post(`/api/organizations/${apex.id}/votes/${voteId}/approve`)
      .set('Authorization', `Bearer ${otherRepToken}`)
      .expect(200);

    await request(server)
      .post(`/api/organizations/${apex.id}/votes/${voteId}/vote`)
      .set('Authorization', `Bearer ${chapterOnlyToken}`)
      .send({ choice: 'yes' })
      .expect(403);

    await request(server)
      .post(`/api/organizations/${apex.id}/votes/${voteId}/vote`)
      .set('Authorization', `Bearer ${delegateToken}`)
      .send({ choice: 'yes' })
      .expect(200);
  });

  test('PG4 lists rep_link participations at apex', async () => {
    const apex = await createFederationApex(server, adminToken, {
      name: 'PG4 List Apex ' + Date.now(),
      representatives: [delegateId],
    });
    await seedMember(server, apex.id, delegateId);

    await request(server)
      .post(`/api/organizations/${apex.id}/subgroups`)
      .set('Authorization', `Bearer ${delegateToken}`)
      .send({ name: 'List Chapter ' + Date.now(), profile: 'federation_chapter' })
      .expect(201);

    const list = await request(server)
      .get(`/api/organizations/${apex.id}/participations?kind=rep_link`)
      .set('Authorization', `Bearer ${delegateToken}`)
      .expect(200);

    expect(list.body.participations.length).toBeGreaterThan(0);
    expect(list.body.participations[0].participationKind).toBe('rep_link');
  });
});
