const request = require('supertest');
const { startApplication } = require('../../server/bootstrap');
const { getServerDb } = require('../utils/test-helpers');
const { createRootOrg, seedMember } = require('../utils/participation-graph-fixtures');

let server;
let adminToken;
let repToken;
let repId;

beforeAll(async () => {
  server = await startApplication({ port: 3026, returnServer: true });
  await new Promise((r) => setTimeout(r, 3000));
  adminToken = (await request(server).post('/api/auth/login').send({ email: 'admin@colabora.local', password: 'AdminSecurePass123!' })).body.token;
  repToken = (await request(server).post('/api/auth/login').send({ email: 'alice@example.com', password: 'SecurePass123!' })).body.token;
  repId = (await request(server).post('/api/auth/login').send({ email: 'alice@example.com', password: 'SecurePass123!' })).body.user.id;
});

afterAll(async () => {
  if (server) await new Promise((r) => server.close(r));
});

describe('Participation graph matrix', () => {
  test('PG7 creates matrix link between orgs', async () => {
    const project = await createRootOrg(server, adminToken, { name: 'PG7 Project ' + Date.now(), representatives: [repId] });
    const unit = await createRootOrg(server, adminToken, { name: 'PG7 Unit ' + Date.now(), representatives: [repId] });
    await seedMember(server, project.id, repId);
    const db = getServerDb(server);
    await db('organization_governance_rules').where({ organization_id: project.id }).update({ matrix_links_enabled: true });

    const link = await request(server)
      .post(`/api/organizations/${project.id}/matrix-links`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ linkedOrgId: unit.id, authority: 'weak' })
      .expect(201);

    expect(link.body.edgeId).toBeTruthy();
  });
});
