const request = require('supertest');
const { startApplication } = require('../../server/bootstrap');
const {
  createRootOrg,
  createChildOrg,
  seedMember,
} = require('../utils/participation-graph-fixtures');

let server;
let adminToken;
let parentMemberToken;
let parentMemberId;
let outsiderToken;

beforeAll(async () => {
  server = await startApplication({ port: 3019, returnServer: true });
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const adminLogin = await request(server)
    .post('/api/auth/login')
    .send({ email: 'admin@colabora.local', password: 'AdminSecurePass123!' });
  adminToken = adminLogin.body.token;

  const aliceLogin = await request(server)
    .post('/api/auth/login')
    .send({ email: 'alice@example.com', password: 'SecurePass123!' });
  parentMemberToken = aliceLogin.body.token;
  parentMemberId = aliceLogin.body.user.id;

  const dianaLogin = await request(server)
    .post('/api/auth/login')
    .send({ email: 'diana@example.com', password: 'SecurePass123!' });
  outsiderToken = dianaLogin.body.token;
});

afterAll(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

describe('Participation graph tree API', () => {
  let rootOrg;
  let childOrg;
  let grandchildOrg;
  const repIds = [];

  beforeAll(async () => {
    const bobLogin = await request(server)
      .post('/api/auth/login')
      .send({ email: 'bob@example.com', password: 'SecurePass123!' });
    repIds.push(parentMemberId, bobLogin.body.user.id);

    rootOrg = await createRootOrg(server, adminToken, {
      name: `PG Root ${Date.now()}`,
      representatives: repIds,
    });
    childOrg = await createChildOrg(server, adminToken, rootOrg.id, {
      name: `PG Child ${Date.now()}`,
      representatives: [repIds[1]],
    });
    grandchildOrg = await createChildOrg(server, adminToken, childOrg.id, {
      name: `PG Grandchild ${Date.now()}`,
      representatives: [repIds[1]],
    });

    await seedMember(server, rootOrg.id, parentMemberId);
  });

  test('PG1-ancestors-chain returns root then parent', async () => {
    const response = await request(server)
      .get(`/api/organizations/${grandchildOrg.id}/ancestors`)
      .set('Authorization', `Bearer ${parentMemberToken}`)
      .expect(403);

    await seedMember(server, grandchildOrg.id, parentMemberId);

    const authed = await request(server)
      .get(`/api/organizations/${grandchildOrg.id}/ancestors`)
      .set('Authorization', `Bearer ${parentMemberToken}`)
      .expect(200);

    expect(authed.body.ancestors).toHaveLength(2);
    expect(authed.body.ancestors[0].id).toBe(rootOrg.id);
    expect(authed.body.ancestors[1].id).toBe(childOrg.id);
  });

  test('PG1-children-list returns direct children only', async () => {
    const response = await request(server)
      .get(`/api/organizations/${rootOrg.id}/children`)
      .set('Authorization', `Bearer ${parentMemberToken}`)
      .expect(200);

    const childIds = response.body.children.map((c) => c.id);
    expect(childIds).toContain(childOrg.id);
    expect(childIds).not.toContain(grandchildOrg.id);
  });

  test('SEC-IDOR-parent-not-child-member cannot access child org details', async () => {
    await request(server)
      .get(`/api/organizations/${childOrg.id}`)
      .set('Authorization', `Bearer ${parentMemberToken}`)
      .expect(403);
  });

  test('SEC-cycle-reparent-rejected', async () => {
    await request(server)
      .patch(`/api/admin/organizations/${rootOrg.id}/parent`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ primaryParentId: grandchildOrg.id })
      .expect(400);
  });

  test('outsider cannot read ancestors of org they do not belong to', async () => {
    await request(server)
      .get(`/api/organizations/${rootOrg.id}/ancestors`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(403);
  });
});
