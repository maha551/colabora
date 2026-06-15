const request = require('supertest');
const { startApplication } = require('../../server/bootstrap');
const { createRootOrg, createChildOrg, seedMember } = require('../utils/participation-graph-fixtures');

let server;
let adminToken;
let memberToken;
let memberId;

beforeAll(async () => {
  server = await startApplication({ port: 3020, returnServer: true });
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const adminLogin = await request(server)
    .post('/api/auth/login')
    .send({ email: 'admin@colabora.local', password: 'AdminSecurePass123!' });
  adminToken = adminLogin.body.token;

  const aliceLogin = await request(server)
    .post('/api/auth/login')
    .send({ email: 'alice@example.com', password: 'SecurePass123!' });
  memberToken = aliceLogin.body.token;
  memberId = aliceLogin.body.user.id;
});

afterAll(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

describe('Participation graph security', () => {
  test('parent member cannot list child documents without child membership', async () => {
    const bobLogin = await request(server)
      .post('/api/auth/login')
      .send({ email: 'bob@example.com', password: 'SecurePass123!' });

    const root = await createRootOrg(server, adminToken, {
      name: `PG Sec Root ${Date.now()}`,
      representatives: [memberId, bobLogin.body.user.id],
    });
    const child = await createChildOrg(server, adminToken, root.id, {
      name: `PG Sec Child ${Date.now()}`,
      representatives: [bobLogin.body.user.id],
    });

    await seedMember(server, root.id, memberId);

    await request(server)
      .get(`/api/documents/organization/${child.id}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(403);
  });
});
